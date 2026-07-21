// 印刷ポップアップ (App.jsx の handlePrint) で使う CSS / HTML ビルダ。
// 純粋関数として切り出してあり、handlePrint 本体からは DOM 操作だけが
// 残るようにする。値は popup window の <style> / <body> 内に直接埋め込まれる
// ため、文字列で返す。
//
// ファイル内のセクション順:
//   1. 共通レイアウト (page rule / printStyles 全体)
//   2. 月次カレンダー (label / header / visibility / CSS)
//   3. タイムテーブル (header / CSS)
//   4. 一括印刷 (グルーピング / body 連結)

import { EVENT_KIND } from "../constants/eventKinds";
import { escapeHtml } from "./escape";

// ─── 1. 共通レイアウト ─────────────────────────────────────────────

// 印刷ヘッダのメタ行に出す印刷日 (YYYY年MM月DD日 印刷)。月次・時間割の
// 双方で同形式にしたいので、フォーマットを 1 箇所にまとめる。
function formatPrintedAt(now) {
  return `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, "0")}月${String(now.getDate()).padStart(2, "0")}日 印刷`;
}

// 紙面ヘッダの対象日 (E1h: 日付フォーマット統一)。"YYYY-MM-DD" を
// 「YYYY年MM月DD日（曜）」に整形する。月次タイトル・印刷日と同じ和式に
// 揃える。ISO 形式でない入力はそのまま返す (安全側)。
export function formatPrintDate(dateStr, day = "") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if (!m) return dateStr || "";
  return `${m[1]}年${m[2]}月${m[3]}日${day ? `（${day}）` : ""}`;
}

// 印刷時の用紙サイズ・余白ルール。
// 月次カレンダーは横向き、それ以外 (タイムテーブル・通常ビュー) は縦向き。
export function buildPageRule({ hasMonthView }) {
  return hasMonthView
    ? "@page{size:A4 landscape;margin:8mm}"
    : "@page{size:A4 portrait;margin:12mm 8mm}";
}

// printStyles 全体を組み立てる。handlePrint から呼ばれ、popup window の
// <style> 内に直接挿入される。
export function buildPrintStyles({ hasTimetableGrid, hasMonthView }) {
  const pageRule = buildPageRule({ hasMonthView });
  const tt = hasTimetableGrid ? timetablePrintCss() : "";
  const month = hasMonthView ? monthPrintCss() : "";
  return `
    body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:16px;font-size:11px}
    .excel-print-page-title{font-size:13px;font-weight:700;margin:0 0 6px;padding:0 0 4px;border-bottom:1px solid #aaa}
    @media print{
      ${pageRule}
      body{padding:0;font-size:10px}
      *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
      .no-print{display:none !important}
      ${tt}
    }
    ${month}
  `;
}

// ─── 2. 月次カレンダー ─────────────────────────────────────────────

// 月次カレンダー印刷タイトル。docTitle (印刷ジョブ名) と
// 紙面ヘッダ h2 で共通利用する。
export function buildMonthLabel({ teacher, year, month }) {
  const prefix = teacher ? `${teacher}\u3000` : "";
  return `${prefix}${year}年${String(month).padStart(2, "0")}月 月次予定`;
}

// 月次カレンダー印刷ヘッダに出す「現在のフィルタ状態」サマリ。
// デフォルト (テスト期間/特別イベント とも非表示・タグ除外なし) の場合は
// 空文字を返し、印刷時に行ごと省く。
export function describeMonthVisibility(visibility) {
  const shown = [];
  if (visibility?.[EVENT_KIND.EXAM]) shown.push("テスト期間");
  if (visibility?.[EVENT_KIND.SPECIAL]) shown.push("特別イベント");
  // 旧キー examTagFilters は EventVisibilityToggles 側で
  // フォールバック対応されているのでここでも踏襲する。
  const tagFilters = visibility?.tagFilters || visibility?.examTagFilters || {};
  const offTags = Object.keys(tagFilters).filter((k) => tagFilters[k] === false);
  const parts = [];
  if (shown.length > 0) parts.push(`表示: ${shown.join("・")}`);
  if (offTags.length > 0) parts.push(`除外タグ: ${offTags.join(", ")}`);
  return parts.join(" / ");
}

// 月次カレンダー印刷ヘッダ HTML (タイトル + メタ + 凡例) を組み立てる。
// .month-print-root の直前に挿入される。`now` を引数で受けるのは決定的に
// テストするため。
export function buildMonthHeaderHtml({
  teacher,
  year,
  month,
  visibility,
  now = new Date(),
}) {
  const monthLabel = buildMonthLabel({ teacher, year, month });
  const printedAt = formatPrintedAt(now);
  const filterDesc = describeMonthVisibility(visibility);
  const meta = filterDesc
    ? `<div class="month-print-meta"><span>${escapeHtml(printedAt)}</span><span>${escapeHtml(filterDesc)}</span></div>`
    : `<div class="month-print-meta"><span>${escapeHtml(printedAt)}</span></div>`;
  const legend = `<div class="month-print-legend"><span><b>代</b>代行</span><span><b>合</b>合同</span><span><b>振</b>振替</span><span><b>移</b>時間変更</span><span><b>特訓</b>テスト直前特訓</span><span><b>追</b>追加授業</span><span><b>講</b>講習</span></div>`;
  return `<div class="month-print-header"><h2 class="month-print-page-title">${escapeHtml(monthLabel)}</h2>${meta}${legend}</div>`;
}

