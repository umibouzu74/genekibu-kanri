// ─── 予定表の講座 → システムのコマ ─────────────────────────────────
// 予定表の講座 (「高1 高松西高校」「高3 ● 共通テスト英語(ハイレベル)」) が
// システムのどのコマ (学年 × 科目名) に当たるかを推定する。推定は手がかり:
//
//   - 学年: 講座の学年 (「高1・高2」なら 高1 / 高2 / 高1高2 のどれか)
//   - 曜日: 予定表でその講座の授業がある曜日だけ
//   - 校舎: 「本校」「亀井町」が分かっていれば教室 (「亀…」) で絞る
//   - 名前: コマの科目名の頭の語 (「高松西」「東大京大医進」「共テ」…) が
//     講座の名前に含まれること。講座の名前に教科 (物理・英語…) が書いて
//     あれば、コマの教科もその中にあること
//
// 推定は叩き台で、画面で直せる (直した結果は端末に保存)。コマの id では
// なく「学年|科目名」で持つので、期切替でコマを作り直しても効き続ける。

import { gradeToDept, isKameiRoom } from "../scheduleHelpers";
import { courseWeekdays } from "./highSchoolSheet";

// 予定表の書き方 → システムの科目名の書き方 (長いものから置き換える)
const SYNONYMS = [
  ["東京大・京都大・医進", "東大京大医進"],
  ["東大・京大・医進", "東大京大医進"],
  ["東京大・京都大", "東大京大"],
  ["東大・京大", "東大京大"],
  ["大阪大・神戸大", "阪大神大"],
  ["岡山・広島大", "岡広大"],
  ["岡大・広大", "岡広大"],
  ["東京大", "東大"],
  ["京都大", "京大"],
  ["高松第一高校", "高松一"],
  ["高松第一", "高松一"],
  ["高松桜井高校", "高松桜井"],
  ["高松西高校", "高松西"],
  ["高松高校", "高松高"],
  ["共通テスト", "共テ"],
  ["ハイレベル", "Hi"],
  ["スタンダード", "St"],
  ["スピーキング・リスニング", "SpeakingListening"],
  ["Speaking/Listening", "SpeakingListening"],
  ["数学", "数"],
];

// 教科の語 (コマの科目名の 2 語目以降・講座の名前の中)
const SUBJECT_WORDS = [
  "英語",
  "数",
  "国語",
  "現代文",
  "古文",
  "漢文",
  "物理",
  "化学",
  "生物",
  "地学",
  "世界史",
  "日本史",
  "地理",
  "公民",
  "小論文",
];
// 略記 (「現古」「古漢」「世・日・地」)
const SUBJECT_ABBR = { 世界史: "世", 日本史: "日", 地理: "地", 現代文: "現", 古文: "古", 漢文: "漢" };
const ABBR_CHARS = new Set(Object.values(SUBJECT_ABBR));

/** 突き合わせ用に揃える (NFKC・言い換え・空白と区切り記号を除く) */
export function normalizeName(s) {
  let out = String(s || "").normalize("NFKC");
  for (const [from, to] of SYNONYMS) out = out.split(from.normalize("NFKC")).join(to);
  return out.replace(/[\s・･/／、，,]/g, "");
}

function subjectWordsIn(text) {
  const found = [];
  let rest = text;
  for (const w of [...SUBJECT_WORDS].sort((a, b) => b.length - a.length)) {
    if (rest.includes(w)) {
      found.push(w);
      rest = rest.split(w).join("\u0000");
    }
  }
  return { found, rest: rest.split("\u0000").filter(Boolean) };
}

/**
 * コマの科目名を「頭の語 (グループ)」と「教科」に分ける。
 * 2 語目以降は教科だけを見る (「英語選抜」の「選抜」などの添え字は無視)。
 * 1 語だけの科目名 (「共テ英語(Hi)」) は、その語から教科を抜いた残りがグループ。
 */
