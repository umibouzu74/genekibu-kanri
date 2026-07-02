import { Fragment } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeExternalKey, countTeacherHoursWithCombined, activeDatesForTab, activePeriodsForTab } from '../utils/scheduleKey';
import { groupTeachersBySubject } from '../utils/groupTeachersBySubject';
import { summarizePatternLoad } from '../utils/patternLoad';

function SummaryTable({ target, config, combinedGroups, teachers, subjects }) {
  const totals = countTeacherHoursWithCombined(target, config, combinedGroups);
  delete totals["未定"];
  // 教科ごとにグループ化して表示。teachers/subjects は project から渡される。
  // totals に存在しない (= 0 コマ) 講師は省く。
  const teachersWithCount = (teachers || []).filter(t => t.name !== '未定' && (totals[t.name] || 0) > 0);
  const groups = groupTeachersBySubject(teachersWithCount, subjects);
  // 削除済み等の orphan (totals にはあるが project.teachers に存在しない名前)
  // を明示的に拾って警告グループとして表示する (code-review P3 — diff 前は
  // Object.entries(totals) で自動的に列挙されていたので、その feedback を維持)。
  const knownNames = new Set((teachers || []).map(t => t.name));
  const orphanNames = Object.keys(totals).filter(n => !knownNames.has(n) && (totals[n] || 0) > 0);
  // 講師コマ数の偏り (採用案を選ぶ際の判断材料)。spread が小さいほど均等。
  const load = summarizePatternLoad(totals);
  return (
    <div className="bg-builder-surface p-4 border border-builder-border rounded">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-bold text-builder-ink">📊 この案の集計</h3>
        {load.teacherCount > 0 && (
          <span
            className="text-[11px] text-builder-ink-muted whitespace-nowrap"
            title="講師ごとのコマ数の最多・最少とその差。差が小さいほど均等な配分です。"
          >
            最多 {load.max} / 最少 {load.min}
            <span className={load.spread === 0 ? 'text-builder-green font-bold ml-1' : 'ml-1'}>
              (偏り {load.spread})
            </span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {groups.map(group => (
          <Fragment key={group.key}>
            <div className="text-[11px] font-bold text-builder-ink-muted">━ {group.label}</div>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {[...group.teachers]
                .sort((a, b) => (totals[b.name] || 0) - (totals[a.name] || 0))
                .map(t => (
                  <span key={t.name} className="bg-builder-info-soft text-builder-ink px-2 rounded text-sm">
                    {t.name}:{totals[t.name]}
                  </span>
                ))}
            </div>
          </Fragment>
        ))}
        {orphanNames.length > 0 && (
          <>
            <div className="text-[11px] font-bold text-builder-red">⚠️ 不明な講師 (講師マスタに存在しない名前)</div>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {orphanNames.map(n => (
                <span key={n} className="bg-builder-danger-soft text-builder-red border border-builder-danger-border px-2 rounded text-sm">
                  {n}:{totals[n]}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 探索の手応えを 1 行で表す補助テキスト (E2f)。
function PatternStats({ pat }) {
  if (pat.iterations == null && !pat.stuckSlot) return null;
  return (
    <div className="text-[11px] text-builder-ink-muted text-center mb-2 -mt-1 space-y-0.5">
      {pat.iterations != null && (
        <div>
          探索 <span className="tabular-nums font-bold">{pat.iterations.toLocaleString()}</span> 回
          {pat.hitLimit && <span className="text-builder-orange font-bold ml-1">(上限到達)</span>}
        </div>
      )}
      {pat.stuckSlot && (
        <div title="この案で最初に埋められなかったコマ (制約がきつい箇所)">
          詰まり: <span className="font-bold text-builder-orange">{pat.stuckSlot.date} {pat.stuckSlot.period} {pat.stuckSlot.class}</span>
        </div>
      )}
    </div>
  );
}

export default function SummaryPanel({ showSummary, generatedPatterns, setGeneratedPatterns, generatedElapsedMs, generatedForTab }) {
  const {
    project,
    analysis,
    currentConfig,
    applyPattern,
  } = useProjectContext();
  const { showToast } = useUI();

  // 生成結果はタブ切替後もパネルに残るため、集計・採用は「今のタブ」ではなく
  // 生成元タブを基準にする。生成元タブが分からない (古い state) 場合は従来
  // どおりアクティブタブへフォールバック。
  const tabs = project.tabs || [];
  const forTab = generatedForTab
    ? tabs.find(t => t.id === generatedForTab.id)
    : (tabs.find(t => t.id === project.activeTabId) || tabs[0]);
  const forTabDeleted = Boolean(generatedForTab) && !forTab;
  const patternConfig = forTab
    ? {
        ...forTab.config,
        dates: activeDatesForTab(project.dates, forTab),
        periods: activePeriodsForTab(project.periods, forTab),
      }
    : currentConfig;
  const isOtherTab = forTab && forTab.id !== project.activeTabId;

  return (
    <>
      {showSummary && (() => {
        // 教科ごとにグループ化、'未定' は除外したいので予め filter してから group 化。
        const teachersForSummary = project.teachers.filter(t => t.name !== '未定');
        const groups = groupTeachersBySubject(teachersForSummary, project.subjects);
        return (
          <div className="mb-4 no-print animate-fade-in">
            <div className="p-4 bg-builder-info-soft border border-builder-info-border rounded">
              <h3 className="font-bold text-builder-ink mb-2">📊 講師別コマ数 (全タブ合計)</h3>
              <div className="flex flex-col gap-2">
                {groups.map(group => {
                  const entries = group.teachers.map(t => {
                    let total = 0;
                    // v4(Y): teacherDailyCounts は全タブ横断の集計。「全タブ合計」は
                    // 現タブの使う日 (currentConfig.dates) ではなく日付プール全体
                    // (project.dates) で合算しないと、他タブだけで使う日のコマが
                    // 漏れて undercount になる。
                    (project.dates || []).forEach(d => {
                      total += analysis.teacherDailyCounts[makeExternalKey(d.label, t.name)]?.total || 0;
                    });
                    return { t, total };
                  }).filter(x => x.total > 0);
                  if (entries.length === 0) return null;
                  return (
                    <Fragment key={group.key}>
                      <div className="text-xs font-bold text-builder-ink-muted">━ {group.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {entries.map(({ t, total }) => (
                          <div key={t.name} className="bg-builder-surface px-2 py-1 rounded border border-builder-border shadow-sm text-sm flex items-center gap-2">
                            <span className="font-bold text-builder-ink">{t.name}</span>
                            <span className="bg-builder-info-soft text-builder-ink px-1 rounded">{total}</span>
                          </div>
                        ))}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {generatedPatterns.length > 0 && (
        <div className="mb-4 p-4 bg-builder-bg border-2 border-builder-border rounded no-print">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-builder-ink">
              ✨ 自動生成の結果 ({generatedPatterns.length}案)
              {generatedForTab && (
                <span className="ml-2 text-xs font-normal text-builder-ink bg-builder-info-soft border border-builder-info-border px-2 py-0.5 rounded" aria-label="生成元のタブ">
                  対象タブ: {generatedForTab.name}
                </span>
              )}
              {generatedElapsedMs > 0 && (
                <span className="ml-2 text-xs font-normal text-builder-ink-muted" aria-label="生成にかかった時間">
                  ⏱ {(generatedElapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </h3>
            <button onClick={() => setGeneratedPatterns([])} className="text-sm text-builder-ink-muted underline">キャンセル</button>
          </div>
          {forTabDeleted && (
            <div className="mb-3 p-2 bg-builder-danger-soft border border-builder-danger-border rounded text-sm text-builder-red">
              ⚠️ 生成元のタブ「{generatedForTab.name}」は削除されたため、この結果は適用できません。
            </div>
          )}
          {isOtherTab && (
            <div className="mb-3 p-2 bg-builder-info-soft border border-builder-info-border rounded text-sm text-builder-ink">
              ℹ️ この結果は「{forTab.name}」タブ用です。採用すると「{forTab.name}」に適用され、そのタブへ切り替わります。
            </div>
          )}
          {generatedPatterns.some(p => p.isPartial) && (
            <div className="mb-3 p-2 bg-builder-warning-soft border border-builder-warning-border rounded text-sm text-builder-orange">
              ⚠️ 完全解が見つからなかった案があります。部分解として可能な範囲で埋めた結果を表示しています。
            </div>
          )}
          <div className={`grid grid-cols-1 gap-4 ${generatedPatterns.length >= 3 ? 'md:grid-cols-3' : generatedPatterns.length === 2 ? 'md:grid-cols-2' : ''}`}>
            {generatedPatterns.map((pat, i) => (
              <div key={i} className={`bg-builder-surface p-3 rounded border shadow-sm hover:shadow-md transition-shadow ${pat.isPartial ? 'border-builder-warning-border' : 'border-builder-border'}`}>
                <div className="font-bold text-center mb-2 text-builder-ink">
                  案 {i + 1}
                  {pat.isPartial && (
                    <span className="ml-2 text-xs font-normal text-builder-orange bg-builder-warning-soft px-2 py-0.5 rounded">
                      部分解 ({pat.filledCount}/{pat.totalSlots}コマ充填)
                    </span>
                  )}
                  {!pat.isPartial && (
                    <span className="ml-2 text-xs font-normal text-builder-green bg-builder-success-soft px-2 py-0.5 rounded">
                      完全解
                    </span>
                  )}
                </div>
                <PatternStats pat={pat} />
                <SummaryTable
                  target={pat.schedule}
                  config={patternConfig}
                  combinedGroups={project.combinedGroups || []}
                  teachers={project.teachers}
                  subjects={project.subjects}
                />
                <button
                  disabled={forTabDeleted}
                  onClick={() => {
                    applyPattern(pat.schedule, forTab?.id);
                    setGeneratedPatterns([]);
                    showToast(forTab ? `案 ${i + 1} を「${forTab.name}」に適用しました` : `案 ${i + 1} を適用しました`);
                  }}
                  className={`w-full mt-2 py-1 text-white rounded text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed ${pat.isPartial ? 'bg-builder-orange hover:bg-builder-orange-hover' : 'bg-builder-primary hover:bg-builder-primary-hover'}`}
                >
                  この案を採用
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
