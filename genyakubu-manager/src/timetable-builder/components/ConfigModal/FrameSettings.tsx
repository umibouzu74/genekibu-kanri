import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { PUBLISH_STATES, framePublishState, projectPublishState } from '../../utils/publishState';
import { framePeriods, frameRangeLabel, projectFrames, tabsOfFrame } from '../../utils/frames';
import { publishChangeMessage, publishChangesFor } from '../../utils/publishChange';
import DraftLineInput from './DraftLineInput';
import DraftListTextarea from './DraftListTextarea';
import type { PublishState } from '../../types';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 季節の中の「枠」(2026-10-27)。冬期講習 / 直前ポイント演習 / 弱点補強演習 のように、
// 1 つの季節の中の別の講習を分ける。枠ごとに名前・時限・月間の予定 (作成中 / 仮確定 /
// 確定) を持ち、タブは枠に入る。決まりは utils/frames
export default function FrameSettings() {
  const {
    project,
    activeTab,
    addFrame,
    renameFrame,
    removeFrame,
    setTabFrame,
    setFramePeriods,
    setFramePublishState,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();
  const frames = projectFrames(project);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTabIds, setNewTabIds] = useState<Set<number>>(() => new Set());
  const unframedTabs = tabsOfFrame(project, null);

  const startCreate = () => {
    setCreating(true);
    setNewName('');
    // 既定で選ぶのは枠に入っていないタブのうち、今開いているタブ
    setNewTabIds(new Set(unframedTabs.some(t => t.id === activeTab.id) ? [activeTab.id] : []));
  };
  const toggleNewTab = (id: number) => setNewTabIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const create = () => {
    const name = newName.trim();
    if (!name) {
      showToast('枠の名前を入れてください', 'error', 2500);
      return;
    }
    if (frames.some(f => f.name === name)) {
      showToast(`「${name}」という枠はもうあります`, 'error', 3000);
      return;
    }
    addFrame(name, [...newTabIds]);
    setCreating(false);
    showToast(`枠「${name}」を作りました。時限と「月間の予定」は枠ごとに直せます`, 'success', 4000);
  };

  // 枠を消すと、その枠のタブは project の状態になる (最後の枠で、ほかに枠に入っていない
  // タブも無ければ、枠の状態を project に移すので変わらない。projectReducer の frame/remove)
  const handleRemove = async (id: number, name: string) => {
    const frame = frames.find(f => f.id === id);
    const tabs = tabsOfFrame(project, id);
    const keepsState = frames.length === 1 && unframedTabs.length === 0;
    const to = keepsState && frame ? framePublishState(project, frame) : projectPublishState(project);
    const change = publishChangeMessage(project, publishChangesFor(project, tabs, to), todayYmd(), { askAlways: true });
    const ok = await showConfirm(
      `枠「${name}」を消します。この枠のタブは枠なしに戻ります (タブ・時限・コマは消えません)。` +
        (change ? `\n${change}` : 'よろしいですか？'),
      { title: '枠の削除', confirmLabel: '消す' },
    );
    if (!ok) return;
    removeFrame(id);
    showToast(`枠「${name}」を消しました (Undo で戻せます)`, 'success', 3000);
  };

  // 開いているタブを枠に入れる / 外す。入る枠 (外すなら project) の状態になるので、変わるなら確かめる
  const handleSetTabFrame = async (frameId: number | null) => {
    const target = frameId != null ? frames.find(f => f.id === frameId) : null;
    const to = target ? framePublishState(project, target) : projectPublishState(project);
    const message = publishChangeMessage(project, publishChangesFor(project, [activeTab], to), todayYmd(), { askAlways: true });
    if (message) {
      const ok = await showConfirm(message, { title: target ? `「${target.name}」に入れる` : '枠から外す', confirmLabel: target ? '入れる' : '外す' });
      if (!ok) return;
    }
    setTabFrame(activeTab.id, frameId);
  };

  // 枠の「月間の予定」を選ぶ (済んだ日のあるタブを作成中にするときは確かめる。ヘッダの切替と同じ)
  const handleFrameState = async (id: number, next: PublishState) => {
    const message = publishChangeMessage(project, publishChangesFor(project, tabsOfFrame(project, id), next), todayYmd());
    if (message) {
      const ok = await showConfirm(message, { title: '作成中に戻す', confirmLabel: '作成中に戻す' });
      if (!ok) return;
    }
    setFramePublishState(id, next);
  };

  const commitPeriods = (id: number, value: string) => {
    const labels = value.split(',').map(s => s.trim()).filter(Boolean);
    if (labels.length === 0) {
      showToast('枠には時限が 1 つ以上要ります', 'error', 3000);
      return;
    }
    setFramePeriods(id, value);
  };

  const inputCls = 'border border-builder-border rounded px-2 py-1 text-sm bg-builder-surface text-builder-ink';

  return (
    <section aria-labelledby="builder-frames-title" className="mb-6 p-4 border border-builder-border rounded bg-builder-surface space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="builder-frames-title" className="font-bold text-builder-ink">🧩 枠 (この季節の中の講習)</h3>
        {!creating && (
          <button
            type="button"
            onClick={startCreate}
            className="px-2 py-1 text-xs font-bold rounded border border-builder-border bg-builder-surface text-builder-ink hover:bg-builder-surface-alt"
          >＋ 枠を作る</button>
        )}
      </div>
      <p className="text-xs text-builder-ink-muted">
        冬期講習と直前ポイント演習・弱点補強演習のように、1 つの季節の中で別の講習を作るときに使います。
        枠ごとに時限と「月間の予定」(作成中 / 仮確定 / 確定) を持ち、タブはどれかの枠に入ります。
        本体の講師の月間の予定 (「講」) と講師別 Excel には枠の名前が出ます (講師別 Excel は枠ごとにも出せます)。
        講師・講師不在/NG・他学年セッションは季節で共通です。
      </p>

      {frames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="builder-active-tab-frame" className="font-bold text-builder-ink">「{activeTab.name}」の枠:</label>
          <select
            id="builder-active-tab-frame"
            className={inputCls}
            value={activeTab.config.frameId ?? ''}
            onChange={(e) => { void handleSetTabFrame(e.target.value === '' ? null : Number(e.target.value)); }}
          >
            <option value="">枠に入れない</option>
            {frames.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}

      {frames.length > 0 && (
        <ul className="space-y-2">
          {frames.map(f => {
            const tabs = tabsOfFrame(project, f.id);
            const range = frameRangeLabel(project, f.id);
            const periods = framePeriods(project, f);
            // ほかの枠と同じ名前の時限 (枠をまたいで同じ時限として扱う)
            const shared = periods.filter(p => frames.some(o => o.id !== f.id && o.periodIds.includes(p.id)));
            const state = framePublishState(project, f);
            return (
              <li key={f.id} className={`border rounded p-3 space-y-2 ${activeTab.config.frameId === f.id ? 'border-builder-blue' : 'border-builder-border'}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <DraftLineInput
                    value={f.name}
                    ariaLabel={`枠「${f.name}」の名前`}
                    className={`${inputCls} font-bold w-48`}
                    onCommit={(v) => {
                      const name = String(v).trim();
                      if (!name || name === f.name) return;
                      if (frames.some(o => o.id !== f.id && o.name === name)) {
                        showToast(`「${name}」という枠はもうあります`, 'error', 3000);
                        return;
                      }
                      renameFrame(f.id, name);
                    }}
                  />
                  <span className="text-builder-ink-muted">{range || '日付なし'}</span>
                  <label className="flex items-center gap-1 ml-auto">
                    <span className="text-builder-ink-muted">月間の予定</span>
                    <select
                      className={inputCls}
                      value={state}
                      aria-label={`枠「${f.name}」の月間の予定`}
                      onChange={(e) => { void handleFrameState(f.id, e.target.value as PublishState); }}
                    >
                      {PUBLISH_STATES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemove(f.id, f.name)}
                    aria-label={`枠「${f.name}」を消す`}
                    className="px-2 py-0.5 rounded border border-builder-danger-border text-builder-red hover:bg-builder-danger-soft"
                  >消す</button>
                </div>
                <div className="text-xs text-builder-ink">
                  タブ: {tabs.length > 0 ? tabs.map(t => t.name).join('・') : <span className="text-builder-ink-muted">(まだありません。タブを開いて、上の「(タブ名) の枠」で選ぶと入ります)</span>}
                </div>
                <label className="block text-xs">
                  <span className="font-bold text-builder-ink-muted">時限 (カンマ区切り・この枠のタブ共通)</span>
                  <DraftListTextarea value={periods.map(p => p.label).join(', ')} onCommit={(v) => commitPeriods(f.id, v)} />
                  <span className="block text-[11px] text-builder-ink-muted">
                    欄の外をクリックすると確定します (Esc で取り消し)。同じ名前の時限は、ほかの枠でも同じ時限として扱います (時刻を名前に入れてください)
                    {shared.length > 0 && <> — ほかの枠と同じ時限: {shared.map(p => p.label).join('、')}</>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {frames.length > 0 && unframedTabs.length > 0 && (
        <p className="text-xs text-builder-orange">枠に入っていないタブ: {unframedTabs.map(t => t.name).join('・')}</p>
      )}

      {creating && (
        <div className="border border-builder-blue rounded p-3 space-y-2 text-xs bg-builder-info-soft/30">
          <label className="flex flex-col gap-1 max-w-xs">
            <span className="font-bold text-builder-ink">新しい枠の名前</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 直前ポイント演習"
              className={inputCls}
              autoFocus
            />
          </label>
          <fieldset className="border-0 p-0 m-0 min-w-0">
            <legend className="font-bold text-builder-ink mb-1">この枠に入れるタブ (今の時限を枠の時限にします)</legend>
            <div className="flex flex-wrap gap-1.5">
              {project.tabs.map(t => {
                const inOther = t.config.frameId != null && frames.some(f => f.id === t.config.frameId);
                return (
                  <label key={t.id} className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded ${newTabIds.has(t.id) ? 'border-builder-blue bg-builder-info-soft font-bold' : 'border-builder-border'}`}>
                    <input type="checkbox" checked={newTabIds.has(t.id)} onChange={() => toggleNewTab(t.id)} />
                    {t.name}{inOther && <span className="text-builder-ink-muted font-normal">(ほかの枠から移す)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="text-[11px] text-builder-ink-muted">
            「月間の予定」は入れるタブの今の状態から始まります (どれかが作成中なら作成中)。
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={create} className="px-3 py-1 rounded bg-builder-blue text-white font-bold hover:bg-builder-blue-hover">作る</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1 rounded border border-builder-border bg-builder-surface hover:bg-builder-surface-alt">やめる</button>
          </div>
        </div>
      )}
    </section>
  );
}
