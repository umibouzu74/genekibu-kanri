import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { decodeCsvBytes } from '../../utils/csvImport';
import { downloadCsvFile } from '../../utils/csvTemplates';
import { buildSessionCsvTemplate, parseSessionCsv } from '../../utils/sessionCsvImport';

const PLACEHOLDER = `講師,日付,開始,終了,メモ
半田,12/25・26・28,9:00,10:10,予備校１限
滝澤・武下,12/25〜12/28,12:25,13:35,予備校３限 理科基礎`;

// reducer (addExternalSessions) と同じ内容キー。登録済みの分を数える
const contentKey = (s: { date: string; teacherName: string; label?: string; memo?: string; startTime?: string; endTime?: string }) =>
  JSON.stringify([s.date, s.teacherName, s.label || '', s.memo || '', s.startTime || '', s.endTime || '']);

// 他学年セッションの表での一括登録 (2026-10-27)。パンフレットの担当表を
// 「講師,日付,開始,終了,メモ」の表にして貼り付け (Excel からのコピーでも可)、
// まとめて他学年セッションにする。時刻と時限が重なれば自動NG になる。
// 形式の決まりは utils/sessionCsvImport。
export default function SessionCsvImport() {
  const { project, addExternalSessions } = useProjectContext();
  const { showToast } = useUI();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const teacherNames = useMemo(() => (project.teachers || []).map(t => t.name), [project.teachers]);
  const poolDates = useMemo(() => project.dates || [], [project.dates]);
  const parsed = useMemo(
    () => (csvText.trim() ? parseSessionCsv(csvText, { teacherNames, poolDates }) : null),
    [csvText, teacherNames, poolDates],
  );

  const items = useMemo(() => (parsed?.rows || []).map(r => ({
    date: r.date,
    teacherName: r.teacherName,
    label: r.startTime ? (r.endTime ? `${r.startTime}-${r.endTime}` : r.startTime) : '',
    memo: r.memo,
    startTime: r.startTime,
    endTime: r.endTime,
  })), [parsed]);
  const existingKeys = useMemo(
    () => new Set((project.externalSessions || []).map(contentKey)),
    [project.externalSessions],
  );
  const newCount = items.filter(it => !existingKeys.has(contentKey(it))).length;
  const teacherCount = new Set(items.map(it => it.teacherName)).size;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { text, encoding } = decodeCsvBytes(await file.arrayBuffer());
      setCsvText(text);
      showToast(
        encoding === 'shift_jis'
          ? `「${file.name || 'ファイル'}」を読み込みました (Shift-JIS として解釈)`
          : `「${file.name || 'ファイル'}」を読み込みました`,
        'success',
        2000,
      );
    } catch {
      showToast('ファイルの読み込みに失敗しました', 'error', 3000);
    }
  };

  const close = () => { setOpen(false); setCsvText(''); };

  const handleImport = () => {
    if (newCount === 0) {
      showToast('すべて登録済みの内容だったため追加しませんでした', 'warning', 3000);
      return;
    }
    addExternalSessions(items);
    const skipped = items.length - newCount;
    showToast(
      `他学年セッション ${newCount} 件を登録しました` + (skipped > 0 ? ` (登録済み ${skipped} 件はスキップ)` : ''),
      'success',
      4000,
    );
    close();
  };

  return (
    <div className="border border-builder-border rounded bg-builder-surface-alt">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-builder-ink hover:bg-builder-surface"
      >
        <span>📥 他学年セッションを表で一括登録 (講師・日付・時刻)</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-builder-border p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-builder-ink-muted space-y-0.5">
              <div>
                見出しは <code>講師,日付,開始,終了,メモ</code> (列の順は自由。Excel の表をコピーして貼り付けてもかまいません)。
              </div>
              <div>
                講師は「・」で何人でも、日付は「12/25・26・28」「12/25〜12/28」のように並べられます。日付は日付プールにある日だけ入ります。
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => downloadCsvFile('他学年セッション雛形.csv', buildSessionCsvTemplate(teacherNames, poolDates.map(d => d.label)))}
                className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt whitespace-nowrap"
                title="今の講師・日付を埋めた見出し付きの雛形 CSV をダウンロードします"
              >⬇ 雛形CSV</button>
              <label className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface cursor-pointer whitespace-nowrap">
                📂 ファイルを選択
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  className="hidden"
                  aria-label="他学年セッションの CSV ファイルを選択"
                  onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
          </div>
          <textarea
            aria-label="他学年セッションの表 (CSV)"
            className={`w-full h-32 border rounded p-2 text-xs font-mono focus:outline-none focus:border-builder-blue bg-builder-surface transition-colors ${isDragging ? 'border-builder-blue border-2 bg-builder-info-soft' : 'border-builder-border'}`}
            placeholder={`${PLACEHOLDER}\n\n（CSV ファイルをここにドラッグ&ドロップでも読み込めます）`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); readFile(e.dataTransfer?.files?.[0]); }}
          />
          {parsed && (
            <div className="text-xs space-y-1" role="status">
              <div>
                <span className="font-bold text-builder-green">{items.length} 件</span>
                {items.length > 0 && <> ({teacherCount} 名)</>}
                {items.length > 0 && newCount < items.length && <> — うち登録済み {items.length - newCount} 件</>}
                {parsed.errors.length > 0 && (
                  <> / <span className="font-bold text-builder-red">{parsed.errors.length} 行</span> 読めません</>
                )}
              </div>
              {parsed.unknownTeachers.length > 0 && (
                <div>講師マスタに無い名前 (登録しません): <span className="text-builder-red">{parsed.unknownTeachers.join('、')}</span></div>
              )}
              {parsed.unknownDates.length > 0 && (
                <div>日付プールに無い日付 (登録しません): <span className="text-builder-red">{parsed.unknownDates.join('、')}</span></div>
              )}
              {parsed.untimedCount > 0 && (
                <div className="text-builder-orange">時刻の無い行が {parsed.untimedCount} 行あります (登録はしますが、自動NG にはなりません)</div>
              )}
              {parsed.errors.length > 0 && (
                <ul className="text-builder-red pl-3 list-disc">
                  {parsed.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.line} 行目: {e.message}</li>
                  ))}
                  {parsed.errors.length > 5 && <li className="italic">他 {parsed.errors.length - 5} 件</li>}
                </ul>
              )}
              {items.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-builder-border rounded bg-builder-surface">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-builder-bg text-builder-ink">
                        <th className="border-b border-builder-border px-1 py-0.5 text-left">講師</th>
                        <th className="border-b border-builder-border px-1 py-0.5 text-left">日付</th>
                        <th className="border-b border-builder-border px-1 py-0.5 text-left">時刻</th>
                        <th className="border-b border-builder-border px-1 py-0.5 text-left">メモ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 50).map((it, i) => (
                        <tr key={i} className={existingKeys.has(contentKey(it)) ? 'text-builder-ink-muted' : 'text-builder-ink'}>
                          <td className="px-1 py-0.5">{it.teacherName}</td>
                          <td className="px-1 py-0.5">{it.date}</td>
                          <td className="px-1 py-0.5">{it.startTime ? `${it.startTime}〜${it.endTime || ''}` : '-'}</td>
                          <td className="px-1 py-0.5">
                            {it.memo || '-'}
                            {existingKeys.has(contentKey(it)) && <span className="ml-1">(登録済み)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {items.length > 50 && <div className="px-1 py-0.5 text-[11px] italic text-builder-ink-muted">他 {items.length - 50} 件</div>}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="text-xs px-3 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface"
            >キャンセル</button>
            <button
              type="button"
              onClick={handleImport}
              disabled={items.length === 0}
              className="text-xs px-3 py-1 bg-builder-blue text-white rounded font-bold disabled:opacity-30 hover:bg-builder-blue-hover"
            >他学年セッションを追加{newCount > 0 ? ` (${newCount} 件)` : ''}</button>
          </div>
        </div>
      )}
    </div>
  );
}
