import { describe, expect, it } from 'vitest';
import { validateProjectShape } from './projectSchema';

const validTab = () => ({
  id: 1,
  name: 'メイン',
  config: {
    dates: [{ id: 1, label: '12/25' }],
    periods: [{ id: 1, label: '1限' }],
    classes: [{ id: 1, label: 'A' }],
    subjectCounts: { 英語: 1 },
  },
  schedule: {},
});
const validProject = (over = {}) => ({ version: 3, teachers: [], tabs: [validTab()], ...over });

describe('validateProjectShape', () => {
  it('正常なプロジェクトは valid', () => {
    expect(validateProjectShape(validProject())).toEqual({ valid: true, error: null });
  });

  it('teachers 省略でも valid (任意)', () => {
    const p = validProject();
    delete p.teachers;
    expect(validateProjectShape(p).valid).toBe(true);
  });

  it('schedule 省略でも valid', () => {
    const p = validProject();
    delete p.tabs[0].schedule;
    expect(validateProjectShape(p).valid).toBe(true);
  });

  it('オブジェクトでなければ invalid', () => {
    expect(validateProjectShape(null).valid).toBe(false);
    expect(validateProjectShape('x').valid).toBe(false);
    expect(validateProjectShape([]).valid).toBe(false);
  });

  it('tabs が配列でない / 空なら invalid', () => {
    expect(validateProjectShape(validProject({ tabs: {} })).valid).toBe(false);
    expect(validateProjectShape(validProject({ tabs: [] })).valid).toBe(false);
  });

  it('teachers が配列でなければ invalid', () => {
    expect(validateProjectShape(validProject({ teachers: 'x' })).valid).toBe(false);
  });

  it('config が無ければ invalid', () => {
    const p = validProject();
    delete p.tabs[0].config;
    expect(validateProjectShape(p).valid).toBe(false);
  });

  it('config.dates/periods/classes が配列でなければ invalid', () => {
    for (const key of ['dates', 'periods', 'classes']) {
      const p = validProject();
      p.tabs[0].config[key] = 'x';
      const r = validateProjectShape(p);
      expect(r.valid).toBe(false);
      expect(r.error).toContain(key);
    }
  });

  it('subjectCounts がオブジェクトでなければ invalid', () => {
    const p = validProject();
    p.tabs[0].config.subjectCounts = [];
    expect(validateProjectShape(p).valid).toBe(false);
  });

  it('schedule が配列など非オブジェクトなら invalid', () => {
    const p = validProject();
    p.tabs[0].schedule = [];
    expect(validateProjectShape(p).valid).toBe(false);
  });
});
