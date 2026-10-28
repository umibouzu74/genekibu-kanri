// ─── 高校部・予備校の講習 (SeniorKoshu、2026-10-27) ──────────────────
// 冬期・春期・夏期の高校部 (高1・高2 / 高3) と予備校の講習の担当を、本体に 1 か所で
// 登録する。以前は講習時間割作成 (中学の講習) の「他学年セッション」に、中学の講師
// 一覧にいる先生の分だけを手で入れていたので:
//   - 高校・予備校だけの先生 (伊藤・藤本・本澤…) の講習はどこにも出なかった
//   - 中学の講習が無い日 (12/24 の高3 Ⅰ期の初日など) は登録も表示もできなかった
//   - 同じ内容を講習時間割作成と本体で二度打つことになった
//
// 形 (types.d.ts の SeniorKoshuData):
//   期 (terms)      … 「高3 Ⅰ期」と、その期の日 (YYYY-MM-DD の並び)
//   時限 (periods)  … 「予備校３限」と時刻 ("12:25-13:35"。offsiteLessons と同じ形)
//   担当 (lessons)  … 講師 1 人 × 期 × 時限 × 学年 × 講座名。担当しない日 (skipDates) を
//                     外せる (理科基礎のように 2 科目を 2 日ずつ受け持つとき)
// 期と時限を別に持つのは、パンフレットの担当表が「期 × 時限 × 講座 × 講師」の形で、
// 期の日程や時限の時刻を直したときに担当を全部直さずに済むように。
//
// 出るところ:
//   - 本体の講師の月間の予定 (MonthView の「講」カード。学年と講座名)
//   - サイドバーの講師一覧 (時間割にコマの無い高校・予備校だけの先生も、これからの
//     講習があれば並べる)
//   - 講習時間割作成: ⚙ 講師不在・NG の「🎓 本体の高校・予備校の講習を取り込む」で、
//     その講習の日に当たる分を他学年セッション (自動NG) にする (押したときだけ。
//     取り込んだものは source で印を付け、本体の月間には二重に出さない)
//
// 塾の通常の授業 (Slot) ではないので、第N回・表示期間・休講日には関与しない。

import { WEEKDAYS } from "../constants/schools";
import { fmtDate, fmtMD, isValidDateStr, parseLocalDate } from "./dateHelpers";
import { normalizeOffsiteTime, offsiteStartText, offsiteTimeRange } from "./offsiteLessons";
import { parseFlexibleDate, parseTsvTable } from "./specialEventImport";

export const EMPTY_SENIOR_KOSHU = Object.freeze({ terms: [], periods: [], lessons: [] });

const str = (v) => (typeof v === "string" ? v.trim() : "");
const isPosInt = (v) => Number.isInteger(v) && v > 0;
/** 名前の比べ方 (全角半角・空白の違いを無視) */
export const nameKey = (s) => String(s ?? "").normalize("NFKC").replace(/\s+/g, "");

function sortedDates(list) {
  const out = [];
  for (const d of Array.isArray(list) ? list : []) {
    if (typeof d === "string" && isValidDateStr(d) && !out.includes(d)) out.push(d);
  }
  return out.sort();
}

// ─── 読み込み・形の確認 ─────────────────────────────────────────────

/**
 * 保存値 (RTDB は空の配列を消す)・バックアップを形にそろえる。崩れた期・時限は落とし、
 * 無い期・時限を指す担当も落とす。
 * @param {unknown} raw
 * @returns {import("../types").SeniorKoshuData}
 */
