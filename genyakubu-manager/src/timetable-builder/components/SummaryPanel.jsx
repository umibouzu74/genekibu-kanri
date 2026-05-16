import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeExternalKey, countTeacherHoursWithCombined } from '../utils/scheduleKey';

function SummaryTable({ target, config, combinedGroups }) {
  const totals = countTeacherHoursWithCombined(target, config, combinedGroups);
  // 未定を除外
  delete totals["未定"];
  return (
    <div className="bg-builder-surface p-4 border border-builder-border rounded">
      <h3 className="font-bold mb-2 text-builder-ink">📊 この案の集計</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(totals).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([n, c]) => (
          <span key={n} className="bg-builder-info-soft text-builder-ink px-2 rounded text-sm">{n}:{c}</span>
        ))}
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
      {showSummary && (
        <div className="mb-4 no-print animate-fade-in">
          <div className="p-4 bg-builder-info-soft border border-builder-info-border rounded">
            <h3 className="font-bold text-builder-ink mb-2">📊 講師別コマ数 (全タブ合計)</h3>
            <div className="flex flex-wrap gap-2">
              {project.teachers.filter(t => t.name !== "未定").map(t => {
                let total = 0;
                currentConfig.dates.forEach(d => { total += analysis.teacherDailyCounts[makeExternalKey(d.label, t.name)]?.total || 0; });
                if (total === 0) return null;
                return (
                  <div key={t.name} className="bg-builder-surface px-2 py-1 rounded border border-builder-border shadow-sm text-sm flex items-center gap-2">
                    <span className="font-bold text-builder-ink">{t.name}</span>
                    <span className="bg-builder-info-soft text-builder-ink px-1 rounded">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                <SummaryTable target={pat.schedule} config={currentConfig} combinedGroups={project.combinedGroups || []} />
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
