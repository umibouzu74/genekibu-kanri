// ─── 掲示用「中学生コース時間割」の Excel 出力 ──────────────────────
//
// posterLayout.js が計算した紙面レイアウトを exceljs で描く。紙面の
// 要件と骨格は posterLayout.js の冒頭コメントを参照。
//
// **既存の「📥 Excel」(excelExport.js) とは別系統で、統合しない。**
// - excelExport: 画面の曜日ビューをそのまま写す (作成中の点検用)
// - posterExport: 例年の掲示紙面を再現する (完成版の掲示・配布用)
//
// ## 描き方の要点
//
// - 全列同じ幅 (COL_WIDTH) / 全行同じ高さ (ROW_HEIGHT) の方眼を敷き、
//   すべてを結合で組む。**先に罫線だけの下地を全マスに敷いてから、
//   内容ブロックを結合して被せる** — Excel は結合範囲の内側の罫線を
//   描かないので、下地を敷いておけば結合の大小に関わらず外周だけが残る
// - 罫線の太さは意味で使い分ける:
//   表の外周・曜日の境 = medium / 学年 (タブ) の境・時限の境 = thin /
//   クラスの境・科目と講師の仕切り = hair
// - 隔週コマだけは結合せず 2×2 の素のセルに置き、右上と左下のセルに
//   **右上がりの対角罫 (diagonal.up)** を入れて仕切る (元 xls と同じ)
// - **見出しは wrapText ではなく shrinkToFit** を使う。行の高さは方眼で
//   固定なので、折り返すと溢れた行が黙って消える (CLAUDE.md の
//   「Excel の行の高さはフォントで決まる」と同じ注意)。3 行必要な
//   時刻欄と確認テスト欄だけは、収まるフォントサイズを選んだ上で
//   wrapText を使う
// - 学年の配色はアプリ共通の gradeColor (画面・既存 Excel と同じ)。
//   元 xls の色そのままではなく**アプリの色に揃える**のが方針
//
// 印刷は A3 横 1 ページ収め (fitToPage)。1 シートに全曜日を組むので
// 手動改ページは無く、fitToPage と競合しない (「全曜日」シートで固定
// 倍率を使っている事情はこちらには当てはまらない)。

import ExcelJS from "exceljs";
import { gradeColor } from "../constants/colors";
import {
  CLASS_COLS,
  HEAD_BANDS,
  HEAD_ROWS,
  LABEL_COLS,
  PERIOD_ROWS,
  buildPosterLayout,
  courseLabel,
  gradeLabel,
  periodTimeText,
  posterRowCells,
} from "./posterLayout";
import { classRoomForDay } from "./model";

export const SHEET_NAME = "中学生コース時間割";

// 方眼 1 マスの大きさ (元 xls の実測: 幅 1137/256 文字・高さ 300 twips)
const COL_WIDTH = 4.44;
const ROW_HEIGHT = 15;

// ECMA-376 ST_PaperSize: 8 = A3
const PAPER_SIZE_A3 = 8;

const GOTHIC = "ＭＳ Ｐゴシック";
const MINCHO = "ＭＳ Ｐ明朝";

const ARGB_HEAD_FILL = "FFFFFFCC"; // 見出し列・曜日行の薄い黄
const ARGB_LINE = "FF000000";

const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// "#RRGGBB" → ARGB。不正・null は undefined
const hexToArgb = (hex) =>
  /^#[0-9a-fA-F]{6}$/.test(hex || "") ? `FF${hex.slice(1).toUpperCase()}` : undefined;

const line = (style) => (style ? { style, color: { argb: ARGB_LINE } } : undefined);

/**
 * 1 マスの罫線を **足し込む** (上書きしない)。隣り合う矩形の境は
 * 「右辺」と「左辺」で二度触るので、上書きすると先に引いた線が消える。
 */
