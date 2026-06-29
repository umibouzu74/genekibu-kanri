// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TemplateManager from './TemplateManager';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';
import { STORAGE_KEY_TEMPLATES } from '../../utils/constants';

afterEach(() => { cleanup(); localStorage.clear(); });

function renderManager({ project: projectOverride = {}, ui = {} } = {}) {
  const fns = { applyTemplateFull: vi.fn(), importTeachers: vi.fn() };
  const projectValue = {
    project: { name: 'いまのP', teachers: [{ name: '堀上', subjects: ['英語'] }], tabs: [{ id: 1 }], ...projectOverride },
    ...fns,
  };
  const uiValue = {
    showInput: vi.fn().mockResolvedValue(null),
    showConfirm: vi.fn().mockResolvedValue(true),
    showToast: vi.fn(),
    ...ui,
  };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <TemplateManager />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { fns, uiValue };
}

const seed = (templates) => localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
const tpl = (id, name, payload = { teachers: [{ name: 'A' }], tabs: [{ id: 1 }] }) =>
  ({ id, name, createdAt: '2026-06-29T00:00:00.000Z', payload });

describe('TemplateManager (E2d)', () => {
  it('テンプレートが無ければ空状態の案内を出す', () => {
    renderManager();
    expect(screen.getByText(/保存されたテンプレートはありません/)).toBeInTheDocument();
  });

  it('保存済みテンプレートを一覧表示する', () => {
    seed([tpl(1, '去年ベース')]);
    renderManager();
    expect(screen.getByText('去年ベース')).toBeInTheDocument();
  });

  it('「＋ 現在のプロジェクトを保存」で showInput → localStorage に保存', async () => {
    const { uiValue } = renderManager({ ui: { showInput: vi.fn().mockResolvedValue('新テンプレ') } });
    fireEvent.click(screen.getByText('＋ 現在のプロジェクトを保存'));
    await waitFor(() => expect(screen.getByText('新テンプレ')).toBeInTheDocument());
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('新テンプレ');
    expect(uiValue.showToast).toHaveBeenCalled();
  });

  it('「全体を適用」で confirm → applyTemplateFull(payload) を呼ぶ', async () => {
    seed([tpl(1, 'A', { teachers: [], tabs: [{ id: 9 }] })]);
    const { fns } = renderManager({ ui: { showConfirm: vi.fn().mockResolvedValue(true) } });
    fireEvent.click(screen.getByText('全体を適用'));
    await waitFor(() => expect(fns.applyTemplateFull).toHaveBeenCalledWith({ teachers: [], tabs: [{ id: 9 }] }));
  });

  it('「講師のみ」で confirm → importTeachers(teachers, "replace") を呼ぶ', async () => {
    seed([tpl(1, 'A', { teachers: [{ name: 'X' }, { name: 'Y' }], tabs: [] })]);
    const { fns } = renderManager({ ui: { showConfirm: vi.fn().mockResolvedValue(true) } });
    fireEvent.click(screen.getByText('講師のみ'));
    await waitFor(() => expect(fns.importTeachers).toHaveBeenCalledWith([{ name: 'X' }, { name: 'Y' }], 'replace'));
  });

  it('適用を confirm キャンセルすると何も呼ばない', async () => {
    seed([tpl(1, 'A')]);
    const { fns } = renderManager({ ui: { showConfirm: vi.fn().mockResolvedValue(false) } });
    fireEvent.click(screen.getByText('全体を適用'));
    await Promise.resolve();
    expect(fns.applyTemplateFull).not.toHaveBeenCalled();
  });

  it('🗑️ で confirm → localStorage から削除', async () => {
    seed([tpl(1, '消す')]);
    renderManager({ ui: { showConfirm: vi.fn().mockResolvedValue(true) } });
    fireEvent.click(screen.getByLabelText('消す を削除'));
    await waitFor(() => expect(screen.queryByText('消す')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES))).toEqual([]);
  });
});
