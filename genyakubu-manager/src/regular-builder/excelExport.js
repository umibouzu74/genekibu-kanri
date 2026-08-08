// ─── 通常時間割の Excel 出力 (RB22) ─────────────────────────────────
// 2 種類の workbook を作る:
// - 曜日グリッド (buildRegularWorkbook): 画面の曜日ビュー (セクション別
//   テーブル) を再現。曜日 1 つ = 1 シート (A4 横・横 1 ページ収め)。
//   セクションごとに「時間 × 学年・クラス」の表を縦に並べ、セルには
//   教科 / 講師 / 教室・備考 を 3 行で載せる。科目カラーの背景も画面と同じ。
// - 講師別 (buildRegularTeacherWorkbook): 先頭に「集計」シート (講師 ×
//   曜日のコマ数・稼働時間 — 📊 集計パネルの Excel 版)、続いて講師ごとに
//   1 シートで週の担当コマ一覧 + 曜日別集計 (講習の講師別 Excel と同じ発想)。
//
// staffSurveyExport.js と同じ流儀:
// - exceljs は 1-based インデックス、色は ARGB (FF + RRGGBB)
// - 出力は async (writeBuffer) → Blob → anchor.click()
// - このモジュール自体はボタン押下時に dynamic import して
//   exceljs をメインバンドルから外す
//
// 割り切り (紙面要件):
// - 「🏫 亀井町を分ける」は画面のトグル状態に従う (見たまま)
// - セルが 1 つも無い時限行・クラス列・曜日シートは常に出力しない
//   (画面の「▤ 空行・空列を隠す」トグルとは独立に、紙面では常に省く)
// - 合同 (結合) 列は結合せず独立列として出力する。合同の範囲ラベル列に
//   中身があれば、その構成クラスの空列は出力しない
// - 隔週コマは講師欄に「主担当 / パートナー」で載せる (画面と同じ)

import ExcelJS from "exceljs";
import {
  biweeklyPartner,
  formatBiweeklyTeacher,
  splitTeacherField,
} from "../utils/biweekly";
import { getSubjectColor } from "../timetable-builder/utils/constants";
import { classRoomForDay, computeSections, makeCellKey } from "./model";
import { computeTeacherLoad, computeTeacherWeek, formatMinutes } from "./teacherLoad";

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
 * その曜日にセルが 1 つも無いクラス列・時限行は落とす (紙面に空きマスの
 * 列や行を出さない)。Excel は合同列を結合しないため、画面の空列非表示
 * (visibleClassesForDay) と違い、合同の構成クラスも自身のセルが無ければ
 * 落とす (範囲ラベル列に中身が載るので情報は欠けない)。
 * @returns {{
 *   name: string,
 *   periods: {id, label, time}[],
 *   cols: {tab, cls}[],
 * }[]}
 */
export function collectDaySheet(project, day, { splitCampus = true } = {}) {
  return computeSections(project, day, { splitCampus })
    .map((s) => {
      const tabs = s.tabs
        .map((t) => ({
          ...t,
          classes: (t.classes || []).filter((cls) =>
            (t.periodIds || []).some(
              (pid) => t.schedule[makeCellKey(day, pid, cls.id)]
            )
          ),
        }))
        .filter((t) => t.classes.length > 0);
      const usedIds = new Set(tabs.flatMap((t) => t.periodIds || []));
      const periods = (project.periods || [])
        .filter((p) => usedIds.has(p.id))
        .map((p, i) => ({ p, i }))
        .sort((x, y) => startMin(x.p.time) - startMin(y.p.time) || x.i - y.i)
        .map((x) => x.p)
        .filter((per) =>
          tabs.some(
            (t) =>
              (t.periodIds || []).includes(per.id) &&
              t.classes.some((cls) => t.schedule[makeCellKey(day, per.id, cls.id)])
          )
        );
      const cols = tabs.flatMap((t) =>
        (t.classes || []).map((cls) => ({ tab: t, cls }))
      );
      return { name: s.name, periods, cols };
    })
    .filter((s) => s.periods.length > 0 && s.cols.length > 0);
}