function addBorder(ws, row, col, edges) {
  const cell = ws.getCell(row, col);
  const cur = cell.border || {};
  const next = { ...cur };
  for (const [side, style] of Object.entries(edges)) {
    if (!style) continue;
    // 太い方を残す (hair < thin < medium)
    const rank = { hair: 1, thin: 2, medium: 3 };
    const now = cur[side]?.style;
    if (!now || (rank[style] || 0) > (rank[now] || 0)) next[side] = line(style);
  }
  cell.border = next;
}

/**
 * 矩形の外周に罫線を敷く (内側のマスには何も足さない)。
 * @param {{top?, right?, bottom?, left?}} edges 罫線の style ("hair" 等)
 */
function frame(ws, r0, c0, rows, cols, edges) {
  const r1 = r0 + rows - 1;
  const c1 = c0 + cols - 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      addBorder(ws, r, c, {
        top: r === r0 ? edges.top : undefined,
        bottom: r === r1 ? edges.bottom : undefined,
        left: c === c0 ? edges.left : undefined,
        right: c === c1 ? edges.right : undefined,
      });
    }
  }
}

/**
 * 矩形を結合して値を書く。
 *
 * **罫線は結合後に左上のマスへ入れ直す。** exceljs は結合すると従属マスの
 * 書式を左上のマスと共有させるため、結合前に敷いた下地の罫線は消える —
 * 結合範囲の見た目の枠は左上のマスの罫線だけで決まる (2026-08-15)。
 */
function put(ws, r0, c0, rows, cols, value, style = {}) {
  const cell = ws.getCell(r0, c0);
  cell.value = value ?? "";
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    ...(style.alignment || {}),
  };
  if (rows > 1 || cols > 1) ws.mergeCells(r0, c0, r0 + rows - 1, c0 + cols - 1);
  if (style.edges) {
    const b = {};
    for (const [side, s] of Object.entries(style.edges)) {
      if (s) b[side] = line(s);
    }
    cell.border = b;
  }
  return cell;
}

// ─── 表の描画 ───────────────────────────────────────────────────────

const HEAD_LABELS = ["曜  日", "学  年", "コース", "クラス", "教  室"];

/** 表のクラス列を左から数え上げる (罫線の太さを決めるための位置情報付き) */
function tableColumns(table) {
  const cols = [];
  table.days.forEach((dayGroup, di) => {
    dayGroup.blocks.forEach((block, bi) => {
      block.classes.forEach((cls, ci) => {
        cols.push({
          dayGroup,
          block,
          cls,
          firstOfDay: bi === 0 && ci === 0,
          firstOfBlock: ci === 0,
          lastOfDay:
            bi === dayGroup.blocks.length - 1 && ci === block.classes.length - 1,
          lastOfTable:
            di === table.days.length - 1 &&
            bi === dayGroup.blocks.length - 1 &&
            ci === block.classes.length - 1,
        });
      });
    });
  });
  return cols;
}

/**
 * 表の罫線を「線の位置」で持つ。矩形の枠はこの 2 本の配列から引く
 * ので、結合の大小に関わらず同じ線が出る。
 *
 * - vLine[k] = クラス列 k の左に引く線 (k = 0..クラス列数)
 * - hLine[j] = 表の相対行 j の上に引く線 (j = 0..表の行数)
 */
function lineStyles(table) {
  const cols = tableColumns(table);
  const n = cols.length;
  const vLine = new Array(n + 1).fill(undefined);
  vLine[0] = "medium";
  vLine[n] = "medium";
  for (let k = 1; k < n; k++) {
    vLine[k] = cols[k].firstOfDay ? "medium" : cols[k].firstOfBlock ? "thin" : "hair";
  }

  const headRows = HEAD_ROWS * HEAD_BANDS;
  const total = headRows + PERIOD_ROWS * table.periods.length;
  const hLine = new Array(total + 1).fill(undefined);
  hLine[0] = "medium";
  for (let band = 1; band < HEAD_BANDS; band++) hLine[band * HEAD_ROWS] = "thin";
  hLine[headRows] = "medium"; // ヘッダと本体の境
  table.periods.forEach((_, pi) => {
    const base = headRows + pi * PERIOD_ROWS;
    if (pi > 0) hLine[base] = "thin";
    hLine[base + HEAD_ROWS] = "hair"; // 科目と講師の仕切り
  });
  hLine[total] = "medium";
  return { cols, vLine, hLine, headRows, total };
}

