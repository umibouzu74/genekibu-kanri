// ─── 他校舎の授業 (OffsiteLesson) ──────────────────────────────────
// 講師が決まった曜日・時刻に、別の校舎・学校へ授業をしに行く予定。
//   「石原: 村上高松 火・木 14:50-15:40 (10/1〜未定)」
// 講師 1 人 × 行き先 × 曜日 × 時刻 × 期間 で 1 件 (types.d.ts の OffsiteLesson)。
//
// **塾の授業ではない**ので、時間割のコマ (Slot) にも追加授業 (ExtraLesson)
// にもしない。Slot にするとダッシュボード・タイムテーブル・第N回・表示期間の
// 全部に塾の授業として並び、ExtraLesson にすると終わりの決まっていない毎週の
// 予定を日付の数だけ登録することになる (しかも塾の授業として出る)。
//
// この予定を見るところ (どれもこのモジュールの関数を通す):
//   - 講師別の月間カレンダー / 週間 … その講師の予定のカード
//   - 日別ダッシュボード / タイムテーブル … その日に他校舎へ出ている講師
//   - 講師の重なり (teacherConflicts) と代行候補 … その時間は他校舎にいる
//   - iCal エクスポート … 講師のカレンダーに毎週の予定として
// 第N回・表示期間 (displayCutoff)・塾の休講による授業停止には関与しない。
//
// 休みの日 (offsiteDayStatus):
//   - skipDates … 先方の行事・冬休みなど、この日は無い (日付を個別に指定)
//   - 塾の全体休講日 (祝日など) … 既定で休み。学校も祝日は休みなので、
//     休講日にまで「村上高松 14:50」と出ると紙面が嘘になる。塾が休みでも
//     行く予定だけ keepOnHolidays: true にする
//
// 時刻は "14:50-15:40"。終わりの時刻が決まっていなければ開始だけの
// "13:30" で持つ (終了未定)。終了未定の予定は「確かに重なる」とは言えない
// ので、講師の重なり警告には出さず、代行候補に注意書きとして出すだけにする
// (offsiteOverlap の "maybe")。

import { DAYS } from "../constants/schools";
import { dateToDay, fmtDate, fmtMD, isValidDateStr, parseLocalDate } from "./dateHelpers";
import { isFullDayHoliday } from "./scheduleHelpers";
import { compareJa } from "./sortJa";

/** 他校舎の授業に指定できる曜日 (時間割と同じ 月〜土) */
export const OFFSITE_DAYS = DAYS;

const DAY_ORDER = new Map(DAYS.map((d, i) => [d, i]));

// ─── 時刻 ─────────────────────────────────────────────────────────

