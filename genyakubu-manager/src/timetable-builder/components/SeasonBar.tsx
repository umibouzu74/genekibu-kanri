import { KOSHU_SEASONS, type KoshuSeason } from '../utils/seasons';
import { formatSeasonRange, summarizeSeasonProject } from '../utils/seasonProject';
import type { Project } from '../types';

/** 本体 (hooks/useBuilderProjects → utils/builderSeasons) が決めた季節ごとの状態 */
export type SeasonStatus = 'ready' | 'legacy' | 'missing' | 'loading';
export interface SeasonProjectEntry {
  status: SeasonStatus;
  source?: 'cloud' | 'local' | 'legacy' | null;
  project?: Project | null;
}
export type SeasonProjects = Partial<Record<KoshuSeason, SeasonProjectEntry>>;

// 季節ごとの 2 行目 (名前) と 3 行目 (期間・入ったコマ)。未作成・読み込み中は
// それだけを出す
function describe(entry: SeasonProjectEntry | undefined): { name: string; detail: string } {
  if (!entry || entry.status === 'loading') return { name: '読み込み中…', detail: '' };
  if (entry.status === 'missing') return { name: 'まだありません', detail: '押すと作り始められます' };
  const summary = summarizeSeasonProject(entry.project ?? null);
  if (!summary) return { name: '(読み込めないデータ)', detail: '' };
  const range = formatSeasonRange(summary.firstYmd, summary.lastYmd);
  const parts = [range || '日付なし'];
  if (summary.cellCount > 0) parts.push(`${summary.cellCount}コマ`);
  return {
    name: summary.name || '(名前なし)',
    detail: parts.join(' · '),
  };
}

// 講習の季節 (春期 / 夏期 / 冬期) の切替。季節ごとに別の時間割 (保存先も別) で、
// 押すとその季節の時間割を開く (BuilderApp が ProjectProvider を作り直す)。
// 紙面には出さない (印刷の見出しに季節の名前が載る)
export default function SeasonBar({
  season,
  onSeasonChange,
  seasonProjects,
}: {
  season: KoshuSeason;
  onSeasonChange?: (season: KoshuSeason) => void;
  seasonProjects?: SeasonProjects;
}) {
  return (
    // 3 つとも常に見えるよう横に等分する (スマホ幅でも選択中の季節をはみ出させない)
    <div role="group" aria-label="講習の季節" className="flex gap-2 mb-2 no-print">
      {KOSHU_SEASONS.map((s) => {
        const selected = s.key === season;
        const { name, detail } = describe(seasonProjects?.[s.key]);
        const missing = seasonProjects?.[s.key]?.status === 'missing';
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={selected}
            aria-label={`${s.label}: ${name}${detail ? ` (${detail})` : ''}`}
            onClick={() => { if (!selected) onSeasonChange?.(s.key); }}
            className={`flex-1 min-w-0 text-left rounded-lg border px-2 sm:px-3 py-2 transition-colors ${
              selected
                ? 'bg-builder-surface border-builder-blue border-2 shadow-sm'
                : 'bg-builder-surface-alt border-builder-border hover:bg-builder-surface hover:border-builder-blue'
            }`}
          >
            <div className={`text-sm font-bold truncate ${selected ? 'text-builder-blue' : 'text-builder-ink'}`}>
              <span aria-hidden="true">{s.icon}</span>{' '}
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            <div className={`text-xs truncate ${missing ? 'text-builder-ink-muted' : 'text-builder-ink'}`}>{name}</div>
            {detail && <div className="text-[11px] text-builder-ink-muted truncate">{detail}</div>}
          </button>
        );
      })}
    </div>
  );
}
