import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { useHostData } from '../../contexts/hostDataContext';
import { planSeniorKoshuImport } from '../../utils/seniorKoshuImport';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 本体の「🎓 高校・予備校の講習」を、この講習の日付に当たる分だけ他学年セッション
// (時刻つき = 自動NG) として取り込む (2026-10-27)。本体が正なので、前に取り込んだもので
// 本体から消えた / 変わったものは消して入れ直す。手で入れた同じ講師・日・時刻のものは
// 既定で置き換える。押したときだけ取り込む (自動では同期しない)。計画は utils/seniorKoshuImport
export default function SeniorKoshuImport() {
  const { project, replaceExternalSessions, handleAddExternalOnlyDates } = useProjectContext();
  const { showToast } = useUI();
  const { seniorKoshuItems } = useHostData();
  const [replaceManual, setReplaceManual] = useState(true);
  const plan = useMemo(
    () => planSeniorKoshuImport(project, seniorKoshuItems, { todayYmd: todayYmd() }),
    [project, seniorKoshuItems],
  );
  if (!seniorKoshuItems || seniorKoshuItems.length === 0) return null;

  const removeIds = [
    ...plan.staleIds,
    ...plan.changedIds,
    ...(replaceManual ? plan.manualDuplicateIds : []),
  ];
  const nothingToDo = plan.toAdd.length === 0 && removeIds.length === 0;
  const changed = plan.toAdd.length - plan.changedIds.length;

  const handleImport = () => {
    if (nothingToDo) return;
    replaceExternalSessions(removeIds, plan.toAdd);
    const parts = [
      changed > 0 ? `${changed} 件を取り込み` : '',
      plan.changedIds.length > 0 ? `${plan.changedIds.length} 件を入れ直し` : '',
      plan.staleIds.length > 0 ? `本体に無くなった ${plan.staleIds.length} 件を消し` : '',
      replaceManual && plan.manualDuplicateIds.length > 0 ? `手で入れた ${plan.manualDuplicateIds.length} 件を置き換え` : '',
    ].filter(Boolean);
    showToast(`高校・予備校の講習: ${parts.join('、')}ました (Undo で戻せます)`, 'success', 4000);
  };
  const addMissingDates = () => {
    handleAddExternalOnlyDates(plan.missingDates.map(d => d.label));
    showToast(`${plan.missingDates.length} 日を外部授業だけの日として足しました`, 'success', 3000);
  };

  return (
    <div className="mb-4 p-3 rounded border border-builder-info-border text-sm">
      <div className="font-bold mb-1">🎓 本体の「高校・予備校の講習」を取り込む</div>
      <div className="text-xs text-builder-ink-muted mb-2">
        本体のサイドバー「🎓 高校・予備校の講習」に登録した担当のうち、この講習の日に当たる分を、時刻つきの他学年セッション
        (講師不在。重なる時限は自動で NG) にします。本体が正なので、本体で直したら、ここでもう一度取り込んでください
        (前に取り込んだもので本体から無くなった・変わったものは消して入れ直します)。取り込んだものは本体の月間には出しません
        (本体の登録の方が出ます)。
      </div>
      <ul className="text-xs mb-2 space-y-0.5">
        <li>
          この講習の日に当たる予定 <b>{plan.planned.length} 件</b>
          {plan.unchanged > 0 && ` (取り込み済み ${plan.unchanged} 件)`}
        </li>
        {changed > 0 && <li>新しく取り込む: <b>{changed} 件</b></li>}
        {plan.changedIds.length > 0 && <li>本体で変わった (入れ直す): <b>{plan.changedIds.length} 件</b></li>}
        {plan.staleIds.length > 0 && <li>本体に無くなった (消す): <b>{plan.staleIds.length} 件</b></li>}
      </ul>
      {plan.manualDuplicateIds.length > 0 && (
        <label className="flex items-start gap-1 text-xs mb-2">
          <input
            type="checkbox"
            checked={replaceManual}
            onChange={e => setReplaceManual(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            手で入れた他学年セッションのうち、講師・日・時刻が同じ <b>{plan.manualDuplicateIds.length} 件</b>を置き換える
            (これまで手で入れていた分。外すと両方残ります)
          </span>
        </label>
      )}
      {plan.unknownTeachers.length > 0 && (
        <div className="text-xs mb-2" style={{ color: '#b06000' }}>
          ⚠ 講習の講師に居ない名前は取り込みません: {plan.unknownTeachers.join('・')}{' '}
          (中学の講習を持たない先生は、取り込まなくても本体の月間に出ます)
        </div>
      )}
      {plan.missingDates.length > 0 && (
        <div className="text-xs mb-2 p-2 rounded bg-builder-surface-alt">
          <div>
            日付プールに無い日の予定 (中学の講習が無い日):{' '}
            {plan.missingDates.map(d => `${d.label} ${d.count}件`).join('、')}
          </div>
          <button
            type="button"
            onClick={addMissingDates}
            className="mt-1 px-2 py-0.5 rounded border border-builder-border bg-builder-surface text-builder-ink font-bold hover:bg-builder-bg"
          >
            外部授業だけの日として足す ({plan.missingDates.length} 日)
          </button>
          <span className="ml-1 text-builder-ink-muted">足すと、その日の予定も取り込めます (時間割のタブには出ません)</span>
        </div>
      )}
      <button
        type="button"
        onClick={handleImport}
        disabled={nothingToDo}
        className="px-3 py-1 rounded bg-builder-primary text-white text-xs font-bold disabled:opacity-40"
      >
        {nothingToDo ? '取り込むものはありません (本体と同じです)' : '取り込む'}
      </button>
    </div>
  );
}
