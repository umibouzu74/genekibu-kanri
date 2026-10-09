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
// 紙面の組み立て (週・曜日・まとまり) は availability.buildSurveyLayout を
// 入力画面と共有する (画面と紙で並びが食い違わないように)。
//
// 夏期・冬期・春期のどれでも、プロジェクトの日付から組むので季節の固定値は無い
// (年またぎの冬期講習は resolveCourseYmds が 12/25 → 1/7 を順に並べる)。
import ExcelJS from 'exceljs';
import {
  buildSurveyLayout,
  computeSurveyDays,
  computeTabMilestones,
  periodTimeText,
  surveyBaseYmd,
} from './availability';
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

export interface SurveyWorkbookOptions {
  /** 年の推定の基準日 (YYYY-MM-DD)。省略時は project の更新日、無ければ今日 */
  baseYmd?: string;
  /** 「作成日」表記に使う今日 (テスト用) */
  today?: Date;
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 調査票の紙面モデル (テスト用に export)。
export function buildSurveyFormLayout(project: Project, opts: SurveyWorkbookOptions = {}): SurveyLayout {
  const today = opts.today || new Date();
  const baseYmd = opts.baseYmd || surveyBaseYmd(project, ymdOf(today));
  return buildSurveyLayout(computeSurveyDays(project), {
    baseYmd,
    milestones: computeTabMilestones(project),
  });
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

  // 氏名欄 (右寄せの下線) と作成日
  const half = Math.floor(colCount / 2);
  ws.mergeCells(row, 1, row, half);
  const made = ws.getCell(row, 1);
  made.value = `作成日: ${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
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
  howto.value = '時刻の右の欄に、出られる時間は ○、出られない時間は ×、相談したい時間は △ を記入してください。';
  styleCell(howto, { size: 9, align: 'left', wrap: true });
  ws.getRow(row).height = 16;
  row += 2;

  if (layout.weeks.length === 0 && layout.unplaced.length === 0) {
    ws.mergeCells(row, 1, row, colCount);
    const empty = ws.getCell(row, 1);
    empty.value = '授業のある日・時限がまだ設定されていません (⚙ 設定 → 基本設定で日付と時限を登録してください)';
    styleCell(empty, { size: 9, color: ARGB_MUTED, align: 'left' });
    row += 2;
  }

  layout.weeks.forEach(week => {
    row = writeWeek(ws, row, week.days, week.bandRows);
    row++; // 週の間を 1 行あける
  });

  // 実日付に解決できなかった日 (M/D でないラベル)。日ごとに縦に並べる
  if (layout.unplaced.length > 0) {
    ws.mergeCells(row, 1, row, colCount);
    const head = ws.getCell(row, 1);
    head.value = 'その他の日';
    styleCell(head, { size: 9, bold: true, align: 'left' });
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
    });
    row++;
  }

  // 備考欄
  ws.mergeCells(row, 1, row, colCount);
  const memoHead = ws.getCell(row, 1);
  memoHead.value = '備考（時間の希望・ご都合など）';
  styleCell(memoHead, { size: 9, bold: true, align: 'left' });
  row++;
  ws.mergeCells(row, 1, row + 2, colCount);
  styleCell(ws.getCell(row, 1), { size: 10, align: 'left', wrap: true });
  outlineRange(ws, row, 1, row + 2, colCount);
  for (let r = row; r <= row + 2; r++) ws.getRow(r).height = ROW_HEIGHT;

  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0, // 縦は成り行き (長い講習は 2 枚目へ)
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  return workbook;
}

export async function downloadAvailabilitySurveyExcel(project: Project) {
  const workbook = buildAvailabilitySurveyWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '出勤可能調査'));
}
