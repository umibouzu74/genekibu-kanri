import { describe, expect, it } from 'vitest';
import { summarizeUnfilled, diagnoseUnfilledCells, formatDiagnosis } from './partialSummary';
import { makeKey } from './scheduleKey';

const config = {
  dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
  periods: [{ id: 1, label: '1限' }],
  classes: [{ id: 1, label: 'A' }],
  subjectCounts: { '英語': 2 },
};

describe('summarizeUnfilled (L3e)', () => {
  it('埋まっていないセルを列挙し、科目別の不足を返す', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    expect(cells).toEqual([
      { key: makeKey(2, 1, 1), date: '12/26', period: '1限', className: 'A' },
    ]);
    expect(shortages).toEqual([{ subject: '英語', missing: 1 }]);
  });

  it('全て埋まっていれば空 (完全解)', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
    }, config);
    expect(cells).toEqual([]);
    expect(shortages).toEqual([]);
  });

  it('空 + locked (空けておく) は未充填に数えない (F5w)', () => {
    const { cells } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 1)]: { locked: true },
    }, config);
    expect(cells).toEqual([]);
  });

  it('科目のみ (講師なし) のセルは未充填だが、科目枠としては配置済みに数える', () => {
    const { cells, shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '' },
    }, config);
    expect(cells.map(c => c.key)).toEqual([makeKey(1, 1, 1), makeKey(2, 1, 1)]);
    expect(shortages).toEqual([{ subject: '英語', missing: 1 }]);
  });

  it('null / undefined に対して安全', () => {
    expect(summarizeUnfilled(null, config)).toEqual({ cells: [], shortages: [] });
    expect(summarizeUnfilled({}, null)).toEqual({ cells: [], shortages: [] });
  });
});

describe('summarizeUnfilled — クラス別の不足集計 (§M)', () => {
  it('あるクラスの超過が別クラスの不足を相殺しない', () => {
    const config2 = {
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
      periods: [{ id: 1, label: '1限' }],
      classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
      subjectCounts: { '数学': 1 },
    };
    // A は数学 2 (超過 subjectOver 状態)、B は数学 0 → B の 1 コマ不足は表示すべき
    const { shortages } = summarizeUnfilled({
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(2, 1, 1)]: { subject: '数学', teacher: '田中' },
    }, config2);
    expect(shortages).toEqual([{ subject: '数学', missing: 1 }]);
  });
});

