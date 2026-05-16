import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeNgKey } from '../../utils/scheduleKey';

export default function NgSettings() {
  const {
    project,
    currentConfig,
    toggleTeacherNg,
  } = useProjectContext();

  // 折りたたみ状態: 各日付の開閉 (date.id をキーに)
  const [expandedDates, setExpandedDates] = useState(() => {
    const initial = {};
    currentConfig.dates.forEach(d => { initial[d.id] = true; });
    return initial;
  });

  const toggleDate = (dateId) => {
    setExpandedDates(prev => ({ ...prev, [dateId]: !prev[dateId] }));
  };

  const expandAll = () => {
    const all = {};
    currentConfig.dates.forEach(d => { all[d.id] = true; });
    setExpandedDates(all);
  };

  const collapseAll = () => {
    const all = {};
    currentConfig.dates.forEach(d => { all[d.id] = false; });
    setExpandedDates(all);
  };

  // 日付ごとのNG件数を計算 (date.label と period.label で makeNgKey)
  const ngCountByDate = {};
  currentConfig.dates.forEach(d => {
    let count = 0;
    project.teachers.forEach(t => {
      currentConfig.periods.forEach(p => {
        if (t.ngSlots?.includes(makeNgKey(d.label, p.label))) count++;
      });
    });
    ngCountByDate[d.id] = count;
  });

  return (
    <div>
      <div className="bg-builder-danger-soft p-3 mb-4 rounded text-sm text-builder-red border border-builder-danger-border">
        <strong>NG一括設定:</strong><br />
        クリックしてNG（赤）/ OK（白）を切り替えます。全タブ共通の設定です。<br />
        日付ごとに折りたたみが可能です。
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={expandAll} className="text-xs px-2 py-1 bg-builder-surface-alt border border-builder-border rounded hover:bg-builder-bg text-builder-ink">すべて展開</button>
        <button onClick={collapseAll} className="text-xs px-2 py-1 bg-builder-surface-alt border border-builder-border rounded hover:bg-builder-bg text-builder-ink">すべて折りたたむ</button>
      </div>
      <div className="space-y-2">
        {currentConfig.dates.map(d => {
          const isExpanded = expandedDates[d.id] !== false;
          const ngCount = ngCountByDate[d.id] || 0;
          return (
            <div key={d.id} className="border border-builder-border rounded overflow-hidden">
              <button
                onClick={() => toggleDate(d.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-builder-surface-alt hover:bg-builder-bg text-sm font-bold text-left text-builder-ink"
              >
                <span>
                  <span className="mr-1">{isExpanded ? '▼' : '▶'}</span>
                  {d.label}
                </span>
                {ngCount > 0 && (
                  <span className="text-xs bg-builder-red text-white px-1.5 py-0.5 rounded">{ngCount}件NG</span>
                )}
              </button>
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr>
                        <th className="border-t border-r border-builder-border p-2 bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">講師名</th>
                        {currentConfig.periods.map(p => (
                          <th key={p.id} className="border-t border-r border-builder-border p-1 bg-builder-surface-alt font-normal min-w-[60px] text-center text-builder-ink">{p.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {project.teachers.map((t, idx) => (
                        <tr key={t.name}>
                          <td className="border-t border-r border-builder-border p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
                          {currentConfig.periods.map(p => {
                            const k = makeNgKey(d.label, p.label);
                            const isNg = t.ngSlots?.includes(k);
                            return (
                              <td
                                key={p.id}
                                onClick={() => toggleTeacherNg(idx, d.label, p.label)}
                                className={`border-t border-r border-builder-border p-1 text-center cursor-pointer hover:opacity-80 transition-colors ${isNg ? "bg-builder-red text-white font-bold" : "bg-builder-surface"}`}
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
