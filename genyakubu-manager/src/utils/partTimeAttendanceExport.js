// ─── バイト出勤表 Excel (exceljs) ────────────────────────────────────
// 授業時間の集計の「バイト出勤表」タブの「⬇ バイト出勤表 (Excel)」から出す。
// 手で作っていた表 (アルバイトコマ数YYYY.M.D-M.D.xlsx) と同じ形:
//   1 行目: 「中学生/高校生 (全角空白 2 つ) 現役アルバイト」・年・単価
//   2 行目: 月 (月の切れ目の列に「9月」「10月」)
//   3 行目: 日、4 行目: 曜日。月の切れ目に空の列を 1 つ入れる
//   5 行目〜: バイト 1 人 1 行。A 列に「◯◯ 先生」と 2 行目に担当の目安
//   右端に「日数」(=SUM) と「金額」(=日数 × 単価セル)、最下行に合計 (=SUM)
// 日数・金額・合計は**式で入れる** (出力後に Excel 上で日を直しても合う)。
// 単価は 1 つのセルに置き、全員の金額がそこを参照する。
//
// 書き出しは 2 通り (画面には金額・単価を出さないので、金額を見られるのは
// Excel だけ):
//   - 金額なし: 単価・金額の列を作らない。鍵なし (…_日数のみ.xlsx)
//   - 金額入り: 単価・金額の列あり。**開くのにパスワードが要る** (Excel の
//     「ドキュメントの暗号化」と同じ。utils/officeEncryption)。パスワードは管理者が
//     決めた全員共通のもの (utils/partTimeAttendanceSettings)。**金額入りを鍵なしで
//     作る経路を足さないこと**
//
// 表の中身は utils/partTimeAttendance.buildPartTimeAttendanceSheet (画面と同じ)。
// このモジュールはボタン押下時に dynamic import して exceljs をメインバンドル
// から外す (staffSurveyExport / 講習の excelExport と同じ流儀)。

import ExcelJS from "exceljs";
import { WEEKDAYS } from "../constants/schools";
import { parseLocalDate } from "./dateHelpers";
import { attendanceFileName, sanitizeUnitPrice } from "./partTimeAttendance";
import { encryptOfficeFile } from "./officeEncryption";

export const ATTENDANCE_SHEET_TITLE = "中学生/高校生　　現役アルバイト";
// 1 人目の行 (1〜4 行目が見出し)
export const FIRST_STAFF_ROW = 5;
// 1 行目の年を置く日付の列 (0 始まり)。A 列の表題が右へはみ出す分を空ける
export const YEAR_LABEL_OFFSET = 7;

