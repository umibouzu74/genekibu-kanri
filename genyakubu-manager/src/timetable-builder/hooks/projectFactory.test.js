// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNewProject,
  detectTeacherDiffs,
  loadInitialProject,
} from './projectFactory';
import {
  CURRENT_PROJECT_VERSION,
  DEFAULT_INITIAL_TEACHERS,
  DEFAULT_SUBJECTS,
  DEFAULT_SUBJECT_COLORS,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
} from '../utils/constants';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('createNewProject', () => {
  it('引数の tabs / teachers / subjectColors / subjects を反映する', () => {
    const tabs = [{ id: 7, name: 'x', config: {}, schedule: {} }];
    const teachers = [{ name: 'A', subjects: ['英語'] }];
    const colors = { 英語: '#000' };
    const subjects = ['英語'];
    const p = createNewProject(tabs, teachers, colors, subjects);
    expect(p.tabs).toBe(tabs);
    expect(p.teachers).toBe(teachers);
    expect(p.subjectColors).toBe(colors);
    expect(p.subjects).toBe(subjects);
    expect(p.activeTabId).toBe(7);
    expect(p.version).toBe(CURRENT_PROJECT_VERSION);
    expect(p.combinedGroups).toEqual([]);
    expect(p.externalCounts).toEqual({});
  });

  it('teachers / subjectColors / subjects 省略時はデフォルトを採用', () => {
    const tabs = [{ id: 1, name: 'メイン', config: {}, schedule: {} }];
    const p = createNewProject(tabs);
    expect(p.teachers).toBe(DEFAULT_INITIAL_TEACHERS);
    expect(p.subjects).toEqual(DEFAULT_SUBJECTS);
    expect(p.subjectColors).toEqual(DEFAULT_SUBJECT_COLORS);
  });

  it('tabs 空配列なら activeTabId は 1', () => {
    const p = createNewProject([]);
    expect(p.activeTabId).toBe(1);
  });

  it('createdAt / updatedAt は ISO 文字列', () => {
    const p = createNewProject([{ id: 1, name: '', config: {}, schedule: {} }]);
    expect(() => new Date(p.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(p.updatedAt).toISOString()).not.toThrow();
  });
});

describe('loadInitialProject — branches', () => {
  it('STORAGE_KEY_PROJECT に v2 形式があれば v3 にマイグレーションされる', () => {
    const saved = {
      version: 2,
      name: 'saved',
      tabs: [{ id: 1, name: 'a', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
      teachers: [],
      activeTabId: 1,
      combinedGroups: [],
      externalCounts: {},
      subjects: [],
      subjectColors: {},
    };
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(saved));
    const { project: loaded } = loadInitialProject();
    expect(loaded.name).toBe('saved');
    expect(loaded.version).toBe(3);
  });

  it('STORAGE_KEY_PROJECT に v3 形式があればそのまま返す', () => {
    const saved = {
      version: 3,
      name: 'v3-saved',
      tabs: [{
        id: 1, name: 'a',
        config: {
          dates: [{ id: 1, label: 'x' }],
          periods: [{ id: 1, label: 'y' }],
          classes: [{ id: 1, label: 'z' }],
          subjectCounts: {},
        },
        schedule: {},
      }],
      teachers: [],
      activeTabId: 1,
      combinedGroups: [],
      externalCounts: {},
      subjects: [],
      subjectColors: {},
    };
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(saved));
    const { project: loaded } = loadInitialProject();
    expect(loaded.name).toBe('v3-saved');
    expect(loaded.version).toBe(3);
    expect(loaded.tabs[0].config.dates).toEqual([{ id: 1, label: 'x' }]);
  });

  it('STORAGE_KEY_PROJECT 不在で legacy schedule_project があれば新キーに移行する', () => {
    const saved = {
      version: 2,
      name: 'legacy-1',
      tabs: [{ id: 1, name: 'a', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
      teachers: [],
      activeTabId: 1,
      combinedGroups: [],
      externalCounts: {},
      subjects: [],
      subjectColors: {},
    };
    localStorage.setItem(LEGACY_STORAGE_KEYS[0], JSON.stringify(saved));
    const { project: loaded } = loadInitialProject();
    expect(loaded.name).toBe('legacy-1');
    // 旧キーは削除され、新キーへ移行されている
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS[0])).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).not.toBeNull();
  });

  it('STORAGE_KEY_PROJECT 不在で legacy winter_schedule_project_v45 があれば新キーに移行する', () => {
    const saved = {
      version: 2,
      name: 'legacy-2',
      tabs: [{ id: 1, name: 'a', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
      teachers: [],
      activeTabId: 1,
      combinedGroups: [],
      externalCounts: {},
      subjects: [],
      subjectColors: {},
    };
    localStorage.setItem(LEGACY_STORAGE_KEYS[1], JSON.stringify(saved));
    const { project: loaded } = loadInitialProject();
    expect(loaded.name).toBe('legacy-2');
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS[1])).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_PROJECT)).not.toBeNull();
  });

  it('project が無く user defaults があれば string 配列を {id, label} に正規化して createNewProject', () => {
    const defaults = {
      config: { dates: ['1/1'], periods: ['1限'], classes: ['A'], subjectCounts: { '英語': 1 } },
      teachers: [{ name: 'X', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
    };
    localStorage.setItem(STORAGE_KEY_USER_DEFAULTS, JSON.stringify(defaults));
    const { project: loaded } = loadInitialProject();
    expect(loaded.teachers[0].name).toBe('X');
    expect(loaded.tabs).toHaveLength(1);
    expect(loaded.tabs[0].config.classes).toEqual([{ id: 1, label: 'A' }]);
    expect(loaded.tabs[0].config.dates).toEqual([{ id: 1, label: '1/1' }]);
  });

  it('legacy schedule_user_defaults があれば user defaults として読み込む', () => {
    const defaults = {
      config: { dates: ['1/1'], periods: ['1限'], classes: ['L'], subjectCounts: { '英語': 1 } },
      teachers: [{ name: 'Y', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
    };
    localStorage.setItem('schedule_user_defaults', JSON.stringify(defaults));
    const { project: loaded } = loadInitialProject();
    expect(loaded.teachers[0].name).toBe('Y');
    expect(loaded.tabs[0].config.classes).toEqual([{ id: 1, label: 'L' }]);
  });

  it('全部空ならデフォルトの 2 タブ (中３ / 中１・２) を返す', () => {
    const { project: loaded } = loadInitialProject();
    expect(loaded.tabs).toHaveLength(2);
    expect(loaded.tabs[0].name).toBe('中３');
    expect(loaded.tabs[1].name).toBe('中１・２');
  });

  it('壊れた JSON は読み込み失敗して fallback default + loadError を返す', () => {
    localStorage.setItem(STORAGE_KEY_PROJECT, '{not-json');
    const { project: loaded, loadError } = loadInitialProject();
    // 例外が外に出ず、フォールバックの 2 タブが返る
    expect(loaded.tabs).toHaveLength(2);
    // loadError に説明文が入る (UI 層で toast 通知用)
    expect(loadError).toBeTruthy();
    expect(typeof loadError).toBe('string');
  });

  it('構造が壊れた JSON (tabs が配列でない) は fallback + loadError (E3d)', () => {
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify({ version: 3, tabs: 'oops', teachers: [] }));
    const { project: loaded, loadError } = loadInitialProject();
    expect(loaded.tabs).toHaveLength(2); // フォールバックの 2 タブ
    expect(loadError).toBeTruthy();
    expect(loadError).toContain('構造');
  });

  it('config.dates が配列でない保存データも fallback する (E3d)', () => {
    const broken = {
      version: 3, name: 'broken', activeTabId: 1, teachers: [],
      tabs: [{ id: 1, name: 'a', config: { dates: 'x', periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
    };
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(broken));
    const { loadError } = loadInitialProject();
    expect(loadError).toBeTruthy();
  });

  it('読み込み成功時は loadError が null', () => {
    const saved = {
      version: 2, name: 'ok',
      tabs: [{ id: 1, name: 'a', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
      teachers: [], activeTabId: 1, combinedGroups: [], externalCounts: {}, subjects: [], subjectColors: {},
    };
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(saved));
    const { loadError } = loadInitialProject();
    expect(loadError).toBeNull();
  });

  it('version 未指定の旧形式は migrate で v3 に補正され entity 配列になる', () => {
    const legacy = {
      // version 無し
      name: 'old',
      tabs: [{ id: 1, name: 'a', config: { dates: ['12/25'], periods: ['1限'], classes: ['S'], subjectCounts: {} }, schedule: {} }],
      teachers: [],
      activeTabId: 1,
    };
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(legacy));
    const { project: loaded } = loadInitialProject();
    expect(loaded.version).toBe(3);
    expect(loaded.tabs[0].config.dates).toEqual([{ id: 1, label: '12/25' }]);
    expect(loaded.tabs[0].config.periods).toEqual([{ id: 1, label: '1限' }]);
    expect(loaded.tabs[0].config.classes).toEqual([{ id: 1, label: 'S' }]);
    // combinedGroups / subjectColors / subjects も自動補完される
    expect(loaded.combinedGroups).toEqual([]);
    expect(loaded.subjectColors).toEqual({});
    expect(loaded.subjects).toEqual([]);
  });
});

describe('detectTeacherDiffs', () => {
  const t = (name, subjects) => ({ name, subjects });

  it('差分なし → 空配列', () => {
    const a = [t('A', ['英語'])];
    const b = [t('A', ['英語'])];
    expect(detectTeacherDiffs(a, b)).toEqual([]);
  });

  it('追加講師を検出する', () => {
    const current = [t('A', ['英語'])];
    const loaded = [t('A', ['英語']), t('B', ['数学'])];
    const diffs = detectTeacherDiffs(current, loaded);
    expect(diffs.some(d => d.includes('【追加】') && d.includes('B'))).toBe(true);
  });

  it('削除講師を検出する', () => {
    const current = [t('A', ['英語']), t('B', ['数学'])];
    const loaded = [t('A', ['英語'])];
    const diffs = detectTeacherDiffs(current, loaded);
    expect(diffs.some(d => d.includes('【削除】') && d.includes('B'))).toBe(true);
  });

  it('科目変更を検出する (順序非依存)', () => {
    const current = [t('A', ['英語', '数学'])];
    const loaded = [t('A', ['数学', '理科'])];
    const diffs = detectTeacherDiffs(current, loaded);
    expect(diffs.some(d => d.includes('【科目変更】') && d.includes('A'))).toBe(true);
  });

  it('科目順序だけ違って中身が同じなら差分なし', () => {
    const current = [t('A', ['英語', '数学'])];
    const loaded = [t('A', ['数学', '英語'])];
    expect(detectTeacherDiffs(current, loaded)).toEqual([]);
  });

  it('追加 + 削除 + 科目変更を同時に検出', () => {
    const current = [t('A', ['英語']), t('B', ['数学'])];
    const loaded = [t('A', ['数学']), t('C', ['国語'])];
    const diffs = detectTeacherDiffs(current, loaded);
    expect(diffs.length).toBe(3);
    expect(diffs.some(d => d.includes('【追加】') && d.includes('C'))).toBe(true);
    expect(diffs.some(d => d.includes('【削除】') && d.includes('B'))).toBe(true);
    expect(diffs.some(d => d.includes('【科目変更】') && d.includes('A'))).toBe(true);
  });
});
