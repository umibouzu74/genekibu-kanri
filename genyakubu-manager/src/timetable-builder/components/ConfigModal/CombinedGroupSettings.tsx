import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { findConflictingCombinedGroup } from '../../utils/scheduleKey';

// 合同授業グループの設定タブ。
//
// F5n: 新規・編集とも draft-commit 方式。旧実装は編集時に setField が即
// dispatch していたため、新規側の「2 クラス以上」ガードを素通りして
// 単クラス・対象日 0 日のグループが恒久化できた。編集もローカル draft に
// 溜めて「保存」時に検証 + 一括 commit する (Undo も 1 ステップに揃う)。
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
  // draft: { id: number|null, subject, classes, dates } — id === null は新規。
  const [draft, setDraft] = useState(null);

  const allClasses = currentConfig.classes;
  const allDates = currentConfig.dates;

  // F5p (2026-07-03 決定): 他タブ由来のグループは現タブから読み取り専用。
  // combinedGroups は project 共有・ラベル参照なので、現タブに無いクラス /
  // 日程ラベルを含むグループをこのタブで編集すると、その要素が editor 上で
  // 見えない・解除もできないままタブ混成グループとして保存できてしまう。
  // 編集は「全要素が現タブに存在するタブ」でのみ許可し、削除は孤立グループ
  // (作成元タブが消えた等) の掃除経路として全タブで許可する。
  const classLabelSet = new Set(allClasses.map((c) => c.label));
  const dateLabelSet = new Set(allDates.map((d) => d.label));
  const foreignRefsOf = (group) => [
    ...group.classes.filter((c) => !classLabelSet.has(c)),
    ...(group.dates || []).filter((d) => !dateLabelSet.has(d)),
  ];

  const startNewGroup = () => {
    setDraft({ id: null, subject: commonSubjects[0] || "", classes: [], dates: null });
  };

  const startEdit = (group) => {
    setDraft({
      id: group.id,
      subject: group.subject,
      classes: [...group.classes],
      dates: group.dates === null ? null : [...group.dates],
    });
  };

  // 検証: 科目必須 / クラス 2 以上 / 「全日程」でないなら対象日 1 日以上 /
  // 既存グループとの重複なし (F5z: 伝播・集計は first-match のみで、重なる
  // グループが 2 つあると片方が silent に無視されるため登録時に弾く)。
  const draftError = (d) => {
    if (!d) return null;
    if (!d.subject) return '科目を選択してください';
    if (d.classes.length < 2) return '2つ以上のクラスを選択してください';
    if (d.dates !== null && d.dates.length === 0) return '対象日程を選択するか「全日程」にしてください';
    // F5p 補強: 編集開始後に Undo 等で project が変わると、draft が現タブに
    // 無いラベルを抱えたまま (editor に表示されず解除も不能で) 保存できて
    // しまう。編集ボタンの disabled は render 時のゲートなので、保存時にも
    // 再検証する。
    const foreignInDraft = [
      ...d.classes.filter((c) => !classLabelSet.has(c)),
      ...(d.dates || []).filter((x) => !dateLabelSet.has(x)),
    ];
    if (foreignInDraft.length > 0) {
      return `現在のタブに無いクラス・日程 (${foreignInDraft.join('・')}) が含まれています。編集をキャンセルしてください`;
    }
    const conflict = findConflictingCombinedGroup(combinedGroups, d, d.id);
    if (conflict) {
      return `既存の合同グループ (${conflict.subject}: ${conflict.classes.join('・')}) とクラス・日程が重なっています`;
    }
    return null;
  };

  const handleSave = () => {
    if (!draft || draftError(draft)) return;
    const payload = { subject: draft.subject, classes: draft.classes, dates: draft.dates };
    if (draft.id === null) {
      addCombinedGroup(payload);
    } else {
      updateCombinedGroup(draft.id, payload);
    }
    setDraft(null);
  };

  const handleRemove = (id) => {
    removeCombinedGroup(id);
    if (draft?.id === id) setDraft(null);
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

  const renderGroupEditor = () => {
    const { subject, classes, dates } = draft;
    const isNew = draft.id === null;
    const isAllDates = dates === null;
    const error = draftError(draft);

    const setField = (field, value) => setDraft({ ...draft, [field]: value });

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

        {/* 検証メッセージ + 操作ボタン */}
        {error && <p className="text-xs text-builder-red">{error}</p>}
        <div className="flex gap-2 pt-2 border-t border-builder-border">
          <button
            onClick={handleSave}
            disabled={!!error}
            className="px-4 py-1.5 bg-builder-blue text-white rounded text-sm font-bold hover:bg-builder-blue-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isNew ? '追加' : '保存'}
          </button>
          <button
            onClick={() => setDraft(null)}
            className="px-4 py-1.5 bg-builder-border text-builder-ink-muted rounded text-sm hover:bg-builder-ink-ghost"
          >
            キャンセル
          </button>
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
          {combinedGroups.map(group => {
            const foreignRefs = foreignRefsOf(group);
            return (
              <div key={group.id}>
                {draft?.id === group.id ? (
                  renderGroupEditor()
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
                      {foreignRefs.length > 0 && (
                        <span className="text-xs text-builder-orange">
                          🔒 現在のタブに無いクラス・日程 ({foreignRefs.join('・')}) を含むため、このタブでは編集できません
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(group)}
                        disabled={foreignRefs.length > 0}
                        title={foreignRefs.length > 0
                          ? '全クラス・日程が揃うタブで編集するか、基本設定で日付・クラスを戻してから編集してください'
                          : undefined}
                        className="text-xs text-builder-blue hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
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
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-builder-ink-muted mb-4 p-4 bg-builder-surface-alt rounded border border-dashed border-builder-border text-center">
          合同授業グループはまだ設定されていません
        </div>
      )}

      {/* 新規追加 */}
      {draft && draft.id === null ? (
        renderGroupEditor()
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
