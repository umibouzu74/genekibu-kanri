import React, { useState } from 'react';
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
      <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
        {/* 科目選択 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">科目</label>
          <select
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full max-w-xs"
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
          <label className="block text-sm font-bold text-gray-700 mb-1">
            対象クラス（2つ以上選択）
          </label>
          <div className="flex flex-wrap gap-2">
            {allClasses.map(cls => {
              const selected = classes.includes(cls);
              return (
                <button
                  key={cls}
                  onClick={() => setField('classes', toggleClass(classes, cls))}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>
          {classes.length > 0 && classes.length < 2 && (
            <p className="text-xs text-red-500 mt-1">2つ以上のクラスを選択してください</p>
          )}
        </div>

        {/* 日程選択 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">対象日程</label>
          <div className="mb-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
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
                const selected = dates?.includes(date);
                return (
                  <button
                    key={date}
                    onClick={() => setField('dates', toggleDate(dates, date))}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selected
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {date}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 操作ボタン */}
        <div className="flex gap-2 pt-2 border-t">
          {isNew ? (
            <>
              <button
                onClick={handleSaveNew}
                disabled={!newGroup.subject || newGroup.classes.length < 2}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                追加
              </button>
              <button
                onClick={() => setNewGroup(null)}
                className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                キャンセル
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditingId(null)}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
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
      <h3 className="font-bold text-lg mb-2">🔗 合同授業グループ</h3>
      <p className="text-sm text-gray-600 mb-4">
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
                <div className="border rounded-lg p-3 bg-white flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      {group.subject}
                    </span>
                    <div className="flex gap-1">
                      {group.classes.map(cls => (
                        <span key={cls} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border">
                          {cls}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {group.dates === null ? '全日程' : `${group.dates.length}日`}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditingId(group.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleRemove(group.id)}
                      className="text-xs text-red-500 hover:text-red-700 underline"
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
        <div className="text-sm text-gray-500 mb-4 p-4 bg-gray-50 rounded border border-dashed border-gray-300 text-center">
          合同授業グループはまだ設定されていません
        </div>
      )}

      {/* 新規追加 */}
      {newGroup ? (
        renderGroupEditor(null, true)
      ) : (
        <button
          onClick={startNewGroup}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700"
        >
          + 合同グループを追加
        </button>
      )}
    </div>
  );
}
