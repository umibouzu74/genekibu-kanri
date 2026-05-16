import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';

export default function CombinedGroupSettings() {
  const {
    project,
    currentConfig,
    commonSubjects,
    addCombinedGroup,
    updateCombinedGroup,
    removeCombinedGroup,
  } = useProjectContext();

  const combinedGroups = project.combinedGroups || [];
  const [editingId, setEditingId] = useState(null);
  const [newGroup, setNewGroup] = useState(null);

  const allClasses = currentConfig.classes;
  const allDates = currentConfig.dates;

  const startNewGroup = () => {
    setNewGroup({ subject: commonSubjects[0] || "", classes: [], dates: null });
    setEditingId(null);
  };

  const handleSaveNew = () => {
    if (!newGroup || !newGroup.subject || newGroup.classes.length < 2) return;
    addCombinedGroup(newGroup);
    setNewGroup(null);
  };

  const handleUpdate = (id, updates) => {
    updateCombinedGroup(id, updates);
  };

  const handleRemove = (id) => {
    removeCombinedGroup(id);
    if (editingId === id) setEditingId(null);
  };

  const toggleClass = (classes, cls) => {
    if (classes.includes(cls)) return classes.filter(c => c !== cls);
    return [...classes, cls];
  };

  const toggleDate = (dates, date) => {
    if (!dates) return [date];
    if (dates.includes(date)) {
      return dates.filter(d => d !== date);
    }
    return [...dates, date];
  };

  const renderGroupEditor = (group, isNew) => {
    const subject = isNew ? newGroup.subject : group.subject;
    const classes = isNew ? newGroup.classes : group.classes;
    const dates = isNew ? newGroup.dates : group.dates;
    const isAllDates = dates === null;

    const setField = (field, value) => {
      if (isNew) {
        setNewGroup({ ...newGroup, [field]: value });
      } else {
        handleUpdate(group.id, { [field]: value });
      }
    };

    return (
      <div className="border border-builder-info-border rounded-lg p-4 bg-builder-info-soft space-y-3">
        {/* 科目選択 */}
        <div>
          <label className="block text-sm font-bold text-builder-ink mb-1">科目</label>
          <select
            className="border border-builder-border rounded px-3 py-1.5 text-sm w-full max-w-xs text-builder-ink"
            value={subject}
            onChange={(e) => setField('subject', e.target.value)}
          >
            {commonSubjects.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* クラス選択 */}
        <div>
          <label className="block text-sm font-bold text-builder-ink mb-1">
            対象クラス（2つ以上選択）
          </label>
          <div className="flex flex-wrap gap-2">
            {allClasses.map(cls => {
              const selected = classes.includes(cls.label);
              return (
                <button
                  key={cls.id}
                  onClick={() => setField('classes', toggleClass(classes, cls.label))}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    selected
                      ? 'bg-builder-blue text-white border-builder-blue'
                      : 'bg-builder-surface text-builder-ink-muted border-builder-border hover:border-builder-blue'
                  }`}
                >
                  {cls.label}
                </button>
              );
            })}
          </div>
          {classes.length > 0 && classes.length < 2 && (
            <p className="text-xs text-builder-red mt-1">2つ以上のクラスを選択してください</p>
          )}
        </div>

        {/* 日程選択 */}
        <div>
          <label className="block text-sm font-bold text-builder-ink mb-1">対象日程</label>
          <div className="mb-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-builder-ink">
              <input
                type="checkbox"
                checked={isAllDates}
                onChange={() => setField('dates', isAllDates ? [] : null)}
                className="rounded"
              />
              全日程
            </label>
          </div>
          {!isAllDates && (
            <div className="flex flex-wrap gap-2">
              {allDates.map(date => {
                const selected = dates?.includes(date.label);
                return (
                  <button
                    key={date.id}
                    onClick={() => setField('dates', toggleDate(dates, date.label))}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selected
                        ? 'bg-builder-green text-white border-builder-green'
                        : 'bg-builder-surface text-builder-ink-muted border-builder-border hover:border-builder-green'
                    }`}
                  >
                    {date.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 操作ボタン */}
        <div className="flex gap-2 pt-2 border-t border-builder-border">
          {isNew ? (
            <>
              <button
                onClick={handleSaveNew}
                disabled={!newGroup.subject || newGroup.classes.length < 2}
                className="px-4 py-1.5 bg-builder-blue text-white rounded text-sm font-bold hover:bg-builder-blue-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                追加
              </button>
              <button
                onClick={() => setNewGroup(null)}
                className="px-4 py-1.5 bg-builder-border text-builder-ink-muted rounded text-sm hover:bg-builder-ink-ghost"
              >
                キャンセル
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditingId(null)}
              className="px-4 py-1.5 bg-builder-border text-builder-ink-muted rounded text-sm hover:bg-builder-ink-ghost"
            >
              閉じる
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h3 className="font-bold text-lg mb-2 text-builder-ink">🔗 合同授業グループ</h3>
      <p className="text-sm text-builder-ink-muted mb-4">
        講師不足時に、特定の科目で複数クラスを1人の講師がまとめて担当する「合同授業」を設定できます。
        合同グループに設定されたコマは、自動生成時に1人の講師で全クラスをカバーし、講師のコマ数は1コマとしてカウントされます。
      </p>

      {/* 既存グループ一覧 */}
      {combinedGroups.length > 0 ? (
        <div className="space-y-3 mb-4">
          {combinedGroups.map(group => (
            <div key={group.id}>
              {editingId === group.id ? (
                renderGroupEditor(group, false)
              ) : (
                <div className="border border-builder-border rounded-lg p-3 bg-builder-surface flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-sm bg-builder-info-soft text-builder-ink px-2 py-0.5 rounded">
                      {group.subject}
                    </span>
                    <div className="flex gap-1">
                      {group.classes.map(cls => (
                        <span key={cls} className="text-xs bg-builder-surface-alt text-builder-ink-muted px-2 py-0.5 rounded border border-builder-border">
                          {cls}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-builder-ink-muted">
                      {group.dates === null ? '全日程' : `${group.dates.length}日`}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditingId(group.id)}
                      className="text-xs text-builder-blue hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleRemove(group.id)}
                      className="text-xs text-builder-red hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-builder-ink-muted mb-4 p-4 bg-builder-surface-alt rounded border border-dashed border-builder-border text-center">
          合同授業グループはまだ設定されていません
        </div>
      )}

      {/* 新規追加 */}
      {newGroup ? (
        renderGroupEditor(null, true)
      ) : (
        <button
          onClick={startNewGroup}
          className="px-4 py-2 bg-builder-blue text-white rounded text-sm font-bold hover:bg-builder-blue-hover"
        >
          + 合同グループを追加
        </button>
      )}
    </div>
  );
}
