// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import AvailabilityPanel from './AvailabilityPanel';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

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

function renderPanel({ project = baseProject(), ui = {} } = {}) {
  const setTeacherAvailability = vi.fn();
  const clearTeacherAvailability = vi.fn();
  const setTeacherAvailabilityMemo = vi.fn();
  const uiValue = { showConfirm: vi.fn().mockResolvedValue(true), showToast: vi.fn(), ...ui };
  const utils = render(
    <ProjectContext.Provider value={{ project, setTeacherAvailability, clearTeacherAvailability, setTeacherAvailabilityMemo }}>
      <UIContext.Provider value={uiValue}>
        <AvailabilityPanel />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, setTeacherAvailability, clearTeacherAvailability, setTeacherAvailabilityMemo, uiValue };
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

  it('一覧のマスもペンで付けられ、講師名で入力へ移る', () => {
    const { setTeacherAvailability } = renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: '👀 誰が入れるか' }));
    fireEvent.click(screen.getByRole('button', { name: '山田 7/30(木) 13:00-13:45: 未記入' }));
    expect(setTeacherAvailability).toHaveBeenLastCalledWith('山田', [{ date: '7/30(木)', period: '1限 (13:00~13:45)' }], 'ok');
    fireEvent.click(screen.getByRole('button', { name: /^山田 📝/ }));
    expect(screen.getByText('山田 の回答')).toBeInTheDocument();
  });
});
