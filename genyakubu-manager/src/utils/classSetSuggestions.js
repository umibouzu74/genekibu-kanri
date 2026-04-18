import { DAYS } from "../constants/schools";

// ─── ClassSet ユニット / 提案ロジック ──────────────────────────────
// ClassSetManager (UI) と単体テストの両方から import される。
// UI からドメインロジックを剥がし、純粋関数として独立させる目的。

/** クラスユニットのキー: (学年, 曜日). */
export function unitKeyOf(slot) {
  return `${slot.grade}|${slot.day}`;
}

/**
 * slots を (学年, 曜日) でユニット化し、各ユニット内のスロットを
 * 時刻昇順に並べた配列を返す。
 * @returns {Array<{key:string, grade:string, day:string, slots:Array}>}
 */
export function buildClassUnits(slots) {
  const units = new Map();
  for (const s of slots) {
    const key = unitKeyOf(s);
    if (!units.has(key)) {
      units.set(key, {
        key,
        grade: s.grade,
        day: s.day,
        slots: [],
      });
    }
    units.get(key).slots.push(s);
  }
  for (const u of units.values()) {
    u.slots.sort((a, b) => a.time.localeCompare(b.time));
  }
  return [...units.values()];
}

/** ユニット表示ラベル: 例 "火 中3". */
export function unitLabel(unit) {
  return `${unit.day} ${unit.grade}`;
}

/**
 * 指定ユニット群から自動ラベルを生成。
 * 例: { grade:"中3", days:["火","木"] } → "中3 (火・木)"
 */
export function autoLabelFromUnits(units) {
  if (units.length === 0) return "";
  const grades = [...new Set(units.map((u) => u.grade))];
  const days = [...new Set(units.map((u) => u.day))].sort(
    (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
  );
  const gPart = grades.join("/");
  const dPart = days.join("・");
  return `${gPart} (${dPart})`.trim();
}

/**
 * 自動提案: 各学年内で「同じ曜日セット」を持つ cohort 群をひとまとめにし、
 * (学年, 曜日ペア) 単位で提案する。
 *
 * 例: 中3 SS/S/A/B が火木に出現 → "中3 (火・木)" 提案
 *      中3 C が水金に出現 → "中3 (水・金)" 提案
 *
 * 同学年内で複数の曜日パターンが重複曜日を含む場合、ユニット数が大きい
 * (= カバレッジが広い) 提案を優先表示する。
 */
export function buildSuggestions(allUnits, classSets, allSlots) {
  const alreadyMapped = new Set();
  for (const cs of classSets) for (const id of cs.slotIds) alreadyMapped.add(id);

  // 完全未マップのユニット (= 学年×曜日) だけ対象
  const freeUnits = allUnits.filter((u) =>
    u.slots.every((s) => !alreadyMapped.has(s.id))
  );

  // 学年ごとに cohort (cls or room) → 出現曜日セット を集計
  const gradeCohortDays = new Map();
  const freeKeys = new Set(freeUnits.map((u) => u.key));
  for (const s of allSlots) {
    const k = `${s.grade}|${s.day}`;
    if (!freeKeys.has(k)) continue;
    const cohortId = (s.cls && s.cls.trim()) || s.room || "";
    if (!gradeCohortDays.has(s.grade)) gradeCohortDays.set(s.grade, new Map());
    const cohortMap = gradeCohortDays.get(s.grade);
    if (!cohortMap.has(cohortId)) cohortMap.set(cohortId, new Set());
    cohortMap.get(cohortId).add(s.day);
  }

  const suggestions = [];
  for (const [grade, cohortMap] of gradeCohortDays) {
    const dayPatternGroups = new Map();
    for (const [cohortId, daySet] of cohortMap) {
      if (daySet.size < 2) continue; // 単日の cohort はセット化対象外
      const sortedDays = [...daySet].sort(
        (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
      );
      const dayKey = sortedDays.join(",");
      if (!dayPatternGroups.has(dayKey)) dayPatternGroups.set(dayKey, []);
      dayPatternGroups.get(dayKey).push(cohortId);
    }

    for (const dayKey of dayPatternGroups.keys()) {
      const days = dayKey.split(",");
      const units = freeUnits.filter(
        (u) => u.grade === grade && days.includes(u.day)
      );
      if (units.length === 0) continue;
      const sortedUnits = [...units].sort(
        (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      );
      const slotCount = sortedUnits.reduce((acc, u) => acc + u.slots.length, 0);
      suggestions.push({
        key: `${grade}|${dayKey}`,
        units: sortedUnits,
        label: autoLabelFromUnits(sortedUnits),
        slotCount,
      });
    }
  }
  // カバレッジが広い (slotCount 大) ものを先に提示 → 先に登録すれば
  // 重複曜日を含む細かい提案は freeUnits から自動的に外れる。
  return suggestions.sort((a, b) => {
    if (a.slotCount !== b.slotCount) return b.slotCount - a.slotCount;
    return a.label.localeCompare(b.label, "ja");
  });
}
