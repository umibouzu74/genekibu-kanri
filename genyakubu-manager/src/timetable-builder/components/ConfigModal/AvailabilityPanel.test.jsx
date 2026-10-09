// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import AvailabilityPanel from './AvailabilityPanel';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';
import { HostDataContext } from '../../contexts/hostDataContext';
import { applyAvailabilityMarks, withAvailability } from '../../utils/availability';

afterEach(cleanup);

const P = (id, label) => ({ id, label });

function baseProject(overrides = {}) {
  return {
    name: '2026 夏期講習',
    updatedAt: '2026-07-01T00:00:00.000Z',
    dates: [P(1, '7/29(水)'), P(2, '7/30(木)')],
    periods: [P(1, '1限 (13:00~13:45)'), P(2, '2限 (13:55~14:40)')],
    tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [P(1, '3S'), P(2, '3A')], subjectCounts: {} } }],
    subjects: ['英語', '数学'],
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '山田', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [],
        availability: { '7/29(水)': { '1限 (13:00~13:45)': 'ok', '2限 (13:55~14:40)': 'ng' } },
        availabilityMemo: '19時以降なら可' },
      { name: '未定', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    ...overrides,
  };
}

function renderPanel({ project = baseProject(), ui = {}, partTimeStaffNames = [] } = {}) {
  const setTeacherAvailability = vi.fn();
  const clearTeacherAvailability = vi.fn();
  const setTeacherAvailabilityMemo = vi.fn();
  const uiValue = { showConfirm: vi.fn().mockResolvedValue(true), showToast: vi.fn(), ...ui };
  const utils = render(
    <ProjectContext.Provider value={{ project, setTeacherAvailability, clearTeacherAvailability, setTeacherAvailabilityMemo }}>
      <UIContext.Provider value={uiValue}>
        <HostDataContext.Provider value={{ offsiteLessons: [], holidays: [], partTimeStaffNames }}>
          <AvailabilityPanel />
        </HostDataContext.Provider>
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, setTeacherAvailability, clearTeacherAvailability, setTeacherAvailabilityMemo, uiValue };
}

// 回答を実際に書き換える (reducer と同じ形の操作を state で持つ) 版
function StatefulPanel({ initial }) {
  const [project, setProject] = useState(initial);
  const setTeacherAvailability = (name, cells, mark) => setProject(p => ({
    ...p,
    teachers: p.teachers.map(t => (t.name === name ? withAvailability(t, applyAvailabilityMarks(t.availability, cells, mark)) : t)),
  }));
  return (
    <ProjectContext.Provider value={{ project, setTeacherAvailability, clearTeacherAvailability: vi.fn(), setTeacherAvailabilityMemo: vi.fn() }}>
      <UIContext.Provider value={{ showConfirm: vi.fn().mockResolvedValue(true), showToast: vi.fn() }}>
        <HostDataContext.Provider value={{ offsiteLessons: [], holidays: [], partTimeStaffNames: [] }}>
          <AvailabilityPanel />
        </HostDataContext.Provider>
      </UIContext.Provider>
    </ProjectContext.Provider>
  );
}

