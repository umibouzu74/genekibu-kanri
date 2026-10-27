// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TimetableCopyDialog from './TimetableCopyDialog';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';
import { HostDataContext } from '../contexts/hostDataContext';
import { makeKey } from '../utils/scheduleKey';

afterEach(cleanup);

const P = (id, label) => ({ id, label });
const T = (name) => ({ name, subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] });

const previousTimetable = {
  name: '2025 冬期講習',
  savedAt: '2026-10-27T00:00:00.000Z',
  tabs: [{
    name: '中３',
    dates: ['12/25(木)', '12/26(金)'],
    periods: ['1限', '2限'],
    classes: ['3S401', '3C'],
    cells: [
      { d: 0, p: 0, c: 0, subject: '英語', teacher: '堀上' },
      { d: 0, p: 1, c: 0, subject: '数学', teacher: '福江' },
      { d: 1, p: 0, c: 1, subject: '理科', teacher: '三宮' },
      { d: 1, p: 1, c: 1, subject: '英語', teacher: '高松' },
    ],
  }],
};

function renderDialog({ project: overrides = {}, retired = ['高松'], partTime = ['福江'] } = {}) {
  const project = {
    name: '2026 冬期講習',
    teachers: [T('堀上'), T('福江'), T('高松')],
    dates: [P(1, '12/25(金)'), P(2, '12/26(土)')],
    periods: [P(1, '1限'), P(2, '2限')],
    activeTabId: 1,
    tabs: [{ id: 1, name: '中３', config: { classes: [P(1, '3S'), P(2, '3C')], subjectCounts: {} }, schedule: {} }],
    subjects: ['英語', '数学', '理科'],
    previousTimetable,
    ...overrides,
  };
  const importScheduleCells = vi.fn();
  const showToast = vi.fn();
  const onClose = vi.fn();
  render(
    <HostDataContext.Provider value={{ offsiteLessons: [], holidays: [], partTimeStaffNames: partTime, retiredTeacherNames: retired }}>
      <ProjectContext.Provider value={{ project, importScheduleCells }}>
        <UIContext.Provider value={{ showToast, showConfirm: vi.fn() }}>
          <TimetableCopyDialog onClose={onClose} />
        </UIContext.Provider>
      </ProjectContext.Provider>
    </HostDataContext.Provider>,
  );
  return { importScheduleCells, showToast, onClose };
}

describe('TimetableCopyDialog', () => {
  it('作り直す前の控えから N 日目 → N 日目・同じクラス (教室番号の付け外しも) へ写す。バイト・退職・マスタにいない人は講師を空に', () => {
    const { importScheduleCells, onClose } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: '📋 前の講習の時間割を写す' });
    expect(dialog).toHaveTextContent('写す元: 作り直す前の時間割「2025 冬期講習」');
    // 既定で入れるのは講師マスタにいて、バイトでも退職でもない人だけ
    expect(within(dialog).getByLabelText('堀上 を講師として入れる')).toBeChecked();
    expect(within(dialog).getByLabelText('福江 を講師として入れる')).not.toBeChecked();
    expect(within(dialog).getByLabelText('高松 を講師として入れる')).not.toBeChecked();
    expect(within(dialog).getByLabelText('三宮 を講師として入れる')).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('4 コマを写します (うち講師を空にする 3 コマ)');

    fireEvent.click(within(dialog).getByRole('button', { name: '写す (4 コマ)' }));
    expect(importScheduleCells).toHaveBeenCalledWith([
      { tabId: 1, key: makeKey(1, 1, 1), subject: '英語', teacher: '堀上' },
      { tabId: 1, key: makeKey(1, 2, 1), subject: '数学', teacher: '' },
      { tabId: 1, key: makeKey(2, 1, 2), subject: '理科', teacher: '' },
      { tabId: 1, key: makeKey(2, 2, 2), subject: '英語', teacher: '' },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('講師を入れる人を足せる。日付の対応を外すとその日の分は写さない', () => {
    const { importScheduleCells } = renderDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('福江 を講師として入れる'));
    fireEvent.click(within(dialog).getByRole('button', { name: '▼ 日付・時限・クラスの対応' }));
    fireEvent.change(within(dialog).getByLabelText('日付 (N 日目): 2日目 12/26(金) を写す先'), { target: { value: '' } });
    expect(within(dialog).getByRole('status')).toHaveTextContent('対応が無いので写さない: 2 コマ');
    fireEvent.click(within(dialog).getByRole('button', { name: '写す (2 コマ)' }));
    expect(importScheduleCells).toHaveBeenCalledWith([
      { tabId: 1, key: makeKey(1, 1, 1), subject: '英語', teacher: '堀上' },
      { tabId: 1, key: makeKey(1, 2, 1), subject: '数学', teacher: '福江' },
    ]);
  });

  it('控えが無ければ JSON から選ぶよう案内し、写すボタンは押せない', () => {
    renderDialog({ project: { previousTimetable: undefined } });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('控えはありません');
    expect(within(dialog).getByRole('button', { name: /^写す/ })).toBeDisabled();
  });
});
