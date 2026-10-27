// 他学年セッション (予備校・高校など、講習の外の授業) の形の決まり (2026-10-27)。
//
// メモ (memo) と講座名 (course) を分けて持つ。メモはプリセットの名前
// (「Ⅰ期 予備校３限」) で、講座名はそのコマの授業 (「高3 共通テスト理科基礎(物理基礎)」)。
// 以前はメモ 1 つに両方を入れていて、プリセットを直したときのメモの同期
// (presetRenameSync = メモがプリセットの名前と一致することが前提) が効かなかった。
//
// 表示 (本体の月間の「外」カード・講師別 Excel) は「メモ + 講座名」。
// 日付プールの「外部授業だけの日」(DateEntity.externalOnly) の判定もここに置く。
// 同じ内容の判定 (重複登録を飛ばす) は contentKey の 1 か所 (reducer・登録画面・
// 表の一括登録・他校舎の取り込みが共有する)。
//
// 無依存 (型だけ) なので scheduleKey.migrateProject から使える。

import type { DateEntity, Entity, ExternalSession, ExternalSessionPreset } from '../types';

// ─── 外部授業だけの日 (日付プールの印、2026-10-27) ───────────────────

/** 外部授業だけの日か (どのタブの時間割にも出さない日) */
export function isExternalOnlyDate(d: Entity | DateEntity | null | undefined): boolean {
  return (d as DateEntity | null | undefined)?.externalOnly === true;
}

type SessionLike = Pick<ExternalSession, 'date' | 'teacherName'> &
  Partial<Pick<ExternalSession, 'label' | 'memo' | 'course' | 'startTime' | 'endTime'>>;

/** 同じ内容か (重複登録を飛ばす) の判定キー */
export function externalSessionContentKey(s: SessionLike): string {
  return JSON.stringify([
    s.date,
    s.teacherName,
    s.label || '',
    s.memo || '',
    s.course || '',
    s.startTime || '',
    s.endTime || '',
  ]);
}

/** 講座名の正規化 (前後の空白を落とす。文字列でなければ空) */
export function normalizeSessionCourse(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 種別 (メモ → プリセットの名前 → 「外部」) */
export function sessionKindLabel(
  s: Partial<Pick<ExternalSession, 'memo'>>,
  presetMemo?: string | null,
): string {
  return s.memo || presetMemo || '外部';
}

/** 表示 (種別 + 講座名)。「Ⅰ期 予備校３限 高3 共通テスト理科基礎(物理基礎)」 */
export function sessionDisplayLabel(
  s: Partial<Pick<ExternalSession, 'memo' | 'course'>>,
  presetMemo?: string | null,
): string {
  const kind = sessionKindLabel(s, presetMemo);
  const course = normalizeSessionCourse(s.course);
  return course ? `${kind} ${course}` : kind;
}

// ─── メモに入れていた講座名を分ける ─────────────────────────────

export interface CourseSplitAssignment {
  sessionId: number;
  memo: string;
  course: string;
}

const normTime = (v: string | null | undefined): string | null => (v ? v : null);

/**
 * 講座名の欄ができる前に「プリセットの名前 + 講座名」をメモ 1 つに入れていた
 * セッションを、メモ (プリセットの名前) と講座名に分ける組を返す。
 *
 * - 講座名の入っていないセッションだけ
 * - メモが「プリセットの名前 + 空白 + 残り」で始まる (最も長く一致した名前)。
 *   メモがどれかのプリセットの名前そのものなら分けない
 * - その名前のプリセットに時刻があれば、セッションの時刻も一致する
 *   (presetRenameSync と同じ安全側: 同じ名前で始まるだけの別の授業を分けない)。
 *   合わなければ短い名前へ逃げずに分けない
 */
export function computeCourseSplit(
  sessions: ExternalSession[] | null | undefined,
  presets: ExternalSessionPreset[] | null | undefined,
): CourseSplitAssignment[] {
  const labels = (presets || [])
    .map(p => ({ label: (p.memo || p.name || '').trim(), start: normTime(p.startTime), end: normTime(p.endTime) }))
    .filter(p => p.label);
  const exact = new Set(labels.map(p => p.label));
  const out: CourseSplitAssignment[] = [];
  for (const s of sessions || []) {
    if (!s || normalizeSessionCourse(s.course)) continue;
    const memo = typeof s.memo === 'string' ? s.memo.trim() : '';
    // 「Ⅰ期 予備校３限」を「Ⅰ期」+「予備校３限」にしない
    if (!memo || exact.has(memo)) continue;
    const prefixes = labels.filter(p =>
      memo.length > p.label.length && memo.startsWith(p.label) && /^\s/.test(memo.slice(p.label.length)));
    if (prefixes.length === 0) continue;
    const longest = Math.max(...prefixes.map(p => p.label.length));
    const best = prefixes.filter(p => p.label.length === longest);
    const timeOk = best.some(p => !p.start || (normTime(s.startTime) === p.start && normTime(s.endTime) === p.end));
    if (!timeOk) continue;
    const label = best[0].label;
    const course = memo.slice(label.length).trim();
    if (course) out.push({ sessionId: s.id, memo: label, course });
  }
  return out;
}