const ARGB_BORDER = "FF999999";
const ARGB_HEAD_FILL = "FFF2F2F2";
const ARGB_TOTAL_FILL = "FFFFF2CC";
const ARGB_SAT = "FF1F5FA8";
const ARGB_SUN = "FFC03030";
const thin = { style: "thin", color: { argb: ARGB_BORDER } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const CENTER = { horizontal: "center", vertical: "middle" };

/**
 * 日付の列の並び。列 2 (B) から日付を置き、月が変わるところに空の列を 1 つ挟む。
 * @param {string[]} dates
 * @returns {{columns: ({kind: "date", date: string, col: number, newMonth: boolean}|{kind: "gap", col: number})[], lastCol: number}}
 */
export function layoutAttendanceColumns(dates) {
  const columns = [];
  let col = 2;
  let prevMonth = null;
  for (const date of dates) {
    const month = date.slice(0, 7);
    if (prevMonth && month !== prevMonth) columns.push({ kind: "gap", col: col++ });
    columns.push({ kind: "date", date, col: col++, newMonth: month !== prevMonth });
    prevMonth = month;
  }
  return { columns, lastCol: col - 1 };
}

function weekdayOf(date) {
  const d = parseLocalDate(date);
  return d ? WEEKDAYS[d.getDay()] : "";
}

/**
 * ワークブックを組み立てる (純粋。テストから直接呼ぶ)。
 * @param {{
 *   sheet: ReturnType<typeof import("./partTimeAttendance").buildPartTimeAttendanceSheet>,
 *   hints?: Map<string, string>,
 *   startDate: string,
 *   endDate: string,
 *   unitPrice?: number | null,
 * }} args unitPrice を渡したときだけ単価・金額の列を作る (null = 金額なし)
 */
export function buildPartTimeAttendanceWorkbook({ sheet, hints = new Map(), startDate, endDate, unitPrice = null }) {
  const withAmounts = unitPrice != null;
  const price = withAmounts ? sanitizeUnitPrice(unitPrice) : 0;
  const wb = new ExcelJS.Workbook();
  wb.creator = "現役部授業管理";
  const ws = wb.addWorksheet("バイト出勤表", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
  });

  const { columns, lastCol } = layoutAttendanceColumns(sheet.dates);
  const firstDateCol = 2;
  const daysCol = lastCol + 1;
  // 金額なしでは列を作らない (null)
  const amountCol = withAmounts ? lastCol + 2 : null;
  const L = (c) => ws.getColumn(c).letter;
  const firstRow = FIRST_STAFF_ROW;
  const lastStaffRow = firstRow + sheet.rows.length - 1;
  const totalRow = lastStaffRow + 1;
  const priceRef = withAmounts ? `$${L(amountCol)}$1` : null;

  // 列幅
  ws.getColumn(1).width = 24;
  for (const c of columns) ws.getColumn(c.col).width = c.kind === "gap" ? 1.6 : 3.6;
  ws.getColumn(daysCol).width = 6;
  if (withAmounts) ws.getColumn(amountCol).width = 11;

  // 1 行目: 表題・年・単価 (金額入りだけ)。表題は A 列からはみ出して右の空きセルに描かれるので、
  // 年は表題の後ろ (日付の 8 列目あたり) に置く。年をまたぐ期間 (12/21〜1/20) は
  // 新しい年の最初の日の列にもう 1 つ
  const title = ws.getCell(1, 1);
  title.value = ATTENDANCE_SHEET_TITLE;
  title.font = { bold: true, size: 12 };
  const dateColumns = columns.filter((c) => c.kind === "date");
  let prevYear = null;
  dateColumns.forEach((c, i) => {
    const year = c.date.slice(0, 4);
    if (year === prevYear) return;
    const col = i === 0 ? dateColumns[Math.min(YEAR_LABEL_OFFSET, dateColumns.length - 1)].col : c.col;
    const cell = ws.getCell(1, col);
    cell.value = `${Number(year)}年`;
    cell.font = { bold: true };
    prevYear = year;
  });
  if (withAmounts) {
    const priceLabel = ws.getCell(1, daysCol);
    priceLabel.value = "単価";
    priceLabel.alignment = { horizontal: "right", vertical: "middle" };
    const priceCell = ws.getCell(1, amountCol);
    priceCell.value = price;
    priceCell.numFmt = "#,##0";
    priceCell.border = BORDER;
    priceCell.font = { bold: true };
    priceCell.alignment = { horizontal: "right", vertical: "middle" };
  }

  // 2〜4 行目: 月・日・曜日
  for (const c of columns) {
    if (c.kind !== "date") continue;
    const [, m, d] = c.date.split("-").map(Number);
    if (c.newMonth) {
      const mc = ws.getCell(2, c.col);
      mc.value = `${m}月`;
      mc.font = { bold: true };
    }
    const dow = weekdayOf(c.date);
    const color = dow === "土" ? ARGB_SAT : dow === "日" ? ARGB_SUN : undefined;
    const dc = ws.getCell(3, c.col);
    dc.value = d;
    dc.alignment = CENTER;
    dc.border = BORDER;
    dc.fill = solidFill(ARGB_HEAD_FILL);
    dc.font = color ? { color: { argb: color } } : {};
    const wc = ws.getCell(4, c.col);
    wc.value = dow;
    wc.alignment = CENTER;
    wc.border = BORDER;
    wc.fill = solidFill(ARGB_HEAD_FILL);
    wc.font = color ? { color: { argb: color } } : {};
  }
  const headCols = withAmounts
    ? [
        [daysCol, "日数"],
        [amountCol, "金額"],
      ]
    : [[daysCol, "日数"]];
  for (const [col, label] of headCols) {
    ws.mergeCells(3, col, 4, col);
    const cell = ws.getCell(3, col);
    cell.value = label;
    cell.alignment = CENTER;
    cell.border = BORDER;
    cell.fill = solidFill(ARGB_HEAD_FILL);
    cell.font = { bold: true };
  }
  ws.mergeCells(3, 1, 4, 1);
  const nameHead = ws.getCell(3, 1);
  nameHead.border = BORDER;
  nameHead.fill = solidFill(ARGB_HEAD_FILL);

  // 5 行目〜: バイトごと
  const dateCols = dateColumns;
  sheet.rows.forEach((row, i) => {
    const r = firstRow + i;
    const hint = hints.get(row.teacher) || "";
    const nameCell = ws.getCell(r, 1);
    nameCell.value = hint
      ? {
          richText: [
            { text: `${row.teacher} 先生`, font: { bold: true, size: 11 } },
            { text: `\n${hint}`, font: { size: 8 } },
          ],
        }
      : `${row.teacher} 先生`;
    nameCell.alignment = { vertical: "middle", wrapText: true };
    nameCell.border = BORDER;
    if (!hint) nameCell.font = { bold: true, size: 11 };
    ws.getRow(r).height = hint ? 30 : 20;

    row.cells.forEach((cell, j) => {
      const xc = ws.getCell(r, dateCols[j].col);
      xc.value = cell.units > 0 ? cell.units : null;
      xc.alignment = CENTER;
      xc.border = BORDER;
    });
    const days = ws.getCell(r, daysCol);
    days.value = {
      formula: `SUM(${L(firstDateCol)}${r}:${L(lastCol)}${r})`,
      result: row.days,
    };
    days.alignment = CENTER;
    days.border = BORDER;
    days.font = { bold: true };
    if (withAmounts) {
      const amount = ws.getCell(r, amountCol);
      amount.value = { formula: `${L(daysCol)}${r}*${priceRef}`, result: row.days * price };
      amount.numFmt = "#,##0";
      amount.border = BORDER;
      amount.alignment = { horizontal: "right", vertical: "middle" };
    }
  });

  // 最下行: 合計
  const totalLabel = ws.getCell(totalRow, 1);
  totalLabel.value = "合計";
  totalLabel.font = { bold: true };
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel.border = BORDER;
  totalLabel.fill = solidFill(ARGB_TOTAL_FILL);
  const hasRows = sheet.rows.length > 0;
  const totalDays = ws.getCell(totalRow, daysCol);
  totalDays.value = hasRows
    ? { formula: `SUM(${L(daysCol)}${firstRow}:${L(daysCol)}${lastStaffRow})`, result: sheet.totalDays }
    : 0;
  totalDays.alignment = CENTER;
  const totalCells = [totalDays];
  if (withAmounts) {
    const totalAmount = ws.getCell(totalRow, amountCol);
    totalAmount.value = hasRows
      ? {
          formula: `SUM(${L(amountCol)}${firstRow}:${L(amountCol)}${lastStaffRow})`,
          result: sheet.totalDays * price,
        }
      : 0;
    totalAmount.numFmt = "#,##0";
    totalAmount.alignment = { horizontal: "right", vertical: "middle" };
    totalCells.push(totalAmount);
  }
  for (const cell of totalCells) {
    cell.font = { bold: true };
    cell.border = BORDER;
    cell.fill = solidFill(ARGB_TOTAL_FILL);
  }
  ws.getRow(totalRow).height = 20;

  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printTitlesRow: "1:4",
  };
  ws.headerFooter.oddFooter = `&L${startDate} 〜 ${endDate}&R&P / &N`;
  return wb;
}