// 月次カレンダー印刷専用 CSS。罫線を明示し、各日セルがページ境界で
// 割れないよう抑制し、コマカードは折り返し可・操作 UI 風表現を解除する。
// 一括印刷時の .batch-print-page (講師ごとの 1 枚) は最後を除き改ページする。
function monthPrintCss() {
  return `
    .month-print-header{margin:0 0 6px}
    .month-print-page-title{font-size:13pt;font-weight:700;margin:0 0 3px;padding:0 0 3px;border-bottom:1px solid #444}
    .month-print-meta{font-size:9pt;color:#555;display:flex;gap:12px;flex-wrap:wrap;margin:0 0 3px}
    .month-print-legend{font-size:8pt;color:#555;display:flex;gap:10px;flex-wrap:wrap}
    .month-print-legend>span{white-space:nowrap}
    .month-print-legend b{background:#444;color:#fff;font-weight:700;padding:0 4px;border-radius:2px;margin-right:3px}
    @media print{
      .month-print-root{margin-top:0 !important}
      .month-print-grid{
        gap:0 !important;
        background:#fff !important;
        border:1px solid #888 !important;
        border-radius:0 !important;
      }
      .month-print-grid > *{
        border:1px solid #bbb !important;
        box-sizing:border-box;
      }
      .month-print-cell{
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .month-print-card{
        white-space:normal !important;
        overflow:visible !important;
        line-height:1.3 !important;
        cursor:default !important;
        opacity:1 !important;
      }
      .batch-print-page{
        page-break-after:always;
        break-after:page;
      }
      .batch-print-page:last-child{
        page-break-after:auto;
        break-after:auto;
      }
    }
  `;
}

// ─── 3. タイムテーブル ─────────────────────────────────────────────

// タイムテーブル印刷ヘッダ HTML (セクション名 + 日付 + メタ) を組み立てる。
// MS/HS の各ページ先頭に挿入される。section は "中学" / "高校" を期待し、
// 未指定なら「時間割」のみを出す。selected が指定されている場合は副題に
// 講師名を併記する。`now` を引数で受けるのは決定的にテストするため。
export function buildTimetableHeaderHtml({
  section,
  dateText,
  selected,
  now = new Date(),
}) {
  const titleParts = [];
  if (section) titleParts.push(`${section}の時間割`);
  else titleParts.push("時間割");
  if (dateText) titleParts.push(dateText);
  const title = titleParts.join(" — ");
  const printedAt = formatPrintedAt(now);
  const metaParts = [`<span>${escapeHtml(printedAt)}</span>`];
  if (selected) metaParts.push(`<span>担当: ${escapeHtml(selected)}</span>`);
  return `<h2 class="excel-print-page-title">${escapeHtml(title)}</h2><div class="excel-print-meta">${metaParts.join("")}</div>`;
}

// タイムテーブル (中学/高校 2 段) 印刷専用 CSS。中高間で改ページ。
// excel-print-meta はセクション別ヘッダのサブ行 (印刷日 / 講師名) を整える。
function timetablePrintCss() {
  return `
    .excel-print-meta{font-size:9pt;color:#555;display:flex;gap:12px;flex-wrap:wrap;margin:0 0 6px}
    .excel-print-meta>span{white-space:nowrap}
    .excel-grid-sections{display:block !important;grid-template-columns:none !important}
    .excel-print-col-ms{break-after:page;page-break-after:always}
    .excel-print-col-ms,.excel-print-col-hs{break-inside:avoid;page-break-inside:avoid}
  `;
}

// ─── 4. 一括印刷 ───────────────────────────────────────────────────

// 一括印刷ダイアログ用に、バイト (partTimeStaff) を教科ごとにグループ化する。
// 各 staff の subjectIds から教科名を引き、所属する教科すべてに重複登録する。
// subjectIds 未指定の staff は「未分類」グループに入れる。グループ間は
// subjects の登場順、グループ内の staff は五十音順で並べる。該当者ゼロの
// グループは結果から省く。
//
// 教科グループは Map で id→{name,staff} を保持し、未分類は専用シンボル
// キーで持つことで「未分類」という名前の subject が存在しても衝突しない。
const UNASSIGNED_KEY = Symbol("UNASSIGNED");
export function groupStaffBySubject({ partTimeStaff = [], subjects = [] }) {
  const subjectIdToName = new Map(subjects.map((s) => [s.id, s.name]));
  const groups = new Map();
  for (const s of subjects) {
    groups.set(s.id, { subjectName: s.name, staff: [] });
  }
  groups.set(UNASSIGNED_KEY, { subjectName: "未分類", staff: [] });
  for (const p of partTimeStaff) {
    if (!p?.name) continue;
    const ids = Array.isArray(p.subjectIds) ? p.subjectIds : [];
    if (ids.length === 0) {
      groups.get(UNASSIGNED_KEY).staff.push(p.name);
      continue;
    }
    let assigned = false;
    for (const id of ids) {
      if (!subjectIdToName.has(id)) continue;
      const g = groups.get(id);
      if (g) {
        g.staff.push(p.name);
        assigned = true;
      }
    }
    // subjectIds は持っているが対応する教科が無い場合も「未分類」に逃がす
    if (!assigned) groups.get(UNASSIGNED_KEY).staff.push(p.name);
  }
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      staff: [...g.staff].sort((a, b) => a.localeCompare(b, "ja")),
    }))
    .filter((g) => g.staff.length > 0);
}

// 一括印刷の <body> HTML。各 slide を <section.batch-print-page> で
// 包み、CSS の page-break-after で講師 1 人ずつ別ページに分ける。
// slide は { headerHtml, monthRootHtml } の形。
export function buildBatchPrintBodyHtml({ slides }) {
  if (!Array.isArray(slides) || slides.length === 0) return "";
  return slides
    .map(
      ({ headerHtml = "", monthRootHtml = "" }) =>
        `<section class="batch-print-page">${headerHtml}${monthRootHtml}</section>`
    )
    .join("");
}
