// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTemplatePayload,
  addTemplate,
  removeTemplate,
  loadTemplates,
  persistTemplates,
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