/**
 * 書き出すファイルのバイト列とファイル名。金額入り (unitPrice あり) は
 * password で暗号化する (パスワードが無ければ作らない)。
 * @param {Parameters<typeof buildPartTimeAttendanceWorkbook>[0] & {password?: string | null}} args
 * @returns {Promise<{bytes: Uint8Array, fileName: string, encrypted: boolean}>}
 */
export async function buildPartTimeAttendanceFile({ password = null, ...args }) {
  const withAmounts = args.unitPrice != null;
  if (withAmounts && !password) throw new Error("金額入りの Excel はパスワードが要ります");
  const wb = buildPartTimeAttendanceWorkbook(args);
  const plain = new Uint8Array(await wb.xlsx.writeBuffer());
  const bytes = withAmounts ? await encryptOfficeFile(plain, password) : plain;
  return {
    bytes,
    fileName: attendanceFileName(args.startDate, args.endDate, { withAmounts }),
    encrypted: withAmounts,
  };
}

/**
 * Excel を作ってダウンロードさせる。
 * @param {Parameters<typeof buildPartTimeAttendanceFile>[0]} args
 * @returns {Promise<string>} ファイル名
 */
export async function downloadPartTimeAttendanceExcel(args) {
  const { bytes, fileName } = await buildPartTimeAttendanceFile(args);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // ダウンロードが始まる前に解放しないよう、utils/csv と同じく少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
