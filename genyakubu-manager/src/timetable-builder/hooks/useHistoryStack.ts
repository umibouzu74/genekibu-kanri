import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ref, onValue, off, set } from 'firebase/database';
import type { Project, ProjectState } from '../types';
import { db, authReady, isConfigured } from '../../firebase/config';
import { trackSyncActivity, isPermissionError } from '../../hooks/useSyncedStorage';
import { STORAGE_KEY_PROJECT, FIREBASE_PROJECT_PATH } from '../utils/constants';
import { decideRemoteProject } from '../utils/projectSync';
import { loadInitialProject } from './projectFactory';
import { projectReducer } from './projectReducer';

// 実書き込みの debounce 間隔 (F2c)。この間に来た連続編集は 1 回の
// JSON.stringify + setItem にまとめる。
const SAVE_DEBOUNCE_MS = 800;

// Firebase 同期イベント (E6a)。UI (ScheduleApp) が toast で通知する。
//   - remote-apply: 他端末で保存された project を反映した (発生ごとに通知)
//   - sync-auth:    書込権限なし = 管理者未ログイン (セッション中 1 回のみ)
//   - sync-error:   その他の書込失敗 (セッション中 1 回のみ)
//   - sync-stale:   サーバの project がこのアプリより新しいスキーマで
//                   同期を停止した (セッション中 1 回のみ)
export type SyncEventKind = 'remote-apply' | 'sync-auth' | 'sync-error' | 'sync-stale';
export type SyncEvent = { kind: SyncEventKind; at: number };

