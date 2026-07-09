// §N: 科目コマ数 (クォータ) のクラス別解決。
//
// TabConfig.subjectCounts は「1 クラスあたりのコマ数」の全クラス共通値。
// classSubjectCounts (String(classId) → 科目 → コマ数) が設定されている
// クラス × 科目はそちらを優先し、無ければ共通値へフォールバックする。
// これにより同一タブに学年の違うクラス (中1 と中2 など) を混在させたまま
// クラスごとに必要コマ数を変えられる。
//
// クォータを読む側は subjectCounts を直接引かず、必ずここを経由すること
// (直接 `config.subjectCounts[s]` を読むとクラス別上書きを取りこぼす)。
import type { TabConfig } from '../types';

type QuotaConfig = Pick<TabConfig, 'subjectCounts' | 'classSubjectCounts'>;

// 共通値 (subjectCounts) の防御的な数値化。reducer は clamp 済みだが、
// 外部 JSON 由来の文字列・負数が混ざっても集計を狂わせない
// (旧 partialSummary の `Number(quota) || 0` 相当をここへ一元化)。
function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 指定クラス × 科目の実効コマ数 (上書き ?? 共通値 ?? 0)。 */
export function quotaForClass(
  config: QuotaConfig | null | undefined,
  classId: number,
  subject: string,
): number {
  if (!config) return 0;
  const override = config.classSubjectCounts?.[String(classId)]?.[subject];
  if (typeof override === 'number' && Number.isFinite(override)) return Math.max(0, override);
  return toCount(config.subjectCounts?.[subject]);
}

/**
 * 指定クラスの実効コマ数マップ (共通値に上書きを被せたもの)。
 * キーの母集合は subjectCounts (科目マスタは全タブで seed 済み) と
 * 上書きマップの和集合。solver の quotas 引数など「科目 → 数」の
 * Record を要求する既存 API へそのまま渡せる。
 */
export function quotasForClass(
  config: QuotaConfig | null | undefined,
  classId: number,
): Record<string, number> {
  const merged: Record<string, number> = {};
  Object.entries(config?.subjectCounts || {}).forEach(([subject, n]) => {
    merged[subject] = toCount(n);
  });
  const override = config?.classSubjectCounts?.[String(classId)];
  if (override) {
    Object.entries(override).forEach(([subject, n]) => {
      if (typeof n === 'number' && Number.isFinite(n)) merged[subject] = Math.max(0, n);
    });
  }
  return merged;
}

/** クラス別モードが有効か (空オブジェクト {} も「有効・上書きなし」)。 */
export function hasClassQuotaMode(config: QuotaConfig | null | undefined): boolean {
  const m = config?.classSubjectCounts;
  return !!m && typeof m === 'object' && !Array.isArray(m);
}

/** 1 つでも実際の上書きエントリを持つか (モード解除の確認ダイアログ用)。 */
export function hasClassQuotaOverrides(config: QuotaConfig | null | undefined): boolean {
  const m = config?.classSubjectCounts;
  if (!m) return false;
  return Object.values(m).some(byClass => byClass && Object.keys(byClass).length > 0);
}
