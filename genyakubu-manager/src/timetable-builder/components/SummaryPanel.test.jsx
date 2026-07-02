// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function renderPanel({ generatedPatterns = [], generatedElapsedMs = 0, generatedForTab = null, project = {} } = {}) {
  const applyPattern = vi.fn();
  const projectValue = {
    project: {
      teachers: [{ name: '堀上', subjects: ['英語'] }],
      subjects: ['英語'],
      combinedGroups: [],
      ...project,
    },
    analysis: { teacherDailyCounts: {} },
    currentConfig: CONFIG,
    applyPattern,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={{ showToast: vi.fn() }}>
        <SummaryPanel
          showSummary={false}
          generatedPatterns={generatedPatterns}
          setGeneratedPatterns={vi.fn()}
          generatedElapsedMs={generatedElapsedMs}
          generatedForTab={generatedForTab}
        />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, applyPattern };
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

describe('SummaryPanel (生成元タブへの適用)', () => {
  const twoTabProject = {
    activeTabId: 2,
    dates: [{ id: 1, label: '12/25' }],
    periods: [{ id: 1, label: '1限' }],
    tabs: [
      { id: 1, name: '中３', config: { classes: [{ id: 1, label: '３S' }], subjectCounts: { 英語: 1 } }, schedule: {} },
      { id: 2, name: '中１・２', config: { classes: [{ id: 1, label: '１S' }], subjectCounts: { 英語: 1 } }, schedule: {} },
    ],
  };

  it('生成元タブ名をヘッダに表示する', () => {
    renderPanel({
      generatedPatterns: [fullPattern],
      generatedForTab: { id: 1, name: '中３' },
      project: twoTabProject,
    });
    expect(screen.getByText('対象タブ: 中３')).toBeInTheDocument();
  });

  it('別タブに切り替えた状態でも採用は生成元タブの id で applyPattern を呼ぶ', () => {
    const { applyPattern } = renderPanel({
      generatedPatterns: [fullPattern],
      generatedForTab: { id: 1, name: '中３' }, // active は 2 (中１・２)
      project: twoTabProject,
    });
    // 別タブ表示中である旨の案内が出る
    expect(screen.getByText(/「中３」タブ用です/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'この案を採用' }));
    expect(applyPattern).toHaveBeenCalledWith(fullPattern.schedule, 1);
  });

  it('生成元タブが削除済みなら採用ボタンを無効化して警告を出す', () => {
    const { applyPattern } = renderPanel({
      generatedPatterns: [fullPattern],
      generatedForTab: { id: 99, name: '消えたタブ' },
      project: twoTabProject,
    });
    expect(screen.getByText(/削除されたため/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'この案を採用' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(applyPattern).not.toHaveBeenCalled();
  });
});
