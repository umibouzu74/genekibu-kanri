// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SummaryPanel from './SummaryPanel';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(cleanup);

const CONFIG = {
  dates: [{ id: 1, label: '12/25' }],
  periods: [{ id: 1, label: '1限' }],
  classes: [{ id: 1, label: '３S' }],
  subjectCounts: { 英語: 1 },
};

function renderPanel({ generatedPatterns = [], generatedElapsedMs = 0 } = {}) {
  const projectValue = {
    project: {
      teachers: [{ name: '堀上', subjects: ['英語'] }],
      subjects: ['英語'],
      combinedGroups: [],
    },
    analysis: { teacherDailyCounts: {} },
    currentConfig: CONFIG,
    applyPattern: vi.fn(),
  };
  return render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={{ showToast: vi.fn() }}>
        <SummaryPanel
          showSummary={false}
          generatedPatterns={generatedPatterns}
          setGeneratedPatterns={vi.fn()}
          generatedElapsedMs={generatedElapsedMs}
        />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
}

const fullPattern = {
  schedule: {},
  isPartial: false,
  filledCount: 1,
  totalSlots: 1,
  iterations: 1234,
  hitLimit: false,
  stuckSlot: null,
};

describe('SummaryPanel (E2f 生成統計)', () => {
  it('案ごとに探索回数を表示する', () => {
    renderPanel({ generatedPatterns: [fullPattern] });
    expect(screen.getByText(/探索/)).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('部分解では詰まりセルと上限到達を表示する', () => {
    renderPanel({
      generatedPatterns: [{
        ...fullPattern,
        isPartial: true,
        hitLimit: true,
        stuckSlot: { date: '12/25', period: '2限', class: '３A' },
      }],
    });
    expect(screen.getByText('(上限到達)')).toBeInTheDocument();
    expect(screen.getByText(/12\/25 2限 ３A/)).toBeInTheDocument();
  });

  it('生成時間を結果ヘッダに表示する', () => {
    renderPanel({ generatedPatterns: [fullPattern], generatedElapsedMs: 2500 });
    expect(screen.getByText(/⏱ 2.5s/)).toBeInTheDocument();
  });

  it('iterations が無い案では統計行を出さない (後方互換)', () => {
    renderPanel({ generatedPatterns: [{ schedule: {}, isPartial: false, filledCount: 1, totalSlots: 1 }] });
    expect(screen.queryByText(/探索/)).not.toBeInTheDocument();
  });
});
