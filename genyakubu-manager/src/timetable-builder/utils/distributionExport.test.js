import { describe, expect, it } from 'vitest';
import {
  buildDistributionWorkbook,
  formatDateCell,
  groupTabsForDistribution,
  splitDatesIntoColumns,
  splitPeriodLabel,
} from './distributionExport';
import { makeKey } from './scheduleKey';

// ─── 共通 fixture (v4 project) ─────────────────────────────────────
// 元紙面 (2025 年版 xls) の縮小版:
//   - 中1 / 中2 = 夜帯 (時限 id 3,4) → 1 シートに横並び
//   - 中3 = 昼帯 (時限 id 1,2) → 別シート
function makeProject(overrides = {}) {
  return {
    version: 4,
    name: '夏期講習',
    createdAt: '',
    updatedAt: '',
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '半田', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    activeTabId: 1,
    dates: [
      { id: 1, label: '7/29(火)' },
      { id: 2, label: '7/30(水)' },
      { id: 3, label: '7/31(木)' },
    ],
    periods: [
      { id: 1, label: '1校時 (13:00~13:45)' },
      { id: 2, label: '2校時 (13:55~14:40)' },
      { id: 3, label: '夜1 (18:30~19:15)' },
      { id: 4, label: '夜2 (19:25~20:10)' },
    ],
    tabs: [
      {
        id: 1,
        name: '中1',
        config: {
          classes: [{ id: 1, label: '附中' }, { id: 2, label: 'S' }],
          subjectCounts: { '英語': 2 },
          activePeriodIds: [3, 4],
        },
        schedule: {
          [makeKey(1, 3, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 4, 1)]: { subject: '数学', teacher: '半田' },
          [makeKey(2, 3, 1)]: { subject: '英語', teacher: '堀上' },
        },
      },
      {
        id: 2,
        name: '中2',
        config: {
          classes: [{ id: 1, label: '附中' }, { id: 2, label: 'S' }, { id: 3, label: 'A' }],
          subjectCounts: { '英語': 2 },
          activePeriodIds: [3, 4],
        },
        schedule: {
          [makeKey(1, 3, 1)]: { subject: '数学', teacher: '半田' },
        },
      },
      {
        id: 3,
        name: '中3',
        config: {
          // 隣接する同名クラス (S ×2 = 教室違い) は見出しが結合される
          classes: [{ id: 1, label: 'SS' }, { id: 2, label: 'S' }, { id: 3, label: 'S' }],
          subjectCounts: { '数学': 2 },
          activePeriodIds: [1, 2],
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '数学', teacher: '半田' },
          [makeKey(2, 1, 1)]: { subject: '数学', teacher: '半田' },
        },
      },
    ],
    subjects: ['英語', '数学', '国語'],
    subjectColors: {},
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
    ...overrides,
  };
}

// 中1+中2 シート (5 クラス) の列位置。A=余白、B=日付、C=時限ラベル、
// D..H=クラス 5 列、I=段間、J=右段日付、K=右段ラベル、L..P=右段クラス。
const L = { date: 2, label: 3, cls: 4 };
const R = { date: 10, label: 11, cls: 12 };
// 中3 シート (3 クラス) は右段が詰まる: G=段間、H=日付、I=ラベル、J..L=クラス
const R3 = { date: 8, label: 9, cls: 10 };
// ヘッダ行: 4=学年 5=クラス 6=教室、ブロックは 7 行目から (複数タブ時)
const MULTI = { grade: 4, cls: 5, room: 6, blocks: 7 };
// 単一タブ時: 4=クラス 5=教室、ブロックは 6 行目から
const SINGLE = { cls: 4, room: 5, blocks: 6 };

describe('splitPeriodLabel', () => {
  it('「名称 (時刻)」を名称と時刻に分解し、時刻表記を統一する', () => {
    expect(splitPeriodLabel({ id: 1, label: '1校時 (13:00~13:45)' }))
      .toEqual({ name: '1校時', time: '13:00～13:45' });
    // 全角チルダ・全角括弧・全角コロンも許容 (timeRange と同じ)
    expect(splitPeriodLabel({ id: 1, label: '確認テスト（16:35～16:50）' }))
      .toEqual({ name: '確認テスト', time: '16:35～16:50' });
  });

  it('終了時刻が無ければ「開始～」、時刻が無ければ time は空', () => {
    expect(splitPeriodLabel({ id: 1, label: '午前 (9:15~)' }))
      .toEqual({ name: '午前', time: '9:15～' });
    expect(splitPeriodLabel({ id: 1, label: '1限' })).toEqual({ name: '1限', time: '' });
  });

  it('時刻だけのラベルは名称にそのまま残す (空見出しにしない)', () => {
    expect(splitPeriodLabel({ id: 1, label: '13:00~13:45' }).name).toBe('13:00~13:45');
  });
});