export function migrateSeniorKoshu(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const terms = [];
  const termIds = new Set();
  for (const t of Array.isArray(r.terms) ? r.terms : []) {
    if (!t || !isPosInt(t.id) || termIds.has(t.id) || !str(t.name)) continue;
    termIds.add(t.id);
    terms.push({ id: t.id, name: str(t.name), dates: sortedDates(t.dates) });
  }
  const periods = [];
  const periodIds = new Set();
  for (const p of Array.isArray(r.periods) ? r.periods : []) {
    if (!p || !isPosInt(p.id) || periodIds.has(p.id) || !str(p.name)) continue;
    periodIds.add(p.id);
    const t = normalizeOffsiteTime(p.time);
    periods.push({ id: p.id, name: str(p.name), time: t.ok ? t.time : "" });
  }
  const lessons = [];
  const lessonIds = new Set();
  for (const l of Array.isArray(r.lessons) ? r.lessons : []) {
    if (!l || !isPosInt(l.id) || lessonIds.has(l.id)) continue;
    if (!str(l.teacher) || !termIds.has(l.termId) || !periodIds.has(l.periodId)) continue;
    lessonIds.add(l.id);
    const term = terms.find((t) => t.id === l.termId);
    const skip = sortedDates(l.skipDates).filter((d) => term.dates.includes(d));
    lessons.push({
      id: l.id,
      teacher: str(l.teacher),
      termId: l.termId,
      periodId: l.periodId,
      ...(str(l.grade) ? { grade: str(l.grade) } : {}),
      course: str(l.course),
      ...(skip.length > 0 ? { skipDates: skip } : {}),
      ...(str(l.memo) ? { memo: str(l.memo) } : {}),
    });
  }
  return { terms, periods, lessons };
}

// ─── 表示 ───────────────────────────────────────────────────────────

const weekday = (d) => WEEKDAYS[parseLocalDate(d)?.getDay() ?? 0];

/** 期の日の表示: 続いていれば「12/24(木)〜12/27(日) 4日」、飛び飛びなら並べる */
export function formatTermDates(dates) {
  const list = sortedDates(dates);
  if (list.length === 0) return "日付なし";
  const md = (d) => `${fmtMD(d)}(${weekday(d)})`;
  if (list.length === 1) return md(list[0]);
  const first = parseLocalDate(list[0]);
  const last = parseLocalDate(list[list.length - 1]);
  const span = Math.round((last - first) / 86400000) + 1;
  if (span === list.length) return `${md(list[0])}〜${md(list[list.length - 1])} ${list.length}日`;
  if (list.length <= 6) return `${list.map(md).join("・")} ${list.length}日`;
  return `${md(list[0])}〜${md(list[list.length - 1])} のうち ${list.length}日`;
}

/** 担当の種別 (講習時間割作成のプリセットの名前と同じ「期 時限」) */
export function seniorKoshuKind(item) {
  return [item?.termName, item?.periodName].filter(Boolean).join(" ");
}

/** 担当の講座 (学年 + 講座名) */
export function seniorKoshuCourse(item) {
  return [item?.grade, item?.course].filter(Boolean).join(" ");
}

/** 担当する日 (期の日 − 外した日) */
export function lessonDates(data, lesson) {
  const term = (data?.terms || []).find((t) => t.id === lesson?.termId);
  if (!term) return [];
  const skip = new Set(lesson.skipDates || []);
  return term.dates.filter((d) => !skip.has(d));
}

/**
 * 担当を日付ごとの予定に広げる (日付 → 開始時刻 → 講師の順)。
 * @returns {Array<{key: string, lessonId: number, teacher: string, date: string, time: string,
 *   termName: string, periodName: string, grade: string, course: string, memo: string}>}
 */
export function expandSeniorKoshu(data) {
  const terms = new Map((data?.terms || []).map((t) => [t.id, t]));
  const periods = new Map((data?.periods || []).map((p) => [p.id, p]));
  const out = [];
  for (const l of data?.lessons || []) {
    const term = terms.get(l.termId);
    const period = periods.get(l.periodId);
    if (!term || !period) continue;
    for (const date of lessonDates(data, l)) {
      out.push({
        key: `${l.id}:${date}`,
        lessonId: l.id,
        teacher: l.teacher,
        date,
        time: period.time || "",
        termName: term.name,
        periodName: period.name,
        grade: l.grade || "",
        course: l.course || "",
        memo: l.memo || "",
      });
    }
  }
  const startOf = (t) => offsiteTimeRange(t)?.start ?? 24 * 60;
  // 同じ日・同じ時刻は登録順 (講師名の並びは画面がよみ順で決める)
  return out.sort((a, b) => a.date.localeCompare(b.date) || startOf(a.time) - startOf(b.time) || a.lessonId - b.lessonId);
}

