import { useEffect, useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { makeExternalKey } from '../../utils/scheduleKey';
import { computeAutoNgEntries } from '../../utils/autoNg';
import { getPeriodTimeRange, parseHHmm } from '../../utils/timeRange';

// 「他学年・午前」タブ。コマ数のクイック入力 + 詳細セッション登録 +
// プリセット (時刻 / 期間 / メモ の頻出パターン) 管理を 1 画面にまとめる。
//
// プリセット → 詳細セッション登録 → 自動NG派生 の流れを 1 タブ内で完結させる。
export default function ExternalCounts() {
  const {
    project,
    currentConfig,
    handleExternalCountChange,
    addExternalSessions,
    removeExternalSession,
    addExternalSessionPreset,
    updateExternalSessionPreset,
    removeExternalSessionPreset,
  } = useProjectContext();

  // ── 詳細セッション登録フォームの state ────────────────
  // 講師は複数選択 (Set<name>)。チェックボックスで複数人 × 期間 × 時間帯を
  // 1 アクションで登録する。
  const [formTeacherNames, setFormTeacherNames] = useState(() => new Set());
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

  // teachers が変わって選択中の講師が消えた場合は同期
  useEffect(() => {
    const names = new Set(project.teachers.map(t => t.name));
    setFormTeacherNames(prev => {
      const filtered = new Set(Array.from(prev).filter(n => names.has(n)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [project.teachers]);

  const sessions = useMemo(
    () => project.externalSessions || [],
    [project.externalSessions],
  );
  const presets = useMemo(
    () => project.externalSessionPresets || [],
    [project.externalSessionPresets],
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
  // parseHHmm の有効域 (h≤47, mm≤59) に揃える。
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
  // 講師1人あたりの NG キー数 × 講師数。
  const previewPerTeacherNgCount = useMemo(() => {
    if (timeValidation.error) return 0;
    if (!formStartTime || dateLabelsInRange.length === 0) return 0;
    // 仮 teacher='*' でカウント (講師名は overlap 判定に無関係)
    const fakeSessions = dateLabelsInRange.map((dl, idx) => ({
      id: idx, date: dl, teacherName: '*',
      startTime: formStartTime, endTime: formEndTime || undefined,
    }));
    const entries = computeAutoNgEntries('*', fakeSessions, currentConfig.periods);
    return entries.size;
  }, [formStartTime, formEndTime, dateLabelsInRange, currentConfig.periods, timeValidation.error]);

  const selectedTeachers = useMemo(
    () => Array.from(formTeacherNames),
    [formTeacherNames],
  );

  const canAdd =
    selectedTeachers.length > 0 &&
    dateLabelsInRange.length > 0 &&
    timeValidation.error == null;

  const toggleTeacher = (name) => {
    setFormTeacherNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const selectAllTeachers = () => {
    setFormTeacherNames(new Set(project.teachers.map(t => t.name)));
  };
  const clearAllTeachers = () => setFormTeacherNames(new Set());

  const handleAdd = () => {
    if (!canAdd) return;
    // 時刻が指定されていれば label を自動で「HH:mm-HH:mm」風に整形 (表示用)
    const autoLabel = formStartTime
      ? (formEndTime ? `${formStartTime}-${formEndTime}` : formStartTime)
      : '';
    const items = [];
    for (const teacherName of selectedTeachers) {
      for (const dl of dateLabelsInRange) {
        items.push({
          date: dl,
          teacherName,
          label: autoLabel,
          memo: formMemo.trim(),
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
        });
      }
    }
    // 1 アクションで M 人 × N 日 atomic に登録
    addExternalSessions(items);
    // 時刻・メモはクリア (連打による重複登録を視覚的に防ぐ)。
    // teacher 選択 / date range は連続追加できるよう残す。
    setFormStartTime('');
    setFormEndTime('');
    setFormMemo('');
  };

  // プリセットを適用 (時刻 / 期間 / メモをフォームにセット)。
  // 講師選択は手動で行うのでここでは触らない。
  const applyPreset = (presetId) => {
    if (!presetId) return;
    const p = presets.find(x => x.id === Number(presetId));
    if (!p) return;
    if (p.startTime != null) setFormStartTime(p.startTime);
    if (p.endTime != null) setFormEndTime(p.endTime);
    if (p.memo != null) setFormMemo(p.memo);
    // date label → id 解決。存在しない場合はそのまま (useEffect で補正)。
    if (p.startDateLabel) {
      const d = currentConfig.dates.find(x => x.label === p.startDateLabel);
      if (d) setFormStartDateId(d.id);
    }
    if (p.endDateLabel) {
      const d = currentConfig.dates.find(x => x.label === p.endDateLabel);
      if (d) setFormEndDateId(d.id);
    }
  };

  // 時限の時刻読み取り可否 (UI 注意書き用)
  const periodHasTime = (p) => getPeriodTimeRange(p) != null;
  const periodsMissingTime = currentConfig.periods.filter(p => !periodHasTime(p));

  return (
    <div>
      <div className="bg-builder-warning-soft p-3 mb-4 rounded text-sm text-builder-orange border border-builder-warning-border">
        <strong>他学年・午前のコマ数登録:</strong><br />
        ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。<br />
        詳細セッションを登録すると、その件数が数値より優先して採用されます。<br />
        <strong>時刻を入力すると</strong>、同時間帯の時限が自動で「日時NG」になります。
      </div>

      {/* プリセット管理 (折りたたみ) */}
      <PresetPanel
        presets={presets}
        dates={currentConfig.dates}
        addPreset={addExternalSessionPreset}
        updatePreset={updateExternalSessionPreset}
        removePreset={removeExternalSessionPreset}
      />

      {/* クイック入力グリッド */}
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
          講師 (複数選択可) ・期間 (開始〜終了) ・時刻を入れて「まとめて追加」を押すと、
          選んだ講師 × 期間内の各日付に同じセッションが登録されます。
          時刻を入れた場合は重なる時限が自動で日時NGになります。
          プリセットを選ぶと時刻/期間/メモが一括で埋まります。
        </div>

        {/* プリセット選択 */}
        {presets.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-builder-ink-muted shrink-0">プリセット:</span>
            <select
              defaultValue=""
              onChange={(e) => { applyPreset(e.target.value); e.target.value = ''; }}
              className="flex-1 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              aria-label="プリセットを選んで時刻・期間・メモをフォームに展開"
            >
              <option value="">— プリセットを選んで適用 —</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{formatPresetSummary(p)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 講師チェックボックス一覧 */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-builder-ink-muted">講師 (複数選択可) — 選択 {formTeacherNames.size} 名</span>
            <div className="flex gap-1">
              <button type="button" onClick={selectAllTeachers}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全選択
              </button>
              <button type="button" onClick={clearAllTeachers}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全解除
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {project.teachers.map(t => {
              const checked = formTeacherNames.has(t.name);
              return (
                <label
                  key={t.name}
                  className={`flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-xs ${checked ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-ink-ghost text-builder-ink hover:bg-builder-bg'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTeacher(t.name)}
                    aria-label={`${t.name} を対象に含める`}
                  />
                  <span>{t.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
        </div>

        <div className="flex flex-col gap-1 text-xs mb-3">
          <span className="text-builder-ink-muted">時刻 (任意, 重複時限を自動NG)</span>
          <div className="flex items-center gap-1 max-w-md">
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
              対象: {selectedTeachers.length}名 × {dateLabelsInRange.length}日 = {selectedTeachers.length * dateLabelsInRange.length} 件
              {formStartTime && (
                <>
                  {' / '}
                  {previewPerTeacherNgCount > 0
                    ? <>→ 自動NG {selectedTeachers.length * previewPerTeacherNgCount} 件</>
                    : <span className="text-builder-orange">→ 重複する時限なし (時限ラベルに時刻が無い可能性)</span>
                  }
                </>
              )}
            </span>
          )}
        </div>

        {periodsMissingTime.length > 0 && (
          <div className="text-[11px] text-builder-orange mb-3">
            ⚠️ 時刻が読み取れない時限があります:
            {' '}
            {periodsMissingTime.map(p => p.label).join(', ')}
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

// ── プリセット管理パネル (折りたたみ式) ─────────────────
// 「予備校 12:25-13:35 を 7/24~7/31」のような頻出パターンを保存・管理する。
// 親の ExternalCounts から date 一覧と dispatch wrapper を受け取る。
function PresetPanel({ presets, dates, addPreset, updatePreset, removePreset }) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = 新規追加モード
  const [draft, setDraft] = useState(blankDraft());

  function blankDraft() {
    return {
      name: '', startTime: '', endTime: '',
      startDateId: dates[0]?.id ?? null,
      endDateId: dates[0]?.id ?? null,
      memo: '',
    };
  }

  // dates が変わったら draft の date id を補正
  useEffect(() => {
    const ids = dates.map(d => d.id);
    setDraft(d => {
      const startOk = ids.includes(d.startDateId);
      const endOk = ids.includes(d.endDateId);
      if (startOk && endOk) return d;
      return {
        ...d,
        startDateId: startOk ? d.startDateId : (ids[0] ?? null),
        endDateId: endOk ? d.endDateId : (ids[0] ?? null),
      };
    });
  }, [dates]);

  const startEdit = (p) => {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      startDateId: dates.find(d => d.label === p.startDateLabel)?.id ?? (dates[0]?.id ?? null),
      endDateId: dates.find(d => d.label === p.endDateLabel)?.id ?? (dates[0]?.id ?? null),
      memo: p.memo || '',
    });
    setExpanded(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(blankDraft());
  };

  const draftValidation = useMemo(() => {
    if (!draft.name.trim()) return '名前を入力してください';
    const sMin = draft.startTime ? parseHHmm(draft.startTime) : null;
    const eMin = draft.endTime ? parseHHmm(draft.endTime) : null;
    if (!draft.startTime && draft.endTime) return '終了時刻だけでなく開始時刻も入力してください';
    if (draft.startTime && sMin == null) return '開始時刻が不正な形式です';
    if (draft.endTime && eMin == null) return '終了時刻が不正な形式です';
    if (sMin != null && eMin != null && sMin >= eMin) return '開始時刻は終了時刻より前にしてください';
    return null;
  }, [draft]);

  const saveDraft = () => {
    if (draftValidation) return;
    const startDateLabel = dates.find(d => d.id === draft.startDateId)?.label;
    const endDateLabel = dates.find(d => d.id === draft.endDateId)?.label;
    const payload = {
      name: draft.name.trim(),
      startTime: draft.startTime || '',
      endTime: draft.endTime || '',
      startDateLabel: startDateLabel || '',
      endDateLabel: endDateLabel || '',
      memo: draft.memo.trim(),
    };
    if (editingId == null) {
      addPreset(payload);
    } else {
      updatePreset(editingId, payload);
    }
    cancelEdit();
  };

  return (
    <div className="border border-builder-ink-ghost rounded mb-4 bg-builder-surface-alt">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-left text-builder-ink hover:bg-builder-bg"
      >
        <span>
          <span className="mr-1">{expanded ? '▼' : '▶'}</span>
          📋 プリセット管理 ({presets.length})
        </span>
        <span className="text-xs text-builder-ink-muted font-normal">
          時刻・期間・メモのテンプレートを登録すると、追加が高速化します
        </span>
      </button>
      {expanded && (
        <div className="p-3 border-t border-builder-ink-ghost">
          {presets.length === 0 ? (
            <div className="text-xs text-builder-ink-muted italic mb-3">
              まだプリセットがありません。下のフォームから登録してください。
            </div>
          ) : (
            <div className="overflow-x-auto mb-3">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink text-left">名前</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">時刻</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">期間</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">メモ</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {presets.map(p => (
                    <tr key={p.id} className={editingId === p.id ? 'bg-builder-info-soft' : ''}>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink font-bold">{p.name}</td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">
                        {p.startTime ? (p.endTime ? `${p.startTime}〜${p.endTime}` : `${p.startTime}〜`) : '-'}
                      </td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">
                        {p.startDateLabel ? (p.endDateLabel && p.endDateLabel !== p.startDateLabel ? `${p.startDateLabel}〜${p.endDateLabel}` : p.startDateLabel) : '-'}
                      </td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{p.memo || '-'}</td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="text-builder-blue hover:underline text-[11px] mr-2"
                          aria-label={`${p.name} を編集`}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => removePreset(p.id)}
                          className="text-builder-red hover:underline text-[11px]"
                          aria-label={`${p.name} を削除`}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 新規追加 / 編集フォーム */}
          <div className="bg-builder-surface border border-builder-ink-ghost rounded p-3">
            <div className="font-bold text-builder-ink text-xs mb-2">
              {editingId == null ? '新規プリセットを追加' : `プリセットを編集 (id ${editingId})`}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">名前 *</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="予備校（早朝）"
                  className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">メモ (任意)</span>
                <input
                  type="text"
                  value={draft.memo}
                  onChange={(e) => setDraft(d => ({ ...d, memo: e.target.value }))}
                  placeholder="予備校 / 高2 英語 等"
                  className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">期間 (任意)</span>
                <div className="flex items-center gap-1">
                  <select
                    value={draft.startDateId ?? ''}
                    onChange={(e) => setDraft(d => ({ ...d, startDateId: Number(e.target.value) }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット開始日"
                  >
                    {dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <span className="text-builder-ink-muted shrink-0">〜</span>
                  <select
                    value={draft.endDateId ?? ''}
                    onChange={(e) => setDraft(d => ({ ...d, endDateId: Number(e.target.value) }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット終了日"
                  >
                    {dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">時刻 (任意)</span>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft(d => ({ ...d, startTime: e.target.value }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット開始時刻"
                  />
                  <span className="text-builder-ink-muted shrink-0">〜</span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft(d => ({ ...d, endTime: e.target.value }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット終了時刻"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={saveDraft}
                disabled={draftValidation != null}
                className="px-3 py-1 bg-builder-primary text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              >
                {editingId == null ? 'プリセットを追加' : '変更を保存'}
              </button>
              {editingId != null && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-3 py-1 border border-builder-ink-ghost bg-builder-surface text-builder-ink rounded text-xs hover:bg-builder-bg"
                >
                  キャンセル
                </button>
              )}
              {draftValidation && (
                <span className="text-xs text-builder-red font-bold">⚠️ {draftValidation}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// プリセットのサマリ表示 (select option 用)
function formatPresetSummary(p) {
  const parts = [p.name];
  if (p.startTime) {
    parts.push(p.endTime ? `${p.startTime}-${p.endTime}` : `${p.startTime}〜`);
  }
  if (p.startDateLabel) {
    parts.push(
      p.endDateLabel && p.endDateLabel !== p.startDateLabel
        ? `${p.startDateLabel}〜${p.endDateLabel}`
        : p.startDateLabel,
    );
  }
  return parts.join(' / ');
}
