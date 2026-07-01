// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import BasicSettings from './BasicSettings';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

// 中３ (昼: 1限・2限) / 中１・２ (夜: 2限・3限) の 2 タブ。
// 日付プールは挿入順がバラバラ (実運用のズレを再現)。時限プールも中３専用の
// 1限と中１・２専用の3限が混在し、activePeriodIds で絞り込む前提を再現する。
function makeProject(overrides = {}) {
  return {
    dates: [
      { id: 1, label: '8/1(土)' },
      { id: 2, label: '7/24(金)' },
      { id: 3, label: '7/31(金)' },
    ],
    periods: [
      { id: 1, label: '1限(昼)' },
      { id: 2, label: '2限' },
      { id: 3, label: '3限(夜)' },
    ],
    tabs: [
      { id: 1, name: '中３', config: { classes: [], subjectCounts: {}, activeDateIds: [2, 3], activePeriodIds: [1, 2] }, schedule: {} },
      { id: 2, name: '中１・２', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2], activePeriodIds: [2, 3] }, schedule: {} },
    ],
    ...overrides,
  };
}

function renderSettings({ project = makeProject(), activeTabId = 1, overrides = {} } = {}) {
  const activeTab = project.tabs.find(t => t.id === activeTabId);
  const handleSetTabDatesByLabels = vi.fn();
  const handleToggleTabDate = vi.fn();
  const handleSetAllTabDates = vi.fn();
  const handleRemoveDateFromPool = vi.fn();
  const handleListConfigChange = vi.fn();
  const handleToggleTabPeriod = vi.fn();
  const handleSetAllTabPeriods = vi.fn();
  const projectValue = {
    project,
    activeTab,
    currentConfig: { classes: [{ id: 1, label: '1S' }] },
    handleListConfigChange,
    handleSaveAsDefault: vi.fn(),
    handleSetTabDatesByLabels,
    handleToggleTabDate,
    handleSetAllTabDates,
    handleRemoveDateFromPool,
    handleToggleTabPeriod,
    handleSetAllTabPeriods,
    ...overrides,
  };
  const uiValue = { showConfirm: vi.fn().mockResolvedValue(false), showToast: vi.fn() };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <BasicSettings />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return {
    handleSetTabDatesByLabels, handleToggleTabDate, handleSetAllTabDates, handleRemoveDateFromPool,
    handleListConfigChange, handleToggleTabPeriod, handleSetAllTabPeriods, uiValue,
  };
}

describe('BasicSettings — 使う日チェックリストの並び順', () => {
  it('プールの挿入順に関わらず実日付順で表示する', () => {
    renderSettings();
    // 時限チェックリストにも同じ接尾辞のチェックボックスがあるため、日付形式 (M/D…) だけに絞る
    const labels = screen.getAllByRole('checkbox', { name: /^\d+\/\d+.*をこのタブで使う/ }).map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual([
      '7/24(金) をこのタブで使う',
      '7/31(金) をこのタブで使う',
      '8/1(土) をこのタブで使う',
    ]);
  });
});

