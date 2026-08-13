// ─── 通常時間割の Excel 出力 (RB22) ─────────────────────────────────
// 2 種類の workbook を作る:
// - 曜日グリッド (buildRegularWorkbook): 画面の曜日ビュー (セクション別
//   テーブル) を再現。曜日 1 つ = 1 シート (B4 横・1 ページ収め) + 末尾に
//   全曜日を 1 枚にまとめた「全曜日」シート (曜日ごとに改ページ)。
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
// 紙面は「画面をそのまま Excel に写す」のが要件 (2026-08-12)。画面の
// 曜日ビューと同じものを同じ見え方で出す:
// - セクション見出しは部の色 (sectionTone の accent) + 右肩にコマ数
// - 学年の見出しは学年色 (gradeColor)、クラス見出しは「ラベル + 教室(小)」
// - 時限見出しは「ラベル(太) + 時刻(小・グレー)」の 2 段
// - セルは科目カラーの背景 + 「科目(太) / 講師(青) / 教室・備考(小灰)」の
//   3 段 (exceljs の richText で 1 セル内に字づかいを混在させる)
// - 合同 (範囲・列挙ラベル) のコマは画面と同じく構成クラスの上に
//   セル結合で被せる (配置は mergedColumns.computeRowCells を画面と共有)
// - 学年の境目には太い縦罫 (画面の border-l-2 に相当)
//
// 割り切り (紙面要件):
// - 「🏫 亀井町を分ける」は画面のトグル状態に従う (見たまま)
// - セルが 1 つも無い時限行・クラス列・曜日シートは常に出力しない
//   (画面の「▤ 空行・空列を隠す」トグルとは独立に、紙面では常に省く)
// - 隔週コマは講師欄に「主担当 / パートナー」で載せる (画面と同じ)
// - 教室はセルに上書きがあるときと合同セルのときだけセルに出す (画面と
//   同じ。既定の教室はクラス見出しに出ているのでセルには繰り返さない)
// - 行の高さは中身から見積もる (estimateRowHeight)。折り返しの回数は
//   列幅とフォントサイズから概算する
//
// 印刷設定の使い分け (重要):
// - 曜日別シートは 1 シート = 1 曜日なので Excel の「1 ページに収める」
//   (fitToPage 1×1) をそのまま使う — 拡大率は Excel が実測で決める。
// - 「全曜日」シートは曜日ごとの改ページ (手動改ページ) が主役だが、
//   **Excel は fitToPage を有効にすると手動改ページを無視する**。そのため
//   こちらは fitToPage を使わず、estimatePrintScale で見積もった固定
//   倍率 (scale) を入れる。倍率は全曜日で共通なので紙面の字の大きさも揃う。
// - 「全曜日」だけ **A3 横** (曜日別は B4 横のまま)。固定倍率なので紙が
//   大きいほど字が大きく刷れる — 実測で B4 横 77% → A3 横 90% になり、
//   全曜日を 1 枚ずつ並べて見るときの可読性が上がる。曜日別シートは
//   fitToPage で Excel が実測して収めるため B4 で十分。

import ExcelJS from "exceljs";
import {
  biweeklyPartner,
  formatBiweeklyTeacher,
  splitTeacherField,
} from "../utils/biweekly";
import { getSubjectColor } from "../timetable-builder/utils/constants";
import { gradeColor } from "../constants/colors";
import {
  classRoomForDay,
  computeSections,
  makeCellKey,
  parseCellKey,
} from "./model";
import {
  computeMergeLayout,
  computeRowCells,
  mergeFallback,
  visibleClassesForDay,
} from "./mergedColumns";
import { sectionTone } from "./sectionTone";
import { computeClassSubjectLoad } from "./classLoad";
import { computeTeacherLoad, computeTeacherWeek, formatMinutes } from "./teacherLoad";

const ARGB_GRAY_BORDER = "FFAAAAAA";
const ARGB_HEADER_BLUE = "FF4472C4";
const ARGB_HEAD_GRAY = "FFF2F2F2";
// 画面 (bg-builder-bg) と同じ、学年が使わない時限の塞ぎ色
const ARGB_BLOCKED_GRAY = "FFF0F1F3";

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

// ─── 紙面 (B4 横) と行・列の寸法 ────────────────────────────────────
// ECMA-376 ST_PaperSize: 12 = B4 (JIS, 257 × 364 mm)。exceljs の PaperSize
// enum に B4 は無いが runtime は数値をそのまま書き出す (講習の
// applyTeacherPrintDefaults と同じ扱い)。
const PAPER_SIZE_B4 = 12;
// 「全曜日」シートだけ A3。fitToPage が使えず固定倍率で収めるため、紙が
// 大きいほど字が大きく刷れる (B4 横 364×257 → A3 横 420×297 で約 1.15 倍)。
const PAPER_SIZE_A3 = 8;

