import { parseKey, findEntityById, findCombinedGroup } from './scheduleKey';
import type { Schedule, Entity, CombinedGroup } from '../types';

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
export function summarizePatternLoad(
  totals: Record<string, number> | null | undefined,
): { teacherCount: number; max: number; min: number; spread: number } {
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

// N3f: 「その日 1 コマだけの出勤日」を持つ講師の集計。
// 塾講師の稼働効率 (1 コマのための出勤・交通費) に直結するが、従来は
// 総コマ数の偏りしか見えず、飛び石出勤に気づく指標が無かった。
// カウント規則は countTeacherHoursWithCombined と同じ
// (未定は除外・合同は同一 (日付, 時限, グループ) で 1 コマ扱い)。
// 戻り値は講師名 → 1 コマ出勤日のラベル配列 (該当講師のみ)。
export function summarizeSingleSlotDays(
  schedule: Schedule | null | undefined,
  config: { dates: Entity[]; periods?: Entity[]; classes: Entity[] },
  combinedGroups: CombinedGroup[] | null | undefined,
): Array<{ teacher: string; days: string[] }> {
  // (teacher, dateId) ごとのコマ数
  const perDay = new Map<string, { teacher: string; dateLabel: string; count: number }>();
  const counted = new Set<string>();
  Object.keys(schedule || {}).forEach(key => {
    const entry = schedule![key];
    if (!entry || !entry.teacher || entry.teacher === '未定') return;
    const parsed = parseKey(key);
    if (!parsed) return;
    const dateEnt = findEntityById(config.dates, parsed.dateId);
    const classEnt = findEntityById(config.classes, parsed.classId);
    if (!dateEnt || !classEnt) return;
    if (config.periods && !findEntityById(config.periods, parsed.periodId)) return;
    const group = findCombinedGroup(combinedGroups, entry.subject || '', classEnt.label, dateEnt.label);
    if (group) {
      const countKey = `${parsed.dateId}-${parsed.periodId}-${group.id}-${entry.teacher}`;
      if (counted.has(countKey)) return;
      counted.add(countKey);
    }
    const dayKey = JSON.stringify([entry.teacher, parsed.dateId]);
    const cur = perDay.get(dayKey);
    if (cur) cur.count += 1;
    else perDay.set(dayKey, { teacher: entry.teacher, dateLabel: dateEnt.label, count: 1 });
  });

  const byTeacher = new Map<string, string[]>();
  perDay.forEach(({ teacher, dateLabel, count }) => {
    if (count !== 1) return;
    const days = byTeacher.get(teacher) || [];
    days.push(dateLabel);
    byTeacher.set(teacher, days);
  });
  return [...byTeacher.entries()].map(([teacher, days]) => ({ teacher, days }));
}
