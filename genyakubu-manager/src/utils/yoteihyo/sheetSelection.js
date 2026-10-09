// ─── 予定表のブックから、照合に使うシートを選ぶ ─────────────────────
// 学校から届くブックには、過去の年度・改訂前・生徒用 / 教員用のシートが
// 何枚も入っている。既定では「今年度の高校部のシートのうち、同じ学年の
// 組で期間が重ならないもの」を選び、重なるときは教員用 (休講が灰色で
// 書いてある) → 改訂・訂正・変更 → ブックの左の順で 1 枚にする。

import { classifySheet, parseHighSchoolSheet } from "./highSchoolSheet";

/**
 * @param {{ sheets: Array<{name: string}> }} workbook
 * @returns {Array<{ index, name, kind, title, parsed }>}
 *   kind: high (読めた) / middle / calendar / unknown (高校部らしいが形が読めない も含む)
 */
export function analyzeWorkbook(workbook) {
  return (workbook?.sheets || []).map((sheet, index) => {
    const cls = classifySheet(sheet);
    let parsed = null;
    if (cls.kind === "high") {
      try {
        parsed = parseHighSchoolSheet(sheet);
      } catch (err) {
        console.warn(`[yoteihyo] シート「${sheet.name}」を読めませんでした`, err);
        parsed = null;
      }
    }
    return {
      index,
      name: sheet.name,
      kind: parsed ? "high" : cls.kind === "high" ? "unknown" : cls.kind,
      title: cls.title,
      parsed,
    };
  });
}

/** 今日を含む年度 (4/1〜翌 3/31) */
export function fiscalYearRange(today) {
  const [y, m] = today.split("-").map(Number);
  const fy = m >= 4 ? y : y - 1;
  return { start: `${fy}-04-01`, end: `${fy + 1}-03-31` };
}

const familyOf = (s) => (s.parsed?.grades || []).join("・");
const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;

function preference(name) {
  return (/教員/.test(name) ? 2 : 0) + (/改訂|訂正|変更/.test(name) ? 1 : 0);
}

/** 既定で選ぶシートの index */
export function defaultSheetSelection(sheets, today) {
  const fy = fiscalYearRange(today);
  const cands = sheets
    .filter((s) => s.kind === "high" && s.parsed && overlaps(s.parsed.range, fy))
    .sort((a, b) => preference(b.name) - preference(a.name) || a.index - b.index);
  const chosen = [];
  for (const s of cands) {
    const clash = chosen.some((c) => familyOf(c) === familyOf(s) && overlaps(c.parsed.range, s.parsed.range));
    if (!clash) chosen.push(s);
  }
  return new Set(chosen.map((s) => s.index));
}

/**
 * 選んだシートを照合に使う順に並べる (重なる日は先のシートを使う)。
 * 既定の選び方と同じく 教員用 → 改訂・訂正・変更 → ブックの左 の順。
 * 生徒用と教員用を両方選んだときに、休講の灰色が無い生徒用で上書きしない。
 */
export function selectedInMergeOrder(sheets, selected) {
  return sheets
    .filter((s) => selected.has(s.index) && s.parsed)
    .sort((a, b) => preference(b.name) - preference(a.name) || a.index - b.index);
}

/** 選んだシートのうち、同じ学年の組で期間が重なる組 (first が使われる) */
export function overlappingSelections(sheets, selected) {
  const sel = selectedInMergeOrder(sheets, selected);
  const out = [];
  for (let i = 0; i < sel.length; i++) {
    for (let j = i + 1; j < sel.length; j++) {
      if (familyOf(sel[i]) === familyOf(sel[j]) && overlaps(sel[i].parsed.range, sel[j].parsed.range)) {
        out.push({ first: sel[i], second: sel[j] });
      }
    }
  }
  return out;
}
