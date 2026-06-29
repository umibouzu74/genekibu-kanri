// E1d: 2 つの schedule (同一タブ・同一 config 前提) のセル単位の差分を出す純粋関数。
//
// schedule は { [key]: { subject, teacher, locked } } の map。
// 中身の比較は subject + teacher のみで行う (locked は UI フラグなので無視)。
// subject が空 / 無いセルは「未割当」として扱う。
//
// diffSchedules(from, to): from → to へ変化したセルの一覧を返す。
//   返り値: Array<{ key, type, before, after }>
//     - type 'added':   from に無く to にある (新たに割当)
//     - type 'removed': from にあり to に無い (割当が消えた)
//     - type 'changed': 両方にあるが subject か teacher が違う
//   before / after は { subject, teacher } | null。

const normalize = (entry) => {
  if (!entry || !entry.subject) return null;
  return { subject: entry.subject, teacher: entry.teacher || '' };
};

const sameEntry = (a, b) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.subject === b.subject && a.teacher === b.teacher;
};

export function diffSchedules(from, to) {
  const fromMap = from || {};
  const toMap = to || {};
  const keys = new Set([...Object.keys(fromMap), ...Object.keys(toMap)]);
  const diffs = [];
  for (const key of keys) {
    const before = normalize(fromMap[key]);
    const after = normalize(toMap[key]);
    if (sameEntry(before, after)) continue;
    let type;
    if (before === null) type = 'added';
    else if (after === null) type = 'removed';
    else type = 'changed';
    diffs.push({ key, type, before, after });
  }
  return diffs;
}

// 差分の種別ごとの件数を集計する。
export function summarizeDiff(diffs) {
  const counts = { added: 0, removed: 0, changed: 0, total: diffs.length };
  for (const d of diffs) {
    if (d.type in counts && d.type !== 'total') counts[d.type] += 1;
  }
  return counts;
}
