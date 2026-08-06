// ─── 通常時間割の Excel 出力 (RB22) ─────────────────────────────────
// 画面の曜日ビュー (セクション別テーブル) を再現した Excel を出力する。
// 曜日 1 つ = 1 シート (A4 横・横 1 ページ収め)。セクションごとに
// 「時間 × 学年・クラス」の表を縦に並べ、セルには 教科 / 講師 /
// 教室・備考 を 3 行で載せる。科目カラーの背景も画面と同じ。
//
// staffSurveyExport.js と同じ流儀:
// - exceljs は 1-based インデックス、色は ARGB (FF + RRGGBB)
// - 出力は async (writeBuffer) → Blob → anchor.click()
// - このモジュール自体はボタン押下時に dynamic import して
//   exceljs をメインバンドルから外す
//
// 割り切り (v1 の紙面要件):
// - 「🏫 亀井町を分ける」は画面のトグル状態に従う (見たまま)
// - 「▤ 空行・空列を隠す」は反映しない (全マス目を出力する)
// - 合同 (結合) 列は結合せず独立列として出力する
// - 隔週コマは講師欄に「主担当 / パートナー」で載せる (画面と同じ)

import ExcelJS from "exceljs";
import { formatBiweeklyTeacher } from "../utils/biweekly";
import { getSubjectColor } from "../timetable-builder/utils/constants";
import { computeSections, makeCellKey } from "./model";

const ARGB_GRAY_BORDER = "FFAAAAAA";
const ARGB_HEADER_BLUE = "FF4472C4";
const ARGB_HEAD_GRAY = "FFF2F2F2";
const ARGB_BLOCKED_GRAY = "FFE7E6E6";

const THIN_BORDER = {
  top: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  bottom: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  left: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
  right: { style: "thin", color: { argb: ARGB_GRAY_BORDER } },
};

const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// "#RRGGBB" (getSubjectColor) → ARGB。不正・null は undefined
const hexToArgb = (hex) =>
  /^#[0-9a-fA-F]{6}$/.test(hex || "") ? `FF${hex.slice(1).toUpperCase()}` : undefined;

// 時刻 "HH:MM-..." の開始分。パース不能 (時刻未設定) は末尾送り
// (RegularGrid の行順と同じ規則)
const startMin = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

// ─── シートデータの収集 (純粋関数、テスト用に export) ───────────────
/**
 * 曜日 1 つ分のセクション構造を出力用に解決する。
 * セクション分割・列の並びは画面 (computeSections) と同一。
 * @returns {{
 *   name: string,
 *   periods: {id, label, time}[],
 *   cols: {tab, cls}[],
 * }[]}
 */
export function collectDaySheet(project, day, { splitCampus = true } = {}) {
  return computeSections(project, day, { splitCampus })
    .map((s) => {
      const usedIds = new Set(s.tabs.flatMap((t) => t.periodIds || []));
      const periods = (project.periods || [])
        .filter((p) => usedIds.has(p.id))
        .map((p, i) => ({ p, i }))
        .sort((x, y) => startMin(x.p.time) - startMin(y.p.time) || x.i - y.i)
        .map((x) => x.p);
      const cols = s.tabs.flatMap((t) =>
        (t.classes || []).map((cls) => ({ tab: t, cls }))
      );
      return { name: s.name, periods, cols };
    })
    .filter((s) => s.periods.length > 0 && s.cols.length > 0);
}

// セルの表示テキスト (教科 / 講師 / 教室・備考 の最大 3 行)
function cellText(cell, cls) {
  if (!cell) return "";
  const lines = [];
  if (cell.subj) lines.push(cell.subj);
  if (cell.teacher) lines.push(formatBiweeklyTeacher(cell.teacher, cell.note));
  const sub = [(cell.room || "").trim() || (cls.room || "").trim(), (cell.note || "").trim()]
    .filter(Boolean)
    .join(" ");
  if (sub) lines.push(sub);
  return lines.join("\n");
}

