// ─── バイト出勤表 (授業時間の集計のタブ) ─────────────────────────────
// バイトの給与用の「出勤日数 × 単価」の月の表。行 = バイト (講師管理の
// バイト一覧の並び順)、列 = 期間の日付、セル = その日の出勤日数。
// 数え方・表データは utils/partTimeAttendance (Excel も同じ表データを使う)。
// 授業は親 (TeachingMinutesView) が computeTeachingMinutes で拾った rows を
// そのまま受け取る (ここで授業を拾い直さない)。
//
// - セルを押すとその日の授業 (時刻・種別・授業名) と、1 日ずつの手での上書き
//   (その月の表だけ。アプリのデータには書き戻さない = この端末だけ)
// - 「要確認」(かたまり 3 つ以上 / 時刻の読めない授業) と「手で上書き」のセルは
//   色と小さな印で分ける (色だけに頼らない)
// - 単価・別の出勤にする空き時間はこの端末の表示の好み (LS.partTimeAttendance*)
// - 閲覧者 (経理) もそのまま使う。書き込みは端末の localStorage だけ
// - 印刷はトップバーの 🖨 (popup 系統)。操作部・ダイアログは no-print、紙面は
//   printStyles の attendance 用 CSS (A4 横) で詰める

import { Fragment, useId, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { LS } from "../../constants/storageKeys";
import { MINUTE_KIND_COLOR } from "../../constants/colors";
import { S } from "../../styles/common";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useToasts } from "../../hooks/useToasts";
import { dateToDay, fmtMD, parseLocalDate } from "../../utils/dateHelpers";
import { MINUTE_KIND_LABELS, describeEntryNotes } from "../../utils/teachingMinutes";
import {
  ATTENDANCE_FLAG_LABELS,
  DEFAULT_GAP_MINUTES,
  DEFAULT_UNIT_PRICE,
  GAP_MINUTE_CHOICES,
  OVERRIDE_CHOICES,
  attendancePeriodKey,
  buildDutyHints,
  buildPartTimeAttendanceSheet,
  sanitizeAttendanceOverrides,
  sanitizeGapMinutes,
  sanitizeUnitPrice,
  setAttendanceOverride,
  staffNamesOf,
} from "../../utils/partTimeAttendance";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
// 色 (どれも背景とのコントラスト 4.5:1 以上)
const CHECK_BG = "#fff1b8";
const CHECK_FG = "#4d3800";
const OVERRIDE_BG = "#d9e8ff";
const OVERRIDE_FG = "#0b3a75";
const HEAD_BG = "#eef1f6";
const SAT_FG = "#1f5fa8";
const SUN_FG = "#b42318";
const MUTED = "#666";

const weekdayOf = (date) => {
  const d = parseLocalDate(date);
  return d ? WEEKDAY[d.getDay()] : "";
};
const dayColor = (dow) => (dow === "土" ? SAT_FG : dow === "日" ? SUN_FG : "#222");
const yen = (n) => `${Number(n || 0).toLocaleString()} 円`;

// セルの説明 (ホバーの title と読み上げ)
function describeCell(teacher, cell) {
  const head = `${teacher} ${fmtMD(cell.date)} (${weekdayOf(cell.date)})`;
  const lines = [`${head}: 出勤 ${cell.units}`];
  if (cell.overridden) lines.push(`手で上書き (自動では ${cell.auto})`);
  for (const f of cell.flags) lines.push(`要確認: ${ATTENDANCE_FLAG_LABELS[f]}`);
  for (const e of cell.entries) {
    lines.push(`${e.time || "時刻なし"} ${MINUTE_KIND_LABELS[e.kind]} ${e.label}`);
  }
  for (const e of cell.excluded) {
    lines.push(`(合計外) ${e.time || "時刻なし"} ${MINUTE_KIND_LABELS[e.kind]} ${e.label}`);
  }
  return lines.join("\n");
}

