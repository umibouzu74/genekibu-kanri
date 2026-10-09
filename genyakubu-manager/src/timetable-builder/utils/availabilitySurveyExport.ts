// 出勤可能調査の調査票 (Excel)。講習期間中に「出られる時間」をバイト等に
// 書いてもらうために配る紙面を、このプロジェクトの日付・時限・タブから組む。
//
// 紙面 (従来は手作りしていた予定表の形を写す):
//   - 週ごとのブロックを縦に積む。1 週 = 月〜土 (日曜に授業があれば日曜まで)
//   - 各曜日は「時刻」と「記入欄」の 2 列。見出しは「7月13日 | 月曜日」
//   - 時間帯のまとまり (昼の部・夜の部など) ごとに行をそろえ、まとまりの間は
//     1 行あける。日によって時限の数が違っても上から詰める
//   - タブの開始・終講の日に「＊中3開始」「＊中3終講日」の注記
//   - 授業の無い曜日は空欄 (罫線なし)
//   - 末尾に備考欄 (「19 時以降なら可」等を書いてもらう)
//   - A4 縦。週のブロックがページの境目で割れないよう、固定の倍率で刷り、
//     入りきらない週の前で改ページする (Excel は「次のページ数に合わせて印刷」
//     を有効にすると手動の改ページを無視するため、fitToPage は使わない)
// 紙面の組み立て (週・曜日・まとまり) は availability.buildSurveyLayout を
// 入力画面と共有する (画面と紙で並びが食い違わないように)。
//
// 夏期・冬期・春期のどれでも、プロジェクトの日付から組むので季節の固定値は無い
// (年またぎの冬期講習も、本体の月間カレンダーと同じ決まりで 12/25 → 1/7 を
// 実日付に置く。courseDates.resolveDateLabelsYmd)。
import ExcelJS from 'exceljs';
import {
  buildSurveyLayout,
  computeSurveyDays,
  periodTimeText,
} from './availability';
import { projectBaseYmd } from './courseDates';
import type { SurveyLayout, SurveyLayoutDay } from './availability';
import { buildExcelFilename, downloadWorkbook } from './excelExport';
import type { Project } from '../types';

const GOTHIC = 'ＭＳ Ｐゴシック';
const WEEKDAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

const ARGB_BORDER = 'FF000000';
const ARGB_HEADER = 'FFF2F2F2';
const ARGB_NOTE = 'FF444444';
const ARGB_MUTED = 'FF666666';

const THIN: ExcelJS.Border = { style: 'thin', color: { argb: ARGB_BORDER } };
const BOX: Partial<ExcelJS.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN };

// 列幅 (文字数)。時刻 "13:00-13:45" が 9pt で収まる幅 + 記入欄
const WIDTH_TIME = 11.5;
const WIDTH_FILL = 6.5;
const ROW_HEIGHT = 15;
/** 高さを指定していない行 (Excel の既定の行の高さ) */
const DEFAULT_ROW_HEIGHT = 15;

// A4 縦 (インチ) と余白。倍率と改ページの見積りに使う
const A4_PORTRAIT_IN = { width: 210 / 25.4, height: 297 / 25.4 };
const MARGINS_IN = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

export interface SurveyWorkbookOptions {
  /** 年の推定の基準日 (YYYY-MM-DD)。省略時は project の更新日、無ければ今日 */
  baseYmd?: string;
  /** 「出力日」表記に使う今日 (テスト用) */
  today?: Date;
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 調査票の紙面モデル (テスト用に export)。
export function buildSurveyFormLayout(project: Project, opts: SurveyWorkbookOptions = {}): SurveyLayout {
  const today = opts.today || new Date();
  const baseYmd = opts.baseYmd || projectBaseYmd(project, ymdOf(today)) || ymdOf(today);
  return buildSurveyLayout(computeSurveyDays(project), { baseYmd });
}

// 横 1 枚に収まる固定の倍率 (%)。列幅 (文字数) は Excel の既定フォントで
// 1 文字 7px + 余白 5px として見積もる (通常時間割作成の estimatePrintScale と
// 同じ見積り)。見積りと実際の描画のずれを吸収する余裕を 5% とる
export function estimateSurveyScale(colWidths: number[]): number {
  const availWidth = A4_PORTRAIT_IN.width - MARGINS_IN.left - MARGINS_IN.right;
  const neededWidth = colWidths.reduce((n, w) => n + w * 7 + 5, 0) / 96;
  if (neededWidth <= 0) return 100;
  const scale = Math.floor(Math.min(1, availWidth / neededWidth) * 0.95 * 100);
  return Math.max(10, Math.min(100, scale));
}

// 行のまとまり (週のブロック等) がページの境目で割れないよう、入りきらない
// まとまりの前 (= 直前のまとまりの最後の行) で改ページする。まとまりの間の
// 空き行は次のページの先頭に回す。1 ページに収まらない大きさのまとまりは
// そのまま (Excel が途中で改ページする)。改ページした行番号を返す (テスト用)。
function addBlockPageBreaks(ws: ExcelJS.Worksheet, blocks: Array<{ start: number; end: number }>, scale: number): number[] {
  const pageHeightPt = (A4_PORTRAIT_IN.height - MARGINS_IN.top - MARGINS_IN.bottom) * 72 / (scale / 100);
  const heightOf = (r: number) => ws.getRow(r).height ?? DEFAULT_ROW_HEIGHT;
  const sum = (from: number, to: number) => {
    let n = 0;
    for (let r = from; r <= to; r++) n += heightOf(r);
    return n;
  };
  const breaks: number[] = [];
  let used = 0;
  let lastEnd = 0;
  blocks.forEach(({ start, end }) => {
    const gap = sum(lastEnd + 1, start - 1);
    const height = sum(start, end);
    if (lastEnd > 0 && used + gap + height > pageHeightPt) {
      ws.getRow(lastEnd).addPageBreak();
      breaks.push(lastEnd);
      used = 0;
    }
    used += gap + height;
    lastEnd = end;
  });
  return breaks;
}

function styleCell(
  cell: ExcelJS.Cell,
  { size = 9, bold = false, color, fill, border, align = 'center', wrap = false }: {
    size?: number; bold?: boolean; color?: string; fill?: string;
    border?: Partial<ExcelJS.Borders>; align?: 'left' | 'center' | 'right'; wrap?: boolean;
  } = {},
) {
  cell.font = { name: GOTHIC, size, bold, ...(color ? { color: { argb: color } } : {}) };
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap, shrinkToFit: !wrap };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (border) cell.border = border;
}

