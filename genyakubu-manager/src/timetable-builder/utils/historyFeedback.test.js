import { describe, expect, it } from 'vitest';
import { describeHistoryStep } from './historyFeedback';

// reducer と同じく「変更箇所だけ新 object」の immutable 更新を模す。
function makeProject(overrides = {}) {
  return {
    version: 4,
    name: 'P',
    activeTabId: 1,
    dates: [{ id: 1, label: '12/25(木)' }],
    periods: [{ id: 1, label: '1限' }],
    teachers: [],
    subjects: ['英語'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
    tabs: [{
      id: 1,
      name: '中３',
      config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} },
      schedule: {},
    }],
    ...overrides,
  };
}

describe('describeHistoryStep (N2f)', () => {
  it('1 コマの変更はセル位置と内容の詳細を返し、アクティブタブなら scrollKey も返す', () => {
    const from = makeProject();
    const to = {
      ...from,
      tabs: [{ ...from.tabs[0], schedule: { 'd1-p1-c1': { subject: '英語', teacher: '田中' } } }],
    };
    const result = describeHistoryStep(from, to);
    expect(result.message).toBe('12/25(木) 1限 ３S: 空 → 英語/田中');
    expect(result.scrollKey).toBe('d1-p1-c1');
  });

  it('複数コマの変更は件数とタブ名でまとめる', () => {
    const from = makeProject();
    const to = {
      ...from,
      tabs: [{
        ...from.tabs[0],
        schedule: {
          'd1-p1-c1': { subject: '英語', teacher: '田中' },
          'd1-p1-c2': { subject: '数学', teacher: '佐藤' },
        },
      }],
    };
    const result = describeHistoryStep(from, to);
    expect(result.message).toBe('「中３」の 2 コマの割当');
  });

  it('非アクティブタブの変更は scrollKey を返さない', () => {
    const from = makeProject({
      activeTabId: 2,
      tabs: [
        { id: 1, name: '中３', config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} }, schedule: {} },
        { id: 2, name: '中２', config: { classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const to = {
      ...from,
      tabs: [
        { ...from.tabs[0], schedule: { 'd1-p1-c1': { subject: '英語', teacher: '' } } },
        from.tabs[1],
      ],
    };
    const result = describeHistoryStep(from, to);
    expect(result.message).toContain('12/25(木)');
    expect(result.scrollKey).toBeNull();
  });

  it('schedule 以外の変更は参照比較でフィールド名を返す (講師設定)', () => {
    const from = makeProject();
    const to = { ...from, teachers: [{ name: '田中', subjects: ['英語'] }] };
    expect(describeHistoryStep(from, to)).toEqual({ message: '講師設定', scrollKey: null });
  });

  it('複数フィールドの変更は「・」で列挙する', () => {
    const from = makeProject();
    const to = { ...from, subjects: ['英語', '情報'], subjectColors: { 情報: '#123' } };
    expect(describeHistoryStep(from, to).message).toBe('科目マスタ・科目カラー');
  });

  it('schedule diff の無い tabs 変更は「タブ構成・タブ設定」', () => {
    const from = makeProject();
    const to = { ...from, tabs: [{ ...from.tabs[0], name: '中３ (改名)' }] };
    expect(describeHistoryStep(from, to).message).toBe('タブ構成・タブ設定');
  });

  it('null 安全 (どちらか欠けても throw しない)', () => {
    expect(describeHistoryStep(null, makeProject()).message).toBe('変更');
    expect(describeHistoryStep(makeProject(), undefined).message).toBe('変更');
  });
});
