// ─── 「そのコマは代行登録済みか」の判定 (代行登録フォーム 2 つで共有) ───
//
// 代行レコードは **コマ × 講師** の単位 (CLAUDE.md「欠勤・代行は「コマ × 講師」
// 単位」)。"香川·福江·川井" のような多担任コマは、1 人に記録が付いただけでは
// 残りの 2 人の穴が空いたままなので、フォームの一覧から消してはいけない。
// `getSubForSlot` (先頭 1 件だけ) で絞るとそれが起きる (1日分まとめて代行が
// これで壊れていた)。
import { getSlotTeachers } from "../../utils/biweekly";

/**
 * 同日のレコードから slotId → 登録済みの元講師名 Set を組む。
 * @param {Array} subs
 * @param {string} date
 * @param {{excludeSubId?: number|null}} [opts] 編集中のレコードは数えない
 * @returns {Map<number, Set<string>>}
 */
export function buildTakenSlotTeachers(subs, date, opts = {}) {
  const m = new Map();
  if (!date) return m;
  const { excludeSubId = null } = opts;
  for (const x of subs || []) {
    if (x.date !== date) continue;
    if (excludeSubId != null && x.id === excludeSubId) continue;
    if (!m.has(x.slotId)) m.set(x.slotId, new Set());
    m.get(x.slotId).add(x.originalTeacher);
  }
  return m;
}

/**
 * そのコマのその日の担当のうち、まだ代行レコードの無い講師。
 * @param {object} slot
 * @param {Map<number, Set<string>>} takenMap buildTakenSlotTeachers の結果
 * @param {string[]} [teachers] その日の担当 (隔週の A/B を解いた後)。省略時は講師欄
 * @returns {string[]}
 */
export function uncoveredTeachersForSlot(slot, takenMap, teachers) {
  const list = teachers || getSlotTeachers(slot);
  const taken = takenMap.get(slot.id);
  if (!taken || taken.size === 0) return list;
  // 単独担当のコマは、元講師名の表記が違っても (旧データ) 記録が 1 件あれば
  // 登録済みとみなす — 従来の単一コマフォームと同じ判定
  if (list.length <= 1) return [];
  return list.filter((t) => !taken.has(t));
}

/**
 * 担当講師の全員に代行レコードが付いていて、フォームに並べる必要が無いか。
 * @param {object} slot
 * @param {Map<number, Set<string>>} takenMap
 * @param {string[]} [teachers] その日の担当 (省略時は講師欄)
 */
export function isSlotFullyTaken(slot, takenMap, teachers) {
  return uncoveredTeachersForSlot(slot, takenMap, teachers).length === 0;
}
