import { DAYS } from "../constants/schools";
import { expandClassSetSlotIds, unitKey } from "./classSets";

// ─── ClassSet ユニット / 提案ロジック ──────────────────────────────
// ClassSetManager (UI) と単体テストの両方から import される。
// UI からドメインロジックを剥がし、純粋関数として独立させる目的。

/** クラスユニットのキー: (学年, 曜日). 形式は utils/classSets の unitKey と共通。 */
export function unitKeyOf(slot) {
  return unitKey(slot.grade, slot.day);
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
  const alreadyMapped = collectAssignedSlotIds(classSets, allSlots);

  // 完全未マップのユニット (= 学年×曜日) だけ対象
  const freeUnits = allUnits.filter((u) =>
    u.slots.every((s) => !alreadyMapped.has(s.id))
  );

  // 学年ごとに cohort (cls or room) → 出現曜日セット を集計
  const gradeCohortDays = new Map();
  const freeKeys = new Set(freeUnits.map((u) => u.key));
  for (const s of allSlots) {
    const k = unitKeyOf(s);
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

/** 既にいずれかの授業セットに載っているコマ id の集合 (units / slotIds 両形式)。 */
export function collectAssignedSlotIds(classSets, allSlots) {
  const assigned = new Set();
  for (const cs of classSets || []) {
    for (const id of expandClassSetSlotIds(cs, allSlots)) assigned.add(id);
  }
  return assigned;
}

// ─── 曜日分割の候補 ────────────────────────────────────────────────
// 週 3 日以上ある学年は「同じ生徒が全部通う 1 コース」とは限らず、
// 火木コース / 水金コース のように週内で 2 コースに分かれることがある。
// 分かれているのにセットを登録しないと、コース既定の束ね (utils/cohorts の
// 「学年の平日授業 = 1 コース」) が両方をまとめて数えてしまい、水曜の第1回が
// 火曜の続きの第2回になる。
//
// 塾のコースは中1日 (火→木) か中2日 (月→木) で組むので、**曜日の間隔が
// 2 日または 3 日の組**だけを候補にし、全曜日をちょうど 2 日ずつの組に
// 分けきれるときだけ提案する。
//   火水木金 → 火木 / 水金   (間隔 2 + 2。他の分け方は間隔が合わない)
//   月火木金 → 月木 / 火金   (間隔 3 + 3)
// **あくまで候補**であって自動適用はしない (どちらが実態かは人しか知らない)。
const PAIR_GAPS = [2, 3];
const SPLIT_DAYS = ["月", "火", "水", "木", "金"];

/**
 * 曜日リスト (週順) を「間隔 2 or 3 日」のペアへ完全分割する。
 * 分けきれない場合は null。
 * @param {string[]} days 週順に並んだ曜日 (重複なし)
 * @returns {string[][]|null}
 */
export function pairDaysIntoCourses(days) {
  if (!Array.isArray(days) || days.length < 4 || days.length % 2 !== 0) {
    return null;
  }
  const idx = days.map((d) => SPLIT_DAYS.indexOf(d));
  if (idx.some((i) => i < 0)) return null;
  const used = new Array(days.length).fill(false);
  const pairs = [];
  const rec = () => {
    const i = used.indexOf(false);
    if (i === -1) return true;
    used[i] = true;
    for (let j = i + 1; j < days.length; j++) {
      if (used[j]) continue;
      if (!PAIR_GAPS.includes(idx[j] - idx[i])) continue;
      used[j] = true;
      pairs.push([days[i], days[j]]);
      if (rec()) return true;
      pairs.pop();
      used[j] = false;
    }
    used[i] = false;
    return false;
  };
  return rec() ? pairs : null;
}

/**
 * 「この学年は週 N 日あるので、コースが分かれているなら 2 セットに」候補。
 * 対象は平日 (月〜金) に 4 日以上のコマがあり、どのコマもまだセットに
 * 載っていない学年。土曜 (特訓・プレップ) は別コース扱いなので含めない。
 *
 * @returns {Array<{key, grade, label, groups: Array<{label, units, slotCount}>,
 *                  slotCount: number}>}
 */
export function buildDaySplitSuggestions(allUnits, classSets, allSlots) {
  const assigned = collectAssignedSlotIds(classSets, allSlots);
  const freeUnits = (allUnits || []).filter((u) =>
    u.slots.every((s) => !assigned.has(s.id))
  );

  const byGrade = new Map();
  for (const u of freeUnits) {
    if (!SPLIT_DAYS.includes(u.day)) continue;
    if (!byGrade.has(u.grade)) byGrade.set(u.grade, []);
    byGrade.get(u.grade).push(u);
  }

  const out = [];
  for (const [grade, units] of byGrade) {
    const days = [...new Set(units.map((u) => u.day))].sort(
      (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)
    );
    const pairs = pairDaysIntoCourses(days);
    if (!pairs || pairs.length < 2) continue;
    const groups = pairs.map((pair) => {
      const gUnits = pair
        .map((d) => units.find((u) => u.day === d))
        .filter(Boolean);
      return {
        label: autoLabelFromUnits(gUnits),
        units: gUnits,
        slotCount: gUnits.reduce((acc, u) => acc + u.slots.length, 0),
      };
    });
    out.push({
      key: `split|${grade}|${days.join("")}`,
      grade,
      label: `${grade} を ${groups.map((g) => g.units.map((u) => u.day).join("")).join(" / ")} に分ける`,
      groups,
      slotCount: groups.reduce((acc, g) => acc + g.slotCount, 0),
    });
  }
  return out.sort((a, b) => b.slotCount - a.slotCount);
}
