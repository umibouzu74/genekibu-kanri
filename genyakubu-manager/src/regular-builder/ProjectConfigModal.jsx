import { useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { PeriodsTab } from "./config/PeriodsTab";
import { SubjectsTab } from "./config/SubjectsTab";
import { TeachersTab } from "./config/TeachersTab";
import { RoomsTab } from "./config/RoomsTab";
import { LimitsTab } from "./config/LimitsTab";

// ─── ⚙ 全体設定モーダル (時限 / 科目 / 講師 / 教室 / NG・上限) ──────
// 講習ビルダーの「⚙️ 設定メニュー」と同じタブ構成のモーダル (RB19)。
// 以前はインラインパネル (ProjectConfigPanel) だったが、NG・上限が増えて
// 縦に長くなったためタブで分類する。編集は従来どおり即時保存
// (saveProject 経由・Ctrl+Z で戻せる) — 「OK で確定」型ではない。

const TABS = [
  ["periods", "🕐 時限"],
  ["subjects", "📚 科目"],
  ["teachers", "👤 講師"],
  ["rooms", "🏫 教室"],
  ["limits", "🚫 NG・上限"],
];

// タブ本体は config/*Tab.jsx (1 タブ 1 ファイル。2026-09-05 に分割)。
// 各タブは project と saveProject だけを受けて即時保存する。入力欄の
// 打ちかけ (追加前の科目名など) はタブの中の state なので、タブを切り替えると
// 消える (保存済みの設定は消えない)。
const TAB_COMPONENTS = {
  periods: PeriodsTab,
  subjects: SubjectsTab,
  teachers: TeachersTab,
  rooms: RoomsTab,
  limits: LimitsTab,
};

export function ProjectConfigModal({
  project,
  saveProject,
  slots,
  /** 親アプリの教科マスタ (name + aliases)。担当科目の推定で
      「英/数」→ 英語 のような読み替えに使う */
  masterSubjects = [],
  onClose,
  /** 開いたとき最初に表示するタブ (オンボーディングの導線用) */
  initialTab = "periods",
}) {
  const [tab, setTab] = useState(initialTab);
  const dialogRef = useRef(null);
  const tablistRef = useRef(null);

  // Escape で閉じる + Tab フォーカスをモーダル内に閉じ込める
  useFocusTrap(dialogRef, { onClose });

  // tablist の ←→/Home/End ナビ (講習 ConfigModal と同じ roving tabindex)
  const handleTablistKeyDown = (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const current = TABS.findIndex(([id]) => id === tab);
    let next = current;
    if (e.key === "ArrowLeft") next = (current - 1 + TABS.length) % TABS.length;
    else if (e.key === "ArrowRight") next = (current + 1) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    const nextId = TABS[next][0];
    setTab(nextId);
    tablistRef.current?.querySelector(`#regb-config-tab-${nextId}`)?.focus();
  };

  const TabBody = TAB_COMPONENTS[tab] || PeriodsTab;

  return (
    <div
      className="no-print fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regb-config-title"
        className="bg-builder-surface w-full max-w-3xl max-h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in"
      >
        <div className="px-4 py-3 border-b border-builder-border flex justify-between items-center bg-builder-surface-alt">
          <h2
            id="regb-config-title"
            className="m-0 font-bold text-base text-builder-ink truncate"
          >
            ⚙ 全体設定{project.name ? ` — ${project.name}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="全体設定を閉じる"
            className="border-0 bg-transparent cursor-pointer text-xl font-bold leading-none text-builder-ink-muted hover:text-builder-ink shrink-0"
          >
            ×
          </button>
        </div>

        <div
          ref={tablistRef}
          role="tablist"
          aria-label="設定カテゴリ"
          onKeyDown={handleTablistKeyDown}
          className="flex gap-4 px-4 pt-3 border-b border-builder-border overflow-x-auto"
        >
          {TABS.map(([id, label]) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                id={`regb-config-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="regb-config-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                className={`pb-2 border-0 bg-transparent cursor-pointer text-sm font-bold whitespace-nowrap ${
                  selected
                    ? "text-builder-blue border-b-2 border-builder-blue"
                    : "text-builder-ink-muted hover:text-builder-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          id="regb-config-tabpanel"
          role="tabpanel"
          aria-labelledby={`regb-config-tab-${tab}`}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 text-xs"
        >
          <TabBody
            project={project}
            saveProject={saveProject}
            slots={slots}
            masterSubjects={masterSubjects}
          />
        </div>
      </div>
    </div>
  );
}