describe('formatDateCell', () => {
  it('曜日括弧を改行で 2 行組にする (半角・全角とも)', () => {
    expect(formatDateCell('7/29(火)')).toBe('7/29\n(火)');
    expect(formatDateCell('12/25（木）')).toBe('12/25\n（木）');
  });

  it('曜日括弧が無いラベルはそのまま', () => {
    expect(formatDateCell('予備日')).toBe('予備日');
    expect(formatDateCell('')).toBe('');
  });
});

describe('splitDatesIntoColumns', () => {
  it('左段が多くなるように半分に割る (新聞式 2 段組)', () => {
    expect(splitDatesIntoColumns([1, 2, 3])).toEqual({ left: [1, 2], right: [3] });
    expect(splitDatesIntoColumns([1, 2, 3, 4])).toEqual({ left: [1, 2], right: [3, 4] });
    expect(splitDatesIntoColumns([1])).toEqual({ left: [1], right: [] });
    expect(splitDatesIntoColumns([])).toEqual({ left: [], right: [] });
  });
});

describe('groupTabsForDistribution', () => {
  it('同じ時限セットのタブを 1 グループに束ねる (元紙面の T1T2 / T3 の分かれ方)', () => {
    const groups = groupTabsForDistribution(makeProject());
    expect(groups.map(g => g.tabs.map(t => t.name))).toEqual([['中1', '中2'], ['中3']]);
    expect(groups[0].periods.map(p => p.id)).toEqual([3, 4]);
    expect(groups[1].periods.map(p => p.id)).toEqual([1, 2]);
  });

  it('グループの日付はタブの使用日の和集合 (カレンダー順)', () => {
    const project = makeProject();
    project.tabs[0].config.activeDateIds = [1];
    project.tabs[1].config.activeDateIds = [3, 2]; // 順不同でもプール順に整列
    const groups = groupTabsForDistribution(project);
    expect(groups[0].dates.map(d => d.id)).toEqual([1, 2, 3]);
  });

  it('クラス 0 のタブは紙面に列が無いので除外する', () => {
    const project = makeProject();
    project.tabs[1].config.classes = [];
    const groups = groupTabsForDistribution(project);
    expect(groups.map(g => g.tabs.map(t => t.name))).toEqual([['中1'], ['中3']]);
  });
});

describe('buildDistributionWorkbook — シート構成', () => {
  it('グループごとに「タブ名…時間割」シートを作る', () => {
    const wb = buildDistributionWorkbook(makeProject());
    expect(wb.worksheets.map(w => w.name)).toEqual(['中1中2時間割', '中3時間割']);
  });

  it('シート名は禁則文字除去 + 重複 suffix (throw しない)', () => {
    const project = makeProject();
    // 時限セットの違う 2 タブだけ残し、sanitize 後の名前を衝突させる
    project.tabs = [project.tabs[0], project.tabs[2]];
    project.tabs[0].name = '中3/前半'; // 夜帯グループ → sanitize で '中3前半時間割'
    project.tabs[1].name = '中3前半'; // 昼帯グループ → 衝突して suffix
    const wb = buildDistributionWorkbook(project);
    expect(wb.worksheets[0].name).toBe('中3前半時間割');
    expect(wb.worksheets[1].name).toBe('中3前半時間割_1');
  });

  it('タブが無くても空シート 1 枚の workbook を返す (開けないファイルを作らない)', () => {
    const wb = buildDistributionWorkbook(makeProject({ tabs: [] }));
    expect(wb.worksheets.map(w => w.name)).toEqual(['時間割']);
  });

  it('タイトル行 (B2) にプロジェクト名・タブ名・期間が載る', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const title = wb.worksheets[0].getCell(2, 2).value;
    expect(title).toContain('夏期講習 — 中1・中2');
    expect(title).toContain('期間 7/29(火)〜7/31(木)');
  });
});

