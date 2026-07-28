import { describe, expect, it, vi } from 'vitest';
import {
  hexToArgb,
  buildScheduleWorkbook as _buildScheduleWorkbook,
  buildTeacherWorkbook as _buildTeacherWorkbook,
  buildExcelFilename,
  computeSubjectStats as _computeSubjectStats,
  computeTeacherClassCounts as _computeTeacherClassCounts,
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
const computeTeacherClassCounts = (project) => _computeTeacherClassCounts(hoist(project));

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

  it('日付はローカル日付で組む (N1f: JST 深夜の出力で前日にならない)', () => {
    // toISOString (UTC) だと TZ=Asia/Tokyo の 0〜9 時に前日日付へずれる。
    // JST 2026-07-10 00:30 (= UTC 07-09 15:30) でローカル日付になることを確認。
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T15:30:00Z'));
    try {
      expect(buildExcelFilename({ name: 'p' }, '全体')).toBe('p_全体_2026-07-10.xlsx');
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
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

  it('行 1 にタイトル、行 2 に「日付」「時限」と各クラス名が並ぶ (N5a)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // N5a: タイトル行 (プロジェクト名 — タブ名 / 期間 / 出力日)
    expect(String(ws.getCell(1, 1).value)).toMatch(/メイン \/ 期間 12\/25\(木\)〜12\/26\(金\) \/ 出力日 \d+\/\d+/);
    expect(ws.getCell(2, 1).value).toBe('日付');
    expect(ws.getCell(2, 2).value).toBe('時限');
    expect(ws.getCell(2, 3).value).toBe('３S');
    expect(ws.getCell(2, 4).value).toBe('３A');
  });

  it('データ行のセルに subject + teacher(中学X:計Y) の改行表記が入る', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 3 行目 (1 = タイトル, 2 = header): 12/25 / 1限 / ３S 列に英語/堀上
    // 堀上は 12/25(木) に 1限+2限 で計 2 コマ、externalCounts なしなので 計=2
    expect(ws.getCell(3, 1).value).toBe('12/25(木)');
    expect(ws.getCell(3, 2).value).toBe('1限');
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)');
  });

  it('externalCounts (予備校・高校等の外部コマ) が「計」に加算される', () => {
    const project = makeProject({
      externalCounts: { [makeExternalKey('12/25(木)', '堀上')]: 3 },
    });
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    // 12/25 の 堀上: 中学=2 (schedule内)、外部=3 → 計=5
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計5)');
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
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)\n⚠NG');
    // 12/25 2限 = NG ではない → ⚠NG なし
    expect(ws.getCell(4, 3).value).toBe('英語\n堀上(中学2:計2)');
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
    expect(ws.getCell(3, 3).value).toBe('英語\n');
    expect(ws.getCell(4, 3).value).toBe('英語\n未定');
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
    // 合同コマは 1 コマ扱い (computeGlobalUsage 側で重複除外)。
    // 回数連番 (Q1) はクラスごとに数えるので両クラスとも ① が付く。
    expect(ws.getCell(3, 3).value).toBe('英語①\n堀上(中学1:計1)');
    expect(ws.getCell(3, 4).value).toBe('英語①\n(合同)');
  });

  it('未充填セルは空文字', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 3A 列 (cIdx=4) は schedule に無いので空
    expect(ws.getCell(3, 4).value).toBe('');
  });

  it('日付列が時限の数だけ merge される (2 期間 × 2 日 → 2 つの merge 範囲)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // merges は文字列 'A2:A3' 等で参照可能
    const mergeKeys = Array.isArray(ws.model.merges)
      ? ws.model.merges
      : Object.keys(ws._merges || {});
    // N5a: タイトル行の A1:C1 結合 + 日付 merge 2 つ
    expect(mergeKeys).toHaveLength(3);
    // 1 日目: row 3-4、2 日目: row 5-6 (1 = タイトル, 2 = header)
    const joined = mergeKeys.join(',');
    expect(joined).toMatch(/A3:A4/);
    expect(joined).toMatch(/A5:A6/);
  });

  it('日付が変わる行の上辺と最終行の下辺が太線になる (日付区切り)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    // 2 日 × 2 限 → データは行 3〜6。行 3 (初日) と行 5 (12/25 → 12/26 の
    // 切り替わり) の上辺が medium、全列に引かれる
    expect(ws.getCell(3, 1).border.top.style).toBe('medium');
    expect(ws.getCell(5, 1).border.top.style).toBe('medium');
    expect(ws.getCell(5, 4).border.top.style).toBe('medium');
    // 最終行 (行 6) の下辺も太線で閉じる (列 1 は merge の slave セルだが、
    // 範囲内で style を共有するため結合セルの下辺として描画される)
    expect(ws.getCell(6, 1).border.bottom.style).toBe('medium');
    expect(ws.getCell(6, 4).border.bottom.style).toBe('medium');
    // 同一日付内の行 (行 4 = 12/25 の 2限) の上辺は thin のまま
    expect(ws.getCell(4, 2).border.top.style).toBe('thin');
    expect(ws.getCell(4, 3).border.top.style).toBe('thin');
    // 太線の上書きで科目カラーの fill は消えない
    expect(ws.getCell(3, 3).fill).toEqual(expect.objectContaining({
      fgColor: { argb: 'FFDBEAFE' },
    }));
  });

  it('科目カラーが指定されていれば fill が設定される (ARGB)', () => {
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    const cell = ws.getCell(3, 3); // 英語 (#DBEAFE)
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
    // N5a のタイトル行結合 (A1:C1) のみで、日付列の merge は作らない
    expect(mergeKeys).toHaveLength(1);
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

  it('タブ列の見出しは個人シート・全講師リストとも「学年(タブ)」に統一 (N5d)', () => {
    const wb = buildTeacherWorkbook(makeProject());
    // 個人シートは行 1 = タイトル (P1)、行 2 = S3 まとめなのでヘッダは行 3
    expect(wb.getWorksheet('堀上').getCell(3, 5).value).toBe('学年(タブ)');
    expect(wb.getWorksheet('全講師リスト').getCell(1, 6).value).toBe('学年(タブ)');
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
    // 1 行目=タイトル、2 行目=S3 まとめ、3 行目=header、4 行目=１つめ。
    // 備考欄 (6 列目) に合同表記
    expect(ws.getCell(4, 6).value).toMatch(/^合同\(/);
  });
});

// ─── S1: クラス別回数まとめ (座席表の事前印刷用) ─────────────────────

describe('computeTeacherClassCounts (S1)', () => {
  it('タブ順 × クラス順の列に講師ごとの回数を集計する', () => {
    const stats = computeTeacherClassCounts(makeProject());
    expect(stats.columns).toEqual([
      { tabName: 'メイン', className: '３S' },
      { tabName: 'メイン', className: '３A' },
    ]);
    expect(stats.tabSpans).toEqual([{ tabName: 'メイン', count: 2 }]);
    // 堀上は ３S に 2 回 (12/25 の 1・2 限)、うち 2 限は最終コマ = 確認テスト付き
    expect(stats.rows).toEqual([
      { teacher: '堀上', counts: [2, 0], testCounts: [1, 0], total: 2, testTotal: 1 },
    ]);
    expect(stats.columnTotals).toEqual([2, 0]);
    expect(stats.columnTestTotals).toEqual([1, 0]);
    expect(stats.grandTotal).toBe(2);
    expect(stats.grandTestTotal).toBe(1);
  });

  it('確認テスト = 各日の最終コマだけを testCounts に数える (S2)', () => {
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 1限 → テスト無し
          [makeKey(1, 2, 1)]: { subject: '数学', teacher: '堀上' }, // 最終コマ → テスト
          [makeKey(2, 2, 2)]: { subject: '英語', teacher: '堀上' }, // 別日の最終コマ → テスト
        },
      }],
    });
    const stats = computeTeacherClassCounts(project);
    expect(stats.rows).toEqual([
      { teacher: '堀上', counts: [2, 1], testCounts: [1, 1], total: 3, testTotal: 2 },
    ]);
    expect(stats.columnTestTotals).toEqual([1, 1]);
    expect(stats.grandTestTotal).toBe(2);
  });

  it('最終コマはタブが使う時限 (activePeriodIds) に絞った上での末尾 (E-3)', () => {
    const base = makeProject().tabs[0].config;
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: { ...base, activePeriodIds: [1] }, // 2限は使わない → 最終コマ = 1限
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      }],
    });
    const stats = computeTeacherClassCounts(project);
    expect(stats.rows[0].testCounts).toEqual([1, 0]);
    expect(stats.grandTestTotal).toBe(1);
  });

  it('行順は project.teachers の並び → 登録外 → (未定) 末尾', () => {
    const project = makeProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '松川', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          // schedule 上の出現順は 松川 → 未定 → 登録外 → 堀上
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '松川' },
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '未定' },
          [makeKey(1, 2, 1)]: { subject: '英語', teacher: '飛び入り' },
          [makeKey(1, 2, 2)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '' },
        },
      }],
    });
    const stats = computeTeacherClassCounts(project);
    expect(stats.rows.map(r => r.teacher)).toEqual(['堀上', '松川', '飛び入り', '(未定)']);
    // 未定 ('未定' と空文字) は (未定) 行にまとまり、列計 = クラスの総コマ数
    expect(stats.rows[3].counts).toEqual([1, 1]);
    expect(stats.rows[3].testCounts).toEqual([0, 0]);
    expect(stats.columnTotals).toEqual([3, 2]);
    expect(stats.columnTestTotals).toEqual([1, 1]); // 飛び入り(３S 2限) + 堀上(３A 2限)
    expect(stats.grandTotal).toBe(5);
    expect(stats.grandTestTotal).toBe(2);
  });

  it('合同は代表クラスの列に 1 回だけ数える (科目別シートと同じ規約)', () => {
    const project = makeProject({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' }, // secondary (伝播分)
        },
      }],
    });
    const stats = computeTeacherClassCounts(project);
    expect(stats.rows).toEqual([
      { teacher: '堀上', counts: [1, 0], testCounts: [0, 0], total: 1, testTotal: 0 },
    ]);
    expect(stats.grandTotal).toBe(1);
  });

  it('複数タブは各タブのクラス列が並び、同名タブでも span は分かれる', () => {
    const baseConfig = makeProject().tabs[0].config;
    const project = makeProject({
      tabs: [
        {
          id: 1, name: '中3', config: baseConfig,
          schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        },
        {
          id: 2, name: '中3',
          config: { ...baseConfig, classes: [{ id: 1, label: '３B' }] },
          schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        },
      ],
    });
    const stats = computeTeacherClassCounts(project);
    expect(stats.columns.map(c => c.className)).toEqual(['３S', '３A', '３B']);
    expect(stats.tabSpans).toEqual([
      { tabName: '中3', count: 2 },
      { tabName: '中3', count: 1 },
    ]);
    expect(stats.rows).toEqual([
      { teacher: '堀上', counts: [1, 0, 1], testCounts: [0, 0, 0], total: 2, testTotal: 0 },
    ]);
  });
});

