// ─── 有給・半休の日の授業 ───────────────────────────────────────────
// 休暇を入れた日に、その人の担当コマが実施されるか / 代行・欠勤の登録が
// あるかを数える。有給・半休の記録は代行レコードを作らない (utils/staffLeave)
// ので、授業がある日に入れたら「代行・欠勤の登録が無い」ことを画面で知らせ、
// 複数日の欠勤登録へつなぐ。
//
// 実施判定と登録済みの判定は複数日の欠勤登録と同じ
// `absenceRange.buildAbsenceRangePlan` に委ねる (休講・テスト期間・時間割の
// 有効期間・表示期間・特別時程・隔週・登録済み・振替/合同で対応済み)。
// **ここで独自の実施判定を書き起こさない。**

import { buildAbsenceRangePlan } from "./absenceRange";

// 片付いているコマの理由 (absenceHelpers.collectAbsenceTargets の skipped)
const HANDLED_RE = /登録済み|対応済み|下書きあり/;
const INCOMING_RE = /^振替で入るコマ/;

/**
 * @param {object} args
 * @param {string} args.name   講師
 * @param {string} args.date   "YYYY-MM-DD"
 * @param {Array}  args.slots  全コマ
 * @param {Array}  args.subs
 * @param {Array}  args.adjustments
 * @param {object} args.ctx    useSessionCtx の sessionCtx
 * @returns {{classes: number, open: number, handled: number, incoming: number}}
 *   classes = その日に担当するコマ (実施されるもの)、open = 代行・欠勤の登録が
 *   無いコマ (incoming = 振替で入るコマ。代行ではなく振替先の担当を変える)
 */
export function leaveClassCheck({ name, date, slots, subs, adjustments, ctx }) {
  const empty = { classes: 0, open: 0, handled: 0, incoming: 0 };
  if (!name || !date || !ctx) return empty;
  const plan = buildAbsenceRangePlan({
    slots,
    subs,
    adjustments,
    fromDate: date,
    toDate: date,
    teachers: [name],
    ctx,
  });
  const day = plan.days[0];
  if (!day) return empty;
  let handled = 0;
  let incoming = 0;
  for (const s of day.skipped) {
    if (INCOMING_RE.test(s.reason || "")) incoming += 1;
    else if (HANDLED_RE.test(s.reason || "")) handled += 1;
  }
  const open = day.targets.length + incoming;
  return { classes: day.targets.length + handled + incoming, open, handled, incoming };
}

/**
 * 休暇の種類ごとに、授業とぶつかるかの重さ。
 *   "warn" … 1 日休み (有給・その他・午後半休) で登録の無いコマがある
 *   "info" … 午前半休 (授業は夕方からなので、かかるかは時間による)
 *   null   … 登録の要るコマが無い
 */
export function leaveClassSeverity(kind, check) {
  if (!check || check.open === 0) return null;
  return kind === "am" ? "info" : "warn";
}
