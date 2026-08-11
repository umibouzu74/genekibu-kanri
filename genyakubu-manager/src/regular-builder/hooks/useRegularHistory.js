import { useCallback, useEffect, useRef, useState } from "react";
import { describeHistoryChange, diffWorkspaces } from "../historyFeedback";

// ─── Undo/Redo (通常時間割作成) ─────────────────────────────────────
// 自分の編集 (commitWorkspace 経由) だけを履歴に積む軽量スタック。
// 直近 800ms 以内の連続編集 (セルへのタイピング等) は 1 つの取り消し単位に
// 束ねる。atomic: true の編集 (D&D 入替・セルクリア等の単発操作) は直前の
// タイピングと束ねず必ず独立した取り消し単位にする。
// リモート同期で入った変更は履歴に乗らない (単独編集前提の割り切り —
// undo するとその間の同期変更ごと戻る)。
//
// undo/redo は「何が戻ったか」を toast で知らせる (講習 N2f と同趣旨)。
// 表示していない曜日のセルが戻っても気付けるよう、セル変更ならその場所
// (と before → after) を要約し、「表示」ボタンで該当セルへ飛べるようにする。

/** 連続編集を 1 つの取り消し単位に束ねる時間 (ms) */
const COALESCE_MS = 800;
/** 保持する取り消し単位の上限 */
const MAX_DEPTH = 100;

/**
 * @param {object} workspace 現在のワークスペース
 * @param {(next: object|((w:object)=>object)) => void} saveWorkspace
 * @param {{toasts: object, jumpToCells: (refs: string[], day: string) => void}} deps
 * @returns {{
 *   commitWorkspace: (next: object|Function, opts?: {atomic?: boolean}) => void,
 *   undo: () => void, redo: () => void,
 *   canUndo: boolean, canRedo: boolean,
 * }}
 */
export function useRegularHistory(workspace, saveWorkspace, { toasts, jumpToCells }) {
  const wsRef = useRef(workspace);
  useEffect(() => {
    wsRef.current = workspace;
  }, [workspace]);

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastCommitAtRef = useRef(0);
  const [histVersion, setHistVersion] = useState(0);

  const commitWorkspace = useCallback(
    (next, { atomic = false } = {}) => {
      const now = Date.now();
      if (atomic || now - lastCommitAtRef.current > COALESCE_MS) {
        undoStackRef.current = [
          ...undoStackRef.current.slice(-(MAX_DEPTH - 1)),
          wsRef.current,
        ];
      }
      redoStackRef.current = [];
      lastCommitAtRef.current = atomic ? 0 : now;
      saveWorkspace(next);
      setHistVersion((v) => v + 1);
    },
    [saveWorkspace]
  );

  const notifyHistory = useCallback(
    (kind, fromWs, toWs) => {
      const diff = diffWorkspaces(fromWs, toWs);
      const text = describeHistoryChange(diff) || "変更なし";
      const activeId = toWs.projects.some((p) => p.id === toWs.activeProjectId)
        ? toWs.activeProjectId
        : toWs.projects[0]?.id;
      const target = diff.cellChanges.find((c) => c.projectId === activeId);
      toasts.info(`${kind === "undo" ? "↩️ 元に戻す" : "↪️ やり直し"}: ${text}`, {
        duration: 3500,
        action: target
          ? { label: "表示", onClick: () => jumpToCells([target.ref], target.day) }
          : undefined,
      });
    },
    [toasts, jumpToCells]
  );

  // undo と redo はスタックの向きが逆なだけなので 1 つの実装にまとめる
  const step = useCallback(
    (kind) => {
      const fromRef = kind === "undo" ? undoStackRef : redoStackRef;
      const toRef = kind === "undo" ? redoStackRef : undoStackRef;
      const stack = fromRef.current;
      if (stack.length === 0) return;
      const target = stack[stack.length - 1];
      const cur = wsRef.current;
      fromRef.current = stack.slice(0, -1);
      toRef.current = [...toRef.current, cur];
      lastCommitAtRef.current = 0; // 次の編集は新しい取り消し単位
      saveWorkspace(target);
      setHistVersion((v) => v + 1);
      notifyHistory(kind, cur, target);
    },
    [saveWorkspace, notifyHistory]
  );

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  // histVersion を式に含めて、ref の変化でも再評価されるようにする
  const canUndo = histVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = histVersion >= 0 && redoStackRef.current.length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // テキスト入力中はブラウザ標準の undo を優先する。select は標準 undo が
      // 無いので対象に含める (講習 N1d と同じ — プルダウンで教科・講師を
      // 変えた直後の Ctrl+Z が無反応にならない)
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { commitWorkspace, undo, redo, canUndo, canRedo };
}
