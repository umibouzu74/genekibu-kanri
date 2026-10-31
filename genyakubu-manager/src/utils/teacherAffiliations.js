// ─── 講師の所属 (区分) ───────────────────────────────────────────────
// 講師ごとの「現役部 常勤 / 現役部 非常勤 / 予備校部」を**年度 (4 月始まり)
// ごと**に持つ。毎年 4 月に入れ替わることが多いので、
//
//   - 保存するのは「この講師はこの年度からこの区分」という**変更だけ**
//     (`{ name, fromYear, category }` の配列)。何もしなければ前の年度の区分が
//     そのまま次の年度へ引き継がれる (年度が替わるたびに全員を入れ直さない)
//   - ある年度で区分を変えると、その年度以降 (次に変えた年度の手前まで) に効く。
//     前の年度は変わらない (去年の有給の一覧が今年の区分で書き換わらない)
//   - 何も登録していない講師は**予備校部 (既定)**。ただしバイト管理の
//     バイト一覧にいる人は**現役部 非常勤**が既定 (バイトは現役部の非常勤)
//
// 有給・半休 (utils/staffLeave) を記録するのは `tracksLeave` の区分
// (現役部 常勤) の講師。区分は人の名前で持つ (teacherKana と同じく、時間割の
// コマにしか出てこない常勤にも付けたいので partTimeStaff の項目にしない)。
//
// 区分の種類は AFFILIATION_CATEGORIES の 1 か所。予備校部の常勤 / 非常勤の
// ように分けたくなったら、ここに足せば画面・保存の形はそのまま使える
// (保存は区分の key の文字列なので、知らない key も読み捨てずに残す)。

import { slotTeacherNamesBetween } from "./biweekly";
import { isValidDateStr } from "./dateHelpers";

/**
 * 区分の一覧 (画面の並び順)。
 *   tracksLeave … 有給・半休を記録する区分
 */
export const AFFILIATION_CATEGORIES = Object.freeze([
  Object.freeze({
    key: "genyaku-fulltime",
    label: "現役部 常勤",
    dept: "現役部",
    employment: "常勤",
    tracksLeave: true,
    desc: "有給・半休を記録する人",
    tone: { bg: "#e8f2ea", fg: "#1f6a3a", border: "#9fcfae" },
  }),
  Object.freeze({
    key: "genyaku-parttime",
    label: "現役部 非常勤",
    dept: "現役部",
    employment: "非常勤",
    tracksLeave: false,
    desc: "バイトなど (バイト一覧の人は最初からここ)",
    tone: { bg: "#eef4fb", fg: "#2a5a8a", border: "#b5cde6" },
  }),
  Object.freeze({
    key: "yobiko",
    label: "予備校部",
    dept: "予備校部",
    employment: "",
    tracksLeave: false,
    desc: "既定 (分けていない講師はここ)",
    tone: { bg: "#f3f3f5", fg: "#555", border: "#d6d6dc" },
  }),
  // 退職した講師 (2026-10-27)。この年度から講習時間割作成 (講師の一覧・季節を
  // 写すとき・出勤可能調査)・授業時間の集計の講師ボタン・バイト出勤表・
  // サイドバーの講師一覧に出さない。授業の記録 (時間割のコマ・期間内の授業) が
  // 残っている人は、その画面では出す (黙って給与や予定から消さない)
  Object.freeze({
    key: "retired",
    label: "退職・非表示",
    dept: "",
    employment: "",
    tracksLeave: false,
    desc: "講習時間割作成・授業時間の集計・出勤可能調査に出さない",
    tone: { bg: "#f6eeee", fg: "#8a4a4a", border: "#dfc4c4" },
  }),
]);

export const DEFAULT_CATEGORY = "yobiko";
/** バイト一覧 (partTimeStaff) の人の既定 */
export const PART_TIME_CATEGORY = "genyaku-parttime";
/** 有給・半休を記録する区分 */
export const LEAVE_CATEGORY = "genyaku-fulltime";
/** 退職した講師 (一覧に出さない) */
export const RETIRED_CATEGORY = "retired";

const CATEGORY_BY_KEY = new Map(AFFILIATION_CATEGORIES.map((c) => [c.key, c]));

/** 区分の定義。知らない key (新しい版で足された区分) も名前だけは出す */
export function categoryMeta(key) {
  return (
    CATEGORY_BY_KEY.get(key) || {
      key,
      label: `その他 (${key})`,
      dept: "",
      employment: "",
      tracksLeave: false,
      desc: "",
      tone: { bg: "#f6f0e6", fg: "#7a5a20", border: "#e0cfa8" },
    }
  );
}

