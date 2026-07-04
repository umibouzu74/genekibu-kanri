// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import Header from './Header';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Header は loadExcelExport() で動的 import するため、テスト中は
// vi.mock で実体を差し替える。テストファイルの先頭の vi.mock 呼び出しは
// hoist されるので import より前に評価される (vitest の仕様)。
vi.mock('../utils/excelExport', () => ({
  downloadScheduleExcel: vi.fn().mockResolvedValue(undefined),
  downloadTeacherExcel: vi.fn().mockResolvedValue(undefined),
}));

function renderHeader({ projectOverrides = {}, uiOverrides = {} } = {}) {
  const fileInputRef = createRef();
  const projectValue = {
    project: { name: '', teachers: [], tabs: [], combinedGroups: [], externalCounts: {} },
    saveStatus: '✅ 保存済',
    fileInputRef,
    handleSaveJson: vi.fn(),
    handleLoadJson: vi.fn(),
    updateProjectName: vi.fn(),
    ...projectOverrides,
  };
  const uiValue = {
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    ...uiOverrides,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <Header />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, projectValue, uiValue, fileInputRef };
}

describe('Header', () => {
  it('project.name が空なら "無題のプロジェクト" を表示', () => {
    renderHeader();
    expect(screen.getByText('無題のプロジェクト')).toBeInTheDocument();
  });

  it('project.name があればそれを表示する', () => {
    renderHeader({ projectOverrides: { project: { name: '2026年度 冬期講習', teachers: [], tabs: [], combinedGroups: [], externalCounts: {} } } });
    expect(screen.getByText('2026年度 冬期講習')).toBeInTheDocument();
  });

  it('プロジェクト名をクリックすると入力欄に切り替わる', () => {
    renderHeader();
    fireEvent.click(screen.getByText('無題のプロジェクト'));
    const input = screen.getByPlaceholderText('プロジェクト名を入力');
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('入力欄で Enter すると updateProjectName が呼ばれる', () => {
    const updateProjectName = vi.fn();
    renderHeader({ projectOverrides: { updateProjectName } });
    fireEvent.click(screen.getByText('無題のプロジェクト'));
    const input = screen.getByPlaceholderText('プロジェクト名を入力');
    fireEvent.change(input, { target: { value: '新名前' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateProjectName).toHaveBeenCalledWith('新名前');
  });

  it('入力欄で Escape すると updateProjectName は呼ばれず元の名前に戻る', () => {
    const updateProjectName = vi.fn();
    renderHeader({
      projectOverrides: {
        project: { name: '元の名前', teachers: [], tabs: [], combinedGroups: [], externalCounts: {} },
        updateProjectName,
      },
    });
    fireEvent.click(screen.getByText('元の名前'));
    const input = screen.getByPlaceholderText('プロジェクト名を入力');
    fireEvent.change(input, { target: { value: '途中入力' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(updateProjectName).not.toHaveBeenCalled();
    // 元の名前が表示に戻る
    expect(screen.getByText('元の名前')).toBeInTheDocument();
  });

  it('saveStatus が表示される', () => {
    renderHeader({ projectOverrides: { saveStatus: '💾 保存中...' } });
    expect(screen.getByText('💾 保存中...')).toBeInTheDocument();
  });

  it('プロジェクト保存ボタンで handleSaveJson が呼ばれる', () => {
    const handleSaveJson = vi.fn();
    renderHeader({ projectOverrides: { handleSaveJson } });
    fireEvent.click(screen.getByText(/プロジェクト保存/));
    expect(handleSaveJson).toHaveBeenCalled();
  });

  it('Excel ドロップダウンを開いて項目を選ぶと disabled + "⏳ 出力中..." 表示', async () => {
    renderHeader();
    // ドロップダウンを開く
    fireEvent.click(screen.getByText(/Excel出力/).closest('button'));
    fireEvent.click(screen.getByRole('menuitem', { name: /全体スケジュール/ }));
    // 同期的に exportingType='all' が set されるはず → 次の microtask で再描画
    await vi.waitFor(() => expect(screen.getByText(/⏳ 出力中/)).toBeInTheDocument());
    expect(screen.getByText(/⏳ 出力中/).closest('button')).toBeDisabled();
  });

  it('Excel 出力完了後は disabled が解除され成功 toast が出る', async () => {
    const showToast = vi.fn();
    renderHeader({ uiOverrides: { showToast } });
    fireEvent.click(screen.getByText(/Excel出力/).closest('button'));
    fireEvent.click(screen.getByRole('menuitem', { name: /全体スケジュール/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('全体Excelをダウンロードしました'));
    // ボタン文言が元に戻っていることを確認
    await vi.waitFor(() => expect(screen.getByText(/📊 Excel出力/)).toBeInTheDocument());
  });

  it('講師別スケジュールの項目で個人別 Excel を出力する', async () => {
    const showToast = vi.fn();
    renderHeader({ uiOverrides: { showToast } });
    fireEvent.click(screen.getByText(/Excel出力/).closest('button'));
    fireEvent.click(screen.getByRole('menuitem', { name: /講師別スケジュール/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('個人別Excelをダウンロードしました'));
  });
});

describe('Header — 配布用 Excel 出力 (L5c)', () => {
  it('「🎒 配布用 (注記なし)」で clean オプション付きの downloadScheduleExcel を呼ぶ', async () => {
    const mod = await import('../utils/excelExport');
    renderHeader();
    fireEvent.click(screen.getByText(/Excel出力/).closest('button'));
    fireEvent.click(screen.getByRole('menuitem', { name: /配布用/ }));
    await vi.waitFor(() =>
      expect(mod.downloadScheduleExcel).toHaveBeenCalledWith(expect.anything(), { clean: true }));
  });
});

describe('Header — 保存ステータスの可視化 (N1b)', () => {
  it('保存済は成功色バッジ + role=status', () => {
    renderHeader();
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('✅ 保存済');
    expect(badge.className).toContain('text-builder-green');
  });

  it('保存失敗は danger 色になり error toast を出す', () => {
    const { uiValue } = renderHeader({ projectOverrides: { saveStatus: '⚠️ 保存失敗' } });
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('text-builder-red');
    expect(badge.className).not.toContain('text-builder-green');
    expect(uiValue.showToast).toHaveBeenCalledWith(
      expect.stringContaining('自動保存に失敗'),
      'error',
      expect.any(Number),
    );
  });

  it('保存中は中立色で toast は出さない', () => {
    const { uiValue } = renderHeader({ projectOverrides: { saveStatus: '💾 保存中...' } });
    const badge = screen.getByRole('status');
    expect(badge.className).not.toContain('text-builder-green');
    expect(badge.className).not.toContain('text-builder-red');
    expect(uiValue.showToast).not.toHaveBeenCalled();
  });

  it('保存領域の使用量を常時表示する (N5c)', () => {
    localStorage.setItem('builder.test_dummy', 'x'.repeat(2048));
    try {
      renderHeader();
      // jsdom の localStorage に入れた 2KB+ が概算表示に出る (単位付き)
      expect(screen.getByTitle(/保存領域の使用量/)).toHaveTextContent(/(KB|MB|B)/);
    } finally {
      localStorage.removeItem('builder.test_dummy');
    }
  });
});