describe('buildTeacherWorkbook — クラス別回数まとめシート (S1)', () => {
  it('1 枚目のシートとして 講師 × クラス の行列 + 計を出す', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('クラス別回数');
    // 行 1 = タイトル、行 2 = 学年(タブ)、行 3 = クラス
    expect(String(ws.getCell(1, 1).value)).toContain('クラス別回数まとめ — test-proj');
    expect(ws.getCell(2, 1).value).toBe('講師');
    expect(ws.getCell(2, 2).value).toBe('メイン');
    expect(ws.getCell(2, 4).value).toBe('計');
    expect(ws.getCell(3, 2).value).toBe('３S');
    expect(ws.getCell(3, 3).value).toBe('３A');
    // データ行 (行 4): 0 回は空欄。うち確認テスト (最終コマ) は "(テN)" 併記 (S2)
    expect(ws.getCell(4, 1).value).toBe('堀上');
    expect(ws.getCell(4, 2).value).toBe('2(テ1)');
    expect(ws.getCell(4, 3).value || '').toBe('');
    expect(ws.getCell(4, 4).value).toBe('2(テ1)');
    // 合計行 (行 5) は 0 も数値で出す (クラスの総コマ数の突き合わせ用)
    expect(ws.getCell(5, 1).value).toBe('計');
    expect(ws.getCell(5, 2).value).toBe('2(テ1)');
    expect(ws.getCell(5, 3).value).toBe(0);
    expect(ws.getCell(5, 4).value).toBe('2(テ1)');
    // 凡例 (行 7 = 合計行 + 空行の次) に (テN) の説明
    expect(String(ws.getCell(7, 1).value)).toContain('(テN) はうち確認テスト付き');
  });

  it('確認テストの無いセルは数値のまま出す', () => {
    // 1 限のみ (最終コマは 2 限で未使用) → テ表記なしの素の数値
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      }],
    });
    const ws = buildTeacherWorkbook(project).getWorksheet('クラス別回数');
    expect(ws.getCell(4, 2).value).toBe(1);
    expect(ws.getCell(4, 4).value).toBe(1);
  });

  it('B4 縦 + タイトル/ヘッダ 3 行繰り返しの印刷既定 (P1 と同じ)', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.getWorksheet('クラス別回数');
    expect(ws.pageSetup.paperSize).toBe(12);
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.printTitlesRow).toBe('1:3');
  });

  it('(未定) 行がある場合のみ凡例に注記が出る', () => {
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '英語', teacher: '' },
        },
      }],
    });
    const ws = buildTeacherWorkbook(project).getWorksheet('クラス別回数');
    const texts = [];
    ws.eachRow((row) => row.eachCell((cell) => texts.push(String(cell.value ?? ''))));
    expect(texts.join('\n')).toContain('(未定) は講師未割当のコマ');

    const wsNone = buildTeacherWorkbook(makeProject()).getWorksheet('クラス別回数');
    const textsNone = [];
    wsNone.eachRow((row) => row.eachCell((cell) => textsNone.push(String(cell.value ?? ''))));
    expect(textsNone.join('\n')).not.toContain('(未定)');
  });

  it('個人シートのタイトル直下 (行 2) に自分のクラス別回数 + 計が入る (S3)', () => {
    const ws = buildTeacherWorkbook(makeProject()).getWorksheet('堀上');
    expect(ws.getCell(2, 1).value).toBe(
      'クラス別回数: ３S 2(テ1) ／ 計 2(テ1) ※(テN)=うち確認テスト付き(最終コマ)',
    );
    // まとめ行は全 6 列に結合される
    const mergeKeys = Array.isArray(ws.model.merges)
      ? ws.model.merges
      : Object.keys(ws._merges || {});
    expect(mergeKeys).toContain('A2:F2');
  });

  it('確認テスト付きコマが無ければ個人まとめ行に (テN) 表記も凡例も付かない (S3)', () => {
    const project = makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        // 1 限のみ (最終コマの 2 限は未使用) → テ表記なし
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      }],
    });
    const ws = buildTeacherWorkbook(project).getWorksheet('堀上');
    expect(ws.getCell(2, 1).value).toBe('クラス別回数: ３S 1 ／ 計 1');
  });

  it('複数タブでは個人まとめ行のクラス名にタブ名を前置して区別する (S3)', () => {
    const base = makeProject().tabs[0].config;
    const project = makeProject({
      tabs: [
        {
          id: 1, name: '中3', config: base,
          schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        },
        {
          id: 2, name: '中1', config: { ...base, classes: [{ id: 1, label: '１A' }] },
          schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        },
      ],
    });
    const ws = buildTeacherWorkbook(project).getWorksheet('堀上');
    expect(ws.getCell(2, 1).value).toBe('クラス別回数: 中3 ３S 1、中1 １A 1 ／ 計 2');
  });

  it('講師名が「クラス別回数」でも throw しない (F5i と同じ防御)', () => {
    const project = makeProject({
      teachers: [
        { name: 'クラス別回数', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: 'クラス別回数' } },
      }],
    });
    const wb = buildTeacherWorkbook(project);
    const names = wb.worksheets.map(ws => ws.name);
    // まとめシートが固定名を先取りし、個人シートは suffix 付きで共存する
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(names.length);
    expect(names).toContain('クラス別回数');
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

  it('クラス別コマ数の上書き (§N) は必要コマ数に反映される', () => {
    const project = makeMultiTabProject();
    // 中3: 3A (id=2) だけ英語 1 に上書き → 必要 = 2 + 1 = 3
    project.tabs[0].config.classSubjectCounts = { '2': { '英語': 1 } };
    const stats = computeSubjectStats(project, '英語');
    expect(stats.tabStats[0]).toEqual({ tabName: '中3', needed: 3, filled: 3 });
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
    // (S1 のクラス別回数まとめを含めて 3 枚)
    expect(names).toHaveLength(3);
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(3);
    expect(names).toContain('全講師リスト');
  });
});

