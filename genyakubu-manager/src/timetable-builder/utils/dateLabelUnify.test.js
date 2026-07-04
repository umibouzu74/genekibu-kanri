import { describe, expect, it } from 'vitest';
import { unifyDateLabelWeekdays } from './dateLabelUnify';
import { migrateProject } from './scheduleKey';

// v4 形状の最小 project を組み立てるヘルパ
function makeProject(overrides = {}) {
  return {
    version: 4,
    name: 'テスト',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    teachers: [],
    activeTabId: 1,
    dates: [],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [{ id: 1, name: '中３', config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} }, schedule: {} }],
    subjects: [],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
    ...overrides,
  };
}

// テストの再現性のため year 推定の基準は 2026 固定で渡す
const NOW_YEAR = 2026;

describe('unifyDateLabelWeekdays: マージ (「8/6」と「8/6(木)」が共存)', () => {
  it('裸 entity がプールから消え、(曜) 付きだけが残る', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }, { id: 3, label: '8/7(金)' }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates).toEqual([{ id: 2, label: '8/6(木)' }, { id: 3, label: '8/7(金)' }]);
  });

  it('schedule のコマは twin の dateId へ付け替え、衝突セルは (曜) 側を優先', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      tabs: [{
        id: 1, name: '中３',
        config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} },
        schedule: {
          'd1-p1-c1': { subject: '数学', teacher: '田中' }, // 裸側のみ → 移動
          'd1-p2-c1': { subject: '英語', teacher: '佐藤' }, // 両方に存在 → 衝突
          'd2-p2-c1': { subject: '国語', teacher: '鈴木' },
        },
      }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.tabs[0].schedule).toEqual({
      'd2-p1-c1': { subject: '数学', teacher: '田中' },
      'd2-p2-c1': { subject: '国語', teacher: '鈴木' }, // (曜) 側が勝つ
    });
  });

  it('activeDateIds の裸 id を twin id へ置換して dedupe する', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }, { id: 3, label: '8/7(金)' }],
      tabs: [
        { id: 1, name: 'A', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 3] }, schedule: {} },
        { id: 2, name: 'B', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2] }, schedule: {} },
        { id: 3, name: 'C', config: { classes: [], subjectCounts: {} }, schedule: {} }, // 全日使う
      ],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.tabs[0].config.activeDateIds).toEqual([2, 3]);
    expect(out.tabs[1].config.activeDateIds).toEqual([2]);
    expect(out.tabs[2].config.activeDateIds).toBeUndefined();
  });

  it('NG キーの日付部分を書き換え、同キー化したら dedupe する', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      teachers: [
        { name: '田中', subjects: [], ngSlots: ['8/6-1限', '8/6(木)-2限'], ngClasses: [], priorityClasses: [] },
        { name: '佐藤', subjects: [], ngSlots: ['8/6-1限', '8/6(木)-1限'], ngClasses: [], priorityClasses: [] },
      ],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.teachers[0].ngSlots).toEqual(['8/6(木)-1限', '8/6(木)-2限']);
    expect(out.teachers[1].ngSlots).toEqual(['8/6(木)-1限']); // 重複は 1 本化
  });

  it('externalCounts のキーを書き換え、衝突時は (曜) 側の値を優先', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      externalCounts: { '8/6-田中': 2, '8/6-佐藤': 1, '8/6(木)-田中': 3 },
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.externalCounts).toEqual({ '8/6(木)-田中': 3, '8/6(木)-佐藤': 1 });
  });

  it('合同グループ・他学年セッション・プリセットの日付ラベルも追従する', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      combinedGroups: [
        { id: 1, subject: '数学', classes: ['３S', '３A'], dates: ['8/6', '8/6(木)'] },
        { id: 2, subject: '英語', classes: ['３S', '３A'], dates: null },
      ],
      externalSessions: [{ id: 1, date: '8/6', teacherName: '田中', label: '' }],
      externalSessionPresets: [{ id: 1, name: 'P', startDateLabel: '8/6', endDateLabel: '8/6' }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.combinedGroups[0].dates).toEqual(['8/6(木)']); // rename 後の重複も dedupe
    expect(out.combinedGroups[1].dates).toBeNull();
    expect(out.externalSessions[0].date).toBe('8/6(木)');
    expect(out.externalSessionPresets[0]).toMatchObject({ startDateLabel: '8/6(木)', endDateLabel: '8/6(木)' });
  });

  it('スナップショットの schedule も twin の dateId へ付け替える', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      snapshots: [{
        id: 1, name: 'S', tabId: 1, createdAt: null,
        schedule: { 'd1-p1-c1': { subject: '数学', teacher: '田中' } },
      }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.snapshots[0].schedule).toEqual({ 'd2-p1-c1': { subject: '数学', teacher: '田中' } });
  });

  it('「8/6-補講」のような包含ラベルの NG キーは巻き込まない (最長一致)', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }, { id: 3, label: '8/6-補講' }],
      teachers: [
        { name: '田中', subjects: [], ngSlots: ['8/6-補講-1限', '8/6-1限'], ngClasses: [], priorityClasses: [] },
      ],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.teachers[0].ngSlots).toEqual(['8/6-補講-1限', '8/6(木)-1限']);
    // 「8/6-補講」自体は M/D 形式でないため統一対象外でそのまま残る
    expect(out.dates.map(d => d.label)).toEqual(['8/6(木)', '8/6-補講']);
  });

  it('「08/06」のような 0 埋めラベルも同じ月日の twin へマージする', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '08/06' }, { id: 2, label: '8/6(木)' }],
      teachers: [
        { name: '田中', subjects: [], ngSlots: ['08/06-1限'], ngClasses: [], priorityClasses: [] },
      ],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates).toEqual([{ id: 2, label: '8/6(木)' }]);
    expect(out.teachers[0].ngSlots).toEqual(['8/6(木)-1限']);
  });
});

