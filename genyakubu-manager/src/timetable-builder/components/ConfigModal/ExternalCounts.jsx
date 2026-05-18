import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeExternalKey } from '../../utils/scheduleKey';

export default function ExternalCounts() {
  const {
    project,
    currentConfig,
    handleExternalCountChange,
    addExternalSession,
    removeExternalSession,
  } = useProjectContext();

  // 詳細セッション追加フォームの state
  const [formDate, setFormDate] = useState(currentConfig.dates[0]?.label || '');
  const [formTeacher, setFormTeacher] = useState(project.teachers[0]?.name || '');
  const [formLabel, setFormLabel] = useState('');
  const [formMemo, setFormMemo] = useState('');

  // project.externalSessions が undefined の場合に新しい [] を都度作って
  // 子の useMemo を毎回 invalidate しないよう、ここで memoize する。
  const sessions = useMemo(
    () => project.externalSessions || [],
    [project.externalSessions],
  );

  // (date, teacher) ごとの詳細セッション件数。グリッド render のたびに
  // 再計算する必要はないので sessions が変わった時だけ作り直す。
  const sessionCountMap = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      const k = makeExternalKey(s.date, s.teacherName);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [sessions]);

  const handleAdd = () => {
    if (!formDate || !formTeacher) return;
    addExternalSession(formDate, formTeacher, formLabel.trim(), formMemo.trim());
    setFormLabel('');
    setFormMemo('');
  };

  return (
    <div>
      <div className="bg-builder-warning-soft p-3 mb-4 rounded text-sm text-builder-orange border border-builder-warning-border">
        <strong>他学年・午前のコマ数登録:</strong><br />
        ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。<br />
        詳細セッションを登録すると、その件数が数値より優先して採用されます。
      </div>

      {/* 既存グリッド (クイック入力) */}
      <div className="overflow-x-auto mb-6">
        <div className="text-xs text-builder-ink-muted mb-1">
          クイック入力 (数字のみ・詳細セッションがあるセルは件数表示)
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
                {currentConfig.dates.map(d => {
                  const k = makeExternalKey(d.label, t.name);
                  const sessionCnt = sessionCountMap[k];
                  if (sessionCnt) {
                    return (
                      <td key={d.id} className="border border-builder-border p-2 text-center bg-builder-info-soft text-builder-ink"
                        title="詳細セッション登録あり (下の一覧で編集)">
                        {sessionCnt}
                      </td>
                    );
                  }
                  return (
                    <td key={d.id} className="border border-builder-border p-0">
                      <input
                        type="number"
                        min="0"
                        className="w-full h-full p-2 text-center focus:bg-builder-info-soft focus:outline-none text-builder-ink"
                        value={project.externalCounts?.[k] || ""}
                        placeholder="-"
                        onChange={(e) => handleExternalCountChange(d.label, t.name, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 詳細セッション登録 */}
      <div className="border border-builder-border rounded p-3 bg-builder-surface-alt">
        <div className="font-bold text-builder-ink mb-2">詳細セッション登録 (高校・予備校など)</div>
        <div className="text-xs text-builder-ink-muted mb-3">
          1 件ずつ「日付 / 講師 / ラベル (時限や時刻) / メモ」を登録。
          後で何の予定で空けたかが確認できます。
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">日付</span>
            <select
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="border border-builder-border rounded px-2 py-1 bg-builder-surface text-builder-ink"
            >
              {currentConfig.dates.map(d => (
                <option key={d.id} value={d.label}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">講師</span>
            <select
              value={formTeacher}
              onChange={(e) => setFormTeacher(e.target.value)}
              className="border border-builder-border rounded px-2 py-1 bg-builder-surface text-builder-ink"
            >
              {project.teachers.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">ラベル</span>
            <input
              type="text"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="1限 / 13:00-14:30 等"
              className="border border-builder-border rounded px-2 py-1 bg-builder-surface text-builder-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">メモ</span>
            <input
              type="text"
              value={formMemo}
              onChange={(e) => setFormMemo(e.target.value)}
              placeholder="予備校 / 高2 英語 等"
              className="border border-builder-border rounded px-2 py-1 bg-builder-surface text-builder-ink"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!formDate || !formTeacher}
              className="w-full px-3 py-1 bg-builder-primary text-white rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              追加
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-xs text-builder-ink-muted italic py-2">
            まだセッションが登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">日付</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">講師</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">ラベル</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">メモ</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.date}</td>
                    <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.teacherName}</td>
                    <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.label}</td>
                    <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.memo}</td>
                    <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-center">
                      <button
                        type="button"
                        onClick={() => removeExternalSession(s.id)}
                        aria-label={`${s.date} ${s.teacherName} のセッションを削除`}
                        className="text-builder-red hover:text-red-700 font-bold"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
