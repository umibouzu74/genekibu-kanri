// ─── 複数日にまたがる欠勤の一括登録 (期間 × 講師) ──────────────────
// 「インフルで 9/14〜9/18 は休み」を、日ごとの欠勤組み換えを 5 回繰り返さずに
// 登録する。**モデルは足さない**: 作るのは既存の代行レコード
// ((日付, コマ, 元講師) 単位・代行者が空) を日数ぶん並べたものなので、一覧・
// スケジュール・玉突き代行・行内の「✓ 確定」はそのまま使える。
//
// 対象は「その日に実施されるコマ」だけ。実施判定は日まるごと振替と同じ
// `dayReschedule.collectDayRescheduleCandidates` (休講・テスト期間・時間割の
// 有効期間・表示期間・特別時程・隔週) に委ね、講師ごとの絞り込みと
// 登録済み / 振替・合同で対応済みの除外は `absenceHelpers.collectAbsenceTargets`
// に委ねる。**ここで独自の実施判定を書き起こさない。**外したコマは理由つきで
// 返す (黙って減らさない)。
import { dateToDay, eachDateStrInRange, isValidDateStr } from "./dateHelpers";
import { collectDayRescheduleCandidates } from "./dayReschedule";
import { collectAbsenceTargets } from "./absenceHelpers";
import { isSlotForTeacher } from "./biweekly";
import { saveAbsenceBatch } from "./absenceBatch";

/** 一度に扱う最大日数 (誤って 1 年分を作らないための上限)。 */
export const ABSENCE_RANGE_MAX_DAYS = 31;

export function absenceTargetKey(date, slotId, teacher) {
  return `${date}|${slotId}|${teacher}`;
}

/**
 * @param {object} args
 * @param {Array} args.slots        全コマ
 * @param {Array} args.subs         保存済みの代行レコード
 * @param {Array} args.adjustments  保存済みの時間割調整
 * @param {string} args.fromDate    "YYYY-MM-DD"
 * @param {string} args.toDate      "YYYY-MM-DD" (fromDate 以上)
 * @param {string[]} args.teachers  欠勤する先生
 * @param {object} args.ctx         useSessionCtx の sessionCtx
 * @returns {{days: Array<{date: string, day: string|null, targets: Array, skipped: Array}>,
 *            total: number, errors: string[]}}
 */
export function buildAbsenceRangePlan({
  slots,
  subs = [],
  adjustments = [],
  fromDate,
  toDate,
  teachers = [],
  ctx = {},
}) {
  const errors = [];
  if (!teachers || teachers.length === 0) errors.push("欠勤する先生を選んでください");
  if (!isValidDateStr(fromDate)) errors.push("開始日を入力してください");
  if (!isValidDateStr(toDate)) errors.push("終了日を入力してください");
  if (isValidDateStr(fromDate) && isValidDateStr(toDate) && toDate < fromDate) {
    errors.push("終了日は開始日以降にしてください");
  }
  const dates =
    errors.length === 0 ? eachDateStrInRange(fromDate, toDate) : [];
  if (dates.length > ABSENCE_RANGE_MAX_DAYS) {
    errors.push(`一度に登録できるのは ${ABSENCE_RANGE_MAX_DAYS} 日までです`);
  }
  if (errors.length > 0) return { days: [], total: 0, errors };

  const absenceCtx = {
    biweeklyAnchors: ctx.biweeklyAnchors || [],
    holidays: ctx.holidays || [],
    examPeriods: ctx.examPeriods || [],
    isOffForGrade: ctx.isOffForGrade,
  };
  const days = [];
  let total = 0;
  for (const date of dates) {
    const day = dateToDay(date);
    if (!day) {
      // 日曜は時間割が無い。行としては出さず、件数だけ呼び出し側が数える
      days.push({ date, day: null, targets: [], skipped: [] });
      continue;
    }
    const { candidates, skipped: notHeld } = collectDayRescheduleCandidates({
      slots,
      dateStr: date,
      ctx,
    });
    const { targets, skipped } = collectAbsenceTargets({
      slots: candidates,
      date,
      teachers,
      ctx: absenceCtx,
      existingSubs: subs,
      existingAdjustments: adjustments,
    });
    // 実施されないコマのうち、選んだ先生に関わるものだけ理由を残す
    // (講師欄の分解と隔週パートナーの判定は biweekly.isSlotForTeacher に委ねる)
    const notHeldMine = notHeld.filter(({ slot }) =>
      teachers.some((t) => isSlotForTeacher(slot, t))
    );
    days.push({
      date,
      day,
      targets: targets.map((t) => ({ ...t, date, key: absenceTargetKey(date, t.slotId, t.teacher) })),
      skipped: [...skipped, ...notHeldMine],
    });
    total += targets.length;
  }
  return { days, total, errors };
}

/**
 * プランのうち excludedKeys に無い組を代行レコード (代行者が空) として保存する。
 * mode: "pending" = 代行を探す (依頼中) / "nosub" = 代行なしで確定。
 * @returns {number} 追加した件数
 */
export function applyAbsenceRange({ subs, plan, excludedKeys = new Set(), mode, memo = "", saveSubs }) {
  const draftSubs = [];
  for (const d of plan.days) {
    for (const t of d.targets) {
      if (excludedKeys.has(t.key)) continue;
      draftSubs.push({
        date: d.date,
        slotId: t.slotId,
        originalTeacher: t.teacher,
        substitute: "",
        status: mode === "nosub" ? "confirmed" : "requested",
        memo,
      });
    }
  }
  if (draftSubs.length === 0) return 0;
  saveAbsenceBatch({
    subsList: subs,
    adjustmentsList: [],
    sessionOverridesList: [],
    draftSubs,
    saveSubs,
    saveAdjustments: () => {},
    saveSessionOverrides: () => {},
  });
  return draftSubs.length;
}
