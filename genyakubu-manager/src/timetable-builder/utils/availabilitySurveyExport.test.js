import { describe, expect, it } from 'vitest';
import { buildAvailabilitySurveyWorkbook, buildSurveyFormLayout, estimateSurveyScale } from './availabilitySurveyExport';

const P = (id, label) => ({ id, label });

// 夏期講習相当: プレップ (夜 90 分, 7/17〜7/21) / 中12 (夜 3 コマ, 7/24〜) / 中3 (昼 4 コマ, 7/29〜)
function summerProject() {
  const labels = ['7/17(金)', '7/18(土)', '7/21(火)', '7/24(金)', '7/28(火)', '7/29(水)', '7/30(木)'];
  const dates = labels.map((l, i) => P(i + 1, l));
  const id = (l) => dates.find(d => d.label === l).id;
  const tab = (tid, name, ds, ps) => ({
    id: tid, name, schedule: {},
    config: { classes: [P(1, 'A')], subjectCounts: {}, activeDateIds: ds.map(id), activePeriodIds: ps },
  });
  return {
    version: 4,
    name: '2026 夏期講習',
    updatedAt: '2026-07-01T00:00:00.000Z',
    teachers: [],
    dates,
    periods: [
      P(1, '昼1 (13:00~13:45)'), P(2, '昼2 (13:55~14:40)'),
      P(5, '夜1 (18:30~19:15)'), P(6, '夜2 (19:25~20:10)'), P(7, '夜3 (20:20~21:30)'),
      P(8, 'P1 (18:30~20:00)'), P(9, 'P2 (20:20~21:50)'),
    ],
    tabs: [
      tab(1, 'プレップ夏期', ['7/17(金)', '7/18(土)', '7/21(火)'], [8, 9]),
      tab(2, '中12', ['7/24(金)', '7/28(火)', '7/29(水)', '7/30(木)'], [5, 6, 7]),
      tab(3, '中3', ['7/29(水)', '7/30(木)'], [1, 2]),
    ],
  };
}

const today = new Date(2026, 6, 1, 12);

// 指定の行に出ているセルの値を左から並べる (空は除く)
function rowValues(ws, r) {
  const out = [];
  ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
    if (cell.value != null && cell.value !== '' && !cell.isMerged) out.push(String(cell.value));
    else if (cell.isMerged && cell.master === cell && cell.value) out.push(String(cell.value));
  });
  return out;
}

function findRow(ws, text) {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (rowValues(ws, r).some(v => v.includes(text))) return r;
  }
  return -1;
}

