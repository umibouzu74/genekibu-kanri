// 学校の考査・模試 (年間カレンダーの学校バッジ・学校別タイムライン) の色と CSS。
// テスト期間はアプリの EXAM_META (橙)、模試は特別イベントの種別「模試」の色に
// 寄せる。タイムラインの模試は対象学年で色を分ける (utils/schoolSchedule の
// mockGradeClass)。塗りは紙面にも出す (print-color-adjust)。

import { EXAM_META } from "../../../constants/eventKinds";
import { specialEventTypeMeta } from "../../../constants/specialEvents";

const MOCK = specialEventTypeMeta("mock");

export const SCHOOL_COLORS = Object.freeze({
  examBg: EXAM_META.bg, // 期間中の休み・考査日の無いテスト期間
  examFg: EXAM_META.fg,
  examAccent: EXAM_META.accent,
  examSolid: "#c9761a", // 考査日の塗り
  examPre: "#fff7ea", // 発表後〜考査前
  mockBg: MOCK.bg,
  mockFg: MOCK.fg,
  mockAccent: MOCK.accent,
  // タイムラインの模試 (対象学年)
  g12: "#1f8a80",
  g3: "#7b4fc0",
  all: "#4a5a78",
  // 「考査中」の学校数 (1 校 / 2 校以上)
  count1: "#e9a24c",
  count2: "#a65c10",
});

export const MOCK_GRADE_LABELS = Object.freeze({
  g12: "高1・2 が対象",
  g3: "高3 のみ",
  all: "学年の記載なし",
});

const C = SCHOOL_COLORS;

