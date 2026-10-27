// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CourseEventNotice from './CourseEventNotice';
import { ProjectContext } from '../contexts/projectContextValue';
import { HostDataContext } from '../contexts/hostDataContext';

afterEach(cleanup);

const P = (id, label) => ({ id, label });
const project = {
  name: '2026 冬期講習',
  updatedAt: '2026-10-27T00:00:00.000Z',
  dates: [P(1, '1/4(月)'), P(2, '1/5(火)'), P(3, '1/7(木)')],
  periods: [P(1, '1限')],
  tabs: [{ id: 1, name: '中３', config: { classes: [], subjectCounts: {} }, schedule: {} }],
};

function renderNotice(specialEvents) {
  render(
    <HostDataContext.Provider value={{ offsiteLessons: [], holidays: [], partTimeStaffNames: [], retiredTeacherNames: [], specialEvents }}>
      <ProjectContext.Provider value={{ project }}>
        <CourseEventNotice />
      </ProjectContext.Provider>
    </HostDataContext.Provider>,
  );
}

describe('CourseEventNotice', () => {
  it('食い違いがあれば件数を出し、開くと内容を出す', () => {
    renderNotice([{ id: 1, name: '冬期講習（後半）', startDate: '2027-01-04', endDate: '2027-01-06', eventType: 'course', targetGrades: [] }]);
    const region = screen.getByRole('region', { name: '行事予定と講習の日程の食い違い' });
    expect(region).toHaveTextContent('(2 件)');
    fireEvent.click(screen.getByRole('button', { name: '▼ 内容を見る' }));
    expect(region).toHaveTextContent('中３ の 1/7(木) は、行事予定の講習の期間に入っていません');
    expect(region).toHaveTextContent('行事予定「冬期講習（後半）」1/4〜1/6 のうち 1/6(水) は、どのタブも使っていません');
  });

  it('食い違いが無ければ何も出さない', () => {
    renderNotice([
      { id: 1, name: '冬期講習', startDate: '2027-01-04', endDate: '2027-01-05', eventType: 'course', targetGrades: [] },
      { id: 2, name: '冬期講習 (最終日)', startDate: '2027-01-07', endDate: '2027-01-07', eventType: 'course', targetGrades: [] },
    ]);
    expect(screen.queryByRole('region')).toBeNull();
  });
});