describe('buildDistributionWorkbook — ヘッダ行', () => {
  it('複数タブのシートは 学年/クラス/教室 の 3 行 (学年はタブ名をクラス範囲に結合)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.grade, L.label).value).toBe('学　年');
    // 中1 = D..E (2 クラス)、中2 = F..H (3 クラス)
    expect(ws.getCell(MULTI.grade, L.cls).value).toBe('中1');
    expect(ws.getCell(MULTI.grade, L.cls + 1).master.address).toBe(ws.getCell(MULTI.grade, L.cls).address);
    expect(ws.getCell(MULTI.grade, L.cls + 2).value).toBe('中2');
    // クラス行
    expect(ws.getCell(MULTI.cls, L.label).value).toBe('クラス');
    expect(['附中', 'S', '附中', 'S', 'A']).toEqual(
      [0, 1, 2, 3, 4].map(off => ws.getCell(MULTI.cls, L.cls + off).master.value),
    );
    // 教室行はモデルに情報が無いので空欄 (手書き用の枠だけ)
    expect(ws.getCell(MULTI.room, L.label).value).toBe('教　室');
    expect(ws.getCell(MULTI.room, L.cls).value).toBeNull();
  });

  it('単一タブのシートは 学年 行なし (クラス行がヘッダ先頭)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中3時間割');
    expect(ws.getCell(SINGLE.cls, L.label).value).toBe('クラス');
    expect(ws.getCell(SINGLE.room, L.label).value).toBe('教　室');
  });

  it('隣接する同名クラス (教室違い) はクラス見出しを結合する', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中3時間割');
    // SS / S / S → S の 2 列が 1 つの見出しに
    expect(ws.getCell(SINGLE.cls, L.cls).value).toBe('SS');
    expect(ws.getCell(SINGLE.cls, L.cls + 1).value).toBe('S');
    expect(ws.getCell(SINGLE.cls, L.cls + 2).master.address)
      .toBe(ws.getCell(SINGLE.cls, L.cls + 1).address);
  });

  it('右段にも同じヘッダを描く', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.grade, R.label).value).toBe('学　年');
    expect(ws.getCell(MULTI.cls, R.cls + 4).master.value).toBe('A');
  });
});