/**
 * 表 1 つぶんの座標変換と罫線引き。相対座標 (行 = 表の先頭からの行数、
 * 列 = クラス列の添字) と実座標 (1-based) の橋渡しをする。
 */
function makePen(table, r0, c0) {
  const { cols, vLine, hLine, headRows, total } = lineStyles(table);
  return {
    cols,
    headRows,
    total,
    row: (rel) => r0 + rel,
    col: (idx) => c0 + LABEL_COLS + idx * CLASS_COLS,
    /** クラス列 idx から span 列・相対行 rel から rows 行の矩形の枠 */
    edges: (rel, rows, idx, span) => ({
      top: hLine[rel],
      bottom: hLine[rel + rows],
      left: vLine[idx],
      right: vLine[idx + span],
    }),
    /** 見出し列 (曜日 / 時刻) の矩形の枠 */
    labelEdges: (rel, rows) => ({
      top: hLine[rel],
      bottom: hLine[rel + rows],
      left: "medium",
      right: vLine[0],
    }),
  };
}

/**
 * 内容の無いマスに枠だけ敷く。ここは結合しないので、素のマスの辺に
 * そのまま引く (frame)。内容のあるところは put が結合後に引き直す。
 */
function paintTableGrid(ws, table, pen) {
  const { cols, headRows } = pen;
  const bands = [...Array(HEAD_BANDS).keys()];
  for (const band of bands) {
    frame(ws, pen.row(band * HEAD_ROWS), pen.col(0) - LABEL_COLS, HEAD_ROWS, LABEL_COLS, pen.labelEdges(band * HEAD_ROWS, HEAD_ROWS));
  }
  table.periods.forEach((_, pi) => {
    const rel = headRows + pi * PERIOD_ROWS;
    frame(ws, pen.row(rel), pen.col(0) - LABEL_COLS, PERIOD_ROWS, LABEL_COLS, pen.labelEdges(rel, PERIOD_ROWS));
  });

  cols.forEach((_, k) => {
    for (const band of bands) {
      const rel = band * HEAD_ROWS;
      frame(ws, pen.row(rel), pen.col(k), HEAD_ROWS, CLASS_COLS, pen.edges(rel, HEAD_ROWS, k, 1));
    }
    table.periods.forEach((_, pi) => {
      const rel = headRows + pi * PERIOD_ROWS;
      // 科目 (上 2 行) と講師 (下 2 行)
      frame(ws, pen.row(rel), pen.col(k), HEAD_ROWS, CLASS_COLS, pen.edges(rel, HEAD_ROWS, k, 1));
      frame(
        ws,
        pen.row(rel + HEAD_ROWS),
        pen.col(k),
        HEAD_ROWS,
        CLASS_COLS,
        pen.edges(rel + HEAD_ROWS, HEAD_ROWS, k, 1)
      );
    });
  });
}

/** 同じ値が続くクラス列をまとめる (学年行・コース行の結合) */
function runsOf(cols, keyOf) {
  const runs = [];
  cols.forEach((col, i) => {
    const key = keyOf(col);
    const last = runs[runs.length - 1];
    // 曜日をまたいで結合しない (曜日の境は紙面の区切り)
    if (last && last.key === key && last.dayGroup === col.dayGroup) {
      last.len += 1;
      return;
    }
    runs.push({ key, start: i, len: 1, dayGroup: col.dayGroup, col });
  });
  return runs;
}

