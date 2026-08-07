import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// 講習ビルダーと同じ Tailwind エントリ (builder-* トークン / focus ring /
// タッチ CSS)。tailwind.config.js の content に regular-builder も含まれる。
import "../timetable-builder/tailwind.css";
import { LS, SS } from "../constants/storageKeys";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { usePersistedToggle } from "../timetable-builder/hooks/usePersistedToggle";
import { formatPrintDateJa } from "../timetable-builder/utils/printHeader";
import { nextNumericId } from "../utils/schema";
import {
  copyCellAcrossTabs,
  createDefaultProject,
  createDefaultWorkspace,
  makeCellRef,
  parseCellKey,
  parseCellRef,
  sanitizeWorkspace,
  setCellsLocked,
  setClassRoom,
  swapCellsAcrossTabs,
  REGULAR_DAYS,
} from "./model";
import { computeMergeLayout } from "./mergedColumns";
import { changeJoint } from "./jointEdit";
import { biweeklyPartner, splitTeacherField } from "../utils/biweekly";
import { DAY_BG, DAY_COLOR, gradeColor } from "../constants/colors";
import { buildConflictView, computeConflicts, conflictKey } from "./conflicts";
import {
  describeHistoryChange,
  diffWorkspaces,
  formatCellShort,
} from "./historyFeedback";
import { applyChu3SecondTermShift, buildProjectFromSlots } from "./importTimetable";
import { parseProjectJson, projectFileName, serializeProject } from "./projectJson";
import { ProjectConfigModal } from "./ProjectConfigModal";
import { RegularOnboarding } from "./RegularOnboarding";
import { TabConfigPanel } from "./TabConfigPanel";
import { RegularGrid } from "./RegularGrid";
import { RegularContextMenu } from "./RegularContextMenu";
import { RegularSummaryPanel } from "./RegularSummaryPanel";
import { RegularSnapshotPanel } from "./RegularSnapshotPanel";
import {
  RegularTeacherWeek,
  RegularTeacherWeekPrintSheet,
} from "./RegularTeacherWeek";
import { ReflectDialog } from "./ReflectDialog";
import { ImportDialog } from "./ImportDialog";
import { JointDialog } from "./JointDialog";
import { REGULAR_PRINT_STYLE } from "./printStyle";
import { UI } from "./ui";

// ─── 通常時間割作成 ─────────────────────────────────────────────────
// 講習時間割作成の操作感で通常時間割 (曜日ベース) を設計する専用ビュー。
// 「2026 1学期」「2026 2学期」のような複数プロジェクトを切り替えて編集
// できる。下書きは LS.regularBuilderProject に保存され、Firebase 設定済み
// 環境では他の appData と同様にクラウド同期される (書込には管理者ログイン
// が必要)。完成したら「⤴ 本体へ反映」で Timetable + Slot に書き出す。
// UI は講習ビルダーと同じ builder-* デザイントークン (Tailwind)。

const migrate = (raw) => sanitizeWorkspace(raw) || createDefaultWorkspace();