export function tokenizeSubject(subj) {
  const parts = String(subj || "")
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const groups = [];
  const subjects = [];
  parts.forEach((part, i) => {
    const inner = [];
    const base = part.replace(/\(([^)]*)\)/g, (_, x) => {
      inner.push(x);
      return " ";
    });
    const norm = (x) => normalizeName(x);
    const { found, rest } = subjectWordsIn(norm(base));
    subjects.push(...found);
    for (const r of rest) {
      if ([...r].every((ch) => ABBR_CHARS.has(ch))) subjects.push(...r);
      else if (i === 0) groups.push(...r.split(" ").filter(Boolean));
    }
    for (const x of inner) {
      const n = norm(x);
      const sw = subjectWordsIn(n);
      if (sw.found.length) subjects.push(...sw.found);
      else if ([...n].every((ch) => ABBR_CHARS.has(ch))) subjects.push(...n);
      else if (i === 0 && n) groups.push(n);
    }
  });
  return { groups: [...new Set(groups)], subjects: [...new Set(subjects)] };
}

function subjectFound(token, courseNorm) {
  if (courseNorm.includes(token)) return true;
  const abbr = SUBJECT_ABBR[token];
  return !!abbr && courseNorm.includes(abbr);
}

/**
 * 講座の名前とコマの科目名がどのくらい合うか (0 = 合わない)。
 * @param {string} courseName 予定表の講座名 (凡例の説明を含む)
 * @param {string} subj コマの科目名
 */
export function matchScore(courseName, subj) {
  const c = normalizeName(courseName);
  if (!c) return 0;
  const { groups, subjects } = tokenizeSubject(subj);
  if (!groups.every((g) => c.includes(g))) return 0;
  const hit = subjects.filter((s) => subjectFound(s, c)).length;
  const courseHasSubjects = SUBJECT_WORDS.some((w) => c.includes(w));
  if (courseHasSubjects && subjects.length > 0 && hit === 0) return 0;
  const score = groups.length * 2 + hit;
  return score;
}

/** 講座の学年 → システムの学年の候補 (「高1・高2」は 高1 / 高2 / 高1高2) */
export function systemGradesFor(course) {
  const gs = course.grades || [];
  const out = new Set(gs);
  if (gs.length > 1) {
    out.add(gs.join(""));
    out.add(gs.join("・"));
  }
  return out;
}

function campusOk(course, slot) {
  if (course.campus === "亀井町") return isKameiRoom(slot.room || "");
  if (course.campus === "本校") return !isKameiRoom(slot.room || "");
  return true;
}

export const subjectKey = (grade, subj) => `${grade}|${subj}`;

/**
 * 講座ごとに、当たりそうなコマ (学年|科目名) を推定する。
 * @param {Array} courses mergeHighSchoolSheets の courses の値
 * @param {Array} slots システムの全コマ
 * @returns {{
 *   byCourse: Map<string, { subjects: string[], ambiguous: string[] }>,
 *   unmatched: { key: string, grade: string, subj: string, days: string[] }[],
 * }}
 *   unmatched は、予定表の学年・曜日に入るのにどの講座にも当たらなかったコマ
 */
export function suggestMapping(courses, slots) {
  const list = [...courses];
  const weekdays = new Map(list.map((c) => [c.key, courseWeekdays(c).regular]));
  // (学年, 科目, 曜日) ごとにまとめる
  const groups = new Map();
  for (const s of slots || []) {
    if (!s?.grade || !s.subj || gradeToDept(s.grade) !== "高校部") continue;
    const k = `${subjectKey(s.grade, s.subj)}|${s.day}`;
    if (!groups.has(k)) groups.set(k, { key: subjectKey(s.grade, s.subj), grade: s.grade, subj: s.subj, day: s.day, slots: [] });
    groups.get(k).slots.push(s);
  }
  const assigned = new Map(list.map((c) => [c.key, new Set()]));
  const ambiguous = new Map(list.map((c) => [c.key, new Set()]));
  const taken = new Set(); // group key (学年|科目|曜日)
  const inScope = new Set(); // 予定表の学年・曜日に入るグループ

  for (const [gk, g] of groups) {
    let best = 0;
    let winners = [];
    for (const c of list) {
      if (!systemGradesFor(c).has(g.grade)) continue;
      if (!weekdays.get(c.key).includes(g.day)) continue;
      inScope.add(gk);
      if (!g.slots.some((s) => campusOk(c, s))) continue;
      const isMark = g.subj.includes("マークテスト");
      if ((c.mode === "mark") !== isMark) continue;
      const score = c.mode === "mark" ? 1 : matchScore(c.name, g.subj);
      if (score > best) {
        best = score;
        winners = [c];
      } else if (score > 0 && score === best) {
        winners.push(c);
      }
    }
    if (!winners.length) continue;
    assigned.get(winners[0].key).add(g.key);
    if (winners.length > 1) for (const w of winners) ambiguous.get(w.key).add(g.key);
    taken.add(gk);
  }

  // 名前で 1 つも当たらなかった講座 (「土曜コース」など) は、校舎が分かって
  // いれば、その校舎・曜日・学年の残りのコマをまとめて当てる
  for (const c of list) {
    if (assigned.get(c.key).size || !c.campus || c.mode === "mark") continue;
    for (const [gk, g] of groups) {
      if (taken.has(gk) || g.subj.includes("マークテスト")) continue;
      if (!systemGradesFor(c).has(g.grade) || !weekdays.get(c.key).includes(g.day)) continue;
      if (!g.slots.every((s) => campusOk(c, s))) continue;
      assigned.get(c.key).add(g.key);
      taken.add(gk);
    }
  }

  const byCourse = new Map(
    list.map((c) => [c.key, { subjects: [...assigned.get(c.key)].sort(), ambiguous: [...ambiguous.get(c.key)] }])
  );
  const unmatchedMap = new Map();
  for (const [gk, g] of groups) {
    if (!inScope.has(gk) || taken.has(gk)) continue;
    if (!unmatchedMap.has(g.key)) unmatchedMap.set(g.key, { key: g.key, grade: g.grade, subj: g.subj, days: [] });
    unmatchedMap.get(g.key).days.push(g.day);
  }
  return { byCourse, unmatched: [...unmatchedMap.values()] };
}