// ─── 年度 ─────────────────────────────────────────────────────────

/** 日付 (YYYY-MM-DD) の年度 (4 月始まり)。2027-03-31 → 2026 */
export function fiscalYearOf(dateStr) {
  const [y, m] = String(dateStr || "")
    .split("-")
    .map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return m >= 4 ? y : y - 1;
}

/** 年度の最初と最後の日 */
export function fiscalYearRange(year) {
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
}

/** 画面の表記。2026 → "2026年度" */
export const fmtFiscalYear = (year) => `${year}年度`;

// ─── 保存の形 ───────────────────────────────────────────────────────

const str = (v) => (typeof v === "string" ? v.trim() : "");

/** 1 件を整える。形にならないもの (名前 / 年度 / 区分が無い) は null */
export function normalizeAffiliationChange(c) {
  if (c == null || typeof c !== "object" || Array.isArray(c)) return null;
  const name = str(c.name);
  const fromYear = Number(c.fromYear);
  const category = str(c.category);
  if (!name || !category) return null;
  if (!Number.isInteger(fromYear) || fromYear < 1990 || fromYear > 2200) return null;
  return { name, fromYear, category };
}

/**
 * 保存値を整える (冪等)。配列でなければ空。同じ (講師, 年度) は後勝ち
 * (画面の操作は置き換えで書くので、重なるのは手で JSON をいじったときだけ)。
 * 並びは講師名 → 年度 (書き出したバックアップを読みやすく、差分を小さく)
 */
export function migrateTeacherAffiliations(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const byKey = new Map();
  for (const c of list) {
    const v = normalizeAffiliationChange(c);
    if (v) byKey.set(`${v.name}\u0000${v.fromYear}`, v);
  }
  return [...byKey.values()].sort((a, b) =>
    a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.fromYear - b.fromYear
  );
}

// ─── 区分を引く ─────────────────────────────────────────────────────

/** 講師名 → 年度の昇順に並べた変更。引くたびに全走査しないための索引 */
export function indexAffiliationChanges(changes) {
  const m = new Map();
  for (const c of changes || []) {
    if (!c?.name) continue;
    if (!m.has(c.name)) m.set(c.name, []);
    m.get(c.name).push(c);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.fromYear - b.fromYear);
  return m;
}

/** 何も登録していないときの区分 (バイトは現役部 非常勤、それ以外は予備校部) */
export function baseCategoryOf(name, partTimeNames) {
  return partTimeNames?.has?.(name) ? PART_TIME_CATEGORY : DEFAULT_CATEGORY;
}

/**
 * その年度の区分。
 * @param {Map<string, {fromYear: number, category: string}[]>} index indexAffiliationChanges の戻り値
 * @param {string} name
 * @param {number} year 年度
 * @param {Set<string>} [partTimeNames] バイト一覧の名前
 * @returns {{category: string, source: "this-year"|"inherited"|"part-time"|"default", fromYear: number|null}}
 *   source: this-year = この年度に変えた / inherited = 前の年度から引き継ぎ /
 *   part-time = 登録なし (バイトなので現役部 非常勤) / default = 登録なし (予備校部)
 */
export function resolveAffiliation(index, name, year, partTimeNames) {
  const list = index?.get?.(name) || [];
  let hit = null;
  for (const c of list) {
    if (c.fromYear > year) break;
    hit = c;
  }
  if (hit) {
    return {
      category: hit.category,
      source: hit.fromYear === year ? "this-year" : "inherited",
      fromYear: hit.fromYear,
    };
  }
  const base = baseCategoryOf(name, partTimeNames);
  return {
    category: base,
    source: base === PART_TIME_CATEGORY ? "part-time" : "default",
    fromYear: null,
  };
}

/**
 * 講師名の一覧を区分ごとに分ける (AFFILIATION_CATEGORIES の順。知らない区分は
 * 末尾)。並びは渡した names の順のまま (呼び出し側でよみ順にしておく)
 * @returns {{category: object, names: string[]}[]} 空の区分も返す (画面で移動先として出す)
 */
export function groupByAffiliation(names, index, year, partTimeNames) {
  const buckets = new Map(AFFILIATION_CATEGORIES.map((c) => [c.key, []]));
  for (const name of names || []) {
    const { category } = resolveAffiliation(index, name, year, partTimeNames);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(name);
  }
  return [...buckets.entries()]
    .filter(([key, arr]) => CATEGORY_BY_KEY.has(key) || arr.length > 0)
    .map(([key, arr]) => ({ category: categoryMeta(key), names: arr }));
}

