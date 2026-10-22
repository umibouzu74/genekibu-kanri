// ─── クラウド (Firebase) とのつながりの状態 ─────────────────────────
// useSyncedStorage などの読み取りの結果と、ログイン (匿名 / 管理者) の状態を
// 1 か所に集め、画面 (SyncStatus・CloudReadWarning) に出すための小さな
// 置き場。Firebase の SDK には依存しない (テストでは config をモックするので、
// ここまでモックに巻き込まないため)。
//
// 以前は読み取りが拒否されても console.warn だけで、画面はこの端末に残って
// いた古いデータ (一度も読めていない端末ではアプリに組み込まれた見本の
// データ) を黙って出し続けていた。左下の「同期中」は接続 (ソケット) しか
// 見ていないので緑のままだった (2026-10-22: 閲覧用の PC で代行が抜け、
// 1学期の時間割が出ていた)。

import { LS } from "../constants/storageKeys";

// ── ログインの世代 ──────────────────────────────────────────────────
// ログインしているユーザが変わるたび (匿名 → 管理者・ログアウト → 匿名・
// 消えたセッションの入り直し) に 1 つ進む。RTDB は読む権限が無くなった
// 瞬間 (ログアウトの間など) に onValue を取り消し、権限が戻っても張り直さない
// ので、購読する側はこの番号が変わったら張り直す。
let authGeneration = 0;
const generationListeners = new Set();

export function getAuthGeneration() {
  return authGeneration;
}

export function subscribeAuthGeneration(fn) {
  generationListeners.add(fn);
  return () => generationListeners.delete(fn);
}

export function bumpAuthGeneration() {
  authGeneration += 1;
  for (const fn of generationListeners) fn(authGeneration);
}

// ── 読み取りの結果 ──────────────────────────────────────────────────
// received: この画面を開いてから 1 度でもクラウドから読めたか
// readErrors: 読めなかったデータ (パス → エラーの code)
// authError: 匿名ログインの失敗 (code)。成功すれば null に戻る
let state = { received: false, readErrors: new Map(), authError: null };
const stateListeners = new Set();

function emit(next) {
  state = next;
  for (const fn of stateListeners) fn(state);
}

export function getCloudState() {
  return state;
}

export function subscribeCloudState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

const errorCode = (err) =>
  (err && (err.code || err.name || err.message)) || "unknown";

// 最後にクラウドから読めた日時は端末に覚える (次に開いたとき、読めなければ
// 「◯日時点のデータ」と出すため)。読み取りは起動時に全キーぶん届くので、
// 書き込みは間引く
const LAST_READ_WRITE_INTERVAL_MS = 30 * 1000;
let lastReadWrittenAt = 0;

/** 読めた (null = まだ何も書かれていないキーも、読めたことに変わりない) */
export function reportCloudRead(path) {
  const now = Date.now();
  if (now - lastReadWrittenAt >= LAST_READ_WRITE_INTERVAL_MS) {
    lastReadWrittenAt = now;
    try {
      localStorage.setItem(LS.lastCloudRead, String(now));
    } catch {
      // 保存できなくても表示には困らない
    }
  }
  if (state.received && !state.readErrors.has(path)) return;
  const readErrors = new Map(state.readErrors);
  readErrors.delete(path);
  emit({ ...state, received: true, readErrors });
}

/** 読めなかった (権限が無い・取り消された) */
export function reportCloudReadError(path, err) {
  const code = errorCode(err);
  if (state.readErrors.get(path) === code) return;
  const readErrors = new Map(state.readErrors);
  readErrors.set(path, code);
  emit({ ...state, readErrors });
}

/** 張り直す前に、そのデータの前のエラーを消す (結果は次の報告で決まる) */
export function clearCloudReadError(path) {
  if (!state.readErrors.has(path)) return;
  const readErrors = new Map(state.readErrors);
  readErrors.delete(path);
  emit({ ...state, readErrors });
}

/** 匿名ログインの失敗 (err) / 成功 (null) */
export function reportAuthError(err) {
  const authError = err ? errorCode(err) : null;
  if (state.authError === authError) return;
  emit({ ...state, authError });
}

/** この端末で最後にクラウドから読めた日時 (ミリ秒)。読めたことが無ければ null */
export function getLastCloudRead() {
  try {
    const n = Number(localStorage.getItem(LS.lastCloudRead));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** テスト用: 状態を最初に戻す */
export function resetCloudStateForTest() {
  authGeneration = 0;
  lastReadWrittenAt = 0;
  state = { received: false, readErrors: new Map(), authError: null };
}
