import { useEffect, useLayoutEffect, useRef } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeKey, makeNgKey } from '../utils/scheduleKey';

// BuilderApp が useState で持つ「開いているメニュー」の状態。
// type=null はセルメニュー、'date'|'period'|'class' はヘッダメニュー (val=ラベル)。
export interface BuilderContextMenuState {
  x: number;
  y: number;
  dateId: number | null;
  periodId: number | null;
  classId: number | null;
  type: 'date' | 'period' | 'class' | null;
  val: string | null;
}

/** セルのコピー内容 (コピー → 貼付で受け渡す) */
export interface CellClipboard {
  subject: string;
  teacher?: string;
}

interface ContextMenuProps {
  contextMenu: BuilderContextMenuState | null;
  clipboard: CellClipboard | null;
  /** copiedData を渡すと BuilderApp が clipboard に保存する */
  onClose: (copiedData?: CellClipboard | null) => void;
}

export default function ContextMenu({ contextMenu, clipboard, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // スクロール時にメニューを閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const handleScroll = () => onClose();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [contextMenu, onClose]);

  // F2a: キーボード対応。開いたら最初の項目へフォーカスし、↑↓ で項目移動、
  // Escape で閉じる (従来は Escape でも閉じられず、フォーカスも背後に残った)。
  useEffect(() => {
    if (!contextMenu) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      // disabled 項目 (clipboard 空の貼り付け等) はフォーカス対象から外す
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []
      );
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown'
        ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [contextMenu, onClose]);

  // メニュー位置を画面内にクランプ（DOM更新後に即座に調整）
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!contextMenu || !el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - rect.width - 8));
    const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - rect.height - 8));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [contextMenu]);

  const {
    project,
    currentConfig,
    currentSchedule,
    handleRenameHeader,
    handleBulkAction,
    handleCellCopy,
    handleCellPaste,
    handleCellClear,
    handleSetNg,
    toggleLock,
  } = useProjectContext();
  const { showInput, showToast } = useUI();

  if (!contextMenu) return null;

  // ScheduleCell からの onContextMenu(e, dateId, periodId, classId) を
  // ScheduleApp が contextMenu state に詰める。v3 (C1 移行後) 以降の ID。
  const { dateId, periodId, classId, type, val } = contextMenu;

  const handleAction = async (action) => {
    if (action === 'rename') {
      onClose();
      const newVal = await showInput(`「${val}」の新しい名称を入力してください`, { title: "名称の変更", defaultValue: val });
      if (!newVal || newVal === val) return;
      // H3: 既存ラベルへのリネームは reducer が reject する (キー衝突で
      // NG / 外部コマ数が silent に混線するため)。silent no-op だと
      // 「直ったように見える」ので、ここで理由を伝える。
      const labels = type === 'date' ? (project.dates || [])
        : type === 'period' ? (project.periods || [])
        : (currentConfig.classes || []);
      if (labels.some(e => e.label === newVal)) {
        showToast(`「${newVal}」は既に存在するため変更できません。別の名称にしてください。`, 'error', 4000);
        return;
      }
      handleRenameHeader(type, val, newVal);
      return;
    }

    if (type) {
      handleBulkAction(action, type, val);
    } else {
      if (action === 'copy') {
        const copied = handleCellCopy(dateId, periodId, classId);
        if (copied) {
          onClose(copied);
          showToast(`${copied.subject}${copied.teacher ? ` / ${copied.teacher}` : ''} をコピーしました`, 'success', 1500);
        }
        return;
      }
      if (action === 'paste') { handleCellPaste(dateId, periodId, classId, clipboard); }
      if (action === 'lock') { toggleLock(dateId, periodId, classId); }
      if (action === 'clear') { handleCellClear(dateId, periodId, classId); }
      if (action === 'set-ng') { handleSetNg(dateId, periodId, classId); }
    }
    onClose();
  };

  const cellKey = (dateId !== undefined && periodId !== undefined && classId !== undefined && dateId !== null && periodId !== null && classId !== null)
    ? makeKey(dateId, periodId, classId) : null;

  return (
    <div ref={menuRef} role="menu" aria-label={type ? `${val} の一括操作` : 'セルの操作'} className="fixed bg-builder-surface border border-builder-border shadow-xl rounded z-50 text-sm overflow-hidden animate-fade-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
      {type ? (
        <>
          <div className="px-4 py-2 bg-builder-surface-alt border-b border-builder-border font-bold text-builder-ink-muted text-xs">{val} の一括操作</div>
          <button onClick={() => handleAction('rename')} className="block w-full text-left px-4 py-2 hover:bg-builder-info-soft text-builder-blue font-bold border-b border-builder-border">✏️ 名称を変更</button>
          <button onClick={() => handleAction('lock-all')} className="block w-full text-left px-4 py-2 hover:bg-builder-bg border-b border-builder-border text-builder-ink">🔒 一括ロック</button>
          <button onClick={() => handleAction('unlock-all')} className="block w-full text-left px-4 py-2 hover:bg-builder-bg border-b border-builder-border text-builder-ink">🔓 一括解除</button>
          <button onClick={() => handleAction('clear-all')} className="block w-full text-left px-4 py-2 hover:bg-builder-danger-soft text-builder-red">🗑️ 一括クリア</button>
        </>
      ) : (
        <>
          <button onClick={() => handleAction('copy')} className="block w-full text-left px-4 py-2 hover:bg-builder-bg border-b border-builder-border text-builder-ink">📝 コピー</button>
          <button
            onClick={() => handleAction('paste')}
            disabled={!clipboard}
            title={!clipboard ? '先にセルをコピーしてください' : undefined}
            className={`block w-full text-left px-4 py-2 border-b border-builder-border ${!clipboard ? "text-builder-ink-ghost cursor-not-allowed" : "hover:bg-builder-bg text-builder-ink"}`}
          >
            📋 貼り付け
          </button>
          {cellKey && currentSchedule[cellKey]?.teacher && (() => {
            // 実体はトグル (toggleTeacherNg) なので、既に NG なら「解除」と
            // 表示する (K3g: 登録のままだと解除操作であることが伝わらない)
            const teacherName = currentSchedule[cellKey].teacher;
            const dateEnt = currentConfig.dates?.find(d => d.id === dateId);
            const periodEnt = currentConfig.periods?.find(p => p.id === periodId);
            const ngKey = dateEnt && periodEnt ? makeNgKey(dateEnt.label, periodEnt.label) : null;
            const isNg = !!ngKey && !!(project.teachers || []).find(t => t.name === teacherName)?.ngSlots?.includes(ngKey);
            return (
              <button onClick={() => handleAction('set-ng')} className="block w-full text-left px-4 py-2 hover:bg-builder-warning-soft border-b border-builder-border text-builder-orange">
                {isNg ? '✅ この時間のNGを解除' : '🚫 この時間をNG登録'}
              </button>
            );
          })()}
          <button onClick={() => handleAction('lock')} className="block w-full text-left px-4 py-2 hover:bg-builder-bg border-b border-builder-border text-builder-ink">🔒 ロック切替</button>
          <button onClick={() => handleAction('clear')} className="block w-full text-left px-4 py-2 hover:bg-builder-danger-soft text-builder-red">🗑️ クリア</button>
        </>
      )}
    </div>
  );
}