// project state を useReducer で管理し、Undo/Redo 履歴と LocalStorage 自動保存
// + Firebase RTDB 同期 (E6a) をまとめたフック。
//
// state 形状は projectReducer.js のコメントを参照。
//
// Firebase 同期の設計 (E6a、詳細は docs/ARCHITECTURE.md §5):
//   - 保存: debounce 済み flushSave が LocalStorage と同じ JSON 文字列を
//     appData/builder/schedule_project へ書く (文字列保存の理由は
//     constants.FIREBASE_PROJECT_PATH のコメント参照)
//   - 受信: onValue で届いた文字列を decideRemoteProject で判定し、採用なら
//     project/reset で全置換する (履歴もリセット。他端末の編集を Undo で
//     巻き戻せると、その巻き戻しがまたサーバへ書かれて混乱するため)
//   - 競合: キー単位の last-writer-wins (K5a: 2 端末同時編集は運用上
//     発生しない前提。マージ・楽観ロックは意図的に作らない)
//   - echo 抑制: 最後にサーバと合意した JSON 文字列 (lastCloudJsonRef) と
//     完全一致する受信・送信はスキップする
//
// 公開 API:
//   project, dispatch, history, historyIndex, saveStatus, undo, redo,
//   loadError, syncEvent
export function useHistoryStack() {
  const [state, dispatch] = useReducer(projectReducer, null, (): ProjectState => {
    const { project, loadError } = loadInitialProject();
    return {
      project,
      history: [project],
      historyIndex: 0,
      loadError,
    };
  });

  const [saveStatus, setSaveStatus] = useState("✅ 保存済");
  const [syncEvent, setSyncEvent] = useState<SyncEvent | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // debounce 中の未保存 project。null = 未保存分なし。
  const pendingProjectRef = useRef<Project | null>(null);
  const isInitialMount = useRef(true);
  // onValue コールバックから「今の project」を参照するための ref
  // (subscribe effect は mount-only なので closure の state は古くなる)。
  const projectRef = useRef<Project>(state.project);
  // サーバが持っている (と最後に合意した) JSON 文字列。自分の書込の echo と
  // 変化なしの再送をスキップする。null = サーバ状態は未知。
  const lastCloudJsonRef = useRef<string | null>(null);
  // sync-stale 検出後は true。古いクライアントが新しいスキーマのデータを
  // 上書きして壊さないよう、以降このセッションでは送信しない。
  const syncDisabledRef = useRef(false);
  // 1 回だけ通知するイベント種別の既出セット (sync-auth / sync-error /
  // sync-stale)。失敗のたびに toast が積まれるのを防ぐ。
  const notifiedKindsRef = useRef<Set<SyncEventKind>>(new Set());

  useEffect(() => {
    projectRef.current = state.project;
  });

  const notifyOnce = useCallback((kind: SyncEventKind) => {
    if (notifiedKindsRef.current.has(kind)) return;
    notifiedKindsRef.current.add(kind);
    setSyncEvent({ kind, at: Date.now() });
  }, []);

  // project の JSON 文字列を Firebase へ送る。未設定環境・echo・stale 停止中
  // は no-op。書込は SyncStatus の pending カウンタ (trackSyncActivity) に
  // 計上する。失敗時は lastCloudJsonRef を未知に戻し、次の flush で再送する。
  const pushProjectToFirebase = useCallback((json: string) => {
    if (!isConfigured || !db) return;
    if (syncDisabledRef.current) return;
    if (json === lastCloudJsonRef.current) return;
    lastCloudJsonRef.current = json;
    trackSyncActivity(set(ref(db, FIREBASE_PROJECT_PATH), json)).catch((err: unknown) => {
      console.warn('[useHistoryStack] firebase sync failed:', err);
      if (lastCloudJsonRef.current === json) lastCloudJsonRef.current = null;
      notifyOnce(isPermissionError(err) ? 'sync-auth' : 'sync-error');
    });
  }, [notifyOnce]);

  // 未保存分を即時書き込みする。debounce タイマー発火・アンマウント・
  // ページ離脱 (pagehide/beforeunload) の 3 経路から呼ばれる。
  // LocalStorage 書き込みは容量超過 (QuotaExceededError) や private mode で
  // throw しうる。未捕捉だと effect が落ちるので握って status に出す。
  // Firebase への送信は LocalStorage の成否に関わらず行う (quota で LS が
  // 死んでいてもクラウド側には残せる)。
  const flushSave = useCallback(() => {
    const pending = pendingProjectRef.current;
    if (pending == null) return;
    pendingProjectRef.current = null;
    let json: string;
    try {
      json = JSON.stringify(pending);
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus("⚠️ 保存失敗");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY_PROJECT, json);
      setSaveStatus("✅ 保存済");
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus("⚠️ 保存失敗");
    }
    pushProjectToFirebase(json);
  }, [pushProjectToFirebase]);

  // project 変化を debounce して LocalStorage に保存 (F2c)。初回マウントは skip。
  // 旧実装は毎 dispatch で同期 JSON.stringify + setItem していた (debounce は
  // ステータス表示のみ) ため、大規模プロジェクトでは keystroke ごとの
  // 直列化が入力レイテンシ源になっていた。実書き込み自体を debounce する。
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    pendingProjectRef.current = state.project;
    setSaveStatus("💾 保存中...");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [state.project, flushSave]);

  // debounce 確定前の離脱で編集を取りこぼさないための flush。
  // - pagehide / beforeunload: タブ閉じ・リロード (両方登録し pending の
  //   null チェックで二重書き込みを防ぐ)
  // - cleanup: Builder からの view 切替等によるアンマウント
  useEffect(() => {
    const onLeave = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushSave();
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [flushSave]);

  // Firebase の変更購読 (E6a)。親アプリの useSyncedStorage と同じ流儀で、
  // authReady を待ってから onValue を張る。マウント時に必ず初回スナップ
  // ショットが届くので、起動時のサーバ→ローカル反映もこの経路に乗る
  // (同一内容なら decideRemoteProject が identical に落とすため何も起きない)。
  useEffect(() => {
    if (!isConfigured || !db) return undefined;

    let unsubscribed = false;
    const dbRef = ref(db, FIREBASE_PROJECT_PATH);

    authReady.then(() => {
      if (unsubscribed) return;

      onValue(
        dbRef,
        (snapshot) => {
          const raw = snapshot.val();

          if (raw == null) {
            // サーバが空 (初回導入) — 現在のローカル project を seed する。
            // loadInitialProject 済みなので常に migrate 済みの形が入る (K5b)。
            pushProjectToFirebase(JSON.stringify(projectRef.current));
            return;
          }

          // 自分の書込の echo
          if (raw === lastCloudJsonRef.current) return;

          const decision = decideRemoteProject(raw, projectRef.current);
          if (decision.action === 'apply') {
            // 適用後の autosave (flushSave) が同じ内容を送り返さないよう、
            // 適用形の JSON を「サーバと合意済み」として控える。
            lastCloudJsonRef.current = JSON.stringify(decision.project);
            // 適用は project/reset (履歴ごと初期化)。他端末の編集をローカル
            // 履歴に混ぜると Undo がサーバ状態を巻き戻す書込になるため。
            dispatch({ type: 'project/reset', payload: decision.project });
            setSyncEvent({ kind: 'remote-apply', at: Date.now() });
          } else if (decision.action === 'identical') {
            lastCloudJsonRef.current = typeof raw === 'string' ? raw : null;
          } else if (decision.action === 'stale-client') {
            // サーバ側の方が新しいスキーマ。上書きすると壊すので送信を停止。
            syncDisabledRef.current = true;
            console.warn(
              `[useHistoryStack] remote project is v${decision.version} (> supported). sync disabled for this session.`,
            );
            notifyOnce('sync-stale');
          } else {
            // reject: サーバ側の blob が壊れている。ローカルを正とし、
            // 次の編集の autosave がサーバを上書きして自己修復する。
            console.warn('[useHistoryStack] remote project skipped:', decision.reason);
          }
        },
        (err) => {
          console.warn('[useHistoryStack] onValue error:', err);
        },
      );
    });

    return () => {
      unsubscribed = true;
      off(dbRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: 依存は全て stable
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'history/undo' });
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: 'history/redo' });
  }, []);

  return {
    project: state.project,
    dispatch,
    history: state.history,
    historyIndex: state.historyIndex,
    saveStatus,
    undo,
    redo,
    loadError: state.loadError,
    syncEvent,
  };
}
