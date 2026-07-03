import { useEffect, useMemo, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { useDismissablePopover } from '../hooks/useDismissablePopover';
import { measureLocalStorageBytes, formatBytes, STORAGE_LIMIT_BYTES, STORAGE_WARN_RATIO } from '../utils/storageHealth';

// N1b: 保存ステータスバッジの状態別スタイル。以前は成功色 (緑) 固定で、
// 「⚠️ 保存失敗」まで緑地に描画され失敗が成功に見えていた。
const SAVE_STATUS_CLASSES: Record<string, string> = {
  '⚠️ 保存失敗': 'text-builder-red bg-builder-danger-soft border-builder-danger-border font-bold',
  '💾 保存中...': 'text-builder-ink-muted bg-builder-bg border-builder-border',
};
const SAVE_STATUS_DEFAULT_CLASSES = 'text-builder-green bg-builder-success-soft border-builder-success-border';

// exceljs はバンドルが大きい (gzip 後 ~270kB) ので、Excel 出力ボタンを
// 押した時にだけロードする。初回クリックの体感は数百ms 遅れるが、起動時には
// ロードしない方が大きい。
const loadExcelExport = () => import('../utils/excelExport');

export default function Header() {
  const {
    project,
    saveStatus,
    fileInputRef,
    handleSaveJson,
    handleLoadJson,
    updateProjectName,
  } = useProjectContext();
  const { showToast, showConfirm } = useUI();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(project.name || "");
  // null | 'all' | 'teacher'。Excel 出力ボタンの多重押下を防ぐ。
  const [exportingType, setExportingType] = useState(null);
  // Excel 出力ドロップダウン (E1a: 狭画面でヘッダのボタンを減らす)
  // 開閉と外側クリック / Escape での dismiss は共有フック (F2l)。
  const { open: excelMenuOpen, setOpen: setExcelMenuOpen, ref: excelMenuRef } = useDismissablePopover();

  // N5c: 保存データ量の常時可視化。従来は起動時 1 回の警告 toast のみで、
  // 閉じたら容量の手がかりがゼロだった。保存が走る (saveStatus が変わる)
  // たびに再計測する。origin 全体 (親アプリ含む) の実測 (N1g と同じ物差し)。
  // saveStatus は再計測のトリガとして意図的に deps に入れている
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const storageBytes = useMemo(() => measureLocalStorageBytes(), [saveStatus]);
  const storageWarn = storageBytes != null && storageBytes / STORAGE_LIMIT_BYTES >= STORAGE_WARN_RATIO;

  // N1b: autosave 失敗 (QuotaExceeded / private mode 等) はデータ喪失に直結
  // するのに、以前はバッジの文言が変わるだけで最も静かに失敗する経路だった。
  // 失敗への遷移時に error toast で明示する (容量警告 E6c と同格の扱い)。
  const isSaveError = saveStatus === '⚠️ 保存失敗';
  useEffect(() => {
    if (isSaveError) {
      showToast(
        '自動保存に失敗しました。ブラウザの保存領域が不足している可能性があります。変更を失わないよう、💾 プロジェクト保存 (JSON) でバックアップしてください。',
        'error',
        10000,
      );
    }
  }, [isSaveError, showToast]);

  const handleNameSubmit = () => {
    // 変更が無ければ dispatch しない (無駄な Undo 履歴 + autosave を防ぐ)
    const trimmed = nameInput.trim();
    if (trimmed !== (project.name || '')) {
      updateProjectName(trimmed);
    }
    setIsEditingName(false);
  };

  // Excel 出力ボタンの共通ハンドラ。
  //   1. 動的 import の失敗と Excel 生成の失敗を文言で区別
  //   2. 進行中はボタンを disabled + スピナー表示
  //   3. catch では console.error も残してデバッグ可能に
  //   4. exceljs ベースで download* は async なので await する
  const handleExport = async (type) => {
    setExcelMenuOpen(false);
    setExportingType(type);
    let mod;
    try {
      mod = await loadExcelExport();
    } catch (err) {
      console.error('Excel module load failed', err);
      showToast('Excel出力ライブラリの読み込みに失敗しました', 'error');
      setExportingType(null);
      return;
    }
    try {
      if (type === 'all') {
        await mod.downloadScheduleExcel(project);
        showToast('全体Excelをダウンロードしました');
      } else if (type === 'clean') {
        // L5c: 稼働カウント・⚠NG 抜きの配布用 (生徒掲示・保護者向け)
        await mod.downloadScheduleExcel(project, { clean: true });
        showToast('配布用Excelをダウンロードしました');
      } else {
        await mod.downloadTeacherExcel(project);
        showToast('個人別Excelをダウンロードしました');
      }
    } catch (err) {
      console.error('Excel generate failed', err);
      showToast('Excelファイルの生成に失敗しました', 'error');
    } finally {
      setExportingType(null);
    }
  };

  const displayName = project.name || "無題のプロジェクト";

  return (
    <div className="flex justify-between items-center mb-2 no-print bg-builder-surface p-3 rounded shadow-sm border-b border-builder-border">
      <div className="flex items-center gap-2">
        <span className="text-xl">📅</span>
        {isEditingName ? (
          <input
            autoFocus
            className="text-xl font-bold text-builder-ink border-b-2 border-builder-blue outline-none bg-transparent px-1"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); if (e.key === 'Escape') { setNameInput(project.name || ""); setIsEditingName(false); } }}
            placeholder="プロジェクト名を入力"
          />
        ) : (
          <h1
            className="text-xl font-bold text-builder-ink cursor-pointer hover:text-builder-blue hover:underline"
            onClick={() => { setNameInput(project.name || ""); setIsEditingName(true); }}
            title="クリックで名前を変更"
          >
            {displayName}
          </h1>
        )}
        <span
          role="status"
          aria-live="polite"
          className={`text-xs px-2 py-1 rounded border ${SAVE_STATUS_CLASSES[saveStatus] || SAVE_STATUS_DEFAULT_CLASSES}`}
        >{saveStatus}</span>
        {storageBytes != null && (
          <span
            className={`text-[10px] ${storageWarn ? 'text-builder-orange font-bold' : 'text-builder-ink-ghost'}`}
            title={`このブラウザの保存領域の使用量 (概算、時間割以外のデータ含む)。上限は約 ${formatBytes(STORAGE_LIMIT_BYTES)} で、超えると自動保存が失敗します。`}
          >
            {storageWarn ? '⚠ ' : ''}{formatBytes(storageBytes)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={handleSaveJson} className="flex items-center gap-1 px-3 py-1.5 bg-builder-blue text-white rounded hover:bg-builder-blue-hover shadow text-sm font-bold" title="プロジェクトをJSONファイルとして保存">💾 プロジェクト保存</button>
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 px-3 py-1.5 bg-builder-green text-white rounded hover:bg-builder-green-hover shadow text-sm font-bold" title="JSONファイルからプロジェクトを開く">📂 開く</button>
        <div className="relative" ref={excelMenuRef}>
          <button
            onClick={() => setExcelMenuOpen((v) => !v)}
            disabled={exportingType !== null}
            aria-haspopup="menu"
            aria-expanded={excelMenuOpen}
            className="flex items-center gap-1 px-3 py-1.5 bg-builder-primary text-white rounded hover:bg-builder-primary-hover shadow text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
            title="Excel 出力メニューを開く"
          >
            {exportingType !== null ? '⏳ 出力中...' : '📊 Excel出力'}
            <span aria-hidden="true" className="text-[10px]">▾</span>
          </button>
          {excelMenuOpen && (
            <div role="menu" className="absolute z-50 top-full right-0 mt-1 w-44 bg-builder-surface border border-builder-border rounded shadow-lg py-1 text-builder-ink">
              <button
                role="menuitem"
                onClick={() => handleExport('all')}
                className="w-full text-left px-3 py-2 text-sm hover:bg-builder-surface-alt"
                title="全タブのスケジュールをExcel出力"
              >📊 全体スケジュール</button>
              <button
                role="menuitem"
                onClick={() => handleExport('clean')}
                className="w-full text-left px-3 py-2 text-sm hover:bg-builder-surface-alt"
                title="稼働カウントやNGマークを省いた、生徒掲示・保護者配布向けのExcel出力"
              >🎒 配布用 (注記なし)</button>
              <button
                role="menuitem"
                onClick={() => handleExport('teacher')}
                className="w-full text-left px-3 py-2 text-sm hover:bg-builder-surface-alt"
                title="講師別スケジュールをExcel出力"
              >👤 講師別スケジュール</button>
            </div>
          )}
        </div>
        <input type="file" accept=".json" ref={fileInputRef} onChange={(e) => handleLoadJson(e, showToast, showConfirm)} className="hidden" />
      </div>
    </div>
  );
}
