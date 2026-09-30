import { useEffect, useMemo, useRef, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { useToasts } from "../../hooks/useToasts";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { MonthNav } from "../MonthNav";
import { PrintButton } from "../PrintButton";
import { S, colors } from "../../styles/common";
import { DAY_SCHEDULE_META, EXAM_META, EXTRA_LESSON_META } from "../../constants/eventKinds";
import { dateToDay, fmtMD, monthOffsetFromToday, parseLocalDate } from "../../utils/dateHelpers";
import { nextNumericId } from "../../utils/schema";
import { splitTeacherField } from "../../utils/biweekly";
import { buildFuzokuMonth } from "../../utils/fuzokuBoard";
import {
  PATTERN,
  PATTERN_LABEL,
  TEST_ROTATION,
  formatTestSubjects,
  planPatternChange,
  rotationSubjects,
  setFuzokuNote,
  setFuzokuTestEntry,
  shortFuzokuGrade,
  sortByRotation,
} from "../../utils/fuzokuPlan";

// ─── 附属の授業予定 ─────────────────────────────────────────────────
// 附属コース (学年「附中…」のコマ。水曜) の 1 か月ぶんの予定を、学校の
// 予定表 (バス時刻) を見ながら決めて、そのまま講師に配る紙面にする画面。
// 以前 Excel で「水曜ごとに 通常 / 50分 を決め、科目を写し、確認テストの
// 科目を書く」としていたものの置き換え。
//
// 時程は特別時程 (daySchedules) のレコードを直接作る / 消す (プリセットと
// 同じ中身。特別時程の画面で個別に作ったものは、ここでは切り替えずに
// 向こうへ案内する)。休みは休講・テスト期間を読むだけ。持つのは学校メモと
// 確認テストの手動指定だけ (fuzokuPlan)。組み立ては utils/fuzokuBoard.js。
//
// 印刷系統: PrintButton (window.print() 直接呼び) を使う。紙面に要るもの
// (年月・日付・時程・メモ・表) はすべて DOM に常設し、操作だけ no-print。

export const SS_MONTH_KEY = "genyakubu:fuzokuPlanMonth";
const SS_MONTH_MAX_DIST = 12;

function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 表示中の月はタブ単位で覚える (EventCalendarView と同じ扱い)
function loadMonth(today) {
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  try {
    const saved = sessionStorage.getItem(SS_MONTH_KEY);
    const off = monthOffsetFromToday(saved, today);
    if (off == null || Math.abs(off) > SS_MONTH_MAX_DIST) return cur;
    return saved;
  } catch {
    return cur;
  }
}

function saveMonth(ym) {
  try {
    sessionStorage.setItem(SS_MONTH_KEY, ym);
  } catch {
    /* quota / private mode */
  }
}

const PRINT_CSS = `
.fuzoku-print-only { display: none; }
@media print {
  .fuzoku-print-only { display: inline; }
  .fuzoku-week { break-inside: avoid; page-break-inside: avoid; }
  .fuzoku-table th, .fuzoku-table td { font-size: 10px !important; padding: 2px 4px !important; }
}
`;

const PATTERN_BUTTONS = [PATTERN.NORMAL, PATTERN.COMPRESS, PATTERN.CUT_FIRST];

// その週の授業の開始時刻 ("16:25")。来ている学年のコマがある最初の限
function startTimeOf(week) {
  for (const r of week.rows) {
    const hit = Object.values(r.cells)
      .flat()
      .find((e) => e.status === "held" || e.status === "orientation");
    if (hit) return String(hit.time || r.time).split("-")[0];
  }
  return "";
}

function patternBadge(week) {
  if (!week.anyHeld) return { text: "授業なし", bg: "#ececf0", fg: "#555" };
  const start = startTimeOf(week);
  const at = start ? ` ${start}〜` : "";
  const k = week.pattern.kind;
  if (k === PATTERN.NORMAL) return { text: `通常${at}`, bg: "#e8f2ea", fg: colors.accentGreen };
  if (k === PATTERN.CUSTOM) {
    const labels = week.pattern.schedules.map((d) => d.label || "特別時程").join("・");
    return { text: `⏰ ${labels}${at}`, bg: DAY_SCHEDULE_META.bg, fg: DAY_SCHEDULE_META.fg };
  }
  return { text: `${PATTERN_LABEL[k]}${at}`, bg: DAY_SCHEDULE_META.bg, fg: DAY_SCHEDULE_META.fg };
}

const SUGGESTION_TEXT = {
  [PATTERN.NORMAL]: "通常 (16:25 開始)",
  [PATTERN.COMPRESS]: "50分授業 (17:00 開始)",
  unknown: "要判断 (17:00 にも間に合わない便)",
};

const chip = (bg, fg) => ({
  display: "inline-block",
  padding: "1px 8px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 700,
  background: bg,
  color: fg,
});

const cellBorder = "1px solid #c8c8d0";
const thStyle = {
  border: cellBorder,
  background: "#f3f3f6",
  padding: "4px 6px",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const tdStyle = { border: cellBorder, padding: "4px 6px", fontSize: 13, verticalAlign: "middle" };

// 学校メモの入力。Enter / フォーカスを外したときに保存 (Esc で取り消し)。
// 保存値が変わったら (他端末の同期など) key で入れ直す
function NoteInput({ value, placeholder, ariaLabel, onCommit, width }) {
  const cur = value || "";
  return (
    <input
      key={cur}
      type="text"
      defaultValue={cur}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== cur) onCommit(v);
      }}
      onKeyDown={(e) => {
        // 日本語入力の変換中の Enter / Esc は変換の確定・取り消し (保存しない)
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = cur;
          e.currentTarget.blur();
        }
      }}
      style={{ ...S.input, width, fontSize: 12, padding: "4px 8px" }}
    />
  );
}

