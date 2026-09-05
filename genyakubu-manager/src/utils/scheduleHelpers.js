import { DAYS } from "../constants/schools";
import { timeToMin } from "./dateHelpers";

export function gradeToDept(grade) {
  if (grade.includes("附中") || grade.includes("中")) return "中学部";
  if (grade.includes("高")) return "高校部";
  return null;
}

export const isKameiRoom = (room) => room?.startsWith("亀");

export function sortSlots(arr) {
  const idx = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  return [...arr].sort((a, b) => {
    const dd = idx[a.day] - idx[b.day];
    return dd || timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]);
  });
}

/**
 * Returns true if the given slot should be considered "off" on the given date
 * because of a matching holiday or because it falls inside an exam period.
 * Centralised here to avoid duplication between dashboard helpers and staff
 * monthly-date computations.
 */
// holidays のうち (date, slot.grade, slot.subj) にマッチして当該 slot を
// 休講扱いにするものが 1 つでもあるか。examPeriods は見ない。
// 隔週ローテーションのスキップ判定でも共用するため pure 関数として切り出す。
export function isSlotCancelledByHoliday(slot, dateStr, holidays) {
  if (!holidays || holidays.length === 0) return false;
  return holidays.some(
    (h) => h.date === dateStr && holidayAppliesTo(h, slot.grade, slot.subj)
  );
}

// 休講エントリ 1 件が (学年, 科目) に効くか。日付は見ない (呼び出し側で
// 日付の索引を引いてから使う)。部 (scope) → 学年 (targetGrades) → 教科
// キーワード (subjKeywords) の順に絞り、空の条件は「絞らない」。
// subjKeywords がある休講は subj 未指定のコマには当てない (安全側)。
//
// 学年は完全一致。複合学年 ("中1-3" のプレップ) に「中3 だけの休講」を
// 当てるかは決めていない (表示期間設定の findGroupForGrade は range 展開で
// 「どれかが含まれれば所属」と読むが、休講で同じ読みをすると中1・中2 の
// 生徒が来る日を休講にしてしまう)。要件が出るまで完全一致のまま。
export function holidayAppliesTo(h, grade, subj) {
  if (!h) return false;
  const sc = h.scope || ["全部"];
  if (!sc.includes("全部")) {
    const dept = grade ? gradeToDept(grade) : null;
    if (!(dept && sc.includes(dept))) return false;
  }
  const tg = h.targetGrades || [];
  if (tg.length > 0 && !tg.includes(grade)) return false;
  const sk = h.subjKeywords || [];
  if (sk.length > 0) {
    if (!subj) return false;
    if (!sk.some((kw) => subj.includes(kw))) return false;
  }
  return true;
}

// 学年・教科で絞られていない休講か (= 部単位、または全部門)。
export function isBroadHoliday(h) {
  return (h?.targetGrades || []).length === 0 && (h?.subjKeywords || []).length === 0;
}

// その日の休講エントリ群を「全日休講 / 部単位の休み / 学年・教科限定」に分類
// する。日別ダッシュボード・タイムテーブル・月次カレンダーが同じ分岐を持つ
// (fullOff なら日全体で 1 回だけ「休講」を出し、セクションやカードを描かない)。
// 判定を画面ごとに書き起こさないための集約 (2026-09-05)。
//   fullOff     … scope=全部 かつ 学年・教科の絞りが無い休講が 1 件でもある
//   offDepts    … 学年・教科の絞りが無い休講の部 ("中学部" / "高校部"、全部を除く)
//   granularHols… 学年か教科で絞られた休講 (部分休講としてバッジで出す)
//   hasPartial  … fullOff ではないが何かしら休みがある
export function classifyDayHolidays(hols) {
  const list = Array.isArray(hols) ? hols : [];
  const fullOff = list.some(
    (h) => (h.scope || ["全部"]).includes("全部") && isBroadHoliday(h)
  );
  const offDepts = [
    ...new Set(
      list
        .filter(isBroadHoliday)
        .flatMap((h) => (h.scope || ["全部"]).filter((s) => s && s !== "全部"))
    ),
  ];
  const granularHols = list.filter((h) => !isBroadHoliday(h));
  return {
    fullOff,
    offDepts,
    granularHols,
    hasPartial: !fullOff && (offDepts.length > 0 || granularHols.length > 0),
  };
}

