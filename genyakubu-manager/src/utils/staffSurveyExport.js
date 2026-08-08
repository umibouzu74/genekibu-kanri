// ─── バイト出勤可能時間調査 Excel (exceljs) ─────────────────────────
// バイト管理の「出勤可能時間調査 (Excel)」ボタンから出力する調査票。
// バイト 1 人 = 1 シート (A4 縦)。上段に現在の時間割の担当コマを
// 曜日 × 時間帯のグリッドで網掛け表示し、下段に「出勤できる時間帯」を
// 曜日ごとに手書きできる黄色の記入欄を置く。
//
// 講習ビルダーの excelExport.ts と同じ流儀:
// - exceljs は 1-based インデックス、色は ARGB (FF + RRGGBB)
// - 出力は async (writeBuffer) → Blob → anchor.click()
// - このモジュール自体はボタン押下時に dynamic import して
//   exceljs をメインバンドルから外す
//
// 担当コマの判定は StaffListTab の担当コマ数と同じ isSlotForTeacher
// (直接担当 + "·" 区切りの複数講師 + note の隔週パートナー) を使い、
// 画面の件数と調査票の内容が一致するようにする。

import ExcelJS from "exceljs";
import { DAYS } from "../constants/schools";
import { timeToMin } from "./dateHelpers";
import { isSlotForTeacher } from "./biweekly";
import { filterSlotsByActiveTimetable } from "./timetable";

// ─── スタイル定義 (excelExport.ts の配色に合わせる) ─────────────────
const ARGB_WHITE = "FFFFFFFF";
const ARGB_GRAY_BORDER = "FFAAAAAA";
const ARGB_HEADER_BLUE = "FF4472C4";
const ARGB_SECTION_GREEN = "FFE2EFDA";
const ARGB_ASSIGNED_GRAY = "FFE7E6E6";
const ARGB_TIME_GRAY = "FFF2F2F2";
// 記入欄 (手書きしてほしいセル) は黄色で塗る
const ARGB_FILLIN_YELLOW = "FFFFF2CC";

const THIN_BORDER = {
  top: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  bottom: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  left: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  right: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
};

const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function setCell(ws, row, col, value, style) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
  return cell;
}

// ─── 担当コマの収集 (純粋関数、テスト用に export) ───────────────────
/**
 * 1 人分の担当コマを「時間帯 (開始時刻順) × 曜日」のグリッドに整理する。
 * 同じ曜日 × 時間帯の複数コマ (隔週ペア等) は 1 セルに縦に並べる。
 * @param {import("../types").Slot[]} slots 現在の時間割のコマ
 * @param {string} name バイト名
 * @returns {{time: string, byDay: Map<string, import("../types").Slot[]>}[]}
 */
export function collectStaffGrid(slots, name) {
  const mine = slots.filter((s) => isSlotForTeacher(s, name));
  const byTime = new Map();
  for (const s of mine) {
    if (!byTime.has(s.time)) byTime.set(s.time, new Map());
    const byDay = byTime.get(s.time);
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push(s);
  }
  return [...byTime.entries()]
    .map(([time, byDay]) => ({ time, byDay }))
    .sort((a, b) => timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]));
}

/** セルに表示するコマ文字列。例: "中2 AB 数学\n601 隔週(河野)" */
export function formatSlotLines(slot) {
  const head = [slot.grade, slot.cls, slot.subj]
    .map((v) => (v || "").trim())
    .filter((v) => v && v !== "-")
    .join(" ");
  const tail = [slot.room, slot.note]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" ");
  return tail ? `${head}\n${tail}` : head;
}

