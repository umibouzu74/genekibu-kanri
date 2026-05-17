import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { parseTeachersCsv } from '../../utils/csvImport';

const CSV_PLACEHOLDER = `name,subjects
堀上,英語
未定,英語|数学|国語|理科|社会
山田,数学|理科`;

function InlineNameEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full border border-builder-blue rounded px-1.5 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-builder-blue"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer hover:text-builder-blue hover:underline"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="クリックで名前を変更"
    >
      {value}
    </span>
  );
}

export default function TeacherManager() {
  const {
    project,
    commonSubjects,
    addTeacher,
    importTeachers,
    removeTeacher,
    renameTeacher,
    toggleTeacherSubject,
  } = useProjectContext();
  const { showConfirm, showInput, showToast } = useUI();
  const [csvPanelOpen, setCsvPanelOpen] = useState(false);
  const [csvText, setCsvText] = useState('');

  const handleAddClick = async () => {
    const name = await showInput("講師名を入力してください", { title: "講師の追加", placeholder: "例: 山田" });
    if (name) addTeacher(name);
  };

  const handleRemoveClick = async (i) => {
    const ok = await showConfirm(`「${project.teachers[i].name}」を削除しますか？`, { title: "講師の削除", danger: true, confirmLabel: "削除" });
    if (ok) removeTeacher(i);
  };

  // CSV preview は textarea 変更ごとに parse する (デバウンス無し / 数百行想定で十分軽量)
  const csvParsed = useMemo(
    () => csvText.trim() ? parseTeachersCsv(csvText, { commonSubjects }) : null,
    [csvText, commonSubjects],
  );

  const handleCsvImport = async (mode) => {
    if (!csvParsed || csvParsed.rows.length === 0) return;
    if (mode === 'replace') {
      const ok = await showConfirm(
        `現在の ${project.teachers.length} 件の講師を破棄して、CSV の ${csvParsed.rows.length} 件で置き換えますか？\n(NG時間・優先クラス設定もリセットされます)`,
        { title: '講師マスタを置換', danger: true, confirmLabel: '置換' },
      );
      if (!ok) return;
    }
    importTeachers(csvParsed.rows, mode);
    showToast(
      mode === 'replace'
        ? `${csvParsed.rows.length} 件の講師で置換しました`
        : `${csvParsed.rows.length} 件を追加 / 更新しました`,
      'success', 4000,
    );
    setCsvPanelOpen(false);
    setCsvText('');
  };

  return (
    <div className="border-l border-builder-border pl-6 space-y-4">
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">👤 講師マスタ (全タブ共通)</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setCsvPanelOpen((v) => !v)}
            className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt"
            aria-expanded={csvPanelOpen}
          >📥 CSV インポート</button>
          <button onClick={handleAddClick} className="text-xs bg-builder-green text-white px-2 py-1 rounded shadow hover:bg-builder-green-hover">+ 追加</button>
        </div>
      </div>
      {csvPanelOpen && (
        <div className="border border-builder-border rounded bg-builder-surface-alt p-3 space-y-2">
          <div className="text-xs text-builder-ink-muted">
            ヘッダ行は <code>name,subjects</code>。subjects は <code>|</code> 区切り (例: <code>英語|数学</code>)。
          </div>
          <textarea
            aria-label="講師マスタ CSV テキスト"
            className="w-full h-32 border border-builder-border rounded p-2 text-xs font-mono focus:outline-none focus:border-builder-blue bg-builder-surface"
            placeholder={CSV_PLACEHOLDER}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          {csvParsed && (
            <div className="text-xs space-y-1">
              <div>
                <span className="font-bold text-builder-green">{csvParsed.rows.length} 件</span> parse 成功
                {csvParsed.errors.length > 0 && (
                  <> / <span className="font-bold text-builder-red">{csvParsed.errors.length} 件</span> エラー</>
                )}
                {csvParsed.unknownSubjects.length > 0 && (
                  <> / 未登録科目: <span className="text-builder-red">{csvParsed.unknownSubjects.join(', ')}</span></>
                )}
              </div>
              {csvParsed.errors.length > 0 && (
                <ul className="text-builder-red pl-3 list-disc">
                  {csvParsed.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.line} 行目: {e.message}</li>
                  ))}
                  {csvParsed.errors.length > 5 && <li className="italic">他 {csvParsed.errors.length - 5} 件</li>}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCsvPanelOpen(false); setCsvText(''); }}
              className="text-xs px-3 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface"
            >キャンセル</button>
            <button
              onClick={() => handleCsvImport('append')}
              disabled={!csvParsed || csvParsed.rows.length === 0}
              className="text-xs px-3 py-1 bg-builder-blue text-white rounded font-bold disabled:opacity-30 hover:bg-builder-blue-hover"
            >追加 / 更新</button>
            <button
              onClick={() => handleCsvImport('replace')}
              disabled={!csvParsed || csvParsed.rows.length === 0}
              className="text-xs px-3 py-1 bg-builder-red text-white rounded font-bold disabled:opacity-30 hover:bg-builder-danger-border"
            >全置換</button>
          </div>
        </div>
      )}
      <div className="text-xs text-builder-ink-muted bg-builder-surface-alt p-2 rounded border border-builder-border">氏名をクリックすると名前を変更できます。スケジュールの講師名も自動更新されます。</div>
      <div className="overflow-y-auto max-h-[400px] border border-builder-border rounded bg-builder-bg p-2">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-1 text-builder-ink-muted">氏名</th>
              <th className="text-left p-1 text-builder-ink-muted">担当科目</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {project.teachers.map((t, i) => (
              <tr key={i} className="border-b border-builder-border bg-builder-surface last:border-0">
                <td className="p-2 font-bold text-builder-ink">
                  <InlineNameEdit value={t.name} onSave={(newName) => renameTeacher(i, newName)} />
                </td>
                <td className="p-2 flex flex-wrap gap-1">
                  {commonSubjects.map(s => (
                    <label key={s} className={`px-2 py-0.5 border rounded cursor-pointer text-xs select-none transition-colors ${t.subjects.includes(s) ? "bg-builder-blue text-white border-builder-blue" : "bg-builder-surface text-builder-ink-ghost border-builder-border"}`}>
                      <input type="checkbox" className="hidden" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} />
                      {s}
                    </label>
                  ))}
                </td>
                <td className="p-2 text-center">
                  <button onClick={() => handleRemoveClick(i)} className="text-builder-ink-ghost hover:text-builder-red">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
