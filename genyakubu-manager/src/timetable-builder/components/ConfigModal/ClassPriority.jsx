import { Fragment, useMemo } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { groupTeachersBySubject } from '../../utils/groupTeachersBySubject';

export default function ClassPriority() {
  const {
    project,
    currentConfig,
    toggleTeacherClassPriority,
  } = useProjectContext();

  const teacherIdxByName = useMemo(() => {
    const m = new Map();
    project.teachers.forEach((t, i) => m.set(t.name, i));
    return m;
  }, [project.teachers]);
  const teacherGroups = useMemo(
    () => groupTeachersBySubject(project.teachers, project.subjects),
    [project.teachers, project.subjects],
  );

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
          {teacherGroups.map(group => (
            <Fragment key={group.label}>
              <tr className="bg-builder-bg">
                <td
                  colSpan={1 + currentConfig.classes.length}
                  className="border border-builder-border px-2 py-1 text-[11px] font-bold text-builder-ink-muted sticky left-0 z-10"
                >
                  ━━ {group.label} ━━
                </td>
              </tr>
              {group.teachers.map(t => {
                const idx = teacherIdxByName.get(t.name);
                return (
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
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
