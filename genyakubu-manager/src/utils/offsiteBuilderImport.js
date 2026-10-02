// ─── 他校舎の授業 → 講習時間割作成の「講師不在 (外部授業)」 ─────────────
// 講習時間割作成 (timetable-builder) は講師の他所での予定を「他学年セッション
// (externalSessions)」で持ち、時刻があればそこに重なる時限を自動で NG にする
// (timetable-builder/utils/autoNg)。本体の他校舎の授業 (utils/offsiteLessons) を
// 講習の日付プールに展開して、同じ形の登録項目にする純粋関数。
//
// - 講習の日付ラベル ("12/24(木)") を本体と同じ規則で年つきの日付に解決し
//   (builderLessons.resolveDateLabelYmd)、その日に実際に行く予定だけを拾う
//   (休みの日・塾の全体休講日は offsiteLessonsOnDate が外す)
// - 移動時間があれば前後に足した時刻で入れる (講習のコマに間に合わない時限も
//   NG にするため)。メモに行き先と「移動込み」を書く
// - 講習の講師にいない名前は登録しない (講習の講師不在は講習の講師マスタの
//   名前で照合する)。呼び出し側で「講習の講師に居ない」と出す
// 取り込みは画面のボタンを押したときだけ (自動で同期はしない)。同じ内容の
// 再取り込みは講習側の reducer が重複として飛ばす。

import { resolveDateLabelYmd } from "./builderLessons";
import { offsiteLessonsOnDate, offsiteTimeRange } from "./offsiteLessons";

function fmtHM(min) {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * @param {Array} offsiteLessons 本体の他校舎の授業
 * @param {object} opts
 * @param {string[]} opts.dateLabels 講習の日付ラベル ("12/24(木)")
 * @param {string} opts.baseYmd ラベルの年を決める基準日 (builderLessons.projectBaseYmd)
 * @param {Array} [opts.holidays] 本体の休講日 (全体休講日は他校舎も休み)
 * @param {string[]} [opts.teacherNames] 講習の講師名。省略時は絞らない
 * @returns {{
 *   items: {date: string, teacherName: string, label: string, memo: string, startTime: string, endTime?: string}[],
 *   unknownTeachers: string[],
 * }}
 */
export function buildOffsiteSessionItems(
  offsiteLessons,
  { dateLabels = [], baseYmd, holidays = [], teacherNames } = {}
) {
  const known = teacherNames ? new Set(teacherNames) : null;
  const items = [];
  const unknown = new Set();
  if (!Array.isArray(offsiteLessons) || offsiteLessons.length === 0 || !baseYmd) {
    return { items, unknownTeachers: [] };
  }
  for (const label of dateLabels) {
    const ymd = resolveDateLabelYmd(label, baseYmd);
    if (!ymd) continue;
    for (const rec of offsiteLessonsOnDate(offsiteLessons, ymd, { holidays })) {
      if (known && !known.has(rec.teacher)) {
        unknown.add(rec.teacher);
        continue;
      }
      const range = offsiteTimeRange(rec.time);
      if (!range) continue;
      const travel = Number(rec.travelMinutes) || 0;
      const startTime = fmtHM(range.start - travel);
      const endTime = range.end != null ? fmtHM(range.end + travel) : undefined;
      items.push({
        date: label,
        teacherName: rec.teacher,
        // 講習側の手入力と同じ形 (開始-終了 / 開始だけ)
        label: endTime ? `${startTime}-${endTime}` : startTime,
        memo: `他校舎 ${rec.place}${travel > 0 ? ` (移動${travel}分込み)` : ""}`,
        startTime,
        ...(endTime ? { endTime } : {}),
      });
    }
  }
  return { items, unknownTeachers: [...unknown] };
}