// ── E3b: 実バイナリの round-trip 検証 ─────────────────────────────
// これまでの構造テストは「workbook オブジェクトに何を積んだか」しか見て
// おらず、xlsx への serialize / deserialize 層 (exceljs writer) の regression
// は素通りだった。ここでは writeBuffer で実際に xlsx バイナリへ書き出し、
// 同じ exceljs で読み戻して、値・結合・塗り色・罫線・列幅が実ファイルに
// 残っていることを固定する。
// (import は ESM の hoisting で先頭 import 群と同時に解決される)
import ExcelJS from 'exceljs';
// zip 内の XML 検証用 (P2)。exceljs の依存なので追加インストール不要。
import JSZip from 'jszip';

async function roundTrip(wb) {
  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

describe('xlsx round-trip (E3b)', () => {
  it('スケジュール出力: シート・値・結合・塗り・罫線・列幅がバイナリに残る', async () => {
    const wb2 = await roundTrip(buildScheduleWorkbook(makeProject()));

    // シート構成 (タブ + 科目別)
    const names = wb2.worksheets.map((ws) => ws.name);
    expect(names).toContain('メイン');
    expect(names).toContain('科目別_英語');

    const ws = wb2.getWorksheet('メイン');
    // 値 (N5a タイトル + ヘッダ + データセルの改行表記)
    expect(String(ws.getCell(1, 1).value)).toContain('test-proj — メイン');
    expect(ws.getCell(2, 1).value).toBe('日付');
    expect(ws.getCell(2, 3).value).toBe('３S');
    expect(ws.getCell(3, 1).value).toBe('12/25(木)');
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)');

    // 日付セルの縦結合 (2 時限分): A3 が master、A4 は merged
    // (行 1 = N5a タイトル、行 2 = ヘッダ)
    expect(ws.getCell('A4').isMerged).toBe(true);
    expect(ws.getCell('A4').master.address).toBe('A3');

    // 科目カラーの塗り (英語 #DBEAFE → FFDBEAFE)
    const fill = ws.getCell(3, 3).fill;
    expect(fill?.type).toBe('pattern');
    expect(fill?.fgColor?.argb).toBe('FFDBEAFE');

    // 罫線と wrapText: 行 3 は日付区切りなので上辺 medium、左辺は thin のまま。
    // 同一日付内の行 4 の上辺は thin。
    expect(ws.getCell(3, 3).border?.top?.style).toBe('medium');
    expect(ws.getCell(3, 3).border?.left?.style).toBe('thin');
    expect(ws.getCell(4, 3).border?.top?.style).toBe('thin');
    expect(ws.getCell(3, 3).alignment?.wrapText).toBe(true);
    // 最終データ行の下辺太線も round-trip で残る (列 1 は結合セルの slave)
    expect(ws.getCell(6, 1).border?.bottom?.style).toBe('medium');
    expect(ws.getCell(6, 4).border?.bottom?.style).toBe('medium');

    // 列幅 (日付/時限 14、クラス列 16)
    expect(ws.getColumn(1).width).toBe(14);
    expect(ws.getColumn(3).width).toBe(16);

    // ヘッダの塗りと白文字 (4472C4 / FFFFFF)
    expect(ws.getCell(2, 1).fill?.fgColor?.argb).toBe('FF4472C4');
    expect(ws.getCell(2, 1).font?.color?.argb).toBe('FFFFFFFF');
  });

  it('講師別出力もバイナリ round-trip で壊れない', async () => {
    const wb2 = await roundTrip(buildTeacherWorkbook(makeProject()));
    const names = wb2.worksheets.map((ws) => ws.name);
    // 集約シート + 講師 1 名分
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names).toContain('堀上');
    // 個人シートに担当コマの値が残っている
    const ws = wb2.getWorksheet('堀上');
    const texts = [];
    ws.eachRow((row) => row.eachCell((cell) => texts.push(String(cell.value ?? ''))));
    expect(texts.join('\n')).toContain('英語');
    // P1: タイトル行 (講師名) と B4 縦 + 先頭行繰り返しの印刷設定がバイナリに残る
    expect(String(ws.getCell(1, 1).value)).toMatch(/^堀上 — test-proj \//);
    // S3: 行 2 の個人まとめもバイナリに残る
    expect(String(ws.getCell(2, 1).value)).toContain('クラス別回数:');
    expect(ws.pageSetup.paperSize).toBe(12);
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.printTitlesRow).toBe('1:3');
    const wsAll = wb2.getWorksheet('全講師リスト');
    expect(wsAll.pageSetup.paperSize).toBe(12);
    expect(wsAll.pageSetup.printTitlesRow).toBe('1:1');
    // S1: クラス別回数まとめの値・ヘッダ結合もバイナリに残る
    const wsSum = wb2.getWorksheet('クラス別回数');
    expect(wsSum.getCell(2, 1).value).toBe('講師');
    expect(wsSum.getCell(4, 1).value).toBe('堀上');
    expect(wsSum.getCell(4, 2).value).toBe('2(テ1)');
    // タブ名の横結合 (B2:C2) と 講師 の縦結合 (A2:A3)
    expect(wsSum.getCell('C2').isMerged).toBe(true);
    expect(wsSum.getCell('C2').master.address).toBe('B2');
    expect(wsSum.getCell('A3').master.address).toBe('A2');
  });
});

