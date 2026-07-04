import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { parseNgCsv, decodeCsvBytes } from '../../utils/csvImport';
import { buildNgCsvTemplate, downloadCsvFile } from '../../utils/csvTemplates';

const NG_CSV_PLACEHOLDER = `name,date,period
田中,12/25,1限
田中,12/25,2限
未定,12/26,3限`;

/**
 * NG 日時 CSV の一括取り込みパネル (E2a)。AbsenceNgPanel に同梱する。
 * - ヘッダ: name(または teacher), date, period
 * - date / period は config の日付・時限ラベルと一致させる (NG はラベルベース)
 * - paste / ファイル選択 / ドラッグ&ドロップ に対応 (講師マスタ CSV と同設計)
 */
export default function NgCsvImport() {
  const { project, importNgSlots } = useProjectContext();
  const { showToast } = useUI();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const teacherNames = useMemo(() => (project.teachers || []).map(t => t.name), [project.teachers]);

  // 日付・時限プールのラベル。NG キーはラベルベースでタブ横断なので、
  // プールに無いラベルだけを「未登録」warning にする。
  // v4 で dates / periods は project レベルへ昇格済み (tab.config には無い)。
  // 旧実装は tab.config.dates/periods を集めていたため集合が常に空になり、
  // 未登録ラベル検出 (parseNgCsv は known が空だと判定スキップ) が silent に
  // 無効化されていた — typo の NG が「N 件追加しました」のまま効かない。
  const { knownDates, knownPeriods } = useMemo(() => ({
    knownDates: (project.dates || []).map(d => d.label),
    knownPeriods: (project.periods || []).map(p => p.label),
  }), [project.dates, project.periods]);

  const parsed = useMemo(
    () => csvText.trim() ? parseNgCsv(csvText, { teacherNames, knownDates, knownPeriods }) : null,
    [csvText, teacherNames, knownDates, knownPeriods],
  );

  const readCsvFile = async (file) => {
    if (!file) return;
    const name = file.name || '';
    const looksCsv = /\.csv$/i.test(name) || ['text/csv', 'text/plain', 'application/vnd.ms-excel', ''].includes(file.type);
    if (!looksCsv) {
      showToast('CSV (.csv) ファイルを選択してください', 'error', 3000);
      return;
    }
    try {
      // N1j: UTF-8 固定 (file.text()) だと日本語 Excel 既定の Shift-JIS CSV が
      // 文字化けして全行「未登録」warning になる。バイト列から判定して読む。
      const { text, encoding } = decodeCsvBytes(await file.arrayBuffer());
      setCsvText(text);
      showToast(
        encoding === 'shift_jis'
          ? `「${name || 'ファイル'}」を読み込みました (Shift-JIS として解釈)`
          : `「${name || 'ファイル'}」を読み込みました`,
        'success',
        2000,
      );
    } catch {
      showToast('ファイルの読み込みに失敗しました', 'error', 3000);
    }
  };

  const handleFileInputChange = (e) => {
    readCsvFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    readCsvFile(e.dataTransfer?.files?.[0]);
  };

  const handleImport = () => {
    if (!parsed || parsed.rows.length === 0) return;
    // 既存講師に一致する行のみ反映される。未登録講師は reducer 側で skip。
    const applicable = parsed.rows.filter(r => teacherNames.includes(r.name));
    if (applicable.length === 0) {
      showToast('CSV の name がどの登録講師とも一致しませんでした', 'warning', 4000);
      return;
    }
    importNgSlots(applicable);
    showToast(`${applicable.length} 件の NG を追加しました`, 'success', 4000);
    setOpen(false);
    setCsvText('');
  };

  return (
    <div className="border border-builder-border rounded bg-builder-surface-alt">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-builder-ink hover:bg-builder-surface"
      >
        <span>📥 NG 日時を CSV で一括登録</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-builder-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-builder-ink-muted">
              ヘッダ行は <code>name,date,period</code>。<code>date</code> / <code>period</code> は
              設定済みの日付・時限ラベルと一致させてください。
            </div>
            {/* L4f: 現在の講師・日付・時限ラベルを埋めた雛形 */}
            <button
              type="button"
              onClick={() => downloadCsvFile('NG日時雛形.csv', buildNgCsvTemplate(teacherNames, knownDates, knownPeriods))}
              className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt whitespace-nowrap"
              title="現在の講師・日付・時限ラベルを埋めたヘッダ付きの雛形 CSV をダウンロードします"
            >⬇ 雛形CSV</button>
            <label className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface cursor-pointer whitespace-nowrap">
              📂 ファイルを選択
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                aria-label="NG CSV ファイルを選択"
                onChange={handleFileInputChange}
              />
            </label>
          </div>
          <textarea
            aria-label="NG 日時 CSV テキスト"
            className={`w-full h-28 border rounded p-2 text-xs font-mono focus:outline-none focus:border-builder-blue bg-builder-surface transition-colors ${isDragging ? 'border-builder-blue border-2 bg-builder-info-soft' : 'border-builder-border'}`}
            placeholder={`${NG_CSV_PLACEHOLDER}\n\n（CSV ファイルをここにドラッグ&ドロップでも読み込めます）`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          />
          {parsed && (
            <div className="text-xs space-y-1">
              <div>
                <span className="font-bold text-builder-green">{parsed.rows.length} 件</span> parse 成功
                {parsed.errors.length > 0 && (
                  <> / <span className="font-bold text-builder-red">{parsed.errors.length} 件</span> エラー</>
                )}
              </div>
              {parsed.unknownTeachers.length > 0 && (
                <div>未登録の講師 (skip): <span className="text-builder-red">{parsed.unknownTeachers.join(', ')}</span></div>
              )}
              {parsed.unknownDates.length > 0 && (
                <div>未登録の日付ラベル: <span className="text-builder-red">{parsed.unknownDates.join(', ')}</span></div>
              )}
              {parsed.unknownPeriods.length > 0 && (
                <div>未登録の時限ラベル: <span className="text-builder-red">{parsed.unknownPeriods.join(', ')}</span></div>
              )}
              {parsed.errors.length > 0 && (
                <ul className="text-builder-red pl-3 list-disc">
                  {parsed.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.line} 行目: {e.message}</li>
                  ))}
                  {parsed.errors.length > 5 && <li className="italic">他 {parsed.errors.length - 5} 件</li>}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setCsvText(''); }}
              className="text-xs px-3 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface"
            >キャンセル</button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!parsed || parsed.rows.length === 0}
              className="text-xs px-3 py-1 bg-builder-blue text-white rounded font-bold disabled:opacity-30 hover:bg-builder-blue-hover"
            >NG を追加</button>
          </div>
        </div>
      )}
    </div>
  );
}
