import { useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';

// xlsx-js-style はバンドルが大きい (圧縮後 ~350kB) ので、Excel 出力ボタンを
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

  const handleNameSubmit = () => {
    updateProjectName(nameInput.trim());
    setIsEditingName(false);
  };

  // Excel 出力ボタンの共通ハンドラ。
  //   1. 動的 import の失敗と Excel 生成の失敗を文言で区別
  //   2. 進行中はボタンを disabled + スピナー表示
  //   3. catch では console.error も残してデバッグ可能に
  //   4. exceljs ベースで download* は async なので await する
  const handleExport = async (type) => {
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
        <span className="text-xs text-builder-green bg-builder-success-soft px-2 py-1 rounded border border-builder-success-border">{saveStatus}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSaveJson} className="flex items-center gap-1 px-3 py-1.5 bg-builder-blue text-white rounded hover:bg-builder-blue-hover shadow text-sm font-bold" title="プロジェクトをJSONファイルとして保存">💾 プロジェクト保存</button>
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 px-3 py-1.5 bg-builder-green text-white rounded hover:bg-builder-green-hover shadow text-sm font-bold" title="JSONファイルからプロジェクトを開く">📂 開く</button>
        <button
          onClick={() => handleExport('all')}
          disabled={exportingType !== null}
          className="flex items-center gap-1 px-3 py-1.5 bg-builder-primary text-white rounded hover:bg-builder-primary-hover shadow text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
          title="全タブのスケジュールをExcel出力"
        >
          {exportingType === 'all' ? '⏳ 出力中...' : '📊 全Excel'}
        </button>
        <button
          onClick={() => handleExport('teacher')}
          disabled={exportingType !== null}
          className="flex items-center gap-1 px-3 py-1.5 bg-builder-blue text-white rounded hover:bg-builder-blue-hover shadow text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
          title="講師別スケジュールをExcel出力"
        >
          {exportingType === 'teacher' ? '⏳ 出力中...' : '👤 個人Excel'}
        </button>
        <input type="file" accept=".json" ref={fileInputRef} onChange={(e) => handleLoadJson(e, showToast, showConfirm)} className="hidden" />
      </div>
    </div>
  );
}
