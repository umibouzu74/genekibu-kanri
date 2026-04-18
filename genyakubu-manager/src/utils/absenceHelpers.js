// 欠勤組み換えワークフロー用のヘルパ群。
// AbsenceWorkflowView から使われるが、ロジックだけ切り出してテスト可能に。

import { getSlotTeachers } from "./biweekly";
import { pickSubjectId } from "./subjectMatch";

// 指定日 (YYYY-MM-DD) の曜日に、指定先生群が担当するスロット id 集合を返す。
// 隔週パートナーも `getSlotTeachers` が抽出する。
// date が null の場合は空集合。
export function getAbsentSlotIds(slots, dayOfDate, absentTeachers) {
  const out = new Set();
  if (!dayOfDate || !Array.isArray(absentTeachers) || absentTeachers.length === 0) {
    return out;
  }
  const teacherSet = new Set(absentTeachers);
  for (const s of slots) {
    if (s.day !== dayOfDate) continue;
    const ts = getSlotTeachers(s);
    if (ts.some((t) => teacherSet.has(t))) out.add(s.id);
  }
  return out;
}

// 2 つのコマが「右クリック合同候補」として有効かを判定する。
// 同日・同学年・同教科 (科目IDまたは文字列同一) であれば OK。
// cls の差異は許容 (S/A/B、文系/理系 の合同を許すため)。
// 同一スロット / day 違い / grade 違い はすべて false。
export function canCombineSlots(a, b, subjects = []) {
  if (!a || !b) return false;
  if (a.id === b.id) return false;
  if (a.day !== b.day) return false;
  if (a.grade !== b.grade) return false;

  // 教科の照合: 科目マスタ経由での subjectId マッチを優先。
  // 双方が未マッチなら文字列完全一致で fallback。
  const aId = pickSubjectId(a.subj, subjects);
  const bId = pickSubjectId(b.subj, subjects);
  if (aId != null && bId != null) return aId === bId;
  if (aId == null && bId == null) return (a.subj || "") === (b.subj || "");
  return false;
}

// 同日のコマ群から、与えられたスロットに対する合同候補を返す。
// 候補は canCombineSlots に通ったコマ全て。既に別の combine adjustment で
// 吸収されているコマは除外する (`absorbedSlotIds`)。
export function findCombineCandidates(slot, daySlots, subjects = [], absorbedSlotIds = new Set()) {
  return daySlots.filter(
    (o) =>
      o.id !== slot.id &&
      !absorbedSlotIds.has(o.id) &&
      canCombineSlots(slot, o, subjects)
  );
}
