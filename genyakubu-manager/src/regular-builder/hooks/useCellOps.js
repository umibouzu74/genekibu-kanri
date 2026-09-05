import { useCallback, useEffect, useMemo, useState } from "react";
import { makeCellRef, parseCellKey, parseCellRef, setCellsLocked } from "../model";
import { computeMergeLayout } from "../mergedColumns";
import { changeJoint } from "../jointEdit";
import { conflictKey } from "../conflicts";
import { formatCellShort } from "../historyFeedback";
import { bulkEditCells, describeBulkEdit, fillCells } from "../bulkEdit";
import { useCellSelection } from "./useCellSelection";

// ─── セル単位の操作 (RegularBuilderApp から 2026-09-05 に切り出し) ──────
// 右クリック / 長押しメニュー・コピー & 貼り付け・ロック・⊞ 合同・
// 複数選択と一括クリア / 一括変更 / 選択範囲への貼り付け・重なりの承認。
// どれも「件数は表示用に現時点の project で数え、保存は saveProject の
// 最新値で再計算する」パターン。返す名前は切り出し前の App 内のものと同じ
// (JSX 側を変えないため)。
//
// selectionResetKey: 曜日・プロジェクト・表示モードなど「見えているセルの
// 集合」が変わる要素を連結したキー。変わったら複数選択を捨てる
export function useCellOps({
  project,
  saveProject,
  updateTab,
  toasts,
  confirm,
  jumpToCells,
  conflictView,
  selectionResetKey,
}) {
  // ── コンテキストメニュー (セル右クリック / 長押し・ヘッダの一括操作) ──
  const [ctxMenu, setCtxMenu] = useState(null);
  const [cellClipboard, setCellClipboard] = useState(null);
  // ⊞ 合同ダイアログの対象セル ref (null = 非表示)
  const [jointTarget, setJointTarget] = useState(null);

  // ── 複数選択 (実体は useCellSelection) ──────────────────────────
  // 曜日・プロジェクト・表示モード・並べる曜日が変わったら選択は持ち
  // 越さない (見えないセルへの一括操作を防ぐ)
  const { selectedRefs, anchorRef: selAnchorRef, toggleSelect, rectSelect, clearSelection } =
    useCellSelection({
      resetKey: selectionResetKey,
      ctxMenuOpen: !!ctxMenu,
    });

  // セルの ✕ ボタンで全フィールドをクリア (Undo で戻せる独立単位)。
  // ロック中は変更しない (UI 側も ✕ を隠し Delete を無効化している)
  const onClearCell = useCallback(
    (ref) => {
      const { tabId, key } = parseCellRef(ref);
      updateTab(
        tabId,
        (t) => {
          if (!(key in t.schedule) || t.schedule[key].locked) return t;
          const schedule = { ...t.schedule };
          delete schedule[key];
          return { ...t, schedule };
        },
        { atomic: true }
      );
    },
    [updateTab]
  );

  const getCellByRef = useCallback(
    (ref) => {
      const { tabId, key } = parseCellRef(ref);
      return project.tabs.find((t) => t.id === tabId)?.schedule?.[key] || null;
    },
    [project]
  );

  const openCellMenu = useCallback((pos, ref) => {
    setCtxMenu({ kind: "cell", x: pos.clientX, y: pos.clientY, ref });
  }, []);
  const openHeaderMenu = useCallback((pos, payload) => {
    setCtxMenu({ x: pos.clientX, y: pos.clientY, ...payload });
  }, []);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // コピーはロックを引き継がない (貼り付け先は編集できる状態で置く)
  const copyCell = (ref) => {
    const cell = getCellByRef(ref);
    if (!cell) return;
    const { locked: _locked, ...content } = cell;
    setCellClipboard(content);
    toasts.success(`「${formatCellShort(content)}」をコピーしました`, {
      duration: 1500,
    });
  };

  // 貼り付けはセル全体 (教科・講師・教室・備考) を置き換える。Undo 1 回で
  // 戻る。ロック中のセルへは貼り付けない
  const pasteCell = (ref) => {
    if (!cellClipboard) return;
    if (getCellByRef(ref)?.locked) {
      toasts.info("ロック中のセルには貼り付けできません（右クリック → 🔓 ロック解除）");
      return;
    }
    const { tabId, key } = parseCellRef(ref);
    updateTab(
      tabId,
      (t) => ({ ...t, schedule: { ...t.schedule, [key]: { ...cellClipboard } } }),
      { atomic: true }
    );
  };

  // ── セルのロック (固定) の付け外し ──────────────────────────────
  // 件数は表示用に現時点の project で数え、保存は saveProject の最新値で
  // 行う (講師リネームと同じパターン)。中身のあるセルだけが対象
  const toggleLockRefs = (refs, locked) => {
    const { changed } = setCellsLocked(project.tabs, refs, locked);
    if (changed === 0) {
      toasts.info(
        locked
          ? "ロックできるコマがありません（空セルはロックできません）"
          : "ロック中のコマがありません"
      );
      return;
    }
    saveProject(
      (p) => ({ ...p, tabs: setCellsLocked(p.tabs, refs, locked).tabs }),
      { atomic: true }
    );
    toasts.success(
      locked
        ? `${changed} コマをロックしました（編集・入替・クリアを防ぎます）`
        : `${changed} コマのロックを解除しました`
    );
  };

  // ── ⊞ 合同 (結合コマ) の作成・変更 ──────────────────────────────
  // メニュー項目の表示状態 (合同を組めるクラスが 2 つ以上あるタブのみ)
  const jointItem = useMemo(() => {
    if (ctxMenu?.kind !== "cell") return null;
    const { tabId, key } = parseCellRef(ctxMenu.ref);
    const tab = project.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    const layout = computeMergeLayout(tab);
    if (layout.visible.length < 2) return null;
    const { classId } = parseCellKey(key);
    const isJoint = layout.ranges.some((r) => r.cls.id === classId);
    const cell = tab.schedule[key];
    return {
      isJoint,
      disabled: !cell || !!cell.locked,
      title: !cell
        ? "空のセルは合同にできません (コマを入力してから設定します。既存の合同枠へは ⊞ ボタンで追加できます)"
        : cell.locked
          ? "ロック中のセルは変更できません"
          : isJoint
            ? "この合同コマの対象クラスを変える・通常コマに戻す"
            : "このコマを複数クラスの合同 (結合表示) にする",
    };
  }, [ctxMenu, project]);

  // ダイアログの「変更する」。表示用の計算はダイアログ側 (changeJoint) と
  // 同じ ops で行い、保存は saveProject の最新値で再計算する (setClassRoom
  // と同じパターン)
  const applyJointChange = useCallback(
    ({ tabId, ops, day }) => {
      const tab = project.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const res = changeJoint(tab, ops, { periods: project.periods });
      if (!res.ok) {
        toasts.error(res.errors[0] || "合同を変更できませんでした");
        return;
      }
      updateTab(
        tabId,
        (t) => {
          const r = changeJoint(t, ops);
          return r.ok ? r.tab : t;
        },
        { atomic: true }
      );
      const parts = res.parts.map((p) =>
        p.toPlain
          ? `「${p.fromLabel}」の ${p.moved} コマを通常コマ「${p.toLabel}」に戻しました`
          : `「${p.fromLabel}」の ${p.moved} コマを合同「${p.toLabel}」に変更しました`
      );
      if (res.created.length > 0)
        parts.push(`合同列「${res.created.join("」「")}」を作成`);
      if (res.removedSources.length > 0)
        parts.push(`空になった合同列「${res.removedSources.join("」「")}」は削除`);
      toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`, {
        duration: 4500,
      });
      const dayRefs = res.moves
        .filter((m) => parseCellKey(m.toKey).day === day)
        .map((m) => makeCellRef(tabId, m.toKey));
      if (dayRefs.length > 0) jumpToCells(dayRefs, day);
      setJointTarget(null);
    },
    [project, updateTab, toasts, jumpToCells]
  );

  // このセルが関わる未承認の重なりをまとめて承認する
  const approveCellConflicts = (ref) => {
    const targets = conflictView.active.filter((c) => c.refs.includes(ref));
    if (targets.length === 0) return;
    saveProject(
      (p) => ({
        ...p,
        approvedConflicts: [
          ...(p.approvedConflicts || []),
          ...targets.map(conflictKey),
        ],
      }),
      { atomic: true }
    );
    toasts.success(`${targets.length} 件の問題を承認しました`);
  };

  // 時限行・クラス列・複数選択の一括クリア (確認あり・Undo 1 回で戻る)。
  // ロック中のセルは対象外。実行したら true (選択解除などの後処理は呼び出し側)
  const clearCellsBulk = async (refs, label) => {
    const withContent = refs.filter((r) => getCellByRef(r));
    const filled = withContent.filter((r) => !getCellByRef(r).locked);
    const lockedCount = withContent.length - filled.length;
    if (filled.length === 0) {
      // silent no-op にしない (講習 H3 と同じ思想)。ヘッダメニュー経由は
      // 項目自体が disabled のため、ここに来るのは選択バー経由のみ
      toasts.info(
        lockedCount > 0
          ? "クリアできるコマがありません（ロック中のセルは対象外です）"
          : "クリアできるコマがありません（選択セルはすべて空です）"
      );
      return false;
    }
    const ok = await confirm({
      title: "一括クリア",
      message:
        `${label} の ${filled.length} コマをクリアしますか？` +
        (lockedCount > 0 ? `\n（ロック中の ${lockedCount} コマは対象外）` : "") +
        `\n（Ctrl+Z で戻せます）`,
      okLabel: "クリアする",
      tone: "danger",
    });
    if (!ok) return false;
    const keysByTab = new Map();
    for (const r of filled) {
      const { tabId, key } = parseCellRef(r);
      if (!keysByTab.has(tabId)) keysByTab.set(tabId, []);
      keysByTab.get(tabId).push(key);
    }
    saveProject(
      (p) => ({
        ...p,
        tabs: p.tabs.map((t) => {
          const keys = keysByTab.get(t.id);
          if (!keys) return t;
          const schedule = { ...t.schedule };
          for (const k of keys) delete schedule[k];
          return { ...t, schedule };
        }),
      }),
      { atomic: true }
    );
    toasts.success(`${filled.length} コマをクリアしました`);
    return true;
  };

  const clearSelectedCells = async () => {
    const ok = await clearCellsBulk([...selectedRefs], "選択中のセル");
    if (ok) clearSelection();
  };

  // ── ✎ 選択セルの一括変更 (講師・教室の差し替えなど) ────────────────
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const applyBulkEdit = useCallback(
    (patch) => {
      const refs = [...selectedRefs];
      const res = bulkEditCells(project.tabs, refs, patch);
      if (res.changed === 0) {
        toasts.info(describeBulkEdit(res, patch));
        return;
      }
      saveProject((p) => ({ ...p, tabs: bulkEditCells(p.tabs, refs, patch).tabs }), {
        atomic: true,
      });
      setShowBulkEdit(false);
      toasts.success(`${describeBulkEdit(res, patch)}（Ctrl+Z で戻せます）`, {
        duration: 5000,
      });
    },
    [selectedRefs, project.tabs, saveProject, toasts]
  );
  // 選択が消えたらダイアログも閉じる (対象ゼロのダイアログを残さない)
  useEffect(() => {
    if (selectedRefs.size === 0) setShowBulkEdit(false);
  }, [selectedRefs.size]);

  // コピーしたコマを選択範囲へ一気に配る (Ctrl+C → 範囲選択 → 貼り付け)。
  // 1 セルずつの Ctrl+V を繰り返さずに同じコマを並べられる
  const pasteIntoSelection = useCallback(() => {
    if (!cellClipboard) return;
    const refs = [...selectedRefs];
    const res = fillCells(project.tabs, refs, cellClipboard);
    if (res.changed === 0) {
      toasts.info(
        res.skippedLocked > 0
          ? "貼り付けできるコマがありません（選択セルはすべてロック中です）"
          : "内容は既に同じです"
      );
      return;
    }
    saveProject((p) => ({ ...p, tabs: fillCells(p.tabs, refs, cellClipboard).tabs }), {
      atomic: true,
    });
    const parts = [
      `${res.changed} コマに「${formatCellShort(cellClipboard)}」を貼り付けました`,
    ];
    if (res.skippedLocked > 0)
      parts.push(`ロック中の ${res.skippedLocked} コマは対象外`);
    toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`);
  }, [cellClipboard, selectedRefs, project.tabs, saveProject, toasts]);

  const onCtxAction = (action) => {
    const m = ctxMenu;
    setCtxMenu(null);
    if (!m) return;
    if (action === "copy") copyCell(m.ref);
    else if (action === "paste") pasteCell(m.ref);
    else if (action === "clear") onClearCell(m.ref);
    else if (action === "approve") approveCellConflicts(m.ref);
    else if (action === "lock") toggleLockRefs([m.ref], true);
    else if (action === "unlock") toggleLockRefs([m.ref], false);
    else if (action === "joint") setJointTarget(m.ref);
    else if (action === "clear-bulk") clearCellsBulk(m.refs, m.label);
    else if (action === "lock-bulk") toggleLockRefs(m.refs, true);
    else if (action === "unlock-bulk") toggleLockRefs(m.refs, false);
  };

  return {
    ctxMenu,
    openCellMenu,
    openHeaderMenu,
    closeCtxMenu,
    onCtxAction,
    cellClipboard,
    copyCell,
    pasteCell,
    onClearCell,
    getCellByRef,
    toggleLockRefs,
    jointItem,
    jointTarget,
    setJointTarget,
    applyJointChange,
    selectedRefs,
    selAnchorRef,
    toggleSelect,
    rectSelect,
    clearSelection,
    clearSelectedCells,
    showBulkEdit,
    setShowBulkEdit,
    applyBulkEdit,
    pasteIntoSelection,
  };
}