// 学年・教科で絞られた休講の絞り条件を "中3・高松西" のように並べる
// (部分休講バッジの文言)。
export function describeHolidayTargets(h) {
  return [...(h?.targetGrades || []), ...(h?.subjKeywords || [])].join("・");
}

// 休講エントリの適用範囲を "中学部 / 中3 / 高松西" のように整形する。
// 既定では「全部」を省く (何も絞られていない休講は空文字)。
// includeAll: true で「全部」も出す (タイムテーブルの休講バナー)。
export function formatHolidayRange(h, { includeAll = false } = {}) {
  const parts = [];
  const sc = (h?.scope || ["全部"]).filter(Boolean);
  const depts = includeAll ? sc : sc.filter((s) => s !== "全部");
  if (depts.length > 0) parts.push(depts.join("・"));
  if ((h?.targetGrades || []).length > 0) parts.push(h.targetGrades.join("・"));
  if ((h?.subjKeywords || []).length > 0) parts.push(h.subjKeywords.join("・"));
  return parts.join(" / ");
}

// テスト期間の「例外的に授業を行う日」(classExceptions) に (日付, 学年) が
// 該当するか。イレギュラーで特訓は始まっているが授業は休みにしない日を表す。
// grades 未指定 / 空 = そのテスト期間の対象学年すべてで授業を行う。
export function isExamClassExceptionFor(ep, dateStr, grade) {
  const list = ep?.classExceptions;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((ex) => {
    if (!ex || ex.date !== dateStr) return false;
    const g = ex.grades || [];
    if (g.length === 0) return true;
    return g.includes(grade);
  });
}

// その日に効いている「例外的に授業を行う日」を返す (表示専用)。
// 返すのは { ep, exception, grades } — grades が空だった例外は
// テスト期間の対象学年に展開する (対象学年も空なら全学年なので空のまま)。
export function examClassExceptionsOnDate(examPeriods, dateStr) {
  const out = [];
  for (const ep of examPeriods || []) {
    if (!ep || ep.stopsClasses === false) continue;
    if (dateStr < ep.startDate || dateStr > ep.endDate) continue;
    for (const ex of ep.classExceptions || []) {
      if (!ex || ex.date !== dateStr) continue;
      const grades =
        (ex.grades || []).length > 0
          ? [...ex.grades]
          : [...(ep.targetGrades || [])];
      out.push({ ep, exception: ex, grades });
    }
  }
  return out;
}

// そのテスト期間が (日付, 学年) の通常授業を止めるか。
// 判定はこの 1 か所に集約する (期間・対象学年・stopsClasses・授業実施日の
// 例外を画面ごとに書き起こさない)。
export function examPeriodStopsClassesOn(ep, dateStr, grade) {
  if (!ep) return false;
  if (ep.stopsClasses === false) return false;
  if (dateStr < ep.startDate || dateStr > ep.endDate) return false;
  const tg = ep.targetGrades || [];
  if (tg.length > 0 && !tg.includes(grade)) return false;
  // 例外的に授業を行う日はテスト期間中でも休止しない。
  if (isExamClassExceptionFor(ep, dateStr, grade)) return false;
  return true;
}

export function isSlotOffOnDate(slot, dateStr, holidays, examPeriods) {
  if (isSlotCancelledByHoliday(slot, dateStr, holidays)) return true;
  return (examPeriods || []).some((ep) => {
    if (dateStr < ep.startDate || dateStr > ep.endDate) return false;
    if (ep.targetGrades && ep.targetGrades.length > 0
      && !ep.targetGrades.includes(slot.grade)) return false;
    // 例外的に授業を行う日は期間中でも off にしない。
    return !isExamClassExceptionFor(ep, dateStr, slot.grade);
  });
}

// 隔週ローテーション補正で「実施されなかった週」と判定するか。
// 休講 (Holiday) または stopsClasses≠false のテスト期間 (ExamPeriod) で
// 当該 slot が当日休止になる場合に true。
// stopsClasses=false の高校テスト等は授業継続扱いなので対象外。
// テスト期間の「授業実施日の例外」も授業を行う日なので対象外 (週が送られない)。
export function isSlotCancelledForBiweeklyShift(slot, dateStr, holidays, examPeriods) {
  if (isSlotCancelledByHoliday(slot, dateStr, holidays)) return true;
  return (examPeriods || []).some((ep) =>
    examPeriodStopsClassesOn(ep, dateStr, slot.grade)
  );
}
