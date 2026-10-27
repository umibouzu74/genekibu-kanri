import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { PUBLISH_STATES, projectPublishState, publishStateDef } from '../utils/publishState';
import { projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from '../utils/courseDates';
import type { Project, PublishState } from '../types';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 今日より前に授業の日がある (済んだ講習を作成中に戻すと、授業時間の集計からも消える)
function hasPastLessonDays(project: Project, today: string): boolean {
  const base = projectBaseYmd(project, today);
  if (!base) return false;
  for (const ymd of resolveDateLabelsYmd(usedDateLabels(project), base).values()) {
    if (ymd && ymd < today) return true;
  }
  return false;
}

// 本体の月間の予定へ出すか (作成中 / 仮確定 / 確定、2026-10-27)。決まりは
// utils/publishState。作成中に戻すと、本体の講師の月間・授業時間の集計から消える
export default function PublishControl() {
  const { project, setPublishState } = useProjectContext();
  const { showConfirm, showToast } = useUI();
  const state = projectPublishState(project);

  const choose = async (next: PublishState) => {
    if (next === state) return;
    const today = todayYmd();
    if (next === 'draft' && hasPastLessonDays(project, today)) {
      const ok = await showConfirm(
        'この時間割には今日より前の授業の日があります。作成中に戻すと、本体の講師の月間の予定と授業時間の集計 (済んだ日の分も) から消えます。作成中に戻しますか?',
        { title: '作成中に戻す', confirmLabel: '作成中に戻す' },
      );
      if (!ok) return;
    }
    setPublishState(next);
    const def = publishStateDef(next);
    showToast(`「${def.label}」にしました。${def.note} (Undo で戻せます)`, 'success', 5000);
  };

  return (
    // fieldset の既定の枠・余白は消す (講習側は preflight を読み込んでいない)
    <fieldset className="flex flex-wrap items-center gap-1 text-xs border-0 p-0 m-0 min-w-0">
      <legend className="sr-only">本体の月間の予定への反映</legend>
      <span aria-hidden="true" className="text-builder-ink-muted">月間の予定:</span>
      {PUBLISH_STATES.map(s => {
        const on = s.key === state;
        const tone = on
          ? s.key === 'draft'
            ? 'bg-builder-warning-soft border-builder-warning-border text-builder-ink font-bold'
            : s.key === 'tentative'
              ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold'
              : 'bg-builder-success-soft border-builder-success-border text-builder-green font-bold'
          : 'bg-builder-surface border-builder-border text-builder-ink-muted hover:bg-builder-surface-alt';
        return (
          <label key={s.key} title={s.note} className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded cursor-pointer focus-within:ring-2 focus-within:ring-builder-blue ${tone}`}>
            <input
              type="radio"
              name="builder-publish-state"
              checked={on}
              onChange={() => { void choose(s.key); }}
              className="sr-only"
            />
            <span aria-hidden="true">{s.icon}</span>
            {s.label}
            <span className="sr-only"> ({s.note})</span>
          </label>
        );
      })}
      <span className="text-[11px] text-builder-ink-muted">{publishStateDef(state).note}</span>
    </fieldset>
  );
}
