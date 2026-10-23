import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useUI } from '../contexts/uiContextValue';
import { KOSHU_SEASONS, koshuSeasonDef, seasonStorage, suggestSeasonProjectName, type KoshuSeason } from '../utils/seasons';
import { formatSeasonRange, summarizeSeasonProject } from '../utils/seasonProject';
import { buildFreshSeasonProject } from '../utils/seasonStart';
import { loadTemplates } from '../utils/templates';
import { validateProjectShape } from '../utils/projectSchema';
import { mergeImportedTemplates, parseProjectFile } from '../utils/projectFile';
import { loadInitialProject } from '../hooks/projectFactory';
import type { SeasonProjects } from './SeasonBar';
import type { Project } from '../types';

// まだ作っていない季節の始め方 (2026-10-23)。季節ごとに別の時間割なので、
// 初めて開いた季節では勝手に既定の project を作らず、人に選んでもらう:
//   - ほかの季節の講習から設定を写す (講師・クラス・科目・時限。日付と時間割は空)
//   - テンプレートから (同じく設定だけ)
//   - JSON ファイルを開く (バックアップをそのまま)
//   - 初期値から (💾 現在の設定を初期値にする で保存したもの、無ければ見本の設定。
//     リセットした後と同じ中身で、日付も初期値のまま。名前だけ入れる)
// どれも onStart に project を渡すだけ。保存は BuilderApp が ProjectProvider を
// その project で開いたときに行う (hooks/useHistoryStack の initialProject)。
export default function SeasonStartPanel({
  season,
  seasonProjects,
  onStart,
  today = new Date(),
}: {
  season: KoshuSeason;
  seasonProjects?: SeasonProjects;
  onStart: (project: Project, message: string) => void;
  today?: Date;
}) {
  const { showToast } = useUI();
  const def = koshuSeasonDef(season);
  const [name, setName] = useState(() => suggestSeasonProjectName(season, today));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templates = useMemo(() => loadTemplates(), []);

  const sources = KOSHU_SEASONS
    .filter(s => s.key !== season)
    .map(s => ({ def: s, entry: seasonProjects?.[s.key] }))
    .filter(({ entry }) => (entry?.status === 'ready' || entry?.status === 'legacy') && entry.project);

  const projectName = name.trim() || suggestSeasonProjectName(season, today);

  const startFrom = (source: Project, from: string) => {
    onStart(
      buildFreshSeasonProject(source, { name: projectName, now: today }),
      `${from}の設定を写して「${projectName}」を作りました。⚙️ 設定 > 基本設定 で講習の日付を作ってください`,
    );
  };

  const startFromTemplate = (tpl: { name: string; payload: unknown }) => {
    const { valid, error } = validateProjectShape(tpl.payload);
    if (!valid) {
      showToast(`テンプレートのデータが壊れています: ${error}`, 'error', 4000);
      return;
    }
    startFrom(tpl.payload as Project, `テンプレート「${tpl.name}」`);
  };

  const startFromDefaults = () => {
    // この季節のキーはまだ無いので、初期値 (保存した初期値 → 無ければ既定) が返る
    const { project } = loadInitialProject(seasonStorage(season));
    onStart(
      { ...project, name: projectName },
      `初期値から「${projectName}」を作りました。日付は初期値のままなので、⚙️ 設定 > 基本設定 で作り直してください`,
    );
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const parsed = parseProjectFile(String(ev.target?.result ?? ''));
      if ('error' in parsed) {
        showToast(parsed.error, 'error', 5000);
        return;
      }
      const imported = mergeImportedTemplates(parsed.templates);
      onStart(
        parsed.project,
        `「${f.name}」を${def.label}として開きました` + (imported > 0 ? ` (テンプレート ${imported} 件を取り込みました)` : ''),
      );
    };
    r.onerror = () => showToast('読み込みエラー', 'error');
    r.readAsText(f);
  };

  const cardCls = 'w-full text-left rounded-lg border border-builder-border bg-builder-surface px-4 py-3 hover:border-builder-blue hover:bg-builder-info-soft';

  return (
    <section
      aria-labelledby="builder-season-start-title"
      className="bg-builder-surface p-6 rounded-lg border border-builder-border shadow-sm max-w-3xl"
    >
      <h2 id="builder-season-start-title" className="text-lg font-bold text-builder-ink mb-1">
        <span aria-hidden="true">{def.icon}</span> {def.label}の時間割はまだありません
      </h2>
      <p className="text-sm text-builder-ink-muted mb-4">
        講習の時間割は春期・夏期・冬期で別々に保存されます。始め方を選んでください。
        ほかの講習やテンプレートから始めると、講師・学年タブ (クラスとコマ数)・科目・時限を引き継ぎ、
        日付と時間割は空から始まります (日付は ⚙️ 設定 &gt; 基本設定 の「⚡ 期間から自動生成」で作れます)。
      </p>

      <div className="mb-5 max-w-sm">
        <label htmlFor="builder-season-start-name" className="block text-xs font-bold text-builder-ink mb-1">プロジェクト名</label>
        <input
          id="builder-season-start-name"
          aria-describedby="builder-season-start-name-hint"
          className="w-full border border-builder-border rounded px-3 py-2 text-sm focus:outline-none focus:border-builder-blue"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestSeasonProjectName(season, today)}
        />
        <p id="builder-season-start-name-hint" className="mt-1 text-[11px] text-builder-ink-muted">
          写して始めるとき・初期値から始めるときの名前です (JSON ファイルを開くときはファイルの中の名前のまま)
        </p>
      </div>

      {sources.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-bold text-builder-ink mb-2">ほかの講習から写す (おすすめ)</h3>
          <ul className="space-y-2">
            {sources.map(({ def: s, entry }) => {
              const project = entry!.project as Project;
              const summary = summarizeSeasonProject(project);
              const range = summary ? formatSeasonRange(summary.firstYmd, summary.lastYmd) : '';
              return (
                <li key={s.key}>
                  <button type="button" className={cardCls} onClick={() => startFrom(project, s.label)}>
                    <div className="text-sm font-bold text-builder-ink">
                      <span aria-hidden="true">{s.icon}</span> {s.label}「{project.name || '(名前なし)'}」の設定を写して始める
                    </div>
                    <div className="text-xs text-builder-ink-muted">
                      講師 {project.teachers?.length ?? 0} 名 · タブ {(project.tabs || []).map(t => t.name).join(' / ')}
                      {range && ` · ${range} の講習`}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {templates.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-bold text-builder-ink mb-2">🗂 テンプレートから</h3>
          <ul className="space-y-2">
            {templates.slice().reverse().map(tpl => (
              <li key={tpl.id}>
                <button type="button" className={cardCls} onClick={() => startFromTemplate(tpl)}>
                  <div className="text-sm font-bold text-builder-ink">「{tpl.name}」の設定を写して始める</div>
                  <div className="text-xs text-builder-ink-muted">
                    講師 {tpl.payload?.teachers?.length ?? 0} 名 · タブ {tpl.payload?.tabs?.length ?? 0} つ
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-builder-border pt-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 text-sm font-bold rounded border border-builder-border bg-builder-surface text-builder-ink hover:bg-builder-surface-alt"
          title="💾 プロジェクト保存で書き出した JSON を、この季節の時間割としてそのまま開きます"
        >📂 JSON ファイルを開く</button>
        <button
          type="button"
          onClick={startFromDefaults}
          className="px-3 py-2 text-sm font-bold rounded border border-builder-border bg-builder-surface text-builder-ink hover:bg-builder-surface-alt"
        >初期値から始める</button>
        <p className="w-full text-[11px] text-builder-ink-muted">
          初期値 =「💾 現在の設定を初期値にする」で保存した設定 (無ければ見本の設定) で、リセットした後と同じ中身です。
          日付も初期値のまま入るので、始めたら ⚙️ 設定 &gt; 基本設定 で作り直してください。
        </p>
        <input type="file" accept=".json" ref={fileInputRef} onChange={handleFile} className="hidden" aria-hidden="true" tabIndex={-1} />
      </div>
    </section>
  );
}
