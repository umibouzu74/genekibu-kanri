import { useProjectContext } from '../../contexts/projectContextValue';
import { getSubjectColor, SUBJECT_COLOR_PALETTE } from '../../utils/constants';

export default function SubjectColorSettings() {
  const { project, commonSubjects, updateSubjectColor } = useProjectContext();

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-builder-ink border-b border-builder-border pb-1">🎨 科目カラー設定</h3>
      <p className="text-xs text-builder-ink-muted">科目ごとの背景色を設定できます。スケジュール表のセルに反映されます。</p>
      <div className="space-y-3">
        {commonSubjects.map(subject => {
          const currentColor = getSubjectColor(subject, project.subjectColors);
          return (
            <div key={subject} className="flex items-center gap-3 p-2 bg-builder-surface-alt rounded border border-builder-border">
              <div
                className="w-8 h-8 rounded border border-builder-border shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="font-bold text-sm w-12 text-builder-ink">{subject}</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {SUBJECT_COLOR_PALETTE.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => updateSubjectColor(subject, value)}
                    className={`w-7 h-7 rounded border-2 transition-transform hover:scale-110 ${currentColor === value ? "border-builder-ink ring-2 ring-builder-blue" : "border-builder-border"}`}
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
