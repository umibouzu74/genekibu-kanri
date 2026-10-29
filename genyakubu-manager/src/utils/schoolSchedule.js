// ─── 学校の考査・模試 (年間カレンダーの学校バッジ / 学校別タイムライン) ────
// 高校部は学校ごとにテストの日程が違う。テスト期間 (考査発表〜考査) と模試を
// 「データは全部入れて、画面では要約して見せる」ための純関数
// (components/views/YearCalendarView と yearCalendar/ の部品が使う)。
//
// まとめる対象 (それ以外は年間カレンダーで従来どおり 1 件ずつ出す):
//   - テスト期間: 授業を止めない (stopsClasses === false) かつ学校キーがある
//   - 特別イベント: 種別が模試 (mock) かつ学校キーがある
//
// 学校キー = 予約タグ (「希望者」と部のタグ) を除いた tags の先頭。新しい
// フィールドは作らない (ExamPeriod と SpecialEvent は同じタグ空間)。模試に
// 「希望者」タグがあれば希望者・冠模試として扱う (既定では出さず、出すときは
// 点線)。学校の並びはタグ名の五十音で固定 (使用頻度・履歴は使わない = A18)。
//
// 考査日 (ExamPeriod.examDates) は**表示専用**。授業停止 (scheduleHelpers.
// examPeriodStopsClassesOn)・特訓・隔週の週送り・第N回には使わない。
//
// 紙の大きさ「B4・A3」の表示 (2026-10-29) では、タイムラインの模試に名前と対象
// 学年の札 (buildSchoolTimeline の labelDays)、その下に学校ごとの一覧
// (buildSchoolScheduleList)、年間カレンダーのバッジの下に説明の行
// (schoolBadgeDetails) を出す。A4 の表示はバッジ・点のまま。

import { compareJa } from "./sortJa";
import { eachDateStrInRange, fmtMD } from "./dateHelpers";
import { normalizeExamDates } from "./migrate";
import { HIGH_GRADES } from "../constants/schools";

export const MOCK_EVENT_TYPE = "mock";
export const OPTIONAL_MOCK_TAG = "希望者";

// 学校キーにしないタグ: 希望者・冠模試の印と、部のタグ (utils/teacherTags が
// 「中学部 / 高校部の全コマ」として読むもの。学校ではない)
const NON_SCHOOL_TAGS = new Set([OPTIONAL_MOCK_TAG, "中学", "中学部", "高校", "高校部"]);

/** 記録の学校キー (予約タグを除いた tags の先頭)。無ければ null (バッジにしない) */
export function schoolKeyOf(record) {
  for (const t of record?.tags || []) {
    const s = typeof t === "string" ? t.trim() : "";
    if (s && !NON_SCHOOL_TAGS.has(s)) return s;
  }
  return null;
}

/** 希望者・冠模試か (「希望者」タグ) */
export function isOptionalMock(ev) {
  return (ev?.tags || []).some((t) => typeof t === "string" && t.trim() === OPTIONAL_MOCK_TAG);
}

/** 学校バッジにまとめるテスト期間か (授業を止めない + 学校キーあり) */
export function isSchoolBadgeExam(ep) {
  return !!ep?.startDate && ep.stopsClasses === false && schoolKeyOf(ep) != null;
}

/** 学校バッジにまとめる特別イベントか (模試 + 学校キーあり) */
export function isSchoolBadgeMock(ev) {
  return !!ev?.startDate && ev.eventType === MOCK_EVENT_TYPE && schoolKeyOf(ev) != null;
}

const endOf = (rec) => rec.endDate || rec.startDate;

/** テスト期間の考査日 (並べて重複を除き、期間内のものだけ) */
export function examDatesOf(ep) {
  return normalizeExamDates(ep?.examDates, ep?.startDate, endOf(ep || {}));
}

const dayNum = (ds) => {
  const [y, m, d] = String(ds).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
};
/** a から b まで何日 (b - a) */
export const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a));

