// 時間割の強調表示 (L2a 講師 → L2g 教科も、2026-11-07)。
//
// ツールバーの「👁 強調表示」は 1 つの select で教科と講師を選ぶ。値は通常時間割
// 作成 (RegularBuilderApp の highlightKey) と同じく種類の接頭辞つきの文字列:
//   ''         … 強調なし
//   's:国語'   … 教科 (entry.subject が一致するセル)
//   't:堀上'   … 講師 (entry.teacher が一致するセル)
// 1 枚の紙に強調は 1 つ (複数教科の同時強調はしない)。選んだ値は BuilderApp の
// state だけに持ち、localStorage には保存しない (タブを切り替えても保つ)。
import type { Project, ScheduleEntry } from '../types';

export type HighlightKind = 'subject' | 'teacher';

export interface Highlight {
  kind: HighlightKind;
  value: string;
}

const PREFIX: Record<HighlightKind, string> = { subject: 's:', teacher: 't:' };

/** select の値 → 強調。空・知らない接頭辞・値なしは null */
export function parseHighlightKey(key: string | null | undefined): Highlight | null {
  if (!key) return null;
  for (const kind of Object.keys(PREFIX) as HighlightKind[]) {
    const p = PREFIX[kind];
    if (key.startsWith(p) && key.length > p.length) return { kind, value: key.slice(p.length) };
  }
  return null;
}

/** 強調 → select の値 */
export function highlightKeyOf(kind: HighlightKind, value: string): string {
  return `${PREFIX[kind]}${value}`;
}

/** そのセルが強調の対象か (強調なしなら false) */
export function cellMatchesHighlight(entry: Partial<ScheduleEntry> | undefined, h: Highlight | null): boolean {
  if (!h || !entry) return false;
  return h.kind === 'subject' ? entry.subject === h.value : entry.teacher === h.value;
}

/**
 * 選んでいる教科・講師がマスタから消えたか (改名・削除)。消えたまま残すと
 * 全セルが薄表示のまま何も光らず、select の値も選択肢に無い (§M と同じ)。
 */
export function isHighlightStale(h: Highlight | null, project: Pick<Project, 'subjects' | 'teachers'>): boolean {
  if (!h) return false;
  if (h.kind === 'subject') return !(project.subjects || []).includes(h.value);
  return !(project.teachers || []).some(t => t.name === h.value);
}
