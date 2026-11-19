// ─── 同じ内容のコマ (重複) の検出と整理 (2026-11-19、P1-2) ─────────────
// 時間割の削除は「コマをデフォルト時間割 (id 1) へ移す」だけだったので、複製で
// 作った時間割を消すと、複製元と同じコマがデフォルト側に二重に入った
// (2026 1学期に 151 組)。担当変更・Cmd+K に同じコマが 2〜3 行並ぶ原因。
//
// 「同じ内容」= 同じ時間割の中で、曜日・時刻・学年・クラス・科目・講師・教室と、
// 備考 (隔週の相手を含む)・担当の切り替え・回数や実施日の設定まで一致するコマ。
// 隔週の相手や担当の切り替えが違うものは別のコマ。**自動では消さない** — どちらを
// 残すかは人が見て選ぶ (参照されている側 = 代行や調整が付いている側が既定)。

import { canonicalTimeRange } from "./dateHelpers";
import { normalizeTeacherChanges, splitTeacherField } from "./biweekly";
import { stableStringify } from "./stableStringify";

/**
 * コマの中身のキー (id を除く)。時間割は timetableId で上書きできる (移す先で
 * 同じコマがあるかを見るとき)。講師は「・」入力を "·" に、時刻は "9:30" と
 * "09:30" を同じにそろえる。
 * @param {import("../types").Slot} slot
 * @param {number} [timetableId]
 * @returns {string}
 */
export function slotContentKey(slot, timetableId) {
  if (!slot) return "";
  // eslint-disable-next-line no-unused-vars
  const { id, timetableId: ownTimetable, teacher, time, teacherChanges, ...rest } = slot;
  const changes = normalizeTeacherChanges(teacherChanges);
  return stableStringify({
    ...rest,
    timetableId: timetableId ?? ownTimetable ?? 1,
    teacher: splitTeacherField(teacher).join("·"),
    time: canonicalTimeRange(time),
    note: String(rest.note ?? "").trim(),
    cls: rest.cls || "",
    room: rest.room || "",
    ...(changes.length > 0 ? { teacherChanges: changes } : {}),
  });
}

/**
 * 同じ時間割の中の同じ内容のコマの組。各組はコマ id の昇順、組は時間割 →
 * 先頭のコマ id の順。2 つ以上ある組だけ返す。
 * @param {import("../types").Slot[]} slots
 * @returns {{timetableId: number, key: string, slots: import("../types").Slot[]}[]}
 */
export function findDuplicateSlotGroups(slots) {
  const byKey = new Map();
  for (const s of slots || []) {
    if (!s || s.id == null) continue;
    const key = slotContentKey(s);
    let list = byKey.get(key);
    if (!list) byKey.set(key, (list = []));
    list.push(s);
  }
  const out = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.id - b.id);
    out.push({ timetableId: sorted[0].timetableId ?? 1, key, slots: sorted });
  }
  return out.sort((a, b) => a.timetableId - b.timetableId || a.slots[0].id - b.slots[0].id);
}

/**
 * コマを別の時間割へ移したとき、移す先に同じ内容のコマが既にある数。
 * @param {import("../types").Slot[]} moving 移すコマ
 * @param {import("../types").Slot[]} slots 全コマ
 * @param {number} targetTimetableId
 */
export function countDuplicatesInTarget(moving, slots, targetTimetableId) {
  const targetKeys = new Set(
    (slots || [])
      .filter((s) => (s.timetableId ?? 1) === targetTimetableId)
      .map((s) => slotContentKey(s))
  );
  return (moving || []).filter((s) => targetKeys.has(slotContentKey(s, targetTimetableId))).length;
}

/**
 * 組ごとに残すコマを決める既定。参照 (代行・調整・回数補正・休講日の例外・旧式の
 * 授業セット) の多いコマ、同じなら id の小さいコマ。
 * @param {{slots: import("../types").Slot[]}} group
 * @param {Map<string, number>} refCounts orphanCleanup.countSlotReferences
 * @param {"refs" | "lowest" | "highest"} [rule]
 * @returns {number} 残すコマの id
 */
export function defaultKeepSlotId(group, refCounts, rule = "refs") {
  const list = group?.slots || [];
  if (list.length === 0) return null;
  if (rule === "lowest") return list[0].id;
  if (rule === "highest") return list[list.length - 1].id;
  const refs = (s) => refCounts?.get(String(s.id)) || 0;
  return list.reduce((best, s) => (refs(s) > refs(best) ? s : best), list[0]).id;
}

/**
 * 組ごとの「残すコマ」から、消すコマの id を並べる。
 * @param {{key: string, slots: import("../types").Slot[]}[]} groups
 * @param {Map<string, number>} keepByKey 組のキー → 残すコマの id
 * @returns {number[]}
 */
export function slotIdsToRemove(groups, keepByKey) {
  const out = [];
  for (const g of groups || []) {
    const keep = keepByKey.get(g.key);
    if (keep == null) continue;
    for (const s of g.slots) if (s.id !== keep) out.push(s.id);
  }
  return out;
}
