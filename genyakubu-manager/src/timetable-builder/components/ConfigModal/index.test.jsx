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
