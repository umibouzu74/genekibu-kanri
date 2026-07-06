// @vitest-environment jsdom
// useHistoryStack の Firebase 同期 (E6a) の統合テスト。
// firebase/config と firebase/database をモックし、
//   - flushSave が JSON 文字列を RTDB へ送ること (初回は get() で version 確認)
//   - サーバ空のとき seed されること (echo 抑制の無効化・エラー沈黙も含む)
//   - 受信 (onValue) で project/reset 適用 + syncEvent が出ること
//   - activeTabId (ビュー状態) がローカル温存されること
//   - 自分の書込 echo / 同一内容がスキップされること
//   - 権限エラーの通知が「失敗エピソードごとに 1 回」であること
//   - 新しいスキーマ version の検出 (onValue / 初回 get 両経路) で送信が
//     停止すること (stale-client)
// を検証する。LocalStorage のみの挙動 (debounce 等) は useHistoryStack.test.jsx。
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ __path: path })),
  onValue: vi.fn(),
  get: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../firebase/config', () => ({
  db: { __mock: true },
  auth: null,
  authReady: Promise.resolve(),
  authFailed: false,
  isConfigured: true,
}));

import { onValue, get, set } from 'firebase/database';
import { useHistoryStack } from './useHistoryStack';
import { FIREBASE_PROJECT_PATH, CURRENT_PROJECT_VERSION } from '../utils/constants';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  set.mockImplementation(() => Promise.resolve());
  // 初回送信前の version チェック: 既定は「サーバ空」(seed 相当) を返す
  get.mockImplementation(() => Promise.resolve({ val: () => null }));
  onValue.mockImplementation(() => () => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// authReady.then(...) / get().then(...) のチェーンを消化する
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// onValue に登録されたサーバ変更コールバックを取り出す
const getServerCallback = () => onValue.mock.calls[0][1];

// テスト用の差し替え project (v2 で入れて migrate 経路も通す)
const makeProject = (name, extra = {}) => ({
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
  ...extra,
});

describe('useHistoryStack — Firebase への送信', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dispatch 後の flushSave で JSON 文字列が RTDB パスへ書かれる (初回は get 確認後)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    // 初回送信は get() の完了待ち
    expect(set).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    const [dbRef, payload] = set.mock.calls[0];
    expect(dbRef.__path).toBe(FIREBASE_PROJECT_PATH);
    expect(typeof payload).toBe('string');
    expect(JSON.parse(payload).name).toBe('p1');
    // LocalStorage と同じ内容
    expect(payload).toBe(localStorage.getItem('builder.schedule_project'));
  });

  it('get 完了待ちの間の連続 flush は最新 1 件にまとめて送る', async () => {
    // get を手動 resolve にして「確認中」の窓を作る
    let resolveGet;
    get.mockImplementation(() => new Promise((res) => { resolveGet = res; }));
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p2') } }));
    act(() => vi.advanceTimersByTime(800));
    expect(set).not.toHaveBeenCalled();
    resolveGet({ val: () => null });
    await flushMicrotasks();
    // 古い p1 は送らず、最新 p2 のみ
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.parse(set.mock.calls[0][1]).name).toBe('p2');
  });

  it('受信適用後の autosave は同じ内容をサーバへ送り返さない (echo 抑制)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => getServerCallback()({ val: () => JSON.stringify(makeProject('タブレット編集')) }));
    expect(result.current.project.name).toBe('タブレット編集');
    // 適用による project 変化で autosave が走るが、サーバと合意済みの内容
    // なので Firebase へは送らない (LocalStorage へは保存される)
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(set).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('builder.schedule_project')).name).toBe('タブレット編集');
  });

  it('初回 get が「新しいスキーマ」を返したら送信せず sync-stale (書込前の上書き防止)', async () => {
    const newer = { ...makeProject('サーバ側が新しい'), version: CURRENT_PROJECT_VERSION + 1 };
    get.mockImplementation(() => Promise.resolve({ val: () => JSON.stringify(newer) }));
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(set).not.toHaveBeenCalled();
    expect(result.current.syncEvent?.kind).toBe('sync-stale');
    // 以降の編集も送らない
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p2') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(set).not.toHaveBeenCalled();
  });

  it('初回 get の失敗 (オフライン等) は送信を優先する (fail-open)', async () => {
    get.mockImplementation(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useHistoryStack());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe('useHistoryStack — サーバからの受信', () => {
  it('サーバが空なら現在の project を seed する (直前の合意値があっても)', async () => {
    renderHook(() => useHistoryStack());
    await flushMicrotasks();
    expect(onValue).toHaveBeenCalledTimes(1);
    act(() => getServerCallback()({ val: () => null }));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0][1];
    expect(typeof payload).toBe('string');
    // seed は migrate 済み (現行 version) の形
    expect(JSON.parse(payload).version).toBe(CURRENT_PROJECT_VERSION);
  });

  it('ノード削除 (再び null) でも再 seed される (echo 抑制に食われない)', async () => {
    renderHook(() => useHistoryStack());
    await flushMicrotasks();
    // 1 回目の seed
    act(() => getServerCallback()({ val: () => null }));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
    // 管理者がコンソールでノードを削除 → onValue(null) が再度届く
    act(() => getServerCallback()({ val: () => null }));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[1][1]).toBe(set.mock.calls[0][1]);
  });

  it('seed の権限エラーは toast を出さない (開いただけの閲覧ユーザに警告しない)', async () => {
    set.mockImplementation(() => Promise.reject({ code: 'PERMISSION_DENIED', message: 'denied' }));
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => getServerCallback()({ val: () => null }));
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
    expect(result.current.syncEvent).toBeNull();
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

  it('適用時にローカルの activeTabId (ビュー状態) を温存する', async () => {
    const twoTabs = (name, activeTabId) => makeProject(name, {
      activeTabId,
      tabs: [
        makeProject(name).tabs[0],
        { ...makeProject(name).tabs[0], id: 2, name: 'タブ2' },
      ],
    });
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    // ローカルはタブ 2 を表示中
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: twoTabs('ローカル', 2) } }));
    // リモートはタブ 1 を表示した状態で保存された別内容
    act(() => getServerCallback()({ val: () => JSON.stringify(twoTabs('リモート', 1)) }));
    expect(result.current.project.name).toBe('リモート');
    expect(result.current.project.activeTabId).toBe(2); // ローカルの選択を温存
  });

  it('ローカルと同一内容の受信は何もしない (起動時の正常系)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    const before = result.current.project;
    act(() => getServerCallback()({ val: () => JSON.stringify(before) }));
    expect(result.current.project).toBe(before);
    expect(result.current.syncEvent).toBeNull();
  });

  it('activeTabId だけが違う受信は適用しない (タブ切替を編集として伝播させない)', async () => {
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    const before = result.current.project;
    const remote = { ...JSON.parse(JSON.stringify(before)), activeTabId: 999 };
    act(() => getServerCallback()({ val: () => JSON.stringify(remote) }));
    expect(result.current.project).toBe(before);
    expect(result.current.syncEvent).toBeNull();
  });

  it('自分が送った JSON の echo は適用しない', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
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

  // 以降のテストでは先にサーバ空スナップショットを届けて初回 get 確認を
  // 済ませ、送信を同期的に観察できるようにする (seed は set 1 回消費)。
  async function mountSynced() {
    const hook = renderHook(() => useHistoryStack());
    await flushMicrotasks();
    act(() => getServerCallback()({ val: () => JSON.stringify(hook.result.current.project) }));
    return hook;
  }

  it('PERMISSION_DENIED で sync-auth イベント。同一エピソード中は再通知しない', async () => {
    const { result } = await mountSynced();
    set.mockImplementation(() => Promise.reject({ code: 'PERMISSION_DENIED', message: 'denied' }));
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

  it('書込が一度成功するとラッチが解除され、再失敗で再通知される (回復 → 再失敗)', async () => {
    const { result } = await mountSynced();
    // 失敗 → sync-auth
    set.mockImplementation(() => Promise.reject({ code: 'PERMISSION_DENIED', message: 'denied' }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p1') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    const first = result.current.syncEvent;
    expect(first?.kind).toBe('sync-auth');
    // 成功 (管理者ログイン後) → ラッチ解除
    set.mockImplementation(() => Promise.resolve());
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p2') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    // 再失敗 (ログアウト後) → 新しいイベントが出る
    set.mockImplementation(() => Promise.reject({ code: 'PERMISSION_DENIED', message: 'denied' }));
    act(() => result.current.dispatch({ type: 'project/replace', payload: { project: makeProject('p3') } }));
    act(() => vi.advanceTimersByTime(800));
    await flushMicrotasks();
    expect(result.current.syncEvent?.kind).toBe('sync-auth');
    expect(result.current.syncEvent).not.toBe(first);
  });

  it('その他のエラーは sync-error イベントになる', async () => {
    const { result } = await mountSynced();
    set.mockImplementation(() => Promise.reject(new Error('network')));
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
    await flushMicrotasks();
    expect(JSON.parse(localStorage.getItem('builder.schedule_project')).name).toBe('ローカル編集');
    expect(set).not.toHaveBeenCalled();
  });
});
