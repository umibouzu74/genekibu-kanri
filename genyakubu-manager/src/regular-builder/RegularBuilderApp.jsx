import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// 講習ビルダーと同じ Tailwind エントリ (builder-* トークン / focus ring /
// タッチ CSS)。tailwind.config.js の content に regular-builder も含まれる。
import "../timetable-builder/tailwind.css";
import { LS } from "../constants/storageKeys";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { usePersistedToggle } from "../timetable-builder/hooks/usePersistedToggle";
import { formatPrintDateJa } from "../timetable-builder/utils/printHeader";
import { nextNumericId } from "../utils/schema";
import {
  createDefaultProject,
  createDefaultWorkspace,
  parseCellRef,
  sanitizeWorkspace,
  swapCellsAcrossTabs,
  REGULAR_DAYS,
} from "./model";
import { DAY_BG, DAY_COLOR, gradeColor } from "../constants/colors";
import { buildConflictView, computeConflicts, conflictKey } from "./conflicts";
import { applyChu3SecondTermShift, buildProjectFromSlots } from "./importTimetable";
import { ProjectConfigPanel } from "./ProjectConfigPanel";
import { TabConfigPanel } from "./TabConfigPanel";
import { RegularGrid } from "./RegularGrid";
import { ReflectDialog } from "./ReflectDialog";
import { ImportDialog } from "./ImportDialog";
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
  const [showTabConfig, setShowTabConfig] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  // 表示トグルはリロード後も保持 (講習の 📏 と同じ。明示トグルの保存であり
  // 自動学習系ではない)
  const [hideEmptyRows, setHideEmptyRows] = usePersistedToggle(
    LS.regularBuilderHideEmpty,
    false
  );
  const [isCompact, setIsCompact] = usePersistedToggle(LS.regularBuilderCompact, false);
  const [highlightTeacher, setHighlightTeacher] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);

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

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, wsRef.current];
    lastCommitAtRef.current = 0; // 次の編集は新しい取り消し単位
    saveWorkspace(prev);
    setHistVersion((v) => v + 1);
  }, [saveWorkspace]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, wsRef.current];
    lastCommitAtRef.current = 0;
    saveWorkspace(next);
    setHistVersion((v) => v + 1);
  }, [saveWorkspace]);

  const canUndo = histVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = histVersion >= 0 && redoStackRef.current.length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // テキスト入力中はブラウザ標準の undo を優先する
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
    ({ sourceId, name, applyShift, splitWeekend }) => {
      const { project: imported, stats } = buildProjectFromSlots(
        name,
        slots,
        sourceId,
        { splitWeekend }
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

  // セルの ✕ ボタンで全フィールドをクリア (Undo で戻せる独立単位)
  const onClearCell = useCallback(
    (ref) => {
      const { tabId, key } = parseCellRef(ref);
      updateTab(
        tabId,
        (t) => {
          if (!(key in t.schedule)) return t;
          const schedule = { ...t.schedule };
          delete schedule[key];
          return { ...t, schedule };
        },
        { atomic: true }
      );
    },
    [updateTab]
  );

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

  const removeTab = useCallback(async () => {
    if (!activeTab) return;
    const cellCount = Object.keys(activeTab.schedule).length;
    const ok = await confirm({
      title: "タブの削除",
      message: `タブ「${activeTab.name}」を削除しますか？\n入力済みのセル ${cellCount} 件も削除されます。`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    saveProject((p) => ({ ...p, tabs: p.tabs.filter((t) => t.id !== activeTab.id) }));
    setActiveTabId(null);
  }, [activeTab, confirm, saveProject]);

  // 講師フィルタ候補 (マスタ + セルに現れる講師名)
  const teacherOptions = useMemo(() => {
    const names = new Set(project.teachers.map((t) => t.name));
    return [...names].sort();
  }, [project.teachers]);

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
              "クリックで重複の一覧・承認を開閉") +
            (conflictView.approved.length
              ? `\n(承認済み ${conflictView.approved.length} 件)`
              : "")
          }
        >
          {conflictView.active.length
            ? `⚠ 重複 ${conflictView.active.length} 件`
            : "✓ 重複なし"}
        </button>
        <select
          value={highlightTeacher}
          onChange={(e) => setHighlightTeacher(e.target.value)}
          className={`${UI.input} min-w-[130px]`}
          title="選んだ講師のセルを強調表示"
        >
          <option value="">👁 講師で探す</option>
          {teacherOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowProjectConfig((v) => !v)}
          className={UI.btnToggle(showProjectConfig)}
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

      {/* 重複の一覧・承認パネル */}
      {showConflicts && (
        <div className={`no-print ${UI.panel} text-xs`}>
          <div className={UI.panelHead}>講師・教室の重複</div>
          {conflictView.active.length === 0 && conflictView.approved.length === 0 && (
            <div className="text-builder-ink-subtle">重複はありません。</div>
          )}
          {conflictView.active.map((c) => (
            <div key={conflictKey(c)} className="flex items-center gap-2">
              <span className="flex-1 text-builder-red">⚠ {c.label}</span>
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
              承認済み（意図した重なり）
            </div>
          )}
          {conflictView.approved.map((c) => (
            <div key={conflictKey(c)} className="flex items-center gap-2">
              <span className="flex-1 text-builder-ink-subtle">{c.label}</span>
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

      {showProjectConfig && (
        <ProjectConfigPanel project={project} saveProject={saveProject} slots={slots} />
      )}

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
                onClick={() => setSelectedDay(d)}
                title={
                  used
                    ? `${d}曜日を表示`
                    : `${d}曜日を使う学年がありません (学年チップの設定で追加)`
                }
                className="w-11 py-1.5 rounded-lg border-2 text-sm font-extrabold cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={
                  selected
                    ? { background: fg, color: "#fff", borderColor: fg }
                    : { background: bg, color: fg, borderColor: "transparent" }
                }
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setHideEmptyRows((v) => !v)}
            title="セルが 1 つも無い時限行を表示から隠す。データは変わりません"
            className={UI.btnToggle(hideEmptyRows)}
          >
            ▤ 空行を隠す
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
              title="表示中の曜日を印刷 (A4 縦)"
              className={UI.btn}
            >
              🖨 印刷
            </button>
          )}
        </div>
      </div>

      {/* 学年チップ: クリックでその学年の設定 (名前・曜日・時限・クラス) を開閉 */}
      <div className="no-print flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs font-bold text-builder-ink-muted">学年:</span>
        {project.tabs.map((t) => {
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
              title="クリックでこの学年の設定 (名前・学年・曜日・時限・クラス) を開閉"
              className={`px-3 py-1 rounded-full border-0 cursor-pointer text-xs font-bold inline-flex items-center gap-1.5 transition-all ${selected ? "ring-2 ring-builder-blue" : ""}`}
              style={{ background: gc.b, color: gc.f }}
            >
              {t.name}
              {errCount > 0 ? (
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded bg-builder-danger-soft text-builder-red border border-builder-danger-border"
                  title={`この学年に未承認の重複が ${errCount} 件あります`}
                  aria-label={`重複 ${errCount} 件`}
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
                <span title="この学年に未承認の重複はありません" aria-label="重複なし">
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

      {/* 空状態ガイド */}
      {project.tabs.length === 0 && (
        <div className="no-print bg-builder-info-soft border border-dashed border-builder-info-border rounded-lg p-5 text-xs text-builder-ink leading-7">
          <div className="font-extrabold text-[13px] mb-1">はじめかた</div>
          <div className="mb-1.5">
            <b>今の時間割から始める（おすすめ）</b>:
            「⬇ 本体から取込」で現行の時間割をプロジェクトに変換できます。
            「中3 の 2学期変更を適用する」にチェックを入れると、平日前倒し + 土曜内申の午前枠を反映した 2学期のたたき台が一発でできます。
          </div>
          <b>ゼロから組む場合:</b>
          <br />
          1. 「⚙ 全体設定」で時限（時刻付き）と講師を登録します（講師は本体のコマから取込できます）
          <br />
          2. 「+ 学年追加」で学年を作り、曜日・使う時限・クラス（既定教室付き）を設定します
          <br />
          3. 曜日を選ぶと全学年が横に並びます。マス目をクリックして教科・講師を選びます（講師・教室の重複は自動チェック、セルはドラッグで入替できます）
          <br />
          4. 「⤴ 本体へ反映」で時間割 + コマとして書き出します（期間を設定すればヘッダのプルダウンや第N回カウントに自動で乗ります）
        </div>
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
          (講習ビルダー L1f と同じ) */}
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
          highlightTeacher={highlightTeacher}
          hideEmptyRows={hideEmptyRows}
          isCompact={isCompact}
        />
      ) : (
        project.tabs.length > 0 && (
          <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
            表示できる曜日がありません。学年チップからどの曜日を使うか設定してください。
          </div>
        )
      )}

      {showReflect && (
        <ReflectDialog
          project={project}
          timetables={timetables}
          slots={slots}
          saveTimetables={saveTimetables}
          saveSlots={saveSlots}
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
