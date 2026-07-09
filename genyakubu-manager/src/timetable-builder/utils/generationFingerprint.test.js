import { describe, expect, it } from 'vitest';
import { computeGenerationFingerprint } from './generationFingerprint';

const makeProject = (overrides = {}, configOverrides = {}) => ({
  version: 4,
  activeTabId: 1,
  dates: [{ id: 1, label: '7/1' }, { id: 2, label: '7/2' }],
  periods: [{ id: 1, label: '1限' }],
  tabs: [{
    id: 1,
    name: 'メイン',
    config: {
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { '英語': 2 },
      ...configOverrides,
    },
    schedule: {},
  }],
  teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  ...overrides,
});

describe('computeGenerationFingerprint (F2n/F2p)', () => {
  it('同一構造なら同じ fingerprint (参照が違っても)', () => {
    expect(computeGenerationFingerprint(makeProject(), 1))
      .toBe(computeGenerationFingerprint(makeProject(), 1));
  });

  it('タブが存在しなければ null (F2p: 削除検出)', () => {
    expect(computeGenerationFingerprint(makeProject(), 99)).toBeNull();
  });

  it('構造の変更 (クォータ / クラス / 使う日 / 合同 / 生成制約) で変わる', () => {
    const base = computeGenerationFingerprint(makeProject(), 1);
    // クォータ変更
    expect(computeGenerationFingerprint(makeProject({}, { subjectCounts: { '英語': 3 } }), 1)).not.toBe(base);
    // クラス別コマ数の上書き変更 (§N)
    expect(computeGenerationFingerprint(makeProject({}, { classSubjectCounts: { '1': { '英語': 1 } } }), 1)).not.toBe(base);
    // クラス変更 (rename も含む)
    expect(computeGenerationFingerprint(makeProject({}, { classes: [{ id: 1, label: 'B' }] }), 1)).not.toBe(base);
    // 使う日 off
    expect(computeGenerationFingerprint(makeProject({}, { activeDateIds: [1] }), 1)).not.toBe(base);
    // 日付プールの変更
    expect(computeGenerationFingerprint(makeProject({ dates: [{ id: 1, label: '7/1' }] }), 1)).not.toBe(base);
    // 合同グループの変更
    expect(computeGenerationFingerprint(makeProject({ combinedGroups: [{ id: 1, subject: '英語', classes: ['A', 'B'], dates: null }] }), 1)).not.toBe(base);
    // 生成制約の変更
    expect(computeGenerationFingerprint(makeProject({ maxDailyHours: 3 }), 1)).not.toBe(base);
    expect(computeGenerationFingerprint(makeProject({ maxConsecutivePeriods: 2 }), 1)).not.toBe(base);
  });

  it('講師・外部コマ・schedule の変更では変わらない (違反 UI が検出する領域)', () => {
    const base = computeGenerationFingerprint(makeProject(), 1);
    // 講師の NG 変更
    const p1 = makeProject({ teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: ['7/1-1限'], ngClasses: [], priorityClasses: [] }] });
    expect(computeGenerationFingerprint(p1, 1)).toBe(base);
    // 外部コマ変更
    expect(computeGenerationFingerprint(makeProject({ externalCounts: { '7/1-堀上': 3 } }), 1)).toBe(base);
    // 自タブの schedule 編集
    const p2 = makeProject();
    p2.tabs[0].schedule = { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } };
    expect(computeGenerationFingerprint(p2, 1)).toBe(base);
  });

  it('numPatterns / maxIterations (探索量) では変わらない', () => {
    const base = computeGenerationFingerprint(makeProject(), 1);
    expect(computeGenerationFingerprint(makeProject({ numPatterns: 6 }), 1)).toBe(base);
    expect(computeGenerationFingerprint(makeProject({ maxIterations: 100000 }), 1)).toBe(base);
  });

  it('別タブの config 変更では変わらない (対象タブの前提だけを見る)', () => {
    const twoTabs = (subjectCountsB) => {
      const p = makeProject();
      p.tabs.push({
        id: 2,
        name: 'サブ',
        config: { classes: [{ id: 1, label: 'X' }], subjectCounts: subjectCountsB },
        schedule: {},
      });
      return p;
    };
    expect(computeGenerationFingerprint(twoTabs({ '数学': 1 }), 1))
      .toBe(computeGenerationFingerprint(twoTabs({ '数学': 5 }), 1));
  });
});
