import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { PUBLISH_STATES, framePublishState, projectPublishState, publishStateDef } from '../utils/publishState';
import { frameOfTab, tabsOfFrame } from '../utils/frames';
import { publishChangeMessage, publishChangesFor } from '../utils/publishChange';
import type { PublishState } from '../types';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 本体の月間の予定へ出すか (作成中 / 仮確定 / 確定、2026-10-27)。決まりは
// utils/publishState。作成中に戻すと、本体の講師の月間・授業時間の集計から消える。
// 季節の中の枠 (utils/frames) に入ったタブを開いているときは、その枠の状態を切り替える
export default function PublishControl() {
  const { project, activeTab, setPublishState, setFramePublishState } = useProjectContext();
  const { showConfirm, showToast } = useUI();
  const frame = frameOfTab(project, activeTab);
  const state = frame ? framePublishState(project, frame) : projectPublishState(project);

  const choose = async (next: PublishState) => {
    if (next === state) return;
    // 変わるタブ: 枠ならその枠のタブ、そうでなければ project の状態に従うタブ (枠に
    // 入っていないタブと、状態を持たない枠のタブ)
    const affected = frame
      ? tabsOfFrame(project, frame.id)
      : project.tabs.filter(t => {
        const f = frameOfTab(project, t);
        return !f || f.publishState == null;
      });
    const message = publishChangeMessage(project, publishChangesFor(project, affected, next), todayYmd());
    if (message) {
      const ok = await showConfirm(message, { title: '作成中に戻す', confirmLabel: '作成中に戻す' });
      if (!ok) return;
    }
    if (frame) setFramePublishState(frame.id, next);
    else setPublishState(next);
    const def = publishStateDef(next);
    showToast(`${frame ? `「${frame.name}」の` : ''}月間の予定を「${def.label}」にしました。${def.note} (Undo で戻せます)`, 'success', 5000);
  };

  return (
    // fieldset の既定の枠・余白は消す (講習側は preflight を読み込んでいない)
    <fieldset className="flex flex-wrap items-center gap-1 text-xs border-0 p-0 m-0 min-w-0">
      <legend className="sr-only">{frame ? `「${frame.name}」の` : ''}本体の月間の予定への反映</legend>
      <span aria-hidden="true" className="text-builder-ink-muted">{frame ? `「${frame.name}」の` : ''}月間の予定:</span>
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
