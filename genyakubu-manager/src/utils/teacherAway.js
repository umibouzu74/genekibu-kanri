// ─── 講師の不在期間 (TeacherAway、2026-11-19、P2-6) ─────────────────
// 「福武先生が 1/4〜1/22 不在」のように、講師が何日も続けて来られない期間を
// 1 か所に登録する (講師 1 人 × 開始日 × 終了日 × メモで 1 件)。
//
// 以前は担当変更 (期間限定) / 複数日の欠勤登録 / 日ごとの欠勤組み換えの 3 通りで
// 表すしかなく、どれを使っても講習時間割作成には伝わらなかった (休む側の講師が
// 講習の自動作成で入りうる)。この記録は**予定の目印**で、それ自体では授業を
// 動かさない:
//   - **代行レコード・担当の切り替えは作らない**。期間内の授業をどうするか
//     (担当変更にする / 欠勤として代行を探す) は登録画面の一覧から人が選ぶ
//     (有給・半休の記録が代行を作らないのと同じ考え方)
//   - 講習時間割作成では期間の全時限を自動NG にする (保存せず毎回導出。
//     timetable-builder/utils/regularBusy → autoNg、見え方は「(NG:不在)」)
//   - 講師の月間・週間・ダッシュボード・欠勤組み換え (その日の帯と代行候補) に
//     「不在」の目印を出す。
//     **紙面 (印刷・まとめて画像) には載せない** (月間はバイトへ送るので、
//     講師の事情を広げない)
//
// 有給・半休 (utils/staffLeave) との違い: あちらは現役部 常勤の人事の記録
// (1 日ずつ・管理者だけが読める adminData/)。こちらは誰にでも付けられる予定の
// 目印で、閲覧者も読める appData/ に置く (代行を探す人・講習を組む人が見る)。
// 「この講師にとっては休みの日」(utils/teacherDayOff) は授業の代行・合同・振替から
// 決まる日単位の表示で、不在期間とは独立 (不在期間の授業を代行にすれば、その日は
// 「代行で休み」とも出る)。

import { fmtMD, isValidDateStr } from "./dateHelpers";
import { splitTeacherField } from "./biweekly";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const asList = (raw) =>
  Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];

/**
 * 1 件を整える。形にならないもの (講師・日付が無い) は null。開始 > 終了は入れ替える。
 * 空のメモはキーごと落とす (RTDB は空文字を残すが、形をそろえる)。
 * @returns {import("../types").TeacherAway | null}
 */
export function normalizeTeacherAway(r) {
  if (r == null || typeof r !== "object" || Array.isArray(r)) return null;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  const teacher = str(r.teacher);
  let startDate = str(r.startDate);
  let endDate = str(r.endDate) || startDate;
  if (!teacher || !isValidDateStr(startDate) || !isValidDateStr(endDate)) return null;
  if (endDate < startDate) [startDate, endDate] = [endDate, startDate];
  const memo = str(r.memo);
  return { id, teacher, startDate, endDate, ...(memo ? { memo } : {}) };
}

const byStartTeacherId = (a, b) =>
  a.startDate.localeCompare(b.startDate) ||
  a.endDate.localeCompare(b.endDate) ||
  a.id - b.id;

/** 読み込みの正規化 (RTDB が配列をオブジェクトで返すことがある)。開始日順 */
export function migrateTeacherAways(raw) {
  const out = [];
  const ids = new Set();
  for (const r of asList(raw)) {
    const rec = normalizeTeacherAway(r);
    if (!rec || ids.has(rec.id)) continue;
    ids.add(rec.id);
    out.push(rec);
  }
  return out.sort(byStartTeacherId);
}

// ─── 入力 ───────────────────────────────────────────────────────────

export const emptyAwayDraft = () => ({ teacher: "", startDate: "", endDate: "", memo: "" });

export const draftFromAway = (rec) => ({
  teacher: rec?.teacher || "",
  startDate: rec?.startDate || "",
  endDate: rec?.endDate || "",
  memo: rec?.memo || "",
});

/**
 * 入力の確認。講師は「福武・川井」のように何人でも書ける (1 人 1 件で作る)。
 * 終了日の空欄は開始日と同じ (1 日だけの不在)。
 * @returns {{ok: true, teachers: string[], startDate: string, endDate: string, memo: string} | {ok: false, error: string}}
 */