describe('buildDistributionWorkbook — 日ブロック', () => {
  it('日付は左段 → 右段の順に流し込む (3 日 = 左 2 + 右 1)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    // 左段: 7/29 (行 7-10)、空行、7/30 (行 12-15)
    expect(ws.getCell(MULTI.blocks, L.date).value).toBe('7/29\n(火)');
    expect(ws.getCell(MULTI.blocks + 5, L.date).value).toBe('7/30\n(水)');
    // 右段: 7/31 が左段先頭と同じ行から
    expect(ws.getCell(MULTI.blocks, R.date).value).toBe('7/31\n(木)');
  });

  it('日付セルはブロック全高 (時限数 × 2 行) に結合される', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    const master = ws.getCell(MULTI.blocks, L.date);
    expect(ws.getCell(MULTI.blocks + 3, L.date).master.address).toBe(master.address);
    expect(ws.getCell(MULTI.blocks + 4, L.date).master.address).not.toBe(master.address);
  });

  it('時限は「名称+科目」「時刻+講師」の 2 行ペアで並ぶ', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    // 時限ラベル列
    expect(ws.getCell(MULTI.blocks, L.label).value).toBe('夜1');
    expect(ws.getCell(MULTI.blocks + 1, L.label).value).toBe('18:30～19:15');
    expect(ws.getCell(MULTI.blocks + 2, L.label).value).toBe('夜2');
    // 中1 附中: 夜1 = 英語① 堀上、夜2 = 数学① 半田
    expect(ws.getCell(MULTI.blocks, L.cls).value).toBe('英語①');
    expect(ws.getCell(MULTI.blocks + 1, L.cls).value).toBe('堀上');
    expect(ws.getCell(MULTI.blocks + 2, L.cls).value).toBe('数学①');
    expect(ws.getCell(MULTI.blocks + 3, L.cls).value).toBe('半田');
    // 中2 附中 (同じ行の 2 タブ目領域) にも入る
    expect(ws.getCell(MULTI.blocks, L.cls + 2).value).toBe('数学①');
    // 回数連番は日をまたいで数える (7/30 の英語は ②)
    expect(ws.getCell(MULTI.blocks + 5, L.cls).value).toBe('英語②');
  });

  it("講師 '未定' と未入力は空欄にする (配布物に '未定' を載せない)", () => {
    const project = makeProject();
    project.tabs[0].schedule[makeKey(1, 3, 2)] = { subject: '国語', teacher: '未定' };
    project.tabs[0].schedule[makeKey(1, 4, 2)] = { subject: '理科' };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.blocks, L.cls + 1).value).toBe('国語①');
    expect(ws.getCell(MULTI.blocks + 1, L.cls + 1).value).toBe('');
    expect(ws.getCell(MULTI.blocks + 3, L.cls + 1).value).toBe('');
  });

  it('合同グループの非 primary クラスは講師欄を (合同) にする', () => {
    const project = makeProject();
    project.combinedGroups = [
      { id: 1, subject: '英語', classes: ['附中', 'S'], dates: null },
    ];
    project.tabs[0].schedule[makeKey(1, 3, 2)] = { subject: '英語', teacher: '堀上' };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    // primary (附中) は講師名、非 primary (S) は (合同)
    expect(ws.getCell(MULTI.blocks + 1, L.cls).value).toBe('堀上');
    expect(ws.getCell(MULTI.blocks + 1, L.cls + 1).value).toBe('(合同)');
  });

  it('タブが使わない日はそのタブの列だけ空欄になる', () => {
    const project = makeProject();
    project.tabs[0].config.activeDateIds = [1, 2, 3];
    project.tabs[1].config.activeDateIds = [2, 3]; // 中2 は 7/29 に授業なし
    // 中2 のスケジュールに 7/29 の残骸があっても紙面に出さない
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.blocks, L.cls).value).toBe('英語①'); // 中1 は出る
    expect(ws.getCell(MULTI.blocks, L.cls + 2).value).toBe(''); // 中2 は空欄
  });

  it('全クラス同一科目 + 講師なしの時限 (確認テスト) は 2 行 × 全クラス列を 1 セルに結合', () => {
    const project = makeProject();
    // 中3 の 2 校時目を全クラス国語 (講師なし) にする
    project.tabs[2].schedule = {
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '半田' },
      [makeKey(1, 2, 1)]: { subject: '国語' },
      [makeKey(1, 2, 2)]: { subject: '国語' },
      [makeKey(1, 2, 3)]: { subject: '国語' },
    };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中3時間割');
    const subjRow = SINGLE.blocks + 2; // 2 時限目の科目行
    const master = ws.getCell(subjRow, L.cls);
    expect(master.value).toBe('国語①');
    // 2 行 × 3 クラス列が全て同じ結合に属する
    expect(ws.getCell(subjRow + 1, L.cls + 2).master.address).toBe(master.address);
  });

  it('タブごとにテスト科目が違う日は学年単位で結合する', () => {
    const project = makeProject();
    // 夜2 を確認テスト枠に見立て、中1=国語 / 中2=理科 (いずれも講師なし)
    project.tabs[0].schedule = {
      [makeKey(1, 4, 1)]: { subject: '国語' },
      [makeKey(1, 4, 2)]: { subject: '国語' },
    };
    project.tabs[1].schedule = {
      [makeKey(1, 4, 1)]: { subject: '理科' },
      [makeKey(1, 4, 2)]: { subject: '理科' },
      [makeKey(1, 4, 3)]: { subject: '理科' },
    };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    const subjRow = MULTI.blocks + 2; // 夜2 の科目行
    // 中1 (D..E) = 国語①、中2 (F..H) = 理科① の 2 つの結合
    const m1 = ws.getCell(subjRow, L.cls);
    expect(m1.value).toBe('国語①');
    expect(ws.getCell(subjRow + 1, L.cls + 1).master.address).toBe(m1.address);
    const m2 = ws.getCell(subjRow, L.cls + 2);
    expect(m2.value).toBe('理科①');
    expect(ws.getCell(subjRow + 1, L.cls + 4).master.address).toBe(m2.address);
    expect(ws.getCell(subjRow, L.cls + 1).master.address).not.toBe(m2.address);
  });

  it('隣接タブで文言が同じなら学年をまたいで 1 つに結合する', () => {
    const project = makeProject();
    project.tabs[0].schedule = {
      [makeKey(1, 4, 1)]: { subject: '国語' },
      [makeKey(1, 4, 2)]: { subject: '国語' },
    };
    project.tabs[1].schedule = {
      [makeKey(1, 4, 1)]: { subject: '国語' },
      [makeKey(1, 4, 2)]: { subject: '国語' },
      [makeKey(1, 4, 3)]: { subject: '国語' },
    };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    const subjRow = MULTI.blocks + 2;
    const master = ws.getCell(subjRow, L.cls);
    expect(master.value).toBe('国語①');
    // 中2 の最終クラス列まで同じ結合
    expect(ws.getCell(subjRow + 1, L.cls + 4).master.address).toBe(master.address);
  });

  it('結合判定は連番抜きで行い、連番がクラス間でズレるときは素の科目名を出す', () => {
    const project = makeProject();
    // SS だけ 1 校時にも国語があり、2 校時の国語は SS=②、他クラス=①
    project.tabs[2].schedule = {
      [makeKey(1, 1, 1)]: { subject: '国語' },
      [makeKey(1, 2, 1)]: { subject: '国語' },
      [makeKey(1, 2, 2)]: { subject: '国語' },
      [makeKey(1, 2, 3)]: { subject: '国語' },
    };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中3時間割');
    const master = ws.getCell(SINGLE.blocks + 2, L.cls);
    expect(master.value).toBe('国語');
    expect(ws.getCell(SINGLE.blocks + 3, L.cls + 2).master.address).toBe(master.address);
  });

  it('授業ゼロの日 (イベント日) は時限欄ごと 1 つの空セルに結合する', () => {
    const project = makeProject();
    // 中3 の 7/30 を空日にする (7/31 は中3 に授業なしなので使用日から外す)
    project.tabs[2].config.activeDateIds = [1, 2];
    project.tabs[2].schedule = { [makeKey(1, 1, 1)]: { subject: '数学', teacher: '半田' } };
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中3時間割');
    // 左段 = 7/29 (通常)、右段 = 7/30 (空日): ラベル列〜最終クラス列が結合
    const master = ws.getCell(SINGLE.blocks, R3.label);
    expect(master.value).toBeNull();
    expect(ws.getCell(SINGLE.blocks + 3, R3.label + 3).master.address).toBe(master.address);
    // 日付セルは通常どおり出る
    expect(ws.getCell(SINGLE.blocks, R3.date).value).toBe('7/30\n(水)');
  });
});