/** 全曜日をまとめたシートの名前 (呼び出し側の有無判定にも使う) */
const ALL_DAYS_SHEET_NAME = "全曜日";

const DAY_SHEET_MARGINS = {
  left: 0.4,
  right: 0.4,
  top: 0.5,
  bottom: 0.5,
  header: 0.2,
  footer: 0.2,
};

// 用紙寸法 (inch)。scale の見積りに使う
const B4_LANDSCAPE_IN = { width: 364 / 25.4, height: 257 / 25.4 };
const A3_LANDSCAPE_IN = { width: 420 / 25.4, height: 297 / 25.4 };

const COL_WIDTH_TIME = 12; // 「時間」列
const COL_WIDTH_CLASS = 15; // クラス列
const ROW_HEIGHT_DEFAULT = 15; // タイトル・空行 (pt)
const ROW_HEIGHT_BAR = 20; // セクション見出しバー (pt, 11pt の 1 行ぶん)
const ROW_HEIGHT_TAB = 22; // 学年見出し (pt, 11pt の 1 行ぶん)
const ROW_HEIGHT_CLASS = 16; // クラス見出しの下限 (pt。実際は中身から算出)
const ROW_HEIGHT_PERIOD_MIN = 30; // 時限行の下限 (pt)

// ─── 画面 (RegularGrid / RegularCell) と同じ字づかい ────────────────
// 1 セルの中で「科目 / 講師 / 教室・備考」を書き分けるため、行ごとに
// フォントを変えられる richText で書く。色は tailwind.config.js の
// builder-* トークンと同じ値。
const ARGB_INK = "FF1A1A2E"; // builder-ink (科目)
const ARGB_TEACHER = "FF2E6A9E"; // builder-blue (講師)
const ARGB_SUB = "FF666666"; // builder-ink-muted (教室・備考)

const LINE_FONT = {
  // セル (科目 / 講師 / 教室・備考)
  subj: { size: 10, bold: true, color: { argb: ARGB_INK } },
  teacher: { size: 9, color: { argb: ARGB_TEACHER } },
  sub: { size: 8, color: { argb: ARGB_SUB } },
  // 見出し。行高の見積りをセルと同じ関数で回すため同じ表に置く
  periodLabel: { size: 9, bold: true, color: { argb: ARGB_INK } },
  periodTime: { size: 8, color: { argb: ARGB_SUB } },
  // 時限ラベル未設定 (取込直後など) で時刻だけを見出しにするとき
  periodTimeOnly: { size: 9, color: { argb: ARGB_INK } },
  clsLabel: { size: 10, bold: true, color: { argb: ARGB_INK } },
  clsRoom: { size: 8, color: { argb: ARGB_SUB } },
};
/**
 * 1 行が占める高さ (pt) = フォントサイズ × この係数。
 *
 * **Excel の行送りはフォントで決まる**。日本語環境の既定である游ゴシックは
 * 標準の行の高さが 11pt → 18.75pt (= 1.7 倍) と広く、MS P ゴシックのような
 * 古いフォントは 1.25 倍程度しかない。行高が足りないと **wrapText の溢れた
 * 行は紙面から消える** (省略記号も出ない) ので、広い側 (游ゴシック) に
 * 合わせておく。行間の詰まったフォントでは行が少し余るだけで済む。
 * 「行が間延びする」場合はこの係数を下げて調整する。
 */
const LINE_HEIGHT_RATIO = 1.7;
const CELL_PADDING_PT = 3;

const lineHeightPt = (kind) => LINE_FONT[kind].size * LINE_HEIGHT_RATIO;

const MEDIUM_EDGE = { style: "medium", color: { argb: "FF666666" } };
// 学年グループの境目に引く縦罫 (画面の border-l-2 に相当)
const GROUP_LEFT_BORDER = { ...THIN_BORDER, left: MEDIUM_EDGE };

// 文字列の表示幅 (px, 96dpi)。全角 = フォントサイズぶん (1em)、半角 = 半分
const textWidthPx = (text, size) =>
  ([...String(text || "")].reduce(
    (n, ch) => n + (ch.charCodeAt(0) > 0xff ? size : size / 2),
    0
  ) *
    96) /
  72;

// 列の中で文字が使える幅 (px)。Excel の列幅 w は既定フォントの半角文字数
// で、列の実寸は w*7+5 px。左右の余白ぶん (5px) は文字に使えない
const usableWidthPx = (width) => Math.max(1, width * 7);

