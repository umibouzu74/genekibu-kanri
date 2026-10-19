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
  CALENDAR_DAY_KINDS,
  EMPTY_STAFF_LEAVE,
  FISCAL_MONTHS,
  LEAVE_KINDS,
  NO_WORK_PATTERN,
  calendarFor,
  calendarIndex,
  countLeave,
  fmtLeaveDays,
  grantFor,
  indexLeaveRecords,
  leaveKey,
  leaveKindMeta,
  publicOffCount,
  recordsInRange,
  setGrant,
  setWorkPattern,
  summarizeYear,
  workPatternFor,
} from "../../utils/staffLeave";
import { leaveClassCheck, leaveClassSeverity } from "../../utils/leaveClassCheck";
import { LeaveEditor } from "../LeaveEditor";
import { LeaveCalendarPanel } from "./leave/LeaveCalendarPanel";
import {
  LEAVE_SEVERITY_TONE as SEVERITY_TONE,
  leaveKindChip as kindChip,
} from "../../styles/leave";

// ─── 有給・半休 ─────────────────────────────────────────────────────
// 「講師の所属」で現役部 常勤にした人の有給・半休を記録して見る画面
// (utils/staffLeave)。管理者だけが読める adminData/ に置く。
//
//   - 月の表: 行 = 人、列 = 日。マスを押すか「＋ 有給・半休を入れる」で、下の欄で
//     その日の休暇を入れる (欄の上で人と日を選び直せる。種類のボタンを押せば保存。
//     期間にチェックを入れると何日もまとめて)。ダッシュボードの「今後7日の休暇」・
//     Cmd+K からは focusRequest ({name?, date?}) で欄を開いた状態で来る
//   - 年間カレンダー (予定表の Excel の教員用カレンダー) を取り込むと、人ごとの
//     休みの型 (土日 休み / 日月 休み) に合わせて公休の日を薄く出し、日付の見出しに
//     祝日・塾の休み・教員半休・行事を出す (LeaveCalendarPanel)
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
  // 入れる欄を開いた状態で来る要求 ({name?, date?, token})。受け取ったら onConsumeFocus
  focusRequest = null,
  onConsumeFocus,
}) {
  const today = useToday();
  const toasts = useToasts();
  const [ym, setYm] = useState(() => ymOf(today));
  const [cell, setCell] = useState(null); // { name: string|null, date }
  const editorRef = useRef(null);
  const calendarAnchorId = "leave-calendar-panel";

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
  // 年間カレンダー (この年度のもの) と、人ごとの公休の日
  const cal = calendarFor(leave, year);
  const calIdx = calendarIndex(cal);
  const patternOf = (name) => {
    const key = cal ? workPatternFor(leave, name, year) : null;
    return key && calIdx.patternByKey.has(key) ? calIdx.patternByKey.get(key) : null;
  };
  const isPublicOff = (name, d) => {
    const p = patternOf(name);
    return !!p && calIdx.offByPattern.get(p.key).has(d);
  };
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

  // 入れる欄を開く (name が null なら欄の上で人を選ぶ)。違う月の日なら月も移る
  const selectCell = (name, date) => {
    setCell({ name, date });
    if (ymOf(date) !== ym) setYm(ymOf(date));
    // 狭い画面では表の下の欄が見えないので寄せる
    setTimeout(() => {
      const el = editorRef.current;
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 0);
  };

  // 選んだマス (月を変えたら外す。欄の日付で月を変えたときは selectCell が月も合わせる)
  useEffect(() => {
    if (cell && ymOf(cell.date) !== ym) setCell(null);
  }, [ym, cell]);

  // ダッシュボード・Cmd+K から「入れる欄を開いて」の要求
  useEffect(() => {
    if (!focusRequest || !enabled) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(focusRequest.date || "") ? focusRequest.date : today;
    selectCell(focusRequest.name || null, date);
    onConsumeFocus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 要求が来たときだけ
  }, [focusRequest, enabled]);
  const cellRecord = cell?.name ? recIndex.get(leaveKey(cell.name, cell.date)) : null;
  const cellCheck = useMemo(() => {
    if (!cell?.name) return null;
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

  // 「＋ 有給・半休を入れる」の既定の日: 表示中の月なら今日、それ以外は月の 1 日
  const defaultEntryDate = () => (ymOf(today) === ym ? today : `${ym}-01`);
  const openEntry = (name = null) => selectCell(name ?? (rows.length === 1 ? rows[0] : null), defaultEntryDate());

  const savePattern = (name, value) => {
    onSave((prev) => setWorkPattern(prev, name, year, value || NO_WORK_PATTERN));
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
        .leave-cell-empty:hover::after,
        .leave-cell-empty:focus-visible::after { content: "+"; color: #6b7280; font-weight: 700; }
        .leave-cell-empty:hover { border-color: #b8c4d6 !important; }
        @media print {
          .leave-grid-wrap { overflow: visible !important; }
          .leave-cell-btn { border: none !important; }
          .leave-cell-empty::after { content: none !important; }
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
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => openEntry()}
            style={{ ...S.btn(true), padding: "6px 14px", fontSize: 13 }}
          >
            ＋ 有給・半休を入れる
          </button>
        )}
        <span style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(calendarAnchorId);
              if (el && typeof el.scrollIntoView === "function") {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12 }}
          >
            📅 年間カレンダー{cal ? "" : " (未取り込み)"}
          </button>
          {onOpenAffiliation && (
            <button
              type="button"
              onClick={onOpenAffiliation}
              style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12 }}
            >
              🏷 講師の所属 (誰を載せるか)
            </button>
          )}
        </span>
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
                  // 年間カレンダーの日 (祝日・塾の休み・教員半休・行事)
                  const cd = calIdx?.dayByDate.get(d) || null;
                  const red = dow === 0 || hol || cd?.holiday;
                  const calText = calendarDayText(cd);
                  const mark = calendarDayMark(cd);
                  return (
                    <th
                      key={d}
                      scope="col"
                      title={[d, hol, calText].filter(Boolean).join("\n")}
                      style={{
                        padding: "2px 0",
                        width: 26,
                        minWidth: 26,
                        fontWeight: 700,
                        fontSize: 11,
                        lineHeight: 1.2,
                        verticalAlign: "top",
                        borderBottom: `1px solid ${colors.border}`,
                        color: red ? "#c44" : dow === 6 ? "#44c" : colors.ink,
                        background:
                          d === today
                            ? "#fff3c4"
                            : cd?.kind === "closed"
                              ? "#fff6d6"
                              : red
                                ? "#fdf2f2"
                                : colors.surfaceAlt,
                      }}
                    >
                      {Number(d.slice(8))}
                      <br />
                      <span style={{ fontWeight: 400, fontSize: 10 }}>{WEEKDAYS[dow]}</span>
                      {mark && (
                        <>
                          <br />
                          <span
                            aria-hidden="true"
                            style={{ fontWeight: 700, fontSize: 9, color: mark.color }}
                          >
                            {mark.text}
                          </span>
                        </>
                      )}
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
                const pattern = patternOf(name);
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
                      {pattern && (
                        <span
                          title={`休みの型: ${pattern.label}`}
                          style={{ fontSize: 9, color: colors.inkMuted, marginLeft: 4, fontWeight: 400 }}
                        >
                          {pattern.key}
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
                      const off = isPublicOff(name, d);
                      const isSel = cell && cell.name === name && cell.date === d;
                      const label = `${fmtMDWeekday(d)} ${name}: ${
                        k ? k.label : off ? `公休 (${pattern.label})` : "記録なし"
                      }${rec?.memo ? ` (${rec.memo})` : ""}${k && off ? " — 公休の日" : ""}${
                        sev === "warn" ? " — 授業に代行・欠勤の登録なし" : ""
                      }`;
                      return (
                        <td
                          key={d}
                          style={{
                            padding: 1,
                            borderBottom: `1px solid ${colors.border}`,
                            background: off
                              ? "#eceef2"
                              : dow === 0 || hol
                                ? "#fdf6f6"
                                : d === today
                                  ? "#fffbe6"
                                  : "#fff",
                          }}
                        >
                          <button
                            type="button"
                            className={`leave-cell-btn${!k && !off ? " leave-cell-empty" : ""}`}
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
                              color: k ? k.tone.fg : off ? "#9aa1ad" : colors.inkGhost,
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              lineHeight: 1,
                            }}
                          >
                            {k ? k.short : off ? "休" : ""}
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
            {cal && (
              <>
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <span
                    style={{
                      background: "#eceef2",
                      color: "#9aa1ad",
                      borderRadius: 4,
                      padding: "0 5px",
                      fontWeight: 800,
                    }}
                  >
                    休
                  </span>
                  公休 (年間カレンダー × 休みの型)
                </span>
                <span>日付の下: 祝=祝日 休=塾の休み 半=教員半休 ・=行事</span>
              </>
            )}
            <span className="no-print" style={{ marginLeft: "auto" }}>
              空いているマスを押すか「＋ 有給・半休を入れる」から (← → で月を移動)
            </span>
          </div>
        </div>
      )}

      {cell && (
        <section
          ref={editorRef}
          className="no-print"
          aria-label={cell.name ? `${fmtMDWeekday(cell.date)} ${cell.name} の休暇` : "有給・半休を入れる"}
          style={{
            ...S.panel,
            padding: "10px 14px",
            borderColor: colors.infoBorder,
            background: colors.infoSoft,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* 人と日を選び直す (マスを探さなくても入れられるように) */}
          <div
            role="group"
            aria-label="入れる人と日"
            style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}
          >
            <b>講師</b>
            {(cell.name && !rows.includes(cell.name) ? [...rows, cell.name] : rows).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={cell.name === n}
                onClick={() => selectCell(n, cell.date)}
                style={{ ...S.btn(cell.name === n), padding: "3px 10px", fontSize: 12 }}
              >
                {n}
              </button>
            ))}
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
              <b>日付</b>
              <input
                type="date"
                value={cell.date}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) selectCell(cell.name, v);
                }}
                aria-label="入れる日"
                style={{ ...S.input, width: "auto", padding: "3px 6px", fontSize: 12, background: "#fff" }}
              />
            </label>
            {!cell.name && (
              <button
                type="button"
                onClick={() => setCell(null)}
                style={{ ...S.btn(false), padding: "2px 10px", fontSize: 12, marginLeft: "auto" }}
              >
                ✕ 閉じる
              </button>
            )}
          </div>
          {cell.name ? (
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
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: colors.inkMuted }}>
              {"誰の休暇かを選ぶと、種類 (有給・午前半休・午後半休・その他の休み) のボタンが出ます。" +
                "押すとすぐ保存されます。"}
            </p>
          )}
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
                  {isPublicOff(r.name, r.date) && (
                    <span
                      title="年間カレンダーでは、この人の公休の日です"
                      style={{
                        fontSize: 11,
                        color: "#555",
                        background: "#eceef2",
                        border: `1px solid ${colors.border}`,
                        borderRadius: 4,
                        padding: "0 6px",
                      }}
                    >
                      公休の日
                    </span>
                  )}
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
                    <button
                      type="button"
                      className="inline-activate"
                      onClick={() => setYm(`${m <= 3 ? year + 1 : year}-${pad2(m)}`)}
                      title={`${m}月の表を開く`}
                      style={{ ...nameBtn, fontSize: 11 }}
                    >
                      {m}月
                    </button>
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
                {cal && (
                  <>
                    <th scope="col" style={sumHead} title="年間カレンダーのどの列の公休か">
                      休みの型
                    </th>
                    <th scope="col" style={sumHead} title="年間カレンダーの年間の休日数">
                      公休
                    </th>
                  </>
                )}
                <th scope="col" className="no-print" style={sumHead}>
                  入れる
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
                  {cal && (
                    <>
                      <td style={sumCell}>
                        <select
                          value={workPatternFor(leave, s.name, year) || ""}
                          onChange={(e) => savePattern(s.name, e.target.value)}
                          aria-label={`${s.name} の休みの型`}
                          style={{ fontSize: 12, padding: "1px 2px" }}
                        >
                          <option value="">—</option>
                          {cal.patterns.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={sumCell}>{publicOffCount(leave, s.name, year) ?? "—"}</td>
                    </>
                  )}
                  <td className="no-print" style={sumCell}>
                    <button
                      type="button"
                      onClick={() => openEntry(s.name)}
                      aria-label={`${s.name} の有給・半休を入れる`}
                      style={{ ...S.btn(false), padding: "1px 8px", fontSize: 11 }}
                    >
                      ＋ 入れる
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="no-print" style={{ fontSize: 11, color: colors.inkMuted, marginTop: 4 }}>
            持ち日数 (その年度に使える日数 = 付与 + 繰越)
            を入れると残りが出ます。空にすると消えます。
            {cal && " 休みの型を選ぶと、その人の公休が月の表に出ます (前の年度の型を引き継ぎます)。"}
          </div>
        </section>
      )}

      <LeaveCalendarPanel
        id={calendarAnchorId}
        leave={leave}
        year={year}
        onSave={onSave}
        today={today}
        noPatternCount={cal ? yearRows.filter((n) => tracksLeave(n, year) && !patternOf(n)).length : 0}
      />
    </div>
  );
}

// 年間カレンダーの日の説明 (見出しの title)
function calendarDayText(cd) {
  if (!cd) return "";
  return [
    cd.holiday ? `祝日${cd.event ? ` ${cd.event}` : ""}` : cd.event,
    cd.kind ? CALENDAR_DAY_KINDS[cd.kind] : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

// 日付の見出しの 3 段目に出す 1 文字
function calendarDayMark(cd) {
  if (!cd) return null;
  if (cd.kind === "closed") return { text: "休", color: "#9a6a00" };
  if (cd.holiday) return { text: "祝", color: "#c44" };
  if (cd.kind === "half") return { text: "半", color: "#5a6a8a" };
  if (cd.event) return { text: "・", color: colors.inkMuted };
  return null;
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