// 旧「配布用 clean モード (L5c)」のテストは、配布用出力が完成版レイアウト
// (distributionExport.ts) に置き換わったため削除。配布用の挙動 (注記なし・
// 科目別シートなし 等) は distributionExport.test.js が引き継いでいる。
describe('buildScheduleWorkbook — 全体 (作成用) 出力', () => {
  it('稼働カウントと ⚠NG の注記入りで出力する', () => {
    const project = makeProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: ['12/25(木)-1限'], ngClasses: [], priorityClasses: [] },
      ],
    });
    const wb = _buildScheduleWorkbook(hoist(project));
    expect(wb.getWorksheet(1).getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)\n⚠NG');
  });

  it('科目別集計シートを出す', () => {
    const wb = _buildScheduleWorkbook(hoist(makeProject()));
    expect(wb.worksheets.map(w => w.name).some(n => n.startsWith('科目別_'))).toBe(true);
  });
});

describe('回数連番 (第N回) の丸数字 (Q1)', () => {
  // 日をまたいで同一クラスに同じ科目が並ぶ fixture (同日重複なし)。
  // 12/25 1限 → ①、12/26 1限 → ② になる。
  function makeSequenceProject(overrides = {}) {
    return makeProject({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
          periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 2 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
        },
      }],
      ...overrides,
    });
  }

  it('全体 Excel: クラス内を日付 → 時限順に数えた丸数字が科目名に付く (画面表示と同じ)', () => {
    const wb = buildScheduleWorkbook(makeSequenceProject());
    const ws = wb.getWorksheet('メイン');
    // 行 3 = 12/25 1限、行 5 = 12/26 1限
    expect(ws.getCell(3, 3).value).toBe('英語①\n堀上(中学1:計1)');
    expect(ws.getCell(5, 3).value).toBe('英語②\n堀上(中学1:計1)');
  });

  it('連番はクラスごとに独立して数える', () => {
    const project = makeSequenceProject();
    // ３A (id=2) の初回英語 → ３S の既存 2 コマとは独立に ①
    project.tabs[0].schedule[makeKey(2, 2, 2)] = { subject: '英語', teacher: '未定' };
    const wb = buildScheduleWorkbook(project);
    const ws = wb.getWorksheet('メイン');
    expect(ws.getCell(6, 4).value).toBe('英語①\n未定');
  });

  it('同一クラス×同日に同じ科目が重複している間は番号を付けない (UI の subjectDup 時と同じ)', () => {
    // 既定 fixture は 12/25 の 1限+2限 に英語×2 (同日重複)
    const wb = buildScheduleWorkbook(makeProject());
    const ws = wb.getWorksheet('メイン');
    expect(ws.getCell(3, 3).value).toBe('英語\n堀上(中学2:計2)');
    expect(ws.getCell(4, 3).value).toBe('英語\n堀上(中学2:計2)');
  });

  it("クォータ超過の回は '!' を添える (UI の赤字 '!' に対応する作成者向け注記)", () => {
    const project = makeSequenceProject();
    project.tabs[0].config.subjectCounts = { '英語': 1 }; // 2 回目以降は超過
    const wb = buildScheduleWorkbook(project);
    expect(wb.getWorksheet('メイン').getCell(5, 3).value).toBe('英語②!\n堀上(中学1:計1)');
  });

  it('講師別 Excel の科目列にも丸数字が付く (個人シート + 全講師リスト)', () => {
    const wb = buildTeacherWorkbook(makeSequenceProject());
    const ws = wb.getWorksheet('堀上');
    // 行 1 = タイトル、行 2 = S3 まとめ、行 3 = ヘッダ。科目は 4 列目
    expect(ws.getCell(4, 4).value).toBe('英語①');
    expect(ws.getCell(5, 4).value).toBe('英語②');
    const wsAll = wb.getWorksheet('全講師リスト');
    expect(wsAll.getCell(2, 5).value).toBe('英語①');
  });

  it("講師別 Excel にはクォータ超過の '!' を付けない (講師へ渡す紙面のため)", () => {
    const project = makeSequenceProject();
    project.tabs[0].config.subjectCounts = { '英語': 1 };
    const wb = buildTeacherWorkbook(project);
    expect(wb.getWorksheet('堀上').getCell(5, 4).value).toBe('英語②');
  });
});