describe('AvailabilityPanel — 回答の入力', () => {
  it('講師の一覧に回答状況を出し、未定は出さない', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /^堀上/ })).toHaveTextContent('未回答');
    expect(screen.getByRole('button', { name: /^山田/ })).toHaveTextContent('○1');
    expect(screen.queryByRole('button', { name: /^未定/ })).toBeNull();
  });

  it('マスを押すとペンの記号を付け、同じ記号のマスなら未記入へ戻す', () => {
    const { setTeacherAvailability } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^山田/ }));
    // 既定のペンは ○。○ のマスを押すと未記入へ
    fireEvent.click(screen.getByRole('button', { name: '7/29(水) 13:00-13:45: ○ 出られる' }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith(
      '山田', [{ date: '7/29(水)', period: '1限 (13:00~13:45)' }], null,
    );
    // × のマスを ○ ペンで押すと ○ に
    fireEvent.click(screen.getByRole('button', { name: '7/29(水) 13:55-14:40: × 出られない' }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith(
      '山田', [{ date: '7/29(水)', period: '2限 (13:55~14:40)' }], 'ok',
    );
  });

  it('ペンを × にして日付の見出しを押すとその日を全部 ×', () => {
    const { setTeacherAvailability } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^堀上/ }));
    fireEvent.click(screen.getByRole('radio', { name: '× 出られない' }));
    fireEvent.click(screen.getByRole('button', { name: '7/30(木) を全部×にする' }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith('堀上', [
      { date: '7/30(木)', period: '1限 (13:00~13:45)' },
      { date: '7/30(木)', period: '2限 (13:55~14:40)' },
    ], 'ng');
  });

  it('キー 3 でペンが × に切り替わる (パネル内のフォーカス時)', () => {
    renderPanel();
    const radio = screen.getByRole('radio', { name: '○ 出られる' });
    fireEvent.keyDown(radio, { key: '3' });
    expect(screen.getByRole('radio', { name: '× 出られない' })).toHaveAttribute('aria-checked', 'true');
  });

  it('未記入を × にする: 回答のある講師の未記入マスだけをまとめて ×', () => {
    const { setTeacherAvailability } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^山田/ }));
    fireEvent.click(screen.getByRole('button', { name: /未記入を × に \(2\)/ }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith('山田', [
      { date: '7/30(木)', period: '1限 (13:00~13:45)' },
      { date: '7/30(木)', period: '2限 (13:55~14:40)' },
    ], 'ng');
  });

  it('未回答の講師に「未記入を × に」は押せない (全部 × の事故を防ぐ)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^堀上/ }));
    expect(screen.getByRole('button', { name: /未記入を × に/ })).toBeDisabled();
  });

  it('回答を消すは確認のうえ clearTeacherAvailability', async () => {
    const { clearTeacherAvailability, uiValue } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^山田/ }));
    fireEvent.click(screen.getByRole('button', { name: '回答を消す' }));
    await vi.waitFor(() => expect(clearTeacherAvailability).toHaveBeenCalledWith('山田'));
    expect(uiValue.showConfirm).toHaveBeenCalled();
    expect(uiValue.showToast).toHaveBeenCalledWith('山田 の回答とメモを消しました', 'success', 2500);
  });

  it('前の季節の日付に残った回答だけの講師は未回答扱い (「未記入を × に」を押せない。消すことはできる)', () => {
    const project = baseProject();
    project.teachers[0] = { ...project.teachers[0], availability: { '12/25(金)': { '1限 (13:00~13:45)': 'ok' } } };
    renderPanel({ project });
    expect(screen.getByRole('button', { name: /^堀上/ })).toHaveTextContent('未回答');
    fireEvent.click(screen.getByRole('button', { name: /^堀上/ }));
    expect(screen.getByRole('button', { name: /未記入を × に/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '回答を消す' })).toBeEnabled();
  });

  it('◀ / ▶ で講師を移っても押したボタンにフォーカスが残る (作り直さない)', () => {
    const project = baseProject();
    project.teachers.splice(1, 0, { name: '石原', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] });
    renderPanel({ project });
    fireEvent.click(screen.getByRole('button', { name: /^堀上/ }));
    const next = screen.getByRole('button', { name: '次の講師' });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByText('石原 の回答')).toBeInTheDocument();
    expect(next).toBeEnabled();
    expect(document.activeElement).toBe(next);
  });

  it('ペンは矢印キーで移り、選ばれているものだけが Tab で止まる', () => {
    renderPanel();
    const ok = screen.getByRole('radio', { name: '○ 出られる' });
    expect(ok).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '△ 相談' })).toHaveAttribute('tabindex', '-1');
    ok.focus();
    fireEvent.keyDown(ok, { key: 'ArrowRight' });
    const maybe = screen.getByRole('radio', { name: '△ 相談' });
    expect(maybe).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(maybe);
  });

  it('メモの変換確定の Enter では保存しない', () => {
    const { setTeacherAvailabilityMemo } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^山田/ }));
    const input = screen.getByPlaceholderText(/19:00 以降なら可/);
    input.focus();
    fireEvent.change(input, { target: { value: '19じ' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(document.activeElement).toBe(input);
    expect(setTeacherAvailabilityMemo).not.toHaveBeenCalled();
  });

  it('メモは blur で 1 回だけ保存', () => {
    const { setTeacherAvailabilityMemo } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^山田/ }));
    const input = screen.getByPlaceholderText(/19:00 以降なら可/);
    expect(input).toHaveValue('19時以降なら可');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '18時以降なら可' } });
    expect(setTeacherAvailabilityMemo).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(setTeacherAvailabilityMemo).toHaveBeenCalledWith('山田', '18時以降なら可');
  });

  it('本体のバイトが居れば「バイトのみ」で絞れる (居なければ出さない)', () => {
    renderPanel({ partTimeStaffNames: ['山田', '本体だけの人'] });
    const toggle = screen.getByLabelText(/バイトのみ \(1 名\)/);
    expect(screen.getByRole('button', { name: /^堀上/ })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: /^堀上/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^山田/ })).toBeInTheDocument();
    cleanup();
    renderPanel();
    expect(screen.queryByLabelText(/バイトのみ/)).toBeNull();
  });

  it('授業のある日が無いときは案内だけ出す', () => {
    renderPanel({ project: baseProject({ tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {}, activePeriodIds: [] } }] }) });
    expect(screen.getByText(/授業のある日・時限がまだありません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /調査票を出力/ })).toBeDisabled();
  });
});

