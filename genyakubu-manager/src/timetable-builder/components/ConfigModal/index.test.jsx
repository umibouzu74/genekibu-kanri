// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ConfigModal from './index';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

// sub-components はそれぞれ context を要求するが、ここでは ConfigModal
// (index.jsx) 自体の a11y / 閉じる挙動のみ検証したいので空に mock する。
vi.mock('./BasicSettings', () => ({ default: () => null }));
vi.mock('./TeacherManager', () => ({ default: () => null }));
vi.mock('./ClassPriority', () => ({ default: () => null }));
vi.mock('./AbsenceNgPanel', () => ({ default: () => null }));
vi.mock('./SubjectColorSettings', () => ({ default: () => null }));
vi.mock('./SubjectManager', () => ({ default: () => null }));
vi.mock('./CombinedGroupSettings', () => ({ default: () => null }));
vi.mock('./GenerationSettings', () => ({ default: () => null }));
vi.mock('./TemplateManager', () => ({ default: () => null }));

afterEach(cleanup);

function renderModal({ onClose = vi.fn() } = {}) {
  const projectValue = {
    project: { name: '', createdAt: null, updatedAt: null },
    handleResetAll: vi.fn(),
    updateProjectName: vi.fn(),
  };
  const uiValue = {
    showConfirm: vi.fn().mockResolvedValue(false),
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <ConfigModal onClose={onClose} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, onClose };
}

describe('ConfigModal (D5a a11y)', () => {
  it('role="dialog" + aria-modal="true" + aria-labelledby を持つ', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    // labelledby が指す要素 (h2) のテキストが「設定メニュー」を含む
    const labelId = dialog.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId);
    expect(label).toHaveTextContent('設定メニュー');
  });

  it('× ボタンに aria-label="設定を閉じる" が付き、クリックで onClose を呼ぶ', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText('設定を閉じる'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape キーで onClose を呼ぶ', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('背景クリックで onClose を呼ぶ、ダイアログ内クリックでは呼ばない', () => {
    const { onClose } = renderModal();
    // ダイアログ内 (h2) クリック → 呼ばれない
    fireEvent.click(screen.getByText(/設定メニュー/));
    expect(onClose).not.toHaveBeenCalled();
    // 背景 (outer overlay div)
    const overlay = document.querySelector('.fixed.inset-0');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfigModal (E1b tablist キーボード)', () => {
  it('role="tablist" / role="tab" / role="tabpanel" を持つ', () => {
    renderModal();
    expect(screen.getByRole('tablist', { name: '設定カテゴリ' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('初期は基本設定タブが aria-selected かつ tabIndex=0', () => {
    renderModal();
    const basic = screen.getByRole('tab', { name: '基本設定' });
    expect(basic).toHaveAttribute('aria-selected', 'true');
    expect(basic).toHaveAttribute('tabindex', '0');
    // 非選択タブは tabindex=-1
    const subjects = screen.getByRole('tab', { name: '📚 科目' });
    expect(subjects).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight でタブ選択が移動する', () => {
    renderModal();
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '📚 科目' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft は端で wrap して最後のタブ (🗂 テンプレート) を選択', () => {
    renderModal();
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: '🗂 テンプレート' })).toHaveAttribute('aria-selected', 'true');
  });

  it('クリックでもタブが切り替わる (既存挙動維持)', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: '🏫 クラス優先度' }));
    expect(screen.getByRole('tab', { name: '🏫 クラス優先度' })).toHaveAttribute('aria-selected', 'true');
  });
});
