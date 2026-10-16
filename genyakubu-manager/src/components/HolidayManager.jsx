import { useMemo, useRef, useState } from "react";
import {
  DEPARTMENTS,
  DEPT_COLOR,
  HIGH_GRADES,
  MIDDLE_GRADES,
  gradeToDept,
  isValidDateStr,
} from "../data";
import { nextNumericId } from "../utils/schema";
import { useToasts } from "../hooks/useToasts";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import {
  scrollFormIntoView,
  useEditTarget,
  useNewEntryTarget,
} from "../hooks/useEditTarget";
import { S, VISUALLY_HIDDEN } from "../styles/common";
import { colors } from "../styles/tokens";
import { eachDateStrInRange, fmtDateWeekday } from "../utils/dateHelpers";
import { findSameDayHolidays } from "../utils/holidayDuplicates";
// 注意書きの対象 ("中学部 中3" 等) はイベントカレンダーと同じ言い方にする
import { describeHolidayScope } from "../utils/eventTargets";
import { ListPeriodFilter } from "./ListPeriodFilter";
import { useListPeriod } from "../hooks/useListPeriod";
import { MultiDateCalendar } from "./MultiDateCalendar";
import { gradeChoices, isCommonGrade } from "../utils/gradeChoices";
import { holidayExceptionSlots, slotsStoppedByHoliday } from "../utils/holidayExceptions";

// 例外の候補・一覧に出すコマの短い名前 ("19:00 高2 高松一 物理")
function slotShortLabel(s) {
  const time = (s.time || "").split("-")[0];
  return [time, `${s.grade}${s.cls && s.cls !== "-" ? s.cls : ""}`, s.subj].filter(Boolean).join(" ");
}

// 例外の候補を並べる日数の上限 (年末年始のような長い期間を入れても重くしない)
const EXCEPTION_PREVIEW_DAYS = 14;

// Extract unique class groups (school/course names) from configured slots.
// For high school, the class group is either:
//   - the first token for space-separated subjects ("高松西 数学" → "高松西")
//   - a common prefix for concatenated subjects ("共テ英語(St)" → "共テ")
function extractClassGroups(slots, grades) {
  const groups = new Set();
  const singleTokenSubjs = new Set();
  const gradeSet = new Set(grades);
  for (const s of slots) {
    if (gradeSet.size > 0 && !gradeSet.has(s.grade)) continue;
    if (gradeToDept(s.grade) !== "高校部") continue;
    const parts = s.subj.split(/\s+/);
    if (parts.length >= 2) {
      groups.add(parts[0]);
    } else {
      singleTokenSubjs.add(s.subj);
    }
  }
  // Find shortest common prefix (≥2 chars) among 3+ single-token subjects
  if (singleTokenSubjs.size >= 2) {
    const subjs = [...singleTokenSubjs];
    for (let len = 2; len <= 8; len++) {
      const counts = {};
      for (const s of subjs) {
        if (s.length >= len) {
          const p = s.slice(0, len);
          counts[p] = (counts[p] || 0) + 1;
        }
      }
      for (const [prefix, count] of Object.entries(counts)) {
        if (count < 3) continue;
        // Skip if a shorter prefix already covers this group
        let dominated = false;
        for (const g of groups) {
          if (prefix.startsWith(g)) { dominated = true; break; }
        }
        if (!dominated) groups.add(prefix);
      }
    }
  }
  // Also include single-token subjects that aren't covered by any existing
  // group prefix (e.g. "古文漢文"). Normalize by removing "・" so that
  // "古文・漢文" and "古文漢文" collapse to a single option.
  for (const s of singleTokenSubjs) {
    const normalized = s.replace(/・/g, "");
    let dominated = false;
    for (const g of groups) {
      if (normalized.startsWith(g)) { dominated = true; break; }
    }
    if (!dominated) groups.add(normalized);
  }
  return [...groups].sort();
}

