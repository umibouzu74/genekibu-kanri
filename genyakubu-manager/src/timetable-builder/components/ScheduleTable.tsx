import { Fragment, useRef, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeKey } from '../utils/scheduleKey';
import { useLongPress } from '../hooks/useLongPress';
import ScheduleCell from './ScheduleCell';
import type { ReactNode, ThHTMLAttributes } from 'react';
import type { DayStatus, ScheduleEntry } from '../types';
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

// 日付ごとのステータスチェック (OK / 要確認 / 不備あり)。日付セル内・ラベル直下。
//
// - 不備あり: schedule からの自動判定 (読み取り専用)。その日の全セルに
//   科目+講師 (未定以外) が入ると自動で外れる。
// - OK / 要確認: 手動・互いに排他 (どちらかを付けるともう片方は外れる)。
//   再クリックで解除。タブ (学年) × 日付ごとに project へ保存され、
//   同期・Undo・JSON 書き出しに乗る。
// - 不備あり中は OK を選べない (矛盾するため無効化)。保存済みの OK は
//   不備あり中は表示から抑制するだけで消さない — セルを埋め直すと復元される。
//   要確認は不備あり中でも付けられる (講師調整中のメモ用途)。
function DayStatusChecks({ dateId, dateLabel, isCompact }: { dateId: number; dateLabel: string; isCompact: boolean }) {
  const { activeTab, setDayStatus, analysis } = useProjectContext();
  const isIncomplete = !!analysis?.incompleteDateIds?.has(dateId);
  const stored: DayStatus | null = activeTab?.dayStatuses?.[String(dateId)] ?? null;
  const okChecked = !isIncomplete && stored === 'ok';
  const checkChecked = stored === 'check';
  const toggle = (value: DayStatus) => setDayStatus(dateId, stored === value ? null : value);
  const rowClass = 'flex items-center gap-1 font-normal whitespace-nowrap';
  return (
    <div className={`mt-1 flex flex-col gap-0.5 ${isCompact ? 'text-[9px]' : 'text-[11px]'}`}>
      <label
        className={`${rowClass} ${isIncomplete
          ? 'cursor-not-allowed opacity-60 text-builder-ink-muted'
          : okChecked ? 'cursor-pointer text-builder-green font-bold' : 'cursor-pointer text-builder-ink-muted'}`}
        title={isIncomplete ? '全コマ (科目+講師) が埋まると選べます' : undefined}
      >
        <input
          type="checkbox"
          checked={okChecked}
          disabled={isIncomplete}
          onChange={() => toggle('ok')}
          aria-label={`${dateLabel} を OK にする`}
        />
        OK
      </label>
      <label className={`${rowClass} cursor-pointer ${checkChecked ? 'text-builder-orange font-bold' : 'text-builder-ink-muted'}`}>
        <input
          type="checkbox"
          checked={checkChecked}
          onChange={() => toggle('check')}
          aria-label={`${dateLabel} を要確認にする`}
        />
        要確認
      </label>
      <label
        className={`${rowClass} cursor-default ${isIncomplete ? 'text-builder-red font-bold' : 'text-builder-ink-muted'}`}
        title="自動判定: 全セルに科目と講師が入ると自動で外れます"
      >
        <input
          type="checkbox"
          checked={isIncomplete}
          disabled
          aria-label={`${dateLabel} の不備あり (自動判定)`}
        />
        不備あり
      </label>
    </div>
  );
}

// スティッキー列の幅定義（CSS変数として使用）
const COL_WIDTHS = {
  compact: { dateCol: '3.5rem', periodCol: '6rem' },
  normal:  { dateCol: '5rem',   periodCol: '8rem' },
};

interface ScheduleTableProps {
  isCompact: boolean;
  onContextMenu: HeaderContextMenuHandler;
  /** L2a: 強調表示する講師名 (null = なし) */
  highlightTeacher?: string | null;
  /** N2a: 複数選択中のセル key 集合 */
  selectedKeys?: Set<string>;
  /** N2a: Ctrl/Shift+クリックでの選択操作 */
  onCellSelect?: (e: { shiftKey: boolean }, key: string) => void;
}

export default function ScheduleTable({ isCompact, onContextMenu, highlightTeacher = null, selectedKeys, onCellSelect }: ScheduleTableProps) {
  const { currentConfig, handleSwapCells } = useProjectContext();
  const { showToast } = useUI();
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
    if (!dragSource || dragSource.key === tk) return;
    if (td.locked) {
      // 赤リングだけだと「掴んだのに動かない」無反応に見えるので理由を出す
      // (K3h。renameHeader の重複 reject と同じくフィードバックを揃える)
      showToast('ロックされたセルとは入れ替えできません', 'error', 2500);
      return;
    }
    handleSwapCells(dragSource.key, tk);
    setDragSource(null);
    e.target.style.opacity = '1';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDragSource(null);
    setDragOverKey(null);
  };

  // N2b: ドラッグ中の auto-scroll。グリッドは max-h-[70vh] の overflow
  // コンテナ内にあり、掴んだ元と落とし先が同時に画面内に無いと届かなかった。
  // dragover はドラッグ中連続発火するので、コンテナ端に近づいたら少しずつ
  // スクロールする (端に近いほど速く)。
  const containerRef = useRef<HTMLDivElement>(null);
  const handleContainerDragOver = (e: { clientX: number; clientY: number }) => {
    const el = containerRef.current;
    if (!el || !dragSource) return;
    const EDGE = 56;
    const rect = el.getBoundingClientRect();
    const step = (dist: number) => Math.ceil((EDGE - dist) / 3);
    if (e.clientY - rect.top < EDGE) el.scrollTop -= step(e.clientY - rect.top);
    else if (rect.bottom - e.clientY < EDGE) el.scrollTop += step(rect.bottom - e.clientY);
    if (e.clientX - rect.left < EDGE) el.scrollLeft -= step(e.clientX - rect.left);
    else if (rect.right - e.clientX < EDGE) el.scrollLeft += step(rect.right - e.clientX);
  };

  const widths = isCompact ? COL_WIDTHS.compact : COL_WIDTHS.normal;
  const dateColStyle = { left: 0, width: widths.dateCol, minWidth: widths.dateCol };
  const periodColStyle = { left: widths.dateCol, width: widths.periodCol, minWidth: widths.periodCol };

  return (
    <div
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      className={`overflow-auto shadow border border-builder-border max-h-[70vh] bg-builder-bg print-container ${isCompact ? "text-xs" : "text-sm"}`}
    >
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
                      <DayStatusChecks dateId={d.id} dateLabel={d.label} isCompact={isCompact} />
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
                        highlightTeacher={highlightTeacher}
                        isSelected={!!selectedKeys?.has(cellKey)}
                        onCellSelect={onCellSelect}
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
