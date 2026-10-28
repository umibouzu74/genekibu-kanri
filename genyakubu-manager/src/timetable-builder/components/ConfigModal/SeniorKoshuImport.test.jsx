// @vitest-environment jsdom
// 講師不在・NG の「🎓 本体の高校・予備校の講習を取り込む」: 件数を出し、押したときだけ
// 1 アクションで取り込む (手で入れた同じ講師・日・時刻のものは既定で置き換える)。
// プールに無い日は外部授業だけの日として足せる。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SeniorKoshuImport from './SeniorKoshuImport';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';
import { HostDataContext } from '../../contexts/hostDataContext';

afterEach(cleanup);

const project = {
  version: 4,
  name: '2026 冬期講習',
  updatedAt: '2026-11-20T00:00:00.000Z',
  teachers: [{ name: '滝澤', subjects: ['理科'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
  activeTabId: 1,
  dates: [{ id: 2, label: '12/25(金)' }],
  periods: [{ id: 1, label: '1限' }],
  tabs: [{ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {}, activeDateIds: [2] }, schedule: {} }],
  externalSessions: [
    { id: 5, date: '12/25(金)', teacherName: '滝澤', label: '12:25-13:35', memo: 'Ⅰ期 予備校３限', startTime: '12:25', endTime: '13:35' },
  ],
  externalSessionPresets: [],
};
const items = [
  { key: '1:2026-12-25', teacher: '滝澤', date: '2026-12-25', time: '12:25-13:35', termName: '高3 Ⅰ期', periodName: '予備校３限', grade: '高3', course: '化学基礎' },
  { key: '1:2026-12-24', teacher: '滝澤', date: '2026-12-24', time: '12:25-13:35', termName: '高3 Ⅰ期', periodName: '予備校３限', grade: '高3', course: '化学基礎' },
  { key: '2:2026-12-25', teacher: '伊藤', date: '2026-12-25', time: '12:25-13:35', termName: '高3 Ⅰ期', periodName: '予備校３限', grade: '高3', course: '物理基礎' },
];

function renderIt(hostItems = items, proj = project) {
  const ctx = { project: proj, replaceExternalSessions: vi.fn(), handleAddExternalOnlyDates: vi.fn() };
  const ui = { showToast: vi.fn(), showConfirm: vi.fn(), showInput: vi.fn() };
  render(
    <HostDataContext.Provider value={{ offsiteLessons: [], holidays: [], partTimeStaffNames: [], retiredTeacherNames: [], seniorKoshuItems: hostItems }}>
      <ProjectContext.Provider value={ctx}>
        <UIContext.Provider value={ui}>
          <SeniorKoshuImport />
        </UIContext.Provider>
      </ProjectContext.Provider>
    </HostDataContext.Provider>,
  );
  return { ctx, ui };
}

describe('SeniorKoshuImport', () => {
  it('本体に登録が無ければ出さない', () => {
    renderIt([]);
    expect(screen.queryByText(/高校・予備校の講習を取り込む/)).toBeNull();
  });

  it('取り込む: 手で入れた同じ講師・日・時刻のものは既定で置き換える', () => {
    const { ctx, ui } = renderIt();
    expect(screen.getByText(/講習の講師に居ない名前は取り込みません: 伊藤/)).toBeTruthy();
    expect(screen.getByText(/12\/24\(木\) 1件/)).toBeTruthy();
    expect(screen.getByLabelText(/講師・日・時刻が同じ/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    const [removeIds, added] = ctx.replaceExternalSessions.mock.calls[0];
    expect(removeIds).toEqual([5]);
    expect(added.map(s => [s.date, s.course, s.source])).toEqual([['12/25(金)', '高3 化学基礎', 'seniorKoshu']]);
    expect(ui.showToast.mock.calls[0][0]).toContain('1 件を取り込み、手で入れた 1 件を置き換えました');
  });

  it('置き換えを外すと手で入れたものは残す', () => {
    const { ctx } = renderIt();
    fireEvent.click(screen.getByLabelText(/講師・日・時刻が同じ/));
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    expect(ctx.replaceExternalSessions.mock.calls[0][0]).toEqual([]);
  });

  it('本体で全部消しても、前に取り込んだものが残っていれば出して消せる', () => {
    const imported = {
      ...project,
      externalSessions: [
        { id: 9, date: '12/25(金)', teacherName: '滝澤', label: '12:25-13:35', memo: '高3 Ⅰ期 予備校３限', course: '高3 化学基礎', startTime: '12:25', endTime: '13:35', source: 'seniorKoshu', sourceKey: '1:2026-12-25' },
      ],
    };
    const { ctx } = renderIt([], imported);
    expect(screen.getByText(/本体に無くなった \(消す\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    expect(ctx.replaceExternalSessions).toHaveBeenCalledWith([9], []);
  });

  it('当たる予定が無いときと取り込み済みのときで、ボタンの言い方を分ける', () => {
    renderIt([{ ...items[0], date: '2026-08-01', key: 'x' }]);
    expect(screen.getByRole('button', { name: '取り込むものはありません (この講習の日に当たる予定がありません)' })).toBeDisabled();
  });

  it('日付プールに無い日は外部授業だけの日として足せる', () => {
    const { ctx } = renderIt();
    fireEvent.click(screen.getByRole('button', { name: '外部授業だけの日として足す (1 日)' }));
    expect(ctx.handleAddExternalOnlyDates).toHaveBeenCalledWith(['12/24(木)']);
  });
});
