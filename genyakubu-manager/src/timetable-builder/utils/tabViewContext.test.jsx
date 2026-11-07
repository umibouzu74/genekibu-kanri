// @vitest-environment jsdom
// まとめて印刷 (L2h) はタブを切り替えずに各タブを描く。差し替えたコンテキストの値が、
// 本当にそのタブを開いたときの値 (ProjectProvider = useProject + useAnalysis) と同じかを
// 突き合わせる (導出を片方だけ変えたらここで止まる)。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ProjectProvider } from '../contexts/ProjectContext';
import { useProjectContext } from '../contexts/projectContextValue';
import { buildTabViewContext, globalUsageOf } from './tabViewContext';
import { seasonStorage } from './seasons';

const T = (name, subjects, extra = {}) => ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [], ...extra });

function project(activeTabId) {
  return {
    version: 4,
    name: '2026 冬期講習',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    // 堀上は 12/25 1限 に NG (手動)
    teachers: [T('堀上', ['英語'], { ngSlots: ['12/25(金)-1限'] }), T('小松', ['国語']), T('田中', ['数学'])],
    activeTabId,
    dates: [{ id: 1, label: '12/25(金)' }, { id: 2, label: '12/26(土)' }, { id: 3, label: '12/28(月)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [
      {
        id: 1,
        name: '中3',
        config: { classes: [{ id: 1, label: '3S' }, { id: 2, label: '3A' }], subjectCounts: { 英語: 2, 国語: 1, 数学: 1 } },
        schedule: {
          'd1-p1-c1': { subject: '英語', teacher: '堀上' },
          'd1-p2-c1': { subject: '国語', teacher: '小松' },
        },
      },
      {
        id: 2,
        name: '中1・2',
        config: {
          // 3 クラスのうち 1B は 1A に丸ごと合同、使う日は 1・2 日目だけ
          classes: [{ id: 1, label: '1S' }, { id: 2, label: '1A' }, { id: 3, label: '1B', mergedInto: 2 }],
          subjectCounts: { 英語: 2, 国語: 1, 数学: 1 },
          activeDateIds: [1, 2],
        },
        schedule: {
          // 中3 と同じ時間に小松 (講師の重なり)
          'd1-p2-c2': { subject: '国語', teacher: '小松' },
          'd2-p1-c1': { subject: '英語', teacher: '堀上' },
          'd2-p2-c1': { subject: '英語', teacher: '堀上' },
          'd1-p1-c1': { subject: '数学', teacher: '田中' },
        },
        dayStatuses: { 2: 'check' },
      },
    ],
    subjects: ['英語', '数学', '国語'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [{ teacher: '田中', date: '12/26(土)', start: '13:00', end: '14:00' }],
    externalSessionPresets: [],
    snapshots: [],
  };
}

function captureContext(season, activeTabId) {
  localStorage.setItem(seasonStorage(season).storageKey, JSON.stringify(project(activeTabId)));
  let ctx = null;
  function Capture() {
    ctx = useProjectContext();
    return null;
  }
  render(
    <ProjectProvider storage={seasonStorage(season)}>
      <Capture />
    </ProjectProvider>,
  );
  return ctx;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const ANALYSIS_KEYS = ['conflictMap', 'subjectOrders', 'dailySubjectMap', 'errorKeys', 'ngViolationKeys', 'incompleteDateIds', 'teacherDailyCounts'];

describe('buildTabViewContext', () => {
  it('開いていないタブの値が、そのタブを開いたときの値と同じ', () => {
    const open1 = captureContext('summer', 1);
    const open2 = captureContext('winter', 2);
    const view2 = buildTabViewContext(open1, 2, globalUsageOf(open1.project));

    expect(view2.project.activeTabId).toBe(2);
    expect(view2.activeTab).toEqual(open2.activeTab);
    expect(view2.currentSchedule).toEqual(open2.currentSchedule);
    expect(view2.currentConfig).toEqual(open2.currentConfig);
    for (const k of ANALYSIS_KEYS) expect(view2.analysis[k]).toEqual(open2.analysis[k]);
    // 丸ごと合同・使う日の絞り込みが効いている (2 クラス × 2 日)
    expect(view2.currentConfig.classes.map(c => c.label)).toEqual(['1S', '1A']);
    expect(view2.currentConfig.dates.map(d => d.id)).toEqual([1, 2]);
    // 講師の重なり (中3 と同じ時間の小松) と同じ日の同じ科目を拾っている
    expect(Object.keys(view2.analysis.conflictMap).length).toBeGreaterThan(0);
    expect(view2.analysis.dailySubjectMap['c1-d2-英語']).toBe(2);
    // 元の値 (開いているタブ) は書き換えない
    expect(open1.project.activeTabId).toBe(1);
    expect(open1.activeTab.id).toBe(1);
  });

  it('開いているタブはそのまま、無いタブは null', () => {
    const open1 = captureContext('summer', 1);
    const gu = globalUsageOf(open1.project);
    expect(buildTabViewContext(open1, 1, gu)).toBe(open1);
    expect(buildTabViewContext(open1, 99, gu)).toBeNull();
  });
});
