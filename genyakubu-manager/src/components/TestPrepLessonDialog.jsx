import { useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { ADJ_COLOR, DAY_COLOR as DC, gradeColor as GC } from "../data";
import { EXTRA_LESSON_COLOR } from "../constants/colors";
import { useSessionCtx } from "../hooks/useSessionCtx";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import { useToasts } from "../hooks/useToasts";
import { useToday } from "../hooks/useToday";
import { getSlotTeachers, splitTeacherField } from "../utils/biweekly";
import {
  dateToDay,
  fmtDate,
  fmtMDWeekday,
  isValidDateStr,
  normalizeTimeRange,
  parseLocalDate,
  timeRangeMinutes,
} from "../utils/dateHelpers";
import { buildDayOccupancy } from "../utils/dayReschedule";
import {
  describeRescheduleTarget,
  describeSlot,
  rescheduleRoom,
  rescheduleTeacherLabel,
} from "../utils/adjustmentDisplay";
import { isKameiRoom } from "../utils/scheduleHelpers";
import { activeTeachersOnDate } from "../utils/absenceHelpers";
import { stableStringify } from "../utils/stableStringify";
import { sortTeacherNames } from "../utils/teacherKana";
import {
  TEST_PREP_LABEL,
  applyTestPrepExtra,
  applyTestPrepReschedule,
  buildTestPrepExtraPlan,
  buildTestPrepReschedulePlan,
  collectCourseChanges,
  collectRoomNames,
  courseKeyOf,
  listCourseGrades,
  listCourseSchools,
  listCourseSlots,
  matchesCourseQuery,
  roomUsageAt,
  schoolOfSubj,
  suggestTimes,
  upcomingHeldDates,
} from "../utils/testPrepLessons";

// ─── テスト対策の振替・追加授業 ────────────────────────────────
// 「10/14 の高2 桜井 英語を 10/15 の 17:00-18:00 に別の教室で」のような
// テスト前の振替と追加授業を、コースを選ぶだけで登録するダイアログ。
// 作るのは既存の振替 (adjustments の reschedule) と追加授業 (extraLessons)
// なので、表示・一覧・解除は既存の経路に乗る (utils/testPrepLessons)。
//
// 画面の流れは「① コースを選ぶ → ② 振替 / 追加授業 → ③ 日付・時間・教室」。
// 登録してもダイアログは閉じない (テスト前は同じ学校の授業をまとめて動かす
// ので、続けて登録できるように)。登録はその場で保存して 6 秒の「元に戻す」。
// 下にはそのコース (学校・学年) の今日以降の振替・追加授業を並べ、直す / 消す
// ができる (削除は cascade が無いので removeWithUndo)。

const MODE_RESCHEDULE = "reschedule";
const MODE_EXTRA = "extra";

const EMPTY_RESCHED = {
  sourceDate: "",
  targetDate: "",
  time: "",
  room: "",
  teacher: "",
  memo: TEST_PREP_LABEL,
};
const EMPTY_EXTRA = {
  dates: [],
  time: "",
  room: "",
  teacher: "",
  label: TEST_PREP_LABEL,
  note: "",
};

// 「元に戻す」で消してよいのは、登録したものがそのまま残っているときだけ。
// id は「最大 + 1」で使い回されるので、id だけで消すと、その後に消して
// 登録し直した別の振替・追加授業を消してしまう
function sameRecord(a, b) {
  return a?.id === b?.id && stableStringify(a) === stableStringify(b);
}

function shiftDate(dateStr, n) {
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

const chip = (active, tone = colors.primary) => ({
  border: `1px solid ${active ? tone : "#ccc"}`,
  background: active ? tone : "#fff",
  color: active ? "#fff" : "#333",
  borderRadius: 14,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
});

const sectionTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#444",
  margin: "12px 0 6px",
};

const rowStyle = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };

function GradeBadge({ grade, cls }) {
  const gc = GC(grade);
  return (
    <span
      style={{
        background: gc.b,
        color: gc.f,
        borderRadius: 3,
        padding: "0 5px",
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {grade}
      {cls && cls !== "-" ? cls : ""}
    </span>
  );
}

function CourseRow({ slot, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.id)}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        border: "none",
        borderBottom: "1px solid #eee",
        background: selected ? "#eef3fb" : "#fff",
        boxShadow: selected ? `inset 3px 0 0 ${colors.primary}` : "none",
        cursor: "pointer",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          background: DC[slot.day] || "#666",
          color: "#fff",
          borderRadius: 3,
          padding: "0 5px",
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {slot.day}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{slot.time}</span>
      <GradeBadge grade={slot.grade} cls={slot.cls} />
      <span style={{ fontWeight: 700 }}>{slot.subj}</span>
      <span style={{ color: "#555" }}>{slot.teacher}</span>
      {slot.room && <span style={{ color: "#888" }}>@{slot.room}</span>}
    </button>
  );
}