/**
 * 手で直した対応 (端末に保存) を推定に重ねる。
 * @param {Map<string, {subjects: string[]}>} suggested
 * @param {Record<string, {skip?: boolean, subjects?: string[]}>} overrides
 * @returns {Map<string, {subjects: string[], skip: boolean, manual: boolean}>}
 */
export function effectiveMapping(suggested, overrides = {}) {
  const out = new Map();
  for (const [key, s] of suggested) {
    const o = overrides?.[key];
    if (o?.skip) out.set(key, { subjects: [], skip: true, manual: true });
    else if (Array.isArray(o?.subjects)) out.set(key, { subjects: [...o.subjects], skip: false, manual: true });
    else out.set(key, { subjects: s.subjects, skip: false, manual: false });
  }
  return out;
}

/**
 * システムの高校部のコマの「学年|科目名」→ 曜日の一覧。
 * @returns {Map<string, string[]>}
 */
export function subjectDays(slots) {
  const m = new Map();
  for (const s of slots || []) {
    if (!s?.grade || !s.subj || gradeToDept(s.grade) !== "高校部") continue;
    const k = subjectKey(s.grade, s.subj);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s.day);
  }
  return m;
}

/**
 * 講座の対応の状態。比べるのは status が ok の講座だけ (compare と対応表で共有)。
 * @param {object} course   予定表の講座 (sessions を持つ)
 * @param {{subjects: string[], skip: boolean} | undefined} m  effectiveMapping の 1 件
 * @param {Map<string, string[]>} days  subjectDays(slots)
 * @returns {{ status: string, valid: string[], stale: string[] }}
 *   status:
 *     ok         比べる
 *     skip       「この講座は比べない」にした
 *     noSessions この予定表の期間に授業が 1 回も無い (見出しだけの列)
 *     noWeekday  授業が少なく、いつもの曜日が決まらない
 *     unmapped   対応するコマが無い
 *     stale      選んだコマが今の時間割に無い (期切替で科目名が変わったなど)
 *     offDay     選んだコマが、予定表のいつもの曜日に無い
 *   valid / stale: 選んだ「学年|科目名」のうち今の時間割にある / 無いもの
 */
export function mappingStatus(course, m, days) {
  if (m?.skip) return { status: "skip", valid: [], stale: [] };
  const subjects = m?.subjects || [];
  const valid = subjects.filter((k) => days.has(k));
  const stale = subjects.filter((k) => !days.has(k));
  const out = (status) => ({ status, valid, stale });
  if (!course?.sessions?.size) return out("noSessions");
  const { regular } = courseWeekdays(course);
  if (!regular.length) return out("noWeekday");
  if (!subjects.length) return out("unmapped");
  if (!valid.length) return out("stale");
  if (!valid.some((k) => days.get(k).some((d) => regular.includes(d)))) return out("offDay");
  return out("ok");
}

/** 比べられないので直してほしい状態 (対応表の「コマが見つかりません」の件数) */
export const MAPPING_PROBLEMS = new Set(["unmapped", "stale", "offDay"]);