describe('buildAvailabilitySurveyWorkbook', () => {
  it('タイトル・氏名欄・記入のしかたを先頭に置く', () => {
    const ws = buildAvailabilitySurveyWorkbook(summerProject(), { today }).getWorksheet('出勤可能調査');
    expect(String(ws.getCell(1, 1).value)).toContain('2026 夏期講習');
    expect(String(ws.getCell(1, 1).value)).toContain('出勤可能調査');
    expect(rowValues(ws, 2)).toEqual(['出力日：2026/7/1', '氏名：']);
    // 記号の並びは画面と同じ ○ → △ → ×
    expect(String(ws.getCell(3, 1).value)).toMatch(/○.*△.*×/);
  });

  it('週ごとに「7月13日 | 月曜日」の見出しを並べ、授業の無い曜日は空欄', () => {
    const ws = buildAvailabilitySurveyWorkbook(summerProject(), { today }).getWorksheet('出勤可能調査');
    const head = findRow(ws, '7月13日');
    expect(rowValues(ws, head)).toEqual([
      '7月13日', '月曜日', '7月14日', '火曜日', '7月15日', '水曜日',
      '7月16日', '木曜日', '7月17日', '金曜日', '7月18日', '土曜日',
    ]);
    // 7/17 (金) は 9 列目 (月=1,2 / 火=3,4 / … / 金=9,10)
    expect(ws.getCell(head + 1, 9).value).toBe('18:30-20:00');
    expect(ws.getCell(head + 2, 9).value).toBe('20:20-21:50');
    expect(ws.getCell(head + 1, 1).value).toBeNull();
    // 記入欄は罫線つきの空セル
    expect(ws.getCell(head + 1, 10).value).toBeNull();
    expect(ws.getCell(head + 1, 10).border?.left?.style).toBe('thin');
    // タブの開始の注記
    expect(rowValues(ws, head + 3)).toEqual(['＊プレップ夏期開始']);
  });

  it('昼の部と夜の部の間を 1 行あけ、日によって時限の数が違っても上から詰める', () => {
    const ws = buildAvailabilitySurveyWorkbook(summerProject(), { today }).getWorksheet('出勤可能調査');
    const head = findRow(ws, '7月27日');
    // 7/29 (水) = 5 列目: 昼 2 コマ → 空行 → 夜 3 コマ
    expect(ws.getCell(head + 1, 5).value).toBe('13:00-13:45');
    expect(ws.getCell(head + 2, 5).value).toBe('13:55-14:40');
    expect(ws.getCell(head + 3, 5).value).toBeNull();
    expect(ws.getCell(head + 4, 5).value).toBe('18:30-19:15');
    // 7/28 (火) = 3 列目: 昼は無く、夜だけ
    expect(ws.getCell(head + 1, 3).value).toBeNull();
    expect(ws.getCell(head + 4, 3).value).toBe('18:30-19:15');
  });

  it('A4 縦・横 1 枚に収まる固定の倍率と、末尾の備考欄', () => {
    const ws = buildAvailabilitySurveyWorkbook(summerProject(), { today }).getWorksheet('出勤可能調査');
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.orientation).toBe('portrait');
    // fitToPage にすると手動の改ページが効かないので、固定の倍率で刷る
    expect(ws.pageSetup.fitToPage).toBe(false);
    expect(ws.pageSetup.scale).toBe(estimateSurveyScale([11.5, 6.5, 11.5, 6.5, 11.5, 6.5, 11.5, 6.5, 11.5, 6.5, 11.5, 6.5]));
    expect(ws.pageSetup.scale).toBeGreaterThan(70);
    expect(ws.pageSetup.scale).toBeLessThan(90);
    expect(findRow(ws, '備考')).toBeGreaterThan(findRow(ws, '7月27日'));
  });

  it('長い講習は週のブロックの前で改ページし、週を 2 ページに割らない', () => {
    // 7/6〜8/22 の 7 週・月〜土。昼 4 コマ + 夜 3 コマ
    const labels = [];
    for (let d = new Date(2026, 6, 6, 12); d <= new Date(2026, 7, 22, 12); d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue;
      labels.push(`${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]})`);
    }
    const project = {
      name: '2026 夏期講習',
      updatedAt: '2026-07-01T00:00:00.000Z',
      teachers: [],
      dates: labels.map((l, i) => P(i + 1, l)),
      periods: [
        P(1, '1 (13:00~13:45)'), P(2, '2 (13:55~14:40)'), P(3, '3 (14:50~15:35)'), P(4, '4 (15:45~16:50)'),
        P(5, '夜1 (18:30~19:15)'), P(6, '夜2 (19:25~20:10)'), P(7, '夜3 (20:20~21:30)'),
      ],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    const ws = buildAvailabilitySurveyWorkbook(project, { today }).getWorksheet('出勤可能調査');
    expect(ws.rowBreaks.length).toBeGreaterThan(0);
    for (const { id } of ws.rowBreaks) {
      // 改ページの次の行は空き行か週の見出し (日付の見出しの途中で割れていない)
      let r = id + 1;
      while (r <= ws.rowCount && rowValues(ws, r).length === 0) r++;
      expect(rowValues(ws, r)[0]).toMatch(/^\d+月\d+日$/);
    }
  });

  it('冬期講習 (年またぎ・日曜あり) も週の並びと日曜の列が出る', () => {
    const project = {
      name: '2026 冬期講習',
      updatedAt: '2026-12-01T00:00:00.000Z',
      teachers: [],
      dates: [P(1, '12/26(土)'), P(2, '12/27(日)'), P(3, '1/4(月)')],
      periods: [P(1, '1限 (13:00~13:45)')],
      tabs: [{ id: 1, name: '中3', schedule: {}, config: { classes: [], subjectCounts: {} } }],
    };
    const layout = buildSurveyFormLayout(project, { today });
    expect(layout.includeSunday).toBe(true);
    const ws = buildAvailabilitySurveyWorkbook(project, { today }).getWorksheet('出勤可能調査');
    const head = findRow(ws, '12月21日');
    expect(rowValues(ws, head).slice(-2)).toEqual(['12月27日', '日曜日']);
    expect(findRow(ws, '1月4日')).toBeGreaterThan(head);
  });

  it('授業のある日が無いプロジェクトは案内を書く', () => {
    const project = { ...summerProject(), tabs: [] };
    const ws = buildAvailabilitySurveyWorkbook(project, { today }).getWorksheet('出勤可能調査');
    expect(findRow(ws, '授業のある日・時限がまだ設定されていません')).toBeGreaterThan(0);
  });
});
