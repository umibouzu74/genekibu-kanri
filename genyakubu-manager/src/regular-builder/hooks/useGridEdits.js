import { useCallback } from "react";
import {
  copyCellAcrossTabs,
  parseCellRef,
  setClassRoom,
  setClassRoomForDay,
  swapCellsAcrossTabs,
} from "../model";
import { copyDay, describeDayCopy } from "../dayCopy";

// ─── グリッドの編集ハンドラ (RegularBuilderApp から 2026-09-05 に切り出し) ──
// セルの直接編集・D&D 入替 / コピー配置・列の既定教室 (全曜日 / 曜日別)・
// ⧉ 曜日まるごとコピー。どれも「件数は表示用に現時点の project で数え、
// 保存は saveProject の最新値で再計算する」パターン。返す名前は切り出し前の
// App 内のものと同じ (JSX 側を変えないため)。
export function useGridEdits({ project, saveProject, updateTab, toasts, onDayCopied }) {
  // セル編集は ref (`tabId:cellKey`) で対象タブを指す — 曜日ビューは
  // 全学年のセルを同じ表に並べるため。updateTab のみ依存なので、編集の
  // たびにハンドラが再生成されず RegularCell の memo が効く
  const onCellChange = useCallback(
    (ref, field, value) => {
      const { tabId, key } = parseCellRef(ref);
      updateTab(tabId, (t) => {
        const prev = t.schedule[key] || {};
        const next = { ...prev, [field]: value };
        // 全フィールド空になったらセルごと削除して下書きを軽く保つ
        const empty = !["subj", "teacher", "room", "note"].some((f) =>
          (next[f] || "").trim()
        );
        const schedule = { ...t.schedule };
        if (empty) delete schedule[key];
        else schedule[key] = next;
        return { ...t, schedule };
      });
    },
    [updateTab]
  );

  // D&D でのセル入替 (学年をまたぐ入替も可)。
  // 単発操作なので直前のタイピングと束ねず独立した Undo 単位にする
  const onSwapCells = useCallback(
    (refA, refB) =>
      saveProject(
        (p) => ({ ...p, tabs: swapCellsAcrossTabs(p.tabs, refA, refB) }),
        { atomic: true }
      ),
    [saveProject]
  );

  // Ctrl+ドラッグでのコピー配置 (入替でなく複製)
  const onCopyCellTo = useCallback(
    (refA, refB) =>
      saveProject(
        (p) => ({ ...p, tabs: copyCellAcrossTabs(p.tabs, refA, refB) }),
        { atomic: true }
      ),
    [saveProject]
  );

  // 列の既定教室を全曜日 (基本) として変更。上書きの無いセルは実効教室が
  // 自動で追従し、新既定と同じ上書き・曜日別既定は既定追従へ正規化される
  // (連動の詳細は model.setClassRoom)。件数は表示用に現時点の project で
  // 数え、保存は saveProject の最新値で行う (toggleLockRefs と同じパターン)
  const applyClassRoomAllDays = useCallback(
    (tabId, classId, room) => {
      const res = setClassRoom(project.tabs, tabId, classId, room);
      if (!res.changed) return;
      saveProject(
        (p) => ({ ...p, tabs: setClassRoom(p.tabs, tabId, classId, room).tabs }),
        { atomic: true }
      );
      const parts = [
        `列の既定教室 (全曜日) を「${res.oldRoom || "未設定"}」→「${res.newRoom || "未設定"}」に変更しました`,
      ];
      if (res.normalized > 0)
        parts.push(`同じ教室を指定していた ${res.normalized} コマは既定追従に統合`);
      if (res.kept > 0)
        parts.push(`別教室の個別指定 ${res.kept} コマはそのまま`);
      toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`, {
        duration: 4500,
      });
    },
    [project, saveProject, toasts]
  );

  // 列見出しの教室クリック → 表示中の曜日だけの教室変更 (曜日別既定
  // roomByDay。model.setClassRoomForDay)。他の曜日の教室は変わらない —
  // 「木曜の教室を直したら火曜まで変わった」を防ぐ。全曜日に広げたい
  // ときは toast の「全曜日に適用」から基本の既定へ昇格できる。基本の
  // 既定教室が未設定の列は従来どおり全曜日の既定として設定する
  const onSetClassRoom = useCallback(
    (tabId, classId, room, day) => {
      const cls = project.tabs
        .find((t) => t.id === tabId)
        ?.classes?.find((c) => c.id === classId);
      if (!cls) return;
      if (!day || !(cls.room || "").trim()) {
        applyClassRoomAllDays(tabId, classId, room);
        return;
      }
      const res = setClassRoomForDay(project.tabs, tabId, classId, day, room);
      if (!res.changed) return;
      saveProject(
        (p) => ({
          ...p,
          tabs: setClassRoomForDay(p.tabs, tabId, classId, day, room).tabs,
        }),
        { atomic: true }
      );
      const parts = [
        res.oldRoom === res.newRoom
          ? `${day}曜の教室の個別指定を解除しました（基本 ${res.newRoom || "未設定"} のまま）`
          : `${day}曜の教室を「${res.oldRoom || "未設定"}」→「${res.newRoom || "未設定"}」に変更しました（他の曜日はそのまま）`,
      ];
      if (res.normalized > 0)
        parts.push(`同じ教室を指定していた ${res.normalized} コマは既定追従に統合`);
      if (res.kept > 0)
        parts.push(`別教室の個別指定 ${res.kept} コマはそのまま`);
      toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`, {
        duration: 6000,
        action: {
          label: "全曜日に適用",
          onClick: () => applyClassRoomAllDays(tabId, classId, room),
        },
      });
    },
    [project, saveProject, toasts, applyClassRoomAllDays]
  );

  // ── ⧉ 曜日まるごとコピー (火 → 木 のような曜日の組を作る) ────────
  // 件数は表示用に現時点の project で数え、保存は saveProject の最新値で
  // 再計算する (setClassRoom 等と同じパターン)
  const applyDayCopy = useCallback(
    ({ from, to, mode, addDay }) => {
      const res = copyDay(project.tabs, from, to, { mode, addDay });
      if (res.copied === 0) {
        toasts.info(describeDayCopy(res, from, to));
        return;
      }
      saveProject(
        (p) => ({ ...p, tabs: copyDay(p.tabs, from, to, { mode, addDay }).tabs }),
        { atomic: true }
      );
      onDayCopied?.(to); // ダイアログを閉じてコピー先の曜日へ移る (App 側)
      toasts.success(`${describeDayCopy(res, from, to)}（Ctrl+Z で戻せます）`, {
        duration: 6000,
      });
    },
    [project.tabs, saveProject, toasts, onDayCopied]
  );

  return {
    onCellChange,
    onSwapCells,
    onCopyCellTo,
    applyClassRoomAllDays,
    onSetClassRoom,
    applyDayCopy,
  };
}
