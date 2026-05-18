import { useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { makeKey } from '../utils/scheduleKey';
import ScheduleCell from './ScheduleCell';

// スティッキー列の幅定義（CSS変数として使用）
const COL_WIDTHS = {
  compact: { dateCol: '3.5rem', periodCol: '6rem' },
  normal:  { dateCol: '5rem',   periodCol: '8rem' },
};

export default function ScheduleTable({ isCompact, onContextMenu }) {
  const { currentConfig, handleSwapCells } = useProjectContext();
  const [dragSource, setDragSource] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const handleDragStart = (e, k, d) => {
    if (d.locked || !d.subject) { e.preventDefault(); return; }
    setDragSource({ key: k, data: d });
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = '0.5';
  };

  const handleDragOver = (e, tk, td) => {
    e.preventDefault();
    if (!dragSource || dragSource.key === tk || td.locked) {
      e.dataTransfer.dropEffect = "none";
    } else {
      e.dataTransfer.dropEffect = "move";
    }
    setDragOverKey(tk);
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (e, tk, td) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!dragSource || dragSource.key === tk || td.locked) return;
    handleSwapCells(dragSource.key, dragSource.data, tk, td);
    setDragSource(null);
    e.target.style.opacity = '1';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDragSource(null);
    setDragOverKey(null);
  };

  const widths = isCompact ? COL_WIDTHS.compact : COL_WIDTHS.normal;
  const dateColStyle = { left: 0, width: widths.dateCol, minWidth: widths.dateCol };
  const periodColStyle = { left: widths.dateCol, width: widths.periodCol, minWidth: widths.periodCol };

  return (
    <div className={`overflow-auto shadow border border-builder-border max-h-[70vh] bg-builder-bg print-container ${isCompact ? "text-xs" : "text-sm"}`}>
      <table className="w-full border-collapse text-left relative" aria-label="時間割表">
        <thead className="sticky top-0 z-30 bg-builder-primary text-white shadow-md">
          <tr>
            <th scope="col" className={`border-r border-builder-primary-hover sticky z-40 bg-builder-primary ${isCompact ? "p-1" : "p-3"}`}
              style={dateColStyle}>
              日付
            </th>
            <th scope="col" className={`border-r border-builder-primary-hover sticky z-40 bg-builder-primary ${isCompact ? "p-1" : "p-3"}`}
              style={periodColStyle}>
              時限
            </th>
            {currentConfig.classes.map(c => (
              <th key={c.id} scope="col" className={`border-r border-builder-primary-hover cursor-context-menu hover:bg-builder-primary-hover ${isCompact ? "p-1 min-w-[80px]" : "p-3 min-w-[140px]"}`}
                onContextMenu={(e) => onContextMenu(e, null, null, null, 'class', c.label)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {currentConfig.dates.map((d) => (
            currentConfig.periods.map((p, pIdx) => {
              const isDayEnd = pIdx === currentConfig.periods.length - 1;
              return (
                <tr key={`${d.id}-${p.id}`} className={`bg-builder-surface ${isDayEnd ? "" : "border-b border-builder-border hover:bg-builder-bg"}`}>
                  {pIdx === 0 && (
                    <th scope="rowgroup" rowSpan={currentConfig.periods.length}
                      className={`font-bold align-top bg-builder-bg border-r border-builder-border sticky z-20 border-b-[6px] border-b-builder-ink cursor-context-menu hover:bg-builder-surface-alt ${isCompact ? "p-1" : "p-3"}`}
                      style={dateColStyle}
                      onContextMenu={(e) => onContextMenu(e, null, null, null, 'date', d.label)}>
                      {d.label}
                    </th>
                  )}
                  <th scope="row" className={`font-normal border-r border-builder-border bg-builder-surface-alt text-builder-ink sticky z-10 ${isDayEnd ? "border-b-[6px] border-b-builder-ink" : ""} ${isCompact ? "p-1" : "p-3"}`}
                    style={periodColStyle}
                    onContextMenu={(e) => onContextMenu(e, null, null, null, 'period', p.label)}>
                    {p.label}
                  </th>
                  {currentConfig.classes.map((c) => {
                    const cellKey = makeKey(d.id, p.id, c.id);
                    return (
                      <ScheduleCell
                        key={c.id}
                        dateId={d.id} periodId={p.id} classId={c.id}
                        isCompact={isCompact}
                        isDayEnd={isDayEnd}
                        onContextMenu={onContextMenu}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        isDragOver={dragOverKey === cellKey}
                        isDragSource={dragSource !== null && dragSource.key === cellKey}
                      />
                    );
                  })}
                </tr>
              );
            })
          ))}
        </tbody>
      </table>
    </div>
  );
}
