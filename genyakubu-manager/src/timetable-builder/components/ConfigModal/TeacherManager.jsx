import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';

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
    removeTeacher,
    renameTeacher,
    toggleTeacherSubject,
  } = useProjectContext();
  const { showConfirm, showInput } = useUI();

  const handleAddClick = async () => {
    const name = await showInput("講師名を入力してください", { title: "講師の追加", placeholder: "例: 山田" });
    if (name) addTeacher(name);
  };

  const handleRemoveClick = async (i) => {
    const ok = await showConfirm(`「${project.teachers[i].name}」を削除しますか？`, { title: "講師の削除", danger: true, confirmLabel: "削除" });
    if (ok) removeTeacher(i);
  };

  return (
    <div className="border-l border-builder-border pl-6 space-y-4">
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">👤 講師マスタ (全タブ共通)</h3>
        <button onClick={handleAddClick} className="text-xs bg-builder-green text-white px-2 py-1 rounded shadow hover:bg-builder-green-hover">+ 追加</button>
      </div>
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
