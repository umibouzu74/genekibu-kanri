import { describe, expect, it } from 'vitest';
import {
  hexToArgb,
  buildScheduleWorkbook,
  buildTeacherWorkbook,
  buildExcelFilename,
} from './excelExport';
import { makeKey } from './scheduleKey';

// 共通の v3 project ファクトリ (テスト局所)
function makeProject(overrides = {}) {
  return {
    version: 3,
    name: 'test-proj',
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    activeTabId: 1,
    tabs: [{
      id: 1,
      name: 'メイン',
      config: {
        dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
        periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
        classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
        subjectCounts: { '英語': 1 },
      },
      schedule: {
        [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
        [makeKey(1, 2, 1)]: { subject: '英語', teacher: '堀上' },
      },
    }],
    combinedGroups: [],
    externalCounts: {},
    subjects: ['英語'],
    subjectColors: { '英語': '#DBEAFE' },
    ...overrides,
  };
}

describe('hexToArgb', () => {
  it('# 付き 6 桁を FF + 6 桁大文字に変換', () => {
    expect(hexToArgb('#DBEAFE')).toBe('FFDBEAFE');
    expect(hexToArgb('#fee2e2')).toBe('FFFEE2E2');
  });

  it('# 無しでも動作する', () => {
    expect(hexToArgb('DBEAFE')).toBe('FFDBEAFE');
  });
});

describe('buildExcelFilename', () => {
  it('project.name + suffix + 日付付きファイル名', () => {
    const name = buildExcelFilename({ name: 'my-project' }, '全体');
    expect(name).toMatch(/^my-project_全体_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('project.name が空なら「時間割」をフォールバック', () => {
    const name = buildExcelFilename({ name: '' }, '講師別');
    expect(name).toMatch(/^時間割_講師別_/);
  });

  it('Windows 禁則文字は除去される', () => {
    const name = buildExcelFilename({ name: 'a/b?c:d*e' }, '全体');
    expect(name).toMatch(/^abcde_全体_/);
  });
});

describe('buildScheduleWorkbook', () => {
  it('タブ数だけ worksheet を作る', () => {
    const project = makeProject({
      tabs: [
        { id: 1, name: 'tab-A', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'tab-B', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const wb = buildScheduleWorkbook(project);
    expect(wb.worksheets.map(w => w.name)).toEqual(['tab-A', 'tab-B']);
  });

  it('ヘッダ行に「日付」「時限」と各クラス名が並ぶ', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    expect(ws.getCell(1, 1).value).toBe('日付');
    expect(ws.getCell(1, 2).value).toBe('時限');
    expect(ws.getCell(1, 3).value).toBe('３S');
    expect(ws.getCell(1, 4).value).toBe('３A');
  });

  it('データ行のセルに subject + teacher の改行表記が入る', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 2 行目 (1 行目は header): 12/25 / 1限 / ３S 列に英語/堀上
    expect(ws.getCell(2, 1).value).toBe('12/25(木)');
    expect(ws.getCell(2, 2).value).toBe('1限');
    expect(ws.getCell(2, 3).value).toBe('英語\n堀上');
  });

  it('未充填セルは空文字', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 3A 列 (cIdx=4) は schedule に無いので空
    expect(ws.getCell(2, 4).value).toBe('');
  });

  it('日付列が時限の数だけ merge される (2 期間 × 2 日 → 2 つの merge 範囲)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // merges は文字列 'A2:A3' 等で参照可能
    const mergeKeys = Array.isArray(ws.model.merges)
      ? ws.model.merges
      : Object.keys(ws._merges || {});
    expect(mergeKeys).toHaveLength(2);
    // 1 日目: row 2-3、2 日目: row 4-5 (1-based)
    const joined = mergeKeys.join(',');
    expect(joined).toMatch(/A2:A3/);
    expect(joined).toMatch(/A4:A5/);
  });

  it('科目カラーが指定されていれば fill が設定される (ARGB)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    const cell = ws.getCell(2, 3); // 英語 (#DBEAFE)
    expect(cell.fill).toEqual(expect.objectContaining({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    }));
  });

  it('空 project でも throw しない (smoke test)', () => {
    const empty = makeProject({
      tabs: [{ id: 1, name: 'empty', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} }],
    });
    expect(() => buildScheduleWorkbook(empty)).not.toThrow();
  });

  it('1 期間しかない場合は merge を作らない (merge 範囲は最低 2 セル必要)', () => {
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: {},
        },
        schedule: {},
      }],
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    const mergeKeys = Array.isArray(ws.model.merges)
      ? ws.model.merges
      : Object.keys(ws._merges || {});
    expect(mergeKeys).toHaveLength(0);
  });
});

describe('buildTeacherWorkbook', () => {
  it('講師ごとの個人シート + 全講師リストシートを作る', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const names = wb.worksheets.map(w => w.name);
    expect(names).toContain('堀上');
    expect(names).toContain('全講師リスト');
  });

  it('該当コマが無い講師の個人シートは作らない (空 teacher は除外)', () => {
    const project = makeProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] }, // 該当無し
      ],
    });
    const wb = buildTeacherWorkbook(project);
    const names = wb.worksheets.map(w => w.name);
    expect(names).toContain('堀上');
    expect(names).not.toContain('田中');
  });

  it('全講師リストシートにも該当行が出る', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.getWorksheet('全講師リスト');
    // header + 2 行 (12/25 1限 + 12/26 1限 で 1 限ずつ)
    expect(ws.rowCount).toBe(3);
    expect(ws.getCell(2, 1).value).toBe('堀上');
    expect(ws.getCell(2, 5).value).toBe('英語');
  });

  it('講師名に Windows 禁則文字があれば sheet 名から除去', () => {
    const project = makeProject({
      teachers: [
        { name: 'a/b:c', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: 'a/b:c' },
        },
      }],
    });
    const wb = buildTeacherWorkbook(project);
    const names = wb.worksheets.map(w => w.name);
    // 禁則文字除去後の "abc" が含まれていれば OK
    expect(names).toContain('abc');
  });

  it('合同グループのクラスは備考欄に "合同(...)" が入る', () => {
    const project = makeProject({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
        },
      }],
    });
    const wb = buildTeacherWorkbook(project);
    const ws = wb.getWorksheet('堀上');
    // 1 行目=header、2 行目=１つめ。備考欄 (6 列目) に合同表記
    expect(ws.getCell(2, 6).value).toMatch(/^合同\(/);
  });
});
