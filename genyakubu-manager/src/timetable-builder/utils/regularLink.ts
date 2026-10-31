// 講習のクラス → 通常授業のクラスの対応 (ClassEntity.regular、B1) の形の確認。
// 依存なし (scheduleKey.migrateProject と reducer から使う)。
import type { DayStreakRule, RegularClassLink } from '../types';

/** 学年が空なら null。classes は空白を落として重複なし */
export function normalizeRegularLink(raw: unknown): RegularClassLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { grade?: unknown; classes?: unknown };
  const grade = typeof r.grade === 'string' ? r.grade.trim() : '';
  if (!grade) return null;
  const classes: string[] = [];
  for (const c of Array.isArray(r.classes) ? r.classes : []) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v && !classes.includes(v)) classes.push(v);
  }
  return { grade, classes };
}

/** 「中3 SS・S」/「附中1 (全クラス)」 */
export function describeRegularLink(link: RegularClassLink | null | undefined): string {
  if (!link) return '';
  return link.classes.length > 0 ? `${link.grade} ${link.classes.join('・')}` : `${link.grade} (全クラス)`;
}

/**
 * 連続出勤日数の上限 (B2) の形をそろえる。maxDays が 1 以上の整数でない・対象が
 * 誰もいないルールは落とす。id が無ければ振る
 */
export function normalizeDayStreakRules(raw: unknown): DayStreakRule[] {
  if (!Array.isArray(raw)) return [];
  const out: DayStreakRule[] = [];
  let next = raw.reduce((m: number, r: any) => Math.max(m, Number(r?.id) || 0), 0) + 1;
  const strs = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()))] : [];
  const hm = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : '');
  for (const r of raw as any[]) {
    if (!r || typeof r !== 'object') continue;
    const maxDays = Math.round(Number(r.maxDays));
    if (!Number.isFinite(maxDays) || maxDays < 1) continue;
    const categories = strs(r.categories);
    const teachers = strs(r.teachers);
    if (categories.length === 0 && teachers.length === 0) continue;
    const rule: DayStreakRule = { id: Number(r.id) > 0 ? Number(r.id) : next++, maxDays };
    if (categories.length) rule.categories = categories;
    if (teachers.length) rule.teachers = teachers;
    const tabIds = Array.isArray(r.tabIds) ? r.tabIds.filter((x: unknown) => typeof x === 'number') : [];
    if (tabIds.length) rule.tabIds = tabIds;
    const fromTime = hm(r.fromTime);
    const toTime = hm(r.toTime);
    if (fromTime) rule.fromTime = fromTime;
    if (toTime) rule.toTime = toTime;
    out.push(rule);
  }
  return out;
}