/**
 * セル 1 つ分の高さ (pt) を中身から見積もる純関数。
 * 各行が列幅に何回折り返すかを文字幅から数え、行送り (LINE_HEIGHT_RATIO)
 * を掛けて積み上げる。
 * @param {{kind: string, text: string}[]} lines cellLines の結果
 * @param {number} width 列幅 (結合セルは合算した幅)
 */
export function estimateCellHeight(lines, width) {
  const avail = usableWidthPx(width);
  let h = CELL_PADDING_PT;
  for (const ln of lines) {
    const rows = Math.max(
      1,
      Math.ceil(textWidthPx(ln.text, LINE_FONT[ln.kind].size) / avail)
    );
    h += rows * lineHeightPt(ln.kind);
  }
  return h;
}

/**
 * 時限行の高さ (pt)。行に並ぶセルの中で最も背の高いものに合わせる。
 * **時間見出しの列も渡すこと** — 長い時限ラベル (「第1回 確認テスト」など)
 * が折り返す行で本文だけを見て高さを決めると、時刻の行が紙面で切れる。
 * @param {{lines: {kind: string, text: string}[], width: number}[]} cells
 */
export function estimateRowHeight(cells) {
  return Math.max(
    ROW_HEIGHT_PERIOD_MIN,
    ...(cells || []).map((c) => estimateCellHeight(c.lines, c.width))
  );
}

/**
 * クラス見出し行の高さ (pt)。ラベルと教室は 1 行に並ぶので幅は合算で数える
 * (取込した高校の講座列など、長いラベルが折り返しても切れないように)。
 * @param {{label?: string, room?: string}[]} heads
 */
export function estimateClassHeadHeight(heads) {
  const avail = usableWidthPx(COL_WIDTH_CLASS);
  return Math.max(
    ROW_HEIGHT_CLASS,
    ...(heads || []).map((h) => {
      const px =
        textWidthPx(h.label, LINE_FONT.clsLabel.size) +
        (h.room ? textWidthPx(` ${h.room}`, LINE_FONT.clsRoom.size) : 0);
      const rows = Math.max(1, Math.ceil(px / avail));
      return CELL_PADDING_PT + rows * lineHeightPt("clsLabel");
    })
  );
}

// 曜日別シート: B4 横に丸ごと 1 ページで収める (Excel 側の実測スケール)
function applyDaySheetPrintDefaults(pageSetup) {
  return {
    paperSize: PAPER_SIZE_B4,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: DAY_SHEET_MARGINS,
    ...pageSetup,
  };
}

/**
 * 「全曜日」シートの印刷倍率 (%) を見積もる純関数。
 * fitToPage は手動改ページを無効にしてしまうため、こちらは固定倍率で
 * 収める。列幅 (Excel の文字数単位) は px ≈ width * 7 + 5、行高は pt。
 * 幅は全曜日共通の列構成、高さは「最も背の高い曜日ブロック」で測り、
 * 小さい方の比率を採る。拡大はしない (上限 100%)。
 * @param {{colWidths: number[], blockHeightsPt: number[],
 *          paper?: {width: number, height: number},
 *          margins?: {left: number, right: number, top: number, bottom: number}}} args
 * @returns {number} 10〜100 の整数
 */
export function estimatePrintScale({
  colWidths,
  blockHeightsPt,
  paper = B4_LANDSCAPE_IN,
  margins = DAY_SHEET_MARGINS,
}) {
  // 見積りと Excel の実レンダリングのズレ (フォントメトリクス・罫線) を
  // 吸収する余裕。これを入れないと端の 1 列が次ページへこぼれる
  const SAFETY = 0.95;
  const availWidth = paper.width - margins.left - margins.right;
  const availHeight = paper.height - margins.top - margins.bottom;
  const neededWidth =
    (colWidths || []).reduce((n, w) => n + w * 7 + 5, 0) / 96; // px → inch
  const neededHeight = Math.max(0, ...(blockHeightsPt || [0])) / 72; // pt → inch
  const ratios = [];
  if (neededWidth > 0) ratios.push(availWidth / neededWidth);
  if (neededHeight > 0) ratios.push(availHeight / neededHeight);
  if (ratios.length === 0) return 100;
  const scale = Math.floor(Math.min(...ratios) * SAFETY * 100);
  return Math.max(10, Math.min(100, scale));
}

