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

describe('ConfigModal — プロジェクト名の外部変更への同期 (F5k)', () => {
  it('project.name が外から変わったら入力欄も追従する (stale 上書き防止)', () => {
    const onClose = vi.fn();
    const updateProjectName = vi.fn();
    const makeValue = (name) => ({
      project: { name, createdAt: null, updatedAt: null },
      handleResetAll: vi.fn(),
      updateProjectName,
    });
    const uiValue = { showConfirm: vi.fn().mockResolvedValue(false) };
    const tree = (name) => (
      <ProjectContext.Provider value={makeValue(name)}>
        <UIContext.Provider value={uiValue}>
          <ConfigModal onClose={onClose} />
        </UIContext.Provider>
      </ProjectContext.Provider>
    );
    const { rerender } = render(tree('冬期2025'));
    const input = screen.getByLabelText('プロジェクト名');
    expect(input).toHaveValue('冬期2025');
    // モーダルを開いたままテンプレート適用 / undo 等で name が変わる
    rerender(tree('春期2026'));
    expect(input).toHaveValue('春期2026');
    // 旧実装はここで '冬期2025' のままで、blur すると新名を旧名で上書きした
    fireEvent.blur(input);
    expect(updateProjectName).not.toHaveBeenCalled();
  });
});

// 講習は季節ごとの時間割 (2026-10-23)。リセットはその季節だけ、作り直しは設定を残す
describe('ConfigModal の季節 (リセット・次の年度用に作り直す)', () => {
  const summerProject = {
    version: 4,
    name: '2026 夏期講習',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: ['7/29(水)-1限'], ngClasses: [], priorityClasses: [] }],
    activeTabId: 1,
    dates: [{ id: 1, label: '7/29(水)' }],
    periods: [{ id: 1, label: '1限' }],
    tabs: [{ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: { 英語: 2 } }, schedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } } }],
    subjects: ['英語'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
  };

  function renderSeasonModal({ confirm = true, input = '2027 夏期講習' } = {}) {
    const projectValue = {
      project: summerProject,
      handleResetAll: vi.fn(),
      updateProjectName: vi.fn(),
      pushHistory: vi.fn(),
    };
    const uiValue = {
      showConfirm: vi.fn().mockResolvedValue(confirm),
      showInput: vi.fn().mockResolvedValue(input),
      showToast: vi.fn(),
    };
    render(
      <ProjectContext.Provider value={projectValue}>
        <UIContext.Provider value={uiValue}>
          <ConfigModal onClose={vi.fn()} season="summer" />
        </UIContext.Provider>
      </ProjectContext.Provider>,
    );
    return { projectValue, uiValue };
  }

  it('リセットは「夏期講習のデータをリセット」で、確認にほかの季節は残ると出す', async () => {
    const { projectValue, uiValue } = renderSeasonModal();
    fireEvent.click(screen.getByRole('button', { name: /夏期講習のデータをリセット/ }));
    await vi.waitFor(() => expect(projectValue.handleResetAll).toHaveBeenCalled());
    expect(uiValue.showConfirm.mock.calls[0][0]).toContain('ほかの講習');
  });

  it('作り直すと、設定を残して日付・時間割・NG を空にした project を履歴に積む', async () => {
    const { projectValue, uiValue } = renderSeasonModal();
    fireEvent.click(screen.getByRole('button', { name: /次の夏期講習用に作り直す/ }));
    await vi.waitFor(() => expect(projectValue.pushHistory).toHaveBeenCalledTimes(1));
    const next = projectValue.pushHistory.mock.calls[0][0];
    expect(next.name).toBe('2027 夏期講習');
    expect(next.dates).toEqual([]);
    expect(next.tabs[0].schedule).toEqual({});
    expect(next.teachers[0]).toMatchObject({ name: '堀上', ngSlots: [] });
    expect(uiValue.showToast).toHaveBeenCalled();
  });

  it('確認で取り消せば何もしない', async () => {
    const { projectValue, uiValue } = renderSeasonModal({ confirm: false });
    fireEvent.click(screen.getByRole('button', { name: /次の夏期講習用に作り直す/ }));
    await vi.waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    expect(projectValue.pushHistory).not.toHaveBeenCalled();
  });
});
