import React from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeExternalKey, countTeacherHoursWithCombined } from '../utils/scheduleKey';

function SummaryTable({ target, config, combinedGroups }) {
  const totals = countTeacherHoursWithCombined(target, config, combinedGroups);
  // 未定を除外
  delete totals["未定"];
  return (
    <div className="bg-white p-4 border rounded">
      <h3 className="font-bold mb-2">📊 この案の集計</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(totals).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([n, c]) => (
          <span key={n} className="bg-blue-100 px-2 rounded text-sm">{n}:{c}</span>
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
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded">
            <h3 className="font-bold text-indigo-800 mb-2">📊 講師別コマ数 (全タブ合計)</h3>
            <div className="flex flex-wrap gap-2">
              {project.teachers.filter(t => t.name !== "未定").map(t => {
                let total = 0;
                currentConfig.dates.forEach(d => { total += analysis.teacherDailyCounts[makeExternalKey(d, t.name)]?.total || 0; });
                if (total === 0) return null;
                return (
                  <div key={t.name} className="bg-white px-2 py-1 rounded border shadow-sm text-sm flex items-center gap-2">
                    <span className="font-bold">{t.name}</span>
                    <span className="bg-blue-100 text-blue-800 px-1 rounded">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {generatedPatterns.length > 0 && (
        <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-200 rounded no-print">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-purple-900">✨ 自動生成の結果 ({generatedPatterns.length}案)</h3>
            <button onClick={() => setGeneratedPatterns([])} className="text-sm text-gray-500 underline">キャンセル</button>
          </div>
          {generatedPatterns.some(p => p.isPartial) && (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800">
              ⚠️ 完全解が見つからなかった案があります。部分解として可能な範囲で埋めた結果を表示しています。
            </div>
          )}
          <div className={`grid grid-cols-1 gap-4 ${generatedPatterns.length >= 3 ? 'md:grid-cols-3' : generatedPatterns.length === 2 ? 'md:grid-cols-2' : ''}`}>
            {generatedPatterns.map((pat, i) => (
              <div key={i} className={`bg-white p-3 rounded border shadow-sm hover:shadow-md transition-shadow ${pat.isPartial ? 'border-yellow-300' : ''}`}>
                <div className="font-bold text-center mb-2 text-gray-700">
                  案 {i + 1}
                  {pat.isPartial && (
                    <span className="ml-2 text-xs font-normal text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                      部分解 ({pat.filledCount}/{pat.totalSlots}コマ充填)
                    </span>
                  )}
                  {!pat.isPartial && (
                    <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded">
                      完全解
                    </span>
                  )}
                </div>
                <SummaryTable target={pat.schedule} config={currentConfig} combinedGroups={project.combinedGroups || []} />
                <button onClick={() => { applyPattern(pat.schedule); setGeneratedPatterns([]); showToast(`案 ${i + 1} を適用しました`); }} className={`w-full mt-2 py-1 text-white rounded text-sm font-bold ${pat.isPartial ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-purple-600 hover:bg-purple-700'}`}>
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
