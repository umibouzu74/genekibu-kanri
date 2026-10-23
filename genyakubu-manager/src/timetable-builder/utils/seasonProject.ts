// 季節の project を読むための純関数 (本体の hooks/useBuilderProjects と
// 講習時間割作成の季節の切替バーが共有する)。
//
// - inferProjectSeason: 旧版の単一 project がどの季節のものか (移行先を決める)
// - summarizeSeasonProject: 季節の切替バーに出す名前・期間・コマ数

import { parseDateLabel, projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';
import { LEGACY_PROJECT_STORAGE_KEYS } from './constants';
import { KOSHU_SEASONS, defaultKoshuSeason, seasonOfMonth, type KoshuSeason } from './seasons';
import type { Project } from '../types';

const NAME_HINTS: Array<[RegExp, KoshuSeason]> = [
  [/春/, 'spring'],
  [/夏/, 'summer'],
  [/冬/, 'winter'],
];

function parseIsoDate(value: unknown): Date | null {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * project がどの季節の講習か。決め方は上から:
 * 1. タブが使う日付 (無ければプールの全日) の月で多数決 (7/29 → 夏期、12/25 と
 *    1/6 → 冬期)。夏期を冬期に作り替えている途中で両方の日付があっても、日数の
 *    多い方に寄せる
 * 2. 名前の「春」「夏」「冬」
 * 3. 最終編集日 (無ければ fallbackDate) のころに準備していた講習 (defaultKoshuSeason)
 */
export function inferProjectSeason(
  project: Partial<Pick<Project, 'dates' | 'periods' | 'tabs' | 'name' | 'updatedAt' | 'createdAt'>> | null | undefined,
  fallbackDate: Date = new Date(),
): KoshuSeason {
  const used = [...usedDateLabels(project as Project)];
  const labels = used.length > 0 ? used : (project?.dates || []).map(d => d.label);
  const votes = new Map<KoshuSeason, number>();
  for (const label of labels) {
    const p = parseDateLabel(label);
    if (!p) continue;
    const s = seasonOfMonth(p.month);
    votes.set(s, (votes.get(s) || 0) + 1);
  }
  const top = Math.max(0, ...votes.values());
  const leaders = KOSHU_SEASONS.map(s => s.key).filter(k => (votes.get(k) || 0) === top && top > 0);
  if (leaders.length === 1) return leaders[0];

  const name = String(project?.name ?? '');
  const byName = NAME_HINTS.find(([re, s]) => re.test(name) && (leaders.length === 0 || leaders.includes(s)));
  if (byName) return byName[1];

  const edited = parseIsoDate(project?.updatedAt) || parseIsoDate(project?.createdAt) || fallbackDate;
  const byDate = defaultKoshuSeason(edited);
  if (leaders.length === 0 || leaders.includes(byDate)) return byDate;
  return leaders[0];
}

/**
 * この端末に残った季節に分ける前の project (旧キー) のうち、reference (季節へ移した
 * project / クラウドの旧ノードの project) より新しくないものだけを消す。新しい控え
 * (= クラウドに届かなかった編集を含みうる。オフラインの編集・管理者でないときの編集)
 * は残す。新しさは updatedAt で比べ、どちらかに無ければ消さない。消した数を返す
 */
export function removeStaleLegacyCopies(
  reference: Partial<Pick<Project, 'updatedAt'>> | null | undefined,
  keys: readonly string[] = LEGACY_PROJECT_STORAGE_KEYS,
): number {
  const refAt = typeof reference?.updatedAt === 'string' ? reference.updatedAt : null;
  if (!refAt) return 0;
  let removed = 0;
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      const at = JSON.parse(raw)?.updatedAt;
      if (typeof at === 'string' && at <= refAt) {
        localStorage.removeItem(key);
        removed += 1;
      }
    } catch {
      // 読めない控えは残す (手で直せる余地を残す)
    }
  }
  return removed;
}

export interface SeasonProjectSummary {
  name: string;
  /** どれかのタブが使う日の最初と最後 ("YYYY-MM-DD")。日付が無ければ null */
  firstYmd: string | null;
  lastYmd: string | null;
  /** 使う日の数 */
  dateCount: number;
  /** 科目か講師の入ったマスの数 (全タブ) */
  cellCount: number;
  /** 最終編集日時 (ISO) */
  updatedAt: string | null;
}

export function summarizeSeasonProject(
  project: Project | null | undefined,
  { todayYmd }: { todayYmd?: string | null } = {},
): SeasonProjectSummary | null {
  if (!project || !Array.isArray(project.tabs)) return null;
  const used = usedDateLabels(project);
  const baseYmd = projectBaseYmd(project, todayYmd);
  const ymds = baseYmd
    ? [...resolveDateLabelsYmd(used, baseYmd).values()].filter((v): v is string => typeof v === 'string').sort()
    : [];
  let cellCount = 0;
  for (const tab of project.tabs) {
    for (const entry of Object.values(tab.schedule || {})) {
      if (entry && (entry.subject || entry.teacher)) cellCount += 1;
    }
  }
  return {
    name: typeof project.name === 'string' ? project.name : '',
    firstYmd: ymds[0] ?? null,
    lastYmd: ymds[ymds.length - 1] ?? null,
    dateCount: used.size,
    cellCount,
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : null,
  };
}

// "2026-07-21" + "2026-08-25" → "2026/7/21〜8/25" (年が変わらなければ後ろの年は省く。
// 冬期は "2025/12/24〜2026/1/7")
export function formatSeasonRange(firstYmd: string | null, lastYmd: string | null): string {
  if (!firstYmd || !lastYmd) return '';
  const [fy, fm, fd] = firstYmd.split('-').map(Number);
  const [ly, lm, ld] = lastYmd.split('-').map(Number);
  const head = `${fy}/${fm}/${fd}`;
  if (firstYmd === lastYmd) return head;
  return fy === ly ? `${head}〜${lm}/${ld}` : `${head}〜${ly}/${lm}/${ld}`;
}
