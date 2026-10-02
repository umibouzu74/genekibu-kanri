import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_COLOR as DC, OFFSITE_LESSON_COLOR as OC } from "../../constants/colors";
import { WEEKDAYS } from "../../constants/schools";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { PrintButton } from "../PrintButton";
import { S, colors } from "../../styles/common";
import { splitTeacherField } from "../../utils/biweekly";
import { nextNumericId } from "../../utils/schema";
import { compareTeacherNames, sortTeacherNames } from "../../utils/teacherKana";
import { compareJa } from "../../utils/sortJa";
import { fmtDate, fmtDateWeekday, fmtMD, parseLocalDate } from "../../utils/dateHelpers";
import { isFullDayHoliday } from "../../utils/scheduleHelpers";
import {
  MAX_TRAVEL_MINUTES,
  OFFSITE_DAYS,
  addOffsiteLessons,
  addOffsiteSkipRange,
  describeOffsite,
  draftFromOffsite,
  emptyOffsiteDraft,
  formatOffsiteDays,
  formatOffsitePeriod,
  formatOffsiteTime,
  knownOffsitePlaces,
  knownOffsiteTimes,
  listOffsiteDates,
  nextOffsiteDate,
  normalizeOffsiteTime,
  offsiteLessonsOnDate,
  offsiteStatus,
  offsiteTimeRange,
  toggleOffsiteSkipDate,
  updateOffsiteLesson,
  validateOffsiteDraft,
} from "../../utils/offsiteLessons";

// ─── 他校舎の授業 ───────────────────────────────────────────────────
// 講師が別の校舎・学校で授業をする「曜日 × 時刻 × 期間」を登録する画面
// (utils/offsiteLessons)。登録した予定は講師別の月間 / 週間・日別
// ダッシュボード・タイムテーブル・代行候補に「その時間は他校舎」として出る。
//
// パッと登録できるように:
//   - 講師は「石原・片岡」のように複数書ける (1 人 1 件で作る)
//   - 登録後も行き先・曜日・時間・期間・メモは残す (講師だけ入れ替えて続けて
//     登録できる。同じ行き先へ何人も行くのが普通なので)
//   - 行き先・時間はこれまでの入力をボタンで出す (五十音 / 開始時刻順。
//     使用頻度では並べない — CLAUDE.md A18)
//   - 終了日・終了時刻は空欄 = 未定のまま登録できる (後から編集で入れる)
// 休みの日は一覧の「📅 日程」で日付ごとに切り替え、冬休みのような期間は
// まとめて休みにできる。塾の全体休講日 (祝日など) は既定で休み。
//
// 削除は cascade 無しなので removeWithUndo (CLAUDE.md の削除 UX ルール)。
// 印刷系統: PrintButton (window.print())。入力欄と操作ボタンは no-print。

const STATUS_META = {
  active: { label: "実施中", bg: "#e0f2e4", fg: "#2a7a4a" },
  upcoming: { label: "これから", bg: "#eef2ff", fg: "#1a1a6e" },
  ended: { label: "終了", bg: "#eeeeee", fg: "#777" },
};
const STATUS_RANK = { active: 0, upcoming: 1, ended: 2 };

const FILTERS = [
  { key: "current", label: "実施中・これから" },
  { key: "ended", label: "終了" },
  { key: "all", label: "すべて" },
];

// 「📅 日程」に出す範囲: 今月の頭 (開始がそれより後なら開始) から、終了日
// (未定なら 4 か月先の月末) まで
const DATES_AHEAD_MONTHS = 4;

const fieldRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 10,
};
const fieldLabel = { fontSize: 12, fontWeight: 700, minWidth: 56 };
const hint = { fontSize: 11, color: colors.inkSubtle };

const chipBtn = (selected) => ({
  border: `1px solid ${selected ? OC.color : "#ccc"}`,
  background: selected ? OC.color : "#fff",
  color: selected ? "#fff" : "#444",
  borderRadius: 14,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

function monthStartOf(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function monthEndAfter(dateStr, months) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + months + 1, 0));
}

function mondayOf(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  const diff = (d.getDay() + 6) % 7; // 月 = 0
  d.setDate(d.getDate() - diff);
  return fmtDate(d);
}