// 結合セル範囲の外周に罫線を引く (結合セルの罫線は左上のセルだけに付けても
// 範囲全体には出ないため、外周の各セルに付ける)。
function outlineRange(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, sides: Array<keyof ExcelJS.Borders> = ['top', 'bottom', 'left', 'right']) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const b: Partial<ExcelJS.Borders> = { ...(ws.getCell(r, c).border || {}) };
      if (sides.includes('top') && r === r1) b.top = THIN;
      if (sides.includes('bottom') && r === r2) b.bottom = THIN;
      if (sides.includes('left') && c === c1) b.left = THIN;
      if (sides.includes('right') && c === c2) b.right = THIN;
      ws.getCell(r, c).border = b;
    }
  }
}

// 1 週分のブロックを書き、次に使う行番号を返す。
function writeWeek(ws: ExcelJS.Worksheet, row: number, days: SurveyLayoutDay[], bandRows: number[]): number {
  // 見出し: 「7月13日 | 月曜日」
  days.forEach((day, i) => {
    const col = 1 + i * 2;
    const dateCell = ws.getCell(row, col);
    dateCell.value = `${day.month}月${day.day}日`;
    styleCell(dateCell, { size: 9, bold: true, fill: ARGB_HEADER, border: BOX });
    const wdCell = ws.getCell(row, col + 1);
    wdCell.value = WEEKDAY_NAMES[day.weekday];
    styleCell(wdCell, { size: 8, bold: true, fill: ARGB_HEADER, border: BOX });
  });
  ws.getRow(row).height = ROW_HEIGHT;
  row++;

  // 時間帯のまとまりごとに行をそろえる。まとまりの間は 1 行あける
  let firstBand = true;
  bandRows.forEach((rows, b) => {
    if (rows === 0) return;
    if (!firstBand) {
      ws.getRow(row).height = 6;
      row++;
    }
    firstBand = false;
    for (let r = 0; r < rows; r++) {
      days.forEach((day, i) => {
        const p = day.bandPeriods[b]?.[r];
        if (!p) return;
        const col = 1 + i * 2;
        const timeCell = ws.getCell(row, col);
        timeCell.value = periodTimeText(p);
        styleCell(timeCell, { size: 9, border: BOX });
        styleCell(ws.getCell(row, col + 1), { size: 11, bold: true, border: BOX });
      });
      ws.getRow(row).height = ROW_HEIGHT;
      row++;
    }
  });

  // タブの開始・終講の注記 (その週に 1 つでもあるときだけ 1 行)
  if (days.some(d => d.notes.length > 0)) {
    days.forEach((day, i) => {
      if (day.notes.length === 0) return;
      const col = 1 + i * 2;
      ws.mergeCells(row, col, row, col + 1);
      const cell = ws.getCell(row, col);
      cell.value = day.notes.map(n => `＊${n}`).join('\n');
      styleCell(cell, { size: 8, color: ARGB_NOTE, align: 'left', wrap: true });
    });
    const maxNotes = Math.max(...days.map(d => d.notes.length));
    ws.getRow(row).height = Math.max(ROW_HEIGHT, 11 * maxNotes + 3);
    row++;
  }
  return row;
}

