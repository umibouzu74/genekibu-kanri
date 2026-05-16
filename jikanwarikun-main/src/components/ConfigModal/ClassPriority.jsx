import React from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';

export default function ClassPriority() {
  const {
    project,
    currentConfig,
    toggleTeacherClassPriority,
  } = useProjectContext();

  return (
    <div className="overflow-x-auto">
      <div className="bg-indigo-50 p-3 mb-4 rounded text-sm text-indigo-800 border border-indigo-200">
        <strong>クラス優先度設定:</strong> クリックして切り替えます。<br />
        ⚪ <strong>白(普通):</strong> 空いていれば入る<br />
        🔵 <strong>青(優先):</strong> 可能な限りここに入る (自動作成で優先)<br />
        🔴 <strong>赤(NG):</strong> 自動作成では絶対に入らない
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100 min-w-[100px] sticky left-0 z-10">講師名</th>
            {currentConfig.classes.map(c => <th key={c} className="border p-2 bg-gray-100 min-w-[100px] text-center">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {project.teachers.map((t, idx) => (
            <tr key={t.name}>
              <td className="border p-2 font-bold bg-gray-50 sticky left-0 z-10">{t.name}</td>
              {currentConfig.classes.map(c => {
                const isNg = t.ngClasses?.includes(c);
                const isPri = t.priorityClasses?.includes(c);
                return (
                  <td
                    key={c}
                    onClick={() => toggleTeacherClassPriority(idx, c)}
                    className={`border p-2 text-center cursor-pointer transition-colors hover:opacity-80 ${isPri ? "bg-blue-500 text-white font-bold" : (isNg ? "bg-red-500 text-white font-bold" : "bg-white text-gray-600")}`}
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
