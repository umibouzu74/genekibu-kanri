import React from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { getSubjectColor, SUBJECT_COLOR_PALETTE } from '../../utils/constants';

export default function SubjectColorSettings() {
  const { project, commonSubjects, updateSubjectColor } = useProjectContext();

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-blue-800 border-b pb-1">🎨 科目カラー設定</h3>
      <p className="text-xs text-gray-500">科目ごとの背景色を設定できます。スケジュール表のセルに反映されます。</p>
      <div className="space-y-3">
        {commonSubjects.map(subject => {
          const currentColor = getSubjectColor(subject, project.subjectColors);
          return (
            <div key={subject} className="flex items-center gap-3 p-2 bg-gray-50 rounded border">
              <div
                className="w-8 h-8 rounded border border-gray-300 shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="font-bold text-sm w-12">{subject}</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {SUBJECT_COLOR_PALETTE.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => updateSubjectColor(subject, value)}
                    className={`w-7 h-7 rounded border-2 transition-transform hover:scale-110 ${currentColor === value ? "border-gray-800 ring-2 ring-blue-400" : "border-gray-300"}`}
                    style={{ backgroundColor: value }}
                    title={label}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