describe('AvailabilityPanel — 誰が入れるか', () => {
  it('回答のある講師だけを並べ、人数を押すとその時間の顔ぶれを出す', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: '👀 誰が入れるか' }));
    expect(screen.getByText(/1 名を非表示中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7/29(水) 13:00-13:45 に出られる人: 1 名' }));
    const detail = screen.getByText(/授業 2 クラス/).closest('div[aria-live]');
    expect(within(detail).getByText('山田(数学)')).toBeInTheDocument();
    expect(within(detail).getByText('堀上(英語)')).toBeInTheDocument(); // 未回答
  });

  it('一覧のマスもペンで付けられ、講師名で入力へ移る (フォーカスは入力の見出しへ)', () => {
    const { setTeacherAvailability } = renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: '👀 誰が入れるか' }));
    fireEvent.click(screen.getByRole('button', { name: '山田 7/30(木) 13:00-13:45: 未記入' }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith('山田', [{ date: '7/30(木)', period: '1限 (13:00~13:45)' }], 'ok');
    fireEvent.click(screen.getByRole('button', { name: /^山田 📝/ }));
    const heading = screen.getByText('山田 の回答');
    expect(heading).toBeInTheDocument();
    expect(document.activeElement).toBe(heading);
  });

  it('表示の切り替えはタブ (左右キーでも移る)', () => {
    renderPanel();
    const input = screen.getByRole('tab', { name: '✏️ 回答の入力' });
    expect(input).toHaveAttribute('aria-controls', 'availability-view-panel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', input.id);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '👀 誰が入れるか' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/1 名を非表示中/)).toBeInTheDocument();
  });

  it('一覧で最後の記号を消しても、その講師の行は消えない (行がずれて隣を押さないように)', () => {
    const project = baseProject();
    project.teachers[1] = { ...project.teachers[1], availability: { '7/29(水)': { '1限 (13:00~13:45)': 'ok' } } };
    render(<StatefulPanel initial={project} />);
    fireEvent.click(screen.getByRole('tab', { name: '👀 誰が入れるか' }));
    // ○ のペンで ○ のマスを押す → 未記入 (山田の回答は 0 になる)
    fireEvent.click(screen.getByRole('button', { name: '山田 7/29(水) 13:00-13:45: ○ 出られる' }));
    expect(screen.getByRole('button', { name: '山田 7/29(水) 13:00-13:45: 未記入' })).toBeInTheDocument();
  });

  it('顔ぶれを閉じると、押した人数のボタンへフォーカスを戻す', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: '👀 誰が入れるか' }));
    const count = screen.getByRole('button', { name: '7/29(水) 13:00-13:45 に出られる人: 1 名' });
    fireEvent.click(count);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText(/授業 2 クラス/)).toBeNull();
    expect(document.activeElement).toBe(count);
  });
});
