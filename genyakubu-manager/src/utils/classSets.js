// ─── 授業セット (ClassSet) の解決 ────────────────────────────────────
// 授業セットは「第N回を通しで数えるコマの組」。定義の形は 2 つある。
//
//   - units 形式 (現行): { units: [{grade, day}, ...] }
//       「中3 の 火・木」のように (学年 × 曜日) で書く。コマの id を
//       参照しないので、期切替 (前期→後期) で新しい時間割にコマを作り
//       直しても紐付けが切れない。画面 (ClassSetManager) の選択単位が
//       もともと (学年, 曜日) なので、保存する形をそれに合わせただけ。
//   - slotIds 形式 (旧): { slotIds: [12, 34, ...] }
//       コマ id を直に並べる。期切替で作り直したコマには効かないため、
//       画面から units 形式へ変換できるようにしてある。読み取りは
//       引き続きサポートする (既存データを壊さない)。
//
// 期をまたいで同じ (学年, 曜日) のコマが並存しても問題ない:
// 回数カウント (sessionCount) は「その日に有効な時間割のコマ」だけを
// 数え、起点も所属時間割の開始日で決まるので、旧期のコマはセットに
// 入っていても新期のカウントには寄与しない。
// 逆に **同じ日に有効な時間割が 2 つあって、どちらにも同じ (学年, 曜日) の
// コマがある** 場合は 1 本のカウンタにまとまる。これは期切替の設定漏れ
// (旧期に終了日が入っていない) と同じ状態で、反映ダイアログが
// 「切替日以降も有効な時間割が他にあります」と警告する側の問題。
//
// 純粋関数のみ。UI (ClassSetManager) / 回数計算 (sessionCount) /
// 期切替 (regular-builder/reflect) / 時間割複製 (useTimetablesCrud) の
// 単一情報源。

/** units 形式のセットか (units が 1 件以上ある)。 */
export function isUnitBasedSet(cs) {
  return !!cs && Array.isArray(cs.units) && cs.units.length > 0;
}

/** 旧 slotIds 形式のセットか (units を持たず slotIds を持つ)。 */
export function isLegacySet(cs) {
  return !!cs && !isUnitBasedSet(cs) && Array.isArray(cs.slotIds);
}

/** {grade, day} の一意キー。unitKeyOf (classSetSuggestions) と同形式。 */
export function unitKey(grade, day) {
  return `${grade}|${day}`;
}

/** slots から units 形式の単位 ({grade, day}) を導出する (旧セットの変換用)。 */
export function unitsFromSlotIds(slotIds, slots) {
  const wanted = new Set(slotIds || []);
  const units = [];
  const seen = new Set();
  for (const s of slots || []) {
    if (!wanted.has(s.id) || !s.grade || !s.day) continue;
    const k = unitKey(s.grade, s.day);
    if (seen.has(k)) continue;
    seen.add(k);
    units.push({ grade: s.grade, day: s.day });
  }
  return units;
}

/**
 * セットに属する slot.id の一覧。
 * units 形式は「その (学年, 曜日) の全コマ」に毎回展開する
 * (期切替で作られた新しいコマも自動的に入る)。
 */
export function expandClassSetSlotIds(cs, slots) {
  if (isUnitBasedSet(cs)) {
    const keys = new Set(cs.units.map((u) => unitKey(u.grade, u.day)));
    const ids = [];
    for (const s of slots || []) {
      if (keys.has(unitKey(s.grade, s.day))) ids.push(s.id);
    }
    return ids;
  }
  return [...(cs?.slotIds || [])];
}

/**
 * slotId → 同じセットに属する slot.id 配列 の索引。
 * 1 つの slot が複数セットに載っている場合は先に定義されたセットを採る
 * (画面側で「各コマは 0 or 1 セット」を保っている)。
 *
 * @param {Array} classSets
 * @param {Array} slots 母集合 (全コマ)
 * @returns {Map<number, number[]>}
 */
export function buildClassSetIndex(classSets, slots) {
  const index = new Map();
  for (const cs of classSets || []) {
    const ids = expandClassSetSlotIds(cs, slots);
    if (ids.length === 0) continue;
    for (const id of ids) {
      if (!index.has(id)) index.set(id, ids);
    }
  }
  return index;
}