// "14:50" / "1450" / "9:05" → 分。読めなければ null
function parseHM(token) {
  const t = String(token || "").replace(".", ":");
  const m = /^(\d{1,2}):(\d{2})$/.exec(t) || /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function fmtHM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * 入力された時間を保存形 ("14:50-15:40" / 終了未定は "13:30") に整える。
 * 全角数字・「〜」「ー」などの区切り・空白のゆれを吸収する (IME の素の入力
 * "１４：５０〜１５：４０" をそのまま受ける)。
 * @param {string} input
 * @returns {{ok: true, time: string} | {ok: false, error: string}}
 */
export function normalizeOffsiteTime(input) {
  const s = String(input ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    // 〜 (U+301C) ~ (NFKC 後の ～) − – — ― ‐ ー (長音) を区切りの "-" に
    .replace(/[〜~−–—―‐ー]/g, "-");
  if (!s) return { ok: false, error: "時間を入力してください (例: 14:50-15:40)" };
  const parts = s.split("-");
  // "13:30-" (終了未定) は末尾の空要素を落とす
  if (parts.length === 2 && parts[1] === "") parts.pop();
  if (parts.length > 2) {
    return { ok: false, error: "時間は「14:50-15:40」の形で入力してください" };
  }
  const start = parseHM(parts[0]);
  if (start == null) {
    return { ok: false, error: "開始時刻が読めません (例: 14:50-15:40)" };
  }
  if (parts.length === 1) return { ok: true, time: fmtHM(start) };
  const end = parseHM(parts[1]);
  if (end == null) {
    return { ok: false, error: "終了時刻が読めません (未定なら開始だけ「13:30」)" };
  }
  if (end <= start) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }
  return { ok: true, time: `${fmtHM(start)}-${fmtHM(end)}` };
}

/**
 * 保存形の時刻 → {start, end} (分)。終了未定は end: null。読めなければ null。
 * @param {string} time
 */
export function offsiteTimeRange(time) {
  const [a, b] = String(time || "").split("-");
  const start = parseHM(a);
  if (start == null) return null;
  const end = parseHM(b);
  return { start, end: end != null && end > start ? end : null };
}

/** 終了時刻が決まっていない予定か */
export function isOpenEndedTime(time) {
  const r = offsiteTimeRange(time);
  return !!r && r.end == null;
}

/** "14:50-15:40" / 終了未定は "13:30〜 (終了未定)" */
export function formatOffsiteTime(time) {
  const r = offsiteTimeRange(time);
  if (!r) return String(time || "");
  return r.end == null ? `${fmtHM(r.start)}〜 (終了未定)` : `${fmtHM(r.start)}-${fmtHM(r.end)}`;
}

/** カードの見出し用の開始時刻 ("14:50" / 終了未定は "13:30〜") */
export function offsiteStartText(time) {
  const r = offsiteTimeRange(time);
  if (!r) return String(time || "");
  return r.end == null ? `${fmtHM(r.start)}〜` : fmtHM(r.start);
}

/**
 * 他校舎の予定 (offsiteTime) と塾のコマの時刻 (slotTime) が重なるか。
 *   "overlap" … 確かに重なる (半開区間。終了未定でも、コマの最中に他校舎が
 *               始まる / 開始が同時刻なら確か)
 *   "maybe"   … 他校舎の終了時刻が未定で、コマがその開始より後に始まる
 *   null      … 重ならない / 読めない
 * @param {string} offsiteTime
 * @param {string} slotTime "19:50-20:35" (終了無しは点)
 */
export function offsiteOverlap(offsiteTime, slotTime) {
  const o = offsiteTimeRange(offsiteTime);
  const s = offsiteTimeRange(slotTime);
  if (!o || !s) return null;
  if (s.start === o.start) return "overlap";
  if (o.end == null) {
    if (s.start > o.start) return "maybe";
    // コマが先に始まる: 他校舎の開始がコマの最中なら確かに重なる
    return s.end != null && s.end > o.start ? "overlap" : null;
  }
  if (s.end == null) return s.start > o.start && s.start < o.end ? "overlap" : null;
  return s.start < o.end && o.start < s.end ? "overlap" : null;
}

// ─── 曜日・期間 ───────────────────────────────────────────────────

/** 曜日を時間割の順 (月→土) に並べ、重複と範囲外を落とす */
export function sortOffsiteDays(days) {
  return [...new Set((days || []).filter((d) => DAY_ORDER.has(d)))].sort(
    (a, b) => DAY_ORDER.get(a) - DAY_ORDER.get(b)
  );
}

/** "火・木" */
export function formatOffsiteDays(days) {
  return sortOffsiteDays(days).join("・");
}

/**
 * 期間の表示。"10/1〜未定" / "10/1〜10/13"。年をまたぐときだけ年を付ける
 * ("2026/10/14〜2027/3/31")。
 * @param {{startDate?: string, endDate?: string}} rec
 */
export function formatOffsitePeriod(rec) {
  const start = rec?.startDate || "";
  const end = rec?.endDate || "";
  const crossYear = !!end && start.slice(0, 4) !== end.slice(0, 4);
  const s = fmtMD(start, { withYear: crossYear });
  return `${s}〜${end ? fmtMD(end, { withYear: crossYear }) : "未定"}`;
}

/** "村上高松 火・木 14:50-15:40" (withTeacher で先頭に "石原: ") */
export function describeOffsite(rec, { withTeacher = false } = {}) {
  const body = `${rec?.place || ""} ${formatOffsiteDays(rec?.days)} ${formatOffsiteTime(rec?.time)}`;
  return withTeacher && rec?.teacher ? `${rec.teacher}: ${body}` : body;
}

// ─── その日に行くか ───────────────────────────────────────────────

// 全体休講日の集合。holidays は state の配列で参照が安定しているので、
// 配列ごとに 1 回だけ作る (月間カレンダーが 1 セルごとに引くため)。
const fullHolidayCache = new WeakMap();
const EMPTY_SET = new Set();
function fullHolidayDates(holidays) {
  if (!Array.isArray(holidays) || holidays.length === 0) return EMPTY_SET;
  let set = fullHolidayCache.get(holidays);
  if (!set) {
    set = new Set(holidays.filter(isFullDayHoliday).map((h) => h.date));
    fullHolidayCache.set(holidays, set);
  }
  return set;
}

/**
 * その日がこの予定にとって何の日か。
 *   "on"      … 他校舎へ行く日
 *   "skip"    … 曜日・期間は合うが、休みにした日 (skipDates)
 *   "holiday" … 曜日・期間は合うが、塾の全体休講日 (keepOnHolidays でない)
 *   null      … 曜日違い / 期間外
 * @param {object} rec OffsiteLesson
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {Array} [holidays]
 */
export function offsiteDayStatus(rec, dateStr, holidays) {
  if (!rec || !dateStr) return null;
  if (!rec.startDate || dateStr < rec.startDate) return null;
  if (rec.endDate && dateStr > rec.endDate) return null;
  const dow = dateToDay(dateStr);
  if (!dow || !(rec.days || []).includes(dow)) return null;
  if ((rec.skipDates || []).includes(dateStr)) return "skip";
  if (!rec.keepOnHolidays && fullHolidayDates(holidays).has(dateStr)) return "holiday";
  return "on";
}

/** その日に他校舎へ行くか */
export function isOffsiteOnDate(rec, dateStr, holidays) {
  return offsiteDayStatus(rec, dateStr, holidays) === "on";
}

// 同じ日の並び: 開始時刻 → 行き先 → id (登録順)。講師名の並びはよみが
// 要るので (CLAUDE.md「講師の並び順は よみ だけが頼り」)、名前で並べる
// 画面が sortTeacherNames で揃える
function compareOffsite(a, b) {
  const ra = offsiteTimeRange(a.time);
  const rb = offsiteTimeRange(b.time);
  return (
    (ra?.start ?? 0) - (rb?.start ?? 0) ||
    compareJa(a.place || "", b.place || "") ||
    a.id - b.id
  );
}

/**
 * その日に他校舎へ行く予定 (開始時刻順)。teacher を渡すとその講師の分だけ。
 * @param {Array} list
 * @param {string} dateStr
 * @param {{teacher?: string|null, holidays?: Array}} [opts]
 */
export function offsiteLessonsOnDate(list, dateStr, { teacher = null, holidays = [] } = {}) {
  if (!Array.isArray(list) || !dateStr) return [];
  return list
    .filter(
      (r) =>
        (teacher == null || r.teacher === teacher) &&
        isOffsiteOnDate(r, dateStr, holidays)
    )
    .sort(compareOffsite);
}

/**
 * 日付 → その日の予定 (開始時刻順) の Map。月間カレンダーのように日付ごとに
 * 引くビュー用 (indexExtraLessonsByDate と同型)。
 * @param {Array} list
 * @param {{teacher?: string|null, holidays?: Array, from: string, to: string}} opts
 */
export function indexOffsiteLessonsByDate(list, { teacher = null, holidays = [], from, to } = {}) {
  const m = new Map();
  if (!Array.isArray(list) || list.length === 0 || !from || !to) return m;
  const recs = list.filter(
    (r) =>
      (teacher == null || r.teacher === teacher) &&
      r.startDate &&
      r.startDate <= to &&
      (!r.endDate || r.endDate >= from)
  );
  if (recs.length === 0) return m;
  for (const d of eachDate(from, to)) {
    const hits = recs.filter((r) => isOffsiteOnDate(r, d, holidays));
    if (hits.length > 0) m.set(d, hits.sort(compareOffsite));
  }
  return m;
}

function* eachDate(from, to) {
  const cur = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (!cur || !end) return;
  while (cur <= end) {
    yield fmtDate(cur);
    cur.setDate(cur.getDate() + 1);
  }
}

/**
 * 予定の期間のうち [from, to] に入る、曜日の合う日の一覧と状態。
 * 画面の「日程」(休みの日を選ぶ) と回数の数え上げに使う。
 * @returns {{date: string, status: "on"|"skip"|"holiday"}[]}
 */
export function listOffsiteDates(rec, { from, to, holidays = [] } = {}) {
  if (!rec?.startDate) return [];
  const lo = from && from > rec.startDate ? from : rec.startDate;
  const hi = rec.endDate && (!to || rec.endDate < to) ? rec.endDate : to;
  if (!hi || hi < lo) return [];
  const out = [];
  for (const d of eachDate(lo, hi)) {
    const status = offsiteDayStatus(rec, d, holidays);
    if (status) out.push({ date: d, status });
  }
  return out;
}

/**
 * 今日から見た予定の状態。
 *   "upcoming" … まだ始まっていない / "active" … 期間中 / "ended" … 終了
 */
export function offsiteStatus(rec, todayStr) {
  if (rec?.endDate && rec.endDate < todayStr) return "ended";
  if (rec?.startDate && rec.startDate > todayStr) return "upcoming";
  return "active";
}

/**
 * 次に行く日 (todayStr 当日を含む)。終了日未定でも 1 年先までしか探さない。
 * @returns {string|null}
 */
export function nextOffsiteDate(rec, todayStr, holidays) {
  const base = parseLocalDate(todayStr);
  if (!rec || !base) return null;
  const limit = new Date(base);
  limit.setFullYear(limit.getFullYear() + 1);
  const hit = listOffsiteDates(rec, { from: todayStr, to: fmtDate(limit), holidays }).find(
    (x) => x.status === "on"
  );
  return hit ? hit.date : null;
}

// ─── 予定の重なり ─────────────────────────────────────────────────

/**
 * その講師がその日・その時刻に他校舎へ出ている予定。
 * 確かに重なるもの (overlap) と、終了未定で重なるかもしれないもの (maybe)。
 * @returns {{rec: object, kind: "overlap"|"maybe"}[]}
 */
export function offsiteConflictsAt(list, teacher, dateStr, slotTime, holidays) {
  if (!teacher) return [];
  const out = [];
  for (const rec of offsiteLessonsOnDate(list, dateStr, { teacher, holidays })) {
    const kind = offsiteOverlap(rec.time, slotTime);
    if (kind) out.push({ rec, kind });
  }
  return out;
}

/**
 * 講師名 → その日の予定 の Map (代行候補を 1 人ずつ引くため)。
 * @returns {Map<string, object[]>}
 */
export function offsiteByTeacherOnDate(list, dateStr, holidays) {
  const m = new Map();
  for (const rec of offsiteLessonsOnDate(list, dateStr, { holidays })) {
    if (!m.has(rec.teacher)) m.set(rec.teacher, []);
    m.get(rec.teacher).push(rec);
  }
  return m;
}

/** "他校舎: 村上高松 14:50-15:40" (代行候補の注意書き) */
export function describeOffsiteBusy(rec) {
  return `他校舎: ${rec.place} ${formatOffsiteTime(rec.time)}`;
}

// ─── 入力 ─────────────────────────────────────────────────────────

/** フォームの空の下書き (登録後も行き先・時間・期間は残して続けて入れる) */
export function emptyOffsiteDraft(todayStr = "") {
  return {
    teacher: "",
    place: "",
    days: [],
    time: "",
    startDate: todayStr,
    endDate: "",
    keepOnHolidays: false,
    memo: "",
  };
}

/** 保存済みの 1 件 → フォームの下書き */
export function draftFromOffsite(rec) {
  return {
    teacher: rec.teacher || "",
    place: rec.place || "",
    days: sortOffsiteDays(rec.days),
    time: rec.time || "",
    startDate: rec.startDate || "",
    endDate: rec.endDate || "",
    keepOnHolidays: !!rec.keepOnHolidays,
    memo: rec.memo || "",
  };
}

/**
 * 下書きを確かめる。講師は「石原・片岡」のように複数書ける (1 人 1 件で
 * 登録する。区切りは splitTeacherField と同じ "·" / "・" / "･")。
 * @param {object} draft
 * @param {{splitTeachers: (s: string) => string[], editing?: boolean}} opts
 * @returns {{ok: true, teachers: string[], time: string} | {ok: false, error: string, field: string}}
 */
export function validateOffsiteDraft(draft, { splitTeachers, editing = false }) {
  const teachers = splitTeachers(draft.teacher || "");
  if (teachers.length === 0) {
    return { ok: false, field: "teacher", error: "講師を入力してください" };
  }
  if (editing && teachers.length > 1) {
    return { ok: false, field: "teacher", error: "編集では講師は 1 人だけにしてください" };
  }
  if (!String(draft.place || "").trim()) {
    return { ok: false, field: "place", error: "行き先 (校舎名) を入力してください" };
  }
  if (sortOffsiteDays(draft.days).length === 0) {
    return { ok: false, field: "days", error: "曜日を 1 つ以上選んでください" };
  }
  const t = normalizeOffsiteTime(draft.time);
  if (!t.ok) return { ok: false, field: "time", error: t.error };
  if (!isValidDateStr(draft.startDate || "")) {
    return { ok: false, field: "startDate", error: "開始日を入れてください" };
  }
  if (draft.endDate) {
    if (!isValidDateStr(draft.endDate)) {
      return { ok: false, field: "endDate", error: "終了日の形式が正しくありません" };
    }
    if (draft.endDate < draft.startDate) {
      return { ok: false, field: "endDate", error: "終了日は開始日以降にしてください" };
    }
  }
  return { ok: true, teachers, time: t.time };
}

// 下書き → 保存する項目。**undefined を入れない** (Firebase の set() が例外を
// 投げる)。終了日未定・メモなし・休みの日なしはキーごと持たない
function recordFields(draft, teacher, time) {
  const memo = String(draft.memo || "").trim();
  return {
    teacher,
    place: String(draft.place || "").trim(),
    days: sortOffsiteDays(draft.days),
    time,
    startDate: draft.startDate,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    ...(draft.keepOnHolidays ? { keepOnHolidays: true } : {}),
    ...(memo ? { memo } : {}),
  };
}

/**
 * 新しく登録する (講師ごとに 1 件)。validateOffsiteDraft を通した後に呼ぶ。
 * @returns {{list: object[], added: object[]}}
 */
export function addOffsiteLessons(list, draft, { teachers, time, nextId, nowIso }) {
  let id = nextId;
  const added = teachers.map((teacher) => ({
    id: id++,
    ...recordFields(draft, teacher, time),
    createdAt: nowIso,
  }));
  return { list: [...(list || []), ...added], added };
}

/**
 * 1 件を書き換える。休みの日 (skipDates) は期間の外に出たものだけ落として
 * 引き継ぐ (曜日や時刻を直しただけで、選んだ休みが消えないように)。
 */
export function updateOffsiteLesson(list, id, draft, { teacher, time, nowIso }) {
  return (list || []).map((r) => {
    if (r.id !== id) return r;
    const fields = recordFields(draft, teacher, time);
    const skips = (r.skipDates || []).filter(
      (d) => d >= fields.startDate && (!fields.endDate || d <= fields.endDate)
    );
    return {
      id: r.id,
      ...fields,
      ...(skips.length > 0 ? { skipDates: skips } : {}),
      ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      updatedAt: nowIso,
    };
  });
}

/** その日の「休み」を切り替える (日程のチップから) */
export function toggleOffsiteSkipDate(rec, dateStr) {
  const set = new Set(rec.skipDates || []);
  if (set.has(dateStr)) set.delete(dateStr);
  else set.add(dateStr);
  const skipDates = [...set].sort();
  const { skipDates: _drop, ...rest } = rec;
  return skipDates.length > 0 ? { ...rest, skipDates } : rest;
}

/**
 * [from, to] のうち、この予定の曜日に当たる日をまとめて休みにする
 * (冬休みなど)。増えた日数も返す。
 */
export function addOffsiteSkipRange(rec, from, to) {
  if (!isValidDateStr(from || "") || !isValidDateStr(to || "") || to < from) {
    return { rec, added: 0 };
  }
  const set = new Set(rec.skipDates || []);
  let added = 0;
  for (const d of eachDate(from, to)) {
    if (d < rec.startDate || (rec.endDate && d > rec.endDate)) continue;
    const dow = dateToDay(d);
    if (!dow || !(rec.days || []).includes(dow)) continue;
    if (!set.has(d)) {
      set.add(d);
      added++;
    }
  }
  if (added === 0) return { rec, added };
  return { rec: { ...rec, skipDates: [...set].sort() }, added };
}

/** これまでに登録した行き先 (入力候補。並びは五十音、使用頻度では並べない) */
export function knownOffsitePlaces(list) {
  return [...new Set((list || []).map((r) => (r.place || "").trim()).filter(Boolean))].sort(
    compareJa
  );
}

/** これまでに登録した時間 (入力候補。開始時刻順) */
export function knownOffsiteTimes(list) {
  return [...new Set((list || []).map((r) => r.time).filter(Boolean))].sort(
    (a, b) => (offsiteTimeRange(a)?.start ?? 0) - (offsiteTimeRange(b)?.start ?? 0) || compareJa(a, b)
  );
}

// ─── 読み込み ─────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 保存データを整える (useSyncedStorage の migrate / インポート)。
 * RTDB は空配列 (days / skipDates) を消して返すので補い、型を揃える。
 * 講師・行き先・開始日の無いものは表示も判定もできないので落とす。
 * undefined を含めない (Firebase の set() が例外を投げる)。冪等。
 */
export function migrateOffsiteLessons(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const id = Number(r.id);
    const teacher = typeof r.teacher === "string" ? r.teacher.trim() : "";
    const place = typeof r.place === "string" ? r.place.trim() : "";
    const startDate = typeof r.startDate === "string" ? r.startDate : "";
    if (!Number.isFinite(id) || !teacher || !place || !ISO_DATE_RE.test(startDate)) continue;
    const endDate =
      typeof r.endDate === "string" && ISO_DATE_RE.test(r.endDate) ? r.endDate : "";
    const skipDates = Array.isArray(r.skipDates)
      ? [...new Set(r.skipDates.filter((d) => typeof d === "string" && ISO_DATE_RE.test(d)))].sort()
      : [];
    const memo = typeof r.memo === "string" ? r.memo.trim() : "";
    out.push({
      id,
      teacher,
      place,
      days: sortOffsiteDays(Array.isArray(r.days) ? r.days : []),
      time: typeof r.time === "string" ? r.time : "",
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(skipDates.length > 0 ? { skipDates } : {}),
      ...(r.keepOnHolidays === true ? { keepOnHolidays: true } : {}),
      ...(memo ? { memo } : {}),
      ...(typeof r.createdAt === "string" ? { createdAt: r.createdAt } : {}),
      ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
    });
  }
  return out;
}
