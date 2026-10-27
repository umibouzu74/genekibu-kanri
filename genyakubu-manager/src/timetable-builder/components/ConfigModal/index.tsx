import { useEffect, useRef, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import BasicSettings from './BasicSettings';
import TeacherManager from './TeacherManager';
import ClassPriority from './ClassPriority';
import AbsenceNgPanel from './AbsenceNgPanel';
import AvailabilityPanel from './AvailabilityPanel';
import SubjectColorSettings from './SubjectColorSettings';
import SubjectManager from './SubjectManager';
import CombinedGroupSettings from './CombinedGroupSettings';
import GenerationSettings from './GenerationSettings';
import TemplateManager from './TemplateManager';
import { KOSHU_SEASONS, koshuSeasonDef, suggestSeasonProjectName, type KoshuSeason } from '../../utils/seasons';
import { buildFreshSeasonProject } from '../../utils/seasonStart';

const TITLE_ID = 'builder-config-modal-title';

// タブ定義 (id / ラベル)。tablist の左右矢印ナビ (E1b) はこの順序に従う。
const TABS = [
  ['basic', '基本設定'],
  ['subjects', '📚 科目'],
  ['classes', '🏫 クラス優先度'],
  ['absence-ng', '📅 講師不在・NG'],
  ['availability', '🙋 出勤可能調査'],
  ['combined', '🔗 合同授業'],
  ['colors', '🎨 科目カラー'],
  ['generation', '⚡ 自動生成'],
  ['templates', '🗂 テンプレート'],
];

// season: 開いている講習の季節 (リセット・作り直しはこの季節の時間割だけ)。
// 単体で描くテストでは省略できる
export default function ConfigModal({ onClose, season }: { onClose: () => void; season?: KoshuSeason }) {
  const [configTab, setConfigTab] = useState('basic');
  const { project, handleResetAll, updateProjectName, pushHistory } = useProjectContext();
  const { showConfirm, showInput, showToast } = useUI();
  const seasonLabel = season ? koshuSeasonDef(season).label : '講習';
  // 名前の例 (季節に合わせる。作り直しの名前の案と同じ「2026 冬期講習」の形)
  const nameExample = `例: ${suggestSeasonProjectName(season ?? 'winter')}`;
  const [projectNameInput, setProjectNameInput] = useState(project.name || "");
  const dialogRef = useRef(null);

  // F5k: モーダルを開いたまま project.name が外から変わる経路がある
  // (テンプレート適用 / リセット / undo)。draft を同期しないと古い名前を
  // 表示し続け、フィールドに触れて blur しただけで新しい名前を旧名で
  // 上書きしてしまう。編集途中の draft は外部変更が勝つ (保守的挙動)。
  useEffect(() => {
    setProjectNameInput(project.name || "");
  }, [project.name]);
  const tablistRef = useRef(null);

  // Escape で閉じる + Tab フォーカスを dialog 内に閉じ込める (E1b focus trap)。
  useFocusTrap(dialogRef, { onClose });

  // tablist の左右/Home/End 矢印ナビ。フォーカスをそのタブボタンへ移して選択する。
  const handleTablistKeyDown = (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const currentIndex = TABS.findIndex(([id]) => id === configTab);
    let nextIndex = currentIndex;
    if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    const nextId = TABS[nextIndex][0];
    setConfigTab(nextId);
    // 次のタブボタンへフォーカス移動 (roving tabindex)
    const nextBtn = tablistRef.current?.querySelector(`#builder-config-tab-${nextId}`);
    nextBtn?.focus();
  };

  const handleProjectNameBlur = () => {
    const trimmed = projectNameInput.trim();
    if (trimmed !== (project.name || "")) {
      updateProjectName(trimmed);
    }
  };

  const handleResetClick = async () => {
    const others = KOSHU_SEASONS.filter(s => s.key !== season).map(s => s.label).join('・');
    const ok = await showConfirm(
      `${seasonLabel}の時間割のデータをすべて削除して初期値に戻しますか？\n` +
        (season ? `ほかの季節 (${others}) の時間割はそのままです。\n` : '') +
        `この操作は元に戻せません。`,
      { title: "データリセット", danger: true, confirmLabel: "リセット" },
    );
    if (ok) handleResetAll();
  };

  // 去年の同じ季節の時間割を、今年の講習用に作り直す (設定だけ残す)。
  // 作り直した後は Ctrl+Z で戻せる (project/replace = 履歴に積む)
  const handleRebuildClick = async () => {
    const nextName = await showInput('作り直した後のプロジェクト名', {
      title: `次の${seasonLabel}用に作り直す`,
      defaultValue: season ? suggestSeasonProjectName(season) : '',
      placeholder: nameExample,
      confirmLabel: '次へ',
    });
    if (nextName == null) return;
    const name = String(nextName).trim() || project.name || '';
    const ok = await showConfirm(
      `「${project.name || seasonLabel}」を「${name}」に作り直します。\n\n` +
        `残すもの: 講師 (担当科目・担当不可/優先クラス・コマ数の上限)、学年タブ (クラス・コマ数・使う時限)、科目と色、時限、全日程の合同授業、自動生成の設定\n` +
        `空にするもの: 日付、時間割、日ごとのチェック、講師不在・NG、出勤可能調査の回答、他学年セッション、スナップショット\n` +
        `今の講習のコマは、講師の月間予定の「講」と授業時間の集計からも消えます (集計は先に締めてください)。\n\n` +
        `今の内容を残しておきたいときは、先に 💾 プロジェクト保存 (JSON) か 🗂 テンプレートに保存してください。\n` +
        `作り直した直後なら、ツールバーの ↩️ (元に戻す) か Ctrl+Z で戻せます。`,
      { title: `次の${seasonLabel}用に作り直す`, danger: true, confirmLabel: '作り直す' },
    );
    if (!ok) return;
    pushHistory(buildFreshSeasonProject(project, { name }));
    showToast(`「${name}」に作り直しました。基本設定の「⚡ 期間から自動生成」で日付を作ってください`, 'success', 6000);
  };

  return (
    <div
      // z-[1000]: 本体のサイドバー (position:fixed, z-index 999) より上に出す。
      // z-50 だとサイドバーの下に潜り、狭い画面でタイトル・先頭のタブが隠れていた
      className="fixed inset-0 bg-black/50 z-[1000] flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-builder-surface w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in"
      >
        <div className="p-4 border-b border-builder-border flex justify-between items-center bg-builder-surface-alt">
          <h2 id={TITLE_ID} className="font-bold text-lg text-builder-ink">⚙️ 設定メニュー</h2>
          <button onClick={onClose} aria-label="設定を閉じる" className="text-2xl font-bold text-builder-ink-muted hover:text-builder-ink">×</button>
        </div>
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="設定カテゴリ"
          onKeyDown={handleTablistKeyDown}
          className="flex gap-4 px-6 pt-4 border-b border-builder-border overflow-x-auto"
        >
          {TABS.map(([id, label]) => {
            const selected = configTab === id;
            return (
              <button
                key={id}
                id={`builder-config-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls="builder-config-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setConfigTab(id)}
                className={`pb-2 text-sm font-bold whitespace-nowrap ${selected ? 'text-builder-blue border-b-2 border-builder-blue' : 'text-builder-ink-muted'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div
          id="builder-config-tabpanel"
          role="tabpanel"
          aria-labelledby={`builder-config-tab-${configTab}`}
          className="flex-1 overflow-y-auto p-6"
        >
          {configTab === 'subjects' ? (
            <SubjectManager />
          ) : configTab === 'generation' ? (
            <GenerationSettings />
          ) : configTab === 'templates' ? (
            <TemplateManager />
          ) : configTab === 'combined' ? (
            <CombinedGroupSettings />
          ) : configTab === 'colors' ? (
            <SubjectColorSettings />
          ) : configTab === 'absence-ng' ? (
            <AbsenceNgPanel onCloseModal={onClose} />
          ) : configTab === 'availability' ? (
            <AvailabilityPanel />
          ) : configTab === 'classes' ? (
            <ClassPriority />
          ) : (
            <>
              <div className="mb-6 p-4 bg-builder-info-soft border border-builder-info-border rounded">
                <label htmlFor="builder-project-name" className="block text-sm font-bold text-builder-ink mb-1">プロジェクト名</label>
                <input
                  id="builder-project-name"
                  className="w-full border border-builder-border rounded px-3 py-2 text-sm focus:outline-none focus:border-builder-blue"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  onBlur={handleProjectNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  placeholder={nameExample}
                />
                {project.createdAt && (
                  <div className="mt-2 text-xs text-builder-ink-muted">
                    作成日: {new Date(project.createdAt).toLocaleDateString('ja-JP')}
                    {project.updatedAt && <> / 更新日: {new Date(project.updatedAt).toLocaleDateString('ja-JP')}</>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-builder-ink-muted">
                  <button
                    type="button"
                    onClick={handleRebuildClick}
                    className="px-2 py-1 text-xs font-bold rounded border border-builder-border bg-builder-surface text-builder-ink hover:bg-builder-surface-alt"
                  >🔄 次の{seasonLabel}用に作り直す…</button>
                  <span>講師・学年タブ・科目・時限を残して、日付と時間割を空にします (毎年同じ季節の時間割を使い回すとき)</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <BasicSettings />
                <TeacherManager />
              </div>
            </>
          )}
          <div className="mt-6 border-t border-builder-border pt-4 text-right">
            <button onClick={handleResetClick} className="text-xs text-builder-red hover:underline">⚠️ {seasonLabel}のデータをリセット</button>
          </div>
        </div>
      </div>
    </div>
  );
}