// セルの表示テキスト (教科 / 講師 / 教室・備考 の最大 3 行)。教室は
// その曜日の実効教室 (セル上書き → 曜日別既定 → クラス既定)
function cellText(cell, cls, day) {
  if (!cell) return "";
  const lines = [];
  if (cell.subj) lines.push(cell.subj);
  if (cell.teacher) lines.push(formatBiweeklyTeacher(cell.teacher, cell.note));
  const sub = [(cell.room || "").trim() || classRoomForDay(cls, day), (cell.note || "").trim()]
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
        target.value = cellText(cell, col.cls, day);
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

// ─── 講師別 workbook (集計 + 講師ごとの週間シート) ──────────────────
// 講習の講師別 Excel (excelExport.ts の buildTeacherWorkbook) と同じ発想の
// 通常時間割版。1 枚目に 📊 集計パネル相当の「講師 × 曜日のコマ数・稼働
// 時間」、続いて担当コマのある講師ごとに 1 シートで週の担当一覧 + 曜日別
// 集計を載せる。担当コマ 0 の講師はシートを作らない (空きシートは不要)。

const ARGB_GRAY_TEXT = "FF808080";
const ARGB_RED_TEXT = "FFCC0000";
const MEDIUM_EDGE = { style: "medium", color: { argb: "FF666666" } };

// Excel のシート名の禁則文字 (\ / ? * [ ] :) を除いて 31 文字に収める
function sanitizeSheetName(name, fallback) {
  const s = String(name || "")
    .replace(/[\\/?*[\]:]/g, "")
    .trim()
    .slice(0, 31);
  return s || fallback;
}

// 禁則除去で同名になった場合 (「田中/A」と「田中A」など) は連番で回避
function uniqueSheetName(workbook, base) {
  if (!workbook.getWorksheet(base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base.slice(0, 28)}(${i})`;
    if (!workbook.getWorksheet(name)) return name;
  }
}

const PAGE_MARGINS = {
  left: 0.4,
  right: 0.4,
  top: 0.5,
  bottom: 0.5,
  header: 0.2,
  footer: 0.2,
};

function headerCell(cell, value) {
  cell.value = value;
  cell.font = { bold: true, size: 9 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.fill = solidFill(ARGB_HEAD_GRAY);
  cell.border = THIN_BORDER;
}

// 集計シート: 講師 × 曜日 (コマ / 時間の 2 列) + 週計。📊 集計パネルと
// 同じ computeTeacherLoad が数字の出所 (隔週 0.5 重み・上限超過の赤字も同じ)
function buildTeacherSummarySheet(workbook, project, load, dateLabel) {
  const { days, rows, untimedCount } = load;
  const active = rows.filter((r) => r.total > 0);
  const ncols = 1 + (days.length + 1) * 2;
  const ws = workbook.addWorksheet("集計", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: PAGE_MARGINS,
    },
  });
  ws.getColumn(1).width = 14;
  for (let c = 2; c <= ncols; c++) ws.getColumn(c).width = 7;

  ws.mergeCells(1, 1, 1, ncols);
  const title = ws.getCell(1, 1);
  title.value = `${project.name || "通常時間割"} — 講師別コマ数・稼働時間（出力: ${dateLabel}）`;
  title.font = { size: 13, bold: true };

  // 見出し 2 段: 曜日 (コマ / 時間 の 2 列を結合) + 週計
  const dayRow = 3;
  const subRow = 4;
  ws.mergeCells(dayRow, 1, subRow, 1);
  headerCell(ws.getCell(dayRow, 1), "講師");
  const groups = [...days.map((d) => ({ label: d })), { label: "週計" }];
  groups.forEach((g, i) => {
    const c = 2 + i * 2;
    ws.mergeCells(dayRow, c, dayRow, c + 1);
    headerCell(ws.getCell(dayRow, c), g.label);
    ws.getCell(dayRow, c + 1).border = THIN_BORDER; // merge 後も右端の罫線
    headerCell(ws.getCell(subRow, c), "コマ");
    headerCell(ws.getCell(subRow, c + 1), "時間");
  });

  active.forEach((r, ri) => {
    const rowIdx = subRow + 1 + ri;
    const nameCell = ws.getCell(rowIdx, 1);
    nameCell.value = r.inMaster ? r.name : `${r.name} (マスタ外)`;
    nameCell.font = { bold: true, size: 9 };
    nameCell.border = THIN_BORDER;
    const put = (col, count, minutes, over) => {
      const countCell = ws.getCell(rowIdx, col);
      countCell.value = count || "";
      const timeCell = ws.getCell(rowIdx, col + 1);
      timeCell.value = count ? formatMinutes(minutes) : "";
      for (const cell of [countCell, timeCell]) {
        cell.font = over
          ? { size: 9, bold: true, color: { argb: ARGB_RED_TEXT } }
          : { size: 9 };
        cell.alignment = { horizontal: "center" };
        cell.border = THIN_BORDER;
      }
    };
    days.forEach((d, i) => {
      put(2 + i * 2, r.byDay[d] || 0, r.minutesByDay[d] || 0, r.overDays.includes(d));
    });
    put(2 + days.length * 2, r.total, r.totalMinutes, r.overWeek);
  });

  // 注記 (画面の hint と同じ内容)
  let noteRow = subRow + active.length + 2;
  const addNote = (text, argb) => {
    ws.mergeCells(noteRow, 1, noteRow, ncols);
    const cell = ws.getCell(noteRow, 1);
    cell.value = text;
    cell.font = { size: 9, color: { argb } };
    noteRow++;
  };
  addNote(
    "時間は 時:分（時限の時刻から算出）。隔週コマはコマ数・時間とも 0.5 週分で算入。赤字は講師マスタの上限超過。",
    ARGB_GRAY_TEXT
  );
  if (untimedCount > 0) {
    addNote(
      `⚠ 時刻未設定の時限の担当コマ ${untimedCount} 件は時間に含まれていません。`,
      ARGB_RED_TEXT
    );
  }
  return ws;
}

// 備考列: 隔週コマは A/B と相手が分かる表記に、その他は note の原文
export function teacherEntryNote(e) {
  if (!e.biweekly) return e.note || "";
  const counterpart =
    e.biweekly === "B"
      ? splitTeacherField(e.teacher).join("·") // B 週側には主担当の名前
      : biweeklyPartner(e.note) || "";
  return `隔週${e.biweekly}${counterpart ? `（${counterpart} と交互）` : ""}`;
}

const TEACHER_SHEET_HEADER = [
  "曜日",
  "時限",
  "時刻",
  "学年",
  "クラス",
  "科目",
  "教室",
  "備考",
];

// 講師 1 人分のシート: 週の担当コマ一覧 (曜日 → 開始時刻順) + 曜日別集計
function buildTeacherSheet(workbook, project, name, week, dateLabel) {
  const ncols = TEACHER_SHEET_HEADER.length;
  const ws = workbook.addWorksheet(
    uniqueSheetName(workbook, sanitizeSheetName(name, "講師")),
    {
      pageSetup: {
        paperSize: 9, // A4 (講習の B4 と違い週 1 枚なので A4 縦で足りる)
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: PAGE_MARGINS,
      },
    }
  );
  [6, 12, 13, 10, 10, 10, 10, 22].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.mergeCells(1, 1, 1, ncols);
  const title = ws.getCell(1, 1);
  title.value = `${name} — ${project.name || "通常時間割"}（出力: ${dateLabel}）`;
  title.font = { size: 13, bold: true };
  TEACHER_SHEET_HEADER.forEach((h, i) => headerCell(ws.getCell(2, 1 + i), h));
  // 2 ページ目以降にもタイトル / ヘッダを繰り返す (講習の P1 と同じ)
  ws.pageSetup.printTitlesRow = "1:2";

  const activeDays = week.days.filter((d) => (week.byDay[d] || []).length > 0);
  let row = 3;
  for (const d of activeDays) {
    week.byDay[d].forEach((e, i) => {
      const values = [
        i === 0 ? d : "",
        e.periodLabel,
        e.time,
        e.tabName,
        e.clsLabel,
        e.subj,
        e.room,
        teacherEntryNote(e),
      ];
      values.forEach((v, ci) => {
        const cell = ws.getCell(row, 1 + ci);
        cell.value = v;
        cell.font = { size: 10 };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border =
          i === 0 ? { ...THIN_BORDER, top: MEDIUM_EDGE } : THIN_BORDER; // 曜日の区切りは太線
        if (ci === 5 && e.subj) {
          const argb = hexToArgb(getSubjectColor(e.subj));
          if (argb) cell.fill = solidFill(argb);
        }
      });
      row++;
    });
  }
  for (let c = 1; c <= ncols; c++) {
    ws.getCell(row - 1, c).border = {
      ...ws.getCell(row - 1, c).border,
      bottom: MEDIUM_EDGE,
    };
  }

  // 曜日別集計 (コマ数・稼働時間) + 週計。数字は 📊 集計と同じ 0.5 重み
  row += 1;
  ["曜日", "コマ", "時間"].forEach((h, i) => headerCell(ws.getCell(row, 1 + i), h));
  row++;
  const put = (label, count, minutes, bold) => {
    const values = [label, count, formatMinutes(minutes)];
    values.forEach((v, ci) => {
      const cell = ws.getCell(row, 1 + ci);
      cell.value = v;
      cell.font = { size: 10, bold: !!bold };
      cell.alignment = { horizontal: ci === 0 ? "left" : "center" };
      cell.border = THIN_BORDER;
    });
    row++;
  };
  let hasBiweekly = false;
  for (const d of activeDays) {
    const entries = week.byDay[d];
    hasBiweekly = hasBiweekly || entries.some((e) => e.biweekly);
    const weighted = entries.reduce((n, e) => n + (e.biweekly ? 0.5 : 1), 0);
    put(d, weighted, week.minutesByDay[d] || 0, false);
  }
  put("週計", week.weightedTotal, week.totalMinutes, true);
  if (hasBiweekly) {
    ws.mergeCells(row, 1, row, ncols);
    const cell = ws.getCell(row, 1);
    cell.value = "隔週コマはコマ数・時間とも 0.5 週分で算入。";
    cell.font = { size: 9, color: { argb: ARGB_GRAY_TEXT } };
  }
  return ws;
}

/**
 * 講師別 workbook (テスト用に export)。担当コマのある講師が 1 人も
 * いなければシート 0 の workbook を返す (呼び出し側でエラーメッセージ)。
 * @param {object} project RegularProject
 * @param {{dateLabel: string}} opts
 */
export function buildRegularTeacherWorkbook(project, { dateLabel }) {
  const workbook = new ExcelJS.Workbook();
  const load = computeTeacherLoad(project);
  const active = load.rows.filter((r) => r.total > 0);
  if (active.length === 0) return workbook;
  buildTeacherSummarySheet(workbook, project, load, dateLabel);
  for (const r of active) {
    buildTeacherSheet(
      workbook,
      project,
      r.name,
      computeTeacherWeek(project, r.name),
      dateLabel
    );
  }
  return workbook;
}

// ─── 公開エントリ (ブラウザでダウンロード) ──────────────────────────

const fmtDateLabel = (now) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const safeProjectName = (project) =>
  (project.name || "通常時間割").replace(/[\\/:*?"<>|]/g, "_").trim() ||
  "通常時間割";

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {{project: object, days: string[], splitCampus?: boolean, now?: Date}} params
 */
export async function downloadRegularExcel({
  project,
  days,
  splitCampus = true,
  now = new Date(),
}) {
  const dateLabel = fmtDateLabel(now);
  const workbook = buildRegularWorkbook(project, { days, splitCampus, dateLabel });
  if (workbook.worksheets.length === 0) {
    throw new Error("出力できる曜日がありません (セルが 1 つもありません)");
  }
  await downloadWorkbook(
    workbook,
    `通常時間割_${safeProjectName(project)}_${dateLabel}.xlsx`
  );
}

/** @param {{project: object, now?: Date}} params */
export async function downloadRegularTeacherExcel({ project, now = new Date() }) {
  const dateLabel = fmtDateLabel(now);
  const workbook = buildRegularTeacherWorkbook(project, { dateLabel });
  if (workbook.worksheets.length === 0) {
    throw new Error("担当コマのある講師がいません");
  }
  await downloadWorkbook(
    workbook,
    `通常時間割_講師別_${safeProjectName(project)}_${dateLabel}.xlsx`
  );
}
