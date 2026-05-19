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

  // 詳細セッション追加フォームの state。
  // formDateIds は配列で、NG タブの時限 checkbox と同様に複数選択可能。
  const [formDateIds, setFormDateIds] = useState([]);
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

  const toggleDate = (id) => {
    setFormDateIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };
  const selectAllDates = () => setFormDateIds(currentConfig.dates.map(d => d.id));
  const clearAllDates = () => setFormDateIds([]);

  const canAdd = formDateIds.length > 0 && !!formTeacher;

  const handleAdd = () => {
    if (!canAdd) return;
    // currentConfig.dates の順序を維持して追加 (一覧表示の自然な並びになるよう)。
    const labelById = new Map(currentConfig.dates.map(d => [d.id, d.label]));
    currentConfig.dates.forEach(d => {
      if (!formDateIds.includes(d.id)) return;
      const label = labelById.get(d.id);
      if (!label) return;
      addExternalSession(label, formTeacher, formLabel.trim(), formMemo.trim());
    });
    setFormLabel('');
    setFormMemo('');
    // 日付選択は次の入力で使い回せるよう残す (NG タブと同じ挙動)。
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
      <div className="border border-builder-ink-ghost rounded p-3 bg-builder-surface-alt">
        <div className="font-bold text-builder-ink mb-1">詳細セッション登録 (高校・予備校など)</div>
        <div className="text-xs text-builder-ink-muted mb-3">
          日付は複数選択可。1 件「講師 / ラベル / メモ」を入力して追加すると、
          選択した日付の分だけ同じ内容のセッションがまとめて登録されます。
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">講師</span>
            <select
              value={formTeacher}
              onChange={(e) => setFormTeacher(e.target.value)}
              className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              aria-label="セッション追加の対象講師"
            >
              {project.teachers.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 text-xs">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-builder-ink-muted">ラベル (任意)</span>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="1限 / 13:00-14:30 等"
                className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-builder-ink-muted">メモ (任意)</span>
              <input
                type="text"
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                placeholder="予備校 / 高2 英語 等"
                className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-builder-ink-muted">日付 (複数選択可)</span>
            <div className="flex gap-1">
              <button type="button" onClick={selectAllDates}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全選択
              </button>
              <button type="button" onClick={clearAllDates}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全解除
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentConfig.dates.map(d => (
              <label key={d.id}
                className="flex items-center gap-1 px-2 py-1 border border-builder-ink-ghost rounded cursor-pointer bg-builder-surface hover:bg-builder-bg text-builder-ink text-xs">
                <input
                  type="checkbox"
                  checked={formDateIds.includes(d.id)}
                  onChange={() => toggleDate(d.id)}
                />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center mb-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="px-3 py-1 bg-builder-primary text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            まとめて追加
          </button>
          {canAdd && (
            <span className="text-xs text-builder-ink-muted">
              対象: {formTeacher} × {formDateIds.length}日
            </span>
          )}
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
