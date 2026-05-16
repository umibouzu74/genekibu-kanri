import React, { useState } from 'react';
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
        className="w-full border border-blue-400 rounded px-1.5 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
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
      className="cursor-pointer hover:text-blue-600 hover:underline"
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
    <div className="border-l pl-6 space-y-4">
      <div className="flex justify-between items-center border-b pb-1">
        <h3 className="font-bold text-green-800">👤 講師マスタ (全タブ共通)</h3>
        <button onClick={handleAddClick} className="text-xs bg-green-600 text-white px-2 py-1 rounded shadow">+ 追加</button>
      </div>
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border">氏名をクリックすると名前を変更できます。スケジュールの講師名も自動更新されます。</div>
      <div className="overflow-y-auto max-h-[400px] border rounded bg-gray-50 p-2">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-1">氏名</th>
              <th className="text-left p-1">担当科目</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {project.teachers.map((t, i) => (
              <tr key={i} className="border-b bg-white last:border-0">
                <td className="p-2 font-bold">
                  <InlineNameEdit value={t.name} onSave={(newName) => renameTeacher(i, newName)} />
                </td>
                <td className="p-2 flex flex-wrap gap-1">
                  {commonSubjects.map(s => (
                    <label key={s} className={`px-2 py-0.5 border rounded cursor-pointer text-xs select-none transition-colors ${t.subjects.includes(s) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-200"}`}>
                      <input type="checkbox" className="hidden" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} />
                      {s}
                    </label>
                  ))}
                </td>
                <td className="p-2 text-center">
                  <button onClick={() => handleRemoveClick(i)} className="text-gray-400 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
