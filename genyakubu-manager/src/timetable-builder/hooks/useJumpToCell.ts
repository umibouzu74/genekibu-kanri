import { useCallback } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { scrollToCellByKey, scrollToCellWhenReady } from '../utils/scrollToCell';

// タブ + schedule key のセルへ飛ぶ。別のタブなら切り替えてから (描かれるのを
// 待って) スクロールする。NG に当たっている割当の一覧 (NgViolationList) で使う。
export function useJumpToCell(): (tabId: number, key: string) => void {
  const { project, switchTab } = useProjectContext();
  const activeTabId = project.activeTabId;
  return useCallback((tabId: number, key: string) => {
    if (tabId !== activeTabId) {
      switchTab(tabId);
      scrollToCellWhenReady(key);
      return;
    }
    scrollToCellByKey(key);
  }, [activeTabId, switchTab]);
}
