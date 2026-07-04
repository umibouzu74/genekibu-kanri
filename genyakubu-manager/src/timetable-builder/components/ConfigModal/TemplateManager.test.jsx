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
// validateProjectShape を通る最小の payload。
const validPayload = (over = {}) => ({
  teachers: [{ name: 'A' }],
  tabs: [{ id: 1, config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
  ...over,
});
const tpl = (id, name, payload = validPayload()) =>
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
    const payload = validPayload({ teachers: [] });
    seed([tpl(1, 'A', payload)]);
    const { fns } = renderManager({ ui: { showConfirm: vi.fn().mockResolvedValue(true) } });
    fireEvent.click(screen.getByText('全体を適用'));
    await waitFor(() => expect(fns.applyTemplateFull).toHaveBeenCalledWith(payload));
  });

  it('壊れたテンプレートは「全体を適用」で検証エラー → applyTemplateFull を呼ばない (F5)', async () => {
    seed([tpl(1, 'A', { teachers: [], tabs: 'broken' })]);
    const { fns, uiValue } = renderManager();
    fireEvent.click(screen.getByText('全体を適用'));
    await waitFor(() =>
      expect(uiValue.showToast).toHaveBeenCalledWith(expect.stringContaining('壊れています'), 'error', 4000),
    );
    expect(fns.applyTemplateFull).not.toHaveBeenCalled();
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

describe('TemplateManager — 上書き更新 (N4a)', () => {
  it('同名テンプレートがあれば confirm 後に上書きし、重複を作らない', async () => {
    seed([tpl(1, 'ベース')]);
    const { uiValue } = renderManager({
      ui: { showInput: vi.fn().mockResolvedValue('ベース'), showConfirm: vi.fn().mockResolvedValue(true) },
    });
    fireEvent.click(screen.getByText('＋ 現在のプロジェクトを保存'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    expect(uiValue.showConfirm.mock.calls[0][0]).toContain('既にあります');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES));
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('ベース');
      expect(saved[0].payload.name).toBe('いまのP'); // 現在の内容で更新済み
    });
  });

  it('同名上書きの confirm をキャンセルすると何も変えない', async () => {
    seed([tpl(1, 'ベース')]);
    const { uiValue } = renderManager({
      ui: { showInput: vi.fn().mockResolvedValue('ベース'), showConfirm: vi.fn().mockResolvedValue(false) },
    });
    fireEvent.click(screen.getByText('＋ 現在のプロジェクトを保存'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalled());
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES));
    expect(saved[0].payload.name).toBeUndefined(); // 元の payload のまま
  });

  it('行内の 💾 で confirm → 現在の内容に更新する', async () => {
    seed([tpl(1, 'ベース')]);
    renderManager();
    fireEvent.click(screen.getByLabelText('ベース を現在の内容で更新'));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES));
      expect(saved[0].payload.name).toBe('いまのP');
    });
  });
});
