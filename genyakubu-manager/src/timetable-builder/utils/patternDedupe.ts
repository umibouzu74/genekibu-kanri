// 生成案の重複排除 (N1h)。
//
// solver は seed 違いで numPatterns 案を生成するが、制約が厳しい構成では
// 複数 seed が同一の解に収束することがある。同じ案が別カードで並ぶと
// 「比較して選ぶ」ための枠を消費するだけなので、内容が同一の案は 1 枚に
// まとめ、何案が同内容だったかを duplicateCount で持つ。
import type { Schedule } from '../types';

// schedule を内容で正規化したキー。案の同一性は「どのセルに何の科目を
// 誰が持つか」で決まるため subject / teacher のみ比較する
// (locked 等の付帯フラグは案の中身に影響しない)。
export function scheduleContentKey(schedule: Schedule | null | undefined): string {
  const entries = Object.entries(schedule || {})
    .filter(([, e]) => e && (e.subject || e.teacher))
    .map(([key, e]) => [key, e.subject || '', e.teacher || ''])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

// 同一内容の案を 1 件にまとめる。先頭出現を残し (呼び出し側のソート順を
// 尊重)、まとめた件数を duplicateCount (自身含む) として付与する。
export function dedupePatterns<T extends { schedule: Schedule | null }>(
  patterns: T[],
): Array<T & { duplicateCount: number }> {
  const byKey = new Map<string, T & { duplicateCount: number }>();
  const result: Array<T & { duplicateCount: number }> = [];
  for (const pat of patterns) {
    const key = scheduleContentKey(pat.schedule);
    const hit = byKey.get(key);
    if (hit) {
      hit.duplicateCount += 1;
    } else {
      const entry = { ...pat, duplicateCount: 1 };
      byKey.set(key, entry);
      result.push(entry);
    }
  }
  return result;
}
