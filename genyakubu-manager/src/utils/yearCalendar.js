// ─── 年間カレンダー (上 = 予備校部、下 = 現役部) の組み立て ──────────────
// components/views/YearCalendarView が描く月のグリッドと、日ごとの各段の
// 中身を作る純関数。
//
//   - 予備校部の段 = 予備校部の予定 (utils/yobikoEvents)。日の種別 (休校日・
//     出勤者休日など) は日付の数字の塗りに、行事は名称を欄に出す
//   - 現役部の段 = 休講 (holidays)・テスト期間 (examPeriods)・特別イベント
//     (specialEvents)。イベントカレンダーと同じ記録を読むだけで、新しい
//     データは持たない。追加授業・振替などコマ単位のものは出さない (年間の
//     見取り図には細かすぎる。日ごとの詳細はイベントカレンダー / ダッシュボード)
//
// 週は日曜始まり (イベントカレンダー・講師の月間と同じ)。

import { HOLIDAY_META, EXAM_META, EVENT_KIND } from "../constants/eventKinds";
import { specialEventTypeMeta } from "../constants/specialEvents";
import { isYobikoDayMark, yobikoKindMeta } from "../constants/yobikoEvents";
import { eachDateStrInRange } from "./dateHelpers";
import { describeExamTargetGrades, describeHolidayScope } from "./eventTargets";
import { yobikoEventLabel } from "./yobikoEvents";
import { isSchoolBadgeExam, isSchoolBadgeMock } from "./schoolSchedule";

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM" を delta か月ずらす */
export function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** start ("YYYY-MM") から count か月の "YYYY-MM" の配列 */
export function monthsFrom(start, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(shiftYm(start, i));
  return out;
}

/** 月の初日と末日 */
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(dim)}` };
}

/** 年度 (4 月始まり) の初めの月。1〜3 月は前の年の 4 月 */
export function fiscalYearStartYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04`;
}

/**
 * 月のグリッド (日曜始まり)。週ごとに 7 つの "YYYY-MM-DD" | null
 * (月の外の日は null)
 */