// 教室の候補。その時間に空いている教室を先に、元の教室と同じ校舎 (本校 /
// 亀井町) を先に並べる。使用中の教室は既定で畳む (選べなくはしない — 重なりは
// 警告であって禁止ではない)。
function RoomPicker({ rooms, value, onChange, usage, originalRoom, usageKnown, idPrefix }) {
  const [showBusy, setShowBusy] = useState(false);
  const kamei = isKameiRoom(originalRoom || "");
  const ordered = useMemo(
    () =>
      [...rooms].sort(
        (a, b) => Number(isKameiRoom(a) !== kamei) - Number(isKameiRoom(b) !== kamei)
      ),
    [rooms, kamei]
  );
  const busy = ordered.filter((r) => usage.has(r));
  const shown = usageKnown && !showBusy ? ordered.filter((r) => !usage.has(r)) : ordered;
  return (
    <div>
      <div style={rowStyle}>
        <input
          id={`${idPrefix}-room`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={originalRoom ? `元の教室 (${originalRoom}) のまま` : "教室"}
          aria-label="教室"
          style={{ ...S.input, width: 160 }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px" }}
          >
            クリア
          </button>
        )}
        {usageKnown && value && usage.has(value.trim()) && (
          <span style={{ fontSize: 11, color: "#a02020" }}>
            ⚠ 使用中: {usage.get(value.trim())}
          </span>
        )}
      </div>
      {rooms.length > 0 && (
        <div style={{ ...rowStyle, marginTop: 6, gap: 4 }}>
          {usageKnown && (
            <span style={{ fontSize: 10, color: "#888", marginRight: 2 }}>
              {showBusy ? "教室:" : "空き:"}
            </span>
          )}
          {shown.map((r) => {
            const used = usage.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange(r === originalRoom ? "" : r)}
                title={used ? `使用中: ${usage.get(r)}` : r === originalRoom ? "元の教室" : undefined}
                aria-pressed={(value || originalRoom) === r}
                style={{
                  ...chip((value || originalRoom) === r),
                  padding: "1px 7px",
                  fontSize: 11,
                  ...(used && (value || originalRoom) !== r
                    ? { color: "#aaa", textDecoration: "line-through" }
                    : null),
                }}
              >
                {r}
                {r === originalRoom ? " (元)" : ""}
              </button>
            );
          })}
          {usageKnown && busy.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBusy((v) => !v)}
              style={{
                border: "none",
                background: "none",
                color: colors.primary,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {showBusy ? "空き教室だけにする" : `使用中も表示 (${busy.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TimePicker({ value, onChange, options, originalTime, previewTime, error, idPrefix, allowEmpty }) {
  return (
    <div>
      <div style={rowStyle}>
        <input
          id={`${idPrefix}-time`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowEmpty ? `元の時間 (${originalTime}) のまま` : "例: 17:00-18:00"}
          aria-label="時間"
          aria-invalid={error ? "true" : undefined}
          style={{ ...S.input, width: 170 }}
        />
        {previewTime && previewTime !== value.trim() && !error && (
          <span style={{ fontSize: 11, color: "#2a6a3a" }}>→ {previewTime}</span>
        )}
        {error && <span style={{ fontSize: 11, color: colors.danger }}>{error}</span>}
      </div>
      <div style={{ ...rowStyle, marginTop: 6, gap: 4 }}>
        {options.map((t) => {
          const isOriginal = t === originalTime;
          const active = isOriginal && allowEmpty ? !value.trim() : value.trim() === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(isOriginal && allowEmpty ? "" : t)}
              aria-pressed={active}
              style={{ ...chip(active), padding: "1px 7px", fontSize: 11 }}
            >
              {isOriginal ? `元の時間 ${t}` : t}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>
        「1700-1800」「１７：００〜１８：００」のようにも入れられます。開始だけ (17:00) なら、元の授業と同じ長さで終わりを補います
      </div>
    </div>
  );
}

function Problems({ conflicts, notes }) {
  if (conflicts.length === 0 && notes.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {conflicts.length > 0 && (
        <ul
          style={{
            background: "#fdf3f3",
            border: "1px solid #f0c0c0",
            borderRadius: 6,
            padding: "6px 8px 6px 24px",
            fontSize: 11,
            color: "#a02020",
            margin: "0 0 6px",
          }}
        >
          {conflicts.map((c, i) => (
            <li key={i}>
              ⚠ {c.date ? `${fmtMDWeekday(c.date)} ` : ""}
              {c.kind === "teacher" ? "講師が重なります" : "教室が重なります"}: {c.label}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul
          style={{
            background: "#fdf5e8",
            border: "1px solid #e0c080",
            borderRadius: 6,
            padding: "6px 8px 6px 24px",
            fontSize: 11,
            color: "#7a4a10",
            margin: 0,
          }}
        >
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 振替の担当は振替元の日の A/B で解く (rescheduleTeacherLabel。teacherCtx は
// {biweeklyAnchors, holidays, examPeriods})。教室は rescheduleRoom
function ChangeList({ items, onEdit, onRemove, isAdmin, editingKey, teacherCtx }) {
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "#888", padding: "6px 2px" }}>
        今日以降の振替・追加授業はありません
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff" }}>
      {items.map((item, i) => {
        const isResched = item.kind === "reschedule";
        const tone = isResched ? ADJ_COLOR.reschedule : EXTRA_LESSON_COLOR;
        const x = isResched ? item.slot : item.lesson;
        const room = isResched ? rescheduleRoom(item.adj, item.slot) : item.lesson.room;
        const teacher = isResched
          ? rescheduleTeacherLabel(item.adj, item.slot, teacherCtx)
          : item.lesson.teacher;
        const memo = isResched ? item.adj.memo : item.lesson.note;
        // 読み上げ名は 1 件ずつ違うように (同じコマの 9/7 と 9/14 を同じ日へ
        // 振り替えたとき・振替と追加授業が同じ日に並ぶとき)
        const label = isResched
          ? `${fmtMDWeekday(item.date)} ${describeSlot(x)} の振替 (${fmtMDWeekday(item.adj.date)} の分)`
          : `${fmtMDWeekday(item.date)} ${item.time} ${describeSlot(x)} の追加授業`;
        return (
          <div
            key={item.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              borderTop: i > 0 ? "1px solid #eee" : "none",
              background: editingKey === item.key ? "#fffbe6" : undefined,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: tone.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              {isResched ? "振替" : "追加"}
            </span>
            <b style={{ whiteSpace: "nowrap" }}>{fmtMDWeekday(item.date)}</b>
            <span style={{ whiteSpace: "nowrap" }}>{item.time}</span>
            <GradeBadge grade={x.grade} cls={x.cls} />
            <span style={{ fontWeight: 700 }}>{x.subj}</span>
            {teacher && <span style={{ color: "#555" }}>{teacher}</span>}
            {room && <span style={{ color: "#888" }}>@{room}</span>}
            {isResched && (
              <span style={{ color: "#888", fontSize: 11 }}>
                ← {fmtMDWeekday(item.adj.date)} {item.slot.time} の分
              </span>
            )}
            {memo && (
              <span style={{ color: "#888", fontSize: 11, fontStyle: "italic" }}>{memo}</span>
            )}
            {isAdmin && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label={`${label} を直す`}
                  title="上のフォームで直す"
                  style={S.iconBtn}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label={`${label} を取り消す`}
                  title="取り消す (6 秒間は元に戻せます)"
                  style={S.iconBtn}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TestPrepLessonDialog({
  slots = [],
  adjustments = [],
  extraLessons = [],
  subs = [],
  // 振替先・実施日に講師が他校舎へ出ている時間 (講師の重なりの警告に使う)
  offsiteLessons = [],
  // 実施判定 (休講・テスト期間・時間割の有効期間・表示期間・特別時程・隔週)
  // に要るデータ。日まるごと振替と同じく、開いている間だけ索引を組む。
  // sessionCtx を直接渡せばそちらを優先する (テスト用)
  holidays = [],
  examPeriods = [],
  timetables = [],
  displayCutoff = null,
  classSets = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  daySchedules = [],
  partTimeStaff = [],
  teacherKana = {},
  sessionCtx: sessionCtxProp = null,
  today: todayProp = null,
  saveAdjustments,
  saveExtraLessons,
  isAdmin = true,
  initialMode = MODE_RESCHEDULE,
  onClose,
}) {
  const toasts = useToasts();
  const todayHook = useToday();
  const today = todayProp || todayHook;
  const { sessionCtx: builtCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });
  const ctx = sessionCtxProp || builtCtx;

  const [mode, setMode] = useState(initialMode === MODE_EXTRA ? MODE_EXTRA : MODE_RESCHEDULE);
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [query, setQuery] = useState("");
  const [slotId, setSlotId] = useState(null);
  const [resched, setResched] = useState(EMPTY_RESCHED);
  const [extra, setExtra] = useState(EMPTY_EXTRA);
  // 一覧から直しているもの ({kind: "reschedule", adj, origin} / {kind: "extra", lesson})。
  // origin: "list" = 一覧の ✏️ から / "prefill" = 振替登録済みの日を選んで読み込んだ
  const [editing, setEditing] = useState(null);
  // 「元に戻す」を押した時点の一覧 (toast はこの描画より後に押される)
  const adjustmentsRef = useRef(adjustments);
  adjustmentsRef.current = adjustments;
  const extraLessonsRef = useRef(extraLessons);
  extraLessonsRef.current = extraLessons;

  const patchResched = (patch) => setResched((prev) => ({ ...prev, ...patch }));
  const patchExtra = (patch) => setExtra((prev) => ({ ...prev, ...patch }));

  // ── ① コース ──
  const courseSlots = useMemo(
    () => listCourseSlots({ slots, timetables, fromDate: today }),
    [slots, timetables, today]
  );
  const grades = useMemo(() => listCourseGrades(courseSlots), [courseSlots]);
  const schools = useMemo(
    () => (grade ? listCourseSchools(courseSlots, grade) : []),
    [courseSlots, grade]
  );
  const listing = Boolean(grade || query.trim());
  const filteredSlots = useMemo(() => {
    if (!listing) return [];
    return courseSlots.filter(
      (s) =>
        (!grade || s.grade === grade) &&
        (!school || schoolOfSubj(s.subj) === school) &&
        matchesCourseQuery(s, query)
    );
  }, [courseSlots, grade, school, query, listing]);
  const slot = useMemo(
    () => (slotId == null ? null : slots.find((s) => s.id === slotId) || null),
    [slots, slotId]
  );
  // 追加授業の型 = 選んだコマ。登録済みの追加授業を直すときはその追加授業
  const template = editing?.kind === "extra" ? editing.lesson : slot;

  const selectSlot = (id) => {
    const next = slots.find((s) => s.id === id) || null;
    setSlotId(id);
    setEditing(null);
    // 別のコースの時間・教室・担当を持ち越さない (前のコースの担当のまま
    // 黙って保存されていた)。振替先の日とメモは続けて使えるよう残す
    setResched((prev) => ({ ...EMPTY_RESCHED, targetDate: prev.targetDate, memo: prev.memo }));
    // 追加授業は担当・教室をコマから写す (直せる)
    patchExtra({
      teacher: next ? splitTeacherField(next.teacher).join("·") : "",
      room: "",
    });
  };

  const selectGrade = (g) => {
    setGrade((prev) => (prev === g ? "" : g));
    setSchool("");
  };

  // ── ② 振替元の日の候補 ──
  const heldDates = useMemo(
    () => (slot ? upcomingHeldDates(slot, { ctx, fromDate: today, count: 8 }) : []),
    [slot, ctx, today]
  );
  const existingBySource = useMemo(() => {
    const m = new Map();
    if (!slot) return m;
    for (const a of adjustments || []) {
      if (a?.type === "reschedule" && a.slotId === slot.id) m.set(a.date, a);
    }
    return m;
  }, [adjustments, slot]);

  // 振替元の日を選ぶ。その日のこのコマがすでに振替登録済みなら、振替先の
  // 日・時間・教室・担当・メモを読み込み、その振替を直す扱いにする (別の
  // 振替を直している途中でも、直す相手を読み込んだ方に切り替える。前の
  // 振替を黙って消さない)。読み込んだ振替から登録の無い日へ移ったら、
  // 読み込んだ値は持ち越さない
  const chooseSourceDate = (d) => {
    const ex = existingBySource.get(d);
    if (ex) {
      if (editing?.adj?.id === ex.id) {
        patchResched({ sourceDate: d });
        return;
      }
      setEditing({ kind: "reschedule", adj: ex, origin: "prefill" });
      setResched({
        sourceDate: d,
        targetDate: ex.targetDate,
        time: ex.targetTime || "",
        room: ex.targetRoom || "",
        teacher: ex.targetTeacher || "",
        memo: ex.memo || "",
      });
      return;
    }
    if (editing?.origin === "prefill") {
      setEditing(null);
      setResched({ ...EMPTY_RESCHED, sourceDate: d });
      return;
    }
    patchResched({ sourceDate: d });
  };

  // 振替元の日の担当 (隔週の B 週ならパートナー)。「元の担当のまま」の案内と
  // 登録の知らせに使う (講師欄の主担当をそのまま出さない)
  const fromTeacherLabel = useMemo(() => {
    if (!slot) return "";
    const d = resched.sourceDate;
    if (isValidDateStr(d || "") && dateToDay(d) === slot.day) {
      return activeTeachersOnDate(slot, d, ctx).join("·");
    }
    return slot.teacher || "";
  }, [slot, resched.sourceDate, ctx]);

  // ── プラン ──
  const editingAdjId = editing?.kind === "reschedule" ? editing.adj.id : null;
  const editingExtraId = editing?.kind === "extra" ? editing.lesson.id : null;
  const reschedPlan = useMemo(
    () =>
      buildTestPrepReschedulePlan({
        slots,
        adjustments,
        extraLessons,
        subs,
        offsiteLessons,
        slot,
        sourceDate: resched.sourceDate,
        targetDate: resched.targetDate,
        timeInput: resched.time,
        roomInput: resched.room,
        teacherInput: resched.teacher,
        editingAdjId,
        today,
        ctx,
      }),
    [slots, adjustments, extraLessons, subs, offsiteLessons, slot, resched, editingAdjId, today, ctx]
  );
  const extraPlan = useMemo(
    () =>
      buildTestPrepExtraPlan({
        slots,
        adjustments,
        extraLessons,
        subs,
        offsiteLessons,
        template,
        dates: extra.dates,
        timeInput: extra.time,
        roomInput: extra.room,
        teacherInput: extra.teacher,
        label: extra.label,
        note: extra.note,
        editingId: editingExtraId,
        today,
        ctx,
      }),
    [slots, adjustments, extraLessons, subs, offsiteLessons, template, extra, editingExtraId, today, ctx]
  );

  // ── 時間・教室の候補 (振替先 / 実施日の塞がり) ──
  const isResched = mode === MODE_RESCHEDULE;
  const timeInput = isResched ? resched.time : extra.time;
  const normalizedTime = normalizeTimeRange(timeInput, {
    durationMin: timeRangeMinutes(template?.time),
  });
  const effectiveTime = normalizedTime.ok
    ? normalizedTime.time || (isResched ? slot?.time || "" : "")
    : "";
  const usageDate = isResched
    ? resched.targetDate
    : extra.dates.length === 1
      ? extra.dates[0]
      : "";
  const occupancy = useMemo(() => {
    if (!isValidDateStr(usageDate || "")) return [];
    const skipAdj = new Set();
    if (isResched && slot) {
      for (const a of adjustments || []) {
        if (
          a?.type === "reschedule" &&
          ((a.date === resched.sourceDate && a.slotId === slot.id) || a.id === editingAdjId)
        ) {
          skipAdj.add(a.id);
        }
      }
    }
    return buildDayOccupancy({
      slots,
      dateStr: usageDate,
      adjustments: (adjustments || []).filter((a) => !skipAdj.has(a?.id)),
      extraLessons: (extraLessons || []).filter((l) => l?.id !== editingExtraId),
      subs,
      offsiteLessons,
      ctx,
    });
  }, [usageDate, isResched, slot, adjustments, resched.sourceDate, editingAdjId, slots, extraLessons, subs, offsiteLessons, editingExtraId, ctx]);
  const usage = useMemo(() => roomUsageAt(occupancy, effectiveTime), [occupancy, effectiveTime]);
  const usageKnown = Boolean(isValidDateStr(usageDate || "") && effectiveTime);
  const rooms = useMemo(
    () => collectRoomNames(slots, extraLessons, adjustments),
    [slots, extraLessons, adjustments]
  );
  const timeOptions = useMemo(() => {
    const date = isResched ? resched.targetDate : extra.dates[0];
    return template ? suggestTimes({ slots, slot: template, dateStr: date, timetables }) : [];
  }, [isResched, resched.targetDate, extra.dates, template, slots, timetables]);
  const teacherOptions = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const t of getSlotTeachers(s)) set.add(t);
    for (const p of partTimeStaff || []) if (p?.name) set.add(p.name);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);

  // ── 下の一覧: コース → 学校 → 学年 の範囲の振替・追加授業 ──
  const matchCourse = useMemo(() => {
    if (template) {
      const key = courseKeyOf(template);
      return (x) => courseKeyOf(x) === key;
    }
    if (grade) {
      return (x) => x.grade === grade && (!school || schoolOfSubj(x.subj) === school);
    }
    return null;
  }, [template, grade, school]);
  const changes = useMemo(
    () =>
      matchCourse
        ? collectCourseChanges({ adjustments, extraLessons, slots, matchCourse, fromDate: today })
        : [],
    [matchCourse, adjustments, extraLessons, slots, today]
  );
  const scopeLabel = template
    ? describeSlot(template)
    : grade
      ? `${grade}${school ? ` ${school}` : ""}`
      : "";

  const editingKey =
    editing?.kind === "reschedule"
      ? `rs:${editing.adj.id}`
      : editing?.kind === "extra"
        ? `extra:${editing.lesson.id}`
        : null;

  // ── 保存 ──
  const removeAdjWithUndo = useRemoveWithUndo({ list: adjustments, save: saveAdjustments });
  const removeExtraWithUndo = useRemoveWithUndo({ list: extraLessons, save: saveExtraLessons });

  const plan = isResched ? reschedPlan : extraPlan;
  const canSubmit = isAdmin && plan.errors.length === 0;
  const touched = isResched
    ? Boolean(slot && (resched.sourceDate || resched.targetDate))
    : Boolean(template && (extra.dates.length > 0 || extra.time));

  const registerReschedule = () => {
    const captured = { added: null, removed: [] };
    const memo = resched.memo;
    saveAdjustments((prev) => {
      const res = applyTestPrepReschedule({ adjustments: prev || [], plan: reschedPlan, memo });
      captured.added = res.added;
      captured.removed = res.removed;
      return res.next;
    });
    const target = describeRescheduleTarget(
      { ...reschedPlan.record },
      { originalTeacher: reschedPlan.fromTeachers.join("·"), originalRoom: slot.room }
    );
    toasts.push(
      `${editingAdjId != null ? "振替を直しました" : "振替を登録しました"}: ${fmtMDWeekday(
        resched.sourceDate
      )} ${describeSlot(slot)} → ${target}`,
      {
        tone: "success",
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () => {
            const added = captured.added;
            // 登録した振替がその後に直された / 消されたなら戻さない (置き換えた
            // 振替だけを戻すと、同じ日の同じコマに振替が 2 件できる)
            if (!added || !(adjustmentsRef.current || []).some((a) => sameRecord(a, added))) {
              toasts.info("その後に変更されているので、元に戻しませんでした");
              return;
            }
            saveAdjustments((prev) => {
              const list = prev || [];
              if (!list.some((a) => sameRecord(a, added))) return list;
              const rest = list.filter((a) => !sameRecord(a, added));
              const present = new Set(rest.map((a) => a.id));
              return [...rest, ...captured.removed.filter((a) => !present.has(a.id))];
            });
          },
        },
      }
    );
    // 登録したら入力を初めの状態に戻す (前の振替の時間・教室・担当を次の登録に
    // 持ち越さない)
    setEditing(null);
    setResched(EMPTY_RESCHED);
  };

  const registerExtra = () => {
    const captured = { added: [], updated: null, before: null };
    saveExtraLessons((prev) => {
      const res = applyTestPrepExtra({ extraLessons: prev || [], plan: extraPlan });
      captured.added = res.added;
      captured.updated = res.updated;
      captured.before = res.before;
      return res.next;
    });
    const n = extraPlan.records.length;
    toasts.push(
      editingExtraId != null
        ? `追加授業を直しました: ${fmtMDWeekday(extraPlan.records[0].date)} ${describeSlot(template)}`
        : `追加授業を ${n} 件登録しました: ${describeSlot(template)} ${extraPlan.time}`,
      {
        tone: "success",
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () => {
            const current = extraLessonsRef.current || [];
            if (captured.updated) {
              if (!current.some((l) => sameRecord(l, captured.updated))) {
                toasts.info("その後に変更されているので、元に戻しませんでした");
                return;
              }
              saveExtraLessons((prev) =>
                (prev || []).map((l) => (sameRecord(l, captured.updated) ? captured.before : l))
              );
              return;
            }
            if (!captured.added.some((a) => current.some((l) => sameRecord(l, a)))) {
              toasts.info("その後に変更されているので、元に戻しませんでした");
              return;
            }
            saveExtraLessons((prev) =>
              (prev || []).filter((l) => !captured.added.some((a) => sameRecord(l, a)))
            );
          },
        },
      }
    );
    if (editingExtraId != null) setEditing(null);
    patchExtra({ dates: [] });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isResched) registerReschedule();
    else registerExtra();
  };

  const startEdit = (item) => {
    if (item.kind === "reschedule") {
      const { adj, slot: s } = item;
      setMode(MODE_RESCHEDULE);
      setGrade(s.grade);
      setSchool(schoolOfSubj(s.subj));
      setSlotId(s.id);
      setEditing({ kind: "reschedule", adj, origin: "list" });
      setResched({
        sourceDate: adj.date,
        targetDate: adj.targetDate,
        time: adj.targetTime || "",
        room: adj.targetRoom || "",
        teacher: adj.targetTeacher || "",
        memo: adj.memo || "",
      });
    } else {
      const { lesson } = item;
      setMode(MODE_EXTRA);
      setEditing({ kind: "extra", lesson });
      setExtra({
        dates: [lesson.date],
        time: lesson.time || "",
        room: lesson.room || "",
        teacher: lesson.teacher || "",
        label: lesson.label || "",
        note: lesson.note || "",
      });
    }
  };

  const removeItem = (item) => {
    if (editingKey === item.key) setEditing(null);
    if (item.kind === "reschedule") {
      const { adj, slot: s } = item;
      // 振替元の日の「振替に伴う skip」の回数補正は消さない (欠勤組み換えの
      // 振替の取り消しと同じ)。残ることは黙らずに知らせる
      const skipLeft = (sessionOverrides || []).some(
        (o) => o.date === adj.date && o.slotId === adj.slotId && o.mode === "skip"
      );
      removeAdjWithUndo(adj.id, {
        successMsg: `振替を取り消しました (${fmtMDWeekday(adj.date)} ${describeSlot(s)})${
          skipLeft ? ` / ${fmtMDWeekday(adj.date)} の回数補正「カウント外」は残っています` : ""
        }`,
      });
    } else {
      const { lesson } = item;
      removeExtraWithUndo(lesson.id, {
        successMsg: `追加授業を削除しました (${fmtMDWeekday(lesson.date)} ${describeSlot(lesson)})`,
      });
    }
  };

  const conflicts = isResched
    ? reschedPlan.conflicts
    : extraPlan.conflictsByDate.flatMap(({ date, conflicts: list }) =>
        list.map((c) => ({ ...c, date }))
      );
  const notes = plan.errors.length === 0 ? plan.notes : [];
  const submitLabel = isResched
    ? editingAdjId != null
      ? "振替を直す"
      : "↻ 振替を登録"
    : editingExtraId != null
      ? "追加授業を直す"
      : `➕ 追加授業を${extraPlan.records.length > 1 ? ` ${extraPlan.records.length} 件` : ""}登録`;

  return (
    <Modal title="🎯 テスト対策の振替・追加授業" onClose={onClose} width="min(760px, 96vw)">
      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7, marginBottom: 4 }}>
        コースを選んで、振替 (その日の授業を別の日・時間・教室へ) か追加授業を登録します。
        登録した振替・追加授業はダッシュボード・タイムテーブル・月間などにそのまま出ます。
      </div>

      {/* ① コース */}
      <div style={sectionTitle}>① コース</div>
      <div style={{ ...rowStyle, marginBottom: 6 }}>
        {grades.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => selectGrade(g)}
            aria-pressed={grade === g}
            style={chip(grade === g)}
          >
            {g}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索 (例: 高2 桜井 英語)"
          aria-label="コースを検索"
          style={{ ...S.input, width: 200, padding: "5px 8px", fontSize: 12 }}
        />
      </div>
      {schools.length > 0 && (
        <div style={{ ...rowStyle, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#888" }}>学校:</span>
          <button
            type="button"
            onClick={() => setSchool("")}
            aria-pressed={!school}
            style={{ ...chip(!school, "#555"), fontSize: 11, padding: "2px 8px" }}
          >
            すべて
          </button>
          {schools.map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setSchool((prev) => (prev === sc ? "" : sc))}
              aria-pressed={school === sc}
              style={{ ...chip(school === sc, "#555"), fontSize: 11, padding: "2px 8px" }}
            >
              {sc}
            </button>
          ))}
        </div>
      )}
      {editing?.kind === "extra" ? (
        <div style={{ fontSize: 12, padding: "6px 8px", background: "#f7f7fa", borderRadius: 6 }}>
          追加授業 <b>{describeSlot(editing.lesson)}</b> を直しています
        </div>
      ) : !listing ? (
        <div style={{ fontSize: 11, color: "#888" }}>
          学年を選ぶか、検索してください
        </div>
      ) : filteredSlots.length === 0 ? (
        <div style={{ fontSize: 11, color: "#888" }}>当てはまるコマがありません</div>
      ) : (
        <div
          role="list"
          aria-label="コース"
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {filteredSlots.map((s) => (
            <div role="listitem" key={s.id}>
              <CourseRow slot={s} selected={s.id === slotId} onSelect={selectSlot} />
            </div>
          ))}
        </div>
      )}

      {/* ② 何をするか */}
      <div style={sectionTitle}>② 何をするか</div>
      <div style={rowStyle} role="group" aria-label="何をするか">
        <button
          type="button"
          onClick={() => {
            setMode(MODE_RESCHEDULE);
            if (editing?.kind === "extra") setEditing(null);
          }}
          aria-pressed={isResched}
          style={chip(isResched, ADJ_COLOR.reschedule.color)}
        >
          ↻ 振替する (その日の授業を移す)
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(MODE_EXTRA);
            if (editing?.kind === "reschedule") setEditing(null);
          }}
          aria-pressed={!isResched}
          style={chip(!isResched, EXTRA_LESSON_COLOR.color)}
        >
          ➕ 追加授業を登録する
        </button>
      </div>

      {/* ③ 日付・時間・教室 */}
      {isResched ? (
        <div>
          <div style={sectionTitle}>③ 振替元の日</div>
          {!slot ? (
            <div style={{ fontSize: 11, color: "#888" }}>先にコースを選んでください</div>
          ) : (
            <div style={rowStyle}>
              {heldDates.map((d) => {
                const ex = existingBySource.get(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => chooseSourceDate(d)}
                    aria-pressed={resched.sourceDate === d}
                    title={ex ? `振替登録済み: → ${describeRescheduleTarget(ex)}` : undefined}
                    style={chip(resched.sourceDate === d, ADJ_COLOR.reschedule.color)}
                  >
                    {fmtMDWeekday(d)}
                    {ex ? ` ↻${describeRescheduleTarget(ex, { short: true }).split(" ")[0]}` : ""}
                  </button>
                );
              })}
              <label style={{ fontSize: 11, color: "#666", display: "inline-flex", gap: 4, alignItems: "center" }}>
                ほかの日:
                <input
                  type="date"
                  value={heldDates.includes(resched.sourceDate) ? "" : resched.sourceDate}
                  onChange={(e) => chooseSourceDate(e.target.value)}
                  aria-label="振替元の日"
                  style={{ ...S.input, width: "auto", padding: "4px 6px", fontSize: 12 }}
                />
              </label>
            </div>
          )}

          <div style={sectionTitle}>④ 振替先</div>
          <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: "8px 8px", alignItems: "start" }}>
            <label htmlFor="testprep-rs-date" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              日付
            </label>
            <div style={rowStyle}>
              <input
                id="testprep-rs-date"
                type="date"
                value={resched.targetDate}
                onChange={(e) => patchResched({ targetDate: e.target.value })}
                aria-label="振替先の日"
                style={{ ...S.input, width: "auto" }}
              />
              {isValidDateStr(resched.sourceDate || "") &&
                [
                  ["前日", -1],
                  ["翌日", 1],
                ].map(([label, n]) => {
                  const d = shiftDate(resched.sourceDate, n);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => patchResched({ targetDate: d })}
                      aria-pressed={resched.targetDate === d}
                      style={{ ...chip(resched.targetDate === d), fontSize: 11 }}
                    >
                      {label} {fmtMDWeekday(d)}
                    </button>
                  );
                })}
              {resched.targetDate && dateToDay(resched.targetDate) == null && (
                <span style={{ fontSize: 11, color: "#a06010" }}>振替先は日曜日です</span>
              )}
            </div>
            <label htmlFor="testprep-rs-time" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              時間
            </label>
            <TimePicker
              idPrefix="testprep-rs"
              value={resched.time}
              onChange={(v) => patchResched({ time: v })}
              options={timeOptions}
              originalTime={slot?.time || ""}
              previewTime={normalizedTime.ok ? normalizedTime.time : ""}
              error={normalizedTime.ok ? "" : normalizedTime.error}
              allowEmpty
            />
            <label htmlFor="testprep-rs-room" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              教室
            </label>
            <RoomPicker
              idPrefix="testprep-rs"
              rooms={rooms}
              value={resched.room}
              onChange={(v) => patchResched({ room: v })}
              usage={usage}
              usageKnown={usageKnown}
              originalRoom={(slot?.room || "").trim()}
            />
            <label htmlFor="testprep-rs-teacher" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              担当
            </label>
            <div>
              <input
                id="testprep-rs-teacher"
                type="text"
                value={resched.teacher}
                onChange={(e) => patchResched({ teacher: e.target.value })}
                placeholder={slot ? `元の担当 (${fromTeacherLabel || "未設定"}) のまま` : "担当"}
                aria-label="振替先の担当"
                list="testprep-teachers"
                style={{ ...S.input, width: 220 }}
              />
            </div>
            <label htmlFor="testprep-rs-memo" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              メモ
            </label>
            <input
              id="testprep-rs-memo"
              type="text"
              value={resched.memo}
              onChange={(e) => patchResched({ memo: e.target.value })}
              aria-label="メモ"
              style={{ ...S.input, maxWidth: 320 }}
            />
          </div>
        </div>
      ) : (
        <div>
          <div style={sectionTitle}>③ 実施日{editingExtraId != null ? "" : " (複数可)"}</div>
          <div style={rowStyle}>
            {extra.dates.map((d) => (
              <span
                key={d}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 4px 2px 10px",
                  borderRadius: 12,
                  background: EXTRA_LESSON_COLOR.bg,
                  color: EXTRA_LESSON_COLOR.deep,
                  border: `1px solid ${EXTRA_LESSON_COLOR.color}`,
                }}
              >
                {fmtMDWeekday(d)}
                <button
                  type="button"
                  onClick={() => patchExtra({ dates: extra.dates.filter((x) => x !== d) })}
                  aria-label={`実施日 ${d} を外す`}
                  style={{
                    border: "none",
                    background: EXTRA_LESSON_COLOR.color,
                    color: "#fff",
                    borderRadius: "50%",
                    width: 16,
                    height: 16,
                    lineHeight: "14px",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {(editingExtraId == null || extra.dates.length === 0) && (
              <input
                type="date"
                value=""
                onChange={(e) => {
                  const d = e.target.value;
                  if (!isValidDateStr(d) || extra.dates.includes(d)) return;
                  patchExtra({ dates: [...extra.dates, d].sort() });
                }}
                aria-label="実施日を追加"
                style={{ ...S.input, width: "auto", padding: "4px 6px", fontSize: 12 }}
              />
            )}
            <span style={{ fontSize: 10, color: "#888" }}>
              日付を選ぶと追加されます
            </span>
          </div>

          <div style={sectionTitle}>④ 時間・教室・担当</div>
          <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: "8px 8px", alignItems: "start" }}>
            <label htmlFor="testprep-ex-time" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              時間
            </label>
            <TimePicker
              idPrefix="testprep-ex"
              value={extra.time}
              onChange={(v) => patchExtra({ time: v })}
              options={timeOptions}
              originalTime={template?.time || ""}
              previewTime={normalizedTime.ok ? normalizedTime.time : ""}
              error={normalizedTime.ok ? "" : normalizedTime.error}
            />
            <label htmlFor="testprep-ex-room" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              教室
            </label>
            <RoomPicker
              idPrefix="testprep-ex"
              rooms={rooms}
              value={extra.room}
              onChange={(v) => patchExtra({ room: v })}
              usage={usage}
              usageKnown={usageKnown}
              originalRoom=""
            />
            <label htmlFor="testprep-ex-teacher" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              担当
            </label>
            <input
              id="testprep-ex-teacher"
              type="text"
              value={extra.teacher}
              onChange={(e) => patchExtra({ teacher: e.target.value })}
              aria-label="追加授業の担当"
              list="testprep-teachers"
              style={{ ...S.input, width: 220 }}
            />
            <label htmlFor="testprep-ex-label" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              種別
            </label>
            <input
              id="testprep-ex-label"
              type="text"
              value={extra.label}
              onChange={(e) => patchExtra({ label: e.target.value })}
              aria-label="種別"
              style={{ ...S.input, width: 160 }}
            />
            <label htmlFor="testprep-ex-note" style={{ fontSize: 12, fontWeight: 700, paddingTop: 6 }}>
              メモ
            </label>
            <input
              id="testprep-ex-note"
              type="text"
              value={extra.note}
              onChange={(e) => patchExtra({ note: e.target.value })}
              aria-label="メモ"
              style={{ ...S.input, maxWidth: 320 }}
            />
          </div>
        </div>
      )}
      <datalist id="testprep-teachers">
        {teacherOptions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <Problems conflicts={plan.errors.length === 0 ? conflicts : []} notes={notes} />

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: S.card.background,
          borderTop: "1px solid #eee",
          padding: "8px 0",
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: touched && plan.errors.length > 0 ? "#a06010" : "#888", flex: 1, minWidth: 160 }}>
          {plan.errors.length > 0
            ? plan.errors[0]
            : conflicts.length > 0
              ? (
                <b style={{ color: "#a02020" }}>
                  ⚠ 講師・教室の重なりが {conflicts.length} 件あります (上に表示。このまま登録もできます)
                </b>
              )
              : isResched
              ? "第N回は振替元の日付で数えたままです (回数は増減しません)"
              : "追加授業は第N回に数えません"}
        </span>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              if (editing.kind === "extra") patchExtra({ dates: [] });
            }}
            style={S.btn(false)}
          >
            直すのをやめる
          </button>
        )}
        <button type="button" onClick={onClose} style={S.btn(false)}>
          閉じる
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            ...S.btn(true),
            background: isResched ? ADJ_COLOR.reschedule.color : EXTRA_LESSON_COLOR.color,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitLabel}
        </button>
      </div>

      {scopeLabel && (
        <div>
          <div style={sectionTitle}>
            {scopeLabel} の振替・追加授業 (今日以降)
          </div>
          <ChangeList
            items={changes}
            onEdit={startEdit}
            onRemove={removeItem}
            isAdmin={isAdmin}
            editingKey={editingKey}
            teacherCtx={{ biweeklyAnchors, holidays, examPeriods }}
          />
        </div>
      )}
    </Modal>
  );
}
