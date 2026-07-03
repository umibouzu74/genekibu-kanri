import { Fragment, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { makeKey } from '../utils/scheduleKey';
import { useLongPress } from '../hooks/useLongPress';
import ScheduleCell from './ScheduleCell';
import type { ReactNode, ThHTMLAttributes } from 'react';
import type { ScheduleEntry } from '../types';
import type { BuilderContextMenuState } from './ContextMenu';

type HeaderContextMenuHandler = (
  e: { preventDefault: () => void; clientX: number; clientY: number },
  dateId: number | null,
  periodId: number | null,
  classId: number | null,
  type?: BuilderContextMenuState['type'],
  val?: string | null,
) => void;

interface LongPressThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  onLongPressOpen: (e: { preventDefault: () => void; clientX: number; clientY: number }) => void;
  children: ReactNode;
}

// 右クリック (onContextMenu) に加えてタッチ長押しでも同じメニューを開ける <th>。
// ヘッダ (日付/時限/クラス) の追加・名称変更・削除をタッチ端末から行うため (E1f)。
function LongPressTh({ onLongPressOpen, children, ...props }: LongPressThProps) {
  const lp = useLongPress(({ clientX, clientY }) =>
    onLongPressOpen({ preventDefault: () => {}, clientX, clientY }),
  );
  return <th {...props} {...lp}>{children}</th>;
}

// スティッキー列の幅定義（CSS変数として使用）
const COL_WIDTHS = {
  compact: { dateCol: '3.5rem', periodCol: '6rem' },
  normal:  { dateCol: '5rem',   periodCol: '8rem' },
};

interface ScheduleTableProps {
  isCompact: boolean;
  onContextMenu: HeaderContextMenuHandler;
}

export default function ScheduleTable({ isCompact, onContextMenu }: ScheduleTableProps) {
  const { currentConfig, handleSwapCells } = useProjectContext();
  const [dragSource, setDragSource] = useState<{ key: string; data: ScheduleEntry } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDragStart = (e, k, d) => {
    if (d.locked || !d.subject) { e.preventDefault(); return; }
    setDragSource({ key: k, data: d });
    // Firefox は dragstart でデータ項目をセットしないと HTML5 drag 自体を
    // 開始しない (F5aa)。swap の実データは dragSource state で持ち回るので
    // 中身はキー文字列で十分。
    e.dataTransfer.setData('text/plain', k);
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
    handleSwapCells(dragSource.key, tk);
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
              <LongPressTh key={c.id} scope="col" className={`border-r border-builder-primary-hover cursor-context-menu hover:bg-builder-primary-hover ${isCompact ? "p-1 min-w-[80px]" : "p-3 min-w-[140px]"}`}
                onContextMenu={(e) => onContextMenu(e, null, null, null, 'class', c.label)}
                onLongPressOpen={(e) => onContextMenu(e, null, null, null, 'class', c.label)}>
                {c.label}
              </LongPressTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {currentConfig.dates.map((d, dIdx) => (
            <Fragment key={d.id}>
              {currentConfig.periods.map((p, pIdx) => (
                <tr key={p.id} className="bg-builder-surface border-b border-builder-border hover:bg-builder-bg">
                  {pIdx === 0 && (
                    <LongPressTh scope="rowgroup" rowSpan={currentConfig.periods.length}
                      className={`font-bold align-top bg-builder-bg border-r border-builder-border sticky z-20 cursor-context-menu hover:bg-builder-surface-alt ${isCompact ? "p-1" : "p-3"}`}
                      style={dateColStyle}
                      onContextMenu={(e) => onContextMenu(e, null, null, null, 'date', d.label)}
                      onLongPressOpen={(e) => onContextMenu(e, null, null, null, 'date', d.label)}>
                      {d.label}
                    </LongPressTh>
                  )}
                  <LongPressTh scope="row" className={`font-normal border-r border-builder-border bg-builder-surface-alt text-builder-ink sticky z-10 ${isCompact ? "p-1" : "p-3"}`}
                    style={periodColStyle}
                    onContextMenu={(e) => onContextMenu(e, null, null, null, 'period', p.label)}
                    onLongPressOpen={(e) => onContextMenu(e, null, null, null, 'period', p.label)}>
                    {p.label}
                  </LongPressTh>
                  {currentConfig.classes.map((c) => {
                    const cellKey = makeKey(d.id, p.id, c.id);
                    return (
                      <ScheduleCell
                        key={c.id}
                        dateId={d.id} periodId={p.id} classId={c.id}
                        isCompact={isCompact}
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
              ))}
              {dIdx < currentConfig.dates.length - 1 && (
                <tr aria-hidden="true" className="bg-builder-ink">
                  <td className="sticky z-20 bg-builder-ink p-0" style={{ ...dateColStyle, height: '6px' }}></td>
                  <td className="sticky z-10 bg-builder-ink p-0" style={{ ...periodColStyle, height: '6px' }}></td>
                  <td colSpan={currentConfig.classes.length} className="bg-builder-ink p-0" style={{ height: '6px' }}></td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