describe('buildDistributionWorkbook — 書式・ページ設定', () => {
  it('A4 縦・1×1 ページの fit-to-page を埋め込む (元紙面の印刷設定)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    wb.worksheets.forEach(ws => {
      expect(ws.pageSetup.paperSize).toBe(9);
      expect(ws.pageSetup.orientation).toBe('portrait');
      expect(ws.pageSetup.fitToPage).toBe(true);
      expect(ws.pageSetup.fitToWidth).toBe(1);
      expect(ws.pageSetup.fitToHeight).toBe(1);
    });
  });

  it('アクセント色はシート順に循環する (1 枚目 薄緑、2 枚目 水色)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const fillOf = (ws, row, col) => ws.getCell(row, col).fill?.fgColor?.argb;
    expect(fillOf(wb.worksheets[0], MULTI.cls, L.label)).toBe('FFCCFFCC');
    expect(fillOf(wb.worksheets[0], MULTI.blocks, L.date)).toBe('FFCCFFCC');
    expect(fillOf(wb.worksheets[1], SINGLE.cls, L.label)).toBe('FFCCFFFF');
  });

  it('科目セルに色分けはしない (モノクロ印刷前提の紙面)', () => {
    const project = makeProject({ subjectColors: { '英語': '#DBEAFE' } });
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.blocks, L.cls).fill?.fgColor?.argb).toBeUndefined();
  });

  it('講師は明朝体・科目はゴシック体 (元紙面の使い分け)', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    expect(ws.getCell(MULTI.blocks, L.cls).font.name).toBe('ＭＳ Ｐゴシック');
    expect(ws.getCell(MULTI.blocks + 1, L.cls).font.name).toBe('ＭＳ Ｐ明朝');
  });

  it('時限ペアの間は hair、ブロック外周は thin の罫線', () => {
    const wb = buildDistributionWorkbook(makeProject());
    const ws = wb.getWorksheet('中1中2時間割');
    // ブロック先頭行の上辺 = thin
    expect(ws.getCell(MULTI.blocks, L.cls).border.top.style).toBe('thin');
    // 夜1 の講師行と夜2 の科目行の間 = hair
    expect(ws.getCell(MULTI.blocks + 2, L.cls).border.top.style).toBe('hair');
    // ブロック最終行の下辺 = thin
    expect(ws.getCell(MULTI.blocks + 3, L.cls).border.bottom.style).toBe('thin');
  });

  it('テスト系時限の上の区切りは thin (確認テスト前の区切り)', () => {
    const project = makeProject();
    project.periods.push({ id: 5, label: '確認テスト (21:15~21:30)' });
    project.tabs[0].config.activePeriodIds = [3, 4, 5];
    project.tabs[1].config.activePeriodIds = [3, 4, 5];
    const wb = buildDistributionWorkbook(project);
    const ws = wb.getWorksheet('中1中2時間割');
    // 3 時限目 (確認テスト) の科目行 = ブロック先頭 + 4
    expect(ws.getCell(MULTI.blocks + 4, L.cls).border.top.style).toBe('thin');
  });
});
