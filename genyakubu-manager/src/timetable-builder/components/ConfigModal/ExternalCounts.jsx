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
      <div className="bg-builder-warning-soft p-3 mb-4 rounded text-sm text-builder-orange border border-builder-warning-border">
        <strong>他学年・午前のコマ数登録:</strong><br />
        ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-builder-border p-2 bg-builder-bg min-w-[100px] sticky left-0 z-10 text-builder-ink">講師名</th>
            {currentConfig.dates.map(d => <th key={d.id} className="border border-builder-border p-2 bg-builder-bg min-w-[60px] text-center text-builder-ink">{d.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {project.teachers.map(t => (
            <tr key={t.name}>
              <td className="border border-builder-border p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
              {currentConfig.dates.map(d => (
                <td key={d.id} className="border border-builder-border p-0">
                  <input
                    type="number"
                    min="0"
                    className="w-full h-full p-2 text-center focus:bg-builder-info-soft focus:outline-none text-builder-ink"
                    value={project.externalCounts?.[makeExternalKey(d.label, t.name)] || ""}
                    placeholder="-"
                    onChange={(e) => handleExternalCountChange(d.label, t.name, e.target.value)}
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