describe('unifyDateLabelWeekdays: リネーム (twin が居ない裸ラベル)', () => {
  it('(曜) 付きラベルから年を推定して曜日を付ける', () => {
    // 8/6(木) は 2020・2026 に一致するが、8/7 はどちらの年でも金曜なので確定できる
    const p = makeProject({
      dates: [{ id: 1, label: '8/6(木)' }, { id: 2, label: '8/7' }],
      teachers: [
        { name: '田中', subjects: [], ngSlots: ['8/7-1限'], ngClasses: [], priorityClasses: [] },
      ],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates).toEqual([{ id: 1, label: '8/6(木)' }, { id: 2, label: '8/7(金)' }]);
    expect(out.teachers[0].ngSlots).toEqual(['8/7(金)-1限']); // id 不変なので schedule は無関係
  });

  it('年またぎプール (12月+1月) は 1〜3 月を翌年扱いで推定する', () => {
    // 12/28(月)・1/4(月) は 2026-12〜2027-01 の冬期講習。1/5 → 2027-01-05 (火)
    const p = makeProject({
      dates: [{ id: 1, label: '12/28(月)' }, { id: 2, label: '1/4(月)' }, { id: 3, label: '1/5' }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates[2].label).toBe('1/5(火)');
  });

  it('(曜) 付きが 1 つも無いプールは年を推定できないので触らない', () => {
    const p = makeProject({ dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/7' }] });
    expect(unifyDateLabelWeekdays(p, NOW_YEAR)).toBe(p);
  });

  it('(曜) 付きラベル同士が矛盾して年が確定しない場合は触らない', () => {
    // 8/6(木) と 8/7(日) は同一年で両立しない → 候補年 0 件
    const p = makeProject({
      dates: [{ id: 1, label: '8/6(木)' }, { id: 2, label: '8/7(日)' }, { id: 3, label: '8/8' }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates[2].label).toBe('8/8');
  });

  it('同じ月日の (曜) 付きが複数ある (打ち間違い等) 場合は判断せず温存する', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6(水)' }, { id: 2, label: '8/6(木)' }, { id: 3, label: '8/6' }],
    });
    const out = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(out.dates.map(d => d.label)).toEqual(['8/6(水)', '8/6(木)', '8/6']);
  });
});

describe('unifyDateLabelWeekdays: 冪等性・no-op', () => {
  it('裸ラベルの無いプールは同一参照を返す (fast path)', () => {
    const p = makeProject({ dates: [{ id: 1, label: '8/6(木)' }, { id: 2, label: '8/7(金)' }] });
    expect(unifyDateLabelWeekdays(p, NOW_YEAR)).toBe(p);
  });

  it('2 回目の適用は no-op (冪等)', () => {
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }, { id: 3, label: '8/7' }],
    });
    const once = unifyDateLabelWeekdays(p, NOW_YEAR);
    expect(unifyDateLabelWeekdays(once, NOW_YEAR)).toBe(once);
  });

  it('dates が無い/不正な project はそのまま返す', () => {
    expect(unifyDateLabelWeekdays(null, NOW_YEAR)).toBeNull();
    const p = { version: 4, dates: 'oops' };
    expect(unifyDateLabelWeekdays(p, NOW_YEAR)).toBe(p);
  });
});

describe('migrateProject 統合: 読込時に表記ゆれが統一される', () => {
  it('v4 project の「8/6」+「8/6(木)」共存が load で 1 本化される', () => {
    // マージ経路は年推定に依存しないため、実行日時に関わらず安定して通る
    const p = makeProject({
      dates: [{ id: 1, label: '8/6' }, { id: 2, label: '8/6(木)' }],
      teachers: [
        { name: '田中', subjects: ['数学'], ngSlots: ['8/6-1限'], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: '中３',
        config: { classes: [{ id: 1, label: '３S' }], subjectCounts: {} },
        schedule: { 'd1-p1-c1': { subject: '数学', teacher: '田中' } },
      }],
    });
    const out = migrateProject(p);
    expect(out.dates).toEqual([{ id: 2, label: '8/6(木)' }]);
    expect(out.teachers[0].ngSlots).toEqual(['8/6(木)-1限']);
    expect(out.tabs[0].schedule).toEqual({ 'd2-p1-c1': { subject: '数学', teacher: '田中' } });
  });
});