function writeTableHeader(ws, table, pen) {
  const cols = pen.cols;
  const headFont = { name: GOTHIC, size: 12, bold: true };
  const bodyFont = { name: GOTHIC, size: 11 };
  const shrink = { shrinkToFit: true };

  HEAD_LABELS.forEach((label, band) => {
    // クラス名の無い表 (附中など) は「クラス」段と「教室」段を 1 つに畳む
    if (!table.showClassRow && band === 3) return;
    const collapsed = !table.showClassRow && band === 4;
    const rel = (collapsed ? 3 : band) * HEAD_ROWS;
    const rows = HEAD_ROWS * (collapsed ? 2 : 1);
    put(ws, pen.row(rel), pen.col(0) - LABEL_COLS, rows, LABEL_COLS, label, {
      font: headFont,
      fill: solidFill(ARGB_HEAD_FILL),
      alignment: shrink,
      edges: pen.labelEdges(rel, rows),
    });
  });

  // 曜日 (その曜日のクラス列すべてに掛かる)
  let idx = 0;
  for (const dayGroup of table.days) {
    const len = dayGroup.classCount;
    put(ws, pen.row(0), pen.col(idx), HEAD_ROWS, CLASS_COLS * len, `${dayGroup.day}曜日`, {
      font: headFont,
      fill: solidFill(ARGB_HEAD_FILL),
      alignment: shrink,
      edges: pen.edges(0, HEAD_ROWS, idx, len),
    });
    idx += len;
  }

  // 学年 / コース (同じ値が続く列をまとめる)
  for (const run of runsOf(cols, (c) => gradeLabel(c.block.tab))) {
    const tone = gradeColor(run.key || "");
    put(
      ws,
      pen.row(HEAD_ROWS),
      pen.col(run.start),
      HEAD_ROWS,
      CLASS_COLS * run.len,
      run.key,
      {
        font: { ...headFont, color: { argb: hexToArgb(tone.f) || "FF000000" } },
        fill: solidFill(hexToArgb(tone.b) || "FFFFFFFF"),
        alignment: shrink,
        edges: pen.edges(HEAD_ROWS, HEAD_ROWS, run.start, run.len),
      }
    );
  }
  for (const run of runsOf(cols, (c) => courseLabel(c.block.tab))) {
    put(
      ws,
      pen.row(HEAD_ROWS * 2),
      pen.col(run.start),
      HEAD_ROWS,
      CLASS_COLS * run.len,
      run.key,
      {
        font: headFont,
        alignment: shrink,
        edges: pen.edges(HEAD_ROWS * 2, HEAD_ROWS, run.start, run.len),
      }
    );
  }

  // クラス / 教室
  cols.forEach((col, i) => {
    const room = classRoomForDay(col.cls, col.dayGroup.day);
    if (table.showClassRow) {
      put(ws, pen.row(HEAD_ROWS * 3), pen.col(i), HEAD_ROWS, CLASS_COLS, col.cls.label || "", {
        font: { ...headFont, bold: false },
        alignment: shrink,
        edges: pen.edges(HEAD_ROWS * 3, HEAD_ROWS, i, 1),
      });
      put(ws, pen.row(HEAD_ROWS * 4), pen.col(i), HEAD_ROWS, CLASS_COLS, room, {
        font: bodyFont,
        alignment: shrink,
        edges: pen.edges(HEAD_ROWS * 4, HEAD_ROWS, i, 1),
      });
    } else {
      put(ws, pen.row(HEAD_ROWS * 3), pen.col(i), HEAD_ROWS * 2, CLASS_COLS, room, {
        font: bodyFont,
        alignment: shrink,
        edges: pen.edges(HEAD_ROWS * 3, HEAD_ROWS * 2, i, 1),
      });
    }
  });
}