/**
 * その日のテスト期間の状態。期間外は null。
 *   announce = 開始日 (考査日より前のとき) = 考査発表
 *   pre      = 発表の翌日〜最初の考査日の前日
 *   exam     = 考査日。index = 何日目 (1 始まり)、total = 考査日の数
 *   gap      = 最初の考査日より後で考査日ではない日 (土日など、期間中の休み)
 *   period   = 考査日の無いテスト期間 (期間全体を「テスト期間」として淡く出す)
 */
export function examDayState(ep, ds) {
  const start = ep?.startDate;
  if (!start || !ds) return null;
  const end = endOf(ep);
  if (ds < start || ds > end) return null;
  const dates = examDatesOf(ep);
  if (dates.length === 0) return { kind: "period" };
  const i = dates.indexOf(ds);
  if (i >= 0) return { kind: "exam", index: i + 1, total: dates.length };
  if (ds < dates[0]) return { kind: ds === start ? "announce" : "pre" };
  return { kind: "gap" };
}

// 1 日に同じ学校のテスト期間が 2 つ重なったとき (発表日が学年で違う 1学期期末を
// 2 行で入れた場合など) に、バッジの見た目に使う方。考査日 > 発表 > 発表後 > 休み
const STATE_RANK = { exam: 0, announce: 1, pre: 2, gap: 3, period: 4 };

// ─── 絞り込み (学年・種類。①バッジと②タイムラインの両方に効く) ──────────
// 学年の分け方は現役部の高校部 (高1・2 は学校の英数、高3 は科目別) に合わせる
export const SCHOOL_GRADE_FILTERS = Object.freeze([
  { key: "all", label: "全学年", grades: null },
  { key: "12", label: "高1・2", grades: ["高1", "高2"] },
  { key: "3", label: "高3", grades: ["高3"] },
]);

export const DEFAULT_SCHOOL_FILTER = Object.freeze({
  grade: "all",
  exam: true,
  mock: true,
  optional: false,
});

/** 保存された絞り込みを読む (不正な値は既定に戻す) */
export function normalizeSchoolFilter(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  return {
    grade: SCHOOL_GRADE_FILTERS.some((g) => g.key === src.grade) ? src.grade : DEFAULT_SCHOOL_FILTER.grade,
    exam: bool(src.exam, DEFAULT_SCHOOL_FILTER.exam),
    mock: bool(src.mock, DEFAULT_SCHOOL_FILTER.mock),
    optional: bool(src.optional, DEFAULT_SCHOOL_FILTER.optional),
  };
}

/** 記録の対象学年が選んだ学年と交わるか (空 = 全学年 → 常に出す) */
export function gradeMatches(targetGrades, gradeKey) {
  const want = SCHOOL_GRADE_FILTERS.find((g) => g.key === gradeKey)?.grades;
  if (!want) return true;
  const grades = targetGrades || [];
  if (grades.length === 0) return true;
  return grades.some((g) => want.includes(g));
}

export function visibleSchoolExams(examPeriods, filter = DEFAULT_SCHOOL_FILTER) {
  const f = normalizeSchoolFilter(filter);
  if (!f.exam) return [];
  return (examPeriods || []).filter((ep) => isSchoolBadgeExam(ep) && gradeMatches(ep.targetGrades, f.grade));
}

export function visibleSchoolMocks(specialEvents, filter = DEFAULT_SCHOOL_FILTER) {
  const f = normalizeSchoolFilter(filter);
  if (!f.mock) return [];
  return (specialEvents || []).filter(
    (ev) =>
      isSchoolBadgeMock(ev) &&
      gradeMatches(ev.targetGrades, f.grade) &&
      (f.optional || !isOptionalMock(ev))
  );
}

const byStartThenId = (a, b) => a.startDate.localeCompare(b.startDate) || (a.id ?? 0) - (b.id ?? 0);