function LessonCell({ entries, rowTime }) {
  if (!entries || entries.length === 0) return <td style={{ ...tdStyle, background: "#fafafa" }} />;
  return (
    <td style={tdStyle}>
      {entries.map((e) => {
        const teacher = splitTeacherField(e.slot.teacher).join("·");
        if (e.status === "held" || e.status === "orientation") {
          return (
            <div key={e.slot.id}>
              <span style={{ fontWeight: 700 }}>{e.slot.subj}</span>
              {teacher && (
                <span style={{ fontSize: 11, color: colors.inkMuted, marginLeft: 4 }}>{teacher}</span>
              )}
              {e.status === "orientation" && (
                <span style={{ ...chip("#fff3d6", "#8a5a00"), marginLeft: 4 }}>オリエン</span>
              )}
              {e.time && e.time !== rowTime && (
                <div style={{ fontSize: 11, color: colors.accentBlue }}>{e.time}</div>
              )}
            </div>
          );
        }
        return (
          <div key={e.slot.id} style={{ color: colors.inkSubtle }}>
            <s>{e.slot.subj}</s>{" "}
            <span style={{ fontSize: 11, fontWeight: 700 }}>{e.reason}</span>
            {e.detail && <span style={{ fontSize: 11 }}> ({e.detail})</span>}
          </div>
        );
      })}
    </td>
  );
}

function testCellView(res) {
  if (!res) return { text: "", color: colors.inkSubtle, weight: 400 };
  if (res.kind === "unset") return { text: "未設定", color: colors.accentOrange, weight: 700 };
  if (res.kind === "off") return { text: "—", color: colors.inkSubtle, weight: 400 };
  if (res.kind === "none") return { text: "なし", color: colors.ink, weight: 700 };
  return {
    text: formatTestSubjects(res),
    color: colors.ink,
    weight: res.kind === "manual" ? 800 : 600,
  };
}

