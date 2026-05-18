import { useEffect, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeNgKey } from '../../utils/scheduleKey';

const ALL_TEACHERS = '__all__';

export default function NgSettings() {
  const {
    project,
    currentConfig,
    toggleTeacherNg,
    setNgBatch,
  } = useProjectContext();

  // 折りたたみ状態: 各日付の開閉 (date.id をキーに)
  const [expandedDates, setExpandedDates] = useState(() => {
    const initial = {};
    currentConfig.dates.forEach(d => { initial[d.id] = true; });
    return initial;
  });

  // 範囲指定一括設定の state
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [bulkStartDateId, setBulkStartDateId] = useState(
    currentConfig.dates[0]?.id ?? ''
  );
  const [bulkEndDateId, setBulkEndDateId] = useState(
    currentConfig.dates[currentConfig.dates.length - 1]?.id ?? ''
  );
  const [bulkPeriodIds, setBulkPeriodIds] = useState(() =>
    currentConfig.periods.map(p => p.id)
  );

  // 日付/時限が config 変更で消えた場合はバルク state を整合させる
  useEffect(() => {
    const validIds = new Set(currentConfig.periods.map(p => p.id));
    setBulkPeriodIds(prev => {
      const filtered = prev.filter(id => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [currentConfig.periods]);
  useEffect(() => {
    const ids = currentConfig.dates.map(d => d.id);
    if (!ids.includes(bulkStartDateId)) setBulkStartDateId(ids[0] ?? '');
    if (!ids.includes(bulkEndDateId)) setBulkEndDateId(ids[ids.length - 1] ?? '');
  }, [currentConfig.dates, bulkStartDateId, bulkEndDateId]);

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

  // ── 範囲指定一括設定: 計算ヘルパ ─────────────────────────
  const selectedTeacherIdxs = (() => {
    if (bulkTeacher === ALL_TEACHERS) return project.teachers.map((_, i) => i);
    const idx = project.teachers.findIndex(t => t.name === bulkTeacher);
    return idx >= 0 ? [idx] : [];
  })();
  const dateLabelsInRange = (() => {
    const sIdx = currentConfig.dates.findIndex(d => d.id === bulkStartDateId);
    const eIdx = currentConfig.dates.findIndex(d => d.id === bulkEndDateId);
    if (sIdx < 0 || eIdx < 0) return [];
    const lo = Math.min(sIdx, eIdx);
    const hi = Math.max(sIdx, eIdx);
    return currentConfig.dates.slice(lo, hi + 1).map(d => d.label);
  })();
  const periodLabelsSelected = currentConfig.periods
    .filter(p => bulkPeriodIds.includes(p.id))
    .map(p => p.label);
  const canApply =
    selectedTeacherIdxs.length > 0 &&
    dateLabelsInRange.length > 0 &&
    periodLabelsSelected.length > 0;

  const applyBulk = (value) => {
    if (!canApply) return;
    setNgBatch(selectedTeacherIdxs, dateLabelsInRange, periodLabelsSelected, value);
  };

  const togglePeriod = (pId) => {
    setBulkPeriodIds(prev =>
      prev.includes(pId) ? prev.filter(x => x !== pId) : [...prev, pId]
    );
  };
  const setAllPeriods = () => setBulkPeriodIds(currentConfig.periods.map(p => p.id));
  const clearAllPeriods = () => setBulkPeriodIds([]);

  return (
    <div>
      <div className="bg-builder-danger-soft p-3 mb-4 rounded text-sm text-builder-red border border-builder-danger-border">
        <strong>NG一括設定:</strong><br />
        クリックしてNG（赤）/ OK（白）を切り替えます。全タブ共通の設定です。<br />
        日付ごとに折りたたみが可能です。
      </div>

      {/* ── 範囲指定で一括設定 ───────────────────────────── */}
      <div className="bg-builder-surface-alt border border-builder-ink-ghost rounded p-3 mb-4 text-sm">
        <div className="font-bold text-builder-ink mb-1">範囲指定で一括設定</div>
        <div className="text-xs text-builder-ink-muted mb-3">
          例: 「7/28〜7/31 は予備校で入れない」を一気にNG指定。
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-builder-ink-muted">講師</span>
            <select
              value={bulkTeacher}
              onChange={(e) => setBulkTeacher(e.target.value)}
              className="border border-builder-ink-ghost rounded px-2 py-1 text-builder-ink bg-builder-surface"
              aria-label="一括設定の対象講師"
            >
              <option value="">(選択してください)</option>
              <option value={ALL_TEACHERS}>すべての講師</option>
              {project.teachers.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-builder-ink-muted">期間</span>
            <div className="flex items-center gap-1">
              <select
                value={bulkStartDateId}
                onChange={(e) => setBulkStartDateId(Number(e.target.value))}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 text-builder-ink bg-builder-surface"
                aria-label="一括設定の開始日"
              >
                {currentConfig.dates.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <span className="text-builder-ink-muted shrink-0">〜</span>
              <select
                value={bulkEndDateId}
                onChange={(e) => setBulkEndDateId(Number(e.target.value))}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 text-builder-ink bg-builder-surface"
                aria-label="一括設定の終了日"
              >
                {currentConfig.dates.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-builder-ink-muted">時限</span>
            <div className="flex gap-1">
              <button type="button" onClick={setAllPeriods}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全選択
              </button>
              <button type="button" onClick={clearAllPeriods}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全解除
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentConfig.periods.map(p => (
              <label key={p.id}
                className="flex items-center gap-1 px-2 py-1 border border-builder-ink-ghost rounded cursor-pointer bg-builder-surface hover:bg-builder-bg text-builder-ink">
                <input
                  type="checkbox"
                  checked={bulkPeriodIds.includes(p.id)}
                  onChange={() => togglePeriod(p.id)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => applyBulk(true)}
            disabled={!canApply}
            className="px-3 py-1 bg-builder-red text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            まとめてNGにする
          </button>
          <button
            type="button"
            onClick={() => applyBulk(false)}
            disabled={!canApply}
            className="px-3 py-1 bg-builder-surface border border-builder-ink-ghost text-builder-ink rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-builder-bg"
          >
            まとめてOKに解除
          </button>
          {canApply && (
            <span className="text-xs text-builder-ink-muted">
              対象: {selectedTeacherIdxs.length}名 × {dateLabelsInRange.length}日 × {periodLabelsSelected.length}時限
            </span>
          )}
        </div>
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
                        <th className="border border-builder-ink-ghost p-2 bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">講師名</th>
                        {currentConfig.periods.map(p => (
                          <th key={p.id} className="border border-builder-ink-ghost p-1 bg-builder-surface-alt font-normal min-w-[60px] text-center text-builder-ink">{p.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {project.teachers.map((t, idx) => (
                        <tr key={t.name}>
                          <td className="border border-builder-ink-ghost p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
                          {currentConfig.periods.map(p => {
                            const k = makeNgKey(d.label, p.label);
                            const isNg = t.ngSlots?.includes(k);
                            return (
                              <td
                                key={p.id}
                                onClick={() => toggleTeacherNg(idx, d.label, p.label)}
                                className={`border border-builder-ink-ghost p-1 text-center cursor-pointer hover:opacity-80 transition-colors ${isNg ? "bg-builder-red text-white font-bold" : "bg-builder-surface"}`}
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