/** 日付 → その講師の予定 (teacher = null なら全員) */
export function indexSeniorKoshuByDate(items, teacher = null) {
  const m = new Map();
  for (const it of items || []) {
    if (teacher != null && it.teacher !== teacher) continue;
    if (!m.has(it.date)) m.set(it.date, []);
    m.get(it.date).push(it);
  }
  return m;
}

/** fromYmd 以降に担当のある講師 (サイドバーに並べる) */
export function seniorKoshuTeachersFrom(items, fromYmd) {
  const out = new Set();
  for (const it of items || []) if (it.date >= fromYmd) out.add(it.teacher);
  return out;
}

/** カードの見出しの開始時刻 */
export function seniorKoshuStartText(item) {
  return item?.time ? offsiteStartText(item.time) : "";
}

/**
 * 講習時間割作成の他学年セッションと同じ予定か (講師・日・時刻)。本体の月間で、
 * 講習時間割作成に手で入れた他学年セッションを二重に出さないための比べ方
 */
export function sameAsSeniorKoshu(item, { teacher, date, time }) {
  if (item.teacher !== teacher || item.date !== date) return false;
  const a = offsiteTimeRange(item.time);
  const b = offsiteTimeRange(time);
  // 開始が同じなら同じ予定 (終わりは片方に無ければ比べない。手で入れた「12:25」と本体の
  // 「12:25-13:35」を別の予定として二重に出さない)
  return !!a && !!b && a.start === b.start && (a.end == null || b.end == null || a.end === b.end);
}

/**
 * 講師の月間に出す講習時間割作成のコマから、本体の高校・予備校の講習と同じ講師・日・時刻の
 * 「外」(講習時間割作成に手で入れた他学年セッション) を除く (本体の「講」カードと二重になる)
 * @param {import("../types").KoshuLesson[]} koshuLessons
 * @param {ReturnType<typeof expandSeniorKoshu>} items
 */
export function dropLessonsCoveredBySeniorKoshu(koshuLessons, items) {
  if (!items || items.length === 0) return koshuLessons;
  const byTeacherDate = new Map();
  for (const it of items) {
    const k = `${it.teacher}|${it.date}`;
    if (!byTeacherDate.has(k)) byTeacherDate.set(k, []);
    byTeacherDate.get(k).push(it);
  }
  return koshuLessons.filter(
    (l) =>
      l.kind !== "external" ||
      !(byTeacherDate.get(`${l.teacher}|${l.date}`) || []).some((it) => sameAsSeniorKoshu(it, l))
  );
}

// ─── 直す (純関数) ─────────────────────────────────────────────────

/** 次の id。idFloor = この画面を開いてから見た最大の id (消した id を使い回すと 6 秒の
 * 「元に戻す」が効かなくなるので、それより後にする) */
export function nextSeniorId(list, idFloor = 0) {
  return Math.max((list || []).reduce((m, x) => Math.max(m, x?.id || 0), 0), idFloor || 0) + 1;
}

/** 期を作る / 直す。名前が重なる (別の期と同じ) ときは { error } */
export function upsertTerm(data, { id = null, name, dates }, { idFloor = 0 } = {}) {
  const n = str(name);
  if (!n) return { error: "期の名前を入れてください" };
  if (data.terms.some((t) => t.id !== id && nameKey(t.name) === nameKey(n))) {
    return { error: `「${n}」という期はもうあります` };
  }
  const list = sortedDates(dates);
  if (id == null) {
    const term = { id: nextSeniorId(data.terms, idFloor), name: n, dates: list };
    return { data: { ...data, terms: [...data.terms, term] }, term };
  }
  const terms = data.terms.map((t) => (t.id === id ? { ...t, name: n, dates: list } : t));
  // 期の日から外れた日は、担当の「外した日」からも外す
  const lessons = data.lessons.map((l) => {
    if (l.termId !== id || !l.skipDates) return l;
    const skip = l.skipDates.filter((d) => list.includes(d));
    if (skip.length === l.skipDates.length) return l;
    const { skipDates: _old, ...rest } = l;
    return skip.length > 0 ? { ...rest, skipDates: skip } : rest;
  });
  return { data: { ...data, terms, lessons } };
}

