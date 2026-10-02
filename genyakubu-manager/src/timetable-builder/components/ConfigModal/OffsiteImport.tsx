import { useMemo } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { useHostData } from '../../contexts/hostDataContext';
import { buildOffsiteSessionItems } from '../../../utils/offsiteBuilderImport';
import { projectBaseYmd } from '../../../utils/builderLessons';

// 本体の「🏫 他校舎の授業」を、この講習の日付に当たる分だけ他学年セッション
// (講師不在) として取り込む。時刻つきなので重なる時限は自動で NG になる。
// 押したときだけ取り込む (自動では同期しない)。同じ内容は reducer が飛ばす。
export default function OffsiteImport() {
  const { project, addExternalSessions } = useProjectContext();
  const { showToast } = useUI();
  const { offsiteLessons, holidays } = useHostData();

  const plan = useMemo(() => {
    const today = new Date();
    const fallback = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return buildOffsiteSessionItems(offsiteLessons, {
      dateLabels: (project.dates || []).map((d) => d.label),
      baseYmd: projectBaseYmd(project, fallback),
      holidays,
      teacherNames: (project.teachers || []).map((t) => t.name),
    });
  }, [offsiteLessons, holidays, project]);

  // 既に同じ内容で入っている分 (reducer の重複判定と同じキー)
  const contentKey = (s: { date: string; teacherName: string; label?: string; memo?: string; startTime?: string; endTime?: string }) =>
    JSON.stringify([s.date, s.teacherName, s.label || '', s.memo || '', s.startTime || '', s.endTime || '']);
  const existing = new Set((project.externalSessions || []).map(contentKey));
  const fresh = plan.items.filter((it) => !existing.has(contentKey(it)));

  if (!offsiteLessons || offsiteLessons.length === 0) return null;

  const handleImport = () => {
    if (fresh.length === 0) return;
    addExternalSessions(fresh);
    showToast(`他校舎の授業 ${fresh.length} 件を講師不在として取り込みました`, 'success', 3000);
  };

  return (
    <div className="mb-4 p-3 rounded border border-builder-info-border text-sm">
      <div className="font-bold mb-1">🏫 本体の「他校舎の授業」を取り込む</div>
      <div className="text-xs text-builder-ink-muted mb-2">
        この講習の日付に当たる他校舎の授業を、時刻つきの講師不在として登録します (重なる時限は自動で NG。移動時間があれば前後に含めます)。
        {plan.items.length === 0
          ? ' この講習の日付に当たる予定はありません。'
          : ` 当たる予定 ${plan.items.length} 件のうち、未登録 ${fresh.length} 件。`}
      </div>
      {plan.unknownTeachers.length > 0 && (
        <div className="text-xs mb-2" style={{ color: '#b06000' }}>
          ⚠ 講習の講師に居ない名前は取り込みません: {plan.unknownTeachers.join('・')}
        </div>
      )}
      <button
        type="button"
        onClick={handleImport}
        disabled={fresh.length === 0}
        className="px-3 py-1 rounded bg-builder-primary text-white text-xs font-bold disabled:opacity-40"
      >
        {fresh.length > 0 ? `${fresh.length} 件を取り込む` : '取り込む予定はありません'}
      </button>
    </div>
  );
}
