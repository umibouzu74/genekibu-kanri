import { useCallback, useMemo, useState } from "react";
import { S } from "../styles/common";
import { LS } from "../constants/storageKeys";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { nextNumericId } from "../utils/schema";
import { createDefaultProject, sanitizeProject } from "./model";
import { computeConflicts } from "./conflicts";
import { ProjectConfigPanel } from "./ProjectConfigPanel";
import { TabConfigPanel } from "./TabConfigPanel";
import { RegularGrid } from "./RegularGrid";
import { ReflectDialog } from "./ReflectDialog";

// ─── 通常時間割作成 ─────────────────────────────────────────────────
// 講習時間割作成の操作感で通常時間割 (曜日ベース) を設計する専用ビュー。
// 下書きは LS.regularBuilderProject に保存され、Firebase 設定済み環境では
// 他の appData と同様にクラウド同期される (書込には管理者ログインが必要)。
// 完成したら「⤴ 本体へ反映」で Timetable + Slot に書き出す。

const migrate = (raw) => sanitizeProject(raw) || createDefaultProject();

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
  const [project, saveProject] = useSyncedStorage(
    LS.regularBuilderProject,
    createDefaultProject(),
    { migrate, onError: onStorageError }
  );

  const [activeTabId, setActiveTabId] = useState(null);
  const [showProjectConfig, setShowProjectConfig] = useState(false);
  const [showTabConfig, setShowTabConfig] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [highlightTeacher, setHighlightTeacher] = useState("");

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
        <input
          type="text"
          value={project.name}
          onChange={(e) => saveProject((p) => ({ ...p, name: e.target.value }))}
          placeholder="プロジェクト名 (例: 2026 後期)"
          style={{ ...S.input, width: 200 }}
        />
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
    </div>
  );
}
