import React from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';

export default function SubjectManager() {
  const {
    commonSubjects,
    currentConfig,
    addSubject,
    removeSubject,
    reorderSubjects,
    handleSubjectCountChange,
  } = useProjectContext();
  const { showInput, showConfirm } = useUI();

  const handleAddClick = async () => {
    const name = await showInput("科目名を入力してください", { title: "科目の追加", placeholder: "例: 情報" });
    if (name) addSubject(name);
  };

  const handleRemoveClick = async (name) => {
    const ok = await showConfirm(`「${name}」を削除しますか？\nスケジュール上のこの科目のデータと、講師の担当科目設定も削除されます。`, { title: "科目の削除", danger: true, confirmLabel: "削除" });
    if (ok) removeSubject(name);
  };

  const moveUp = (idx) => {
    if (idx > 0) reorderSubjects(idx, idx - 1);
  };

  const moveDown = (idx) => {
    if (idx < commonSubjects.length - 1) reorderSubjects(idx, idx + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b pb-1">
        <h3 className="font-bold text-purple-800">📚 科目マスタ (全タブ共通)</h3>
        <button onClick={handleAddClick} className="text-xs bg-purple-600 text-white px-2 py-1 rounded shadow">+ 追加</button>
      </div>
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border">
        科目の追加・削除・並び替えができます。必要コマ数はタブごとに設定されます。
      </div>
      <div className="space-y-1">
        {commonSubjects.map((s, idx) => (
          <div key={s} className="flex items-center gap-2 bg-white border rounded p-2">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none"
              >▲</button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === commonSubjects.length - 1}
                className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none"
              >▼</button>
            </div>
            <span className="font-bold text-sm flex-1">{s}</span>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">コマ数:</label>
              <input
                type="number"
                className="w-14 text-right text-sm border rounded px-1 py-0.5"
                value={currentConfig.subjectCounts[s] || 0}
                onChange={(e) => handleSubjectCountChange(s, e.target.value)}
                min={0}
              />
            </div>
            <button
              onClick={() => handleRemoveClick(s)}
              className="text-gray-400 hover:text-red-500 text-sm px-1"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