export function PartTimeAttendanceSheet({
  rows,
  dates = [],
  partTimeStaff = [],
  included,
  slots = [],
  timetables = [],
  startDate,
  endDate,
  // 講師名でその月の月間へ (TeachingMinutesView と同じ)
  onSelectTeacher,
  monthOf,
}) {
  const baseId = useId();
  const toasts = useToasts();
  const [unitPrice, setUnitPrice] = useLocalStorage(LS.partTimeAttendanceUnitPrice, DEFAULT_UNIT_PRICE, {
    migrate: sanitizeUnitPrice,
  });
  // 単価の入力途中の文字 (空欄にして打ち直す間に 0 円にしない)
  const [priceText, setPriceText] = useState(null);
  const [gapMinutes, setGapMinutes] = useLocalStorage(
    LS.partTimeAttendanceGapMinutes,
    DEFAULT_GAP_MINUTES,
    { migrate: sanitizeGapMinutes }
  );
  const [overrideStore, setOverrideStore] = useLocalStorage(LS.partTimeAttendanceOverrides, {}, {
    migrate: sanitizeAttendanceOverrides,
  });
  const periodKey = attendancePeriodKey(startDate, endDate);
  const overrides = useMemo(() => overrideStore[periodKey] || {}, [overrideStore, periodKey]);
  const [active, setActive] = useState(null); // { teacher, date }
  const [exporting, setExporting] = useState(false);

  const sheet = useMemo(
    () =>
      buildPartTimeAttendanceSheet({
        rows,
        staff: partTimeStaff,
        dates,
        included,
        unitPrice,
        overrides,
        gapMinutes,
      }),
    [rows, partTimeStaff, dates, included, unitPrice, overrides, gapMinutes]
  );
  const staffNames = useMemo(() => staffNamesOf(partTimeStaff), [partTimeStaff]);
  const hints = useMemo(
    () => buildDutyHints({ slots, timetables, staffNames, dates }),
    [slots, timetables, staffNames, dates]
  );

  const setOverride = (teacher, date, value) =>
    setOverrideStore((prev) => setAttendanceOverride(prev, periodKey, teacher, date, value));

  const activeRow = active ? sheet.rows.find((r) => r.teacher === active.teacher) : null;
  const activeCell = activeRow?.cells.find((c) => c.date === active.date) || null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const { downloadPartTimeAttendanceExcel } = await import("../../utils/partTimeAttendanceExport");
      const fileName = await downloadPartTimeAttendanceExcel({ sheet, hints, startDate, endDate });
      toasts.success(`${fileName} を書き出しました`);
    } catch (e) {
      console.error(e);
      toasts.error("Excel の生成に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const canExport = sheet.rows.length > 0 && dates.length > 0 && !exporting;
  const smallInput = { ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 };
  const th = {
    padding: "4px 2px",
    background: HEAD_BG,
    borderBottom: "1px solid #c8cdd6",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: 0,
    borderBottom: "1px solid #e4e6ea",
    borderLeft: "1px solid #eef0f3",
    textAlign: "center",
    fontSize: 13,
    whiteSpace: "nowrap",
  };
  const sticky = { position: "sticky", left: 0, zIndex: 1 };
  const monthStart = (i) => i > 0 && dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7);

  if (staffNames.length === 0) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          color: MUTED,
        }}
      >
        バイトが登録されていません (講師管理 → バイト一覧で登録すると、ここに並びます)
      </div>
    );
  }

  return (
    <div className="pt-attendance-sheet">
      {/* 単価・空き時間・Excel */}
      <div
        className="no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          margin: "0 0 8px",
          fontSize: 12,
          color: "#444",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          単価
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={priceText ?? String(unitPrice)}
            onChange={(e) => {
              const v = e.target.value;
              setPriceText(v);
              const n = Number(v);
              if (v !== "" && Number.isInteger(n) && n >= 0) setUnitPrice(sanitizeUnitPrice(n));
            }}
            onBlur={() => setPriceText(null)}
            aria-label="単価 (円)"
            style={{ ...smallInput, width: 90, textAlign: "right" }}
          />
          円
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          授業の間が
          <select
            value={gapMinutes}
            onChange={(e) => setGapMinutes(sanitizeGapMinutes(e.target.value))}
            aria-label="別の出勤として数える空き時間"
            style={smallInput}
          >
            {GAP_MINUTE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m} 分
              </option>
            ))}
          </select>
          以上空いたら別の出勤
        </label>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          style={{
            ...S.btn(false),
            opacity: canExport ? 1 : 0.5,
            cursor: canExport ? "pointer" : "not-allowed",
          }}
        >
          {exporting ? "書き出し中…" : "⬇ バイト出勤表 (Excel)"}
        </button>
      </div>

      {(sheet.checks.length > 0 || sheet.overridden.length > 0) && (
        <div
          className="no-print"
          style={{
            background: "#fffbea",
            border: "1px solid #e8d9a0",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            color: "#5c4800",
            marginBottom: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sheet.checks.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer" }}>
                ⚠ 要確認の日が {sheet.checks.length} 日あります (数はルールどおりに入れています。押すとその日の授業を確かめられます)
              </summary>
              <CellLinkList items={sheet.checks} onOpen={setActive} describe={(c) =>
                `${c.flags.map((f) => ATTENDANCE_FLAG_LABELS[f]).join("・")} → ${c.units}`
              } />
            </details>
          )}
          {sheet.overridden.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer" }}>
                ✎ 手で上書きした日が {sheet.overridden.length} 日あります (この端末だけに残っています。Excel には上書き後の数が入ります)
              </summary>
              <CellLinkList items={sheet.overridden} onOpen={setActive} describe={(c) =>
                `${c.units} (自動では ${c.auto})`
              } />
            </details>
          )}
        </div>
      )}

      <div className="mobile-scroll-x pt-attendance-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table
          aria-describedby={`${baseId}-legend`}
          style={{ borderCollapse: "collapse", background: "#fff", minWidth: "100%" }}
        >
          <thead>
            <tr>
              <th scope="col" rowSpan={2} style={{ ...th, ...sticky, zIndex: 2, textAlign: "left", padding: "4px 8px", minWidth: 96 }}>
                講師
              </th>
              {dates.map((d, i) => {
                const [, m, day] = d.split("-").map(Number);
                const label = i === 0 || monthStart(i) ? `${m}/${day}` : String(day);
                return (
                  <th
                    key={d}
                    scope="col"
                    style={{
                      ...th,
                      minWidth: 26,
                      color: dayColor(weekdayOf(d)),
                      borderLeft: monthStart(i) ? "2px solid #8a93a3" : th.borderLeft,
                    }}
                  >
                    {label}
                  </th>
                );
              })}
              <th scope="col" rowSpan={2} style={{ ...th, padding: "4px 8px" }}>
                日数
              </th>
              <th scope="col" rowSpan={2} style={{ ...th, padding: "4px 8px" }}>
                金額
              </th>
            </tr>
            <tr>
              {dates.map((d, i) => {
                const dow = weekdayOf(d);
                return (
                  <th
                    key={d}
                    scope="col"
                    style={{
                      ...th,
                      fontWeight: 400,
                      color: dayColor(dow),
                      borderLeft: monthStart(i) ? "2px solid #8a93a3" : th.borderLeft,
                    }}
                  >
                    {dow}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => {
              const hint = hints.get(row.teacher);
              return (
                <tr key={row.teacher}>
                  <th
                    scope="row"
                    style={{
                      ...td,
                      ...sticky,
                      background: "#fff",
                      textAlign: "left",
                      padding: "4px 8px",
                      fontSize: 13,
                      maxWidth: 140,
                      whiteSpace: "normal",
                      borderLeft: "none",
                      borderRight: "1px solid #d8dbe1",
                    }}
                  >
                    {onSelectTeacher ? (
                      <button
                        type="button"
                        onClick={() => onSelectTeacher(row.teacher, monthOf ? { month: monthOf } : undefined)}
                        title={`${row.teacher} の月間スケジュールを開く`}
                        style={{
                          border: "none",
                          background: "none",
                          padding: 0,
                          font: "inherit",
                          fontWeight: 700,
                          color: "inherit",
                          cursor: "pointer",
                          textDecoration: "underline dotted",
                          textUnderlineOffset: 3,
                        }}
                      >
                        {row.teacher}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 700 }}>{row.teacher}</span>
                    )}
                    {hint && (
                      <div style={{ fontSize: 10, color: MUTED, fontWeight: 400, lineHeight: 1.3 }}>
                        {/* 折り返すなら曜日の切れ目で (「金」と「H2」の間で切らない) */}
                        {hint.split("・").map((part, k) => (
                          <Fragment key={k}>
                            {k > 0 && "・"}
                            {k > 0 && <wbr />}
                            <span style={{ whiteSpace: "nowrap" }}>{part}</span>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={cell.date}
                      style={{
                        ...td,
                        borderLeft: monthStart(i) ? "2px solid #8a93a3" : td.borderLeft,
                        background: cell.overridden ? OVERRIDE_BG : cell.needsCheck ? CHECK_BG : undefined,
                      }}
                    >
                      <AttendanceCellButton
                        teacher={row.teacher}
                        cell={cell}
                        onOpen={() => setActive({ teacher: row.teacher, date: cell.date })}
                      />
                    </td>
                  ))}
                  <td style={{ ...td, padding: "4px 8px", fontWeight: 800 }}>{row.days}</td>
                  <td style={{ ...td, padding: "4px 8px", textAlign: "right" }}>{yen(row.amount)}</td>
                </tr>
              );
            })}
            <tr>
              <th
                scope="row"
                style={{ ...td, ...sticky, background: "#f0f0f0", textAlign: "left", padding: "6px 8px", fontWeight: 800 }}
              >
                合計
              </th>
              <td
                colSpan={dates.length}
                style={{ ...td, background: "#f0f0f0", textAlign: "right", padding: "6px 8px", fontSize: 12, color: "#444" }}
              >
                単価 {yen(sheet.unitPrice)} × {sheet.totalDays} 日
              </td>
              <td style={{ ...td, background: "#f0f0f0", padding: "6px 8px", fontWeight: 800 }}>{sheet.totalDays}</td>
              <td style={{ ...td, background: "#f0f0f0", padding: "6px 8px", fontWeight: 800, textAlign: "right" }}>
                {yen(sheet.totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p id={`${baseId}-legend`} style={{ fontSize: 11, color: MUTED, margin: "6px 0 0", lineHeight: 1.7 }}>
        {"1 日の授業を時刻順に並べ、授業の間が "}
        {sheet.gapMinutes}
        {" 分以上空いたら別の出勤として数えています (コマ数は数えません)。"}
        <span style={{ background: CHECK_BG, color: CHECK_FG, padding: "0 4px", borderRadius: 3, whiteSpace: "nowrap" }}>
          ! 要確認
        </span>
        {" = 時間の離れたかたまりが 3 つ以上 / 時刻の読めない授業がある日。 "}
        <span style={{ background: OVERRIDE_BG, color: OVERRIDE_FG, padding: "0 4px", borderRadius: 3, whiteSpace: "nowrap" }}>
          ✎ 上書き
        </span>
        {" = 手で数を直した日。"}
        <span className="no-print">{"セルを押すとその日の授業を確かめ、数を直せます。"}</span>
      </p>

      {activeCell && (
        <CellDetailDialog
          teacher={active.teacher}
          cell={activeCell}
          gapMinutes={sheet.gapMinutes}
          onOverride={(value) => setOverride(active.teacher, activeCell.date, value)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function AttendanceCellButton({ teacher, cell, onOpen }) {
  const fg = cell.overridden ? OVERRIDE_FG : cell.needsCheck ? CHECK_FG : "#222";
  const mark = cell.overridden ? "✎" : cell.needsCheck ? "!" : "";
  const label = describeCell(teacher, cell);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={label.split("\n").slice(0, 3).join("、")}
      style={{
        display: "block",
        width: "100%",
        minWidth: 26,
        minHeight: 30,
        padding: "2px 0",
        border: "none",
        background: "transparent",
        color: fg,
        font: "inherit",
        fontWeight: cell.units > 0 ? 700 : 400,
        cursor: "pointer",
      }}
    >
      {cell.units > 0 ? cell.units : ""}
      {mark && (
        <span aria-hidden="true" style={{ fontSize: 9, verticalAlign: "super", marginLeft: 1 }}>
          {mark}
        </span>
      )}
    </button>
  );
}

function CellLinkList({ items, onOpen, describe }) {
  return (
    <ul style={{ margin: "4px 0 2px", paddingLeft: 20 }}>
      {items.map((c) => (
        <li key={`${c.teacher}|${c.date}`}>
          <button
            type="button"
            onClick={() => onOpen({ teacher: c.teacher, date: c.date })}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
              textAlign: "left",
            }}
          >
            {fmtMD(c.date)} ({dateToDay(c.date) || "日"}) {c.teacher}: {describe(c)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function EntryRows({ entries, muted = false }) {
  return entries.map((e, i) => {
    const notes = describeEntryNotes(e, { short: true });
    return (
      <li key={i} style={{ opacity: muted ? 0.65 : 1, lineHeight: 1.6 }}>
        <span style={{ display: "inline-block", minWidth: 88, color: "#444" }}>{e.time || "時刻なし"}</span>
        <span style={{ color: MINUTE_KIND_COLOR[e.kind], fontWeight: 700, marginRight: 6 }}>
          {MINUTE_KIND_LABELS[e.kind]}
        </span>
        {e.label}
        {notes.length > 0 && <span style={{ color: MUTED }}> ({notes.join(" / ")})</span>}
      </li>
    );
  });
}

function CellDetailDialog({ teacher, cell, gapMinutes, onOverride, onClose }) {
  const dow = weekdayOf(cell.date);
  const listStyle = { margin: "2px 0 8px", paddingLeft: 18, fontSize: 13 };
  const choiceBtn = (on) => ({
    ...S.btn(on),
    padding: "6px 12px",
    minWidth: 44,
    border: on ? "none" : "1px solid #ccc",
  });
  return (
    <Modal title={`${teacher} 先生 — ${fmtMD(cell.date)} (${dow})`} onClose={onClose} width="min(520px, 100%)">
      <div style={{ fontSize: 14, marginBottom: 10 }}>
        出勤 <b style={{ fontSize: 18 }}>{cell.units}</b>
        {cell.overridden ? (
          <span style={{ color: OVERRIDE_FG }}> (手で上書き。自動では {cell.auto})</span>
        ) : (
          <span style={{ color: MUTED }}>
            {" "}
            ({cell.koma === 0 ? "授業なし" : `${cell.koma} コマ・時間の離れたかたまり ${cell.blocks.length} つ`})
          </span>
        )}
      </div>
      {cell.flags.length > 0 && (
        <div
          role="note"
          style={{
            background: CHECK_BG,
            color: CHECK_FG,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {cell.flags.map((f) => (
            <div key={f}>⚠ 要確認: {ATTENDANCE_FLAG_LABELS[f]}</div>
          ))}
        </div>
      )}
      {cell.blocks.map((b, i) => (
        <div key={i}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
            {cell.blocks.length > 1 ? `${i + 1} つ目のかたまり ` : ""}
            {b.start}〜{b.end}
          </div>
          <ul style={listStyle}>
            <EntryRows entries={b.entries} />
          </ul>
        </div>
      ))}
      {cell.untimed.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: CHECK_FG }}>時刻の読めない授業</div>
          <ul style={listStyle}>
            <EntryRows entries={cell.untimed} />
          </ul>
        </div>
      )}
      {cell.excluded.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>合計に含めない種別 (数えていません)</div>
          <ul style={listStyle}>
            <EntryRows entries={cell.excluded} muted />
          </ul>
        </div>
      )}
      {cell.koma === 0 && cell.excluded.length === 0 && (
        <p style={{ fontSize: 13, color: MUTED, margin: "0 0 8px" }}>この日の授業はありません</p>
      )}

      <div style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 }}>この日の出勤日数</div>
        <div role="group" aria-label="この日の出勤日数" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={!cell.overridden}
            onClick={() => onOverride(null)}
            style={choiceBtn(!cell.overridden)}
          >
            自動 ({cell.auto})
          </button>
          {OVERRIDE_CHOICES.map((n) => {
            const on = cell.overridden && cell.units === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => onOverride(n)}
                style={choiceBtn(on)}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: MUTED, margin: "6px 0 0", lineHeight: 1.6 }}>
          自動 = 授業の間が {gapMinutes} 分以上空いたら別の出勤として数えた数。上書きはこの月の表だけで、
          この端末にだけ残ります (アプリのデータには書き戻しません)。
        </p>
      </div>
    </Modal>
  );
}