describe('buildTeacherWorkbook — 外部授業 (他学年セッション) の統合', () => {
  // 時刻付き時限ラベル 2 日構成 + 予備校/高校セッション
  function makeProjectWithSessions() {
    return makeProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        // コマ 0・セッションのみの講師 (シートを作らない従来挙動の確認用)
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: '中3',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
          periods: [{ id: 1, label: '1限 (13:00~13:45)' }, { id: 2, label: '2限 (14:00~14:45)' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 2 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 12/25 13:00
          [makeKey(2, 2, 1)]: { subject: '英語', teacher: '堀上' }, // 12/26 14:00
        },
      }],
      externalSessions: [
        { id: 1, date: '12/25(木)', teacherName: '堀上', label: '10:00-11:00', memo: '予備校（早朝）', startTime: '10:00', endTime: '11:00' },
        { id: 2, date: '12/26(金)', teacherName: '堀上', label: '18:00-19:00', memo: '', startTime: '18:00', endTime: '19:00' },
        { id: 3, date: '12/25(木)', teacherName: '田中', label: '', memo: '高校', startTime: '09:00' },
      ],
    });
  }

  it('個人シートに外部授業が日付 → 時刻順で講習コマと混在する', () => {
    const wb = buildTeacherWorkbook(makeProjectWithSessions());
    const ws = wb.getWorksheet('堀上');
    // タイトル + S3 まとめ + header + 12/25: 予備校(10:00) → 1限(13:00) /
    // 12/26: 2限(14:00) → 外部(18:00)
    expect(ws.rowCount).toBe(7);
    // 外部授業は科目欄=空欄、学年(タブ) 列=種別 (メモ＝プリセット名)
    expect([ws.getCell(4, 1).value, ws.getCell(4, 2).value, ws.getCell(4, 4).value, ws.getCell(4, 5).value])
      .toEqual(['12/25(木)', '10:00〜11:00', '', '予備校（早朝）']);
    expect([ws.getCell(5, 1).value, ws.getCell(5, 2).value]).toEqual(['12/25(木)', '1限 (13:00~13:45)']);
    expect([ws.getCell(6, 1).value, ws.getCell(6, 2).value]).toEqual(['12/26(金)', '2限 (14:00~14:45)']);
    // メモも一致プリセットも無い外部授業は学年(タブ) 列 '外部' でフォールバック
    expect([ws.getCell(7, 1).value, ws.getCell(7, 2).value, ws.getCell(7, 4).value, ws.getCell(7, 5).value])
      .toEqual(['12/26(金)', '18:00〜19:00', '', '外部']);
  });

  it('メモ未設定でも時刻がプリセットに一致すれば学年(タブ) 列にプリセット名を表示する', () => {
    const project = makeProjectWithSessions();
    project.externalSessionPresets = [
      { id: 1, name: '高校', startTime: '18:00', endTime: '19:00' },
    ];
    const wb = buildTeacherWorkbook(project);
    const ws = wb.getWorksheet('堀上');
    // 12/26 18:00 のメモ無しセッション (行 7) が「高校」と表示される
    // (表示のみ — project.externalSessions のメモ自体は書き換えない)
    expect(ws.getCell(7, 5).value).toBe('高校');
    expect(project.externalSessions.find(s => s.id === 2).memo).toBe('');
  });

  it('講習コマ 0 でセッションだけの講師はシートも全講師リストにも載せない', () => {
    const wb = buildTeacherWorkbook(makeProjectWithSessions());
    expect(wb.worksheets.map(w => w.name)).not.toContain('田中');
    const wsAll = wb.getWorksheet('全講師リスト');
    const teacherCol = [];
    for (let r = 2; r <= wsAll.rowCount; r++) teacherCol.push(wsAll.getCell(r, 1).value);
    expect(teacherCol).not.toContain('田中');
  });

  it('全講師リストにも外部授業行が同じ並びで入る (クラス列は "-"、学年(タブ) 列は種別)', () => {
    const wb = buildTeacherWorkbook(makeProjectWithSessions());
    const wsAll = wb.getWorksheet('全講師リスト');
    expect(wsAll.rowCount).toBe(5); // header + 堀上 4 行
    expect([wsAll.getCell(2, 1).value, wsAll.getCell(2, 3).value, wsAll.getCell(2, 4).value, wsAll.getCell(2, 6).value])
      .toEqual(['堀上', '10:00〜11:00', '-', '予備校（早朝）']);
  });

  it('日付が変わる行の上辺と最終行の下辺が太線になる (日付区切り)', () => {
    const wb = buildTeacherWorkbook(makeProjectWithSessions());
    const ws = wb.getWorksheet('堀上');
    // 行 4 (データ先頭) と行 6 (12/25 → 12/26 の切り替わり) の上辺が medium、
    // 同日続きの行 5 は thin のまま (行 1 = タイトル、行 2 = S3 まとめ、
    // 行 3 = ヘッダ)
    expect(ws.getCell(4, 1).border.top.style).toBe('medium');
    expect(ws.getCell(5, 1).border.top.style).toBe('thin');
    expect(ws.getCell(6, 1).border.top.style).toBe('medium');
    expect(ws.getCell(6, 6).border.top.style).toBe('medium'); // 全列に引く
    // 最終行の下辺も太線で閉じる
    expect(ws.getCell(7, 1).border.bottom.style).toBe('medium');
    // 太線の上書きで外部授業行のグレー塗りは消えない
    expect(ws.getCell(4, 1).fill?.fgColor?.argb).toBe('FFF2F2F2');
    // 全講師リストにも同じ区切りが入る (こちらはタイトル行なし)
    const wsAll = wb.getWorksheet('全講師リスト');
    expect(wsAll.getCell(4, 1).border.top.style).toBe('medium');
    expect(wsAll.getCell(3, 1).border.top.style).toBe('thin');
  });

  it('時刻の取れない時限のコマは日の先頭・時刻の取れない外部授業は日の末尾', () => {
    // 既定 fixture の periods ('1限'/'2限') は時刻表記なし → コマは sortMin=-1
    // で時限順のまま先頭、時刻なしセッションは Infinity で末尾。
    const project = makeProject({
      externalSessions: [
        { id: 1, date: '12/25(木)', teacherName: '堀上', label: '', memo: '予備校' },
      ],
    });
    const wb = buildTeacherWorkbook(project);
    const ws = wb.getWorksheet('堀上');
    expect(ws.rowCount).toBe(6); // タイトル + S3 まとめ + header + 1限 + 2限 + 外部
    expect(ws.getCell(4, 2).value).toBe('1限');
    expect(ws.getCell(5, 2).value).toBe('2限');
    // 時刻もラベルも無いセッションの時限欄は '-'。種別 (メモ) は学年(タブ) 列
    expect([ws.getCell(6, 2).value, ws.getCell(6, 5).value]).toEqual(['-', '予備校']);
  });
});