/**
 * 同じ曜日の同じ時限で、**中身がまったく同じブロックセル (確認テストなど)
 * が隣り合っている**ときに 1 つへまとめる。
 *
 * 合同コマ (mergedColumns) は 1 つの学年タブの中でしか表現できないが、
 * 紙面の確認テストは「附中の中1・中2・中3」のように学年をまたいで 1 枠に
 * なる。学年ごとに同じ内容を入れておけば紙面では 1 枠に見える、という
 * 逃げ道をここで用意する。**中身が 1 文字でも違えば結合しない** ので、
 * 別の担任・別の教室が黙って 1 つにされることはない。
 *
 * @param {{kind: string, idx: number, colSpan: number, lines?: string[]}[]} items
 *   同じ曜日ぶんを左から順に並べたもの
 */
export function coalesceBlocks(items) {
  const sorted = [...items].sort((a, b) => a.idx - b.idx);
  const out = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    const sameBlock =
      last &&
      last.kind === "block" &&
      item.kind === "block" &&
      last.idx + last.colSpan === item.idx &&
      last.lines.join("\n") === item.lines.join("\n");
    if (sameBlock) last.colSpan += item.colSpan;
    else out.push({ ...item });
  }
  return out;
}

function writeTableBody(ws, table, pen) {
  const { headRows } = pen;
  const timeFont = { name: GOTHIC, size: 11 };
  const subjFont = { name: GOTHIC, size: 11 };
  const teacherFont = { name: MINCHO, size: 11 };
  // 確認テストのブロックは 3〜4 行入る。方眼 4 行 = 60pt に対し、
  // 10pt なら行送り 17pt × 3 行 = 51pt で収まる (溢れた行は黙って消える)
  const blockFont = { name: GOTHIC, size: 10 };

  // クラス列の位置を (曜日 → タブ) から引けるようにする
  const offsetOf = new Map();
  {
    let k = 0;
    for (const dayGroup of table.days) {
      for (const block of dayGroup.blocks) {
        offsetOf.set(block, k);
        k += block.classes.length;
      }
    }
  }

  table.periods.forEach((per, pi) => {
    const rel = headRows + pi * PERIOD_ROWS;
    put(
      ws,
      pen.row(rel),
      pen.col(0) - LABEL_COLS,
      PERIOD_ROWS,
      LABEL_COLS,
      periodTimeText(per),
      {
        font: timeFont,
        fill: solidFill(ARGB_HEAD_FILL),
        alignment: { wrapText: true },
        edges: pen.labelEdges(rel, PERIOD_ROWS),
      }
    );

    for (const dayGroup of table.days) {
      const items = [];
      for (const block of dayGroup.blocks) {
        if (!(block.tab.periodIds || []).includes(per.id)) continue;
        const base = offsetOf.get(block);
        for (const it of posterRowCells(block, per.id)) {
          items.push({ ...it, idx: base + it.startIdx });
        }
      }
      for (const item of coalesceBlocks(items)) {
        const { idx, colSpan: span } = item;
        const w = CLASS_COLS * span;
        if (item.kind === "block") {
          put(ws, pen.row(rel), pen.col(idx), PERIOD_ROWS, w, item.lines.join("\n"), {
            font: blockFont,
            alignment: { wrapText: true },
            edges: pen.edges(rel, PERIOD_ROWS, idx, span),
          });
        } else if (item.kind === "biweekly") {
          // 隔週は結合しないので下地の枠をそのまま使う
          writeBiweekly(ws, pen.row(rel), pen.col(idx), w, item, subjFont, teacherFont);
        } else {
          put(ws, pen.row(rel), pen.col(idx), HEAD_ROWS, w, item.subject, {
            font: subjFont,
            alignment: { shrinkToFit: true },
            edges: pen.edges(rel, HEAD_ROWS, idx, span),
          });
          put(ws, pen.row(rel + HEAD_ROWS), pen.col(idx), HEAD_ROWS, w, item.teacher, {
            font: teacherFont,
            alignment: { shrinkToFit: true },
            edges: pen.edges(rel + HEAD_ROWS, HEAD_ROWS, idx, span),
          });
        }
      }
    }
  });
}

