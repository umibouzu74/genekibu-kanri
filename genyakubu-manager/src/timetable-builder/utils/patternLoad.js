// 生成案ごとの「講師コマ数の偏り」を集計する純粋関数 (E2e companion)。
//
// 完全解は全て 100% 充填なので、複数案から採用案を選ぶ際の主な差別化点は
// 講師ごとのコマ数がどれだけ均等か。最多 / 最少 / その差 (spread) を出し、
// SummaryPanel が中立的な指標として表示する (「最良」の自動判定はしない —
// priorityClasses 等で意図的に偏らせるケースがあるため)。
//
// 引数 totals: { [teacherName]: コマ数 } (呼び出し側で '未定' は除外済み前提)。
// 戻り値: { teacherCount, max, min, spread }。
//   - 0 コマの講師は対象外。
//   - 対象講師が 0 人なら全て 0 を返す。
export function summarizePatternLoad(totals) {
  const counts = Object.values(totals || {}).filter((n) => typeof n === 'number' && n > 0);
  if (counts.length === 0) {
    return { teacherCount: 0, max: 0, min: 0, spread: 0 };
  }
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return {
    teacherCount: counts.length,
    max,
    min,
    spread: max - min,
  };
}