// 「今週」の月曜。日曜は終わった週ではなく明日からの週を出す (週間ビューと同じ)
function thisWeekMonday(todayStr) {
  const d = parseLocalDate(todayStr);
  return d && d.getDay() === 0 ? shiftDays(todayStr, 1) : mondayOf(todayStr);
}

function shiftDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function weekdayOf(dateStr) {
  const d = parseLocalDate(dateStr);
  return d ? WEEKDAYS[d.getDay()] : "";
}

/**
 * @param {object} props
 * @param {import("../../types").OffsiteLesson[]} props.offsiteLessons
 * @param {(next: import("../../types").OffsiteLesson[]) => void} props.onSave
 * @param {boolean} props.isAdmin
 * @param {import("../../types").Holiday[]} [props.holidays]
 * @param {string[]} [props.teacherNames] 時間割・バイトに出てくる講師名 (入力候補)
 * @param {Record<string, string>} [props.teacherKana]
 * @param {{id?: number, teacher?: string, token: number} | null} [props.focusRequest]
 *   外 (月間・週間・ダッシュボード・Cmd+K) からの要求。id = その 1 件を開く
 *   (管理者は編集、閲覧者は強調)、teacher = その講師で新規登録を始める
 * @param {() => void} [props.onConsumeFocus]
 * @param {(teacher: string) => void} [props.onSelectTeacher] 講師名 → その人の月間
 */
