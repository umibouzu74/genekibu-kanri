import React from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeExternalKey } from '../../utils/scheduleKey';

export default function ExternalCounts() {
  const {
    project,
    currentConfig,
    handleExternalCountChange,
  } = useProjectContext();

  return (
    <div className="overflow-x-auto">
      <div className="bg-yellow-50 p-3 mb-4 rounded text-sm text-yellow-800 border border-yellow-200">
        <strong>他学年・午前のコマ数登録:</strong><br />
        ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100 min-w-[100px] sticky left-0 z-10">講師名</th>
            {currentConfig.dates.map(d => <th key={d} className="border p-2 bg-gray-100 min-w-[60px] text-center">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {project.teachers.map(t => (
            <tr key={t.name}>
              <td className="border p-2 font-bold bg-gray-50 sticky left-0 z-10">{t.name}</td>
              {currentConfig.dates.map(d => (
                <td key={d} className="border p-0">
                  <input
                    type="number"
                    min="0"
                    className="w-full h-full p-2 text-center focus:bg-blue-50 focus:outline-none"
                    value={project.externalCounts?.[makeExternalKey(d, t.name)] || ""}
                    placeholder="-"
                    onChange={(e) => handleExternalCountChange(d, t.name, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