export function buildMonthWeeks(ym) {
  const [y, m] = ym.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ─── 段の中身 ───────────────────────────────────────────────────────
// 1 件 = { key, kind, label, title, startDate, endDate, meta, source, dateNotes? }
//   kind: 予備校部 = "yobiko"、現役部 = EVENT_KIND (holiday / exam / special)
//   meta: 色 ({ bg, fg, accent })
//   dateNotes: 日付 → その日だけ名前に添える文字 (テスト期間の「📖 授業あり」)

/**
 * 現役部の段に出す記録 (休講・テスト期間・特別イベント)。
 * excludeSchoolBadged: 学校バッジにまとめる記録 (授業を止めない学校のテスト
 * 期間・学校の模試。utils/schoolSchedule) を外す。バッジと同じ記録を 1 件ずつ
 * 二重に出さないため。バッジの絞り込みで隠したものも戻ってこない
 */
export function genyakuEntries(
  { holidays = [], examPeriods = [], specialEvents = [] } = {},
  { excludeSchoolBadged = false } = {}
) {
  const out = [];
  for (const h of holidays || []) {
    if (!h?.date) continue;
    const name = h.label || "休講";
    const target = describeHolidayScope(h, { short: true });
    out.push({
      key: `h-${h.id}`,
      kind: EVENT_KIND.HOLIDAY,
      label: target ? `${name} (${target})` : name,
      title: `休講: ${name} / 対象: ${describeHolidayScope(h)}`,
      startDate: h.date,
      endDate: h.date,
      meta: HOLIDAY_META,
      source: h,
    });
  }
  for (const ep of examPeriods || []) {
    if (!ep?.startDate) continue;
    if (excludeSchoolBadged && isSchoolBadgeExam(ep)) continue;
    const target = describeExamTargetGrades(ep, { short: true });
    // 授業を止めないテスト期間・例外的に授業を行う日は、イベントカレンダーと
    // 同じ言い方で添える (止める期間と同じ見た目だと、その日は授業が無いと読める)
    const displayOnly = ep.stopsClasses === false;
    const dateNotes = {};
    if (!displayOnly) {
      for (const ex of ep.classExceptions || []) {
        if (!ex?.date) continue;
        const grades = ex.grades || [];
        dateNotes[ex.date] = grades.length ? `📖 授業あり (${grades.join("・")})` : "📖 授業あり";
      }
    }
    const name = target ? `${ep.name} (${target})` : ep.name;
    out.push({
      key: `e-${ep.id}`,
      kind: EVENT_KIND.EXAM,
      label: displayOnly ? `${name} [表示のみ]` : name,
      title: [
        `テスト期間: ${ep.name} / 対象: ${describeExamTargetGrades(ep)}`,
        displayOnly ? "授業を休止しない (表示のみ)" : "",
      ]
        .filter(Boolean)
        .join(" / "),
      startDate: ep.startDate,
      endDate: ep.endDate || ep.startDate,
      meta: EXAM_META,
      source: ep,
      dateNotes,
    });
  }
  for (const ev of specialEvents || []) {
    if (!ev?.startDate) continue;
    if (excludeSchoolBadged && isSchoolBadgeMock(ev)) continue;
    const meta = specialEventTypeMeta(ev.eventType);
    out.push({
      key: `s-${ev.id}`,
      kind: EVENT_KIND.SPECIAL,
      label: `${meta.icon} ${ev.name}`,
      title: [`${meta.label}: ${ev.name}`, ev.memo].filter(Boolean).join(" / "),
      startDate: ev.startDate,
      endDate: ev.endDate || ev.startDate,
      meta,
      source: ev,
    });
  }
  return out;
}

const YOBIKO_EVENT_META = Object.freeze({ bg: "#e3ecf9", fg: "#1f4e8c", accent: "#5b85c4" });

/**
 * 予備校部の段に出す記録。日の種別 (休校日など) は名称を書いたものだけ欄にも
 * 出す (「スポーツの日」の休校日など)。名称の無い日の種別は数字の塗りだけ
 */
export function yobikoEntries(yobikoEvents = []) {
  const out = [];
  for (const ev of yobikoEvents || []) {
    if (!ev?.startDate) continue;
    const kindMeta = yobikoKindMeta(ev.kind);
    const mark = isYobikoDayMark(ev.kind);
    if (mark && !String(ev.name || "").trim()) continue;
    out.push({
      key: `y-${ev.id}`,
      kind: "yobiko",
      label: yobikoEventLabel(ev),
      title: [mark ? `${kindMeta.label}: ${yobikoEventLabel(ev)}` : yobikoEventLabel(ev), ev.memo]
        .filter(Boolean)
        .join(" / "),
      startDate: ev.startDate,
      endDate: ev.endDate || ev.startDate,
      // 名前のある日の種別 (「スポーツの日」の休校日) は、数字と同じ色の縦線で
      // 種別を示し、字は読みやすい地の上に置く
      meta: mark ? { bg: "#f2f2f2", fg: "#222", accent: kindMeta.dayFill } : YOBIKO_EVENT_META,
      source: ev,
    });
  }
  return out;
}

/**
 * 記録を日付ごとに広げる (from〜to の日だけ)。各日の並びは開始日 → 長い順 →
 * 元の並び。isStart / isEnd = その日が期間の始まり / 終わりか (続きの日は
 * 欄で薄く出す)
 */
export function spreadByDate(entries, from, to) {
  const sorted = [...(entries || [])]
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        a.e.startDate.localeCompare(b.e.startDate) ||
        b.e.endDate.localeCompare(a.e.endDate) ||
        a.i - b.i
    );
  const m = new Map();
  for (const { e } of sorted) {
    if (e.endDate < from || e.startDate > to) continue;
    const start = e.startDate < from ? from : e.startDate;
    const end = e.endDate > to ? to : e.endDate;
    for (const d of eachDateStrInRange(start, end)) {
      if (!m.has(d)) m.set(d, []);
      m.get(d).push({
        ...e,
        isStart: d === e.startDate,
        isEnd: d === e.endDate,
        note: e.dateNotes?.[d] || "",
      });
    }
  }
  return m;
}

/**
 * 日付 → 日の種別 (休校日など) の索引。1 日に 2 つ重なったら rank の小さい方
 * を塗りに使い、残りも marks に持つ (読み上げ名・tooltip 用)
 */
export function yobikoDayMarks(yobikoEvents, from, to) {
  const m = new Map();
  for (const ev of yobikoEvents || []) {
    if (!isYobikoDayMark(ev?.kind)) continue;
    if (!ev.startDate || ev.endDate < from || ev.startDate > to) continue;
    const start = ev.startDate < from ? from : ev.startDate;
    const end = (ev.endDate || ev.startDate) > to ? to : ev.endDate || ev.startDate;
    for (const d of eachDateStrInRange(start, end)) {
      if (!m.has(d)) m.set(d, []);
      const list = m.get(d);
      if (!list.some((k) => k.key === ev.kind)) list.push(yobikoKindMeta(ev.kind));
    }
  }
  for (const list of m.values()) list.sort((a, b) => a.rank - b.rank);
  return m;
}

/** 期間の続きの日に「〜12/27」を添えるための短い日付 ("12/27") */
export function shortDate(ds) {
  const [, m, d] = ds.split("-").map(Number);
  return `${m}/${d}`;
}