/** その年度に有給・半休を記録する講師 (tracksLeave の区分)。names の順のまま */
export function leaveTrackedNames(names, index, year, partTimeNames) {
  return (names || []).filter(
    (n) => categoryMeta(resolveAffiliation(index, n, year, partTimeNames).category).tracksLeave
  );
}

/**
 * 前の年度から区分の変わった講師 (「今年度の変更」として画面に出す)
 * @returns {{name: string, from: string, to: string}[]}
 */
export function changesFromPreviousYear(names, index, year, partTimeNames) {
  const out = [];
  for (const name of names || []) {
    const now = resolveAffiliation(index, name, year, partTimeNames);
    if (now.source !== "this-year") continue;
    const prev = resolveAffiliation(index, name, year - 1, partTimeNames);
    if (prev.category !== now.category) {
      out.push({ name, from: prev.category, to: now.category });
    }
  }
  return out;
}

// ─── 書き換え ───────────────────────────────────────────────────────

// 1 人ぶんの変更を、年度順にたどって「直前と同じ区分」の変更を落とす。
// 登録なしの区分 (baseCategoryOf) と同じ区分の変更も要らない。保存の形を
// 最小に保つと、ある年度を元に戻したときに後ろの年度が勝手に変わらない
// (「区分が変わった年度」だけが残る)。
function canonicalizeOne(list, base) {
  const sorted = [...list].sort((a, b) => a.fromYear - b.fromYear);
  const out = [];
  let current = base;
  for (const c of sorted) {
    if (c.category === current) continue;
    out.push(c);
    current = c.category;
  }
  return out;
}

function replaceFor(changes, names, partTimeNames, edit) {
  const target = new Set(names);
  const keep = [];
  const byName = new Map();
  for (const c of changes || []) {
    if (target.has(c.name)) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    } else {
      keep.push(c);
    }
  }
  const next = [...keep];
  for (const name of target) {
    const edited = edit(name, byName.get(name) || []);
    next.push(...canonicalizeOne(edited, baseCategoryOf(name, partTimeNames)));
  }
  return migrateTeacherAffiliations(next);
}

/**
 * 講師 (複数可) の区分を、その年度から category にする。
 * それより前の年度は変わらない。それより後の年度に別の変更があればそちらが
 * そのまま効く (その年度で変えた人の区分を上書きしない)。
 */
export function setAffiliation(changes, names, year, category, partTimeNames) {
  if (!category || !Number.isInteger(year)) return migrateTeacherAffiliations(changes);
  return replaceFor(changes, names, partTimeNames, (name, list) => [
    ...list.filter((c) => c.fromYear !== year),
    { name, fromYear: year, category },
  ]);
}

/**
 * その年度の変更を取り消す (前の年度の区分に戻す)。
 * 戻した結果、次の年度の変更が要らなくなれば一緒に落ちる。
 */
export function resetAffiliation(changes, names, year, partTimeNames) {
  return replaceFor(changes, names, partTimeNames, (_name, list) =>
    list.filter((c) => c.fromYear !== year)
  );
}

// ─── 一覧に出す講師 ─────────────────────────────────────────────────

/**
 * その年度に時間割のコマを持つ講師 (隔週のパートナーを含む)。時間割の
 * 有効期間が年度にかかるコマだけ見る (何年も前の時間割の講師を並べない)。
 * 有効期間の無い時間割は常に有効。
 */
export function teacherNamesForYear(slots, timetables, year) {
  const { start, end } = fiscalYearRange(year);
  const ttById = new Map((timetables || []).map((t) => [t.id, t]));
  const names = new Set();
  for (const s of slots || []) {
    const tt = ttById.get(s.timetableId ?? 1);
    if (tt) {
      if (tt.startDate && isValidDateStr(tt.startDate) && tt.startDate > end) continue;
      if (tt.endDate && isValidDateStr(tt.endDate) && tt.endDate < start) continue;
    }
    // 年度の中の担当 (担当の切り替えの前後どちらも)
    for (const t of slotTeacherNamesBetween(s, start, end)) names.add(t);
  }
  return names;
}

// ─── 退職した講師 ───────────────────────────────────────────────────

/**
 * その年度に「退職・非表示」の講師。登録 (変更) のある人だけを見る
 * (登録の無い人は退職ではない)
 * @returns {Set<string>}
 */
export function retiredNamesForYear(changes, year) {
  const out = new Set();
  if (!Number.isInteger(year)) return out;
  const index = indexAffiliationChanges(changes);
  for (const name of index.keys()) {
    if (resolveAffiliation(index, name, year).category === RETIRED_CATEGORY) out.add(name);
  }
  return out;
}
