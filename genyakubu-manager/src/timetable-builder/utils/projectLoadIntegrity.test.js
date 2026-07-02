// F.5 系統 A の統合テスト: 「validateProjectShape を通過した JSON は
// migrateProject + cleanSchedule + 主要 consumer の初回利用でクラッシュしない」
// という性質を、実際に発生した型崩れ fixture で検証する。
//
// 背景: projectSchema.test.js は個別フィールドの reject のみを見ており、
// 「valid 判定された JSON が render / 生成で throw する」素通り穴
// (combinedGroups: {} / teacher.subjects 欠落 等) を検出できなかった。
// このファイルは validate → migrate → 利用の整合を 1 本の性質として固定する。
// クラッシュすると autosave が汚染を永続化しリロード不能になるため重要。

import { describe, expect, it } from 'vitest';
import { validateProjectShape } from './projectSchema';
import { migrateProject, findCombinedGroup, countTeacherHoursWithCombined, activeDatesForTab, activePeriodsForTab } from './scheduleKey';
import { cleanSchedule } from './constants';
import { computeGlobalUsage } from './analysisHelpers';
import { computeAutoNgByTeacher } from './autoNg';
import { generateSinglePattern } from '../logic/autoGenerator';

// validate に通れば migrate + 主要 consumer を実際に呼び、throw しないこと
// と最低限の不変条件を確認する。validate が弾いた場合はフォールバック
// (デフォルト project + F2f 退避) に乗るのでそれ自体が安全な結果。
function expectLoadableOrRejected(raw) {
  const { valid } = validateProjectShape(raw);
  if (!valid) return { rejected: true };

  const project = cleanSchedule(migrateProject(raw));

  // 不変条件: 正規化後は配列/オブジェクトの形が保証されている
  expect(Array.isArray(project.tabs)).toBe(true);
  expect(Array.isArray(project.teachers)).toBe(true);
  expect(Array.isArray(project.combinedGroups)).toBe(true);
  expect(Array.isArray(project.externalSessions)).toBe(true);
  expect(Array.isArray(project.subjects)).toBe(true);
  expect(Array.isArray(project.snapshots)).toBe(true);
  project.teachers.forEach(t => {
    expect(typeof t.name).toBe('string');
    expect(Array.isArray(t.subjects)).toBe(true);
    expect(Array.isArray(t.ngSlots)).toBe(true);
    expect(Array.isArray(t.ngClasses)).toBe(true);
    expect(Array.isArray(t.priorityClasses)).toBe(true);
  });
  project.combinedGroups.forEach(g => {
    expect(typeof g.subject).toBe('string');
    expect(Array.isArray(g.classes)).toBe(true);
    expect(g.dates === null || Array.isArray(g.dates)).toBe(true);
  });

  // render 経路の代表: ScheduleCell 相当の講師フィルタ / 合同グループ検索
  project.teachers.filter(t => t.subjects.includes('英語'));
  findCombinedGroup(project.combinedGroups, '英語', 'A', '7/1');

  // 分析経路: computeGlobalUsage (SummaryPanel / useAnalysis から常時呼ばれる)
  computeGlobalUsage(
    project.tabs,
    project.combinedGroups,
    project.externalCounts,
    project.externalSessions,
    project.dates,
    project.periods,
  );
  computeAutoNgByTeacher(project.teachers, project.externalSessions, project.periods || []);
  project.tabs.forEach(tab => {
    const effective = {
      ...tab.config,
      dates: activeDatesForTab(project.dates, tab),
      periods: activePeriodsForTab(project.periods, tab),
    };
    countTeacherHoursWithCombined(tab.schedule, effective, project.combinedGroups);
  });

  // 生成経路: solver の初期スキャン (externalSessions / combinedGroups を読む)
  const result = generateSinglePattern({ project, activeTabId: project.activeTabId, seed: 1 });
  expect(result).toHaveProperty('totalSlots');

  return { rejected: false, project };
}

const v4base = (overrides = {}) => ({
  version: 4,
  name: 't',
  activeTabId: 1,
  dates: [{ id: 1, label: '7/1' }],
  periods: [{ id: 1, label: '1限' }],
  tabs: [{
    id: 1,
    name: 'メイン',
    config: { classes: [{ id: 1, label: 'A' }], subjectCounts: { '英語': 1 } },
    schedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } },
  }],
  teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
  ...overrides,
});

describe('validate → migrate → 初回利用の整合 (F.5 系統 A)', () => {
  it('正常な v4 プロジェクトはそのまま利用可能', () => {
    const r = expectLoadableOrRejected(v4base());
    expect(r.rejected).toBe(false);
  });

  const brokenFixtures = [
    ['combinedGroups が {} (truthy な非配列)', v4base({ combinedGroups: {} })],
    ['combinedGroups の要素に dates キーが無い', v4base({ combinedGroups: [{ id: 1, subject: '英語', classes: ['A', 'B'] }] })],
    ['combinedGroups の要素の classes が文字列', v4base({ combinedGroups: [{ id: 1, subject: '英語', classes: 'A', dates: null }] })],
    ['externalSessions が {}', v4base({ externalSessions: {} })],
    ['externalSessions の要素が文字列', v4base({ externalSessions: ['x'] })],
    ['subjects が文字列', v4base({ subjects: '英語' })],
    ['externalCounts が配列', v4base({ externalCounts: [1] })],
    ['teacher に subjects が無い', v4base({ teachers: [{ name: 'A' }] })],
    ['teacher が name 無し object', v4base({ teachers: [{ subjects: ['英語'] }] })],
    ['teachers が {} (非配列)', v4base({ teachers: {} })],
    ['maxDailyHours: 0 (範囲外の保存値)', v4base({ maxDailyHours: 0 })],
    ['snapshots が {} (v3 データ)', {
      version: 3,
      activeTabId: 1,
      tabs: [{
        id: 1,
        name: 'メイン',
        config: {
          dates: [{ id: 1, label: '7/1' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: 'A' }],
          subjectCounts: { '英語': 1 },
        },
        schedule: {},
      }],
      teachers: [],
      snapshots: {},
    }],
    ['version 2 で config.dates 欠落', {
      version: 2,
      activeTabId: 1,
      tabs: [{
        id: 1,
        name: 'メイン',
        config: { classes: ['A'], subjectCounts: { '英語': 1 } },
        schedule: { '7/1-1限-A': { subject: '英語', teacher: 'T' } },
      }],
      teachers: [],
    }],
  ];

  brokenFixtures.forEach(([label, fixture]) => {
    it(`型崩れ: ${label} — reject されるか、正規化されて安全に使える`, () => {
      expect(() => expectLoadableOrRejected(fixture)).not.toThrow();
    });
  });

  it('maxDailyHours: 0 は clamp され solver と UI が同じ値を見る (F5d)', () => {
    const r = expectLoadableOrRejected(v4base({ maxDailyHours: 0 }));
    expect(r.rejected).toBe(false);
    expect(r.project.maxDailyHours).toBe(1);
  });
});
