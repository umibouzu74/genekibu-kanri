// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

// テスト用に project を差し替える小道具。setProject は履歴に積まれないので、
// 履歴系のテストでは pushHistory を使う。
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
  });
});

describe('useHistoryStack — pushHistory', () => {
  it('pushHistory で history に追加され index が進む', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.historyIndex).toBe(1);
    expect(result.current.project.name).toBe('proj-1');
  });

  it('pushHistory は updatedAt を付与する', () => {
    const { result } = renderHook(() => useHistoryStack());
    const before = Date.now();
    act(() => result.current.pushHistory(makeProject(1)));
    const after = Date.now();
    const ts = new Date(result.current.project.updatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('複数回 pushHistory すると履歴が順番に積まれる', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    act(() => result.current.pushHistory(makeProject(2)));
    act(() => result.current.pushHistory(makeProject(3)));
    expect(result.current.history).toHaveLength(4);
    expect(result.current.historyIndex).toBe(3);
    expect(result.current.history[1].name).toBe('proj-1');
    expect(result.current.history[2].name).toBe('proj-2');
    expect(result.current.history[3].name).toBe('proj-3');
  });

  it('MAX_HISTORY (50) を超えると古いものから捨てる', () => {
    const { result } = renderHook(() => useHistoryStack());
    // 初期 1 件 + 50 件 = 51 件 push → 1 件 shift されて 50 件残る
    act(() => {
      for (let i = 0; i < 50; i++) result.current.pushHistory(makeProject(i));
    });
    expect(result.current.history).toHaveLength(50);
    // 最古は proj-0 ではなく、初期がシフトアウトされて proj-0 が先頭
    expect(result.current.history[0].name).toBe('proj-0');
    expect(result.current.history[49].name).toBe('proj-49');
    expect(result.current.historyIndex).toBe(49);
  });
});

describe('useHistoryStack — undo / redo', () => {
  it('undo で 1 つ前の state に戻る', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    act(() => result.current.pushHistory(makeProject(2)));
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
    act(() => result.current.pushHistory(makeProject(1)));
    act(() => result.current.pushHistory(makeProject(2)));
    act(() => result.current.undo());
    expect(result.current.project.name).toBe('proj-1');
    act(() => result.current.redo());
    expect(result.current.project.name).toBe('proj-2');
    expect(result.current.historyIndex).toBe(2);
  });

  it('history の末尾で redo は no-op', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    expect(result.current.historyIndex).toBe(1);
    act(() => result.current.redo());
    expect(result.current.historyIndex).toBe(1);
    expect(result.current.project.name).toBe('proj-1');
  });
});

describe('useHistoryStack — branch 切り捨て', () => {
  it('undo 後に pushHistory すると redo 分岐は切り捨てられる', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    act(() => result.current.pushHistory(makeProject(2)));
    act(() => result.current.pushHistory(makeProject(3)));
    expect(result.current.history).toHaveLength(4);

    // 2 つ戻って proj-1 → そこから別の分岐 proj-99 を生む
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.project.name).toBe('proj-1');

    act(() => result.current.pushHistory(makeProject(99)));
    // 履歴は [initial, proj-1, proj-99] (proj-2, proj-3 は切り捨て)
    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[2].name).toBe('proj-99');
    expect(result.current.historyIndex).toBe(2);

    // redo してももう先には進めない
    act(() => result.current.redo());
    expect(result.current.project.name).toBe('proj-99');
  });
});

describe('useHistoryStack — LocalStorage 保存', () => {
  it('初回マウントでは保存しない (loadInitialProject 直後の書き戻しを避ける)', () => {
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).toBeNull();
    renderHook(() => useHistoryStack());
    // useEffect が走った後でも初回はスキップされている
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).toBeNull();
  });

  it('pushHistory 後に localStorage に保存される', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECT));
    expect(saved.name).toBe('proj-1');
  });

  it('保存中の saveStatus が「💾 保存中...」に切り替わる', () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.pushHistory(makeProject(1)));
    expect(result.current.saveStatus).toBe('💾 保存中...');
  });
});