// 確認テストの科目を手で決めるパネル (表の下に出す)
function TestEditor({ week, grade, res, onSave, onClose }) {
  const selected = res.kind === "manual" || res.kind === "auto" ? res.subjects : [];
  const toggle = (subj) => {
    const next = selected.includes(subj)
      ? selected.filter((s) => s !== subj)
      : [...selected, subj];
    onSave(next.length > 0 ? { subjects: sortByRotation(next, res.posBefore) } : null);
  };
  const rotation = res.posBefore != null ? rotationSubjects(res.posBefore).join(" ") : null;
  return (
    <div
      className="no-print"
      role="group"
      aria-label={`${fmtMD(week.date)} ${shortFuzokuGrade(grade)} の確認テスト`}
      style={{
        marginTop: 6,
        padding: "6px 10px",
        border: `1px solid ${colors.infoBorder}`,
        background: colors.infoSoft,
        borderRadius: 6,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: 12,
      }}
    >
      <b>
        {fmtMD(week.date)} {shortFuzokuGrade(grade)} の確認テスト:
      </b>
      {TEST_ROTATION.map((subj) => {
        const on = selected.includes(subj);
        return (
          <button
            key={subj}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(subj)}
            style={{ ...S.btn(on), padding: "3px 10px", fontSize: 12 }}
          >
            {subj}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={res.kind === "none"}
        onClick={() => onSave({ none: true })}
        style={{ ...S.btn(res.kind === "none"), padding: "3px 10px", fontSize: 12 }}
      >
        なし
      </button>
      {(res.kind === "manual" || res.kind === "none") && (
        <button
          type="button"
          onClick={() => onSave(null)}
          style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12 }}
        >
          自動に戻す
        </button>
      )}
      <span style={{ color: colors.inkMuted }}>
        {rotation
          ? `ローテーションでは「${rotation}」`
          : "ここで決めた週から、次の週以降は自動で回ります"}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="確認テストの編集を閉じる"
        style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12, marginLeft: "auto" }}
      >
        閉じる
      </button>
    </div>
  );
}

