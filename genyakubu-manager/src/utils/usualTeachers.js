// ─── 普段の担当 (講習のクラス → 通常授業のクラスの担当、B1 2026-10-31) ──────
// 講習は「普段入っているクラスの担当を優先して組む」運用。講習のクラス
// (3S401 など) に通常授業の学年・クラス (中3 の SS と S) を結び付け、本体の時間割
// (講習の初日の「今の時間割」+ その日の担当) から科目ごとの担当を引く。
// **時間割のデータから出すもので、使用履歴は使わない** (A18)。
//
//   - クラス: cls の "S/AB" (合同) は S と AB、"SS〜C" は範囲。"AB" は A と B も含む
//     (合同の 1 コマ)。クラスを指定しない (附中1 の "-") = その学年の全部
//   - 科目: 講習の科目名 (英語) と通常授業の科目名 (英語 / 隔週の "英/数" の "英") の
//     頭が合えば同じ科目。隔週の "英/数" は A 週の科目 = 講師欄、B 週の科目 = 相手
//   - 隔週の相手・複数担当 (香川·福江) も普段の担当。並びはコマ数の多い順

import { expandClsRange } from "./excelGrid";
import { biweeklyPartner, isBiweekly, slotsOnDate, splitTeacherField } from "./biweekly";
import { filterSlotsCurrentOn } from "./timetable";

const plainCls = (c) => String(c ?? "").normalize("NFKC").trim();

// cls の 1 語が講習のクラス c を含むか
function tokenCovers(token, c) {
  if (token === c) return true;
  // "AB" (A と B の合同) は A も B も含む。"SS" はそれ自体がクラス
  return token !== "SS" && token.length > 1 && /^[A-Z]+$/.test(token) && c.length === 1 && token.includes(c);
}

/** 通常授業の科目 (の 1 部分) と講習の科目名が同じ科目か ("英" と "英語") */
export function subjectMatches(regularPart, subject) {
  const a = String(regularPart ?? "").normalize("NFKC").trim();
  const b = String(subject ?? "").normalize("NFKC").trim();
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/**
 * @param {object[]} slots 本体の全コマ
 * @param {object[]} timetables
 * @param {string} refYmd 基準日 (講習の初日)。その日の「今の時間割」とその日の担当を使う
 * @returns {{lookup: (grade: string, classes: string[], subject: string) => string[],
 *            grades: string[]}}
 */
export function buildUsualTeacherIndex(slots, timetables, refYmd) {
  const current = refYmd
    ? slotsOnDate(filterSlotsCurrentOn(slots || [], timetables || [], refYmd), refYmd)
    : slots || [];
  const entries = [];
  const grades = new Set();
  for (const s of current) {
    if (!s?.grade) continue;
    grades.add(s.grade);
    const cls = plainCls(s.cls);
    const tokens = !cls || cls === "-" ? [] : expandClsRange(cls).map(plainCls);
    const main = splitTeacherField(s.teacher);
    const partner = isBiweekly(s.note) ? biweeklyPartner(s.note) : null;
    const parts = String(s.subj || "").split("/").map((x) => x.trim()).filter(Boolean);
    if (partner && parts.length >= 2) {
      // 隔週の組の科目: A 週 = 1 つ目の科目を講師欄、B 週 = 2 つ目を相手
      for (const t of main) entries.push({ grade: s.grade, tokens, subj: parts[0], teacher: t });
      entries.push({ grade: s.grade, tokens, subj: parts[1], teacher: partner });
    } else {
      const people = partner ? [...main, partner] : main;
      for (const p of parts.length ? parts : [s.subj]) {
        for (const t of people) entries.push({ grade: s.grade, tokens, subj: p, teacher: t });
      }
    }
  }
  const lookup = (grade, classes, subject) => {
    if (!grade || !subject) return [];
    const wanted = (classes || []).map(plainCls).filter(Boolean);
    const count = new Map();
    for (const e of entries) {
      if (e.grade !== grade) continue;
      if (wanted.length > 0 && e.tokens.length > 0 && !e.tokens.some((t) => wanted.some((c) => tokenCovers(t, c)))) {
        continue;
      }
      if (!subjectMatches(e.subj, subject)) continue;
      count.set(e.teacher, (count.get(e.teacher) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  };
  return { lookup, grades: [...grades].sort() };
}

/**
 * 講習のクラス名とタブ名から、通常授業の学年・クラスを推し量る (一度きりの入力補助。
 * 「対応を推定」を押したときだけ)。読めなければ null。
 *   "3S401" (タブ「中3」) → {grade: "中3", classes: ["S"]}
 *   "1附属" → {grade: "附中1", classes: []}
 *   "3A403" → {grade: "中3", classes: ["A"]}
 * @param {string} tabName
 * @param {string} classLabel
 * @param {string[]} [knownGrades] 本体にある学年 (合うものだけ返す)
 */
export function guessRegularClass(tabName, classLabel, knownGrades = []) {
  const label = String(classLabel ?? "").normalize("NFKC").trim();
  const tab = String(tabName ?? "").normalize("NFKC");
  const dept = /高/.test(tab) || /^高/.test(label) ? "高" : "中";
  const m = label.match(/^(?:中|高)?(\d)(.*)$/);
  if (!m) return null;
  const n = m[1];
  const rest = m[2];
  let grade;
  let classes = [];
  if (/附/.test(rest)) {
    grade = `附中${n}`;
  } else {
    grade = `${dept}${n}`;
    const cm = rest.match(/^(SS|[A-Z]+)/);
    if (cm) classes = [cm[1]];
  }
  if (knownGrades.length > 0 && !knownGrades.includes(grade)) return null;
  return { grade, classes };
}
