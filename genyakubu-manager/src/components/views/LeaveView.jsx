import { useEffect, useMemo, useRef, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { MonthNav } from "../MonthNav";
import { S, colors } from "../../styles/common";
import { WEEKDAYS } from "../../constants/schools";
import { fmtMDWeekday, parseLocalDate } from "../../utils/dateHelpers";
import { isFullDayHoliday } from "../../utils/scheduleHelpers";
import { sortTeacherNames } from "../../utils/teacherKana";
import {
  categoryMeta,
  fiscalYearOf,
  fiscalYearRange,
  fmtFiscalYear,
  indexAffiliationChanges,
  resolveAffiliation,
} from "../../utils/teacherAffiliations";
import {
  EMPTY_STAFF_LEAVE,
  FISCAL_MONTHS,
  LEAVE_KINDS,
  countLeave,
  fmtLeaveDays,
  grantFor,
  indexLeaveRecords,
  leaveKey,
  leaveKindMeta,
  recordsInRange,
  setGrant,
  summarizeYear,
} from "../../utils/staffLeave";
import { leaveClassCheck, leaveClassSeverity } from "../../utils/leaveClassCheck";
import { LeaveEditor } from "../LeaveEditor";
import {
  LEAVE_SEVERITY_TONE as SEVERITY_TONE,
  leaveKindChip as kindChip,
} from "../../styles/leave";

// ─── 有給・半休 ─────────────────────────────────────────────────────
// 「講師の所属」で現役部 常勤にした人の有給・半休を記録して見る画面
// (utils/staffLeave)。管理者だけが読める adminData/ に置く。
//
//   - 月の表: 行 = 人、列 = 日。マスを押すと下の欄でその日の休暇を入れる
//     (種類のボタンを押せば保存。期間にチェックを入れると何日もまとめて)
//   - その日に担当のコマがあって代行・欠勤の登録が無ければ「!」を出し、
//     複数日の欠勤登録を開けるようにする (休暇の記録は代行レコードを作らない)
//   - 年度のまとめ: 月ごとの有給の日数・合計・持ち日数 (任意)・残り
//
// 入れ直し・消すは 6 秒の「元に戻す」(cascade の無い操作。CLAUDE.md の削除 UX)。
// 印刷はトップバーの 🖨 (popup)。紙面は表と年度のまとめで、入力欄は no-print。

const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (dateStr) => dateStr.slice(0, 7);

function monthDates(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${pad2(i + 1)}`);
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function LeaveView({
  staffLeave,
  onSave,
  enabled = true,
  affiliations = [],
  partTimeStaff = [],
  teacherKana = {},
  // 授業がある日を数えるための本体のデータ
  slots = [],
  subs = [],
  adjustments = [],
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  timetables = [],
  displayCutoff = null,
  classSets = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  daySchedules = [],
  // 複数日の欠勤登録を開く ({ teachers, date, toDate })
  onRegisterAbsence,
  onOpenAffiliation,
  onSelectTeacher,
}) {
  const today = useToday();
  const toasts = useToasts();
  const [ym, setYm] = useState(() => ymOf(today));
  const [cell, setCell] = useState(null); // { name, date }
  const editorRef = useRef(null);

  const leave = staffLeave || EMPTY_STAFF_LEAVE;
  const latestRef = useRef(leave);
  latestRef.current = leave;

  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    specialEvents,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });

  useDateKeyNav({
    onPrev: () => setYm((v) => shiftMonth(v, -1)),
    onNext: () => setYm((v) => shiftMonth(v, 1)),
    onToday: () => setYm(ymOf(today)),
    enabled,
  });

  const year = fiscalYearOf(`${ym}-01`);
  const dates = useMemo(() => monthDates(ym), [ym]);
  const partTimeNames = useMemo(
    () => new Set((partTimeStaff || []).map((s) => s?.name).filter(Boolean)),
    [partTimeStaff]
  );
  const affIndex = useMemo(() => indexAffiliationChanges(affiliations), [affiliations]);
  const tracksLeave = (name, y) =>
    categoryMeta(resolveAffiliation(affIndex, name, y, partTimeNames).category).tracksLeave;

  // 月の表の人: その年度の現役部 常勤 + この月に記録のある人
  const monthRecords = useMemo(
    () => recordsInRange(leave.records, dates[0], dates[dates.length - 1]),
    [leave.records, dates]
  );
  const rows = useMemo(() => {
    const set = new Set();
    for (const n of affIndex.keys()) if (tracksLeave(n, year)) set.add(n);
    for (const r of monthRecords) set.add(r.name);
    return sortTeacherNames([...set], teacherKana);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tracksLeave は affIndex / partTimeNames から作る
  }, [affIndex, partTimeNames, year, monthRecords, teacherKana]);

  // 年度のまとめの人: その年度の現役部 常勤 + その年度に記録のある人
  const { start: yStart, end: yEnd } = fiscalYearRange(year);
  const yearRows = useMemo(() => {
    const set = new Set();
    for (const n of affIndex.keys()) if (tracksLeave(n, year)) set.add(n);
    for (const r of recordsInRange(leave.records, yStart, yEnd)) set.add(r.name);
    return sortTeacherNames([...set], teacherKana);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tracksLeave は affIndex / partTimeNames から作る
  }, [affIndex, partTimeNames, year, leave.records, yStart, yEnd, teacherKana]);
  const summary = useMemo(() => summarizeYear(leave, yearRows, year), [leave, yearRows, year]);
  const summaryByName = useMemo(() => new Map(summary.map((s) => [s.name, s])), [summary]);

  const recIndex = useMemo(() => indexLeaveRecords(leave.records), [leave.records]);
  const fullHolidayByDate = useMemo(() => {
    const m = new Map();
    for (const h of holidays || []) if (isFullDayHoliday(h)) m.set(h.date, h.label || "休講");
    return m;
  }, [holidays]);

  // この月の記録ごとに、その日の授業と登録の有無
  const checkByKey = useMemo(() => {
    const m = new Map();
    for (const r of monthRecords) {
      m.set(
        leaveKey(r.name, r.date),
        leaveClassCheck({ name: r.name, date: r.date, slots, subs, adjustments, ctx: sessionCtx })
      );
    }
    return m;
  }, [monthRecords, slots, subs, adjustments, sessionCtx]);

  // 選んだマス (月を変えたら外す)
  useEffect(() => {
    if (cell && ymOf(cell.date) !== ym) setCell(null);
  }, [ym, cell]);
  const cellRecord = cell ? recIndex.get(leaveKey(cell.name, cell.date)) : null;
  const cellCheck = useMemo(() => {
    if (!cell) return null;
    return (
      checkByKey.get(leaveKey(cell.name, cell.date)) ||
      leaveClassCheck({
        name: cell.name,
        date: cell.date,
        slots,
        subs,
        adjustments,
        ctx: sessionCtx,
      })
    );
  }, [cell, checkByKey, slots, subs, adjustments, sessionCtx]);

  if (!enabled) {
    return (
      <div style={{ ...S.panel, padding: 16, fontSize: 14 }}>
        有給・半休は管理者だけが見られます。サイドバー下の「管理者ログイン」からログインしてください。
      </div>
    );
  }

  const selectCell = (name, date) => {
    setCell({ name, date });
    // 狭い画面では表の下の欄が見えないので寄せる
    setTimeout(() => {
      const el = editorRef.current;
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 0);
  };

  const saveGrant = (name, value) => {
    const v = String(value).trim();
    const cur = grantFor(latestRef.current, name, year);
    if (v === "" && cur == null) return;
    if (v !== "" && Number(v) === cur) return;
    if (v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      toasts.error("持ち日数は 0 以上の数で入れてください");
      return;
    }
    onSave((prev) => setGrant(prev, name, year, v === "" ? null : Number(v)));
  };

  const ymLabel = `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;
  const [vy, vm] = ym.split("-").map(Number);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        @media print {
          .leave-grid-wrap { overflow: visible !important; }
          .leave-cell-btn { border: none !important; }
        }
      `}</style>

      <div
        className="no-print"
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <MonthNav
          year={vy}
          month={vm}
          onPrev={() => setYm((v) => shiftMonth(v, -1))}
          onNext={() => setYm((v) => shiftMonth(v, 1))}
          onToday={() => setYm(ymOf(today))}
          onPick={(v) => /^\d{4}-\d{2}$/.test(v) && setYm(v)}
          isCurrent={ym === ymOf(today)}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        />
        <span style={{ fontSize: 12, color: colors.inkMuted }}>{fmtFiscalYear(year)}</span>
        {onOpenAffiliation && (
          <button
            type="button"
            onClick={onOpenAffiliation}
            style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12, marginLeft: "auto" }}
          >
            🏷 講師の所属 (誰を載せるか)
          </button>
        )}
      </div>

      <h2 data-print-title={`有給・半休 ${ymLabel}`} style={{ margin: 0, fontSize: 16 }}>
        {ymLabel}の有給・半休
        <span style={{ fontSize: 12, fontWeight: 400, color: colors.inkMuted, marginLeft: 8 }}>
          {fmtFiscalYear(year)}の現役部 常勤 {rows.length} 人
        </span>
      </h2>

      {rows.length === 0 ? (
        <div style={{ ...S.panel, padding: 16, fontSize: 13, lineHeight: 1.7 }}>
          {fmtFiscalYear(year)}の「現役部 常勤」がまだいません。
          {onOpenAffiliation ? (
            <>
              {" "}
              <button
                type="button"
                onClick={onOpenAffiliation}
                style={{ ...S.btn(true), padding: "4px 12px", fontSize: 13 }}
              >
                🏷 講師の所属
              </button>{" "}
              で、有給・半休を記録する人を「現役部 常勤」に入れてください。
            </>
          ) : (
            "講師の所属で、有給・半休を記録する人を「現役部 常勤」に入れてください。"
          )}
        </div>
      ) : (
        <div className="leave-grid-wrap" style={{ ...S.panel, overflowX: "auto", padding: 0 }}>
          <table
            style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}
            aria-label={`${ymLabel}の有給・半休`}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: colors.surfaceAlt,
                    padding: "4px 8px",
                    textAlign: "left",
                    borderBottom: `1px solid ${colors.border}`,
                    minWidth: 64,
                  }}
                >
                  講師
                </th>
                {dates.map((d) => {
                  const dow = parseLocalDate(d).getDay();
                  const hol = fullHolidayByDate.get(d);
                  return (
                    <th
                      key={d}
                      scope="col"
                      title={hol ? `${d} ${hol}` : d}
                      style={{
                        padding: "2px 0",
                        width: 26,
                        minWidth: 26,
                        fontWeight: 700,
                        fontSize: 11,
                        lineHeight: 1.2,
                        borderBottom: `1px solid ${colors.border}`,
                        color: dow === 0 || hol ? "#c44" : dow === 6 ? "#44c" : colors.ink,
                        background:
                          d === today
                            ? "#fff3c4"
                            : dow === 0 || hol
                              ? "#fdf2f2"
                              : colors.surfaceAlt,
                      }}
                    >
                      {Number(d.slice(8))}
                      <br />
                      <span style={{ fontWeight: 400, fontSize: 10 }}>{WEEKDAYS[dow]}</span>
                    </th>
                  );
                })}
                <th scope="col" style={sumHead}>
                  今月
                </th>
                <th scope="col" style={sumHead}>
                  年度計
                </th>
                <th scope="col" style={sumHead}>
                  残り
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((name) => {
                const monthCount = countLeave(monthRecords.filter((r) => r.name === name));
                const ys = summaryByName.get(name);
                const outside = !tracksLeave(name, year);
                return (
                  <tr key={name}>
                    <th
                      scope="row"
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        background: "#fff",
                        padding: "3px 8px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      {onSelectTeacher ? (
                        <button
                          type="button"
                          className="inline-activate"
                          onClick={() => onSelectTeacher(name, { month: ym })}
                          title={`${name} の月間予定を開く`}
                          style={nameBtn}
                        >
                          {name}
                        </button>
                      ) : (
                        name
                      )}
                      {outside && (
                        <span
                          title={`${fmtFiscalYear(year)}の所属が現役部 常勤ではありません (記録があるので出しています)`}
                          style={{ fontSize: 9, color: colors.inkSubtle, marginLeft: 4 }}
                        >
                          区分外
                        </span>
                      )}
                    </th>
                    {dates.map((d) => {
                      const rec = recIndex.get(leaveKey(name, d));
                      const k = rec ? leaveKindMeta(rec.kind) : null;
                      const sev = rec
                        ? leaveClassSeverity(rec.kind, checkByKey.get(leaveKey(name, d)))
                        : null;
                      const dow = parseLocalDate(d).getDay();
                      const hol = fullHolidayByDate.get(d);
                      const isSel = cell && cell.name === name && cell.date === d;
                      const label = `${fmtMDWeekday(d)} ${name}: ${k ? k.label : "記録なし"}${
                        rec?.memo ? ` (${rec.memo})` : ""
                      }${sev === "warn" ? " — 授業に代行・欠勤の登録なし" : ""}`;
                      return (
                        <td
                          key={d}
                          style={{
                            padding: 1,
                            borderBottom: `1px solid ${colors.border}`,
                            background:
                              dow === 0 || hol ? "#fdf6f6" : d === today ? "#fffbe6" : "#fff",
                          }}
                        >
                          <button
                            type="button"
                            className="leave-cell-btn"
                            aria-label={label}
                            aria-pressed={isSel || undefined}
                            title={`${label}${hol ? `\n${hol}` : ""}`}
                            onClick={() => selectCell(name, d)}
                            style={{
                              position: "relative",
                              width: 24,
                              height: 24,
                              padding: 0,
                              border: isSel
                                ? `2px solid ${colors.primary}`
                                : k
                                  ? `1px solid ${k.tone.border}`
                                  : "1px solid transparent",
                              borderRadius: 4,
                              background: k ? k.tone.bg : "transparent",
                              color: k ? k.tone.fg : colors.inkGhost,
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              lineHeight: 1,
                            }}
                          >
                            {k ? k.short : ""}
                            {sev && (
                              <span
                                aria-hidden="true"
                                style={{
                                  position: "absolute",
                                  top: -4,
                                  right: -4,
                                  width: 11,
                                  height: 11,
                                  borderRadius: "50%",
                                  background: SEVERITY_TONE[sev].fg,
                                  color: "#fff",
                                  fontSize: 8,
                                  lineHeight: "11px",
                                  textAlign: "center",
                                }}
                              >
                                !
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td style={sumCell}>
                      {monthCount.paidDays ? fmtLeaveDays(monthCount.paidDays) : ""}
                    </td>
                    <td style={sumCell}>{ys ? fmtLeaveDays(ys.counts.paidDays) : ""}</td>
                    <td
                      style={{
                        ...sumCell,
                        color: ys?.remaining != null && ys.remaining < 0 ? "#c44" : colors.ink,
                      }}
                      title={
                        ys?.grant == null ? "下の年度のまとめで持ち日数を入れると出ます" : undefined
                      }
                    >
                      {ys?.remaining != null ? fmtLeaveDays(ys.remaining) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              padding: "6px 10px",
              fontSize: 11,
              color: colors.inkMuted,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {LEAVE_KINDS.map((k) => (
              <span key={k.key} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span style={kindChip(k, { padding: "0 5px" })}>{k.short}</span>
                {k.label}
              </span>
            ))}
            <span>
              <b style={{ color: SEVERITY_TONE.warn.fg }}>!</b> 授業に代行・欠勤の登録なし
            </span>
            <span className="no-print" style={{ marginLeft: "auto" }}>
              マスを押して入れる (← → で月を移動)
            </span>
          </div>
        </div>
      )}

      {cell && (
        <section
          ref={editorRef}
          className="no-print"
          aria-label={`${fmtMDWeekday(cell.date)} ${cell.name} の休暇`}
          style={{
            ...S.panel,
            padding: "10px 14px",
            borderColor: colors.infoBorder,
            background: colors.infoSoft,
          }}
        >
          <LeaveEditor
            key={`${cell.name}|${cell.date}`}
            name={cell.name}
            date={cell.date}
            record={cellRecord}
            leave={leave}
            onSave={onSave}
            classCheck={cellCheck}
            holidayLabel={fullHolidayByDate.get(cell.date)}
            onRegisterAbsence={onRegisterAbsence}
            onClose={() => setCell(null)}
          />
        </section>
      )}

      {monthRecords.length > 0 && (
        <section style={{ ...S.panel, padding: "10px 14px" }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>
            この月の休暇 ({monthRecords.length} 件)
          </h3>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {monthRecords.map((r) => {
              const k = leaveKindMeta(r.kind);
              const check = checkByKey.get(leaveKey(r.name, r.date));
              const sev = leaveClassSeverity(r.kind, check);
              return (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    fontSize: 13,
                  }}
                >
                  <button
                    type="button"
                    className="inline-activate"
                    onClick={() => selectCell(r.name, r.date)}
                    style={{ ...nameBtn, fontWeight: 700, minWidth: 74, textAlign: "left" }}
                    title="押すと上の欄で直せます"
                  >
                    {fmtMDWeekday(r.date)}
                  </button>
                  <b>{r.name}</b>
                  <span style={kindChip(k)}>{k.label}</span>
                  {r.memo && <span style={{ color: colors.inkMuted }}>{r.memo}</span>}
                  {sev && (
                    <span
                      style={{
                        fontSize: 11,
                        color: SEVERITY_TONE[sev].fg,
                        background: SEVERITY_TONE[sev].bg,
                        border: `1px solid ${SEVERITY_TONE[sev].border}`,
                        borderRadius: 4,
                        padding: "0 6px",
                      }}
                    >
                      {sev === "warn" ? "⚠" : "ⓘ"} 授業 {check.open} コマに代行・欠勤の登録なし
                    </span>
                  )}
                  {sev && check.open - check.incoming > 0 && onRegisterAbsence && (
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => onRegisterAbsence({ teachers: [r.name], date: r.date })}
                      style={{ ...S.btn(false), padding: "2px 10px", fontSize: 11 }}
                    >
                      欠勤を登録…
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {yearRows.length > 0 && (
        <section style={{ ...S.panel, padding: "10px 14px", overflowX: "auto" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>
            {fmtFiscalYear(year)}のまとめ
            <span style={{ fontSize: 12, fontWeight: 400, color: colors.inkMuted, marginLeft: 8 }}>
              {year}/4〜{year + 1}/3。有給の日数 (半休は 0.5)
            </span>
          </h3>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...sumHead, textAlign: "left", minWidth: 64 }}>
                  講師
                </th>
                {FISCAL_MONTHS.map((m) => (
                  <th
                    key={m}
                    scope="col"
                    style={{
                      ...sumHead,
                      background: `${m === vm ? "#fff3c4" : colors.surfaceAlt}`,
                    }}
                  >
                    {m}月
                  </th>
                ))}
                <th scope="col" style={sumHead}>
                  有給 計
                </th>
                <th scope="col" style={sumHead} title="付与 + 繰越。任意">
                  持ち日数
                </th>
                <th scope="col" style={sumHead}>
                  残り
                </th>
                <th scope="col" style={sumHead} title="代休・特別休暇など (有給に数えない)">
                  その他
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.name}>
                  <th scope="row" style={{ ...sumCell, textAlign: "left", fontWeight: 700 }}>
                    {s.name}
                  </th>
                  {s.byMonth.map((v, i) => (
                    <td key={i} style={{ ...sumCell, color: v ? colors.ink : colors.inkGhost }}>
                      {v ? fmtLeaveDays(v) : "·"}
                    </td>
                  ))}
                  <td style={{ ...sumCell, fontWeight: 800 }}>{fmtLeaveDays(s.counts.paidDays)}</td>
                  <td style={sumCell}>
                    <GrantInput
                      key={`${s.name}-${year}-${s.grant}`}
                      name={s.name}
                      value={s.grant}
                      onCommit={(v) => saveGrant(s.name, v)}
                    />
                  </td>
                  <td
                    style={{
                      ...sumCell,
                      fontWeight: 800,
                      color: s.remaining != null && s.remaining < 0 ? "#c44" : colors.ink,
                    }}
                  >
                    {s.remaining != null ? fmtLeaveDays(s.remaining) : "—"}
                  </td>
                  <td style={sumCell}>{s.counts.other || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="no-print" style={{ fontSize: 11, color: colors.inkMuted, marginTop: 4 }}>
            持ち日数 (その年度に使える日数 = 付与 + 繰越)
            を入れると残りが出ます。空にすると消えます。
          </div>
        </section>
      )}
    </div>
  );
}

const sumHead = {
  padding: "4px 6px",
  fontSize: 11,
  fontWeight: 700,
  background: colors.surfaceAlt,
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: "nowrap",
  textAlign: "center",
};

const sumCell = {
  padding: "3px 6px",
  textAlign: "center",
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: "nowrap",
};

const nameBtn = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  color: colors.ink,
  fontWeight: 700,
  fontSize: 12,
  textDecoration: "underline dotted",
};

// 持ち日数の入力欄 (Enter / 欄の外で保存)。保存値が変わったら key で作り直す
function GrantInput({ name, value, onCommit }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  return (
    <input
      type="number"
      min="0"
      step="0.5"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(v);
        }
      }}
      aria-label={`${name} の持ち日数`}
      placeholder="—"
      style={{
        width: 52,
        padding: "2px 4px",
        fontSize: 12,
        textAlign: "center",
        border: "1px solid #ccc",
        borderRadius: 4,
      }}
    />
  );
}