// ─── シートデータの収集 (純粋関数、テスト用に export) ───────────────
/**
 * 曜日 1 つ分のセクション構造を出力用に解決する。
 * セクション分割・列の並び・合同列の結合レイアウトは画面 (RegularGrid の
 * sections useMemo) と同一。その曜日にセルが 1 つも無いクラス列・時限行は
 * 落とす (画面の「空行・空列を隠す」を紙面では常に効かせる)。
 * @returns {{
 *   name: string,
 *   tone: {b: string, f: string, accent: string},
 *   cellCount: number,
 *   periods: {id, label, time}[],
 *   groups: {tab, layout, classes: object[]}[],
 *   cols: {tab, cls}[],
 * }[]}
 *   groups = 学年ごとの列のまとまり (classes = 見出しに出る列。合同列は
 *   結合表示するので見出しには出ない。fallback の学年だけ全列が並ぶ)
 */
export function collectDaySheet(project, day, { splitCampus = true } = {}) {
  return computeSections(project, day, { splitCampus })
    .map((s) => {
      const tabs = s.tabs
        .map((t) => ({ ...t, classes: visibleClassesForDay(t, day) }))
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
      const groups = tabs.map((t) => {
        const layout = computeMergeLayout(t);
        const fallback = mergeFallback(t, day, periods, layout);
        return {
          tab: t,
          layout: { ...layout, fallback },
          // 結合表示できないデータの学年は従来どおり全列を独立で並べる
          classes: fallback ? t.classes : layout.visible,
        };
      });
      const cols = groups.flatMap((g) =>
        g.classes.map((cls) => ({ tab: g.tab, cls }))
      );
      const cellCount = tabs.reduce(
        (n, t) =>
          n +
          Object.keys(t.schedule || {}).filter((k) => {
            const pos = parseCellKey(k);
            return (
              pos.day === day &&
              (t.periodIds || []).includes(pos.periodId) &&
              t.classes.some((c) => c.id === pos.classId)
            );
          }).length,
        0
      );
      return { name: s.name, tone: sectionTone(tabs), cellCount, periods, groups, cols };
    })
    .filter((s) => s.periods.length > 0 && s.cols.length > 0);
}

/**
 * セルの表示内容を行に分ける (画面の RegularCell と同じ組み立て)。
 * 教室はセル上書きがあるときだけ出す — 既定の教室はクラス見出しに
 * 出ているため。合同セルだけは列見出しを持たないので、呼び出し側が
 * roomFallback にその曜日の実効教室を渡して補う。
 * @returns {{kind: "subj"|"teacher"|"sub", text: string}[]}
 */
export function cellLines(cell, roomFallback = "") {
  if (!cell) return [];
  const lines = [];
  if (cell.subj) lines.push({ kind: "subj", text: cell.subj });
  if (cell.teacher)
    lines.push({
      kind: "teacher",
      text: formatBiweeklyTeacher(cell.teacher, cell.note),
    });
  const sub = [(cell.room || "").trim() || roomFallback, (cell.note || "").trim()]
    .filter(Boolean)
    .join(" ");
  if (sub) lines.push({ kind: "sub", text: sub });
  return lines;
}

/** cellLines を exceljs の richText に変換する (空なら null) */
function toRichText(lines) {
  if (lines.length === 0) return null;
  return {
    richText: lines.map((ln, i) => ({
      font: LINE_FONT[ln.kind],
      text: (i === 0 ? "" : "\n") + ln.text,
    })),
  };
}

/** 曜日ブロックの列数 (時間列 + 最大クラス列) */
const dayBlockCols = (sections) =>
  Math.max(...sections.map((s) => s.cols.length)) + 1;

// 列方向に結合したセルを作って master を返す (colSpan が 1 なら普通のセル)。
// **exceljs の結合セルは範囲全体で 1 つの style を共有する** (覆われた
// 側に border を書くと master の分まで上書きされる) ので、罫線は master に
// 1 回だけ入れる。Excel は結合の内側に罫線を描かないため、これで範囲の
// 外周だけが引かれる (左端 = 太罫、右端 = 細罫、といった指定がそのまま出る)。
// border に null を渡すと罫線なし (セクション見出しバー用)。
function mergedCell(ws, row, col, colSpan, border) {
  if (colSpan > 1) ws.mergeCells(row, col, row, col + colSpan - 1);
  const cell = ws.getCell(row, col);
  if (border) cell.border = border;
  return cell;
}

