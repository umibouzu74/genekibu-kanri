import { useProjectContext } from '../../contexts/projectContextValue';

export default function ClassPriority() {
  const {
    project,
    currentConfig,
    toggleTeacherClassPriority,
  } = useProjectContext();

  return (
    <div className="overflow-x-auto">
      <div className="bg-builder-info-soft p-3 mb-4 rounded text-sm text-builder-ink border border-builder-info-border">
        <strong>クラス優先度設定:</strong> クリックして切り替えます。<br />
        ⚪ <strong>白(普通):</strong> 空いていれば入る<br />
        🔵 <strong>青(優先):</strong> 可能な限りここに入る (自動作成で優先)<br />
        🔴 <strong>赤(NG):</strong> 自動作成では絶対に入らない
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-builder-border p-2 bg-builder-bg min-w-[100px] sticky left-0 z-10 text-builder-ink">講師名</th>
            {currentConfig.classes.map(c => <th key={c.id} className="border border-builder-border p-2 bg-builder-bg min-w-[100px] text-center text-builder-ink">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {project.teachers.map((t, idx) => (
            <tr key={t.name}>
              <td className="border border-builder-border p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
              {currentConfig.classes.map(c => {
                const isNg = t.ngClasses?.includes(c.label);
                const isPri = t.priorityClasses?.includes(c.label);
                return (
                  <td
                    key={c.id}
                    onClick={() => toggleTeacherClassPriority(idx, c.label)}
                    className={`border border-builder-border p-2 text-center cursor-pointer transition-colors hover:opacity-80 ${isPri ? "bg-builder-blue text-white font-bold" : (isNg ? "bg-builder-red text-white font-bold" : "bg-builder-surface text-builder-ink-muted")}`}
                  >
                    {isPri ? "優先" : (isNg ? "NG" : "-")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