describe('diagnoseUnfilledCells (N3b)', () => {
  const teacher = (name, subjects, extra = {}) =>
    ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [], ...extra });
  const baseProject = (teachers, extra = {}) => ({
    teachers,
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    ...extra,
  });
  // 2 時限 × 1 日 × 1 クラス、数学 2 コマのクォータ
  const diagConfig = {
    dates: [{ id: 1, label: '12/25' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    classes: [{ id: 1, label: 'A' }],
    subjectCounts: { 数学: 2 },
  };

  it('置ける候補が居るセルは searchExhausted (候補数付き)', () => {
    const diag = diagnoseUnfilledCells({}, diagConfig, baseProject([teacher('田中', ['数学'])]));
    expect(diag.get(makeKey(1, 1, 1))).toMatchObject({ kind: 'searchExhausted', candidateCount: 1 });
  });

  it('不足科目の担当講師がいなければ noTeacherForSubject', () => {
    const diag = diagnoseUnfilledCells({}, diagConfig, baseProject([teacher('田中', ['英語'])]));
    expect(diag.get(makeKey(1, 1, 1)).kind).toBe('noTeacherForSubject');
  });

  it('NG・同時限重複で全員ブロックなら noCandidate (理由内訳付き)', () => {
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' }, // 1限は充填済み
    };
    // 佐藤は 2限 NG。田中は同時限に...ではなく 2 限は空きだが 1日上限 1 で ブロック
    const project = baseProject([
      teacher('田中', ['数学'], { maxDailyHours: 1 }),
      teacher('佐藤', ['数学'], { ngSlots: ['12/25-2限'] }),
    ]);
    const diag = diagnoseUnfilledCells(schedule, diagConfig, project);
    const d = diag.get(makeKey(1, 2, 1));
    expect(d.kind).toBe('noCandidate');
    expect(d.reasons.ng).toBe(1);
    expect(d.reasons.overDaily).toBe(1);
  });

  it('通算上限・連続上限もブロック理由として数える', () => {
    const config3 = {
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }, { id: 3, label: '3限' }],
      classes: [{ id: 1, label: 'A' }],
      subjectCounts: { 数学: 3 },
    };
    const schedule = {
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '連続' },
      [makeKey(1, 3, 1)]: { subject: '数学', teacher: '連続' },
    };
    // 「連続」は 1・3 限に割当済みで 2 限に置くと 3 連続 > 個別上限 2
    // 「通算」は maxTotalHours 0... ではなく externalCounts で通算 1 上限到達
    const project = baseProject(
      [
        teacher('連続', ['数学'], { maxConsecutivePeriods: 2 }),
        teacher('通算', ['数学'], { maxTotalHours: 1 }),
      ],
      { externalCounts: { '12/25-通算': 1 } },
    );
    const d = diagnoseUnfilledCells(schedule, config3, project).get(makeKey(1, 2, 1));
    expect(d.kind).toBe('noCandidate');
    expect(d.reasons.overConsecutive).toBe(1);
    expect(d.reasons.overTotal).toBe(1);
  });

  it('クォータが尽きた空セルは noQuotaLeft', () => {
    // 数学 2 コマのクォータを 2 コマとも配置済み。3 限目の空きセルは
    // 「置く科目なし」になる (枠 3 > クォータ 2)
    const config3 = {
      ...diagConfig,
      periods: [...diagConfig.periods, { id: 3, label: '3限' }],
    };
    const schedule2 = {
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },
    };
    const d = diagnoseUnfilledCells(schedule2, config3, baseProject([teacher('田中', ['数学'])])).get(makeKey(1, 3, 1));
    expect(d.kind).toBe('noQuotaLeft');
  });

  it("'未定' が担当科目を持てば常に候補になる (solver の placeholder 規則)", () => {
    const project = baseProject([teacher('未定', ['数学'], { maxDailyHours: 0 })]);
    const d = diagnoseUnfilledCells({}, diagConfig, project).get(makeKey(1, 1, 1));
    expect(d.kind).toBe('searchExhausted');
  });

  it('科目固定 (講師なし) セルはその科目だけで判定する', () => {
    const schedule = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '' } };
    // 英語の担当はいない (数学のみ) → noTeacherForSubject
    const d = diagnoseUnfilledCells(schedule, diagConfig, baseProject([teacher('田中', ['数学'])])).get(makeKey(1, 1, 1));
    expect(d.kind).toBe('noTeacherForSubject');
  });
});

describe('formatDiagnosis (N3b)', () => {
  it('種別ごとの短いラベルを返す', () => {
    expect(formatDiagnosis({ kind: 'noQuotaLeft', candidateCount: 0, reasons: { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 } }))
      .toContain('置く科目なし');
    expect(formatDiagnosis({ kind: 'noTeacherForSubject', candidateCount: 0, reasons: { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 } }))
      .toContain('担当講師がいない');
    expect(formatDiagnosis({ kind: 'searchExhausted', candidateCount: 2, reasons: { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 } }))
      .toBe('候補 2 名 — 探索切れの可能性');
    expect(formatDiagnosis({ kind: 'noCandidate', candidateCount: 0, reasons: { ng: 2, busy: 1, overDaily: 0, overTotal: 0, overConsecutive: 0 } }))
      .toBe('置ける講師なし (NG 2・同時限 1)');
    expect(formatDiagnosis(undefined)).toBe('');
  });
});