describe('buildTeacherWorkbook — オートフィルタ (学年(タブ) 列での絞り込み)', () => {
  it('個人シートのヘッダ行 (行 3) 全列にオートフィルタが付く', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.getWorksheet('堀上');
    // ヘッダは 6 列 (日付〜備考)。学年(タブ) 列で「中3 だけ」「中1+中2」の
    // ような任意の組み合わせに絞れる。行 1 = タイトル (P1)、行 2 = S3 まとめ
    // なのでヘッダは行 3。
    expect(ws.autoFilter).toEqual({
      from: { row: 3, column: 1 },
      to: { row: 3, column: 6 },
    });
  });

  it('全講師リストシートのヘッダ行全列にもオートフィルタが付く', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const wsAll = wb.getWorksheet('全講師リスト');
    // 講師名列を含む 7 列。講師名 × 学年(タブ) の組み合わせでも絞れる。
    expect(wsAll.autoFilter).toEqual({
      from: { row: 1, column: 1 },
      to: { row: 1, column: 7 },
    });
  });

  it('個人シートはタイトル + S3 まとめ + ヘッダ + データ行のみ (タブ別セクション等の付加行は無い)', () => {
    const wb = buildTeacherWorkbook(makeProject());
    expect(wb.getWorksheet('堀上').rowCount).toBe(5); // タイトル + S3 まとめ + header + 2 行
  });
});

