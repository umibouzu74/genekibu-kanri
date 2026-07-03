// L3e: 部分解の未充填内訳。
//
// 生成結果が部分解のとき、従来は「159/168 コマ」と最初の詰まり 1 セル
// (stuckSlot) しか出ず、残りの空きセルはグリッドを目視で探すしかなかった。
// パターンの schedule と生成対象タブの実効 config から「どのセルが埋まらな
// かったか」「科目別に何コマ不足か」を集計する。
//
// 未充填の判定は solver のスロット構築 (autoGenerator) と同じ規則:
//   - 空 + locked は「この枠は空けておく」の意思表示 (F5w) → 数えない
//   - subject か teacher が欠けているセル → 未充填 (科目固定で講師だけ
//     埋まらなかったセルも含む)
import { makeKey } from './scheduleKey';
import type { EffectiveConfig, Schedule } from '../types';

export interface UnfilledCell {
  key: string;
  date: string;
  period: string;
  className: string;
}

export interface SubjectShortage {
  subject: string;
  missing: number;
}

export function summarizeUnfilled(
  schedule: Schedule | null | undefined,
  config: Pick<EffectiveConfig, 'dates' | 'periods' | 'classes' | 'subjectCounts'> | null | undefined,
): { cells: UnfilledCell[]; shortages: SubjectShortage[] } {
  if (!schedule || !config) return { cells: [], shortages: [] };
  const cells: UnfilledCell[] = [];
  // §M: 配置数はクラス別に持つ。全クラス合算だと「A クラスの超過」が
  // 「B クラスの不足」を相殺して不足が表示から消える (subjectOver 違反が
  // 併存する手動編集状態で発生)。
  const placedByClass: Record<number, Record<string, number>> = {};
  (config.dates || []).forEach(d => {
    (config.periods || []).forEach(p => {
      (config.classes || []).forEach(c => {
        const key = makeKey(d.id, p.id, c.id);
        const entry = schedule[key];
        if (entry?.subject) {
          const byClass = placedByClass[c.id] || (placedByClass[c.id] = {});
          byClass[entry.subject] = (byClass[entry.subject] || 0) + 1;
        }
        if (entry?.locked && !entry.subject) return; // 空ロック (F5w)
        if (!entry || !entry.subject || !entry.teacher) {
          cells.push({ key, date: d.label, period: p.label, className: c.label });
        }
      });
    });
  });
  // 科目別の不足 = Σ_クラス max(0, クォータ − そのクラスの配置数)。
  // 講師未定でも科目が入っていれば「配置済み」に数える (不足は科目枠の話)。
  const shortages = Object.entries(config.subjectCounts || {})
    .map(([subject, quota]) => ({
      subject,
      missing: (config.classes || []).reduce(
        (sum, c) => sum + Math.max(0, (Number(quota) || 0) - (placedByClass[c.id]?.[subject] || 0)),
        0),
    }))
    .filter(s => s.missing > 0);
  return { cells, shortages };
}
