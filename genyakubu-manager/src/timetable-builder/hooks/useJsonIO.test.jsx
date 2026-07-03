// @vitest-environment jsdom
// L1c (読込前の全置換確認) と L1d (テンプレートの JSON 同梱) の検証。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useJsonIO } from './useJsonIO';
import { STORAGE_KEY_TEMPLATES } from '../utils/constants';

afterEach(cleanup);

function makeProject(overrides = {}) {
  return {
    version: 4,
    name: '現行プロジェクト',
    teachers: [],
    activeTabId: 1,
    dates: [{ id: 1, label: '12/25(木)' }],
    periods: [{ id: 1, label: '1限' }],
    tabs: [{
      id: 1,
      name: 'メイン',
      config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} },
      schedule: { '1-1-1': { subject: '英語', teacher: '' } },
    }],
    combinedGroups: [],
    externalCounts: {},
    subjects: ['英語'],
    subjectColors: {},
    ...overrides,
  };
}

// 読込 JSON (validateProjectShape を通る最小形)
function makeImportedJson(overrides = {}) {
  return {
    ...makeProject({ name: 'インポート元' }),
    tabs: [{
      id: 1,
      name: 'メイン',
      config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} },
      schedule: {},
    }],
    ...overrides,
  };
}

function makeFileEvent(obj) {
  const file = new File([JSON.stringify(obj)], 'p.json', { type: 'application/json' });
  return { target: { files: [file], value: '' } };
}

function setup(projectOverrides = {}) {
  const dispatch = vi.fn();
  const project = makeProject(projectOverrides);
  const { result } = renderHook(() => useJsonIO({ project, activeTab: project.tabs[0], dispatch }));
  return { result, dispatch, project };
}

beforeEach(() => {
  localStorage.clear();
});

describe('useJsonIO — 読込の全置換確認 (L1c)', () => {
  it('講師マスタに差分が無くても confirm が呼ばれ、承認で project/replace が走る', async () => {
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    result.current.handleLoadJson(makeFileEvent(makeImportedJson()), onNotify, onConfirm);
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [msg] = onConfirm.mock.calls[0];
    expect(msg).toContain('置き換わります');
    expect(msg).toContain('現行プロジェクト');
    expect(msg).toContain('割当 1 コマ');
    expect(msg).not.toContain('講師マスタの差分');
    expect(dispatch.mock.calls[0][0].type).toBe('project/replace');
    expect(onNotify).toHaveBeenCalledWith('読込完了', 'success');
  });

  it('confirm をキャンセルすると読み込まない', async () => {
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(false);
    result.current.handleLoadJson(makeFileEvent(makeImportedJson()), onNotify, onConfirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(dispatch).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('講師マスタに差分があれば同じ confirm 内に差分を併記する', async () => {
    const { result, dispatch } = setup({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
    });
    const onConfirm = vi.fn().mockResolvedValue(true);
    result.current.handleLoadJson(makeFileEvent(makeImportedJson()), vi.fn(), onConfirm);
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [msg] = onConfirm.mock.calls[0];
    expect(msg).toContain('置き換わります');
    expect(msg).toContain('講師マスタの差分');
  });
});

describe('useJsonIO — テンプレートの同梱 (L1d)', () => {
  const importedTemplate = {
    id: 1,
    name: '去年の冬期',
    createdAt: '2025-12-01T00:00:00.000Z',
    payload: makeImportedJson(),
  };

  it('保存 JSON に localStorage のテンプレートが同梱される', async () => {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify([importedTemplate]));
    const { result } = setup();
    let capturedBlob = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b) => { capturedBlob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      result.current.handleSaveJson();
      expect(capturedBlob).not.toBeNull();
      const text = await capturedBlob.text();
      const saved = JSON.parse(text);
      expect(saved.templates).toHaveLength(1);
      expect(saved.templates[0].name).toBe('去年の冬期');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it('テンプレートが無ければ保存 JSON に templates フィールドを出さない', async () => {
    const { result } = setup();
    let capturedBlob = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b) => { capturedBlob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      result.current.handleSaveJson();
      const saved = JSON.parse(await capturedBlob.text());
      expect('templates' in saved).toBe(false);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it('templates 同梱 JSON の読込でテンプレートがマージされ、件数が通知される', async () => {
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    const json = makeImportedJson({ templates: [importedTemplate] });
    result.current.handleLoadJson(makeFileEvent(json), onNotify, onConfirm);
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('去年の冬期');
    expect(onNotify).toHaveBeenCalledWith('読込完了 (テンプレート 1 件を取り込みました)', 'success');
    // templates フィールドは project state に混入しない
    const replaced = dispatch.mock.calls[0][0].payload.project;
    expect('templates' in replaced).toBe(false);
  });

  it('同名 + 同 createdAt の既存テンプレートは重複取込しない', async () => {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify([importedTemplate]));
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    const json = makeImportedJson({ templates: [importedTemplate] });
    result.current.handleLoadJson(makeFileEvent(json), onNotify, onConfirm);
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES))).toHaveLength(1);
    expect(onNotify).toHaveBeenCalledWith('読込完了', 'success');
  });
});

describe('useJsonIO — 読込エラー経路 (§M)', () => {
  it('壊れた JSON は「読み込みエラー」を通知し dispatch しない', async () => {
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const file = new File(['{broken json'], 'p.json', { type: 'application/json' });
    result.current.handleLoadJson({ target: { files: [file], value: '' } }, onNotify, vi.fn().mockResolvedValue(true));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('読み込みエラー', 'error'));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('構造不正の JSON は理由付きで通知し dispatch しない', async () => {
    const { result, dispatch } = setup();
    const onNotify = vi.fn();
    const file = new File([JSON.stringify({ tabs: [] })], 'p.json', { type: 'application/json' });
    result.current.handleLoadJson({ target: { files: [file], value: '' } }, onNotify, vi.fn().mockResolvedValue(true));
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    expect(onNotify.mock.calls[0][0]).toContain('JSON の構造が不正です');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('FileReader の onerror でも「読み込みエラー」を通知する', async () => {
    const { result } = setup();
    const onNotify = vi.fn();
    const readSpy = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function mockRead() {
      // 読取失敗をシミュレート: onload ではなく onerror を発火
      setTimeout(() => this.onerror?.(new Event('error')), 0);
    });
    try {
      const file = new File(['x'], 'p.json', { type: 'application/json' });
      result.current.handleLoadJson({ target: { files: [file], value: '' } }, onNotify, vi.fn());
      await waitFor(() => expect(onNotify).toHaveBeenCalledWith('読み込みエラー', 'error'));
    } finally {
      readSpy.mockRestore();
    }
  });
});