export function HolidayManager({
  holidays,
  slots = [],
  // 例外の候補 (その日に止まるコマ) を画面に出るコマだけにする窓
  timetables = [],
  displayCutoff = null,
  onSave,
  isAdmin,
  editTargetId = null,
  onConsumeEditTarget,
  newEntryToken = null,
  newEntryDate = null,
  onConsumeNewEntry,
}) {
  const formRef = useRef(null);
  // 日付は複数 (年末年始・盆休みを同じ対象設定で一括登録する)。編集中は 1 件。
  // 追加授業 (ExtraLessonManager) と同じ「チップに足していく」作法 + 期間で
  // まとめて足す「〜」欄
  const [dates, setDates] = useState([]);
  const [dateInput, setDateInput] = useState("");
  const [dateEndInput, setDateEndInput] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState(["全部"]);
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [subjKeywords, setSubjKeywords] = useState([]);
  // 対象クラスの自由入力 (科目名に含む文字)。チップに無い「共テ英語(Hi)」なども指定できる
  const [keywordInput, setKeywordInput] = useState("");
  const [showDaySlots, setShowDaySlots] = useState(false);
  // 例外 (この日は授業あり) のコマ。scheduleHelpers.holidayMatches が見る
  const [excludeSlotIds, setExcludeSlotIds] = useState([]);
  const [showExceptions, setShowExceptions] = useState(false);
  // 飛び飛びの日付をカレンダーで押して選ぶ
  const [showCalendar, setShowCalendar] = useState(false);
  const [filter, setFilter] = useState("");
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  // 追加を止めた相手 (同じ日・同じ対象の既存)。「既存を編集」「重複した日付を外す」用
  const [conflict, setConflict] = useState(null);
  const toasts = useToasts();
  const removeHolidayWithUndo = useRemoveWithUndo({
    list: holidays,
    save: onSave,
  });
  const slotById = useMemo(
    () => new Map((slots || []).map((s) => [String(s.id), s])),
    [slots]
  );

  // 対象学年の選択肢 = 標準の学年 + 時間割にある共通学年 (附中・中1-3・高1高2 …)。
  // 対象学年は完全一致で効くので、共通学年はそれ自体を選んだときだけ止まる
  const gradeOptions = useMemo(() => gradeChoices(slots, targetGrades), [slots, targetGrades]);
  const scopeGradeOptions = useMemo(
    () =>
      scope.includes("全部")
        ? gradeOptions
        : gradeOptions.filter((g) => scope.includes(gradeToDept(g))),
    [gradeOptions, scope]
  );

  // Derive available class groups from configured slots
  const availableClasses = useMemo(
    () => extractClassGroups(slots, allGrades ? [] : targetGrades),
    [slots, targetGrades, allGrades]
  );

  const toggleScope = (dept) => {
    if (dept === "全部") {
      setScope(["全部"]);
      // Reset grade/keyword when switching to 全部
      setTargetGrades([]);
      setAllGrades(true);
      setSubjKeywords([]);
      return;
    }
    let next = scope.filter((s) => s !== "全部");
    next = next.includes(dept) ? next.filter((s) => s !== dept) : [...next, dept];
    if (next.length === 0) {
      setScope(["全部"]);
      setTargetGrades([]);
      setAllGrades(true);
      setSubjKeywords([]);
    } else {
      setScope(next);
      // Filter out grades that no longer belong to selected departments
      if (!allGrades) {
        const validGrades = targetGrades.filter((g) => next.includes(gradeToDept(g)));
        if (validGrades.length === 0) {
          setAllGrades(true);
          setTargetGrades([]);
          setSubjKeywords([]);
        } else {
          setTargetGrades(validGrades);
          setSubjKeywords([]);
        }
      }
    }
  };

  // ─── Grade selection (same pattern as ExamPeriodManager) ───
  const toggleGrade = (g) => {
    setSubjKeywords([]); // Clear class selection when grades change
    if (allGrades) {
      // 全学年 (= 共通学年も含む) からその学年だけ外す
      setAllGrades(false);
      setTargetGrades(scopeGradeOptions.filter((gr) => gr !== g));
      return;
    }
    // 全部外しても全学年には戻さない (「全解除」から選び直せるように)。
    // 何も選んでいないまま登録しようとしたら止める (handleAdd)
    setTargetGrades(
      targetGrades.includes(g) ? targetGrades.filter((x) => x !== g) : [...targetGrades, g]
    );
  };

  // 「全解除」: 何も選んでいない状態から、止めたい学年だけを選ぶ
  // (附中1〜3 だけ、のときに中1〜3 を 1 つずつ外さなくて済むように)
  const clearGrades = () => {
    setAllGrades(false);
    setTargetGrades([]);
    setSubjKeywords([]);
  };

  const selectAllGrades = () => {
    setAllGrades(true);
    setTargetGrades([]);
    setSubjKeywords([]);
  };

  const selectMiddle = () => {
    setAllGrades(false);
    setTargetGrades(MIDDLE_GRADES);
    setSubjKeywords([]);
  };

  const selectHigh = () => {
    setAllGrades(false);
    setTargetGrades(HIGH_GRADES);
    setSubjKeywords([]);
  };

  const isGradeSelected = (g) => allGrades || targetGrades.includes(g);

  // ─── Subject keyword selection ───
  const toggleKeyword = (kw) => {
    setSubjKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  };
  // 自由入力・その日のコマから足す (科目名に含む文字。完全な科目名なら
  // そのコマだけに効く)
  const addKeyword = (raw) => {
    const kw = (raw || "").trim();
    if (!kw) return;
    setSubjKeywords((prev) => (prev.includes(kw) ? prev : [...prev, kw]));
    setKeywordInput("");
  };
  const toggleCalendarDate = (d) => {
    setDates((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
    if (error) setError("");
  };
  const toggleException = (id) => {
    setExcludeSlotIds((prev) =>
      prev.some((x) => String(x) === String(id))
        ? prev.filter((x) => String(x) !== String(id))
        : [...prev, id]
    );
  };

  // 入力欄 (単日 or 開始〜終了) をチップに足す
  const addDates = () => {
    if (!dateInput || !isValidDateStr(dateInput)) return;
    const end = dateEndInput && isValidDateStr(dateEndInput) ? dateEndInput : dateInput;
    const range = eachDateStrInRange(dateInput, end);
    if (range.length === 0) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    setDates((prev) => [...new Set([...prev, ...range])].sort());
    setDateInput("");
    setDateEndInput("");
    if (error) setError("");
  };
  const removeDate = (d) => setDates((prev) => prev.filter((x) => x !== d));

  // 保存形と同じ対象 (scope が全部 / 全学年なら学年・キーワードは空)
  const criteria = useMemo(
    () => ({
      scope: [...scope],
      targetGrades: allGrades ? [] : [...targetGrades],
      subjKeywords: scope.includes("全部") || allGrades ? [] : [...subjKeywords],
    }),
    [scope, allGrades, targetGrades, subjKeywords]
  );
  // 入力中の日付 (チップ、無ければ日付欄) に対する同じ日の既存。対象が違う
  // ものは併存できるので注意だけ出す (追加は止めない)
  const previewDates = useMemo(() => {
    if (dates.length > 0) return dates;
    if (!dateInput || !isValidDateStr(dateInput)) return [];
    const end = dateEndInput && isValidDateStr(dateEndInput) ? dateEndInput : dateInput;
    return eachDateStrInRange(dateInput, end);
  }, [dates, dateInput, dateEndInput]);
  const sameDay = useMemo(
    () => findSameDayHolidays(holidays, previewDates, criteria, { excludeId: editId }),
    [holidays, previewDates, criteria, editId]
  );
  // その日 (入力中の日付) にこの対象設定で止まるコマ = 例外 (この日は授業あり)
  // の候補。同じコマは 1 回だけ (毎週のコマなので日付が違っても同じ id)
  const stoppedSlots = useMemo(() => {
    const seen = new Map();
    for (const d of previewDates.slice(0, EXCEPTION_PREVIEW_DAYS)) {
      for (const s of slotsStoppedByHoliday(slots, d, criteria, { timetables, displayCutoff })) {
        if (!seen.has(s.id)) seen.set(s.id, { slot: s, dates: [] });
        seen.get(s.id).dates.push(d);
      }
    }
    return [...seen.values()];
  }, [previewDates, slots, criteria, timetables, displayCutoff]);
  // その日のコマ (対象クラスを「その日のコマから選ぶ」用)。科目キーワードで
  // 絞る前の、部門・学年だけで止まるコマ
  const daySlotsForKeywords = useMemo(() => {
    if (!showDaySlots) return [];
    const base = { ...criteria, subjKeywords: [] };
    const seen = new Map();
    for (const d of previewDates.slice(0, EXCEPTION_PREVIEW_DAYS)) {
      for (const s of slotsStoppedByHoliday(slots, d, base, { timetables, displayCutoff })) {
        if (!seen.has(s.subj)) seen.set(s.subj, s);
      }
    }
    return [...seen.values()];
  }, [showDaySlots, previewDates, slots, criteria, timetables, displayCutoff]);

  // ─── Form actions ───
  // presetDate: イベントカレンダーの日付セルから来たときの日付 (文字列のみ。
  // onClick から呼ばれると event が入るので型で弾く)
  const resetForm = (presetDate) => {
    setDates(typeof presetDate === "string" ? [presetDate] : []);
    setDateInput("");
    setDateEndInput("");
    setLabel("");
    setScope(["全部"]);
    setTargetGrades([]);
    setAllGrades(true);
    setSubjKeywords([]);
    setKeywordInput("");
    setExcludeSlotIds([]);
    setShowExceptions(false);
    setEditId(null);
    setError("");
    setConflict(null);
  };

  const handleAdd = () => {
    setError("");
    setConflict(null);
    // 日付欄に入れたまま「＋ 日付を追加」を押し忘れた場合の救済
    let effectiveDates = dates;
    if (dates.length === 0 && dateInput) {
      if (!isValidDateStr(dateInput)) {
        setError("日付の形式が正しくありません");
        return;
      }
      const end = dateEndInput && isValidDateStr(dateEndInput) ? dateEndInput : dateInput;
      effectiveDates = eachDateStrInRange(dateInput, end);
      if (effectiveDates.length === 0) {
        setError("終了日は開始日以降にしてください");
        return;
      }
    }
    if (effectiveDates.length === 0) {
      setError("日付を入力してください");
      return;
    }
    if (!scope.includes("全部") && !allGrades && targetGrades.length === 0) {
      setError("対象学年を選んでください (すべての学年なら「全学年」)");
      return;
    }

    // 同じ日・同じ対象の既存があれば足さない (効き目は変わらないのに一覧に
    // 2 行並び、片方だけ消して「まだ休講のまま」になる)。対象が違う既存は
    // 併存できるので止めない
    const { exact } = findSameDayHolidays(holidays, effectiveDates, criteria, {
      excludeId: editId,
    });
    if (exact.length > 0) {
      const dupDates = [...new Set(exact.map((x) => x.date))];
      const first = exact[0];
      setError(
        dupDates.length === 1
          ? `${fmtDateWeekday(first.date)} は同じ対象の休講日「${first.holiday.label || "休講"}」が既に登録されています`
          : `${dupDates.map(fmtDateWeekday).join("、")} は同じ対象の休講日が既に登録されています (「${first.holiday.label || "休講"}」など ${exact.length} 件)`
      );
      setConflict({
        holiday: first.holiday,
        dupDates,
        // 重複した日を外して残りを登録できるとき (複数日の一括登録) だけ
        remaining: effectiveDates.filter((d) => !dupDates.includes(d)),
      });
      return;
    }

    // 例外は今の対象設定で止まるコマのものだけ残す (対象を絞り直して止まら
    // なくなったコマの id を持ち続けない)。候補を出していない長い期間は
    // そのまま (判定に害は無い)
    const stoppedIds = new Set(stoppedSlots.map((x) => String(x.slot.id)));
    const keptExcludes =
      previewDates.length > EXCEPTION_PREVIEW_DAYS
        ? excludeSlotIds
        : excludeSlotIds.filter((id) => stoppedIds.has(String(id)));
    const base = {
      label: label || "休講",
      scope: criteria.scope,
      targetGrades: criteria.targetGrades,
      subjKeywords: criteria.subjKeywords,
      // 空は持たない (RTDB が消すので保存形をそろえる)
      ...(keptExcludes.length > 0 ? { excludeSlotIds: keptExcludes } : {}),
    };

    if (editId != null) {
      const entry = { id: editId, date: effectiveDates[0], ...base };
      onSave(holidays.map((h) => (h.id === editId ? entry : h)));
      toasts.success("休講日を更新しました");
    } else {
      // 複数日を 1 回の save で一括登録 (id は連番)
      let nextId = nextNumericId(holidays);
      const records = effectiveDates.map((date) => ({ id: nextId++, date, ...base }));
      onSave([...holidays, ...records]);
      toasts.success(
        records.length === 1 ? "休講日を追加しました" : `休講日を ${records.length} 件追加しました`
      );
    }
    resetForm();
  };

  const handleEdit = (h) => {
    setDates([h.date]);
    setDateInput("");
    setDateEndInput("");
    setLabel(h.label);
    setScope(h.scope || ["全部"]);
    if ((h.targetGrades || []).length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...h.targetGrades]);
    }
    setSubjKeywords([...(h.subjKeywords || [])]);
    setExcludeSlotIds([...(h.excludeSlotIds || [])]);
    setShowExceptions((h.excludeSlotIds || []).length > 0);
    setEditId(h.id);
    setError("");
    setConflict(null);
  };

  // 「重複した日付を外す」: 既に登録済みの日だけチップから外し、残りを
  // そのまま登録できる状態にする (日付欄から直接押したときはチップに移す)
  const dropDuplicateDates = () => {
    if (!conflict) return;
    setDates(conflict.remaining);
    setDateInput("");
    setDateEndInput("");
    setError("");
    setConflict(null);
  };

  // 一覧の例外を外す (この日は休講日どおり休講に戻す)。cascade の無い変更なので
  // 6 秒の「元に戻す」を出す。書き込みは保存時点の配列から (updater)
  const handleRemoveException = (h, id) => {
    const key = String(id);
    const withExcludes = (x, ids) => {
      const next = { ...x };
      if (ids.length > 0) next.excludeSlotIds = ids;
      else delete next.excludeSlotIds;
      return next;
    };
    onSave((prev) =>
      prev.map((x) =>
        x.id === h.id
          ? withExcludes(x, (x.excludeSlotIds || []).filter((v) => String(v) !== key))
          : x
      )
    );
    const s = slotById.get(key);
    toasts.push(
      `${fmtDateWeekday(h.date)} の例外を外しました${s ? ` (${slotShortLabel(s)} は休講に戻ります)` : ""}`,
      {
        tone: "info",
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () =>
            onSave((prev) =>
              prev.map((x) => {
                if (x.id !== h.id) return x;
                const cur = x.excludeSlotIds || [];
                return cur.some((v) => String(v) === key) ? x : withExcludes(x, [...cur, id]);
              })
            ),
        },
      }
    );
  };

  const handleDel = (h) => {
    removeHolidayWithUndo(h.id, {
      successMsg: `休講日を削除しました${h.label ? `（${h.label}）` : ""}`,
    });
  };

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const byDept = filter
    ? sorted.filter((h) => {
        const s = h.scope || ["全部"];
        return s.includes("全部") || s.includes(filter);
      })
    : sorted;
  // 一覧の期間絞り込み (既定は今月以降)。編集・削除は全件が対象
  const period = useListPeriod();
  const filtered = period.apply(byDept, (h) => [h.date, h.date]);

  // Show grade/keyword selection only when scope is NOT 全部
  const showGradeSelection = !scope.includes("全部");

  useEditTarget({
    editTargetId,
    items: holidays,
    onEdit: handleEdit,
    onConsume: onConsumeEditTarget,
    formRef,
    isAdmin,
  });

  useNewEntryTarget({
    token: newEntryToken,
    date: newEntryDate,
    onReset: resetForm,
    onConsume: onConsumeNewEntry,
    formRef,
    isAdmin,
  });

  return (
    <div style={{ marginTop: 12 }}>
      {isAdmin && (
      <div
        ref={formRef}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          border: "1px solid #e0e0e0",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          {editId != null ? "休講日を編集" : "休講日を追加"}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          {/* 編集中は 1 件だけなので、日付をそのまま直せる欄を出す (チップに
              固定すると日付を直せず、消して作り直すしかなくなる) */}
          {editId != null && (
            <input
              type="date"
              value={dates[0] || ""}
              onChange={(e) => {
                setDates(e.target.value ? [e.target.value] : []);
                if (error) setError("");
              }}
              aria-label="日付"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "holiday-date-err" : undefined}
              style={{ ...S.input, width: "auto", borderColor: error ? colors.danger : "#ccc" }}
            />
          )}
          {editId == null && dates.map((d) => (
            <span
              key={d}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 4px 2px 8px",
                borderRadius: 12,
                background: "#fde4e4",
                color: "#a03030",
                border: "1px solid #e0a0a0",
              }}
            >
              {fmtDateWeekday(d)}
              {editId == null && (
                <button
                  type="button"
                  onClick={() => removeDate(d)}
                  aria-label={`日付 ${d} を外す`}
                  style={{
                    border: "none",
                    background: "#a03030",
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
              )}
            </span>
          ))}
          {editId == null && (
            <>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => {
                  setDateInput(e.target.value);
                  if (error) setError("");
                }}
                aria-label="日付 (開始日)"
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "holiday-date-err" : undefined}
                style={{ ...S.input, width: "auto", borderColor: error ? colors.danger : "#ccc" }}
              />
              {(
                <>
                  <span style={{ fontSize: 12, color: "#888" }}>〜</span>
                  <input
                    type="date"
                    value={dateEndInput}
                    min={dateInput || undefined}
                    onChange={(e) => {
                      setDateEndInput(e.target.value);
                      if (error) setError("");
                    }}
                    aria-label="終了日 (任意。連続する休みをまとめて足す)"
                    title="連続する休み (年末年始・盆休み) は終了日を入れるとまとめて足せます"
                    style={{ ...S.input, width: "auto" }}
                  />
                  <button
                    type="button"
                    onClick={addDates}
                    style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
                  >
                    ＋ 日付を追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCalendar((v) => !v)}
                    aria-expanded={showCalendar}
                    title="飛び飛びの日付を、カレンダーで押して選べます"
                    style={{ ...S.btn(showCalendar), fontSize: 11, padding: "4px 10px" }}
                  >
                    📅 カレンダーで選ぶ
                  </button>
                  <span style={{ fontSize: 10, color: "#888" }}>
                    （複数日は同じ対象設定で一括登録）
                  </span>
                </>
              )}
            </>
          )}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="名称（任意）"
            style={{ ...S.input, width: "100%", maxWidth: 240 }}
          />
        </div>
        {editId == null && showCalendar && (
          <div style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <MultiDateCalendar
              selected={dates}
              onToggle={toggleCalendarDate}
              initialMonth={dateInput || dates[0] || newEntryDate || undefined}
              label="休講日をカレンダーで選ぶ"
            />
            <div style={{ fontSize: 11, color: "#666", maxWidth: 260, lineHeight: 1.6 }}>
              押した日が上のチップに入ります (もう一度押すと外れます)。
              {dates.length > 0 && <div style={{ fontWeight: 700 }}>選択中: {dates.length} 日</div>}
            </div>
          </div>
        )}
        {error && (
          <div
            id="holiday-date-err"
            role="alert"
            style={{
              fontSize: 11,
              color: colors.danger,
              marginBottom: 8,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>{error}</span>
            {conflict && (
              <button
                type="button"
                onClick={() => handleEdit(conflict.holiday)}
                style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px" }}
              >
                既存を編集
              </button>
            )}
            {conflict && conflict.remaining.length > 0 && (
              <button
                type="button"
                onClick={dropDuplicateDates}
                title="登録済みの日だけ外して、残りの日を登録できる状態にします"
                style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px" }}
              >
                重複した日付を外す ({conflict.remaining.length} 日を残す)
              </button>
            )}
          </div>
        )}
        {!error && sameDay.others.length > 0 && (
          <div
            role="status"
            style={{
              fontSize: 11,
              color: "#8a4a00",
              background: "#fff6e5",
              border: "1px solid #f0c070",
              borderRadius: 6,
              padding: "6px 10px",
              marginBottom: 8,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>
              ⚠ 同じ日に対象の違う休講日があります (併存できます):{" "}
              {sameDay.others
                .slice(0, 4)
                .map(
                  (x) =>
                    `${fmtDateWeekday(x.date)} 「${x.holiday.label || "休講"}」(${describeHolidayScope(x.holiday)})`
                )
                .join(" / ")}
              {sameDay.others.length > 4 ? ` … 他 ${sameDay.others.length - 4} 件` : ""}
            </span>
            <button
              type="button"
              onClick={() => handleEdit(sameDay.others[0].holiday)}
              style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px" }}
            >
              既存を編集
            </button>
          </div>
        )}

        {/* 対象部門 */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700 }}>対象:</span>
          {["全部", ...DEPARTMENTS].map((d) => (
            <label
              key={d}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                background: scope.includes(d)
                  ? d === "全部"
                    ? "#1a1a2e"
                    : DEPT_COLOR[d]?.b || "#eee"
                  : "#f5f5f5",
                color: scope.includes(d)
                  ? d === "全部"
                    ? "#fff"
                    : DEPT_COLOR[d]?.f || "#444"
                  : "#aaa",
                border: `1px solid ${
                  scope.includes(d)
                    ? d === "全部"
                      ? "#1a1a2e"
                      : DEPT_COLOR[d]?.accent || "#ccc"
                    : "#ddd"
                }`,
                fontWeight: scope.includes(d) ? 700 : 400,
                transition: "all .15s",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={scope.includes(d)}
                onChange={() => toggleScope(d)}
                style={VISUALLY_HIDDEN}
              />
              {d}
            </label>
          ))}
        </div>

        {/* 対象学年 (部門が全部でない場合のみ表示) */}
        {showGradeSelection && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>対象学年:</span>
              <button
                type="button"
                onClick={selectAllGrades}
                style={{
                  ...S.btn(allGrades),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                全学年
              </button>
              <button
                type="button"
                onClick={clearGrades}
                title="選択を全部外して、止めたい学年だけを選び直します"
                style={{
                  ...S.btn(!allGrades && targetGrades.length === 0),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                全解除
              </button>
              {scope.includes("中学部") && (
                <button
                  type="button"
                  onClick={selectMiddle}
                  style={{
                    ...S.btn(
                      !allGrades &&
                        MIDDLE_GRADES.every((g) => targetGrades.includes(g)) &&
                        !HIGH_GRADES.some((g) => targetGrades.includes(g))
                    ),
                    fontSize: 11,
                    padding: "4px 10px",
                  }}
                >
                  中学部一括
                </button>
              )}
              {scope.includes("高校部") && (
                <button
                  type="button"
                  onClick={selectHigh}
                  style={{
                    ...S.btn(
                      !allGrades &&
                        HIGH_GRADES.every((g) => targetGrades.includes(g)) &&
                        !MIDDLE_GRADES.some((g) => targetGrades.includes(g))
                    ),
                    fontSize: 11,
                    padding: "4px 10px",
                  }}
                >
                  高校部一括
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {scopeGradeOptions.map((g) => {
                const dept = gradeToDept(g);
                const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
                const sel = isGradeSelected(g);
                const common = isCommonGrade(g);
                return (
                  <label
                    key={g}
                    title={
                      common
                        ? "共通学年のコマ (附中の確認テスト・中1-3 のプレップなど)。それ自体を選んだときだけ止まります"
                        : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: sel ? col.b : "#f5f5f5",
                      color: sel ? col.f : "#aaa",
                      border: `1px ${common ? "dashed" : "solid"} ${sel ? col.accent || "#ccc" : "#ccc"}`,
                      fontWeight: sel ? 700 : 400,
                      transition: "all .15s",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleGrade(g)}
                      style={VISUALLY_HIDDEN}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
            {scopeGradeOptions.some(isCommonGrade) && (
              <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                ※ 点線の学年 (共通学年) は、中1〜3 などを選んでも止まりません。止めるときはそれ自体を選んでください
              </div>
            )}
            {!allGrades && targetGrades.length === 0 && (
              <div role="status" style={{ fontSize: 11, color: "#a03030", marginTop: 4 }}>
                止めたい学年を選んでください
              </div>
            )}
          </div>
        )}

        {/* 対象クラス。部門を選んでいる間は常に同じ高さで出す (学年を切り替える
            たびに欄が出入りして「更新」ボタンが上下し、押し間違える) */}
        {showGradeSelection && (
          <div
            data-testid="holiday-class-section"
            style={{
              marginBottom: 12,
              minHeight: 116,
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "6px 8px",
              background: "#fcfcfc",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>対象クラス:</span>
              <span style={{ fontSize: 10, color: "#888" }}>
                （未選択＝全クラス対象。科目名にその文字を含むコマだけ止まります）
              </span>
            </div>
            {allGrades || targetGrades.length === 0 ? (
              <div style={{ fontSize: 11, color: "#999", padding: "6px 0" }}>
                学年を絞ると、学校名・科目名でさらに絞り込めます
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    maxHeight: 58,
                    overflowY: "auto",
                    marginBottom: 6,
                  }}
                >
                  {[
                    ...availableClasses,
                    ...subjKeywords.filter((k) => !availableClasses.includes(k)),
                  ].map((cls) => {
                    const sel = subjKeywords.includes(cls);
                    return (
                      <label
                        key={cls}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 5,
                          cursor: "pointer",
                          background: sel ? "#e0ecf8" : "#f5f5f5",
                          color: sel ? "#1a4a7a" : "#999",
                          border: `1px solid ${sel ? "#6aa0d0" : "#ddd"}`,
                          fontWeight: sel ? 700 : 400,
                          transition: "all .15s",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleKeyword(cls)}
                          style={VISUALLY_HIDDEN}
                        />
                        {cls}
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addKeyword(keywordInput);
                      }
                    }}
                    placeholder="科目名に含む文字 (例: 共テ英語(Hi))"
                    aria-label="対象クラスを文字で指定"
                    style={{ ...S.input, width: 220, fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => addKeyword(keywordInput)}
                    disabled={!keywordInput.trim()}
                    style={{ ...S.btn(false), fontSize: 11, padding: "3px 8px" }}
                  >
                    ＋ 追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDaySlots((v) => !v)}
                    aria-expanded={showDaySlots}
                    disabled={previewDates.length === 0}
                    title={previewDates.length === 0 ? "先に日付を入れてください" : undefined}
                    style={{ ...S.btn(showDaySlots), fontSize: 11, padding: "3px 8px" }}
                  >
                    その日のコマから選ぶ
                  </button>
                </div>
                {showDaySlots && (
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      maxHeight: 96,
                      overflowY: "auto",
                    }}
                  >
                    {daySlotsForKeywords.length === 0 ? (
                      <span style={{ fontSize: 11, color: "#999" }}>
                        この日に止まるコマはありません
                      </span>
                    ) : (
                      daySlotsForKeywords.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => addKeyword(s.subj)}
                          disabled={subjKeywords.includes(s.subj)}
                          title={`「${s.subj}」を対象クラスに足す`}
                          style={{ ...S.btn(subjKeywords.includes(s.subj)), fontSize: 10, padding: "2px 6px" }}
                        >
                          {s.grade} {s.subj}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 例外 (この日は授業あり)。対象に入るが授業を行うコマ */}
        {previewDates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowExceptions((v) => !v)}
              aria-expanded={showExceptions}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                color: "#444",
              }}
            >
              {showExceptions ? "▼" : "▶"} 例外 (この日は授業あり):{" "}
              {excludeSlotIds.length > 0 ? `${excludeSlotIds.length} コマ` : "なし"}
              <span style={{ fontWeight: 400, color: "#888", fontSize: 10, marginLeft: 6 }}>
                この休講で止まるコマ {stoppedSlots.length} コマ
              </span>
            </button>
            {showExceptions && (
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid #eee",
                  borderRadius: 6,
                  padding: "4px 8px",
                }}
              >
                {stoppedSlots.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#999" }}>この日にこの対象で止まるコマはありません</span>
                ) : (
                  stoppedSlots.map(({ slot: sl, dates: ds }) => (
                    <label
                      key={sl.id}
                      style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={excludeSlotIds.some((x) => String(x) === String(sl.id))}
                        onChange={() => toggleException(sl.id)}
                      />
                      <span>{slotShortLabel(sl)}</span>
                      {previewDates.length > 1 && (
                        <span style={{ color: "#999", fontSize: 10 }}>
                          ({ds.map((d) => fmtDateWeekday(d)).join("・")})
                        </span>
                      )}
                    </label>
                  ))
                )}
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                  チェックしたコマはこの休講日では止まりません (その日は通常どおり授業)
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleAdd} style={S.btn(true)}>
            {editId != null ? "更新" : "追加"}
          </button>
          {editId != null && (
            <button onClick={resetForm} style={S.btn(false)}>
              キャンセル
            </button>
          )}
        </div>
      </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>フィルター:</span>
        {["", ...DEPARTMENTS].map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            style={{ ...S.btn(filter === d), fontSize: 11, padding: "4px 10px" }}
          >
            {d || "すべて"}
          </button>
        ))}
      </div>

      <ListPeriodFilter period={period} shown={filtered.length} total={byDept.length} noun="休講日" />
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "hidden",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#888",
              padding: "32px 20px",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>📅</div>
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
              {holidays.length > 0
                ? "この期間に該当する休講日はありません (期間や部門の絞り込みを変えてください)"
                : "登録された休講日はありません"}
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: "#888" }}>
                上のフォームから日付・対象を指定して追加してください
              </div>
            )}
          </div>
        ) : (
          filtered.map((h, i) => {
            const sc = h.scope || ["全部"];
            const tg = h.targetGrades || [];
            const sk = h.subjKeywords || [];
            return (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #eee" : "none",
                  background: editId === h.id ? "#fffbe6" : i % 2 ? "#f8f9fa" : "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 12, minWidth: 115 }}>{fmtDateWeekday(h.date)}</strong>
                  <span style={{ fontSize: 12 }}>{h.label}</span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {sc.map((d) => (
                      <span
                        key={d}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: d === "全部" ? "#1a1a2e" : DEPT_COLOR[d]?.b || "#eee",
                          color: d === "全部" ? "#fff" : DEPT_COLOR[d]?.f || "#444",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                    {tg.map((g) => {
                      const dept = gradeToDept(g);
                      const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
                      return (
                        <span
                          key={g}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: col.b,
                            color: col.f,
                          }}
                        >
                          {g}
                        </span>
                      );
                    })}
                    {sk.map((kw) => (
                      <span
                        key={kw}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#e0ecf8",
                          color: "#1a4a7a",
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                    {holidayExceptionSlots(h, slotById).map(({ id, slot: ex }) => (
                      <span
                        key={`ex-${id}`}
                        title="例外: この日は授業あり (休講にしない)"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 4px 1px 6px",
                          borderRadius: 4,
                          background: "#e6f4ea",
                          color: "#2a6a3a",
                          border: "1px solid #a8d8b0",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        授業あり: {ex ? slotShortLabel(ex) : `削除済みのコマ (${id})`}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRemoveException(h, id)}
                            aria-label={`${h.date} の例外 ${ex ? slotShortLabel(ex) : id} を外す`}
                            style={{
                              border: "none",
                              background: "none",
                              color: "#2a6a3a",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 11,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        handleEdit(h);
                        scrollFormIntoView(formRef);
                      }}
                      aria-label={`${h.date} の休講日を編集`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 2,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDel(h)}
                      aria-label={`${h.date} の休講日を削除`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※「全部」＝全部門休講。部門を個別に選択すると、学年やクラスで対象を絞り込めます。
      </div>
    </div>
  );
}
