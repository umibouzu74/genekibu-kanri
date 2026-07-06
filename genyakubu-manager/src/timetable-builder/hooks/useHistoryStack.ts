import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
import type { Project, ProjectState } from '../types';
import { db, authReady, isConfigured } from '../../firebase/config';
import { trackSyncActivity, isPermissionError } from '../../hooks/useSyncedStorage';
import { STORAGE_KEY_PROJECT, FIREBASE_PROJECT_PATH } from '../utils/constants';
import { decideRemoteProject, newerSchemaVersion } from '../utils/projectSync';
import { loadInitialProject } from './projectFactory';
import { projectReducer } from './projectReducer';

// 実書き込みの debounce 間隔 (F2c)。この間に来た連続編集は 1 回の
// JSON.stringify + setItem にまとめる。
const SAVE_DEBOUNCE_MS = 800;

// Firebase 同期イベント (E6a)。UI (ScheduleApp) が toast で通知する。
//   - remote-apply: 他端末で保存された project を反映した (発生ごとに通知。
//                   連続反映の toast 抑制は UI 側で行う)
//   - sync-auth:    書込権限なし = 管理者未ログイン (失敗エピソードごとに
//                   1 回 — 書込が一度成功するとラッチは解除され、再失敗で
//                   再通知される)
//   - sync-error:   その他の書込失敗 (同上)
//   - sync-stale:   サーバの project がこのアプリより新しいスキーマで
//                   同期を停止した (セッション中 1 回のみ)
export type SyncEventKind = 'remote-apply' | 'sync-auth' | 'sync-error' | 'sync-stale';
export type SyncEvent = { kind: SyncEventKind };

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
//     巻き戻せると、その巻き戻しがまたサーバへ書かれて混乱するため)。
//     ただし activeTabId (ビュー状態) はローカルの選択を温存する
//   - 競合: キー単位の last-writer-wins (K5a: 2 端末同時編集は運用上
//     発生しない前提。マージ・楽観ロックは意図的に作らない)
//   - echo 抑制: 最後にサーバと合意した JSON 文字列 (lastCloudJsonRef) と
//     完全一致する受信・送信はスキップする。起動時は LocalStorage の生文字列
//     で先読みする (単一端末運用の起動スナップショットをフル比較なしで弾く)
//   - 初回送信前チェック: サーバ状態を一度も見ていないうちに送信する場合
//     (起動直後の編集が初回スナップショットより先に flush されるケース) は、
//     get() で version だけ確認してから送る。受信側の stale-client 検出
//     だけでは「新しいスキーマのデータを見る前に上書きする」を防げない
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
  // 初回送信前の version チェックの状態機械。
  //   'todo'    = サーバ状態を一度も見ていない (送信前に get() で確認する)
  //   'pending' = get() 実行中 (その間の送信は queuedJsonRef に最新だけ残す)
  //   'done'    = 確認済み or スナップショット受信済み (以降は素通し)
  const firstPushCheckRef = useRef<'todo' | 'pending' | 'done'>('todo');
  const queuedJsonRef = useRef<string | null>(null);
  // エラー通知の重複抑制。sync-stale はセッション永続、auth/error 系は
  // 書込が一度成功したら解除して「回復 → 再失敗」を再通知できるようにする
  // (親 App.jsx が isAdmin 変化でフラグを戻すのと同じ発想)。
  const notifiedKindsRef = useRef<Set<SyncEventKind>>(new Set());

  useEffect(() => {
    projectRef.current = state.project;
  });

  const notifyOnce = useCallback((kind: SyncEventKind) => {
    if (notifiedKindsRef.current.has(kind)) return;
    notifiedKindsRef.current.add(kind);
    setSyncEvent({ kind });
  }, []);

  // 実際の set() 発行。呼び出し側で firstPushCheckRef が 'done' である
  // ことを保証する。silentErrors は seed (ユーザ操作なしの書込) 用 —
  // 匿名閲覧ユーザが開いただけで権限エラー toast を見せない (親アプリの
  // seed が console.warn のみで沈黙するのと同じ方針)。
  const sendToFirebase = useCallback((json: string, { silentErrors = false } = {}) => {
    if (!isConfigured || !db) return;
    if (syncDisabledRef.current) return;
    if (json === lastCloudJsonRef.current) return;
    lastCloudJsonRef.current = json;
    trackSyncActivity(set(ref(db, FIREBASE_PROJECT_PATH), json))
      .then(() => {
        // 書込が通った = このエラー episode は終了。次の失敗で再通知する。
        notifiedKindsRef.current.delete('sync-auth');
        notifiedKindsRef.current.delete('sync-error');
      })
      .catch((err: unknown) => {
        console.warn('[useHistoryStack] firebase sync failed:', err);
        // 失敗した書込を「合意済み」にしたままだと同内容の再送が永遠に
        // スキップされるため、サーバ状態未知に戻す。
        if (lastCloudJsonRef.current === json) lastCloudJsonRef.current = null;
        if (!silentErrors) notifyOnce(isPermissionError(err) ? 'sync-auth' : 'sync-error');
      });
  }, [notifyOnce]);

  // project の JSON 文字列を Firebase へ送る。サーバ状態を一度も見ていない
  // 場合は、先に get() で「サーバがより新しいスキーマを持っていないか」を
  // 一度だけ確認する (通常はここに来る前に初回スナップショットが届いて
  // 'done' になっているので、get() が走るのは起動直後に編集した場合のみ)。
  // get() がオフライン等で失敗したときは送信を優先する — SDK の書込キューが
  // オフライン編集の耐久性を担っているため、確認をハードゲートにはしない。
  const pushProjectToFirebase = useCallback((json: string, opts: { silentErrors?: boolean } = {}) => {
    if (!isConfigured || !db) return;
    if (syncDisabledRef.current) return;
    if (json === lastCloudJsonRef.current) return;

    if (firstPushCheckRef.current === 'done') {
      sendToFirebase(json, opts);
      return;
    }
    // 確認完了までの送信は最新 1 件だけ覚えて送る (古い方を後から送ると
    // サーバ上で編集が巻き戻る)。
    queuedJsonRef.current = json;
    if (firstPushCheckRef.current === 'pending') return;
    firstPushCheckRef.current = 'pending';

    const flushQueued = () => {
      firstPushCheckRef.current = 'done';
      const queued = queuedJsonRef.current;
      queuedJsonRef.current = null;
      if (queued != null) sendToFirebase(queued, opts);
    };
    get(ref(db, FIREBASE_PROJECT_PATH))
      .then((snapshot) => {
        const version = newerSchemaVersion(snapshot.val());
        if (version != null) {
          firstPushCheckRef.current = 'done';
          queuedJsonRef.current = null;
          syncDisabledRef.current = true;
          console.warn(`[useHistoryStack] remote project is v${version} (> supported). sync disabled.`);
          notifyOnce('sync-stale');
          return;
        }
        flushQueued();
      })
      .catch(flushQueued);
  }, [sendToFirebase, notifyOnce]);

  // 未保存分を即時書き込みする。debounce タイマー発火・アンマウント・
  // ページ離脱 (pagehide/beforeunload) の 3 経路から呼ばれる。
  // LocalStorage 書き込みは容量超過 (QuotaExceededError) や private mode で
  // throw しうる。未捕捉だと effect が落ちるので握って status に出す。
  // stringify が通っていれば Firebase へは LS の成否に関わらず送る
  // (quota で LS が死んでいてもクラウド側には残せる)。
  const flushSave = useCallback(() => {
    const pending = pendingProjectRef.current;
    if (pending == null) return;
    pendingProjectRef.current = null;
    let json: string | null = null;
    try {
      json = JSON.stringify(pending);
      localStorage.setItem(STORAGE_KEY_PROJECT, json);
      setSaveStatus("✅ 保存済");
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus("⚠️ 保存失敗");
    }
    if (json != null) pushProjectToFirebase(json);
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

    // 起動時は LocalStorage の生文字列を「サーバと合意済みの可能性が高い値」
    // として先読みする。単一端末運用では初回スナップショットがこれと byte
    // 一致するので、フル比較 (parse + migrate + stableStringify) を丸ごと
    // スキップできる。StrictMode の二重 effect が起動直後に未編集 project を
    // push するのも同時に抑止される (json が LS と一致して echo 扱い)。
    try {
      lastCloudJsonRef.current = localStorage.getItem(STORAGE_KEY_PROJECT);
    } catch {
      // private mode 等。サーバ状態未知のままでよい
    }

    let unsubscribed = false;
    let detach: (() => void) | null = null;
    const dbRef = ref(db, FIREBASE_PROJECT_PATH);

    authReady.then(() => {
      if (unsubscribed) return;

      detach = onValue(
        dbRef,
        (snapshot) => {
          // スナップショットを処理した = サーバ状態は既知。以降の送信で
          // 初回 get() チェックは不要。
          firstPushCheckRef.current = 'done';
          const raw = snapshot.val();

          if (raw == null) {
            // サーバが空 (初回導入 or ノード削除)。echo 抑制の合意値は必ず
            // 無効化してから seed する — 前回 push した JSON や LS 先読み値と
            // 一致すると seed 自体がスキップされ、サーバが空のまま残る。
            // seed はユーザ操作のない書込なので、失敗 (匿名閲覧ユーザの
            // 権限エラー) は toast を出さず console.warn に留める。
            lastCloudJsonRef.current = null;
            pushProjectToFirebase(JSON.stringify(projectRef.current), { silentErrors: true });
            return;
          }

          // 自分の書込の echo / 起動時の LS 一致
          if (raw === lastCloudJsonRef.current) return;

          const decision = decideRemoteProject(raw, projectRef.current);
          if (decision.action === 'apply') {
            // activeTabId はビュー状態なのでローカルの選択を温存する
            // (リモートが今見ているタブを消した場合のみリモート側に従う)。
            const local = projectRef.current;
            const applied = decision.project.tabs.some(t => t.id === local.activeTabId)
              ? { ...decision.project, activeTabId: local.activeTabId }
              : decision.project;
            // 適用後の autosave (flushSave) が同じ内容を送り返さないよう、
            // 適用形の JSON を「サーバと合意済み」として控える。
            lastCloudJsonRef.current = JSON.stringify(applied);
            // 適用は project/reset (履歴ごと初期化)。他端末の編集をローカル
            // 履歴に混ぜると Undo がサーバ状態を巻き戻す書込になるため。
            dispatch({ type: 'project/reset', payload: applied });
            setSyncEvent({ kind: 'remote-apply' });
          } else if (decision.action === 'identical') {
            lastCloudJsonRef.current = raw;
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
          // 読めない場合も送信は止めない (fail-open、親アプリと同じ)。
          firstPushCheckRef.current = 'done';
          console.warn('[useHistoryStack] onValue error:', err);
        },
      );
    });

    return () => {
      unsubscribed = true;
      // onValue の戻り値で自分のリスナーだけ外す (off(dbRef) は同一パスの
      // 他リスナーまで巻き込むため使わない)。
      detach?.();
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