export function validateAwayDraft(draft) {
  const teachers = splitTeacherField(draft?.teacher || "");
  if (teachers.length === 0) return { ok: false, error: "講師を入力してください" };
  const startDate = str(draft?.startDate);
  if (!isValidDateStr(startDate)) return { ok: false, error: "開始日を入力してください" };
  const endDate = str(draft?.endDate) || startDate;
  if (!isValidDateStr(endDate)) return { ok: false, error: "終了日が読めません" };
  if (endDate < startDate) return { ok: false, error: "終了日が開始日より前です" };
  return { ok: true, teachers, startDate, endDate, memo: str(draft?.memo) };
}

/**
 * 登録 (講師ごとに 1 件)。idFloor = この画面を開いてから見た最大の id
 * (消した直後に足すと消した id を使い回し、6 秒の「元に戻す」が効かなくなるため)。
 * @returns {{next: import("../types").TeacherAway[], added: import("../types").TeacherAway[]} | {error: string}}
 */
export function addTeacherAways(list, draft, idFloor = 0) {
  const v = validateAwayDraft(draft);
  if (!v.ok) return { error: v.error };
  const cur = migrateTeacherAways(list);
  let id = Math.max(idFloor, ...cur.map((r) => r.id), 0);
  const added = v.teachers.map((teacher) =>
    normalizeTeacherAway({ id: ++id, teacher, startDate: v.startDate, endDate: v.endDate, memo: v.memo })
  );
  return { next: migrateTeacherAways([...cur, ...added]), added };
}

/**
 * 1 件を直す (講師は 1 人だけ。複数書かれていたら先頭)。
 * @returns {{next: import("../types").TeacherAway[], updated: import("../types").TeacherAway} | {error: string}}
 */
export function updateTeacherAway(list, id, draft) {
  const v = validateAwayDraft(draft);
  if (!v.ok) return { error: v.error };
  if (v.teachers.length > 1) return { error: "直すときは講師を 1 人にしてください" };
  const cur = migrateTeacherAways(list);
  if (!cur.some((r) => r.id === id)) return { error: "直す記録が見つかりません" };
  const updated = normalizeTeacherAway({
    id,
    teacher: v.teachers[0],
    startDate: v.startDate,
    endDate: v.endDate,
    memo: v.memo,
  });
  return { next: migrateTeacherAways(cur.map((r) => (r.id === id ? updated : r))), updated };
}

// ─── 読む ───────────────────────────────────────────────────────────

/** その日がその記録の期間内か */
export const isAwayOn = (rec, date) => !!rec && !!date && rec.startDate <= date && date <= rec.endDate;

/** その日に不在の記録 (講師名を渡せばその人だけ) */
export function awaysOnDate(list, date, teacher = null) {
  if (!date) return [];
  return (list || []).filter(
    (r) => isAwayOn(r, date) && (teacher == null || r.teacher === teacher)
  );
}

/** その講師がその日に不在なら記録 (無ければ null)。講師名は完全一致 */
export function awayForTeacherOn(list, teacher, date) {
  if (!teacher || !date) return null;
  return (list || []).find((r) => r.teacher === teacher && isAwayOn(r, date)) || null;
}

/**
 * 期間 [from, to] に掛かる記録 (講師名を渡せばその人だけ)。開始日順。
 */
export function awaysInRange(list, from, to, teacher = null) {
  if (!from || !to) return [];
  return (list || [])
    .filter(
      (r) =>
        r.startDate <= to && r.endDate >= from && (teacher == null || r.teacher === teacher)
    )
    .sort(byStartTeacherId);
}

/** "active" (今日を含む) / "upcoming" / "ended" */
export function awayStatus(rec, today) {
  if (!rec || !today) return "upcoming";
  if (rec.endDate < today) return "ended";
  if (rec.startDate > today) return "upcoming";
  return "active";
}

/** "1/4〜1/22" (1 日だけなら "1/4")。年が違えば年を添える */
export function formatAwayPeriod(rec) {
  if (!rec) return "";
  if (rec.startDate === rec.endDate) return fmtMD(rec.startDate);
  const sameYear = rec.startDate.slice(0, 4) === rec.endDate.slice(0, 4);
  return `${fmtMD(rec.startDate, { withYear: !sameYear })}〜${fmtMD(rec.endDate, { withYear: !sameYear })}`;
}

/** 「福武 不在 1/4〜1/22 (研修)」 */
export function describeAway(rec, { withTeacher = true } = {}) {
  if (!rec) return "";
  return [withTeacher ? rec.teacher : "", "不在", formatAwayPeriod(rec), rec.memo ? `(${rec.memo})` : ""]
    .filter(Boolean)
    .join(" ");
}

/** 期間の日数 (両端を含む) */
export function awayDayCount(rec) {
  if (!rec) return 0;
  const [y1, m1, d1] = rec.startDate.split("-").map(Number);
  const [y2, m2, d2] = rec.endDate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}