describe('BasicSettings — 手動追加 (日付ピッカー)', () => {
  it('日付を選んで追加すると M/D(曜) ラベルで handleSetTabDatesByLabels を呼ぶ', () => {
    const { handleSetTabDatesByLabels } = renderSettings();
    fireEvent.change(screen.getByLabelText('手動追加する日付'), { target: { value: '2026-08-08' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    // activeTab=中３ の現在の使う日 (7/24(金), 7/31(金)) に 8/8(土) を追加
    expect(handleSetTabDatesByLabels).toHaveBeenCalledWith(['7/24(金)', '7/31(金)', '8/8(土)']);
  });

  it('日付未選択では追加ボタンが disabled', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
  });

  it('既にこのタブで使っている日付を選ぶと警告して何もしない', () => {
    const { handleSetTabDatesByLabels, uiValue } = renderSettings();
    fireEvent.change(screen.getByLabelText('手動追加する日付'), { target: { value: '2026-07-24' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(handleSetTabDatesByLabels).not.toHaveBeenCalled();
    expect(uiValue.showToast).toHaveBeenCalledWith(expect.stringContaining('既に'), 'warning', expect.any(Number));
  });
});

describe('BasicSettings — 全タブまとめて表示', () => {
  it('トグルすると日付 × タブのマトリクスが日付順で表示される', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 日付を全タブまとめて表示' }));
    expect(screen.getByRole('columnheader', { name: /中３/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /中１・２/ })).toBeInTheDocument();
    // 中３ は 7/24, 7/31 が active (7/31 は表内 aria-label で判定)
    expect(screen.getByRole('checkbox', { name: '7/31(金) を「中３」で使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '8/1(土) を「中３」で使う' })).not.toBeChecked();
    // 中１・２ は 8/1, 7/24 が active
    expect(screen.getByRole('checkbox', { name: '8/1(土) を「中１・２」で使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '7/31(金) を「中１・２」で使う' })).not.toBeChecked();
  });

  it('他タブの列のチェックボックスを切り替えると tabId 付きで handleToggleTabDate を呼ぶ', () => {
    const { handleToggleTabDate } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 日付を全タブまとめて表示' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '8/1(土) を「中３」で使う' }));
    expect(handleToggleTabDate).toHaveBeenCalledWith(1, 1);
  });

  it('列ヘッダの「全」「無」は対象タブの id 付きで handleSetAllTabDates を呼ぶ', () => {
    const { handleSetAllTabDates } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 日付を全タブまとめて表示' }));
    fireEvent.click(screen.getByTitle('「中１・２」を全選択'));
    expect(handleSetAllTabDates).toHaveBeenCalledWith(true, 2);
  });
});

describe('BasicSettings — 時限プール編集 (タブでフィルタしない)', () => {
  it('プール編集テキストエリアは現在のタブが使わない時限も含めた全件を表示する', () => {
    renderSettings();
    // activeTab=中３ は activePeriodIds=[1,2] だが、テキストエリアはプール全体 (1〜3) を表示する
    expect(screen.getByLabelText(/時限プールを編集/)).toHaveValue('1限(昼), 2限, 3限(夜)');
  });

  it('プール編集を保存すると handleListConfigChange(\'periods\', ...) を呼ぶ', () => {
    const { handleListConfigChange } = renderSettings();
    fireEvent.change(screen.getByLabelText(/時限プールを編集/), { target: { value: '1限(昼), 2限, 3限(夜), 4限(昼)' } });
    expect(handleListConfigChange).toHaveBeenCalledWith('periods', '1限(昼), 2限, 3限(夜), 4限(昼)');
  });
});

describe('BasicSettings — 使う時限チェックリスト', () => {
  it('activePeriodIds で絞ったタブの使う時限だけチェックが付く', () => {
    renderSettings(); // activeTab=中３: activePeriodIds=[1,2]
    expect(screen.getByRole('checkbox', { name: '1限(昼) をこのタブで使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2限 をこのタブで使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '3限(夜) をこのタブで使う' })).not.toBeChecked();
  });

  it('チェック切り替えは tabId 無しで handleToggleTabPeriod を呼ぶ', () => {
    const { handleToggleTabPeriod } = renderSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: '3限(夜) をこのタブで使う' }));
    expect(handleToggleTabPeriod).toHaveBeenCalledWith(3);
  });

  it('全選択/全解除ボタンは tabId 無しで handleSetAllTabPeriods を呼ぶ', () => {
    const { handleSetAllTabPeriods } = renderSettings();
    fireEvent.click(screen.getAllByRole('button', { name: '全選択' })[1]);
    expect(handleSetAllTabPeriods).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getAllByRole('button', { name: '全解除' })[1]);
    expect(handleSetAllTabPeriods).toHaveBeenCalledWith(false);
  });
});

describe('BasicSettings — 時限の全タブまとめて表示', () => {
  it('トグルすると時限 × タブのマトリクスがプール順で表示される', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 時限を全タブまとめて表示' }));
    // 中３: activePeriodIds=[1,2] → 1限(昼)・2限 が active、3限(夜) は非active
    expect(screen.getByRole('checkbox', { name: '1限(昼) を「中３」で使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '3限(夜) を「中３」で使う' })).not.toBeChecked();
    // 中１・２: activePeriodIds=[2,3] → 2限・3限(夜) が active、1限(昼) は非active
    expect(screen.getByRole('checkbox', { name: '3限(夜) を「中１・２」で使う' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '1限(昼) を「中１・２」で使う' })).not.toBeChecked();
  });

  it('他タブの列のチェックボックスを切り替えると tabId 付きで handleToggleTabPeriod を呼ぶ', () => {
    const { handleToggleTabPeriod } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 時限を全タブまとめて表示' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '1限(昼) を「中１・２」で使う' }));
    expect(handleToggleTabPeriod).toHaveBeenCalledWith(1, 2);
  });

  it('列ヘッダの「全選」「全解」は対象タブの id 付きで handleSetAllTabPeriods を呼ぶ', () => {
    const { handleSetAllTabPeriods } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '🗂 時限を全タブまとめて表示' }));
    fireEvent.click(screen.getByTitle('「中１・２」を全選択'));
    expect(handleSetAllTabPeriods).toHaveBeenCalledWith(true, 2);
  });
});