/**
 * 隔週コマ: 2×2 の素のセルを右上がりの対角罫で仕切り、
 * 左上 = A 週 (講師欄の主担当) / 右下 = B 週 (note のパートナー) を置く。
 * **A/B の向きは CLAUDE.md「隔週コマの担当週」の定義に従う。**
 */
function writeBiweekly(ws, pr, cc, w, item, subjFont, teacherFont) {
  const right = cc + w - 1;
  const diag = { up: true, down: false, style: "hair", color: { argb: ARGB_LINE } };
  const pairs = [
    { row: pr, a: item.subjectA, b: item.subjectB, font: subjFont },
    { row: pr + HEAD_ROWS, a: item.teacherA, b: item.teacherB, font: teacherFont },
  ];
  for (const { row, a, b, font } of pairs) {
    // 左上 = A 週
    const cellA = ws.getCell(row, cc);
    cellA.value = a;
    cellA.font = font;
    cellA.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
    // 右下 = B 週
    const cellB = ws.getCell(row + 1, right);
    cellB.value = b;
    cellB.font = font;
    cellB.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
    // 対角罫は右上と左下のマスに入れて 1 本の「／」に見せる
    for (const [r, c] of [
      [row, right],
      [row + 1, cc],
    ]) {
      const cell = ws.getCell(r, c);
      cell.border = { ...(cell.border || {}), diagonal: diag };
    }
  }
}

// ─── ワークブック ───────────────────────────────────────────────────

/**
 * 掲示用ワークブックを組む (ダウンロードはしない — テストから呼べる)。
 * @param {object} project RegularProject
 * @param {{days?: string[], title?: string, dateLabel?: string,
 *          maxGridCols?: number}} [opts]
 * @returns {{workbook: ExcelJS.Workbook, layout: object}}
 */
export function buildPosterWorkbook(project, opts = {}) {
  const layout = buildPosterLayout(project, opts);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(SHEET_NAME, {
    pageSetup: {
      paperSize: PAPER_SIZE_A3,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
    },
    views: [{ showGridLines: false }],
  });

  const gridCols = Math.max(layout.gridCols, 12);
  for (let c = 1; c <= gridCols; c++) ws.getColumn(c).width = COL_WIDTH;
  for (let r = 1; r <= layout.gridRows + 1; r++) ws.getRow(r).height = ROW_HEIGHT;

  // タイトル (方眼 2 行ぶん) と注記
  put(ws, 1, 1, 2, gridCols, layout.title, {
    font: { name: GOTHIC, size: 16, bold: true },
  });
  if (layout.note) {
    put(ws, 3, 1, 1, Math.min(gridCols, 14), layout.note, {
      font: { name: GOTHIC, size: 10 },
      alignment: { horizontal: "left" },
    });
  }

  for (const table of layout.tables) {
    const pen = makePen(table, table.row0 + 1, table.col0 + 1);
    paintTableGrid(ws, table, pen);
    writeTableHeader(ws, table, pen);
    writeTableBody(ws, table, pen);
  }

  return { workbook, layout };
}

const fmtDateLabel = (now) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const safeProjectName = (project) =>
  (project.name || "通常時間割").replace(/[\\/:*?"<>|]/g, "_").trim() || "通常時間割";

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
 * @param {{project: object, days?: string[], title?: string, now?: Date}} params
 * @returns {Promise<{tables: number, dayCount: number}>} 通知の文面に使う内訳
 */
export async function downloadPosterExcel({
  project,
  days,
  title,
  now = new Date(),
}) {
  const { workbook, layout } = buildPosterWorkbook(project, { days, title });
  if (layout.tables.length === 0) {
    throw new Error("中学生のコマがありません（学年に「高」を含むタブは対象外です）");
  }
  const dateLabel = fmtDateLabel(now);
  await downloadWorkbook(
    workbook,
    `中学生コース時間割_${safeProjectName(project)}_${dateLabel}.xlsx`
  );
  return {
    tables: layout.tables.length,
    dayCount: new Set(layout.tables.flatMap((t) => t.days.map((d) => d.day))).size,
  };
}
