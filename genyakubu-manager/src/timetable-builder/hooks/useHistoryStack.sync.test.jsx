// @vitest-environment jsdom
// useHistoryStack の Firebase 同期 (E6a) の統合テスト。
// firebase/config と firebase/database をモックし、
//   - flushSave が JSON 文字列を RTDB へ送ること
//   - サーバ空のとき seed されること
//   - 受信 (onValue) で project/reset 適用 + syncEvent が出ること
//   - 自分の書込 echo / 同一内容がスキップされること
//   - 権限エラーで sync-auth イベントが 1 回だけ出ること
//   - 新しいスキーマ version の受信で送信が停止すること (stale-client)
// を検証する。LocalStorage のみの挙動 (debounce 等) は useHistoryStack.test.jsx。
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ __path: path })),
  onValue: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
  off: vi.fn(),
}));
vi.mock('../../firebase/config', () => ({
  db: { __mock: true },
  auth: null,
  authReady: Promise.resolve(),
  authFailed: false,
  isConfigured: true,
}));

import { onValue, set } from 'firebase/database';
import { useHistoryStack } from './useHistoryStack';
import { FIREBASE_PROJECT_PATH, CURRENT_PROJECT_VERSION } from '../utils/constants';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  set.mockImplementation(() => Promise.resolve());
  onValue.mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// authReady.then(...) のチェーンを消化する
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// onValue に登録されたサーバ変更コールバックを取り出す
const getServerCallback = () => onValue.mock.calls[0][1];

// テスト用の差し替え project (v2 で入れて migrate 経路も通す)
const makeProject = (name) => ({
  version: 2,
  name,
  activeTabId: 1,
  teachers: [],
  tabs: [
    {
      id: 1,
      name: 'タブ',
      config: {
        dates: [{ id: 1, label: '1/4(日)' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: 'A' }],
        subjectCounts: { 英語: 1 },
      },
      schedule: {},
    },
  ],
});

describe('useHistoryStack — Firebase への送信', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dispatch 後の flushSave で JSON 文字列が RTDB パスへ書かれる', async () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    expect(set).toHaveBeenCalledTimes(1);
    const [dbRef, payload] = set.mock.calls[0];
    expect(dbRef.__path).toBe(FIREBASE_PROJECT_PATH);
    expect(typeof payload).toBe('string');
    expect(JSON.parse(payload).name).toBe('p1');
    // LocalStorage と同じ内容
    expect(payload).toBe(localStorage.getItem('builder.schedule_project'));
  });

  it('受信適用後の autosave は同じ内容をサーバへ送り返さない (echo 抑制)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => getServerCallback()({ val: () => JSON.stringify(makeProject('タブレット編集')) }));
    expect(result.current.project.name).toBe('タブレット編集');
    // 適用による project 変化で autosave が走るが、サーバと合意済みの内容
    // なので Firebase へは送らない (LocalStorage へは保存される)
    act(() => vi.advanceTimersByTime(800));
    expect(set).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('builder.schedule_project')).name).toBe('タブレット編集');
  });
});

describe('useHistoryStack — サーバからの受信', () => {
  it('サーバが空なら現在の project を seed する', async () => {
    renderHook(() => useHistoryStack());
    await flushMicrotasks();
    expect(onValue).toHaveBeenCalledTimes(1);
    act(() => getServerCallback()({ val: () => null }));
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0][1];
    expect(typeof payload).toBe('string');
    // seed は migrate 済み (現行 version) の形
    expect(JSON.parse(payload).version).toBe(CURRENT_PROJECT_VERSION);
  });

  it('別内容の受信で project が置き換わり、履歴リセット + remote-apply イベント', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('ローカル編集') } }));
    expect(result.current.history.length).toBe(2);

    act(() => getServerCallback()({ val: () => JSON.stringify(makeProject('タブレット編集')) }));
    expect(result.current.project.name).toBe('タブレット編集');
    expect(result.current.project.version).toBe(CURRENT_PROJECT_VERSION); // migrate 済み
    expect(result.current.history).toHaveLength(1); // 履歴リセット
    expect(result.current.historyIndex).toBe(0);
    expect(result.current.syncEvent?.kind).toBe('remote-apply');
  });

  it('ローカルと同一内容の受信は何もしない (起動時の正常系)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    const before = result.current.project;
    act(() => getServerCallback()({ val: () => JSON.stringify(before) }));
    expect(result.current.project).toBe(before);
    expect(result.current.syncEvent).toBeNull();
  });

  it('自分が送った JSON の echo は適用しない', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    const sent = set.mock.calls[0][1];
    const historyLenBefore = result.current.history.length;
    act(() => getServerCallback()({ val: () => sent }));
    // echo は文字列一致で弾かれ、履歴リセットも起きない
    expect(result.current.history.length).toBe(historyLenBefore);
    expect(result.current.syncEvent).toBeNull();
    vi.useRealTimers();
  });

  it('壊れた blob の受信は無視する (ローカル温存)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    const before = result.current.project;
    act(() => getServerCallback()({ val: () => '{broken json' }));
    expect(result.current.project).toBe(before);
    expect(result.current.syncEvent).toBeNull();
  });
});

describe('useHistoryStack — エラーと停止', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('PERMISSION_DENIED で sync-auth イベントが 1 回だけ出る', async () => {
    set.mockImplementation(() => Promise.reject({ code: 'PERMISSION_DENIED', message: 'denied' }));
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(result.current.syncEvent?.kind).toBe('sync-auth');
    const first = result.current.syncEvent;

    // 2 回目の失敗ではイベントを更新しない (toast スパム防止)
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p2') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(2); // 送信自体は再試行される
    expect(result.current.syncEvent).toBe(first);
  });

  it('その他のエラーは sync-error イベントになる', async () => {
    set.mockImplementation(() => Promise.reject(new Error('network')));
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(result.current.syncEvent?.kind).toBe('sync-error');
  });

  it('新しいスキーマ version を受信したら以降の送信を停止する (stale-client)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    const newer = { ...makeProject('新スキーマ'), version: CURRENT_PROJECT_VERSION + 1 };
    act(() => getServerCallback()({ val: () => JSON.stringify(newer) }));
    expect(result.current.syncEvent?.kind).toBe('sync-stale');
    // 適用はされない (解釈できない)
    expect(result.current.project.name).not.toBe('新スキーマ');

    // 以降の編集は LocalStorage へは保存されるが Firebase へは送られない
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('ローカル編集') } }));
    act(() => vi.advanceTimersByTime(800));
    expect(JSON.parse(localStorage.getItem('builder.schedule_project')).name).toBe('ローカル編集');
    expect(set).not.toHaveBeenCalled();
  });
});