// ─── ① 年間カレンダー: 日付 → 学校バッジ ───────────────────────────────

/**
 * 日付 → その日の学校バッジ (学校キーの五十音順)。from〜to の日だけ。
 * Badge = {
 *   school,
 *   examState: examDayState の結果 (テスト期間が無ければ null),
 *   exam: 見た目に使うテスト期間 (STATE_RANK の一番上),
 *   exams: [{ exam, state }] その日に当たるテスト期間すべて (内訳用),
 *   mocks: その日の模試,
 *   onlyOptionalMocks: 模試が希望者・冠模試だけか (「模」を点線にする),
 * }
 */
export function buildSchoolBadges({ examPeriods = [], specialEvents = [], filter } = {}, from, to) {
  const byDate = new Map(); // date -> Map(school -> { exams, mocks })
  const slot = (d, school) => {
    if (!byDate.has(d)) byDate.set(d, new Map());
    const m = byDate.get(d);
    if (!m.has(school)) m.set(school, { exams: [], mocks: [] });
    return m.get(school);
  };
  const clampedDates = (rec) => {
    const s = rec.startDate < from ? from : rec.startDate;
    const e = endOf(rec) > to ? to : endOf(rec);
    return eachDateStrInRange(s, e);
  };
  for (const ep of visibleSchoolExams(examPeriods, filter)) {
    const school = schoolKeyOf(ep);
    for (const d of clampedDates(ep)) {
      const state = examDayState(ep, d);
      if (state) slot(d, school).exams.push({ exam: ep, state });
    }
  }
  for (const ev of visibleSchoolMocks(specialEvents, filter)) {
    const school = schoolKeyOf(ev);
    for (const d of clampedDates(ev)) slot(d, school).mocks.push(ev);
  }
  const out = new Map();
  for (const [d, m] of byDate) {
    const badges = [...m.entries()]
      .sort(([a], [b]) => compareJa(a, b))
      .map(([school, { exams, mocks }]) => {
        exams.sort(
          (a, b) =>
            STATE_RANK[a.state.kind] - STATE_RANK[b.state.kind] || byStartThenId(a.exam, b.exam)
        );
        mocks.sort(byStartThenId);
        return {
          school,
          examState: exams[0]?.state || null,
          exam: exams[0]?.exam || null,
          exams,
          mocks,
          onlyOptionalMocks: mocks.length > 0 && mocks.every(isOptionalMock),
        };
      });
    out.set(d, badges);
  }
  return out;
}

// ─── 文言 ────────────────────────────────────────────────────────────

