// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTemplatePayload,
  addTemplate,
  removeTemplate,
  loadTemplates,
  persistTemplates,
  updateTemplate,
} from './templates';
import { STORAGE_KEY_TEMPLATES } from './constants';

afterEach(() => localStorage.clear());

const sampleProject = () => ({
  name: 'P',
  teachers: [{ name: '堀上', subjects: ['英語'] }],
  tabs: [{ id: 1, name: 'メイン', config: {}, schedule: {} }],
  snapshots: [{ id: 1, name: '作業中', schedule: {} }],
});

describe('buildTemplatePayload', () => {
  it('snapshots を除外し deep copy する', () => {
    const project = sampleProject();
    const payload = buildTemplatePayload(project);
    expect(payload.snapshots).toBeUndefined();
    expect(payload.teachers).toEqual(project.teachers);
    // deep copy: 元を変更しても payload は不変
    project.teachers[0].name = 'X';
    expect(payload.teachers[0].name).toBe('堀上');
  });
});

describe('addTemplate', () => {
  it('id を max+1 で採番し payload を載せる', () => {
    let list = [];
    list = addTemplate(list, { name: 'A', project: sampleProject(), createdAt: 'x' });
    list = addTemplate(list, { name: 'B', project: sampleProject() });
    expect(list.map(t => t.id)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({ name: 'A', createdAt: 'x' });
    expect(list[0].payload.teachers).toHaveLength(1);
    expect(list[0].payload.snapshots).toBeUndefined();
  });

  it('空名は no-op', () => {
    const list = addTemplate([], { name: '', project: sampleProject() });
    expect(list).toEqual([]);
  });
});

describe('removeTemplate', () => {
  it('id を取り除く', () => {
    const list = [{ id: 1 }, { id: 2 }];
    expect(removeTemplate(list, 1)).toEqual([{ id: 2 }]);
  });
});

describe('loadTemplates / persistTemplates', () => {
  it('round-trip できる', () => {
    persistTemplates([{ id: 1, name: 'A', payload: {} }]);
    expect(loadTemplates()).toEqual([{ id: 1, name: 'A', payload: {} }]);
  });

  it('未保存なら空配列', () => {
    expect(loadTemplates()).toEqual([]);
  });

  it('壊れた JSON は空配列にフォールバック', () => {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, '{not json');
    expect(loadTemplates()).toEqual([]);
  });

  it('配列でない値は空配列にフォールバック', () => {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, '{"a":1}');
    expect(loadTemplates()).toEqual([]);
  });
});

describe('updateTemplate (N4a)', () => {
  const proj = (name) => ({ name, teachers: [], tabs: [], snapshots: [{ id: 1 }] });

  it('id 一致のテンプレートの payload と createdAt を差し替える (name は維持)', () => {
    let list = addTemplate([], { name: 'ベース', project: proj('v1'), createdAt: '2026-01-01T00:00:00Z' });
    list = updateTemplate(list, { id: list[0].id, project: proj('v2'), createdAt: '2026-07-03T00:00:00Z' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('ベース');
    expect(list[0].payload.name).toBe('v2');
    expect(list[0].createdAt).toBe('2026-07-03T00:00:00Z');
    // snapshots は payload に含めない (buildTemplatePayload 準拠)
    expect(list[0].payload).not.toHaveProperty('snapshots');
  });

  it('対象 id が無ければ元の配列をそのまま返す', () => {
    const list = addTemplate([], { name: 'A', project: proj('v1') });
    expect(updateTemplate(list, { id: 999, project: proj('v2') })).toBe(list);
  });
});
