import { useEffect, useLayoutEffect, useRef } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { makeKey } from '../utils/scheduleKey';

export default function ContextMenu({ contextMenu, clipboard, onClose }) {
  const menuRef = useRef(null);

  // スクロール時にメニューを閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const handleScroll = () => onClose();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
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
    <div ref={menuRef} className="fixed bg-builder-surface border border-builder-border shadow-xl rounded z-50 text-sm overflow-hidden animate-fade-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
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
          <button onClick={() => handleAction('paste')} className={`block w-full text-left px-4 py-2 border-b border-builder-border ${!clipboard ? "text-builder-ink-ghost" : "hover:bg-builder-bg text-builder-ink"}`}>📋 貼り付け</button>
          {cellKey && currentSchedule[cellKey]?.teacher && (
            <button onClick={() => handleAction('set-ng')} className="block w-full text-left px-4 py-2 hover:bg-builder-warning-soft border-b border-builder-border text-builder-orange">🚫 この時間をNG登録</button>
          )}
          <button onClick={() => handleAction('lock')} className="block w-full text-left px-4 py-2 hover:bg-builder-bg border-b border-builder-border text-builder-ink">🔒 ロック切替</button>
          <button onClick={() => handleAction('clear')} className="block w-full text-left px-4 py-2 hover:bg-builder-danger-soft text-builder-red">🗑️ クリア</button>
        </>
      )}
    </div>
  );
}
