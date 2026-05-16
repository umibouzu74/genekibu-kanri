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
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">📚 科目マスタ (全タブ共通)</h3>
        <button onClick={handleAddClick} className="text-xs bg-builder-primary text-white px-2 py-1 rounded shadow hover:bg-builder-primary-hover">+ 追加</button>
      </div>
      <div className="text-xs text-builder-ink-muted bg-builder-surface-alt p-2 rounded border border-builder-border">
        科目の追加・削除・並び替えができます。必要コマ数はタブごとに設定されます。
      </div>
      <div className="space-y-1">
        {commonSubjects.map((s, idx) => (
          <div key={s} className="flex items-center gap-2 bg-builder-surface border border-builder-border rounded p-2">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="text-[10px] text-builder-ink-ghost hover:text-builder-ink disabled:opacity-20 leading-none"
              >▲</button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === commonSubjects.length - 1}
                className="text-[10px] text-builder-ink-ghost hover:text-builder-ink disabled:opacity-20 leading-none"
              >▼</button>
            </div>
            <span className="font-bold text-sm flex-1 text-builder-ink">{s}</span>
            <div className="flex items-center gap-1">
              <label className="text-xs text-builder-ink-muted">コマ数:</label>
              <input
                type="number"
                className="w-14 text-right text-sm border border-builder-border rounded px-1 py-0.5"
                value={currentConfig.subjectCounts[s] || 0}
                onChange={(e) => handleSubjectCountChange(s, e.target.value)}
                min={0}
              />
            </div>
            <button
              onClick={() => handleRemoveClick(s)}
              className="text-builder-ink-ghost hover:text-builder-red text-sm px-1"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