// project → 調査票の workbook (副作用なし、テスト用に分離)。
export function buildAvailabilitySurveyWorkbook(project: Project, opts: SurveyWorkbookOptions = {}): ExcelJS.Workbook {
  const layout = buildSurveyFormLayout(project, opts);
  const today = opts.today || new Date();
  const dayCount = layout.includeSunday ? 7 : 6;
  const colCount = dayCount * 2;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('出勤可能調査', {
    views: [{ showGridLines: false }],
  });
  for (let i = 0; i < dayCount; i++) {
    ws.getColumn(1 + i * 2).width = WIDTH_TIME;
    ws.getColumn(2 + i * 2).width = WIDTH_FILL;
  }

  // タイトル
  let row = 1;
  ws.mergeCells(row, 1, row, colCount);
  const title = ws.getCell(row, 1);
  title.value = `${project.name || '講習'}  出勤可能調査`;
  styleCell(title, { size: 14, bold: true, align: 'left' });
  ws.getRow(row).height = 22;
  row++;

  // 氏名欄 (右寄せの下線) と出力日
  const half = Math.floor(colCount / 2);
  ws.mergeCells(row, 1, row, half);
  const made = ws.getCell(row, 1);
  made.value = `出力日：${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
  styleCell(made, { size: 8, color: ARGB_MUTED, align: 'left' });
  ws.mergeCells(row, half + 1, row, colCount);
  const name = ws.getCell(row, half + 1);
  name.value = '氏名：';
  styleCell(name, { size: 11, bold: true, align: 'left' });
  outlineRange(ws, row, half + 1, row, colCount, ['bottom']);
  ws.getRow(row).height = 22;
  row++;

  // 記入のしかた
  ws.mergeCells(row, 1, row, colCount);
  const howto = ws.getCell(row, 1);
  howto.value = '時刻の右の欄に、出られる時間は ○、相談したい時間は △、出られない時間は × を記入してください。';
  styleCell(howto, { size: 9, align: 'left', wrap: true });
  ws.getRow(row).height = 16;
  // ページの境目で割らない行のまとまり (見出し・週・その他の日・備考欄)
  const blocks: Array<{ start: number; end: number }> = [{ start: 1, end: row }];
  row += 2;

  if (layout.weeks.length === 0 && layout.unplaced.length === 0) {
    ws.mergeCells(row, 1, row, colCount);
    const empty = ws.getCell(row, 1);
    empty.value = '授業のある日・時限がまだ設定されていません (⚙ 設定 → 基本設定で日付と時限を登録してください)';
    styleCell(empty, { size: 9, color: ARGB_MUTED, align: 'left' });
    row += 2;
  }

  layout.weeks.forEach(week => {
    const start = row;
    row = writeWeek(ws, row, week.days, week.bandRows);
    blocks.push({ start, end: row - 1 });
    row++; // 週の間を 1 行あける
  });

  // 週の枠に置けなかった日 (日付として読めないラベル・ほかのラベルと同じ日付に
  // 当たるラベル)。日ごとに縦に並べる
  if (layout.unplaced.length > 0) {
    ws.mergeCells(row, 1, row, colCount);
    const head = ws.getCell(row, 1);
    head.value = 'その他の日';
    styleCell(head, { size: 9, bold: true, align: 'left' });
    let start = row; // 見出しは最初の日と同じページに
    row++;
    layout.unplaced.forEach(sd => {
      ws.getCell(row, 1).value = sd.date.label;
      styleCell(ws.getCell(row, 1), { size: 9, bold: true, fill: ARGB_HEADER, border: BOX });
      row++;
      sd.periods.forEach(p => {
        ws.getCell(row, 1).value = periodTimeText(p);
        styleCell(ws.getCell(row, 1), { size: 9, border: BOX });
        styleCell(ws.getCell(row, 2), { size: 11, bold: true, border: BOX });
        row++;
      });
      blocks.push({ start, end: row - 1 });
      start = row;
    });
    row++;
  }

  // 備考欄
  ws.mergeCells(row, 1, row, colCount);
  const memoHead = ws.getCell(row, 1);
  memoHead.value = '備考（時間の希望・ご都合など）';
  styleCell(memoHead, { size: 9, bold: true, align: 'left' });
  const memoStart = row;
  row++;
  ws.mergeCells(row, 1, row + 2, colCount);
  styleCell(ws.getCell(row, 1), { size: 10, align: 'left', wrap: true });
  outlineRange(ws, row, 1, row + 2, colCount);
  for (let r = row; r <= row + 2; r++) ws.getRow(r).height = ROW_HEIGHT;
  blocks.push({ start: memoStart, end: row + 2 });

  const colWidths: number[] = [];
  for (let i = 0; i < dayCount; i++) colWidths.push(WIDTH_TIME, WIDTH_FILL);
  const scale = estimateSurveyScale(colWidths);
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    // 固定の倍率 + 週の前の改ページ (fitToPage にすると手動の改ページが効かない)
    fitToPage: false,
    scale,
    horizontalCentered: true,
    margins: { ...MARGINS_IN },
  };
  addBlockPageBreaks(ws, blocks, scale);
  return workbook;
}

export async function downloadAvailabilitySurveyExcel(project: Project) {
  const workbook = buildAvailabilitySurveyWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '出勤可能調査'));
}
