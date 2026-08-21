// ─── 講師個人から見た「その日は担当なし」 ──────────────────────────
// 講師別の月間カレンダーで使う。**学校全体の画面 (日別ダッシュボード・
// タイムテーブル) には無い概念** — 代行や合同が付いても授業そのものは
// 行われるので、休みになるのは担当を外れた本人だけ。
// (日をまるごと他日へ移す振替だけは学校全体でも休みになるので、そちらは
//  adjustmentDisplay.isDayEmptiedByReschedule が別に見ている。)

// 手を離れた理由。表示の優先順位もこの順 (欠勤 → 代行 → 合同 → 振替)。
// AWAY_ABSENT は「欠勤を登録したが代行者が入っていない」状態 (代行未定 /
// 代行なしのどちらも)。本人が休むのは代行が付いたときと同じなので away には
// 違いないが、**「代行で休み」と出すと代行が見つかった様に読める**ので理由を
// 分けている。代行未定か代行なしかはコマ側のカードに出る。
export const AWAY_ABSENT = "absent";
export const AWAY_SUB = "sub";
export const AWAY_COMBINE = "combine";
export const AWAY_RESCHEDULE = "reschedule";

/**
 * そのコマがこの講師の手を離れているか。理由を返す (担当のままなら null)。
 *
 * @param {object} args
 * @param {string} args.teacher 見ている講師
 * @param {object|null} args.sub 同じ (日付, コマ) の代行レコード
 * @param {boolean} args.absorbed 合同で他のコマに吸収された
 * @param {object|null} args.rescheduledOut 他日へ出ていく振替 adjustment
 * @returns {"absent"|"sub"|"combine"|"reschedule"|null}
 */
export function teacherAwayReason({ teacher, sub, absorbed, rescheduledOut }) {
  if (sub && sub.originalTeacher === teacher && sub.substitute !== teacher) {
    return sub.substitute ? AWAY_SUB : AWAY_ABSENT;
  }
  if (absorbed) return AWAY_COMBINE;
  // 振替は**その日からコマが出ていく**操作なので、振替先の担当が誰であれ
  // 振替元の日は担当なし。**振替先の担当 (targetTeacher) で除外しないこと**
  // — 振替ピッカーが元担当を既定で書き込むため、ほぼ全部の振替で
  // 「↻ 振替で休み」も取消線も行き先も消える (2026-08-21 の再発防止)。
  if (rescheduledOut) return AWAY_RESCHEDULE;
  return null;
}

const LABEL = {
  [AWAY_ABSENT]: "欠 欠勤",
  [AWAY_SUB]: "代 代行で休み",
  [AWAY_COMBINE]: "合 合同で休み",
  [AWAY_RESCHEDULE]: "↻ 振替で休み",
};

/**
 * その日のコマが全部この講師の手を離れたか + カレンダーに出す見出し。
 *
 * `staying` には**その日に残る仕事**の件数を渡すこと (他人のコマの代行・
 * 他日から入ってくる振替・追加授業・講習コマ)。1 つでもあれば出勤日なので
 * 休みとは言わない。
 *
 * @param {(string|null)[]} reasons コマごとの teacherAwayReason の結果
 * @param {number} [staying]
 * @returns {{off: boolean, reason: string|null, label: string}}
 */
export function summarizeTeacherDayOff(reasons, staying = 0) {
  const none = { off: false, reason: null, label: "" };
  if (!reasons?.length || staying > 0) return none;
  if (reasons.some((r) => !r)) return none;
  const kinds = [...new Set(reasons)];
  if (kinds.length === 1) {
    return { off: true, reason: kinds[0], label: LABEL[kinds[0]] };
  }
  // 代行と振替が混ざった日など。理由を並べても長いだけなので一括で伝える。
  return { off: true, reason: "mixed", label: "この日は担当なし" };
}