describe('buildTeacherWorkbook — タイトル行と印刷デフォルト (P1)', () => {
  it('個人シートの 1 行目に「講師名 — プロジェクト名 / 期間 / 出力日」のタイトルが入る', () => {
    // 期間はその講師自身の初日〜最終日になるよう 12/26 にもコマを足す
    const project = makeProject();
    project.tabs[0].schedule[makeKey(2, 1, 1)] = { subject: '英語', teacher: '堀上' };
    const wb = buildTeacherWorkbook(project);
    const ws = wb.getWorksheet('堀上');
    expect(String(ws.getCell(1, 1).value)).toMatch(
      /^堀上 — test-proj \/ 期間 12\/25\(木\)〜12\/26\(金\) \/ 出力日 \d+\/\d+$/,
    );
    expect(ws.getCell(1, 1).font?.bold).toBe(true);
    // タイトルは全 6 列に結合される
    const mergeKeys = Array.isArray(ws.model.merges)
      ? ws.model.merges
      : Object.keys(ws._merges || {});
    expect(mergeKeys).toContain('A1:F1');
  });

  it('担当が 1 日だけの講師は期間を「期間 X〜X」ではなく単日で出す', () => {
    // makeProject の堀上は 12/25 の 1・2 限のみ (12/26 のコマは無い)
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.getWorksheet('堀上');
    expect(String(ws.getCell(1, 1).value)).toContain('期間 12/25(木) /');
    expect(String(ws.getCell(1, 1).value)).not.toContain('〜');
  });

  it('プロジェクト名が空なら「講習時間割」でフォールバック', () => {
    const wb = buildTeacherWorkbook(makeProject({ name: '' }));
    const ws = wb.getWorksheet('堀上');
    expect(String(ws.getCell(1, 1).value)).toMatch(/^堀上 — 講習時間割 \//);
  });

  it('個人シートに B4 縦 + タイトル/ヘッダ行繰り返しの印刷設定が付く', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const ws = wb.getWorksheet('堀上');
    expect(ws.pageSetup.paperSize).toBe(12); // ECMA-376 ST_PaperSize: 12 = B4
    expect(ws.pageSetup.orientation).toBe('portrait');
    // 2 ページ目以降にも講師名 (タイトル)・S3 まとめ・ヘッダが載る
    expect(ws.pageSetup.printTitlesRow).toBe('1:3');
  });

  it('全講師リストシートにも B4 縦 + ヘッダ行繰り返しの印刷設定が付く', () => {
    const wb = buildTeacherWorkbook(makeProject());
    const wsAll = wb.getWorksheet('全講師リスト');
    expect(wsAll.pageSetup.paperSize).toBe(12);
    expect(wsAll.pageSetup.orientation).toBe('portrait');
    expect(wsAll.pageSetup.printTitlesRow).toBe('1:1');
  });

  it('該当行ゼロの空 全講師リストシートにも B4 縦が付く (印刷デフォルトの一貫性)', () => {
    const project = makeProject({ tabs: [{ id: 1, name: 'メイン', config: makeProject().tabs[0].config, schedule: {} }] });
    const wb = buildTeacherWorkbook(project);
    const wsAll = wb.getWorksheet('全講師リスト');
    expect(wsAll.pageSetup.paperSize).toBe(12);
    expect(wsAll.pageSetup.orientation).toBe('portrait');
  });
});

