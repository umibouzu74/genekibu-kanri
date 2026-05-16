import React, { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeNgKey } from '../../utils/scheduleKey';

export default function NgSettings() {
  const {
    project,
    currentConfig,
    toggleTeacherNg,
  } = useProjectContext();

  // 折りたたみ状態: 各日付の開閉
  const [expandedDates, setExpandedDates] = useState(() => {
    const initial = {};
    currentConfig.dates.forEach(d => { initial[d] = true; });
    return initial;
  });

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const expandAll = () => {
    const all = {};
    currentConfig.dates.forEach(d => { all[d] = true; });
    setExpandedDates(all);
  };

  const collapseAll = () => {
    const all = {};
    currentConfig.dates.forEach(d => { all[d] = false; });
    setExpandedDates(all);
  };

  // 日付ごとのNG件数を計算
  const ngCountByDate = {};
  currentConfig.dates.forEach(d => {
    let count = 0;
    project.teachers.forEach(t => {
      currentConfig.periods.forEach(p => {
        if (t.ngSlots?.includes(makeNgKey(d, p))) count++;
      });
    });
    ngCountByDate[d] = count;
  });

  return (
    <div>
      <div className="bg-red-50 p-3 mb-4 rounded text-sm text-red-800 border border-red-200">
        <strong>NG一括設定:</strong><br />
        クリックしてNG（赤）/ OK（白）を切り替えます。全タブ共通の設定です。<br />
        日付ごとに折りたたみが可能です。
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={expandAll} className="text-xs px-2 py-1 bg-gray-100 border rounded hover:bg-gray-200">すべて展開</button>
        <button onClick={collapseAll} className="text-xs px-2 py-1 bg-gray-100 border rounded hover:bg-gray-200">すべて折りたたむ</button>
      </div>
      <div className="space-y-2">
        {currentConfig.dates.map(d => {
          const isExpanded = expandedDates[d] !== false;
          const ngCount = ngCountByDate[d] || 0;
          return (
            <div key={d} className="border rounded overflow-hidden">
              <button
                onClick={() => toggleDate(d)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-bold text-left"
              >
                <span>
                  <span className="mr-1">{isExpanded ? '▼' : '▶'}</span>
                  {d}
                </span>
                {ngCount > 0 && (
                  <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">{ngCount}件NG</span>
                )}
              </button>
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr>
                        <th className="border-t border-r p-2 bg-gray-50 sticky left-0 z-10">講師名</th>
                        {currentConfig.periods.map(p => (
                          <th key={p} className="border-t border-r p-1 bg-gray-50 font-normal min-w-[60px] text-center">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {project.teachers.map((t, idx) => (
                        <tr key={t.name}>
                          <td className="border-t border-r p-2 font-bold bg-gray-50 sticky left-0 z-10">{t.name}</td>
                          {currentConfig.periods.map(p => {
                            const k = makeNgKey(d, p);
                            const isNg = t.ngSlots?.includes(k);
                            return (
                              <td
                                key={p}
                                onClick={() => toggleTeacherNg(idx, d, p)}
                                className={`border-t border-r p-1 text-center cursor-pointer hover:opacity-80 transition-colors ${isNg ? "bg-red-500 text-white font-bold" : "bg-white"}`}
                              >
                                {isNg ? "NG" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