export default function RegularBuilderApp({
  slots,
  saveSlots,
  timetables,
  saveTimetables,
  isAdmin,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const onStorageError = useCallback(
    (err, kind) => {
      if (kind === "quota") toasts.error("保存容量が不足しています (下書きが保存できません)");
      else if (kind === "sync-auth") toasts.error("クラウド同期には管理者ログインが必要です (ローカルには保存済み)");
    },
    [toasts]
  );
  const [workspace, saveWorkspace] = useSyncedStorage(
    LS.regularBuilderProject,
    createDefaultWorkspace(),
    { migrate, onError: onStorageError }
  );

  const [activeTabId, setActiveTabId] = useState(null);
  const [showProjectConfig, setShowProjectConfig] = useState(false);
  // モーダルの onClose は恒久的に同一参照にする — useFocusTrap が onClose を
  // 依存に持つため、inline 関数だと設定編集 (saveProject) のたびにトラップが
  // 再初期化されてフォーカスが先頭 (✕ ボタン) へ飛んでしまう
  const closeProjectConfig = useCallback(() => setShowProjectConfig(false), []);
  // オンボーディングから「時限」「講師」タブを直接開けるように、開くとき
  // の初期タブを指定できるようにする
  const [configInitialTab, setConfigInitialTab] = useState("periods");
  const openProjectConfig = useCallback((tab = "periods") => {
    setConfigInitialTab(tab);
    setShowProjectConfig(true);
  }, []);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showTabConfig, setShowTabConfig] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  // 表示トグルはリロード後も保持 (講習の 📏 と同じ。明示トグルの保存であり
  // 自動学習系ではない)
  const [hideEmpty, setHideEmpty] = usePersistedToggle(
    LS.regularBuilderHideEmpty,
    false
  );
  const [isCompact, setIsCompact] = usePersistedToggle(LS.regularBuilderCompact, false);
  // 📊 集計パネル (講師×曜日のコマ数)。開閉はリロード後も保持
  const [showSummary, setShowSummary] = usePersistedToggle(
    LS.regularBuilderSummary,
    false
  );
  // 本校 / 亀井町 (教室「亀◯◯」) を別セクションに分けて表示する。
  // 時刻体系が建物で違うため既定 ON (混在すると空きマスが乱立する)
  const [splitCampus, setSplitCampus] = usePersistedToggle(
    LS.regularBuilderSplitCampus,
    true
  );
  // 強調表示: "" | `t:講師名` | `r:教室名` (講師と教室で 1 つのセレクトを共用)
  const [highlightKey, setHighlightKey] = useState("");
  const highlightTeacher = highlightKey.startsWith("t:")
    ? highlightKey.slice(2)
    : "";
  const highlightRoom = highlightKey.startsWith("r:") ? highlightKey.slice(2) : "";
  // 📅 週表示 (全曜日を縦に並べて俯瞰)。リロード後も保持
  const [weekView, setWeekView] = usePersistedToggle(
    LS.regularBuilderWeekView,
    false
  );
  // 選択曜日はリロード後も維持する (App のビュー復元と同じ sessionStorage
  // ベース。使わない曜日を復元した場合は下の usedDays 効果が先頭に倒す)
  const [selectedDay, setSelectedDay] = useState(() => {
    try {
      const d = sessionStorage.getItem(SS.regularBuilderDay);
      return REGULAR_DAYS.includes(d) ? d : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!selectedDay) return;
    try {
      sessionStorage.setItem(SS.regularBuilderDay, selectedDay);
    } catch {
      /* quota / private mode — 表示は妨げない */
    }
  }, [selectedDay]);

  // ── セルへのジャンプ (重複一覧の「表示」・Undo toast の「表示」) ──
  // 曜日を切り替えてから RegularGrid 側でスクロール + 一時ハイライト。
  // nonce で同じセルへの連続ジャンプも発火させる
  const jumpSeqRef = useRef(0);
  const [jumpTarget, setJumpTarget] = useState(null); // {day, refs, nonce}
  const jumpToCells = useCallback((refs, day) => {
    setSelectedDay(day);
    setJumpTarget({ day, refs, nonce: ++jumpSeqRef.current });
  }, []);

  const project =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ||
    workspace.projects[0];

  // いずれかの学年が使っている曜日 (曜日チップの活性判定)
  const usedDays = useMemo(
    () =>
      REGULAR_DAYS.filter((d) =>
        (project.tabs || []).some((t) => (t.days || []).includes(d))
      ),
    [project.tabs]
  );
  useEffect(() => {
    if (selectedDay && usedDays.includes(selectedDay)) return;
    setSelectedDay(usedDays[0] ?? null);
  }, [usedDays, selectedDay]);

  // 曜日ごとの入力済みコマ数 (曜日チップの小バッジ)。設定変更で無効に
  // なった残骸セルは数えない (resolveTabEntries と同じ判定)
  const dayCellCounts = useMemo(() => {
    const counts = {};
    for (const t of project.tabs || []) {
      const dset = new Set(t.days || []);
      const pset = new Set(t.periodIds || []);
      const cset = new Set((t.classes || []).map((c) => c.id));
      for (const k of Object.keys(t.schedule || {})) {
        const pos = parseCellKey(k);
        if (dset.has(pos.day) && pset.has(pos.periodId) && cset.has(pos.classId)) {
          counts[pos.day] = (counts[pos.day] || 0) + 1;
        }
      }
    }
    return counts;
  }, [project.tabs]);

  // 全曜日まとめて印刷: true の間だけ print 専用の全曜日 DOM を描画して
  // window.print() し、ダイアログが閉じたら (afterprint) 元に戻す
  const [printAllDays, setPrintAllDays] = useState(false);
  useEffect(() => {
    if (!printAllDays) return;
    const done = () => setPrintAllDays(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50); // 描画が反映されてから
    return () => {
      window.removeEventListener("afterprint", done);
      clearTimeout(t);
    };
  }, [printAllDays]);

  // 講師の週間時間割の印刷 (週間ミニビューの 🖨)。仕組みは全曜日印刷と同じ
  const [printTeacherWeek, setPrintTeacherWeek] = useState(false);
  useEffect(() => {
    if (!printTeacherWeek) return;
    const done = () => setPrintTeacherWeek(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener("afterprint", done);
      clearTimeout(t);
    };
  }, [printTeacherWeek]);

  // ── Undo/Redo ───────────────────────────────────────────────────
  // 自分の編集 (commitWorkspace 経由) だけを履歴に積む軽量スタック。
  // 直近 800ms 以内の連続編集 (セルへのタイピング等) は 1 つの取り消し
  // 単位に束ねる。リモート同期で入った変更は履歴に乗らない (単独編集
  // 前提の割り切り — undo するとその間の同期変更ごと戻る)。
  const wsRef = useRef(workspace);
  useEffect(() => {
    wsRef.current = workspace;
  }, [workspace]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastCommitAtRef = useRef(0);
  const [histVersion, setHistVersion] = useState(0);

  // atomic: true の編集 (D&D 入替・セルクリア等の単発操作) は、直前の
  // タイピングと束ねず必ず独立した取り消し単位にする (直後の編集も別単位)
  const commitWorkspace = useCallback(
    (next, { atomic = false } = {}) => {
      const now = Date.now();
      if (atomic || now - lastCommitAtRef.current > 800) {
        undoStackRef.current = [...undoStackRef.current.slice(-99), wsRef.current];
      }
      redoStackRef.current = [];
      lastCommitAtRef.current = atomic ? 0 : now;
      saveWorkspace(next);
      setHistVersion((v) => v + 1);
    },
    [saveWorkspace]
  );

  // undo/redo は「何が戻ったか」を toast で知らせる (講習 N2f と同趣旨)。
  // 表示していない曜日のセルが戻っても気付けるよう、セル変更ならその場所
  // (と before → after) を要約し、「表示」ボタンで該当セルへ飛べるようにする
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

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    const cur = wsRef.current;
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, cur];
    lastCommitAtRef.current = 0; // 次の編集は新しい取り消し単位
    saveWorkspace(prev);
    setHistVersion((v) => v + 1);
    notifyHistory("undo", cur, prev);
  }, [saveWorkspace, notifyHistory]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    const cur = wsRef.current;
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, cur];
    lastCommitAtRef.current = 0;
    saveWorkspace(next);
    setHistVersion((v) => v + 1);
    notifyHistory("redo", cur, next);
  }, [saveWorkspace, notifyHistory]);

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

  // アクティブなプロジェクトだけを更新する (既存の下位コンポーネントは
  // 単一プロジェクトの世界のまま — saveProject(fn) の形を維持)
  const saveProject = useCallback(
    (next, opts) =>
      commitWorkspace(
        (w) => {
          const activeId =
            w.projects.some((p) => p.id === w.activeProjectId)
              ? w.activeProjectId
              : w.projects[0]?.id;
          return {
            ...w,
            projects: w.projects.map((p) =>
              p.id === activeId
                ? { ...p, ...(typeof next === "function" ? next(p) : next) }
                : p
            ),
          };
        },
        opts
      ),
    [commitWorkspace]
  );

  const switchProject = useCallback(
    (id) => {
      saveWorkspace((w) => ({ ...w, activeProjectId: id }));
      setActiveTabId(null);
    },
    [saveWorkspace]
  );

  const addProject = useCallback(
    (projectFields, { successMsg } = {}) => {
      commitWorkspace((w) => {
        const id = nextNumericId(w.projects);
        return {
          ...w,
          activeProjectId: id,
          projects: [...w.projects, { id, ...projectFields }],
        };
      });
      setActiveTabId(null);
      if (successMsg) toasts.success(successMsg);
    },
    [commitWorkspace, toasts]
  );

  const removeProject = useCallback(async () => {
    const cellCount = project.tabs.reduce(
      (n, t) => n + Object.keys(t.schedule).length,
      0
    );
    // プロジェクト削除は中身 (タブ・セル) を巻き込むため確認ダイアログ
    // (CLAUDE.md 削除 UX ルールの cascade あり相当)
    const ok = await confirm({
      title: "プロジェクトの削除",
      message: `プロジェクト「${project.name}」を削除しますか？\nタブ ${project.tabs.length} 件・入力済みセル ${cellCount} 件も削除されます。`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    commitWorkspace((w) => {
      const rest = w.projects.filter((p) => p.id !== project.id);
      if (rest.length === 0) return createDefaultWorkspace();
      return { ...w, activeProjectId: rest[0].id, projects: rest };
    });
    setActiveTabId(null);
  }, [project, confirm, commitWorkspace]);

  const duplicateProject = useCallback(() => {
    const copy = JSON.parse(JSON.stringify(project));
    delete copy.id;
    addProject(
      { ...copy, name: `${project.name}（コピー）` },
      { successMsg: `「${project.name}」を複製しました` }
    );
  }, [project, addProject]);

  const importProject = useCallback(
    ({ sourceId, name, applyShift, splitWeekend, splitBuilding }) => {
      const { project: imported, stats } = buildProjectFromSlots(
        name,
        slots,
        sourceId,
        { splitWeekend, splitBuilding }
      );
      let final = imported;
      let shiftMsg = "";
      if (applyShift) {
        const { project: shifted, moved } = applyChu3SecondTermShift(imported);
        final = shifted;
        shiftMsg = `、中3 2学期変更を適用（${moved} コマ移動）`;
      }
      addProject(final, {
        successMsg: `「${name}」を取り込みました（${stats.slotCount} コマ・タブ ${stats.tabCount} 件${shiftMsg}）`,
      });
      setShowImport(false);
    },
    [slots, addProject]
  );

  // ── JSON 書き出し / 読み込み (RB20: バックアップ・別環境への移行) ──
  // 書き出しはアクティブなプロジェクト単位 (スナップショット込み)、
  // 読み込みは新しいプロジェクトとして追加する (既存を上書きしない)
  const exportProjectJson = useCallback(() => {
    const text = serializeProject(project, new Date().toISOString());
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = projectFileName(project.name, new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toasts.success(`「${project.name || "無題"}」を JSON に書き出しました`);
  }, [project, toasts]);

  const importFileRef = useRef(null);
  const importProjectJson = useCallback(
    async (file) => {
      if (!file) return;
      const result = parseProjectJson(await file.text());
      if (result.error) {
        toasts.error(result.error);
        return;
      }
      addProject(result.project, {
        successMsg: `「${result.project.name}」を JSON から読み込みました`,
      });
    },
    [toasts, addProject]
  );

  // ── Excel 出力 (RB22)。exceljs をメインバンドルから外すため、
  // モジュールごとボタン押下時に dynamic import する (講習・調査票と同じ)
  const exportExcel = useCallback(async () => {
    try {
      const { downloadRegularExcel } = await import("./excelExport");
      await downloadRegularExcel({ project, days: usedDays, splitCampus });
      toasts.success("Excel を書き出しました（曜日ごとにシート・A4 横）");
    } catch (e) {
      toasts.error(`Excel を書き出せませんでした: ${e?.message || e}`);
    }
  }, [project, usedDays, splitCampus, toasts]);

  const activeTab =
    project.tabs.find((t) => t.id === activeTabId) || project.tabs[0] || null;

  const conflictList = useMemo(() => computeConflicts(project).list, [project]);
  const conflictView = useMemo(
    () => buildConflictView(conflictList, project.approvedConflicts),
    [conflictList, project.approvedConflicts]
  );

  // タブ別の未承認衝突件数 (タブバーの ⚠ バッジ用)。1 つの衝突が同一タブ
  // 内の 2 セルの場合も 1 件と数える。
  const tabConflictCounts = useMemo(() => {
    const counts = {};
    for (const c of conflictView.active) {
      for (const tabId of new Set(c.refs.map((r) => Number(r.split(":")[0])))) {
        counts[tabId] = (counts[tabId] || 0) + 1;
      }
    }
    return counts;
  }, [conflictView]);

  const approveConflict = useCallback(
    (c) =>
      saveProject((p) => ({
        ...p,
        approvedConflicts: [...(p.approvedConflicts || []), conflictKey(c)],
      })),
    [saveProject]
  );
  const unapproveConflict = useCallback(
    (c) =>
      saveProject((p) => ({
        ...p,
        approvedConflicts: (p.approvedConflicts || []).filter(
          (k) => k !== conflictKey(c)
        ),
      })),
    [saveProject]
  );

  // ── 更新ヘルパ ──────────────────────────────────────────────────
  const updateTab = useCallback(
    (tabId, fn, opts) =>
      saveProject(
        (p) => ({
          ...p,
          tabs: p.tabs.map((t) => (t.id === tabId ? fn(t) : t)),
        }),
        opts
      ),
    [saveProject]
  );

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

  // 列見出しの教室クリック → 列の既定教室を変更。上書きの無いセルは実効
  // 教室が自動で追従し、新既定と同じ上書きは既定追従へ正規化される
  // (連動の詳細は model.setClassRoom)。件数は表示用に現時点の project で
  // 数え、保存は saveProject の最新値で行う (toggleLockRefs と同じパターン)
  const onSetClassRoom = useCallback(
    (tabId, classId, room) => {
      const res = setClassRoom(project.tabs, tabId, classId, room);
      if (!res.changed) return;
      saveProject(
        (p) => ({ ...p, tabs: setClassRoom(p.tabs, tabId, classId, room).tabs }),
        { atomic: true }
      );
      const parts = [
        `列の既定教室を「${res.oldRoom || "未設定"}」→「${res.newRoom || "未設定"}」に変更しました`,
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

  // ── 複数選択 (Ctrl+クリックでトグル / Shift+クリックで矩形) ──────
  // 講習 N2a と同じ操作感。選択はセル ref の集合で持ち、矩形の計算は
  // セクション構造を知る RegularGrid 側が行う (onRectSelect に結果が届く)
  const [selectedRefs, setSelectedRefs] = useState(() => new Set());
  const selAnchorRef = useRef(null);
  const toggleSelect = useCallback((ref) => {
    selAnchorRef.current = ref;
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }, []);
  const rectSelect = useCallback((refs) => {
    if (refs.length) setSelectedRefs(new Set(refs));
  }, []);
  const clearSelection = useCallback(() => {
    selAnchorRef.current = null;
    setSelectedRefs((prev) => (prev.size ? new Set() : prev));
  }, []);
  // 曜日・プロジェクト・表示モードが変わったら選択は持ち越さない
  // (見えないセルへの一括操作を防ぐ)
  useEffect(() => {
    clearSelection();
  }, [selectedDay, project.id, weekView, clearSelection]);
  // Escape で選択解除 (編集中・メニュー内の Escape は stopPropagation 済み)
  useEffect(() => {
    if (selectedRefs.size === 0) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !e.isComposing) clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedRefs.size, clearSelection]);

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

  // ── コンテキストメニュー (セル右クリック / 長押し・ヘッダの一括操作) ──
  const [ctxMenu, setCtxMenu] = useState(null);
  const [cellClipboard, setCellClipboard] = useState(null);
  // ⊞ 合同ダイアログの対象セル ref (null = 非表示)
  const [jointTarget, setJointTarget] = useState(null);

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

  const addTab = useCallback(() => {
    // id は現在の描画時点で確定させ、追加後にその学年の設定を開く
    // (単独編集前提 — 同時編集での id 衝突は考慮しない)
    const id = nextNumericId(project.tabs);
    saveProject((p) => {
      // 直前の学年から曜日・時限の選択を引き継ぐ (講習版の「他へコピー」相当)
      const last = p.tabs[p.tabs.length - 1];
      return {
        ...p,
        tabs: [
          ...p.tabs,
          {
            id,
            name: `学年${id}`,
            grade: "",
            classes: [],
            days: last ? [...last.days] : ["月", "火", "水", "木", "金"],
            periodIds: last ? [...last.periodIds] : p.periods.map((x) => x.id),
            schedule: {},
          },
        ],
      };
    });
    setActiveTabId(id);
    setShowTabConfig(true);
  }, [project.tabs, saveProject]);

  // 学年チップの並べ替え (セクションの並びはタブ定義順に追従する)
  const reorderTabs = useCallback(
    (fromIdx, toIdx) =>
      saveProject(
        (p) => {
          if (
            fromIdx === toIdx ||
            fromIdx < 0 ||
            toIdx < 0 ||
            fromIdx >= p.tabs.length ||
            toIdx >= p.tabs.length
          )
            return p;
          const tabs = [...p.tabs];
          const [moved] = tabs.splice(fromIdx, 1);
          tabs.splice(toIdx, 0, moved);
          return { ...p, tabs };
        },
        { atomic: true }
      ),
    [saveProject]
  );

  const removeTab = useCallback(async () => {
    if (!activeTab) return;
    const cellCount = Object.keys(activeTab.schedule).length;
    const ok = await confirm({
      title: "学年の削除",
      message: `学年「${activeTab.name}」を削除しますか？\n入力済みのセル ${cellCount} 件も削除されます。`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    saveProject((p) => ({ ...p, tabs: p.tabs.filter((t) => t.id !== activeTab.id) }));
    setActiveTabId(null);
  }, [activeTab, confirm, saveProject]);

  // 講師フィルタ候補 (マスタ + セルに現れる講師名 + 隔週パートナー)。
  // マスタ未整備の取込直後や、note にしか現れないパートナー講師も
  // 👁 強調表示・週間ミニビューの対象にできるようにする
  const teacherOptions = useMemo(() => {
    const names = new Set(project.teachers.map((t) => t.name));
    for (const t of project.tabs || []) {
      for (const cell of Object.values(t.schedule || {})) {
        for (const n of splitTeacherField(cell.teacher)) names.add(n);
        const partner = biweeklyPartner(cell.note);
        if (partner) names.add(partner);
      }
    }
    return [...names].sort();
  }, [project.teachers, project.tabs]);

  // 教室フィルタ候補 (クラス既定教室 + セル上書き教室)
  const roomOptions = useMemo(() => {
    const rooms = new Set();
    for (const t of project.tabs || []) {
      for (const c of t.classes || []) {
        if ((c.room || "").trim()) rooms.add(c.room.trim());
      }
      for (const cell of Object.values(t.schedule || {})) {
        if ((cell.room || "").trim()) rooms.add(cell.room.trim());
      }
    }
    return [...rooms].sort();
  }, [project.tabs]);

  // 選択中の講師・教室がリネーム / 削除で消えたらハイライトを自動解除する
  // (講習 L2a と同じ。残すと「何も光らないフィルタ」が掛かり続ける)
  useEffect(() => {
    if (
      (highlightTeacher && !teacherOptions.includes(highlightTeacher)) ||
      (highlightRoom && !roomOptions.includes(highlightRoom))
    ) {
      setHighlightKey("");
    }
  }, [teacherOptions, roomOptions, highlightTeacher, highlightRoom]);

  // ブラウザタブのタイトルにプロジェクト名を出す (講習ビルダーと同じ。
  // アンマウント時は親アプリのタイトルへ戻す)
  useEffect(() => {
    const base = "通常時間割作成";
    const previousTitle = document.title;
    document.title = project.name ? `${project.name} - ${base}` : base;
    return () => {
      document.title = previousTitle;
    };
  }, [project.name]);

  return (
    <div className="builder-root font-sans flex flex-col gap-3">
      <style>{REGULAR_PRINT_STYLE}</style>
      {/* 入力候補 (セルの「✎ 直接入力」から参照するグローバル datalist) */}
      <datalist id="regb-teachers">
        {project.teachers.map((t) => (
          <option key={t.name} value={t.name} />
        ))}
      </datalist>
      <datalist id="regb-subjects">
        {project.subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {/* 教室はセルの教室入力から参照。教室重複チェックと亀井町判定は
          文字列一致なので、候補補完で表記ゆれ (全角/半角など) を防ぐ */}
      <datalist id="regb-rooms">
        {roomOptions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* ツールバー (講習ビルダーの Toolbar と同じ質感) */}
      <div className="no-print flex flex-wrap items-center gap-2 bg-builder-surface-alt border border-builder-border rounded-lg p-2">
        <span className="font-extrabold text-sm text-builder-ink px-1">🏗 通常時間割作成</span>
        {workspace.projects.length > 1 && (
          <select
            value={project.id}
            onChange={(e) => switchProject(Number(e.target.value))}
            className={`${UI.input} font-bold min-w-[150px]`}
            title="編集するプロジェクトを切替"
          >
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={project.name}
          onChange={(e) => saveProject((p) => ({ ...p, name: e.target.value }))}
          placeholder="プロジェクト名 (例: 2026 2学期)"
          className={`${UI.input} w-44`}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() =>
              addProject(createDefaultProject(), { successMsg: "プロジェクトを作成しました" })
            }
            title="空のプロジェクトを新規作成"
            className={UI.btn}
          >
            ＋新規
          </button>
          <button
            type="button"
            onClick={duplicateProject}
            title="このプロジェクトを複製"
            className={UI.btn}
          >
            ⧉複製
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            title="本体の時間割をプロジェクトとして取り込む"
            className={UI.btnBlue}
          >
            ⬇ 本体から取込
          </button>
          <button
            type="button"
            onClick={exportProjectJson}
            title="このプロジェクトを JSON ファイルに書き出す（バックアップ・別環境への移行用。スナップショット込み）"
            className={UI.btn}
          >
            💾
          </button>
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            title="JSON ファイルを新しいプロジェクトとして読み込む（既存のプロジェクトは変更しません）"
            className={UI.btn}
          >
            📂
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="プロジェクト JSON ファイルを選択"
            onChange={(e) => {
              importProjectJson(e.target.files?.[0]);
              e.target.value = ""; // 同じファイルの再選択でも change を発火させる
            }}
          />
          <button
            type="button"
            onClick={removeProject}
            title="このプロジェクトを削除"
            className={UI.btnDanger}
          >
            🗑
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
            className={UI.btn}
          >
            ↩
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="やり直す (Ctrl+Y / Ctrl+Shift+Z)"
            className={UI.btn}
          >
            ↪
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowConflicts((v) => !v)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer border transition-colors ${
            conflictView.active.length
              ? "bg-builder-danger-soft text-builder-red border-builder-danger-border hover:bg-builder-danger-border"
              : "bg-builder-success-soft text-builder-green border-builder-success-border hover:bg-builder-success-border"
          }`}
          title={
            (conflictView.active.map((c) => c.label).join("\n") ||
              "クリックで問題 (重複・NG) の一覧・承認を開閉") +
            (conflictView.approved.length
              ? `\n(承認済み ${conflictView.approved.length} 件)`
              : "")
          }
        >
          {conflictView.active.length
            ? `⚠ 問題 ${conflictView.active.length} 件`
            : "✓ 問題なし"}
        </button>
        <button
          type="button"
          onClick={() => setShowSummary((v) => !v)}
          title="講師×曜日のコマ数と週計を一覧 (上限超過は赤字)"
          className={UI.btnToggle(showSummary)}
        >
          📊 集計
        </button>
        <button
          type="button"
          onClick={() => setShowSnapshots((v) => !v)}
          title="現在の状態を名前付きで保存し、差分を見ながら復元できる"
          className={UI.btnToggle(showSnapshots)}
        >
          📌 {(project.snapshots || []).length > 0 ? `案 (${project.snapshots.length})` : "案"}
        </button>
        <select
          value={highlightKey}
          onChange={(e) => setHighlightKey(e.target.value)}
          className={`${UI.input} min-w-[130px]`}
          title="選んだ講師・教室のセルを強調表示 (講師は週間ミニビューも開く)"
        >
          <option value="">👁 強調表示</option>
          <optgroup label="講師">
            {teacherOptions.map((n) => (
              <option key={n} value={`t:${n}`}>
                {n}
              </option>
            ))}
          </optgroup>
          <optgroup label="教室">
            {roomOptions.map((r) => (
              <option key={r} value={`r:${r}`}>
                {r}
              </option>
            ))}
          </optgroup>
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => openProjectConfig()}
          title="時限・科目・講師・NG・上限の設定 (モーダル)"
          className={UI.btn}
        >
          ⚙ 全体設定
        </button>
        <button
          type="button"
          onClick={() => setShowReflect(true)}
          disabled={!isAdmin}
          title={isAdmin ? "下書きを本体の時間割 + コマに書き出す" : "反映には管理者ログインが必要です"}
          className={UI.btnPrimary}
        >
          ⤴ 本体へ反映
        </button>
      </div>

      {/* 問題 (重複・NG) の一覧・承認パネル */}
      {showConflicts && (
        <div className={`no-print ${UI.panel} text-xs`}>
          <div className={UI.panelHead}>講師・教室・クラスの重複と講師NG</div>
          {conflictView.active.length === 0 && conflictView.approved.length === 0 && (
            <div className="text-builder-ink-subtle">問題はありません。</div>
          )}
          {conflictView.active.map((c) => (
            <div key={conflictKey(c)} className="flex items-center gap-2">
              <span className="flex-1 text-builder-red">⚠ {c.label}</span>
              <button
                type="button"
                onClick={() => jumpToCells(c.refs, c.day)}
                title="該当セルへジャンプ (曜日を切り替えて両セルを点滅表示)"
                className={UI.btn}
              >
                → 表示
              </button>
              <button
                type="button"
                onClick={() => approveConflict(c)}
                title="意図した重なりとして承認し、件数と赤枠から除外する"
                className={UI.btn}
              >
                承認
              </button>
            </div>
          ))}
          {conflictView.approved.length > 0 && (
            <div className="font-bold text-[11px] text-builder-ink-subtle mt-1">
              承認済み（意図した重なり・NG 割当）
            </div>
          )}
          {conflictView.approved.map((c) => (
            <div key={conflictKey(c)} className="flex items-center gap-2">
              <span className="flex-1 text-builder-ink-subtle">{c.label}</span>
              <button
                type="button"
                onClick={() => jumpToCells(c.refs, c.day)}
                title="該当セルへジャンプ (曜日を切り替えて両セルを点滅表示)"
                className={UI.btn}
              >
                → 表示
              </button>
              <button
                type="button"
                onClick={() => unapproveConflict(c)}
                className={UI.btn}
              >
                解除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 👁 講師を選んでいる間はその講師の週間ミニビューを出す */}
      {highlightTeacher && (
        <RegularTeacherWeek
          project={project}
          teacher={highlightTeacher}
          onJump={jumpToCells}
          onPrint={() => setPrintTeacherWeek(true)}
        />
      )}
      {/* 講師週間の印刷中だけ描画される print 専用シート */}
      {printTeacherWeek && highlightTeacher && (
        <RegularTeacherWeekPrintSheet project={project} teacher={highlightTeacher} />
      )}

      {showSnapshots && (
        <RegularSnapshotPanel
          project={project}
          saveProject={saveProject}
          onJump={jumpToCells}
        />
      )}

      {showSummary && <RegularSummaryPanel project={project} />}

      {/* 曜日切替 + 表示トグル (ダッシュボードの時間割ビューと同じ曜日基準) */}
      <div className="no-print flex flex-wrap items-center gap-2 px-1">
        <div className="flex items-center gap-1" role="tablist" aria-label="曜日">
          {REGULAR_DAYS.map((d) => {
            const used = usedDays.includes(d);
            const selected = selectedDay === d;
            const fg = DAY_COLOR[d] || "#555555";
            const bg = DAY_BG[d] || "#ececec";
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={!used}
                onClick={() => {
                  setSelectedDay(d);
                  // 週表示中は該当曜日のブロックへスクロール (アンカー動作)
                  if (weekView) {
                    document
                      .getElementById(`regb-day-${d}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                title={
                  used
                    ? weekView
                      ? `${d}曜日へスクロール`
                      : `${d}曜日を表示`
                    : `${d}曜日を使う学年がありません (学年チップの設定で追加)`
                }
                className="w-11 py-1 rounded-lg border-2 text-sm font-extrabold cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={
                  selected
                    ? { background: fg, color: "#fff", borderColor: fg }
                    : { background: bg, color: fg, borderColor: "transparent" }
                }
              >
                <div className="leading-tight">{d}</div>
                {/* 入力済みコマ数 (埋まりの薄い曜日に気付ける) */}
                {used && (
                  <div className="text-[9px] font-normal leading-tight opacity-80">
                    {dayCellCounts[d] || 0}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setWeekView((v) => !v)}
            title="全曜日を縦に並べて俯瞰する (曜日チップは該当ブロックへのスクロールになります)"
            className={UI.btnToggle(weekView)}
          >
            📅 週表示
          </button>
          <button
            type="button"
            onClick={() => setSplitCampus((v) => !v)}
            title="教室が「亀◯◯」(亀井町) のクラス列を本校と別のセクションに分けて表示する。時刻体系の違う建物同士で空きマスが混ざらなくなります。データは変わりません"
            className={UI.btnToggle(splitCampus)}
          >
            🏫 亀井町を分ける
          </button>
          <button
            type="button"
            onClick={() => setHideEmpty((v) => !v)}
            title="セルが 1 つも無い時限行とクラス列を表示から隠す。データは変わりません"
            className={UI.btnToggle(hideEmpty)}
          >
            ▤ 空行・空列を隠す
          </button>
          <button
            type="button"
            onClick={() => setIsCompact((v) => !v)}
            title="セルを小さくして全体を見渡す"
            className={UI.btnToggle(isCompact)}
          >
            🗜 コンパクト
          </button>
          {selectedDay && (
            <button
              type="button"
              onClick={() => window.print()}
              title={
                weekView
                  ? "表示中の全曜日を印刷 (曜日ごとに改ページ)"
                  : "表示中の曜日を印刷 (A4 縦)"
              }
              className={UI.btn}
            >
              🖨 印刷
            </button>
          )}
          {!weekView && usedDays.length > 1 && (
            <button
              type="button"
              onClick={() => setPrintAllDays(true)}
              title="全曜日をまとめて印刷 (曜日ごとに改ページ)"
              className={UI.btn}
            >
              🖨 全曜日
            </button>
          )}
          {usedDays.length > 0 && (
            <button
              type="button"
              onClick={exportExcel}
              title="全曜日を Excel に書き出す (曜日ごとにシート・A4 横 1 ページ収め)。「🏫 亀井町を分ける」の状態に従います"
              className={UI.btn}
            >
              📥 Excel
            </button>
          )}
        </div>
      </div>

      {/* 学年チップ: クリックでその学年の設定 (名前・曜日・時限・クラス) を開閉 */}
      <div className="no-print flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs font-bold text-builder-ink-muted">学年:</span>
        {project.tabs.map((t, idx) => {
          const gc = gradeColor(t.grade || t.name);
          const selected = showTabConfig && activeTab?.id === t.id;
          const errCount = tabConflictCounts[t.id] || 0;
          const isEmptyTab =
            (t.days || []).length === 0 ||
            (t.periodIds || []).length === 0 ||
            (t.classes || []).length === 0;
          return (
            <button
              key={t.id}
              type="button"
              aria-expanded={selected}
              onClick={() => {
                if (selected) {
                  setShowTabConfig(false);
                } else {
                  setActiveTabId(t.id);
                  setShowTabConfig(true);
                }
              }}
              // ドラッグ (または Ctrl+←→) で並べ替え。セクションの並びも追従
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/x-regb-tab-index", String(idx));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("text/x-regb-tab-index"))
                  e.preventDefault();
              }}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData("text/x-regb-tab-index");
                if (raw === "") return;
                e.preventDefault();
                const from = Number(raw);
                if (Number.isInteger(from) && from !== idx) reorderTabs(from, idx);
              }}
              onKeyDown={(e) => {
                if (
                  (e.ctrlKey || e.metaKey) &&
                  (e.key === "ArrowLeft" || e.key === "ArrowRight")
                ) {
                  e.preventDefault();
                  reorderTabs(idx, e.key === "ArrowLeft" ? idx - 1 : idx + 1);
                }
              }}
              title="クリックで設定を開閉 / ドラッグ or Ctrl+←→ で並べ替え (表の並びに反映)"
              className={`px-3 py-1 rounded-full border-0 cursor-pointer text-xs font-bold inline-flex items-center gap-1.5 transition-all ${selected ? "ring-2 ring-builder-blue" : ""}`}
              style={{ background: gc.b, color: gc.f }}
            >
              {t.name}
              {errCount > 0 ? (
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded bg-builder-danger-soft text-builder-red border border-builder-danger-border"
                  title={`この学年に未承認の問題 (重複・NG) が ${errCount} 件あります`}
                  aria-label={`問題 ${errCount} 件`}
                >
                  ⚠️{errCount}
                </span>
              ) : isEmptyTab ? (
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded bg-builder-warning-soft text-builder-orange border border-builder-warning-border"
                  title="曜日・使う時限・クラスのいずれかが未設定のため、この学年のマス目がありません"
                  aria-label="時間割マスなし"
                >
                  空
                </span>
              ) : (
                <span title="この学年に未承認の問題はありません" aria-label="問題なし">
                  ✨
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={addTab}
          className="px-2.5 py-1 border-0 bg-transparent cursor-pointer text-builder-ink-muted hover:text-builder-blue font-bold text-xs whitespace-nowrap"
          title="学年を追加"
        >
          + 学年追加
        </button>
      </div>

      {/* 複数選択の一括操作バー */}
      {selectedRefs.size > 0 && (
        <div
          role="toolbar"
          aria-label="選択中のセルの一括操作"
          className="no-print flex items-center gap-2 flex-wrap bg-builder-info-soft border border-builder-info-border rounded-lg px-3 py-1.5 text-xs"
        >
          <span className="font-bold text-builder-ink">
            ☑️ {selectedRefs.size} セル選択中
          </span>
          <button type="button" className={UI.btnDanger} onClick={clearSelectedCells}>
            🧹 クリア
          </button>
          <button
            type="button"
            className={UI.btn}
            onClick={() => toggleLockRefs([...selectedRefs], true)}
            title="選択中のセルをロックする（編集・入替・クリアを防ぐ。中身のあるセルのみ）"
          >
            🔒 ロック
          </button>
          <button
            type="button"
            className={UI.btn}
            onClick={() => toggleLockRefs([...selectedRefs], false)}
            title="選択中のセルのロックを解除する"
          >
            🔓 解除
          </button>
          <button type="button" className={UI.btn} onClick={clearSelection}>
            ✕ 選択解除 (Esc)
          </button>
          <span className="text-builder-ink-subtle">
            Ctrl(⌘)+クリックで追加/除外・Shift+クリックで同じ表内の範囲選択
          </span>
        </div>
      )}

      {/* はじめかたガイド (RB23): 最初のコマが入るまで状態連動で表示 */}
      {Object.keys(dayCellCounts).length === 0 && (
        <RegularOnboarding
          project={project}
          onOpenConfig={openProjectConfig}
          onAddTab={addTab}
          onOpenImport={() => setShowImport(true)}
        />
      )}

      {activeTab && showTabConfig && (
        <TabConfigPanel
          project={project}
          tab={activeTab}
          updateTab={updateTab}
          onRemoveTab={removeTab}
        />
      )}

      {/* 印刷専用の見出し。ツールバー・曜日チップは no-print のため、これが
          無いと紙面が無記名になりどのプロジェクト・曜日か分からない
          (講習ビルダー L1f と同じ)。全曜日印刷中は単曜日側を紙面から外す */}
      {weekView ? (
        /* 📅 週表示: 全曜日を縦に並べて俯瞰。各ブロックは曜日チップからの
           スクロール先 (regb-day-*) で、印刷時は曜日ごとに改ページされる
           (regb-print-day)。見出しは画面にも出し、紙面には印刷日を足す */
        usedDays.length > 0 ? (
          <div
            className={`flex flex-col gap-4 ${printTeacherWeek ? "print:hidden" : ""}`}
          >
            {usedDays.map((d) => (
              <div
                key={d}
                id={`regb-day-${d}`}
                className="regb-print-day flex flex-col gap-1"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-extrabold px-2.5 py-0.5 rounded-lg"
                    style={{
                      background: DAY_BG[d] || "#ececec",
                      color: DAY_COLOR[d] || "#555555",
                    }}
                  >
                    {d}曜日
                  </span>
                  <span className="hidden print:inline text-xs text-builder-ink-muted">
                    {project.name || "通常時間割"} — 印刷日:{" "}
                    {formatPrintDateJa(new Date())}
                  </span>
                </div>
                <RegularGrid
                  project={project}
                  day={d}
                  onCellChange={onCellChange}
                  onClearCell={onClearCell}
                  onSwapCells={onSwapCells}
                  conflictsByRef={conflictView.byRef}
                  ngOnlyRefs={conflictView.ngOnlyRefs}
                  highlightTeacher={highlightTeacher}
                  highlightRoom={highlightRoom}
                  hideEmpty={hideEmpty}
                  splitCampus={splitCampus}
                  isCompact={isCompact}
                  jumpTarget={jumpTarget}
                  onOpenCellMenu={openCellMenu}
                  onOpenHeaderMenu={openHeaderMenu}
                  onSetClassRoom={onSetClassRoom}
                  onCopyCell={copyCell}
                  onPasteCell={pasteCell}
                  onCopyCellTo={onCopyCellTo}
                  selectedRefs={selectedRefs}
                  selectionAnchor={selAnchorRef.current}
                  onToggleSelect={toggleSelect}
                  onRectSelect={rectSelect}
                />
              </div>
            ))}
          </div>
        ) : (
          project.tabs.length > 0 && (
            <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
              表示できる曜日がありません。学年チップからどの曜日を使うか設定してください。
            </div>
          )
        )
      ) : (
        <div className={printAllDays || printTeacherWeek ? "print:hidden" : ""}>
          {selectedDay && (
            <div className="hidden print:block" aria-hidden="true">
              <div className="text-lg font-bold text-builder-ink">
                {project.name || "通常時間割"} — {selectedDay}曜日
              </div>
              <div className="text-xs text-builder-ink-muted">
                印刷日: {formatPrintDateJa(new Date())}
              </div>
            </div>
          )}

          {selectedDay ? (
            <RegularGrid
              project={project}
              day={selectedDay}
              onCellChange={onCellChange}
              onClearCell={onClearCell}
              onSwapCells={onSwapCells}
              conflictsByRef={conflictView.byRef}
              ngOnlyRefs={conflictView.ngOnlyRefs}
              highlightTeacher={highlightTeacher}
              highlightRoom={highlightRoom}
              hideEmpty={hideEmpty}
              splitCampus={splitCampus}
              isCompact={isCompact}
              jumpTarget={jumpTarget}
              onOpenCellMenu={openCellMenu}
              onOpenHeaderMenu={openHeaderMenu}
              onSetClassRoom={onSetClassRoom}
              onCopyCell={copyCell}
              onPasteCell={pasteCell}
              onCopyCellTo={onCopyCellTo}
              selectedRefs={selectedRefs}
              selectionAnchor={selAnchorRef.current}
              onToggleSelect={toggleSelect}
              onRectSelect={rectSelect}
            />
          ) : (
            project.tabs.length > 0 && (
              <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
                表示できる曜日がありません。学年チップからどの曜日を使うか設定してください。
              </div>
            )
          )}
        </div>
      )}

      {/* 全曜日印刷用: 印刷中だけ描画される print 専用 DOM (曜日ごとに改ページ)。
          週表示中は画面 DOM がそのまま全曜日なので使わない */}
      {!weekView && printAllDays && (
        <div className="hidden print:block" aria-hidden="true">
          {usedDays.map((d) => (
            <div key={d} className="regb-print-day">
              <div className="text-lg font-bold text-builder-ink">
                {project.name || "通常時間割"} — {d}曜日
              </div>
              <div className="text-xs text-builder-ink-muted mb-1">
                印刷日: {formatPrintDateJa(new Date())}
              </div>
              <RegularGrid
                project={project}
                day={d}
                onCellChange={onCellChange}
                onClearCell={onClearCell}
                onSwapCells={onSwapCells}
                conflictsByRef={conflictView.byRef}
                ngOnlyRefs={conflictView.ngOnlyRefs}
                highlightTeacher=""
                hideEmpty={hideEmpty}
                splitCampus={splitCampus}
                isCompact={isCompact}
              />
            </div>
          ))}
        </div>
      )}

      <RegularContextMenu
        menu={ctxMenu}
        cell={ctxMenu?.kind === "cell" ? getCellByRef(ctxMenu.ref) : null}
        clipboard={cellClipboard}
        jointItem={jointItem}
        conflictCount={
          ctxMenu?.kind === "cell"
            ? conflictView.active.filter((c) => c.refs.includes(ctxMenu.ref)).length
            : 0
        }
        filledCount={
          // 一括クリア・一括ロックの対象 (中身がありロックされていないセル)
          ctxMenu?.kind === "bulk"
            ? ctxMenu.refs.filter((r) => {
                const c = getCellByRef(r);
                return c && !c.locked;
              }).length
            : 0
        }
        lockedCount={
          ctxMenu?.kind === "bulk"
            ? ctxMenu.refs.filter((r) => getCellByRef(r)?.locked).length
            : 0
        }
        onAction={onCtxAction}
        onClose={closeCtxMenu}
      />

      {jointTarget &&
        (() => {
          const tab = project.tabs.find(
            (t) => t.id === parseCellRef(jointTarget).tabId
          );
          return tab ? (
            <JointDialog
              project={project}
              tab={tab}
              cellRef={jointTarget}
              onApply={applyJointChange}
              onClose={() => setJointTarget(null)}
            />
          ) : null;
        })()}

      {showProjectConfig && (
        <ProjectConfigModal
          project={project}
          saveProject={saveProject}
          slots={slots}
          initialTab={configInitialTab}
          onClose={closeProjectConfig}
        />
      )}

      {showReflect && (
        <ReflectDialog
          project={project}
          timetables={timetables}
          slots={slots}
          saveTimetables={saveTimetables}
          saveSlots={saveSlots}
          saveProject={saveProject}
          onClose={() => setShowReflect(false)}
        />
      )}

      {showImport && (
        <ImportDialog
          timetables={timetables}
          slots={slots}
          onImport={importProject}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
