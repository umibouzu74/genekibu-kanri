// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryStack } from './useHistoryStack';
import { STORAGE_KEY_PROJECT } from '../utils/constants';

// useHistoryStack は loadInitialProject 経由で localStorage を読む。
// 各テストの開始時に localStorage をクリーンにして、デフォルトプロジェクトで
// 初期化されるようにする。
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// テスト用に project を差し替える小道具。
// 履歴を進めたい時は project/replace ディスパッチを使う。
const makeProject = (id, extra = {}) => ({
  version: 2,
  name: `proj-${id}`,
  tabs: [],
  teachers: [],
  activeTabId: 1,
  ...extra,
});

describe('useHistoryStack — 基本動作', () => {
  it('初期 state は loadInitialProject の結果 + 履歴 1 件', () => {
    const { result } = renderHook(() => useHistoryStack());
    expect(result.current.project).toBeTruthy();
    expect(result.current.history).toHaveLength(1);
    expect(result.current.historyIndex).toBe(0);
    expect(result.current.saveStatus).toBe('✅ 保存済');
    expect(typeof result.current.dispatch).toBe('function');
  });

  it('dispatch は安定参照 (re-render 後も同一)', () => {
    const { result, rerender } = renderHook(() => useHistoryStack());
    const d1 = result.current.dispatch;
    rerender();
    expect(result.current.dispatch).toBe(d1);
  });
});

describe('useHistoryStack — dispatch による履歴の進行', () => {
  it('project/replace で history に追加され index が進む', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.historyIndex).toBe(1);
    expect(result.current.project.name).toBe('proj-1');
  });

  it('複数回 dispatch すると履歴が順番に積まれる', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(2) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(3) } }));
    expect(result.current.history).toHaveLength(4);
    expect(result.current.historyIndex).toBe(3);
    expect(result.current.history[1].name).toBe('proj-1');
    expect(result.current.history[3].name).toBe('proj-3');
  });

  it('MAX_HISTORY (50) を超えると古いものから捨てる', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => {
      for (let i = 0; i < 50; i++) {
        result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(i) } });
      }
    });
    expect(result.current.history).toHaveLength(50);
    expect(result.current.history[0].name).toBe('proj-0');
    expect(result.current.history[49].name).toBe('proj-49');
    expect(result.current.historyIndex).toBe(49);
  });
});

describe('useHistoryStack — undo / redo', () => {
  it('undo で 1 つ前の state に戻る', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(2) } }));
    expect(result.current.project.name).toBe('proj-2');
    act(() => result.current.undo());
    expect(result.current.project.name).toBe('proj-1');
    expect(result.current.historyIndex).toBe(1);
  });

  it('index 0 で undo は no-op', () => {
    const { result } = renderHook(() => useHistoryStack());
    const initial = result.current.project;
    act(() => result.current.undo());
    expect(result.current.project).toBe(initial);
    expect(result.current.historyIndex).toBe(0);
  });

  it('undo 後の redo で進める', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(2) } }));
    act(() => result.current.undo());
    expect(result.current.project.name).toBe('proj-1');
    act(() => result.current.redo());
    expect(result.current.project.name).toBe('proj-2');
    expect(result.current.historyIndex).toBe(2);
  });

  it('history の末尾で redo は no-op', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => result.current.redo());
    expect(result.current.historyIndex).toBe(1);
    expect(result.current.project.name).toBe('proj-1');
  });
});

describe('useHistoryStack — branch 切り捨て', () => {
  it('undo 後に dispatch すると redo 分岐は切り捨て', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(2) } }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(3) } }));
    expect(result.current.history).toHaveLength(4);

    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.project.name).toBe('proj-1');

    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(99) } }));
    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[2].name).toBe('proj-99');
    expect(result.current.historyIndex).toBe(2);

    act(() => result.current.redo());
    expect(result.current.project.name).toBe('proj-99');
  });
});

describe('useHistoryStack — LocalStorage 保存 (F2c: 実書き込みの debounce)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('初回マウントでは保存しない (loadInitialProject 直後の書き戻しを避ける)', () => {
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).toBeNull();
    renderHook(() => useHistoryStack());
    act(() => vi.advanceTimersByTime(1000));
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).toBeNull();
  });

  it('dispatch 後、debounce 経過で localStorage に保存される', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    // debounce 中はまだ書き込まれない
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).toBeNull();
    act(() => vi.advanceTimersByTime(800));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECT));
    expect(saved.name).toBe('proj-1');
  });

  it('連続 dispatch は 1 回の書き込みにまとまり、最後の project が保存される', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(2) } }));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(3) } }));
    expect(setItemSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(800));
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECT)).name).toBe('proj-3');
    setItemSpy.mockRestore();
  });

  it('debounce 確定前にアンマウントしても未保存分が flush される', () => {
    const { result, unmount } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(7) } }));
    unmount();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECT)).name).toBe('proj-7');
  });

  it('pagehide (タブ閉じ/リロード) で未保存分が flush される', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(8) } }));
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECT)).name).toBe('proj-8');
    // flush 済みなので debounce 発火で二重書き込みしない
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => vi.advanceTimersByTime(800));
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('保存中の saveStatus が「💾 保存中...」→ debounce 後「✅ 保存済」に遷移する', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject(1) } }));
    expect(result.current.saveStatus).toBe('💾 保存中...');
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.saveStatus).toBe('✅ 保存済');
  });
});