/** 期を消す (その期の担当も消える) */
export function removeTerm(data, id) {
  return {
    ...data,
    terms: data.terms.filter((t) => t.id !== id),
    lessons: data.lessons.filter((l) => l.termId !== id),
  };
}

/** 時限を作る / 直す。時刻は「12:25-13:35」(全角・「〜」も可) */
export function upsertPeriod(data, { id = null, name, time }, { idFloor = 0 } = {}) {
  const n = str(name);
  if (!n) return { error: "時限の名前を入れてください" };
  if (data.periods.some((p) => p.id !== id && nameKey(p.name) === nameKey(n))) {
    return { error: `「${n}」という時限はもうあります` };
  }
  const t = normalizeOffsiteTime(time);
  if (!t.ok) return { error: t.error };
  if (id == null) {
    const period = { id: nextSeniorId(data.periods, idFloor), name: n, time: t.time };
    return { data: { ...data, periods: [...data.periods, period] }, period };
  }
  return { data: { ...data, periods: data.periods.map((p) => (p.id === id ? { ...p, name: n, time: t.time } : p)) } };
}

/** 時限を消す (その時限の担当も消える) */
export function removePeriod(data, id) {
  return {
    ...data,
    periods: data.periods.filter((p) => p.id !== id),
    lessons: data.lessons.filter((l) => l.periodId !== id),
  };
}

const lessonKey = (l) =>
  JSON.stringify([l.teacher, l.termId, l.periodId, nameKey(l.grade || ""), nameKey(l.course || "")]);

/** 担当を足す (講師 × 期 × 時限 × 学年 × 講座名が同じものは飛ばす)。{ data, added, skipped } */
export function addSeniorLessons(data, drafts, { idFloor = 0 } = {}) {
  const seen = new Set(data.lessons.map(lessonKey));
  let id = nextSeniorId(data.lessons, idFloor);
  const added = [];
  let skipped = 0;
  for (const d of drafts || []) {
    const lesson = {
      id,
      teacher: str(d.teacher),
      termId: d.termId,
      periodId: d.periodId,
      ...(str(d.grade) ? { grade: str(d.grade) } : {}),
      course: str(d.course),
      ...(d.skipDates && d.skipDates.length > 0 ? { skipDates: sortedDates(d.skipDates) } : {}),
      ...(str(d.memo) ? { memo: str(d.memo) } : {}),
    };
    if (!lesson.teacher) continue;
    const key = lessonKey(lesson);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    added.push(lesson);
    id++;
  }
  return { data: { ...data, lessons: [...data.lessons, ...added] }, added, skipped };
}

/** 担当を直す (学年・講座名・講師・メモ・期・時限) */
export function updateSeniorLesson(data, id, patch) {
  const lessons = data.lessons.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l };
    for (const k of ["teacher", "course"]) if (k in patch) next[k] = str(patch[k]);
    for (const k of ["grade", "memo"]) {
      if (!(k in patch)) continue;
      if (str(patch[k])) next[k] = str(patch[k]);
      else delete next[k];
    }
    for (const k of ["termId", "periodId"]) if (k in patch && isPosInt(patch[k])) next[k] = patch[k];
    if (next.termId !== l.termId) delete next.skipDates;
    return next;
  });
  return { ...data, lessons };
}