export const SCHOOL_SCHEDULE_CSS = `
.ycs-strip { display: flex; flex-wrap: wrap; gap: 3px; margin: 0 0 2px; }
.ycs-chip {
  display: inline-flex; align-items: center; gap: 2px; height: 18px; padding: 0 5px;
  border-radius: 4px; font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap;
  border: 1px solid transparent; font-family: inherit; cursor: pointer;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
span.ycs-chip { cursor: default; }
.ycs-chip:focus-visible { outline: 2px solid #1a1a2e; outline-offset: 1px; }
.ycs-chip--announce { background: #fff; border: 1.5px solid ${C.examSolid}; color: ${C.examSolid}; }
.ycs-chip--pre { background: ${C.examPre}; border-color: ${C.examAccent}; color: ${C.examFg}; }
.ycs-chip--exam { background: ${C.examSolid}; border-color: ${C.examSolid}; color: #fff; }
.ycs-chip--gap, .ycs-chip--period {
  background: ${C.examBg}; border-color: ${C.examBg}; color: ${C.examFg}; font-weight: 600;
}
.ycs-chip--period { border-style: dashed; border-color: ${C.examAccent}; }
.ycs-chip--mock { background: ${C.mockBg}; border-color: ${C.mockAccent}; color: ${C.mockFg}; }
.ycs-sub { font-size: 9.5px; font-weight: 700; }
.ycs-mk {
  display: inline-block; font-size: 9.5px; font-weight: 800; padding: 1px 3px; border-radius: 3px;
  background: ${C.mockAccent}; color: #fff; margin-left: 2px; line-height: 1.1;
}
.ycs-mk--opt { background: #fff; color: ${C.mockAccent}; border: 1px dashed ${C.mockAccent}; padding: 0 2px; }
.ycs-chip--exam .ycs-mk { background: #fff; color: ${C.mockAccent}; }
/* B4・A3: バッジの下の説明の行 */
.ycs-details { display: grid; gap: 2px; margin: 0 0 2px; }
.ycs-line {
  font-size: 11px; line-height: 1.35; padding: 1px 4px; border-radius: 2px; word-break: break-word;
  border: 1px solid transparent; border-left-width: 3px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.ycs-line--exam { background: ${C.examPre}; color: ${C.examFg}; border-left-color: ${C.examSolid}; }
.ycs-line--mock { background: ${C.mockBg}; color: ${C.mockFg}; border-left-color: ${C.mockAccent}; }
.ycs-line--opt { background: #fff; border-color: ${C.mockAccent}; border-style: dashed; }
.ycs-line-school { margin-right: 4px; }
.ycs-line .ysl-grade, .ycs-line .ysl-optmark { font-size: 9.5px; line-height: 13px; }

/* ── 学校別タイムライン ── */
.ysl-scroll { overflow-x: auto; border: 1px solid #d6d9de; border-radius: 6px; background: #fff; }
.ysl { position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ysl-row {
  position: relative; display: grid; grid-template-columns: var(--ysl-label, 76px) 1fr;
  border-top: 1px solid #d6d9de;
}
.ysl-row:first-child { border-top: 0; }
.ysl-row--dates { height: 34px; }
.ysl-row--count { height: 28px; }
.ysl-school { border-top: 1.5px solid #9aa3ae; }
.ysl-label {
  position: sticky; left: 0; z-index: 5; background: #fff; border-right: 1px solid #d6d9de;
  display: flex; flex-direction: column; justify-content: center; padding: 0 8px;
  font-weight: 800; font-size: 13px;
}
.ysl-label small { font-weight: 600; font-size: 10px; color: #6b7480; }
.ysl-track { position: relative; min-width: 0; }
.ysl-bg { position: absolute; top: 0; bottom: 0; left: var(--ysl-label, 76px); right: 0; pointer-events: none; }
.ysl-we { position: absolute; top: 0; bottom: 0; background: #f2f3f6; }
.ysl-mline { position: absolute; top: 0; bottom: 0; border-left: 1px solid #b8bfc9; }
.ysl-today { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #e67a00; z-index: 4; pointer-events: none; }
.ysl-today span { position: absolute; top: 0; left: 3px; font-size: 9px; color: #e67a00; font-weight: 800; white-space: nowrap; }
.ysl-month { position: absolute; top: 0; height: 18px; font-size: 11px; font-weight: 800; padding-left: 3px; border-left: 1px solid #9aa3ae; white-space: nowrap; }
.ysl-dnum { position: absolute; top: 19px; font-size: 9.5px; color: #6b7480; white-space: nowrap; transform: translateX(-50%); }
.ysl-dnum--sun { color: #c03030; }
.ysl-dnum--sat { color: #2e5a9e; }
.ysl-count { position: absolute; top: 6px; height: 16px; }
.ysl-lane { position: relative; }
.ysl-lane--exam { height: 34px; }
.ysl-lane--mock { height: 17px; }
.ysl-ename {
  position: absolute; top: 1px; font-size: 10px; font-weight: 700; color: ${C.examFg};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; padding-left: 8px;
  box-sizing: border-box;
}
.ysl-edetail { font-weight: 600; color: #7a5520; }
.ysl-ann {
  position: absolute; top: 11px; width: 0; height: 0; margin-left: -5px; pointer-events: none;
  border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid ${C.examSolid};
}
.ysl-band {
  position: absolute; top: 20px; height: 12px; padding: 0; margin: 0;
  background: ${C.examPre}; border: 1px solid ${C.examAccent}; border-radius: 3px; cursor: pointer;
  overflow: hidden; font-family: inherit;
}
.ysl-band--period { background: ${C.examBg}; border-style: dashed; }
.ysl-exam { position: absolute; top: 0; bottom: 0; background: ${C.examSolid}; }
.ysl-mock {
  position: absolute; top: 3px; height: 11px; min-width: 6px; padding: 0; margin: 0;
  border: none; border-radius: 5px; cursor: pointer; font-family: inherit;
}
.ysl-mock--g12 { background: ${C.g12}; color: ${C.g12}; }
.ysl-mock--g3 { background: ${C.g3}; color: ${C.g3}; }
.ysl-mock--all { background: ${C.all}; color: ${C.all}; }
.ysl-mock--opt { background: #fff; border: 1.5px dashed currentColor; }
/* 模試の札 (対象学年 + 名前)。同じ段の次の点の手前で「…」(max-width は JSX) */
.ysl-mlabel {
  position: absolute; top: 0; height: 17px; line-height: 17px; font-size: 9.5px; color: #2a2f36;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
}
.ysl-grade {
  display: inline-block; font-size: 8.5px; font-weight: 800; line-height: 12px; padding: 0 3px;
  border-radius: 3px; color: #fff; margin-right: 3px; vertical-align: 1px;
  border: 1px solid transparent;
}
.ysl-grade--g12 { background: ${C.g12}; border-color: ${C.g12}; }
.ysl-grade--g3 { background: ${C.g3}; border-color: ${C.g3}; }
.ysl-grade--all { background: ${C.all}; border-color: ${C.all}; }
.ysl-grade--opt { background: #fff; border-style: dashed; }
.ysl-grade--opt.ysl-grade--g12 { color: ${C.g12}; }
.ysl-grade--opt.ysl-grade--g3 { color: ${C.g3}; }
.ysl-grade--opt.ysl-grade--all { color: ${C.all}; }
.ysl-optmark {
  display: inline-block; font-size: 8.5px; font-weight: 700; line-height: 12px; padding: 0 3px;
  margin-left: 4px; border: 1px dashed ${C.mockAccent}; border-radius: 3px; color: ${C.mockFg};
  vertical-align: 1px;
}
.ysl-band:focus-visible, .ysl-mock:focus-visible { outline: 2px solid #1a1a2e; outline-offset: 1px; }
.ysl-school { break-inside: avoid; page-break-inside: avoid; }
.ysl-sw { display: inline-block; width: 18px; height: 11px; border-radius: 3px; vertical-align: middle; }

/* B4・A3: 字を大きく、帯・点を太く */
.ysl--large .ysl-label { font-size: 15px; }
.ysl--large .ysl-label small { font-size: 10.5px; }
.ysl--large .ysl-row--dates { height: 36px; }
.ysl--large .ysl-month { font-size: 12.5px; }
.ysl--large .ysl-dnum { top: 20px; font-size: 9px; }
.ysl--large .ysl-lane--exam { height: 40px; }
.ysl--large .ysl-ename { font-size: 11.5px; }
.ysl--large .ysl-ann { top: 13px; }
.ysl--large .ysl-band { top: 23px; height: 14px; }
.ysl--large .ysl-lane--mock { height: 21px; }
.ysl--large .ysl-mock { top: 4px; height: 13px; }
.ysl--large .ysl-mlabel { height: 21px; line-height: 21px; font-size: 11px; }
.ysl--large .ysl-grade, .ysl--large .ysl-optmark { font-size: 10px; line-height: 14px; }

/* ── 学校ごとの一覧 (学校別の下) ── */
.ysl-list {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px 16px;
  margin-top: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.ysl-list-table th.ysl-list-title {
  background: #fff; color: #1a1a2e; font-size: 14px; font-weight: 800; padding: 0 0 4px;
}
.ysl-list-title small { font-size: 10.5px; color: #6b7480; font-weight: 600; margin-left: 8px; }
.ysl-list-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; background: #fff; }
.ysl-list-col-date { width: 8.6em; }
.ysl-list-col-grade { width: 5.6em; }
.ysl-list-table th {
  font-size: 10px; text-align: left; background: #3b4a5a; color: #fff; padding: 2px 6px; font-weight: 700;
}
.ysl-list-table td { border-top: 1px solid #d6d9de; padding: 3px 6px; vertical-align: top; line-height: 1.4; }
.ysl-list-table tbody tr:last-child td { border-bottom: 1px solid #d6d9de; }
.ysl-list-row { break-inside: avoid; page-break-inside: avoid; }
.ysl-list-row--exam td { background: ${C.examPre}; }
.ysl-list-row--exam td:first-child { box-shadow: inset 3px 0 0 ${C.examSolid}; }
.ysl-list-date { font-variant-numeric: tabular-nums; }
.ysl-list-date .ysl-nw { white-space: nowrap; }
.ysl-list-kind {
  display: inline-block; font-size: 9.5px; font-weight: 800; line-height: 13px; padding: 0 4px;
  border-radius: 3px; margin-right: 5px; vertical-align: 1px; border: 1px solid transparent;
}
.ysl-list-kind--exam { background: ${C.examSolid}; border-color: ${C.examSolid}; color: #fff; }
.ysl-list-kind--mock { background: ${C.mockBg}; border-color: ${C.mockAccent}; color: ${C.mockFg}; }
.ysl-list-sub { font-size: 10px; color: #7a5520; margin-top: 1px; }
.ysl-list-grade .ysl-grade { margin-right: 0; }
.ysl-list--large .ysl-list-table th.ysl-list-title { font-size: 16px; }
.ysl-list--large .ysl-list-table { font-size: 12.5px; }
.ysl-list--large .ysl-list-table th { font-size: 11px; }
.ysl-list--large .ysl-list-sub { font-size: 11px; }
.ysl-list--large .ysl-list-kind, .ysl-list--large .ysl-grade { font-size: 10.5px; line-height: 15px; }

/* ── 内訳のポップオーバー ── */
.ycs-pop {
  position: fixed; z-index: 2000; background: #fff; border: 1px solid #ccc; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); padding: 10px 12px; font-size: 12px;
  width: min(360px, calc(100vw - 16px)); max-height: min(420px, calc(100vh - 16px)); overflow: auto;
}
.ycs-pop h4 { margin: 0 0 6px; font-size: 13px; }
.ycs-pop-item { border-top: 1px solid #eee; padding: 6px 0; display: grid; gap: 2px; }
.ycs-pop-item:first-of-type { border-top: 0; }

@media print {
  .ycs-chip { font-size: 9px; height: 14px; padding: 0 3px; }
  .ysl-scroll { overflow: visible; border-color: #999; }
  .ysl { min-width: 0 !important; }
  .ysl-label { position: static; }
}
`;