describe('buildTeacherWorkbook — 全講師リストの講師別改ページ (P2)', () => {
  // 堀上 = 12/25 + 12/26 の 2 行 (同一講師内の日付切り替わりを含む)、
  // 松川 = 12/25 の 1 行。全講師リストは header(行1) + 堀上(行2-3) + 松川(行4)。
  function makeTwoTeacherProject() {
    return makeProject({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '松川', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      tabs: [{
        id: 1, name: 'メイン',
        config: makeProject().tabs[0].config,
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 12/25 1限
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 12/26 1限
          [makeKey(1, 2, 2)]: { subject: '数学', teacher: '松川' }, // 12/25 2限
        },
      }],
    });
  }

  it('講師が切り替わる直前の行 (前講師の最終行) に改ページが入る', () => {
    const wb = buildTeacherWorkbook(makeTwoTeacherProject());
    const wsAll = wb.getWorksheet('全講師リスト');
    // 堀上 → 松川 の切り替わり = 行 3 の後の 1 箇所だけ。
    // 同一講師内の日付切り替わり (行 2 → 3) では改ページしない。
    expect(wsAll.rowBreaks.map(b => b.id)).toEqual([3]);
    expect(wsAll.rowBreaks[0].man).toBe(1);
  });

  it('講師 1 人だけなら改ページは入らない', () => {
    const wb = buildTeacherWorkbook(makeProject());
    expect(wb.getWorksheet('全講師リスト').rowBreaks).toEqual([]);
  });

  it('印刷範囲は表の列 A〜G に固定される', () => {
    const wb = buildTeacherWorkbook(makeTwoTeacherProject());
    expect(wb.getWorksheet('全講師リスト').pageSetup.printArea).toBe('A:G');
  });

  it('改ページと印刷範囲が xlsx バイナリに残る (E3b と同じ writer 層の固定)', async () => {
    // rowBreaks は exceljs の読み戻し (set model) で復元されないため、
    // 書き出した zip 内の XML を直接検証する。
    const wb = buildTeacherWorkbook(makeTwoTeacherProject());
    const buffer = await wb.xlsx.writeBuffer();
    const zip = await JSZip.loadAsync(buffer);
    // 全講師リストは最後に addWorksheet される = 最後の sheetN.xml
    const sheetXml = await zip.file(`xl/worksheets/sheet${wb.worksheets.length}.xml`).async('string');
    expect(sheetXml).toContain('<rowBreaks count="1" manualBreakCount="1">');
    expect(sheetXml).toMatch(/<brk id="3"[^>]*man="1"/);
    // Print_Area は workbook.xml の definedNames に載る (' は &apos; に
    // エスケープされる)
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    expect(wbXml).toContain('_xlnm.Print_Area');
    expect(wbXml).toContain('&apos;全講師リスト&apos;!$A:$G');
  });
});