/** 担当しない日を外す / 戻す */
export function toggleLessonSkip(data, id, date) {
  const lessons = data.lessons.map((l) => {
    if (l.id !== id) return l;
    const current = l.skipDates || [];
    const next = current.includes(date) ? current.filter((d) => d !== date) : sortedDates([...current, date]);
    const { skipDates: _old, ...rest } = l;
    return next.length > 0 ? { ...rest, skipDates: next } : rest;
  });
  return { ...data, lessons };
}

// ─── 日付の並び・期間 ───────────────────────────────────────────────

const shiftYear = (ymd, n) => `${Number(ymd.slice(0, 4)) + n}${ymd.slice(4)}`;

/**
 * 「12/24〜12/27」「12/24・25・26」「2026-12-24」を YYYY-MM-DD の並びに。期間は
 * 日曜を除く (日曜も入れるときは日付を並べて書く)。年は年度から補い (4〜12 月は
 * その年度の年、1〜3 月は翌年)、月日だけの日付が前の日付より前になったら次の年として
 * 読む (春期の「3/26〜4/3」「3/30・3/31・4/1」が 1 年ずれないように)。
 * @returns {{ dates: string[], unknown: string[] }}
 */
export function parseDateListYmd(raw, fiscalYear) {
  const dates = [];
  const unknown = [];
  let prevMonth = null;
  let prev = null;
  const one = (token) => {
    let t = token.trim();
    if (/^\d{1,2}(日)?(\([日月火水木金土]\))?$/.test(t) && prevMonth != null) t = `${prevMonth}/${t.replace(/日|\(.\)/g, "")}`;
    let ymd = parseFlexibleDate(t, fiscalYear);
    // 年を書いていない日付は、前の日付より前なら次の年
    if (ymd && prev && ymd < prev && !/\d{4}/.test(t)) ymd = shiftYear(ymd, 1);
    if (ymd) {
      prevMonth = Number(ymd.slice(5, 7));
      prev = ymd;
    }
    return ymd;
  };
  String(raw ?? "")
    .normalize("NFKC")
    // 「12/24 (木)」の曜日 (前の空白ごと) を落としてから区切る
    .replace(/\s*\(\s*[日月火水木金土]\s*\)/g, "")
    .replace(/\s*[〜~～]\s*/g, "〜")
    .split(/[・･·、,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((token) => {
      const parts = token.split("〜");
      if (parts.length === 1) {
        const d = one(token);
        if (d) dates.push(d);
        else unknown.push(token);
        return;
      }
      const from = parts.length === 2 ? one(parts[0]) : null;
      const to = from ? one(parts[1]) : null;
      if (!from || !to || to < from) {
        unknown.push(token);
        return;
      }
      for (let d = parseLocalDate(from); fmtDate(d) <= to; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0) dates.push(fmtDate(d));
      }
    });
  return { dates: sortedDates(dates), unknown };
}

/**
 * 担当しない日を期の日にそろえる (月日だけの日付の年を、期の日に当たる方へ ±1 年)。
 * 期の日に無い日はそのまま返す (呼び出し側で「期の日ではありません」と出す)
 */
export function alignDatesToTerm(dates, termDates) {
  const inTerm = new Set(termDates || []);
  return sortedDates(
    (dates || []).map((d) => {
      if (inTerm.has(d)) return d;
      const next = shiftYear(d, 1);
      if (inTerm.has(next)) return next;
      const before = shiftYear(d, -1);
      return inTerm.has(before) ? before : d;
    })
  );
}

// ─── 表でまとめて登録 ───────────────────────────────────────────────

/** 表の列 (1 行目の見出し。列の順は自由) */
export const SENIOR_KOSHU_COLUMNS = {
  teacher: ["講師", "講師名", "担当", "先生", "teacher"],
  term: ["期", "期間名", "term"],
  period: ["時限", "コマ", "period"],
  grade: ["学年", "対象", "grade"],
  course: ["講座名", "講座", "授業", "course"],
  skip: ["外す日", "担当しない日", "除く日", "skip"],
  memo: ["メモ", "備考", "memo"],
  dates: ["日付", "期の日", "日程", "dates"],
  time: ["時刻", "時間", "time"],
};

/** CSV の 1 行をタブ区切りに (引用符の中のカンマ・"" はそのまま、タブは空白に) */
export function csvLineToTsv(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.replace(/\t/g, " ")).join("\t");
}