function buildDaySheet(workbook, project, day, sections, dateLabel) {
  const maxCols = Math.max(...sections.map((s) => s.cols.length)) + 1;
  const ws = workbook.addWorksheet(`${day}曜`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 15 },
  });
  ws.getColumn(1).width = 11;
  for (let c = 2; c <= maxCols; c++) ws.getColumn(c).width = 16;

  // タイトル行
  let row = 1;
  ws.mergeCells(row, 1, row, maxCols);
  const title = ws.getCell(row, 1);
  title.value = `${project.name || "通常時間割"} — ${day}曜日（出力: ${dateLabel}）`;
  title.font = { size: 13, bold: true };
  row += 2;

  for (const s of sections) {
    // セクション見出し
    ws.mergeCells(row, 1, row, s.cols.length + 1);
    const head = ws.getCell(row, 1);
    head.value = s.name;
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = solidFill(ARGB_HEADER_BLUE);
    head.border = THIN_BORDER;
    row++;

    // 列見出し: 学年 (colSpan) + クラス (2 段)
    const tabRow = row;
    const clsRow = row + 1;
    const corner = ws.getCell(tabRow, 1);
    corner.value = "時間";
    corner.alignment = { vertical: "middle", horizontal: "center" };
    corner.fill = solidFill(ARGB_HEAD_GRAY);
    corner.border = THIN_BORDER;
    ws.mergeCells(tabRow, 1, clsRow, 1);
    let c = 2;
    for (const t of new Set(s.cols.map((x) => x.tab))) {
      const span = s.cols.filter((x) => x.tab === t).length;
      ws.mergeCells(tabRow, c, tabRow, c + span - 1);
      const th = ws.getCell(tabRow, c);
      th.value = t.name;
      th.font = { bold: true };
      th.alignment = { horizontal: "center" };
      th.fill = solidFill(ARGB_HEAD_GRAY);
      th.border = THIN_BORDER;
      // merge 後も右端まで罫線を引く
      for (let i = 0; i < span; i++) ws.getCell(tabRow, c + i).border = THIN_BORDER;
      c += span;
    }
    s.cols.forEach((col, i) => {
      const th = ws.getCell(clsRow, 2 + i);
      const label = col.cls.label || col.cls.room || "－";
      th.value =
        col.cls.label && col.cls.room && col.cls.room !== col.cls.label
          ? `${label} (${col.cls.room})`
          : label;
      th.font = { bold: true, size: 9 };
      th.alignment = { horizontal: "center", wrapText: true };
      th.fill = solidFill(ARGB_HEAD_GRAY);
      th.border = THIN_BORDER;
    });
    row = clsRow + 1;

    // 時限行
    for (const per of s.periods) {
      const timeCell = ws.getCell(row, 1);
      timeCell.value = [per.label, per.time].filter(Boolean).join("\n");
      timeCell.font = { size: 9 };
      timeCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      timeCell.fill = solidFill(ARGB_HEAD_GRAY);
      timeCell.border = THIN_BORDER;
      s.cols.forEach((col, i) => {
        const target = ws.getCell(row, 2 + i);
        target.border = THIN_BORDER;
        if (!(col.tab.periodIds || []).includes(per.id)) {
          // この学年が使わない時限 (時刻体系の違い) は画面と同じくグレーで塞ぐ
          target.fill = solidFill(ARGB_BLOCKED_GRAY);
          return;
        }
        const cell = col.tab.schedule[makeCellKey(day, per.id, col.cls.id)];
        target.value = cellText(cell, col.cls);
        target.font = { size: 9 };
        target.alignment = { vertical: "top", wrapText: true };
        const argb = cell?.subj ? hexToArgb(getSubjectColor(cell.subj)) : undefined;
        if (argb) target.fill = solidFill(argb);
      });
      ws.getRow(row).height = 34;
      row++;
    }
    row++; // セクション間の空行
  }
  return ws;
}

// ─── workbook 構築 (純粋関数、テスト用に export) ────────────────────
/**
 * @param {object} project RegularProject
 * @param {{days: string[], splitCampus?: boolean, dateLabel: string}} opts
 */
export function buildRegularWorkbook(project, { days, splitCampus = true, dateLabel }) {
  const workbook = new ExcelJS.Workbook();
  for (const day of days) {
    const sections = collectDaySheet(project, day, { splitCampus });
    if (sections.length === 0) continue;
    buildDaySheet(workbook, project, day, sections, dateLabel);
  }
  return workbook;
}

// ─── 公開エントリ (ブラウザでダウンロード) ──────────────────────────
/**
 * @param {{project: object, days: string[], splitCampus?: boolean, now?: Date}} params
 */
export async function downloadRegularExcel({
  project,
  days,
  splitCampus = true,
  now = new Date(),
}) {
  const pad = (n) => String(n).padStart(2, "0");
  const dateLabel = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const workbook = buildRegularWorkbook(project, { days, splitCampus, dateLabel });
  if (workbook.worksheets.length === 0) {
    throw new Error("出力できる曜日がありません");
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const safeName =
    (project.name || "通常時間割").replace(/[\\/:*?"<>|]/g, "_").trim() || "通常時間割";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `通常時間割_${safeName}_${dateLabel}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