// セクション見出しバー (画面の部バー): 部の色 + 右肩にコマ数。
// 罫線は引かない — 名前とコマ数は別セルなので、罫線を引くとバーが
// 途中で切れて見える (画面のバーは 1 本の帯)
function writeSectionBar(ws, s, row, lastCol) {
  const fill = solidFill(hexToArgb(s.tone.accent) || ARGB_HEADER_BLUE);
  const head = mergedCell(ws, row, 1, Math.max(1, lastCol - 1), null);
  head.value = s.name;
  head.font = { size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.fill = fill;
  const count = ws.getCell(row, lastCol);
  count.value = `${s.cellCount}コマ`;
  count.font = { size: 8, color: { argb: "FFFFFFFF" } };
  count.alignment = { vertical: "middle", horizontal: "right" };
  count.fill = fill;
  ws.getRow(row).height = ROW_HEIGHT_BAR;
}

// 列見出し 2 段 (学年 = 学年色 / クラス = ラベル + 教室の小文字)。
// @returns {number} 2 段ぶんの高さ (pt)
function writeSectionHead(ws, s, day, tabRow) {
  const clsRow = tabRow + 1;
  const corner = ws.getCell(tabRow, 1);
  corner.value = "時間";
  corner.font = { size: 9, bold: true, color: { argb: ARGB_SUB } };
  corner.alignment = { vertical: "middle", horizontal: "center" };
  corner.fill = solidFill(ARGB_HEAD_GRAY);
  ws.mergeCells(tabRow, 1, clsRow, 1);
  corner.border = { ...THIN_BORDER, bottom: MEDIUM_EDGE };

  let c = 2;
  const heads = [];
  s.groups.forEach((g, gi) => {
    const span = g.classes.length;
    const edge = gi > 0 ? GROUP_LEFT_BORDER : THIN_BORDER;
    const gc = gradeColor(g.tab.grade || g.tab.name);
    const th = mergedCell(ws, tabRow, c, span, edge);
    th.value = g.tab.name;
    th.font = { size: 11, bold: true, color: { argb: hexToArgb(gc.f) || ARGB_INK } };
    th.alignment = { vertical: "middle", horizontal: "center" };
    const bg = hexToArgb(gc.b);
    if (bg) th.fill = solidFill(bg);

    g.classes.forEach((cls, ci) => {
      const cell = ws.getCell(clsRow, c + ci);
      // クラス名の無い列 (取込した高校の講座列など) は教室名を見出しに
      const room = classRoomForDay(cls, day);
      const label = cls.label || room || "－";
      const subRoom = cls.label && room && room !== cls.label ? room : "";
      heads.push({ label, room: subRoom });
      const parts = [{ font: LINE_FONT.clsLabel, text: label }];
      if (subRoom) parts.push({ font: LINE_FONT.clsRoom, text: ` ${subRoom}` });
      cell.value = { richText: parts };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = solidFill(ARGB_HEAD_GRAY);
      cell.border = {
        ...(ci === 0 ? edge : THIN_BORDER),
        bottom: MEDIUM_EDGE, // 見出しと本体の境 (画面の border-b)
      };
    });
    c += span;
  });
  const clsHeight = estimateClassHeadHeight(heads);
  ws.getRow(tabRow).height = ROW_HEIGHT_TAB;
  ws.getRow(clsRow).height = clsHeight;
  return ROW_HEIGHT_TAB + clsHeight;
}

// 時限 1 行 (時間見出し + 各学年のセル)。行の高さは中身から見積もる
function writePeriodRow(ws, s, day, per, row, subjectColor) {
  const timeCell = ws.getCell(row, 1);
  // ラベル未設定 (取込直後など) は時刻だけを見出しにする (画面と同じ)
  const timeLines = per.label
    ? [
        { kind: "periodLabel", text: per.label },
        ...(per.time ? [{ kind: "periodTime", text: per.time }] : []),
      ]
    : per.time
      ? [{ kind: "periodTimeOnly", text: per.time }]
      : [];
  timeCell.value = toRichText(timeLines);
  timeCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  timeCell.fill = solidFill(ARGB_HEAD_GRAY);
  timeCell.border = THIN_BORDER;

  // 行高の見積りには時間見出しも入れる (長いラベルで時刻が切れないように)
  const measured = [{ lines: timeLines, width: COL_WIDTH_TIME }];
  let c = 2;
  s.groups.forEach((g, gi) => {
    const edge = gi > 0 ? GROUP_LEFT_BORDER : THIN_BORDER;
    const span = g.classes.length;
    if (!(g.tab.periodIds || []).includes(per.id)) {
      // この学年が使わない時限 (時刻体系の違い) は画面と同じくグレーで塞ぐ
      mergedCell(ws, row, c, span, edge).fill = solidFill(ARGB_BLOCKED_GRAY);
      c += span;
      return;
    }
    // 合同コマの結合配置は画面と共有 (computeRowCells)
    const rowCells = g.layout.fallback
      ? g.classes.map((cls, i) => ({ cls, colSpan: 1, isRange: false, first: i === 0 }))
      : computeRowCells(g.tab, day, per.id, g.layout);
    for (const rc of rowCells) {
      const cell = g.tab.schedule[makeCellKey(day, per.id, rc.cls.id)];
      // 合同セルは列見出しを持たないので既定教室を自分で出す (画面と同じ)
      const lines = cellLines(cell, rc.isRange ? classRoomForDay(rc.cls, day) : "");
      const width = COL_WIDTH_CLASS * rc.colSpan;
      const target = mergedCell(ws, row, c, rc.colSpan, rc.first ? edge : THIN_BORDER);
      target.value = toRichText(lines);
      target.alignment = { vertical: "top", wrapText: true };
      const argb = cell?.subj ? hexToArgb(subjectColor(cell.subj)) : undefined;
      if (argb) target.fill = solidFill(argb);
      measured.push({ lines, width });
      c += rc.colSpan;
    }
  });
  const height = estimateRowHeight(measured);
  ws.getRow(row).height = height;
  return height;
}

/**
 * 曜日 1 つ分の表 (タイトル + セクション群) を ws の startRow から書き込む。
 * 曜日別シートと「全曜日」シートで共用する。
 * @returns {{nextRow: number, lastRow: number, heightPt: number}}
 *   lastRow = このブロックの最終行 (「全曜日」の改ページを打つ行)
 */
function writeDayBlock(
  ws,
  project,
  day,
  sections,
  dateLabel,
  startRow,
  subjectColor = getSubjectColor
) {
  const maxCols = dayBlockCols(sections);
  // タイトル行 + 空行
  let row = startRow;
  let heightPt = ROW_HEIGHT_DEFAULT * 2;
  ws.mergeCells(row, 1, row, maxCols);
  const title = ws.getCell(row, 1);
  title.value = `${project.name || "通常時間割"} — ${day}曜日（出力: ${dateLabel}）`;
  title.font = { size: 13, bold: true };
  row += 2;

  for (const s of sections) {
    // セクション見出しバー + 区切りの空行 (列見出し 2 段は実測を足す)
    heightPt += ROW_HEIGHT_BAR + ROW_HEIGHT_DEFAULT;
    writeSectionBar(ws, s, row, s.cols.length + 1);
    row++;
    heightPt += writeSectionHead(ws, s, day, row);
    row += 2;
    for (const per of s.periods) {
      heightPt += writePeriodRow(ws, s, day, per, row, subjectColor);
      row++;
    }
    row++; // セクション間の空行
  }
  return { nextRow: row, lastRow: row - 1, heightPt };
}

/** 曜日ブロック用に列幅を設定する (時間列 + クラス列) */
function setDayColumnWidths(ws, maxCols) {
  ws.getColumn(1).width = COL_WIDTH_TIME;
  for (let c = 2; c <= maxCols; c++) ws.getColumn(c).width = COL_WIDTH_CLASS;
}

// 曜日 1 つ = 1 シート (B4 横・1 ページ収め)
function buildDaySheet(workbook, project, day, sections, dateLabel, subjectColor) {
  const maxCols = dayBlockCols(sections);
  const ws = workbook.addWorksheet(`${day}曜`, {
    pageSetup: applyDaySheetPrintDefaults(),
    properties: { defaultRowHeight: ROW_HEIGHT_DEFAULT },
  });
  setDayColumnWidths(ws, maxCols);
  writeDayBlock(ws, project, day, sections, dateLabel, 1, subjectColor);
  return ws;
}

// 全曜日を 1 枚にまとめたシート (曜日ごとに改ページ)。配布時に「曜日別を
// 1 枚ずつ選んで印刷」しなくてよいように、このシートだけ刷れば全曜日が
// 1 曜日 1 ページで出る。fitToPage は手動改ページを潰すので固定倍率。
function buildAllDaysSheet(workbook, project, daySections, dateLabel, subjectColor) {
  const maxCols = Math.max(...daySections.map((d) => dayBlockCols(d.sections)));
  const ws = workbook.addWorksheet(ALL_DAYS_SHEET_NAME, {
    pageSetup: {
      // 曜日別シート (B4 横 + fitToPage) と違い、こちらは手動改ページを
      // 生かすため固定倍率。倍率は紙の大きさで決まるので A3 横にする
      // (実測: 同じ下書きで B4 横 77% → A3 横 90%)。
      paperSize: PAPER_SIZE_A3,
      orientation: "landscape",
      margins: DAY_SHEET_MARGINS,
    },
    properties: { defaultRowHeight: ROW_HEIGHT_DEFAULT },
  });
  setDayColumnWidths(ws, maxCols);

  const heights = [];
  let row = 1;
  daySections.forEach(({ day, sections }, i) => {
    const block = writeDayBlock(
      ws,
      project,
      day,
      sections,
      dateLabel,
      row,
      subjectColor
    );
    heights.push(block.heightPt);
    // 最後の曜日の後ろに改ページを入れると空白ページが 1 枚増える
    if (i < daySections.length - 1) ws.getRow(block.lastRow).addPageBreak();
    row = block.nextRow;
  });

  ws.pageSetup.scale = estimatePrintScale({
    colWidths: [
      COL_WIDTH_TIME,
      ...Array.from({ length: maxCols - 1 }, () => COL_WIDTH_CLASS),
    ],
    blockHeightsPt: heights,
    paper: A3_LANDSCAPE_IN,
  });
  return ws;
}

// ─── workbook 構築 (純粋関数、テスト用に export) ────────────────────
/**
 * @param {object} project RegularProject
 * @param {{days: string[], splitCampus?: boolean, dateLabel: string,
 *          subjectColor?: (subj: string) => string | null}} opts
 *   subjectColor: 画面と同じ「教科で正規化した」科目カラー
 *   (subjectColor.js)。未指定なら素の getSubjectColor。
 */
export function buildRegularWorkbook(
  project,
  { days, splitCampus = true, dateLabel, subjectColor = getSubjectColor }
) {
  const workbook = new ExcelJS.Workbook();
  const daySections = [];
  for (const day of days) {
    const sections = collectDaySheet(project, day, { splitCampus });
    if (sections.length === 0) continue;
    daySections.push({ day, sections });
    buildDaySheet(workbook, project, day, sections, dateLabel, subjectColor);
  }
  // まとめシートは 2 曜日以上あるときだけ (1 曜日なら曜日別シートと同じ)
  if (daySections.length > 1) {
    buildAllDaysSheet(workbook, project, daySections, dateLabel, subjectColor);
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
  const { rows, untimedCount } = load;
  const active = rows.filter((r) => r.total > 0);
  // 担当が誰もいない曜日は列ごと省く (空き列は出力しない方針。画面の
  // 📊 パネルはタブが使う全曜日を出すが、紙面では空きは不要)
  const days = load.days.filter((d) =>
    active.some((r) => (r.byDay[d] || 0) > 0)
  );
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
function buildTeacherSheet(
  workbook,
  project,
  name,
  week,
  dateLabel,
  subjectColor = getSubjectColor
) {
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
          const argb = hexToArgb(subjectColor(e.subj));
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

// クラス × 科目の週コマ数 (📊 集計パネル下段の Excel 版)。カリキュラム側の
// 検算 (「中3 の数学が週 3 コマあるか」) を紙で確認するためのシート。
// 学年ごとの表を縦に積む (学年で科目の顔ぶれが違うため 1 つの表にしない)。
function buildClassSubjectSheet(workbook, project, classLoad, dateLabel) {
  const maxCols = Math.max(...classLoad.tabs.map((t) => t.subjects.length)) + 2;
  const ws = workbook.addWorksheet("クラス別科目", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: PAGE_MARGINS,
    },
  });
  ws.getColumn(1).width = 16;
  for (let c = 2; c <= maxCols; c++) ws.getColumn(c).width = 7;

  ws.mergeCells(1, 1, 1, maxCols);
  const title = ws.getCell(1, 1);
  title.value = `${project.name || "通常時間割"} — クラス別 科目コマ数（週計・出力: ${dateLabel}）`;
  title.font = { size: 13, bold: true };

  let row = 3;
  for (const t of classLoad.tabs) {
    const cols = t.subjects.length + 2; // クラス名 + 科目 + 週計
    ws.mergeCells(row, 1, row, cols);
    const head = ws.getCell(row, 1);
    head.value = t.grade && t.grade !== t.tabName ? `${t.tabName}（${t.grade}）` : t.tabName;
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = solidFill(ARGB_HEADER_BLUE);
    head.border = THIN_BORDER;
    row++;

    headerCell(ws.getCell(row, 1), "クラス");
    t.subjects.forEach((s, i) => headerCell(ws.getCell(row, 2 + i), s));
    headerCell(ws.getCell(row, cols), "週計");
    row++;

    const putRow = (label, values, total, bold) => {
      const nameCell = ws.getCell(row, 1);
      nameCell.value = label;
      nameCell.font = { size: 9, bold: true };
      nameCell.border = THIN_BORDER;
      if (bold) nameCell.fill = solidFill(ARGB_HEAD_GRAY);
      values.forEach((v, i) => {
        const cell = ws.getCell(row, 2 + i);
        cell.value = v || "";
        cell.font = { size: 9, bold: !!bold };
        cell.alignment = { horizontal: "center" };
        cell.border = THIN_BORDER;
        if (bold) cell.fill = solidFill(ARGB_HEAD_GRAY);
      });
      const totalCell = ws.getCell(row, cols);
      totalCell.value = total || "";
      totalCell.font = { size: 9, bold: true };
      totalCell.alignment = { horizontal: "center" };
      totalCell.border = THIN_BORDER;
      if (bold) totalCell.fill = solidFill(ARGB_HEAD_GRAY);
      row++;
    };

    for (const r of t.rows) {
      putRow(r.label, t.subjects.map((s) => r.bySubj[s] || 0), r.total, false);
    }
    if (t.rows.length > 1) {
      putRow("計", t.subjects.map((s) => t.subjTotals[s] || 0), t.total, true);
    }
    row++; // 学年の間の空行
  }

  ws.mergeCells(row, 1, row, maxCols);
  const note = ws.getCell(row, 1);
  note.value = "教科の入ったセルだけを数えます。合同（結合）コマは合同クラスの行に数えます。";
  note.font = { size: 9, color: { argb: ARGB_GRAY_TEXT } };
  return ws;
}

/**
 * 集計 workbook (テスト用に export)。1 枚目に講師 × 曜日の集計、続いて
 * クラス別の科目コマ数、そのあと講師ごとの週間シート。担当コマのある
 * 講師が 1 人もいなければシート 0 の workbook を返す (呼び出し側で
 * エラーメッセージ)。
 * @param {object} project RegularProject
 * @param {{dateLabel: string,
 *          subjectColor?: (subj: string) => string | null}} opts
 *   subjectColor: 曜日グリッドと同じ「教科で正規化した」科目カラー
 */
export function buildRegularTeacherWorkbook(
  project,
  { dateLabel, subjectColor = getSubjectColor }
) {
  const workbook = new ExcelJS.Workbook();
  const load = computeTeacherLoad(project);
  const active = load.rows.filter((r) => r.total > 0);
  if (active.length === 0) return workbook;
  buildTeacherSummarySheet(workbook, project, load, dateLabel);
  const classLoad = computeClassSubjectLoad(project);
  if (classLoad.tabs.length > 0) {
    buildClassSubjectSheet(workbook, project, classLoad, dateLabel);
  }
  for (const r of active) {
    buildTeacherSheet(
      workbook,
      project,
      r.name,
      computeTeacherWeek(project, r.name),
      dateLabel,
      subjectColor
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
 * @param {{project: object, days: string[], splitCampus?: boolean, now?: Date,
 *          subjectColor?: (subj: string) => string | null}} params
 * @returns {Promise<{daySheets: number, hasAllDaysSheet: boolean}>}
 *   呼び出し側が結果の通知を実態に合わせられるように内訳を返す
 *   (まとめシートは 2 曜日以上のときだけ作られる)
 */
export async function downloadRegularExcel({
  project,
  days,
  splitCampus = true,
  now = new Date(),
  subjectColor,
}) {
  const dateLabel = fmtDateLabel(now);
  const workbook = buildRegularWorkbook(project, {
    days,
    splitCampus,
    dateLabel,
    ...(subjectColor ? { subjectColor } : {}),
  });
  if (workbook.worksheets.length === 0) {
    throw new Error("出力できる曜日がありません (セルが 1 つもありません)");
  }
  const hasAllDaysSheet = !!workbook.getWorksheet(ALL_DAYS_SHEET_NAME);
  await downloadWorkbook(
    workbook,
    `通常時間割_${safeProjectName(project)}_${dateLabel}.xlsx`
  );
  return {
    daySheets: workbook.worksheets.length - (hasAllDaysSheet ? 1 : 0),
    hasAllDaysSheet,
  };
}

/** @param {{project: object, now?: Date,
 *           subjectColor?: (subj: string) => string | null}} params */
export async function downloadRegularTeacherExcel({
  project,
  now = new Date(),
  subjectColor,
}) {
  const dateLabel = fmtDateLabel(now);
  const workbook = buildRegularTeacherWorkbook(project, {
    dateLabel,
    ...(subjectColor ? { subjectColor } : {}),
  });
  if (workbook.worksheets.length === 0) {
    throw new Error("担当コマのある講師がいません");
  }
  await downloadWorkbook(
    workbook,
    `通常時間割_講師別_${safeProjectName(project)}_${dateLabel}.xlsx`
  );
}