export function OffsiteLessonView({
  offsiteLessons = [],
  onSave,
  isAdmin,
  holidays = [],
  teacherNames = [],
  teacherKana = {},
  focusRequest = null,
  onConsumeFocus,
  onSelectTeacher,
}) {
  const today = useToday();
  const toasts = useToasts();
  const confirm = useConfirm();
  const formRef = useRef(null);
  const teacherInputRef = useRef(null);
  const [draft, setDraft] = useState(() => emptyOffsiteDraft(today));
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null); // {field, error}
  // 直前に登録した講師 (「続けて登録できます」の案内用)
  const [lastAdded, setLastAdded] = useState(null);
  const [filter, setFilter] = useState("current");
  const [openDatesId, setOpenDatesId] = useState(null);
  const [skipRange, setSkipRange] = useState({ from: "", to: "" });
  const [highlightId, setHighlightId] = useState(null);
  const [weekBase, setWeekBase] = useState(() => thisWeekMonday(today));

  const removeWithUndo = useRemoveWithUndo({ list: offsiteLessons, save: onSave });
  const cmpTeacher = useMemo(() => compareTeacherNames(teacherKana), [teacherKana]);

  const places = useMemo(() => knownOffsitePlaces(offsiteLessons), [offsiteLessons]);
  const times = useMemo(() => knownOffsiteTimes(offsiteLessons), [offsiteLessons]);
  const knownTeachers = useMemo(() => new Set(teacherNames), [teacherNames]);
  const timePreview = draft.time.trim() ? normalizeOffsiteTime(draft.time) : null;

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (error) setError(null);
  };
  const toggleDay = (d) =>
    set("days", draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d]);

  const scrollToForm = () => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      teacherInputRef.current?.focus?.();
    });
  };

  const resetForm = () => {
    setDraft(emptyOffsiteDraft(today));
    setEditId(null);
    setError(null);
    setLastAdded(null);
  };

  const startEdit = (rec) => {
    setDraft(draftFromOffsite(rec));
    setEditId(rec.id);
    setError(null);
    setLastAdded(null);
    scrollToForm();
  };

  // 一覧の 1 件をフォームへ写して新規登録にする (講師だけ空ける)
  const copyToForm = (rec) => {
    setDraft({ ...draftFromOffsite(rec), teacher: "" });
    setEditId(null);
    setError(null);
    setLastAdded(null);
    scrollToForm();
    toasts.info("内容をフォームに写しました。講師を入れて登録してください");
  };

  // 編集中の内容を保存せずに捨てることになるか (外からの要求で上書きする前に聞く)
  const editingDirty = () => {
    if (editId == null) return false;
    const rec = offsiteLessons.find((r) => r.id === editId);
    return !!rec && JSON.stringify(draftFromOffsite(rec)) !== JSON.stringify(draft);
  };

  // 外からの要求 (月間カードのクリック・「＋ 他校舎の授業」・Cmd+K)
  useEffect(() => {
    if (!focusRequest) return;
    const req = focusRequest;
    onConsumeFocus?.();
    (async () => {
      if (isAdmin && editingDirty()) {
        const ok = await confirm({
          title: "編集中の内容",
          message: "編集中の他校舎の授業がまだ保存されていません。破棄して開きますか？",
          okLabel: "破棄して開く",
          tone: "danger",
        });
        if (!ok) return;
      }
      if (req.id != null) {
        const rec = offsiteLessons.find((r) => r.id === req.id);
        if (!rec) return;
        // 今の絞り込みで見えないときだけ「すべて」に切り替える
        const st = offsiteStatus(rec, today);
        if ((filter === "current" && st === "ended") || (filter === "ended" && st !== "ended")) {
          setFilter("all");
        }
        setHighlightId(rec.id);
        if (isAdmin) startEdit(rec);
        else {
          requestAnimationFrame(() =>
            document
              .getElementById(`offsite-${rec.id}`)
              ?.scrollIntoView?.({ behavior: "smooth", block: "center" })
          );
        }
      } else if (isAdmin) {
        setDraft({ ...emptyOffsiteDraft(today), teacher: req.teacher || "" });
        setEditId(null);
        setError(null);
        setLastAdded(null);
        scrollToForm();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 要求 (token) ごとに 1 回だけ
  }, [focusRequest]);

  useEffect(() => {
    if (highlightId == null) return undefined;
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightId]);

  const handleSubmit = () => {
    const v = validateOffsiteDraft(draft, {
      splitTeachers: splitTeacherField,
      editing: editId != null,
    });
    if (!v.ok) {
      setError(v);
      return;
    }
    const nowIso = new Date().toISOString();
    if (editId != null) {
      onSave(
        updateOffsiteLesson(offsiteLessons, editId, draft, {
          teacher: v.teachers[0],
          time: v.time,
          nowIso,
        })
      );
      toasts.success(`他校舎の授業を更新しました（${v.teachers[0]}: ${draft.place.trim()}）`);
      setHighlightId(editId);
      resetForm();
      return;
    }
    const { list, added } = addOffsiteLessons(offsiteLessons, draft, {
      teachers: v.teachers,
      time: v.time,
      nextId: nextNumericId(offsiteLessons),
      nowIso,
    });
    onSave(list);
    toasts.success(
      `他校舎の授業を ${added.length} 件登録しました（${v.teachers.join("・")}: ${draft.place.trim()} ${formatOffsiteDays(draft.days)} ${formatOffsiteTime(v.time)}）`
    );
    // 講師だけ空けて残す (同じ行き先へ別の講師を続けて登録できる)
    setDraft((d) => ({ ...d, teacher: "", time: v.time }));
    setLastAdded(v.teachers);
    setHighlightId(added[added.length - 1]?.id ?? null);
    // 終了日が過ぎた予定を入れたとき (記録として残す等) は今の絞り込みで
    // 見えなくなるので、登録されたことが分かるように「すべて」へ
    if (added.some((r) => offsiteStatus(r, today) === "ended") && filter === "current") {
      setFilter("all");
    }
    teacherInputRef.current?.focus?.();
  };

  const handleDelete = (rec) => {
    if (editId === rec.id) resetForm();
    removeWithUndo(rec.id, {
      successMsg: `他校舎の授業を削除しました（${describeOffsite(rec, { withTeacher: true })}）`,
    });
  };

  const saveRecord = (next) =>
    onSave(offsiteLessons.map((r) => (r.id === next.id ? next : r)));

  const handleToggleSkip = (rec, date) => saveRecord(toggleOffsiteSkipDate(rec, date));

  const handleSkipRange = (rec) => {
    const { rec: next, added } = addOffsiteSkipRange(rec, skipRange.from, skipRange.to);
    if (added === 0) {
      toasts.info("その期間に休みにできる日はありません (曜日・期間・既に休みの日を確かめてください)");
      return;
    }
    saveRecord(next);
    setSkipRange({ from: "", to: "" });
    toasts.success(`${rec.teacher} (${rec.place}) の ${added} 日を休みにしました`);
  };

  // 入力した講師のうち、時間割にもバイトにも居ない名前 (表記ゆれの注意)
  const unknownTeachers = splitTeacherField(draft.teacher).filter(
    (t) => knownTeachers.size > 0 && !knownTeachers.has(t)
  );

  // ── 一覧 (行き先ごと) ────────────────────────────────────────────
  const groups = useMemo(() => {
    const shown = offsiteLessons.filter((r) => {
      const st = offsiteStatus(r, today);
      if (filter === "current") return st !== "ended";
      if (filter === "ended") return st === "ended";
      return true;
    });
    const byPlace = new Map();
    for (const r of shown) {
      if (!byPlace.has(r.place)) byPlace.set(r.place, []);
      byPlace.get(r.place).push(r);
    }
    return [...byPlace.entries()]
      .sort((a, b) => compareJa(a[0], b[0]))
      .map(([place, recs]) => ({
        place,
        recs: recs.sort(
          (a, b) =>
            STATUS_RANK[offsiteStatus(a, today)] - STATUS_RANK[offsiteStatus(b, today)] ||
            cmpTeacher(a.teacher, b.teacher) ||
            (offsiteTimeRange(a.time)?.start ?? 0) - (offsiteTimeRange(b.time)?.start ?? 0) ||
            a.id - b.id
        ),
      }));
  }, [offsiteLessons, filter, today, cmpTeacher]);

  const counts = useMemo(() => {
    let ended = 0;
    for (const r of offsiteLessons) if (offsiteStatus(r, today) === "ended") ended++;
    return { current: offsiteLessons.length - ended, ended, all: offsiteLessons.length };
  }, [offsiteLessons, today]);

  // ── 週ごとの予定 (休講日・休みの日を反映した実際の週) ─────────────
  const weekDays = useMemo(
    () =>
      OFFSITE_DAYS.map((d, i) => {
        const date = shiftDays(weekBase, i);
        const recs = offsiteLessonsOnDate(offsiteLessons, date, { holidays });
        // 行き先 × 時刻でまとめ、講師はよみ順
        const byKey = new Map();
        for (const r of recs) {
          const key = `${r.time}|${r.place}`;
          if (!byKey.has(key)) byKey.set(key, { time: r.time, place: r.place, teachers: [] });
          byKey.get(key).teachers.push(r.teacher);
        }
        const rows = [...byKey.values()].map((g) => ({
          ...g,
          teachers: sortTeacherNames([...new Set(g.teachers)], teacherKana),
        }));
        const holiday = holidays.find((h) => h.date === date && isFullDayHoliday(h));
        return { day: d, date, rows, holiday };
      }),
    [weekBase, offsiteLessons, holidays, teacherKana]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, flex: "1 1 320px" }}>
          講師が他の校舎・学校で授業をする曜日と時間です。登録すると、その講師の月間・週間カレンダー、ダッシュボード、代行候補 (その時間は他校舎) に出ます。塾の授業ではないので時間割のコマや第N回には数えません。
        </p>
        <PrintButton />
      </div>

      {isAdmin && (
        <section
          ref={formRef}
          className="no-print"
          aria-label={editId != null ? "他校舎の授業を編集" : "他校舎の授業を登録"}
          style={{ ...S.panel, padding: 16, borderTop: `3px solid ${OC.color}` }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, color: OC.deep }}>
            {editId != null ? "✏️ 他校舎の授業を編集" : "＋ 他校舎の授業を登録"}
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-teacher" style={fieldLabel}>
              講師
            </label>
            {teacherNames.length > 0 && (
              <datalist id="offsite-teacher-list">
                {teacherNames.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
            <input
              id="offsite-teacher"
              ref={teacherInputRef}
              value={draft.teacher}
              onChange={(e) => set("teacher", e.target.value)}
              placeholder={editId != null ? "石原" : "石原 (「石原・片岡」で 2 人分)"}
              list={teacherNames.length > 0 ? "offsite-teacher-list" : undefined}
              aria-invalid={error?.field === "teacher" ? "true" : undefined}
              aria-describedby={error ? "offsite-form-error" : undefined}
              style={{ ...S.input, width: 240 }}
            />
            {unknownTeachers.length > 0 && (
              <span style={{ ...hint, color: "#b06000" }}>
                ⚠ 時間割・バイトに無い名前です: {unknownTeachers.join("・")} (表記ゆれに注意)
              </span>
            )}
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-place" style={fieldLabel}>
              行き先
            </label>
            <input
              id="offsite-place"
              value={draft.place}
              onChange={(e) => set("place", e.target.value)}
              placeholder="村上高松"
              aria-invalid={error?.field === "place" ? "true" : undefined}
              aria-describedby={error ? "offsite-form-error" : undefined}
              style={{ ...S.input, width: 200 }}
            />
            {places.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set("place", p)}
                aria-pressed={draft.place.trim() === p}
                style={chipBtn(draft.place.trim() === p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={fieldRow} role="group" aria-label="曜日">
            <span style={fieldLabel}>曜日</span>
            {OFFSITE_DAYS.map((d) => {
              const on = draft.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={on}
                  aria-label={`${d}曜`}
                  style={{
                    ...chipBtn(on),
                    minWidth: 36,
                    background: on ? DC[d] : "#fff",
                    borderColor: on ? DC[d] : "#ccc",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-time" style={fieldLabel}>
              時間
            </label>
            <input
              id="offsite-time"
              value={draft.time}
              onChange={(e) => set("time", e.target.value)}
              placeholder="14:50-15:40"
              aria-invalid={error?.field === "time" ? "true" : undefined}
              aria-describedby="offsite-time-hint"
              style={{ ...S.input, width: 140 }}
            />
            {times.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("time", t)}
                aria-pressed={timePreview?.ok && timePreview.time === t}
                style={chipBtn(timePreview?.ok && timePreview.time === t)}
              >
                {formatOffsiteTime(t)}
              </button>
            ))}
            <span id="offsite-time-hint" style={hint}>
              {timePreview?.ok
                ? `→ ${formatOffsiteTime(timePreview.time)}`
                : "終わりが未定なら開始だけ (例: 13:30)"}
            </span>
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-travel" style={fieldLabel}>
              移動
            </label>
            <input
              id="offsite-travel"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_TRAVEL_MINUTES}
              step={5}
              value={draft.travelMinutes}
              onChange={(e) => set("travelMinutes", e.target.value)}
              placeholder="0"
              aria-label="移動 (分)"
              aria-invalid={error?.field === "travelMinutes" ? "true" : undefined}
              aria-describedby="offsite-travel-hint"
              style={{ ...S.input, width: 80 }}
            />
            <span>分</span>
            <span id="offsite-travel-hint" style={hint}>
              塾との片道 (任意)。入れると、行く前・戻った後のコマに間に合わないときも重なりとして警告し、代行候補・講習の講師不在にも含めます
            </span>
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-start" style={fieldLabel}>
              期間
            </label>
            <input
              id="offsite-start"
              type="date"
              value={draft.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              aria-label="開始日"
              aria-invalid={error?.field === "startDate" ? "true" : undefined}
              style={{ ...S.input, width: "auto" }}
            />
            <span>〜</span>
            <input
              id="offsite-end"
              type="date"
              value={draft.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              aria-label="終了日 (空欄 = 未定)"
              aria-invalid={error?.field === "endDate" ? "true" : undefined}
              style={{ ...S.input, width: "auto" }}
            />
            {draft.endDate ? (
              <button
                type="button"
                onClick={() => set("endDate", "")}
                style={{ ...S.btn(false), fontSize: 11, padding: "3px 10px" }}
              >
                未定に戻す
              </button>
            ) : (
              <span style={hint}>終了日は空欄 = 未定 (決まったら編集で入れる)</span>
            )}
          </div>

          <div style={fieldRow}>
            <span style={fieldLabel} />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={!draft.keepOnHolidays}
                onChange={(e) => set("keepOnHolidays", !e.target.checked)}
              />
              塾の全体休講日 (祝日など) は休み
            </label>
          </div>

          <div style={fieldRow}>
            <label htmlFor="offsite-memo" style={fieldLabel}>
              メモ
            </label>
            <input
              id="offsite-memo"
              value={draft.memo}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="1月まで？ / 先方の担当の先生 など (任意)"
              style={{ ...S.input, width: "100%", maxWidth: 420 }}
            />
          </div>

          {error && (
            <div
              id="offsite-form-error"
              role="alert"
              style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}
            >
              {error.error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={handleSubmit} style={S.btn(true)}>
              {editId != null ? "更新" : "登録"}
            </button>
            <button type="button" onClick={resetForm} style={S.btn(false)}>
              {editId != null ? "キャンセル" : "入力をクリア"}
            </button>
            {lastAdded && editId == null && (
              <span role="status" style={{ ...hint, color: colors.success }}>
                ✓ {lastAdded.join("・")} を登録しました。行き先・曜日・時間・期間・メモは残してあるので、講師を入れ替えて続けて登録できます
              </span>
            )}
          </div>
        </section>
      )}

      <section aria-label="他校舎の授業の一覧" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="no-print" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              style={{ ...S.btn(filter === f.key), fontSize: 12, padding: "4px 12px" }}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          <div
            style={{
              ...S.panel,
              textAlign: "center",
              color: colors.inkSubtle,
              padding: "28px 16px",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 28 }}>
              🏫
            </div>
            {offsiteLessons.length === 0
              ? "登録された他校舎の授業はありません"
              : "この絞り込みに当たる他校舎の授業はありません"}
            {isAdmin && offsiteLessons.length === 0 && (
              <div style={{ fontSize: 12 }}>
                上のフォームで「講師・行き先・曜日・時間・期間」を入れて登録してください
              </div>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.place} style={{ ...S.panel, overflow: "hidden" }} className="offsite-group">
              <div
                style={{
                  background: OC.bannerBg,
                  borderBottom: `1px solid ${OC.bannerBorder}`,
                  padding: "8px 14px",
                  fontWeight: 800,
                  fontSize: 14,
                  color: OC.deep,
                }}
              >
                🏫 {g.place} <span style={{ fontWeight: 400, fontSize: 12 }}>({g.recs.length} 件)</span>
              </div>
              {g.recs.map((r, i) => (
                <OffsiteRow
                  key={r.id}
                  rec={r}
                  today={today}
                  holidays={holidays}
                  striped={i % 2 === 1}
                  editing={editId === r.id}
                  highlighted={highlightId === r.id}
                  isAdmin={isAdmin}
                  datesOpen={openDatesId === r.id}
                  onToggleDates={() => {
                    setOpenDatesId(openDatesId === r.id ? null : r.id);
                    setSkipRange({ from: "", to: "" });
                  }}
                  onEdit={() => startEdit(r)}
                  onCopy={() => copyToForm(r)}
                  onDelete={() => handleDelete(r)}
                  onToggleSkip={(date) => handleToggleSkip(r, date)}
                  skipRange={skipRange}
                  onChangeSkipRange={setSkipRange}
                  onAddSkipRange={() => handleSkipRange(r)}
                  onSelectTeacher={onSelectTeacher}
                />
              ))}
            </div>
          ))
        )}
      </section>

      <section aria-label="週ごとの他校舎の授業" style={{ ...S.panel, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>📆 週ごとの予定</span>
          <span style={hint}>休講日・休みの日を反映した、その週に実際に行く予定</span>
          <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => setWeekBase(shiftDays(weekBase, -7))}
              aria-label="前の週"
              style={{ ...S.btn(false), fontSize: 12, padding: "3px 10px" }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setWeekBase(thisWeekMonday(today))}
              style={{ ...S.btn(false), fontSize: 12, padding: "3px 10px" }}
            >
              今週
            </button>
            <button
              type="button"
              onClick={() => setWeekBase(shiftDays(weekBase, 7))}
              aria-label="次の週"
              style={{ ...S.btn(false), fontSize: 12, padding: "3px 10px" }}
            >
              →
            </button>
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 6,
          }}
        >
          {weekDays.map(({ day, date, rows, holiday }) => (
            <div
              key={date}
              style={{
                border: `1px solid ${date === today ? colors.warning : "#e4e4e8"}`,
                borderRadius: 6,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <div
                style={{
                  background: holiday ? "#eee" : DC[day],
                  color: holiday ? "#999" : "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "4px 8px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <span>
                  {fmtMD(date)} ({day})
                </span>
                {holiday && <span style={{ fontWeight: 400 }}>🚫 {holiday.label || "休講"}</span>}
              </div>
              <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4, minHeight: 34 }}>
                {rows.length === 0 ? (
                  <span style={{ ...hint, color: "#ccc", textAlign: "center" }}>—</span>
                ) : (
                  rows.map((row) => (
                    <div
                      key={`${row.time}|${row.place}`}
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        background: OC.bg,
                        borderLeft: `3px solid ${OC.color}`,
                        borderRadius: 3,
                        padding: "2px 5px",
                      }}
                    >
                      <b>{formatOffsiteTime(row.time)}</b> {row.place}
                      <div style={{ color: OC.deep, fontWeight: 700 }}>{row.teachers.join("・")}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OffsiteRow({
  rec,
  today,
  holidays,
  striped,
  editing,
  highlighted,
  isAdmin,
  datesOpen,
  onToggleDates,
  onEdit,
  onCopy,
  onDelete,
  onToggleSkip,
  skipRange,
  onChangeSkipRange,
  onAddSkipRange,
  onSelectTeacher,
}) {
  const status = offsiteStatus(rec, today);
  const meta = STATUS_META[status];
  const next = status === "ended" ? null : nextOffsiteDate(rec, today, holidays);
  const label = describeOffsite(rec, { withTeacher: true });
  const skipCount = (rec.skipDates || []).length;
  return (
    <div
      id={`offsite-${rec.id}`}
      className="offsite-row"
      style={{
        padding: "10px 14px",
        borderTop: "1px solid #eee",
        background: editing ? "#fffbe6" : striped ? "#fafbfc" : "#fff",
        boxShadow: highlighted ? `inset 0 0 0 3px ${colors.warning}` : undefined,
        transition: "box-shadow .4s",
        opacity: status === "ended" ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {onSelectTeacher ? (
          <button
            type="button"
            onClick={() => onSelectTeacher(rec.teacher)}
            title={`${rec.teacher} の月間カレンダーを開く`}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 800,
              color: colors.ink,
              textDecoration: "underline dotted",
            }}
          >
            {rec.teacher}
          </button>
        ) : (
          <b style={{ fontSize: 15 }}>{rec.teacher}</b>
        )}
        <span style={{ display: "flex", gap: 3 }}>
          {(rec.days || []).map((d) => (
            <span
              key={d}
              style={{
                background: DC[d],
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {d}
            </span>
          ))}
        </span>
        <b style={{ fontSize: 13 }}>{formatOffsiteTime(rec.time)}</b>
        <span style={{ fontSize: 12, color: "#444" }}>{formatOffsitePeriod(rec)}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: "1px 8px",
            borderRadius: 10,
            background: meta.bg,
            color: meta.fg,
          }}
        >
          {status === "upcoming" ? `${fmtMD(rec.startDate)} から` : meta.label}
        </span>
        {next && (
          <span style={{ fontSize: 11, color: colors.inkMuted }}>
            次回 {fmtMD(next)} ({weekdayOf(next)})
          </span>
        )}
        {!rec.endDate && status !== "ended" && (
          <span style={{ fontSize: 10, color: "#b06000", fontWeight: 700 }}>終了日未定</span>
        )}
        {skipCount > 0 && (
          <span style={{ fontSize: 10, color: colors.inkMuted }}>休み {skipCount} 日</span>
        )}
        {rec.travelMinutes > 0 && (
          <span style={{ fontSize: 10, color: colors.inkMuted }}>移動 {rec.travelMinutes} 分</span>
        )}
        {rec.keepOnHolidays && (
          <span style={{ fontSize: 10, color: colors.inkMuted }}>休講日も行く</span>
        )}
        <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={onToggleDates}
            aria-expanded={datesOpen}
            aria-label={`${label} の日程${isAdmin ? "と休みの日" : ""}`}
            style={{ ...S.btn(datesOpen), fontSize: 11, padding: "3px 10px" }}
          >
            📅 日程
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={onCopy}
                aria-label={`${label} を複製`}
                title="内容をフォームに写して、別の講師で登録する"
                style={{ ...S.btn(false), fontSize: 11, padding: "3px 10px" }}
              >
                📋 複製
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`${label} を編集`}
                style={{ ...S.btn(false), fontSize: 11, padding: "3px 10px" }}
              >
                ✏️ 編集
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`${label} を削除`}
                style={{ ...S.btn(false), fontSize: 11, padding: "3px 10px", color: colors.danger }}
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>
      {rec.memo && (
        <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 4, whiteSpace: "pre-wrap" }}>
          📝 {rec.memo}
        </div>
      )}
      {datesOpen && (
        <OffsiteDates
          rec={rec}
          today={today}
          holidays={holidays}
          isAdmin={isAdmin}
          onToggleSkip={onToggleSkip}
          skipRange={skipRange}
          onChangeSkipRange={onChangeSkipRange}
          onAddSkipRange={onAddSkipRange}
        />
      )}
    </div>
  );
}

// 日程: 曜日・期間に当たる日を月ごとに並べ、休みの日を切り替える
function OffsiteDates({
  rec,
  today,
  holidays,
  isAdmin,
  onToggleSkip,
  skipRange,
  onChangeSkipRange,
  onAddSkipRange,
}) {
  const from = rec.startDate > monthStartOf(today) ? rec.startDate : monthStartOf(today);
  const to = rec.endDate || monthEndAfter(today, DATES_AHEAD_MONTHS);
  const dates = listOffsiteDates(rec, { from, to, holidays });
  const byMonth = new Map();
  for (const x of dates) {
    const key = x.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(x);
  }
  const holidayLabel = (date) => holidays.find((h) => h.date === date && isFullDayHoliday(h))?.label;
  return (
    <div
      className="no-print"
      style={{
        marginTop: 8,
        padding: 10,
        background: "#f7f9fb",
        border: `1px solid ${OC.bannerBorder}`,
        borderRadius: 6,
      }}
    >
      <div style={{ ...hint, marginBottom: 6 }}>
        {isAdmin
          ? "日付を押すとその日だけ休み / 戻すを切り替えます。灰色の「休講」は塾の全体休講日 (休講日も行くなら編集で切り替え)。"
          : "取消線は休み、灰色の「休講」は塾の全体休講日のため休みの日です。"}
        {!rec.endDate && ` 終了日未定のため ${DATES_AHEAD_MONTHS} か月先まで表示しています。`}
      </div>
      {dates.length === 0 ? (
        <div style={hint}>この期間に当たる日はありません</div>
      ) : (
        [...byMonth.entries()].map(([ym, list]) => (
          <div key={ym} style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, minWidth: 34 }}>
              {Number(ym.slice(5, 7))}月
            </span>
            <span style={{ fontSize: 11, color: colors.inkMuted, minWidth: 44 }}>
              {list.filter((x) => x.status === "on").length} 回
            </span>
            {list.map(({ date, status }) => {
              const past = date < today;
              const label = `${fmtMD(date)} (${weekdayOf(date)})`;
              const base = {
                fontSize: 11,
                borderRadius: 12,
                padding: "2px 8px",
                border: "1px solid",
                opacity: past ? 0.55 : 1,
              };
              if (status === "holiday") {
                return (
                  <span
                    key={date}
                    title={`${holidayLabel(date) || "休講日"} のため休み`}
                    style={{ ...base, background: "#eee", borderColor: "#ddd", color: "#999" }}
                  >
                    {label} 休講
                  </span>
                );
              }
              const skipped = status === "skip";
              const style = {
                ...base,
                background: skipped ? "#fff" : OC.chipBg,
                borderColor: skipped ? "#ddd" : OC.bannerBorder,
                color: skipped ? "#999" : OC.deep,
                textDecoration: skipped ? "line-through" : undefined,
                fontWeight: skipped ? 400 : 700,
              };
              return isAdmin ? (
                <button
                  key={date}
                  type="button"
                  onClick={() => onToggleSkip(date)}
                  aria-pressed={skipped}
                  aria-label={`${fmtDateWeekday(date)} を${skipped ? "授業ありに戻す" : "休みにする"}`}
                  style={{ ...style, cursor: "pointer" }}
                >
                  {label}
                  {skipped ? " 休み" : ""}
                </button>
              ) : (
                <span key={date} style={style}>
                  {label}
                  {skipped ? " 休み" : ""}
                </span>
              );
            })}
          </div>
        ))
      )}
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>休みの期間をまとめて追加:</span>
          <input
            type="date"
            value={skipRange.from}
            onChange={(e) => onChangeSkipRange({ ...skipRange, from: e.target.value })}
            aria-label="休みの期間の開始日"
            style={{ ...S.input, width: "auto", padding: "4px 8px", fontSize: 12 }}
          />
          <span>〜</span>
          <input
            type="date"
            value={skipRange.to}
            onChange={(e) => onChangeSkipRange({ ...skipRange, to: e.target.value })}
            aria-label="休みの期間の終了日"
            style={{ ...S.input, width: "auto", padding: "4px 8px", fontSize: 12 }}
          />
          <button
            type="button"
            onClick={onAddSkipRange}
            disabled={!skipRange.from || !skipRange.to}
            style={{ ...S.btn(false), fontSize: 11, padding: "3px 10px" }}
          >
            休みにする
          </button>
          <span style={hint}>冬休み・先方のテスト期間など</span>
        </div>
      )}
    </div>
  );
}