function WeekSection({
  week,
  grades,
  isAdmin,
  editingGrade,
  onEditTest,
  onPattern,
  onNote,
  onTest,
  onSelectDate,
  onEditDaySchedule,
  onAddDaySchedule,
}) {
  const dateLabel = `${fmtMD(week.date)} (${dateToDay(week.date) || ""})`;
  const badge = patternBadge(week);
  const custom = week.pattern.kind === PATTERN.CUSTOM;
  const note = week.note || {};
  const s = week.suggestion;
  const hasTable = week.anyHeld && week.rows.length > 0;
  const editingRes = isAdmin && editingGrade ? week.testRow?.cells[editingGrade] : null;
  // 授業の無い週に手で決めた確認テスト (後から休講などを入れた週)。表を
  // 出さないので、ここで見せないと気付けず・直せない
  const offDayTests =
    !hasTable && week.testRow
      ? grades
          .map((g) => [g, week.testRow.cells[g]])
          .filter(([, res]) => res && (res.kind === "manual" || res.kind === "none"))
      : [];

  return (
    <section
      className="fuzoku-week"
      aria-label={`${dateLabel} の予定`}
      style={{ ...S.panel, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{dateLabel}</span>
        <span style={chip(badge.bg, badge.fg)}>{badge.text}</span>
        {week.exams.map((ep) => (
          <span key={`ep-${ep.id}`} style={chip(EXAM_META.bg, EXAM_META.fg)}>
            📝 {ep.name}
            {!ep.stops && " (授業あり)"}
          </span>
        ))}
        {week.events.map((ev) => (
          <span key={`ev-${ev.id}`} style={chip("#efe6fa", "#5a3a8a")}>
            📣 {ev.name}
          </span>
        ))}
        {/* 学校メモ: 閲覧者は画面にも、管理者は紙面だけに (画面は入力欄) */}
        {(note.bus || note.memo) && (
          <span
            className={isAdmin ? "fuzoku-print-only" : undefined}
            style={{ fontSize: 12, color: colors.inkMuted }}
          >
            {note.bus && `🚌 ${note.bus}`}
            {note.bus && note.memo && " / "}
            {note.memo}
          </span>
        )}
        {onSelectDate && (
          <button
            type="button"
            className="no-print"
            onClick={() => onSelectDate(week.date)}
            title="この日のダッシュボードを開く"
            style={{ ...S.btn(false), padding: "2px 8px", fontSize: 11, marginLeft: "auto" }}
          >
            日別 →
          </button>
        )}
      </div>

      {isAdmin && (
        <div
          className="no-print"
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <div role="group" aria-label={`${dateLabel} の時程`} style={{ display: "inline-flex", gap: 4 }}>
            {PATTERN_BUTTONS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={week.pattern.kind === k}
                disabled={custom || !week.anyHeld}
                onClick={() => onPattern(week, k)}
                style={{
                  ...S.btn(week.pattern.kind === k),
                  padding: "4px 10px",
                  fontSize: 12,
                  opacity: custom || !week.anyHeld ? 0.5 : 1,
                  cursor: custom || !week.anyHeld ? "default" : "pointer",
                }}
              >
                {PATTERN_LABEL[k]}
              </button>
            ))}
          </div>
          {custom && onEditDaySchedule && (
            <button
              type="button"
              onClick={() => onEditDaySchedule(week.pattern.schedules[0].id)}
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 12 }}
            >
              ⏰ 特別時程で編集
            </button>
          )}
          {!custom && week.anyHeld && onAddDaySchedule && (
            <button
              type="button"
              onClick={() => onAddDaySchedule(week.date)}
              title="学年ごと・時間帯ごとに細かく決めるときは特別時程の画面で"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 11,
                color: colors.accentBlue,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              細かく設定…
            </button>
          )}
          <NoteInput
            value={note.bus}
            placeholder="バス (例: 15:20×2 15:30×1)"
            ariaLabel={`${dateLabel} のバス`}
            width={200}
            onCommit={(v) => onNote(week.date, { bus: v })}
          />
          <NoteInput
            value={note.memo}
            placeholder="学校メモ (例: 3時間授業)"
            ariaLabel={`${dateLabel} の学校メモ`}
            width={200}
            onCommit={(v) => onNote(week.date, { memo: v })}
          />
        </div>
      )}

      {/* 管理者はバス欄を保存するとこの行が出るので、高さを先に確保しておく
          (保存は blur = 次のクリックの mousedown で走る。その場で下の表が
          ずれると、押そうとしたボタンの click が失われる) */}
      {(isAdmin || (s && week.anyHeld)) && (
        <div className="no-print" style={{ fontSize: 12, color: colors.inkMuted, minHeight: 18 }}>
          {s && week.anyHeld && (
            <>
              🚌 {s.ref} 発を基準 → {SUGGESTION_TEXT[s.kind]}
              {s.others.length > 0 && ` (${s.others.join("・")} は別の便)`}
              {week.busAtOdds && (
                <b style={{ color: colors.accentRed, marginLeft: 8 }}>
                  ⚠ 今の時程 ({PATTERN_LABEL[week.pattern.kind]}) と食い違っています
                </b>
              )}
            </>
          )}
        </div>
      )}

      {!hasTable ? (
        <div
          style={{
            padding: "10px 12px",
            background: "#f3f3f6",
            border: cellBorder,
            borderRadius: 4,
            fontWeight: 700,
            color: "#555",
          }}
        >
          授業なし{week.allOffReason ? ` — ${week.allOffReason}` : ""}
          {offDayTests.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>
              確認テストの指定が残っています (休みの週なのでローテーションを進めます):{" "}
              {offDayTests.map(([g, res]) => (
                <span key={g} style={{ marginRight: 10 }}>
                  {shortFuzokuGrade(g)} {formatTestSubjects(res)}
                  {isAdmin && (
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => onEditTest(week.date, editingGrade === g ? null : g)}
                      aria-label={`${dateLabel} ${shortFuzokuGrade(g)} の確認テスト: ${formatTestSubjects(res)}`}
                      style={{ ...S.btn(false), padding: "1px 8px", fontSize: 11, marginLeft: 4 }}
                    >
                      変更
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            className="fuzoku-table"
            style={{ borderCollapse: "collapse", width: "100%", minWidth: 420, tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 104 }} />
              {grades.map((g) => (
                <col key={g} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle} scope="col">
                  限
                </th>
                <th style={thStyle} scope="col">
                  時刻
                </th>
                {grades.map((g) => (
                  <th key={g} style={thStyle} scope="col">
                    {shortFuzokuGrade(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.rows.map((r, i) => (
                <tr key={r.key}>
                  <th style={thStyle} scope="row">
                    {r.label}
                  </th>
                  <td style={{ ...tdStyle, fontSize: 12, whiteSpace: "nowrap" }}>{r.time}</td>
                  {grades.map((g) => {
                    if (week.gradeOff[g]) {
                      if (i > 0) return null;
                      return (
                        <td
                          key={g}
                          rowSpan={week.rows.length}
                          style={{
                            ...tdStyle,
                            background: "#f3f3f6",
                            color: "#555",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          休み
                          <div style={{ fontSize: 11, fontWeight: 400 }}>{week.gradeOff[g]}</div>
                        </td>
                      );
                    }
                    return <LessonCell key={g} entries={r.cells[g]} rowTime={r.time} />;
                  })}
                </tr>
              ))}
              {week.testRow && (
                <tr>
                  <th style={thStyle} scope="row">
                    確認テ
                  </th>
                  <td style={{ ...tdStyle, fontSize: 12, whiteSpace: "nowrap" }}>
                    {week.testRow.status === "held" ? week.testRow.time : week.testRow.reason || "—"}
                  </td>
                  {grades.map((g) => {
                    const res = week.testRow.cells[g];
                    const v = testCellView(res);
                    const editable = isAdmin && res;
                    const content = (
                      <span style={{ color: v.color, fontWeight: v.weight }}>
                        {v.text}
                        {res?.kind === "manual" && !res.held && (
                          <span style={{ fontSize: 10, color: colors.accentOrange }}> (休みの日)</span>
                        )}
                      </span>
                    );
                    return (
                      <td
                        key={g}
                        style={{
                          ...tdStyle,
                          background: editingGrade === g ? colors.infoSoft : undefined,
                        }}
                      >
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => onEditTest(week.date, editingGrade === g ? null : g)}
                            aria-label={`${dateLabel} ${shortFuzokuGrade(g)} の確認テスト: ${v.text || "なし"}`}
                            title={
                              res.kind === "manual"
                                ? "手で決めた科目 (クリックで変更)"
                                : "クリックで科目を決める"
                            }
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                              cursor: "pointer",
                              width: "100%",
                              textAlign: "left",
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingRes && (
        <TestEditor
          week={week}
          grade={editingGrade}
          res={editingRes}
          onSave={(entry) => onTest(week.date, editingGrade, entry)}
          onClose={() => onEditTest(week.date, null)}
        />
      )}

      {week.extras.length > 0 && (
        <div style={{ fontSize: 12, color: EXTRA_LESSON_META.fg }}>
          ➕ 追加授業:{" "}
          {week.extras
            .map((l) => `${l.time} ${shortFuzokuGrade(l.grade)} ${l.subj}${l.teacher ? ` (${l.teacher})` : ""}`)
            .join(" / ")}
        </div>
      )}
      {week.incoming.length > 0 && (
        <div style={{ fontSize: 12, color: colors.accentBlue }}>
          ↻ 他の日から振替:{" "}
          {week.incoming
            .map(
              ({ adj, slot }) =>
                `${adj.targetTime || slot.time} ${shortFuzokuGrade(slot.grade)} ${slot.subj} (${fmtMD(adj.date)} の分)`
            )
            .join(" / ")}
        </div>
      )}
      {week.conflicts.length > 0 && (
        <div className="no-print" style={{ fontSize: 12, color: colors.accentRed }}>
          {week.conflicts.map((c, i) => (
            <div key={i}>
              ⚠ {c.kind === "teacher" ? "講師" : "教室"} {c.value}: {c.a.grade} {c.a.subj} {c.aTime}
              {c.aRole === "sub" ? " (代行)" : ""} と {c.b.grade} {c.b.subj} {c.bTime}
              {c.bRole === "sub" ? " (代行)" : ""} が重なります
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FuzokuPlanView({
  slots = [],
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  timetables = [],
  displayCutoff = null,
  daySchedules = [],
  adjustments = [],
  classSets = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  extraLessons = [],
  subs = [],
  fuzokuPlan,
  onSaveFuzokuPlan,
  onSaveDaySchedules,
  isAdmin = false,
  onSelectDate,
  onEditDaySchedule,
  onAddDaySchedule,
}) {
  const toasts = useToasts();
  const todayStr = useToday();
  const today = useMemo(() => parseLocalDate(todayStr), [todayStr]);
  const todayYm = todayStr.slice(0, 7);
  const [ym, setYm] = useState(() => loadMonth(today));
  useEffect(() => {
    saveMonth(ym);
  }, [ym]);
  const [year, month] = ym.split("-").map(Number);
  const goPrev = () => setYm((c) => shiftYm(c, -1));
  const goNext = () => setYm((c) => shiftYm(c, 1));
  const goToday = () => setYm(todayYm);
  const pickMonth = (v) => {
    if (monthOffsetFromToday(v, today) != null) setYm(v);
  };
  useDateKeyNav({ onPrev: goPrev, onNext: goNext, onToday: goToday });

  // 確認テストを編集中のセル
  const [editing, setEditing] = useState(null); // {date, grade} | null

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

  const board = useMemo(
    () =>
      buildFuzokuMonth({
        year,
        month,
        slots,
        ctx: sessionCtx,
        specialEvents,
        extraLessons,
        subs,
        fuzokuPlan,
      }),
    [year, month, slots, sessionCtx, specialEvents, extraLessons, subs, fuzokuPlan]
  );

  // 時程の切り替えは特別時程のレコードを作る / 書き換える / 消す。
  // 消すのは cascade の無い単純削除なので removeWithUndo (CLAUDE.md の削除 UX)
  const removeWithUndo = useRemoveWithUndo({
    list: daySchedules,
    save: onSaveDaySchedules || (() => {}),
  });
  // この画面で消した特別時程の id は使い回さない。末尾の id を消した直後に
  // 別の週で足すと同じ id になり、消した方の「元に戻す」が効かなくなる
  // (useRemoveWithUndo は同じ id が既にあれば戻さない)
  const removedMaxIdRef = useRef(0);
  const handlePattern = (week, target) => {
    if (!onSaveDaySchedules) return;
    const md = `${fmtMD(week.date)} (${dateToDay(week.date) || ""})`;
    const plan = planPatternChange({
      current: week.pattern,
      target,
      grades: week.dayGrades,
      lessonTimes: week.lessonTimes,
    });
    if (plan.action === "add") {
      onSaveDaySchedules((prev) => [
        ...(prev || []),
        {
          id: Math.max(nextNumericId(prev || []), removedMaxIdRef.current + 1),
          date: week.date,
          ...plan.entry,
          createdAt: new Date().toISOString(),
        },
      ]);
      toasts.success(`${md} を${PATTERN_LABEL[target]}にしました`);
    } else if (plan.action === "update") {
      onSaveDaySchedules((prev) =>
        (prev || []).map((d) => (d.id === plan.id ? { ...d, ...plan.patch } : d))
      );
      toasts.success(`${md} を${PATTERN_LABEL[target]}にしました`);
    } else if (plan.action === "remove") {
      removedMaxIdRef.current = Math.max(removedMaxIdRef.current, Number(plan.id) || 0);
      removeWithUndo(plan.id, { successMsg: `${md} を通常の時程に戻しました` });
    } else if (plan.action === "blocked") {
      toasts.error(plan.reason);
    }
  };

  const handleNote = (date, patch) => {
    if (!onSaveFuzokuPlan) return;
    onSaveFuzokuPlan((prev) => setFuzokuNote(prev, date, patch));
  };
  const handleTest = (date, grade, entry) => {
    if (!onSaveFuzokuPlan) return;
    onSaveFuzokuPlan((prev) => setFuzokuTestEntry(prev, date, grade, entry));
  };

  const sum = board.summary;
  const summaryChips = [
    sum.compress > 0 && { text: `50分授業 ${sum.compress} 回`, ...DAY_SCHEDULE_META },
    sum.cutFirst > 0 && { text: `1限カット ${sum.cutFirst} 回`, ...DAY_SCHEDULE_META },
    sum.custom > 0 && { text: `個別の特別時程 ${sum.custom} 回`, ...DAY_SCHEDULE_META },
    sum.noClass > 0 && { text: `授業なし ${sum.noClass} 回`, bg: "#ececf0", fg: "#555" },
    sum.busAtOdds > 0 && {
      text: `⚠ バスと時程の食い違い ${sum.busAtOdds} 件`,
      bg: colors.dangerSoft,
      fg: colors.accentRed,
    },
    sum.busUnknown > 0 && {
      text: `要判断のバス ${sum.busUnknown} 件`,
      bg: colors.warningSoft,
      fg: "#8a6000",
    },
    sum.testUnset > 0 && {
      text: `確認テスト未設定 ${sum.testUnset} 週`,
      bg: colors.warningSoft,
      fg: "#8a6000",
    },
    sum.testOnOffDay > 0 && {
      text: `休みの週の確認テスト指定 ${sum.testOnOffDay} 件`,
      bg: colors.warningSoft,
      fg: "#8a6000",
    },
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{PRINT_CSS}</style>
      <div
        style={{
          ...S.panel,
          padding: "8px 12px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <MonthNav
          year={year}
          month={month}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onPick={pickMonth}
          isCurrent={ym === todayYm}
        />
        <PrintButton style={{ fontSize: 11, marginLeft: 4 }} />
        {/* 件数は保存のたびに変わるので 1 行に固定する (増えて折り返すと
            下の週がずれて、押そうとしたボタンの click が失われる) */}
        <div
          className="no-print"
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "nowrap",
            overflowX: "auto",
            flex: "1 1 240px",
            minWidth: 0,
            minHeight: 20,
            whiteSpace: "nowrap",
          }}
        >
          {summaryChips.map((c) => (
            <span key={c.text} style={chip(c.bg, c.fg)}>
              {c.text}
            </span>
          ))}
        </div>
      </div>

      <details className="no-print" style={{ fontSize: 12, color: colors.inkMuted }}>
        <summary style={{ cursor: "pointer" }}>この画面の使い方</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            バス欄には学校の予定表のバスをそのまま入れます。10 分差のような近い便は遅い方、
            1 時間離れた便は別の便として最初の便で判定し、15:30 までなら通常 (16:25 開始)、
            16:15 までなら 50分授業 (17:00 開始) を提案します (自動では切り替えません)。
          </li>
          <li>
            「50分授業」「1限カット」は特別時程として保存され、ダッシュボードやタイムテーブル
            にもそのまま反映されます。学年ごとに違う時程などは「細かく設定…」から特別時程の画面で。
          </li>
          <li>
            休み (休講・テスト期間・終講) は休講・テスト期間の画面の登録を読んで出しています。
          </li>
          <li>
            確認テストは、手で科目を決めた週から 英→数→国→理→社 の順に 2 科目ずつ自動で回ります。
            1 科目だけの週・実施なしの週もその週のセルで決められます。休みの週は進みません。
            新しい期 (時間割・開講日の切り替わり) は最初の週を手で決め直してください。
          </li>
        </ul>
      </details>

      {board.weeks.length === 0 ? (
        <div style={{ ...S.panel, padding: 16, color: colors.inkMuted }}>
          この月は附属の授業日がありません (学年「附中…」のコマが無いか、時間割の期間外です)。
        </div>
      ) : (
        board.weeks.map((w) => (
          <WeekSection
            key={w.date}
            week={w}
            grades={board.grades}
            isAdmin={isAdmin}
            editingGrade={editing?.date === w.date ? editing.grade : null}
            onEditTest={(date, grade) => setEditing(grade ? { date, grade } : null)}
            onPattern={handlePattern}
            onNote={handleNote}
            onTest={handleTest}
            onSelectDate={onSelectDate}
            onEditDaySchedule={onEditDaySchedule}
            onAddDaySchedule={onAddDaySchedule}
          />
        ))
      )}
    </div>
  );
}
