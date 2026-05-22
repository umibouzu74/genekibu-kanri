import { useEffect, useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeExternalKey } from '../../utils/scheduleKey';
import { computeAutoNgEntries } from '../../utils/autoNg';
import { getPeriodTimeRange, parseHHmm } from '../../utils/timeRange';

export default function ExternalCounts() {
  const {
    project,
    currentConfig,
    handleExternalCountChange,
    addExternalSessions,
    removeExternalSession,
  } = useProjectContext();

  // 詳細セッション追加フォームの state。日付は (start, end) のレンジ指定に
  // 変更 (NG タブと UI を揃え、毎日チェックする手間を削減)。
  // date ID 初期値は number に正規化 (currentConfig.dates 空時は null)。
  // string '' を混ぜると lookup の === 比較で number と一致せず canAdd が
  // 1 render だけ false になるなどの型ドリフトを生むため。
  const [formTeacher, setFormTeacher] = useState(project.teachers[0]?.name || '');
  const [formMemo, setFormMemo] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formStartDateId, setFormStartDateId] = useState(currentConfig.dates[0]?.id ?? null);
  const [formEndDateId, setFormEndDateId] = useState(currentConfig.dates[0]?.id ?? null);

  // 設定の dates が変わって start/end が無効になった場合は再同期
  useEffect(() => {
    const ids = currentConfig.dates.map(d => d.id);
    if (!ids.includes(formStartDateId)) setFormStartDateId(ids[0] ?? null);
    if (!ids.includes(formEndDateId)) setFormEndDateId(ids[0] ?? null);
  }, [currentConfig.dates, formStartDateId, formEndDateId]);

  const sessions = useMemo(
    () => project.externalSessions || [],
    [project.externalSessions],
  );

  // (date, teacher) ごとの詳細セッション件数。クイック入力グリッドの
  // 表示で「件数だけ」セルに使う。
  const sessionCountMap = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      const k = makeExternalKey(s.date, s.teacherName);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [sessions]);

  // 期間内に含まれる date.label の配列 (start/end の順序は逆転しても許容)
  const dateLabelsInRange = useMemo(() => {
    const sIdx = currentConfig.dates.findIndex(d => d.id === formStartDateId);
    const eIdx = currentConfig.dates.findIndex(d => d.id === formEndDateId);
    if (sIdx < 0 || eIdx < 0) return [];
    const lo = Math.min(sIdx, eIdx);
    const hi = Math.max(sIdx, eIdx);
    return currentConfig.dates.slice(lo, hi + 1).map(d => d.label);
  }, [currentConfig.dates, formStartDateId, formEndDateId]);

  // ── 時刻入力の検証 ──────────────────────
  // parseHHmm の有効域 (h≤47, mm≤59) に揃える。canAdd 用の regex を別に
  // 持つと '99:30' のような pass-through 不正値を許容してしまうため、
  // 同じパーサで validate する。
  // 戻り値: { startMin, endMin, error: string|null }
  const timeValidation = useMemo(() => {
    const startMin = formStartTime ? parseHHmm(formStartTime) : null;
    const endMin = formEndTime ? parseHHmm(formEndTime) : null;
    if (!formStartTime && formEndTime) {
      return { startMin, endMin, error: '終了時刻だけでなく開始時刻も入力してください' };
    }
    if (formStartTime && startMin == null) {
      return { startMin, endMin, error: '開始時刻が不正な形式です' };
    }
    if (formEndTime && endMin == null) {
      return { startMin, endMin, error: '終了時刻が不正な形式です' };
    }
    if (startMin != null && endMin != null && startMin >= endMin) {
      return { startMin, endMin, error: '開始時刻は終了時刻より前にしてください' };
    }
    return { startMin, endMin, error: null };
  }, [formStartTime, formEndTime]);

  // 「この設定で追加したら自動NGが何件付くか」のプレビュー。
  // 仮の sessions (dateLabels × {teacher, time}) を作って computeAutoNgEntries を呼ぶ。
  const previewNgKeys = useMemo(() => {
    if (timeValidation.error) return [];
    if (!formTeacher || !formStartTime || dateLabelsInRange.length === 0) return [];
    const fakeSessions = dateLabelsInRange.map((dl, idx) => ({
      id: idx, date: dl, teacherName: formTeacher,
      startTime: formStartTime, endTime: formEndTime || undefined,
    }));
    const entries = computeAutoNgEntries(formTeacher, fakeSessions, currentConfig.periods);
    return Array.from(entries.keys());
  }, [formTeacher, formStartTime, formEndTime, dateLabelsInRange, currentConfig.periods, timeValidation.error]);

  const canAdd =
    !!formTeacher &&
    dateLabelsInRange.length > 0 &&
    timeValidation.error == null;

  const handleAdd = () => {
    if (!canAdd) return;
    // 時刻が指定されていれば label を自動で「HH:mm-HH:mm」風に整形 (表示用)
    const autoLabel = formStartTime
      ? (formEndTime ? `${formStartTime}-${formEndTime}` : formStartTime)
      : '';
    const items = dateLabelsInRange.map(dl => ({
      date: dl,
      teacherName: formTeacher,
      label: autoLabel,
      memo: formMemo.trim(),
      startTime: formStartTime || undefined,
      endTime: formEndTime || undefined,
    }));
    // 1 アクションで全日 atomic に登録 (途中 reject 時の不整合と
    // O(N) 履歴 push を回避)。
    addExternalSessions(items);
    // 時刻・メモはクリア (連打による重複登録を視覚的に防ぐ)。
    // teacher / date range は連続追加できるよう残す。
    setFormStartTime('');
    setFormEndTime('');
    setFormMemo('');
  };

  // 時限の表示用補助 (時間情報の有無を見える化)
  const periodHasTime = (p) => getPeriodTimeRange(p) != null;

  return (
    <div>
      <div className="bg-builder-warning-soft p-3 mb-4 rounded text-sm text-builder-orange border border-builder-warning-border">
        <strong>他学年・午前のコマ数登録:</strong><br />
        ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。<br />
        詳細セッションを登録すると、その件数が数値より優先して採用されます。<br />
        <strong>時刻を入力すると</strong>、同時間帯の時限が自動で「日時NG」になります。
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
          講師・期間 (開始〜終了) ・時刻を入れて「まとめて追加」を押すと、
          期間内の各日付に同じセッションが登録されます。
          時刻を入れた場合は重なる時限が自動で日時NGになります。
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
          <label className="flex flex-col gap-1 text-xs">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">期間 (開始日〜終了日)</span>
            <div className="flex items-center gap-1">
              <select
                value={formStartDateId ?? ''}
                onChange={(e) => setFormStartDateId(Number(e.target.value))}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                aria-label="セッション開始日"
              >
                {currentConfig.dates.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <span className="text-builder-ink-muted shrink-0">〜</span>
              <select
                value={formEndDateId ?? ''}
                onChange={(e) => setFormEndDateId(Number(e.target.value))}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                aria-label="セッション終了日"
              >
                {currentConfig.dates.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">時刻 (任意, 重複時限を自動NG)</span>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                aria-label="セッション開始時刻"
              />
              <span className="text-builder-ink-muted shrink-0">〜</span>
              <input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                aria-label="セッション終了時刻"
              />
            </div>
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
          {timeValidation.error && (
            <span className="text-xs text-builder-red font-bold">
              ⚠️ {timeValidation.error}
            </span>
          )}
          {canAdd && (
            <span className="text-xs text-builder-ink-muted">
              対象: {formTeacher} × {dateLabelsInRange.length}日
              {formStartTime && (
                <>
                  {' / '}
                  {previewNgKeys.length > 0
                    ? <>→ 自動NG {previewNgKeys.length} 件</>
                    : <span className="text-builder-orange">→ 重複する時限なし (時限ラベルに時刻が無い可能性)</span>
                  }
                </>
              )}
            </span>
          )}
        </div>

        {/* 時限の時刻設定状況をユーザに把握させる注意書き */}
        {currentConfig.periods.some(p => !periodHasTime(p)) && (
          <div className="text-[11px] text-builder-orange mb-3">
            ⚠️ 時刻が読み取れない時限があります:
            {' '}
            {currentConfig.periods.filter(p => !periodHasTime(p)).map(p => p.label).join(', ')}
            {' '}
            (基本設定で「1限 (13:00~13:45)」のように記述すると自動NGの対象になります)
          </div>
        )}

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
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">時刻</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">メモ</th>
                  <th className="border border-builder-ink-ghost p-1 bg-builder-bg w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const timeText = s.startTime
                    ? (s.endTime ? `${s.startTime}〜${s.endTime}` : `${s.startTime}〜`)
                    : (s.label || '-');
                  return (
                    <tr key={s.id}>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.date}</td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.teacherName}</td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{timeText}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
