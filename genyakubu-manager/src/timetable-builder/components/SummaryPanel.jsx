import { Fragment } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeExternalKey, countTeacherHoursWithCombined } from '../utils/scheduleKey';
import { groupTeachersBySubject } from '../utils/groupTeachersBySubject';

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
  return (
    <div className="bg-builder-surface p-4 border border-builder-border rounded">
      <h3 className="font-bold mb-2 text-builder-ink">📊 この案の集計</h3>
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

export default function SummaryPanel({ showSummary, generatedPatterns, setGeneratedPatterns }) {
  const {
    project,
    analysis,
    currentConfig,
    applyPattern,
  } = useProjectContext();
  const { showToast } = useUI();

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
                    currentConfig.dates.forEach(d => {
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
            <h3 className="font-bold text-builder-ink">✨ 自動生成の結果 ({generatedPatterns.length}案)</h3>
            <button onClick={() => setGeneratedPatterns([])} className="text-sm text-builder-ink-muted underline">キャンセル</button>
          </div>
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
                <SummaryTable
                  target={pat.schedule}
                  config={currentConfig}
                  combinedGroups={project.combinedGroups || []}
                  teachers={project.teachers}
                  subjects={project.subjects}
                />
                <button onClick={() => { applyPattern(pat.schedule); setGeneratedPatterns([]); showToast(`案 ${i + 1} を適用しました`); }} className={`w-full mt-2 py-1 text-white rounded text-sm font-bold ${pat.isPartial ? 'bg-builder-orange hover:bg-builder-orange-hover' : 'bg-builder-primary hover:bg-builder-primary-hover'}`}>
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