const CIRCLED = "❶❷❸❹❺❻❼❽❾❿";
/** 考査 n 日目の印 (❶❷…、11 日目以降は "(11)") */
export const examDayMark = (n) => (n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`);

/** 対象学年の短い名前 ([] = 全学年、高1〜3 = 高校部) */
export function schoolGradeLabel(grades) {
  const g = grades || [];
  if (g.length === 0) return "全学年";
  if (g.length === HIGH_GRADES.length && HIGH_GRADES.every((x) => g.includes(x))) return "高校部";
  return g.join("・");
}

/** 名前の頭の学校キーを落とす (「桜井2学期期末」→「2学期期末」。行・バッジが学校を示すため) */
export function stripSchoolPrefix(name, school) {
  const n = String(name || "").trim();
  if (school && n.startsWith(school) && n.length > school.length) {
    return n.slice(school.length).replace(/^[\s\u3000・:：]+/, "") || n;
  }
  return n;
}

/** "10/13〜16" / "11/26〜12/2" / "10/13" */
export function mdRange(a, b) {
  if (!a) return "";
  if (!b || a === b) return fmtMD(a);
  const [, am] = a.split("-");
  const [, bm, bd] = b.split("-");
  return am === bm ? `${fmtMD(a)}〜${Number(bd)}` : `${fmtMD(a)}〜${fmtMD(b)}`;
}

/** テスト期間の状態の言葉 (「考査2日目」「考査発表」…) */
export function examStateText(ep, state, ds) {
  switch (state?.kind) {
    case "exam":
      return `考査${state.index}日目`;
    case "announce":
      return "考査発表";
    case "pre": {
      const first = examDatesOf(ep)[0];
      return first && ds ? `発表後 (考査まであと${daysBetween(ds, first)}日)` : "発表後";
    }
    case "gap":
      return "考査期間中の休み";
    case "period":
      return "テスト期間";
    default:
      return "";
  }
}

/** テスト期間の考査の範囲 (考査日があれば最初〜最後、無ければ期間) */
export function examRangeText(ep) {
  const dates = examDatesOf(ep);
  return dates.length ? mdRange(dates[0], dates[dates.length - 1]) : mdRange(ep.startDate, endOf(ep));
}

/**
 * テスト期間の一覧の 1 行 (「発表 10/6 → 考査 10/13〜16（4日）」)。考査日が
 * 無ければ ""。開始日が最初の考査日なら発表は書かない
 */
export function describeExamDates(ep) {
  const dates = examDatesOf(ep);
  if (dates.length === 0) return "";
  const exam = `考査 ${mdRange(dates[0], dates[dates.length - 1])}（${dates.length}日）`;
  return ep.startDate < dates[0] ? `発表 ${fmtMD(ep.startDate)} → ${exam}` : exam;
}

/** 模試 1 件の説明 (「3年第8回校外模試(進研マーク)（高3）10/30〜31 希望者・冠模試」) */
export function describeMock(ev, school = schoolKeyOf(ev)) {
  const name = stripSchoolPrefix(ev.name, school);
  const range = endOf(ev) !== ev.startDate ? ` ${mdRange(ev.startDate, endOf(ev))}` : "";
  return `${name}（${schoolGradeLabel(ev.targetGrades)}）${range}${isOptionalMock(ev) ? " 希望者・冠模試" : ""}`;
}

/**
 * バッジの全文 (aria-label / title)。
 * 例: 「桜井 2学期期末（全学年）考査2日目 11/26〜12/2 / 模試: …」
 */
export function describeSchoolBadge(badge, ds) {
  const parts = [];
  for (const { exam, state } of badge.exams || []) {
    const name = stripSchoolPrefix(exam.name, badge.school);
    parts.push(
      `${name}（${schoolGradeLabel(exam.targetGrades)}）${examStateText(exam, state, ds)} ${examRangeText(exam)}`
    );
  }
  for (const ev of badge.mocks || []) parts.push(`模試: ${describeMock(ev, badge.school)}`);
  return `${badge.school} ${parts.join(" / ")}`;
}

// ─── ② 学校別タイムライン ──────────────────────────────────────────────

/** 模試の色分け: 高1・2 を含む / 高3 のみ / 学年の記載なし (それ以外もここ) */
export function mockGradeClass(grades) {
  const g = grades || [];
  if (g.some((x) => x === "高1" || x === "高2")) return "g12";
  if (g.includes("高3")) return "g3";
  return "all";
}

/**
 * 文字列の幅 (px) の見積もり。全角 = 1 字、半角 (英数・記号・半角カナ) = 0.6 字。
 * 学校別タイムラインの名前の札が隣の札に重ならないように段を分けるのに使う
 * (実際の幅は測らない。足りなければ札は「…」で切れる)
 */
export function estimateTextPx(text, fontPx) {
  let w = 0;
  for (const ch of String(text || "")) {
    const c = ch.codePointAt(0);
    w += c < 0x2000 || (c >= 0xff61 && c <= 0xff9f) ? 0.6 : 1;
  }
  return w * fontPx;
}

// 重なる帯を段に分ける (開始順に、空いている一番上の段へ)。items は
// { startOffset, endOffset } (両端を含む日の番号)。extentEnd(it) を渡すと、帯の
// 後ろに続く名前の札の分まで塞がっているとみなす (札どうしが重ならないように)。
// 段に入れた後、各帯に roomDays = 同じ段の次の帯の始まりまでの日数 (最後なら
// 期間の終わりまで) を付ける。札の幅の上限に使う (はみ出す分は「…」で切る)
function packLanes(items, days, extentEnd = (it) => it.endOffset) {
  const lanes = [];
  const lastEnd = [];
  const sorted = [...items].sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset
  );
  for (const it of sorted) {
    let i = lastEnd.findIndex((e) => e < it.startOffset);
    if (i < 0) {
      i = lanes.length;
      lanes.push([]);
      lastEnd.push(-1);
    }
    lanes[i].push(it);
    lastEnd[i] = Math.max(it.endOffset, extentEnd(it));
  }
  for (const lane of lanes) {
    lane.forEach((it, j) => {
      it.roomDays = (lane[j + 1] ? lane[j + 1].startOffset : days) - it.startOffset;
    });
  }
  return lanes;
}

/**
 * 学校別タイムライン (行 = 学校、列 = 日付)。位置は from からの日の番号
 * (0 始まり) で返し、画面は日数に対する割合 (%) で置く (幅を測らない)。
 * 戻り値: {
 *   from, to, days,
 *   examCounts: [{ date, offset, count }]  その日に考査日の学校の数 (1 以上の日だけ),
 *   schools: [{
 *     school,
 *     examLanes: [[{ exam, startOffset, endOffset, examOffsets, announceOffset, label, title }]],
 *     mockLanes: [[{ event, startOffset, endOffset, gradeClass, optional, title }]],
 *   }],
 * }
 * 帯は開始日 (考査発表)〜終了日 (ふつうは最後の考査日)。from〜to で切る。
 *
 * テスト期間には detail (「発表 10/6 → 考査 10/13〜16（4日）」/ 考査日が無ければ
 * 「テスト期間 10/1〜5」)、模試には name (学校名を落とした名前)・grade (対象学年)・
 * range を付ける (B4・A3 の表示の札)。どの帯にも roomDays (同じ段の次の帯まで)。
 * layout.labelDays(kind, item) を渡すと、帯の始まりから札が何日ぶん塞ぐかとして
 * 段分けに使う (kind = "exam" | "mock"。0 なら札なし)。
 */
export function buildSchoolTimeline(
  { examPeriods = [], specialEvents = [], filter } = {},
  from,
  to,
  { labelDays } = {}
) {
  const days = daysBetween(from, to) + 1;
  const off = (ds) => daysBetween(from, ds);
  const inRange = (rec) => rec.startDate <= to && endOf(rec) >= from;
  const clampOff = (ds) => Math.min(days - 1, Math.max(0, off(ds)));

  const exams = visibleSchoolExams(examPeriods, filter).filter(inRange);
  const mocks = visibleSchoolMocks(specialEvents, filter).filter(inRange);

  const bySchool = new Map();
  const entry = (school) => {
    if (!bySchool.has(school)) bySchool.set(school, { exams: [], mocks: [] });
    return bySchool.get(school);
  };
  const countBy = new Map(); // date -> Set(school)
  for (const ep of exams) {
    const school = schoolKeyOf(ep);
    const dates = examDatesOf(ep);
    const examOffsets = dates.filter((d) => d >= from && d <= to).map(off);
    for (const d of dates) {
      if (d < from || d > to) continue;
      if (!countBy.has(d)) countBy.set(d, new Set());
      countBy.get(d).add(school);
    }
    const name = stripSchoolPrefix(ep.name, school);
    const grade = schoolGradeLabel(ep.targetGrades);
    const announce = dates.length && ep.startDate < dates[0] ? ep.startDate : null;
    entry(school).exams.push({
      exam: ep,
      startOffset: clampOff(ep.startDate),
      endOffset: clampOff(endOf(ep)),
      examOffsets,
      announceOffset: announce && announce >= from && announce <= to ? off(announce) : null,
      label: `${name}（${grade}）`,
      detail: describeExamDates(ep) || `テスト期間 ${mdRange(ep.startDate, endOf(ep))}`,
      title: [
        `${school} ${name}（${grade}）`,
        announce ? `発表 ${fmtMD(announce)}` : "",
        dates.length ? `考査 ${dates.map(fmtMD).join("・")}` : `テスト期間 ${mdRange(ep.startDate, endOf(ep))}`,
      ]
        .filter(Boolean)
        .join(" / "),
    });
  }
  for (const ev of mocks) {
    const school = schoolKeyOf(ev);
    entry(school).mocks.push({
      event: ev,
      startOffset: clampOff(ev.startDate),
      endOffset: clampOff(endOf(ev)),
      gradeClass: mockGradeClass(ev.targetGrades),
      optional: isOptionalMock(ev),
      name: stripSchoolPrefix(ev.name, school),
      grade: schoolGradeLabel(ev.targetGrades),
      range: mdRange(ev.startDate, endOf(ev)),
      title: `${school} 模試: ${describeMock(ev, school)}`,
    });
  }
  const extent = (kind) =>
    labelDays ? (it) => it.startOffset + Math.ceil(labelDays(kind, it)) - 1 : undefined;

  const examCounts = [...countBy.entries()]
    .map(([date, set]) => ({ date, offset: off(date), count: set.size }))
    .sort((a, b) => a.offset - b.offset);
  const schools = [...bySchool.entries()]
    .sort(([a], [b]) => compareJa(a, b))
    .map(([school, { exams: es, mocks: ms }]) => ({
      school,
      examLanes: packLanes(es, days, extent("exam")),
      mockLanes: packLanes(ms, days, extent("mock")),
    }));
  return { from, to, days, examCounts, schools };
}

// ─── ③ 学校ごとの一覧 (学校別の B4・A3 の表示) ──────────────────────────

/**
 * 学校ごとの一覧。from〜to にかかるテスト期間と模試を、学校ごと (五十音) に
 * 日付順で並べる。並べる日付は画面の「日付」の欄と同じ = テスト期間は考査の
 * 始まり (考査日が無ければ開始日)、模試は開始日。同じ日はテスト期間 → 模試。
 * 戻り値: [{ school, rows }]
 *   exam: { kind, key, record, date, end, name, grade, announce, examDates }
 *         date〜end = 考査の範囲 (考査日が無ければテスト期間)、announce = 発表日 (無ければ null)
 *   mock: { kind, key, record, date, end, name, grade, gradeClass, optional }
 */
export function buildSchoolScheduleList({ examPeriods = [], specialEvents = [], filter } = {}, from, to) {
  const inRange = (rec) => rec.startDate <= to && endOf(rec) >= from;
  const bySchool = new Map();
  const push = (school, row) => {
    if (!bySchool.has(school)) bySchool.set(school, []);
    bySchool.get(school).push(row);
  };
  for (const ep of visibleSchoolExams(examPeriods, filter).filter(inRange)) {
    const school = schoolKeyOf(ep);
    const dates = examDatesOf(ep);
    push(school, {
      kind: "exam",
      key: `exam-${ep.id}`,
      record: ep,
      date: dates[0] || ep.startDate,
      end: dates.length ? dates[dates.length - 1] : endOf(ep),
      name: stripSchoolPrefix(ep.name, school),
      grade: schoolGradeLabel(ep.targetGrades),
      announce: dates.length && ep.startDate < dates[0] ? ep.startDate : null,
      examDates: dates,
    });
  }
  for (const ev of visibleSchoolMocks(specialEvents, filter).filter(inRange)) {
    const school = schoolKeyOf(ev);
    push(school, {
      kind: "mock",
      key: `mock-${ev.id}`,
      record: ev,
      date: ev.startDate,
      end: endOf(ev),
      name: stripSchoolPrefix(ev.name, school),
      grade: schoolGradeLabel(ev.targetGrades),
      gradeClass: mockGradeClass(ev.targetGrades),
      optional: isOptionalMock(ev),
    });
  }
  const kindRank = { exam: 0, mock: 1 };
  return [...bySchool.entries()]
    .sort(([a], [b]) => compareJa(a, b))
    .map(([school, rows]) => ({
      school,
      rows: rows.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          kindRank[a.kind] - kindRank[b.kind] ||
          (a.record.id ?? 0) - (b.record.id ?? 0)
      ),
    }));
}

/** 考査日の並び (「11/26・27・30・12/1・2」。同じ月は日だけ) */
export function examDatesText(dates) {
  let prevMonth = null;
  return (dates || [])
    .map((d) => {
      const m = d.slice(5, 7);
      const text = m === prevMonth ? String(Number(d.slice(8))) : fmtMD(d);
      prevMonth = m;
      return text;
    })
    .join("・");
}

// ─── ④ 年間カレンダー (B4・A3): バッジの下の説明の行 ────────────────────

/**
 * 年間カレンダーの B4・A3 の表示で、学校のバッジの下に出す説明の行。
 * バッジは毎日並ぶので、名前は要るところだけに出す (毎日並べると読めなくなる):
 *   テスト期間: その月で最初の日 (発表日・月の 1 日) と最初の考査日に
 *     「2学期期末（高校部）考査発表 → 考査 11/26〜12/2」/「…考査 11/26〜12/2（5日）」
 *   模試: 模試の日ごとに名前と対象学年 (何日か続く模試は始まりの日に「〜10/31」)
 * monthStart: その月の 1 日 ("YYYY-MM-01")。
 * 戻り値: [{ key, kind, school, text, grade?, gradeClass?, optional?, isStart }]
 */
export function schoolBadgeDetails(badge, ds, monthStart) {
  const out = [];
  for (const { exam, state } of badge?.exams || []) {
    const firstVisible = exam.startDate > monthStart ? exam.startDate : monthStart;
    const firstExam = state.kind === "exam" && state.index === 1;
    if (ds !== firstVisible && !firstExam) continue;
    const head = `${stripSchoolPrefix(exam.name, badge.school)}（${schoolGradeLabel(exam.targetGrades)}）`;
    let text;
    if (state.kind === "announce") text = `${head}考査発表 → 考査 ${examRangeText(exam)}`;
    else if (state.kind === "period") text = `${head}テスト期間 ${examRangeText(exam)}`;
    else text = `${head}考査 ${examRangeText(exam)}（${examDatesOf(exam).length}日）`;
    out.push({ key: `e-${exam.id}`, kind: "exam", school: badge.school, text, isStart: true });
  }
  for (const ev of badge?.mocks || []) {
    const end = endOf(ev);
    const isStart = ds === ev.startDate;
    const name = stripSchoolPrefix(ev.name, badge.school);
    out.push({
      key: `m-${ev.id}`,
      kind: "mock",
      school: badge.school,
      text: isStart && end !== ev.startDate ? `${name} 〜${fmtMD(end)}` : name,
      grade: schoolGradeLabel(ev.targetGrades),
      gradeClass: mockGradeClass(ev.targetGrades),
      optional: isOptionalMock(ev),
      isStart,
    });
  }
  return out;
}

/**
 * 絞り込みの説明 (紙面の見出しに添える)。既定 (全学年・発表〜考査・模試・
 * 希望者なし) なら ""
 */
export function describeSchoolFilter(filter) {
  const f = normalizeSchoolFilter(filter);
  const parts = [];
  if (f.grade !== "all") parts.push(SCHOOL_GRADE_FILTERS.find((g) => g.key === f.grade).label);
  if (!f.exam) parts.push("考査なし");
  if (!f.mock) parts.push("模試なし");
  else if (f.optional) parts.push("希望者・冠模試も");
  return parts.join(" / ");
}