/** 表の雛形 (見出し + 例) */
export const SENIOR_KOSHU_TEMPLATE = [
  ["講師", "期", "時限", "学年", "講座名", "外す日", "日付", "時刻"].join("\t"),
  ["伊藤", "高3 Ⅰ期", "予備校３限", "高3", "共通テスト理科基礎(物理基礎)", "12/26", "12/24〜12/26", "12:25-13:35"].join("\t"),
  ["藤本・本澤", "高3 Ⅰ期", "予備校１限", "高3", "共通テスト英語", "", "", "9:00-10:10"].join("\t"),
].join("\n");

/**
 * 表を読んで、足す担当・作る期・作る時限に分ける。期・時限は名前で既存のものに
 * 合わせ、無ければ「日付」「時刻」の列から作る (列が無ければその行は読めない)。
 * 講師は「・」「、」で何人でも (1 人 1 件)。
 * @param {string} text TSV (Excel・スプレッドシートからの貼り付け) か CSV
 * @param {{ data: import("../types").SeniorKoshuData, fiscalYear: number }} opts
 */
export function parseSeniorKoshuImport(text, { data, fiscalYear }) {
  const src = String(text ?? "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) || "";
  // CSV (タブの無い見出し) はタブ区切りに読み替える ("藤本,本澤" のような引用符の中の
  // カンマは区切りにしない)
  const tsv = !firstLine.includes("\t") && firstLine.includes(",")
    ? src.split(/\r?\n/).map(csvLineToTsv).join("\n")
    : src;
  const { rows, header } = parseTsvTable(tsv, SENIOR_KOSHU_COLUMNS);
  const errors = [];
  const newTerms = new Map(); // nameKey → { name, dates }
  const newPeriods = new Map(); // nameKey → { name, time }
  const drafts = [];
  const termByKey = new Map(data.terms.map((t) => [nameKey(t.name), t]));
  const periodByKey = new Map(data.periods.map((p) => [nameKey(p.name), p]));
  if (!header) {
    return { drafts, newTerms: [], newPeriods: [], errors: [{ line: 1, message: "1 行目に見出し (講師・期・時限・講座名…) を入れてください" }] };
  }
  for (const { line, cells } of rows) {
    const teachers = cells.teacher
      .normalize("NFKC")
      .split(/[・·･、,/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (teachers.length === 0) {
      errors.push({ line, message: "講師が空です" });
      continue;
    }
    if (!cells.term || !cells.period) {
      errors.push({ line, message: !cells.term ? "期が空です" : "時限が空です" });
      continue;
    }
    if (!cells.course) {
      errors.push({ line, message: "講座名が空です" });
      continue;
    }
    // 期 (新しく作る期・時限は、行がぜんぶ読めてから足す)
    const tk = nameKey(cells.term);
    let termDates = termByKey.get(tk)?.dates;
    let addTerm = null;
    let addPeriod = null;
    if (cells.dates) {
      const { dates, unknown } = parseDateListYmd(cells.dates, fiscalYear);
      if (unknown.length > 0 || dates.length === 0) {
        errors.push({ line, message: `日付「${cells.dates}」が読めません` });
        continue;
      }
      if (termByKey.has(tk)) {
        // 既にある期と日付が違っても、期の日付は書き換えない (期の画面で直す)
        if (JSON.stringify(termByKey.get(tk).dates) !== JSON.stringify(dates)) {
          errors.push({ line, message: `期「${cells.term}」はもうあり、日付が違います (期の日付は「期」の欄で直してください)` });
          continue;
        }
      } else if (newTerms.has(tk) && JSON.stringify(newTerms.get(tk).dates) !== JSON.stringify(dates)) {
        errors.push({ line, message: `期「${cells.term}」の日付が前の行と違います` });
        continue;
      } else if (!newTerms.has(tk)) {
        addTerm = { name: cells.term.trim(), dates };
      }
      termDates = dates;
    } else if (!termDates) {
      termDates = newTerms.get(tk)?.dates;
      if (!termDates) {
        errors.push({ line, message: `期「${cells.term}」がありません (先に期を作るか、日付の列を入れてください)` });
        continue;
      }
    }
    // 時限
    const pk = nameKey(cells.period);
    if (cells.time) {
      const t = normalizeOffsiteTime(cells.time);
      if (!t.ok) {
        errors.push({ line, message: `時刻「${cells.time}」: ${t.error}` });
        continue;
      }
      const existing = periodByKey.get(pk);
      if (existing && existing.time !== t.time) {
        errors.push({ line, message: `時限「${cells.period}」はもうあり、時刻が違います (時限の時刻は「時限」の欄で直してください)` });
        continue;
      }
      if (!existing) {
        const pending = newPeriods.get(pk);
        if (pending && pending.time !== t.time) {
          errors.push({ line, message: `時限「${cells.period}」の時刻が前の行と違います` });
          continue;
        }
        if (!pending) addPeriod = { name: cells.period.trim(), time: t.time };
      }
    } else if (!periodByKey.has(pk) && !newPeriods.has(pk)) {
      errors.push({ line, message: `時限「${cells.period}」がありません (先に時限を作るか、時刻の列を入れてください)` });
      continue;
    }
    // 外す日 (期の日だけ)
    let skipDates = [];
    if (cells.skip) {
      const parsedSkip = parseDateListYmd(cells.skip, fiscalYear);
      const unknown = parsedSkip.unknown;
      const dates = alignDatesToTerm(parsedSkip.dates, termDates);
      const outside = dates.filter((d) => !termDates.includes(d));
      if (unknown.length > 0 || outside.length > 0) {
        errors.push({
          line,
          message: unknown.length > 0
            ? `外す日「${cells.skip}」が読めません`
            : `外す日 ${outside.map((d) => fmtMD(d)).join("・")} は期「${cells.term}」の日ではありません`,
        });
        continue;
      }
      skipDates = dates;
    }
    if (addTerm) newTerms.set(tk, addTerm);
    if (addPeriod) newPeriods.set(pk, addPeriod);
    for (const teacher of teachers) {
      drafts.push({
        line,
        teacher,
        termKey: tk,
        periodKey: pk,
        grade: cells.grade,
        course: cells.course,
        skipDates,
        memo: cells.memo,
      });
    }
  }
  return { drafts, newTerms: [...newTerms.values()], newPeriods: [...newPeriods.values()], errors };
}

/**
 * 読んだ表を当てる: 期・時限を作ってから担当を足す。{ data, added, skipped, createdTerms, createdPeriods }
 */
export function applySeniorKoshuImport(data, parsed, { idFloors = {} } = {}) {
  let next = data;
  for (const t of parsed.newTerms) {
    const r = upsertTerm(next, { name: t.name, dates: t.dates }, { idFloor: idFloors.terms });
    if (r.data) next = r.data;
  }
  for (const p of parsed.newPeriods) {
    const r = upsertPeriod(next, { name: p.name, time: p.time }, { idFloor: idFloors.periods });
    if (r.data) next = r.data;
  }
  const termByKey = new Map(next.terms.map((t) => [nameKey(t.name), t.id]));
  const periodByKey = new Map(next.periods.map((p) => [nameKey(p.name), p.id]));
  const drafts = parsed.drafts
    .map((d) => ({ ...d, termId: termByKey.get(d.termKey), periodId: periodByKey.get(d.periodKey) }))
    .filter((d) => d.termId && d.periodId);
  const r = addSeniorLessons(next, drafts, { idFloor: idFloors.lessons });
  return {
    data: r.data,
    added: r.added,
    skipped: r.skipped,
    createdTerms: parsed.newTerms.length,
    createdPeriods: parsed.newPeriods.length,
  };
}
