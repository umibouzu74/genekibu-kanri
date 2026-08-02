import { useCallback, useMemo, useState } from "react";
import { S } from "../styles/common";
import { LS } from "../constants/storageKeys";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { nextNumericId } from "../utils/schema";
import {
  createDefaultProject,
  createDefaultWorkspace,
  sanitizeWorkspace,
} from "./model";
import { computeConflicts } from "./conflicts";
import { applyChu3SecondTermShift, buildProjectFromSlots } from "./importTimetable";
import { ProjectConfigPanel } from "./ProjectConfigPanel";
import { TabConfigPanel } from "./TabConfigPanel";
import { RegularGrid } from "./RegularGrid";
import { ReflectDialog } from "./ReflectDialog";
import { ImportDialog } from "./ImportDialog";

// ─── 通常時間割作成 ─────────────────────────────────────────────────
// 講習時間割作成の操作感で通常時間割 (曜日ベース) を設計する専用ビュー。
// 「2026 1学期」「2026 2学期」のような複数プロジェクトを切り替えて編集
// できる。下書きは LS.regularBuilderProject に保存され、Firebase 設定済み
// 環境では他の appData と同様にクラウド同期される (書込には管理者ログイン
// が必要)。完成したら「⤴ 本体へ反映」で Timetable + Slot に書き出す。

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
  const [highlightTeacher, setHighlightTeacher] = useState("");

  const project =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ||
    workspace.projects[0];

  // アクティブなプロジェクトだけを更新する (既存の下位コンポーネントは
  // 単一プロジェクトの世界のまま — saveProject(fn) の形を維持)
  const saveProject = useCallback(
    (next) =>
      saveWorkspace((w) => {
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
      }),
    [saveWorkspace]
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
      saveWorkspace((w) => {
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
    [saveWorkspace, toasts]
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
    saveWorkspace((w) => {
      const rest = w.projects.filter((p) => p.id !== project.id);
      if (rest.length === 0) return createDefaultWorkspace();
      return { ...w, activeProjectId: rest[0].id, projects: rest };
    });
    setActiveTabId(null);
  }, [project, confirm, saveWorkspace]);

  const duplicateProject = useCallback(() => {
    const copy = JSON.parse(JSON.stringify(project));
    delete copy.id;
    addProject(
      { ...copy, name: `${project.name}（コピー）` },
      { successMsg: `「${project.name}」を複製しました` }
    );
  }, [project, addProject]);

  const importProject = useCallback(
    ({ sourceId, name, applyShift }) => {
      const { project: imported, stats } = buildProjectFromSlots(
        name,
        slots,
        sourceId
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

  const conflicts = useMemo(() => computeConflicts(project), [project]);

  // ── 更新ヘルパ ──────────────────────────────────────────────────
  const updateTab = useCallback(
    (tabId, fn) =>
      saveProject((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === tabId ? fn(t) : t)),
      })),
    [saveProject]
  );

  const onCellChange = useCallback(
    (key, field, value) => {
      if (!activeTab) return;
      updateTab(activeTab.id, (t) => {
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
    [activeTab, updateTab]
  );

  const addTab = useCallback(() => {
    saveProject((p) => {
      const id = nextNumericId(p.tabs);
      // 直前のタブから曜日・時限の選択を引き継ぐ (講習版の「他へコピー」相当)
      const last = p.tabs[p.tabs.length - 1];
      return {
        ...p,
        tabs: [
          ...p.tabs,
          {
            id,
            name: `タブ${id}`,
            grade: "",
            classes: [],
            days: last ? [...last.days] : ["月", "火", "水", "木", "金"],
            periodIds: last ? [...last.periodIds] : p.periods.map((x) => x.id),
            schedule: {},
          },
        ],
      };
    });
    setShowTabConfig(true);
  }, [saveProject]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 入力候補 (グリッドのセルから参照するグローバル datalist) */}
      <datalist id="regb-subjects">
        {project.subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="regb-teachers">
        {project.teachers.map((t) => (
          <option key={t.name} value={t.name} />
        ))}
      </datalist>

      {/* ツールバー */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 10,
          padding: "10px 14px",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>🏗 通常時間割作成</span>
        {workspace.projects.length > 1 && (
          <select
            value={project.id}
            onChange={(e) => switchProject(Number(e.target.value))}
            style={{ ...S.input, width: "auto", minWidth: 150, fontWeight: 700 }}
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
          style={{ ...S.input, width: 180 }}
        />
        <div style={{ display: "flex", gap: 3 }}>
          <button
            type="button"
            onClick={() =>
              addProject(createDefaultProject(), { successMsg: "プロジェクトを作成しました" })
            }
            title="空のプロジェクトを新規作成"
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px" }}
          >
            ＋新規
          </button>
          <button
            type="button"
            onClick={duplicateProject}
            title="このプロジェクトを複製"
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px" }}
          >
            ⧉複製
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            title="本体の時間割をプロジェクトとして取り込む"
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px", background: "#e8eef8", color: "#2a4a8e" }}
          >
            ⬇ 本体から取込
          </button>
          <button
            type="button"
            onClick={removeProject}
            title="このプロジェクトを削除"
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px", background: "#fde8e8", color: "#c03030" }}
          >
            🗑
          </button>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 10,
            background: conflicts.list.length ? "#fde8e8" : "#e8f5e8",
            color: conflicts.list.length ? "#c03030" : "#2a7a2a",
          }}
          title={conflicts.list.map((c) => c.label).join("\n")}
        >
          {conflicts.list.length ? `⚠ 重複 ${conflicts.list.length} 件` : "✓ 重複なし"}
        </span>
        <select
          value={highlightTeacher}
          onChange={(e) => setHighlightTeacher(e.target.value)}
          style={{ ...S.input, width: "auto", minWidth: 130 }}
          title="選んだ講師のセルを強調表示"
        >
          <option value="">👁 講師で探す</option>
          {teacherOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowProjectConfig((v) => !v)}
          style={{ ...S.btn(showProjectConfig), fontSize: 12 }}
        >
          ⚙ 全体設定
        </button>
        <button
          type="button"
          onClick={() => setShowReflect(true)}
          disabled={!isAdmin}
          title={isAdmin ? "下書きを本体の時間割 + コマに書き出す" : "反映には管理者ログインが必要です"}
          style={{ ...S.btn(true), background: "#2a4a8e", fontSize: 12, opacity: isAdmin ? 1 : 0.5 }}
        >
          ⤴ 本体へ反映
        </button>
      </div>

      {showProjectConfig && (
        <ProjectConfigPanel project={project} saveProject={saveProject} slots={slots} />
      )}

      {/* タブバー */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {project.tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTabId(t.id)}
            style={{ ...S.btn(activeTab?.id === t.id), fontSize: 12 }}
          >
            {t.name}
          </button>
        ))}
        <button type="button" onClick={addTab} style={{ ...S.btn(false), fontSize: 12 }}>
          + タブ追加
        </button>
        {activeTab && (
          <button
            type="button"
            onClick={() => setShowTabConfig((v) => !v)}
            style={{ ...S.btn(showTabConfig), fontSize: 12 }}
          >
            ⚙ タブ設定
          </button>
        )}
      </div>

      {/* 空状態ガイド */}
      {project.tabs.length === 0 && (
        <div
          style={{
            background: "#f6f8fc",
            border: "1px dashed #b8c4dc",
            borderRadius: 10,
            padding: 20,
            fontSize: 12,
            color: "#555",
            lineHeight: 1.9,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>はじめかた</div>
          <div style={{ marginBottom: 6 }}>
            <b>今の時間割から始める（おすすめ）</b>:
            「⬇ 本体から取込」で現行の時間割をプロジェクトに変換できます。
            「中3 の 2学期変更を適用する」にチェックを入れると、平日前倒し + 土曜内申の午前枠を反映した 2学期のたたき台が一発でできます。
          </div>
          <b>ゼロから組む場合:</b><br />
          1. 「⚙ 全体設定」で時限（時刻付き）と講師を登録します（講師は本体のコマから取込できます）<br />
          2. 「+ タブ追加」で学年タブを作り、曜日・使う時限・クラス（既定教室付き）を設定します<br />
          3. マス目に教科・講師を入力します（講師・教室の重複は自動チェック）<br />
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

      {activeTab && (
        <RegularGrid
          project={project}
          tab={activeTab}
          onCellChange={onCellChange}
          conflictsByRef={conflicts.byRef}
          highlightTeacher={highlightTeacher}
        />
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
