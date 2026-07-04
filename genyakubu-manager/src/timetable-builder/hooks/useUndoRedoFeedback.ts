// N2f: undo/redo に「何が戻ったか」のフィードバックを付けるラッパー。
//
// 素の undo/redo (useHistoryStack) は状態を差し替えるだけで、変更セルが
// 画面外だと押しても無反応に見えた。ここで遷移前後を describeHistoryStep で
// 比較し、toast + 該当セルへのスクロールを添える。
//
// UIContext (toast) と ProjectContext (履歴) の両方が要るため、素の
// undo/redo を context に置いたまま、使う側 (BuilderApp のショートカット /
// Toolbar のボタン) がこのフックで包む。
import { useCallback } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { describeHistoryStep } from '../utils/historyFeedback';
import { scrollToCellByKey } from '../utils/scrollToCell';

export function useUndoRedoFeedback(): { undoWithFeedback: () => void; redoWithFeedback: () => void } {
  const { undo, redo, history, historyIndex } = useProjectContext();
  const { showToast } = useUI();

  const run = useCallback((direction: 'undo' | 'redo') => {
    const targetIdx = direction === 'undo' ? historyIndex - 1 : historyIndex + 1;
    if (targetIdx < 0 || targetIdx > history.length - 1) return; // 端 (reducer 側でも no-op)
    const current = history[historyIndex];
    const target = history[targetIdx];
    (direction === 'undo' ? undo : redo)();
    const { message, scrollKey } = describeHistoryStep(current, target);
    showToast(`${direction === 'undo' ? '↩️ 元に戻す' : '↪️ やり直し'}: ${message}`, 'success', 2500);
    if (scrollKey) scrollToCellByKey(scrollKey);
  }, [undo, redo, history, historyIndex, showToast]);

  const undoWithFeedback = useCallback(() => run('undo'), [run]);
  const redoWithFeedback = useCallback(() => run('redo'), [run]);
  return { undoWithFeedback, redoWithFeedback };
}