// Excel のシート名に使えない文字を除き、31 文字に収める。ブック内で
// 同名になった場合 (同姓同名・記号除去後の一致・先頭 31 文字の一致) は
// 「~2」「~3」… を付けて一意化する — exceljs の addWorksheet は重複名で
// 例外を投げ、全員分の出力ごと失敗してしまうため
function safeSheetName(name, index, used) {
  const base =
    String(name).replace(/[\\/:?*[\]]/g, "").substring(0, 31).trim() ||
    `バイト${index + 1}`;
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) {
    const suffix = `~${n}`;
    candidate = `${base.substring(0, 31 - suffix.length).trimEnd()}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

// ─── シート構築 ─────────────────────────────────────────────────────
const COL_LABEL = 1; // A 列: 時間帯 / 記入欄ラベル
const DAY_COL0 = 2; // B 列〜: 月〜土
const COL_COUNT = 1 + DAYS.length;

function buildOneStaffSheet(workbook, name, index, slots, opts) {
  const ws = workbook.addWorksheet(safeSheetName(name, index, opts.usedSheetNames));
  const grid = collectStaffGrid(slots, name);

  // 行 1: タイトル
  ws.mergeCells(1, 1, 1, COL_COUNT);
  setCell(ws, 1, 1, `出勤可能時間 調査票 ― ${name}`, {
    font: { bold: true, size: 14 },
    alignment: { horizontal: "left", vertical: "middle" },
  });
  ws.getRow(1).height = 24;

  // 行 2: 作成日・凡例
  ws.mergeCells(2, 1, 2, COL_COUNT);
  setCell(
    ws,
    2,
    1,
    `作成日: ${opts.dateLabel} ／ 網掛け＝現在の担当コマ（${opts.timetableLabel}）`,
    {
      font: { size: 9, color: { argb: "FF666666" } },
      alignment: { horizontal: "left", vertical: "middle" },
    }
  );

  // 行 3: 記入説明
  ws.mergeCells(3, 1, 3, COL_COUNT);
  setCell(
    ws,
    3,
    1,
    "下段の黄色の欄に、曜日ごとに出勤できる時間帯をご記入ください。" +
      "（記入例: 18:00〜21:50 ／ 19:00以降 ／ × 不可）",
    { font: { size: 9 }, alignment: { horizontal: "left", vertical: "middle", wrapText: true } }
  );
  ws.getRow(3).height = 16;

  // 行 4: 曜日ヘッダ
  setCell(ws, 4, COL_LABEL, "時間帯", {
    font: { bold: true, size: 10, color: { argb: ARGB_WHITE } },
    fill: solidFill(ARGB_HEADER_BLUE),
    alignment: { horizontal: "center", vertical: "middle" },
    border: THIN_BORDER,
  });
  DAYS.forEach((day, i) => {
    setCell(ws, 4, DAY_COL0 + i, day, {
      font: { bold: true, size: 10, color: { argb: ARGB_WHITE } },
      fill: solidFill(ARGB_HEADER_BLUE),
      alignment: { horizontal: "center", vertical: "middle" },
      border: THIN_BORDER,
    });
  });

  // 行 5〜: 現在の担当コマ (時間帯 × 曜日)
  let row = 5;
  if (grid.length === 0) {
    ws.mergeCells(row, 1, row, COL_COUNT);
    setCell(ws, row, 1, "現在の担当コマはありません", {
      font: { size: 10, italic: true, color: { argb: "FF888888" } },
      alignment: { horizontal: "center", vertical: "middle" },
      border: THIN_BORDER,
    });
    ws.getRow(row).height = 22;
    row++;
  }
  for (const { time, byDay } of grid) {
    setCell(ws, row, COL_LABEL, time, {
      font: { size: 9 },
      fill: solidFill(ARGB_TIME_GRAY),
      alignment: { horizontal: "center", vertical: "middle" },
      border: THIN_BORDER,
    });
    let maxLines = 1;
    DAYS.forEach((day, i) => {
      const daySlots = byDay.get(day) || [];
      const text = daySlots.map(formatSlotLines).join("\n");
      maxLines = Math.max(maxLines, text ? text.split("\n").length : 1);
      setCell(ws, row, DAY_COL0 + i, text, {
        font: { size: 9 },
        fill: daySlots.length > 0 ? solidFill(ARGB_ASSIGNED_GRAY) : undefined,
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
        border: THIN_BORDER,
      });
    });
    ws.getRow(row).height = Math.max(26, 6 + maxLines * 12);
    row++;
  }

  // 記入セクション見出し
  ws.mergeCells(row, 1, row, COL_COUNT);
  setCell(ws, row, 1, "▼ 出勤できる時間帯（黄色の欄にご記入ください）", {
    font: { bold: true, size: 10 },
    fill: solidFill(ARGB_SECTION_GREEN),
    alignment: { horizontal: "left", vertical: "middle" },
    border: THIN_BORDER,
  });
  ws.getRow(row).height = 18;
  row++;

  // 記入欄 (曜日ごとの空欄)
  setCell(ws, row, COL_LABEL, "出勤できる\n時間帯", {
    font: { size: 9 },
    fill: solidFill(ARGB_TIME_GRAY),
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: THIN_BORDER,
  });
  DAYS.forEach((_, i) => {
    setCell(ws, row, DAY_COL0 + i, "", {
      fill: solidFill(ARGB_FILLIN_YELLOW),
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      border: THIN_BORDER,
    });
  });
  ws.getRow(row).height = 64;
  row++;

  // 備考 (1 つの横長欄)
  setCell(ws, row, COL_LABEL, "備考", {
    font: { size: 9 },
    fill: solidFill(ARGB_TIME_GRAY),
    alignment: { horizontal: "center", vertical: "middle" },
    border: THIN_BORDER,
  });
  ws.mergeCells(row, DAY_COL0, row, COL_COUNT);
  setCell(ws, row, DAY_COL0, "", {
    fill: solidFill(ARGB_FILLIN_YELLOW),
    alignment: { horizontal: "left", vertical: "top", wrapText: true },
    border: THIN_BORDER,
  });
  ws.getRow(row).height = 40;

  // 列幅と印刷設定 (A4 縦 1 枚に収める)
  ws.getColumn(COL_LABEL).width = 11;
  DAYS.forEach((_, i) => {
    ws.getColumn(DAY_COL0 + i).width = 15;
  });
  ws.pageSetup.paperSize = 9; // A4
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;
}

// ─── workbook 構築 (純粋関数、テスト用に export) ────────────────────
/**
 * @param {{
 *   staffNames: string[],           // シート順どおりのバイト名
 *   slots: import("../types").Slot[], // 現在の時間割のコマ (呼び出し側で絞る)
 *   timetableLabel: string,         // 例 "2026年度 1学期"
 *   dateLabel: string,              // 例 "2026-08-05"
 * }} params
 */
export function buildStaffSurveyWorkbook({ staffNames, slots, timetableLabel, dateLabel }) {
  const workbook = new ExcelJS.Workbook();
  const usedSheetNames = new Set();
  staffNames.forEach((name, i) => {
    buildOneStaffSheet(workbook, name, i, slots, {
      timetableLabel,
      dateLabel,
      usedSheetNames,
    });
  });
  return workbook;
}

// ─── 公開エントリ (ブラウザでダウンロード) ──────────────────────────
/**
 * 現在の時間割 (時間割スイッチャで選択中の timetable のコマ) から
 * バイト全員分の調査票を生成してダウンロードする。絞り込みは他ビューの
 * 「現在の時間割」表示と同じ filterSlotsByActiveTimetable に合わせる。
 * @param {{
 *   staffNames: string[],
 *   slots: import("../types").Slot[],
 *   timetables: import("../types").Timetable[],
 *   activeTimetableId: number,
 *   now?: Date,
 * }} params
 */
export async function downloadStaffSurveyExcel({
  staffNames,
  slots,
  timetables,
  activeTimetableId,
  now = new Date(),
}) {
  const pad = (n) => String(n).padStart(2, "0");
  const dateLabel = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const currentSlots = filterSlotsByActiveTimetable(slots, timetables, activeTimetableId);
  const timetableLabel =
    (timetables || []).find((t) => t.id === (activeTimetableId || 1))?.name || "現在の時間割";

  const workbook = buildStaffSurveyWorkbook({
    staffNames,
    slots: currentSlots,
    timetableLabel,
    dateLabel,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `出勤可能時間調査_${dateLabel}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
