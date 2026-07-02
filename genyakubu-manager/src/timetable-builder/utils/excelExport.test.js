import { describe, expect, it } from 'vitest';
import {
  hexToArgb,
  buildScheduleWorkbook as _buildScheduleWorkbook,
  buildTeacherWorkbook as _buildTeacherWorkbook,
  buildExcelFilename,
  computeSubjectStats as _computeSubjectStats,
} from './excelExport';
import { makeKey, makeNgKey, makeExternalKey } from './scheduleKey';

// v4: dates / periods は project 共通。本テストの fixture は tab.config に
// dates / periods を持たせているので、project レベルへ hoist してから渡す
// シムを噛ませる (全 fixture を無改修に保つ。tab を跨いだ dates / periods は
// 共通である前提なので tabs[0].config を代表値として使う)。
const hoist = (project) => ({
  ...project,
  dates: project.dates || project.tabs?.[0]?.config?.dates || [],
  periods: project.periods || project.tabs?.[0]?.config?.periods || [],
});
const buildScheduleWorkbook = (project) => _buildScheduleWorkbook(hoist(project));
const buildTeacherWorkbook = (project) => _buildTeacherWorkbook(hoist(project));
const computeSubjectStats = (project, subject) => _computeSubjectStats(hoist(project), subject);

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
  it('タブ数だけ worksheet を作り、科目別シートも追記する', () => {
    const project = makeProject({
      tabs: [
        { id: 1, name: 'tab-A', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'tab-B', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const wb = buildScheduleWorkbook(project);
    // タブ 2 つ + 科目別 (英語)
    expect(wb.worksheets.map(w => w.name)).toEqual(['tab-A', 'tab-B', '科目別_英語']);
  });

  it('タブ名の禁則文字は除去され、重複タブ名には suffix が付く (throw しない)', () => {
    const project = makeProject({
      tabs: [
        { id: 1, name: '中3 (1/7)', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: '中3', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 3, name: '中3', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const wb = buildScheduleWorkbook(project);
    const names = wb.worksheets.map(w => w.name);
    // '/' は exceljs の禁則文字 → 除去。同名 '中3' の 2 枚目は suffix。
    expect(names).toContain('中3 (17)');
    expect(names).toContain('中3');
    expect(names).toContain('中3_1');
  });

  it('禁則文字のみのタブ名は "Sheet" にフォールバック (空文字 throw の防止)', () => {
    const project = makeProject({
      tabs: [
        { id: 1, name: '***', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const wb = buildScheduleWorkbook(project);
    expect(wb.worksheets.map(w => w.name)).toContain('Sheet');
  });

  it('ヘッダ行に「日付」「時限」と各クラス名が並ぶ', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    expect(ws.getCell(1, 1).value).toBe('日付');
    expect(ws.getCell(1, 2).value).toBe('時限');
    expect(ws.getCell(1, 3).value).toBe('３S');
    expect(ws.getCell(1, 4).value).toBe('３A');
  });

  it('データ行のセルに subject + teacher(中学X:計Y) の改行表記が入る', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 2 行目 (1 行目は header): 12/25 / 1限 / ３S 列に英語/堀上
    // 堀上は 12/25(木) に 1限+2限 で計 2 コマ、externalCounts なしなので 計=2
    expect(ws.getCell(2, 1).value).toBe('12/25(木)');
    expect(ws.getCell(2, 2).value).toBe('1限');
    expect(ws.getCell(2, 3).value).toBe('英語\n堀上(中学2:計2)');
  });

  it('externalCounts (予備校・高校等の外部コマ) が「計」に加算される', () => {
    const project = makeProject({
      externalCounts: { [makeExternalKey('12/25(木)', '堀上')]: 3 },
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    // 12/25 の 堀上: 中学=2 (schedule内)、外部=3 → 計=5
    expect(ws.getCell(2, 3).value).toBe('英語\n堀上(中学2:計5)');
  });

  it('NG が設定されたコマに講師が割当たっていれば ⚠NG が追記される', () => {
    const project = makeProject({
      teachers: [
        {
          name: '堀上',
          subjects: ['英語'],
          ngSlots: [makeNgKey('12/25(木)', '1限')],
          ngClasses: [],
          priorityClasses: [],
        },
      ],
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    // 12/25 1限 = 堀上 の NG スロット → ⚠NG が追記
    expect(ws.getCell(2, 3).value).toBe('英語\n堀上(中学2:計2)\n⚠NG');
    // 12/25 2限 = NG ではない → ⚠NG なし
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)');
  });

  it('teacher 未定 (空 or "未定") のセルは中学/計の suffix を付けない', () => {
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '' },
          [makeKey(1, 2, 1)]: { subject: '英語', teacher: '未定' },
        },
      }],
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    expect(ws.getCell(2, 3).value).toBe('英語\n');
    expect(ws.getCell(3, 3).value).toBe('英語\n未定');
  });

  it('合同グループの非 primary クラスは "(合同)" 表記を維持 (count 付かない)', () => {
    const project = makeProject({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // primary
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' }, // 合同
        },
      }],
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    // 合同コマは 1 コマ扱い (computeGlobalUsage 側で重複除外)
    expect(ws.getCell(2, 3).value).toBe('英語\n堀上(中学1:計1)');
    expect(ws.getCell(2, 4).value).toBe('英語\n(合同)');
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

describe('computeSubjectStats', () => {
  // 中3 + 中1中2 の 2 タブ構成。各タブで英語コマがある状態。
  function makeMultiTabProject(overrides = {}) {
    return {
      version: 3,
      name: 'test',
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '松川', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      activeTabId: 1,
      tabs: [
        {
          id: 1, name: '中3',
          config: {
            dates: [{ id: 1, label: '7/29(水)' }, { id: 2, label: '7/30(木)' }],
            periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
            classes: [{ id: 1, label: '3SS' }, { id: 2, label: '3A' }],
            subjectCounts: { 英語: 2 },
          },
          schedule: {
            [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
            [makeKey(1, 1, 2)]: { subject: '英語', teacher: '松川' },
            [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
          },
        },
        {
          id: 2, name: '中1中2',
          // v4: dates / periods は project 共通。'7/29(水)'=id1, '1限'=id1 を共有し、
          // schedule もその共通 ID を使う (class のみ tab 固有 id10)。
          config: {
            classes: [{ id: 10, label: '1A' }],
            subjectCounts: { 英語: 1 },
          },
          schedule: {
            [makeKey(1, 1, 10)]: { subject: '英語', teacher: '松川' },
          },
        },
      ],
      combinedGroups: [],
      externalCounts: {},
      subjects: ['英語'],
      subjectColors: {},
      ...overrides,
    };
  }

  it('必要 = subjectCounts * classes.length、充足 = 該当 subject の schedule 件数', () => {
    const stats = computeSubjectStats(makeMultiTabProject(), '英語');
    expect(stats.tabStats).toEqual([
      { tabName: '中3', needed: 4, filled: 3 },  // 2 * 2 classes = 4 必要、3 件充足
      { tabName: '中1中2', needed: 1, filled: 1 }, // 1 * 1 = 1 必要、1 件充足
    ]);
  });

  it('講師別集計はタブごとに分かれる', () => {
    const stats = computeSubjectStats(makeMultiTabProject(), '英語');
    expect(stats.teacherStats['堀上']).toEqual({ '中3': 2 });
    expect(stats.teacherStats['松川']).toEqual({ '中3': 1, '中1中2': 1 });
  });

  it('合同非 primary は teacher 集計から除外、充足には含まれる', () => {
    const project = makeMultiTabProject({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['3SS', '3A'], dates: null }],
    });
    const stats = computeSubjectStats(project, '英語');
    // 中3 タブの 1 限で 3SS (primary) と 3A (合同) — 講師カウントは primary だけ
    expect(stats.teacherStats['堀上']['中3']).toBe(2); // 7/29 1限 (合同 primary) + 7/30 1限
    expect(stats.teacherStats['松川']['中3']).toBeUndefined(); // 3A は 合同非 primary なのでカウント外
    // 充足は cell 数なので変わらない
    expect(stats.tabStats[0].filled).toBe(3);
  });

  it('未定講師は "(未定)" として集計される', () => {
    const project = makeMultiTabProject({
      tabs: [{
        id: 1, name: '中3',
        config: makeMultiTabProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '' },
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '未定' },
        },
      }, makeMultiTabProject().tabs[1]],
    });
    const stats = computeSubjectStats(project, '英語');
    expect(stats.teacherStats['(未定)']).toEqual({ '中3': 2 });
    expect(stats.teachersFound.has('(未定)')).toBe(true);
  });

  it('NG コマには detail.note に ⚠NG が入る', () => {
    const project = makeMultiTabProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('7/29(水)', '1限')], ngClasses: [], priorityClasses: [] },
        { name: '松川', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    const stats = computeSubjectStats(project, '英語');
    const ngRow = stats.detailRows.find(r => r.date === '7/29(水)' && r.className === '3SS' && r.teacher === '堀上');
    expect(ngRow.note).toContain('⚠NG');
  });

  it('合同グループの detail.note に "合同(...)" が入る', () => {
    const project = makeMultiTabProject({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['3SS', '3A'], dates: null }],
    });
    const stats = computeSubjectStats(project, '英語');
    const r = stats.detailRows.find(r => r.date === '7/29(水)' && r.className === '3SS');
    expect(r.note).toMatch(/合同\(/);
  });
});

describe('buildScheduleWorkbook — 科目別シート', () => {
  function makeMultiTabProject() {
    return {
      version: 3,
      name: 'test',
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      activeTabId: 1,
      tabs: [
        {
          id: 1, name: '中3',
          config: {
            dates: [{ id: 1, label: '7/29(水)' }],
            periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
            classes: [{ id: 1, label: '3SS' }],
            subjectCounts: { 英語: 1, 数学: 1 },
          },
          schedule: {
            [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
            [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },
          },
        },
      ],
      combinedGroups: [],
      externalCounts: {},
      subjects: ['英語', '数学'],
      subjectColors: { 英語: '#DBEAFE', 数学: '#FEE2E2' },
    };
  }

  it('科目ごとにシートが作られる (科目別_英語, 科目別_数学)', () => {
    const wb = buildScheduleWorkbook(makeMultiTabProject());
    const names = wb.worksheets.map(w => w.name);
    expect(names).toContain('科目別_英語');
    expect(names).toContain('科目別_数学');
  });

  it('科目別シートのタイトル行に「科目: ◯◯」と科目カラーが入る', () => {
    const wb = buildScheduleWorkbook(makeMultiTabProject());
    const ws = wb.getWorksheet('科目別_英語');
    expect(ws.getCell(1, 1).value).toBe('科目: 英語');
    expect(ws.getCell(1, 1).fill).toEqual(expect.objectContaining({
      fgColor: { argb: 'FFDBEAFE' },
    }));
  });

  it('シート名禁則文字を除去する', () => {
    const project = makeMultiTabProject();
    project.subjects = ['英/語'];
    project.tabs[0].config.subjectCounts = { '英/語': 1 };
    project.tabs[0].schedule = { [makeKey(1, 1, 1)]: { subject: '英/語', teacher: '堀上' } };
    const wb = buildScheduleWorkbook(project);
    const names = wb.worksheets.map(w => w.name);
    expect(names).toContain('科目別_英語');
  });
});

// ─── シート名の防御 (F5g / F5h / F5i) ───────────────────────────────

describe('シート名の防御 (F5g/F5h/F5i)', () => {
  const tabConfig = () => ({
    dates: [{ id: 1, label: '12/25(木)' }],
    periods: [{ id: 1, label: '1限' }],
    classes: [{ id: 1, label: '３S' }],
    subjectCounts: { '英語': 1 },
  });

  it('大小文字違いのタブ名でも throw せず一意なシート名になる (F5g)', () => {
    // exceljs の addWorksheet は toLowerCase 比較で重複 reject するため、
    // 完全一致判定の uniq だと "classA"/"CLASSA" で throw していた。
    const p = makeProject({
      tabs: [
        { id: 1, name: 'classA', config: tabConfig(), schedule: {} },
        { id: 2, name: 'CLASSA', config: tabConfig(), schedule: {} },
      ],
    });
    const wb = buildScheduleWorkbook(p);
    const lower = wb.worksheets.map(ws => ws.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(lower).toContain('classa');
    expect(lower).toContain('classa_1');
  });

  it('先頭/末尾のシングルクォートは除去される (F5h)', () => {
    // exceljs は先頭/末尾 ' のシート名を reject する。
    const p = makeProject({
      tabs: [{ id: 1, name: "'中3'", config: tabConfig(), schedule: {} }],
    });
    const wb = buildScheduleWorkbook(p);
    expect(wb.worksheets[0].name).toBe('中3');
  });

  it('講師名が「全講師リスト」でも講師別出力が throw しない (F5i)', () => {
    const p = makeProject({
      teachers: [
        { name: '全講師リスト', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1,
        name: 'メイン',
        config: tabConfig(),
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '全講師リスト' } },
      }],
    });
    const wb = buildTeacherWorkbook(p);
    const names = wb.worksheets.map(ws => ws.name);
    // 個人シートが固定名を先取りしても、集約シートは suffix 付きで共存する
    expect(names).toHaveLength(2);
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(2);
    expect(names).toContain('全講師リスト');
  });
});
