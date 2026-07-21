// ─── タグ × 講師担当コマの関連判定 ─────────────────────────────────
// テスト期間 / 特別イベントのタグ (学校名等の自由ラベル) が講師の担当コマに
// 関係するかを判定し、講師の個人スケジュールを開いたときのタグフィルタ
// 初期値を導出する。判定はすべて「現在の時間割の担当コマ」からの導出で、
// ユーザ行動の履歴・統計は一切使わない。
//
// マッチ規則 (slotMatchesTag):
//   1. slot.subj がタグ文字列を含む   (例: "高松桜井 数学" × タグ "桜井")
//   2. slot.grade がタグ文字列を含む  (例: "附中1" × タグ "附中")
//   3. 部単位のタグ: gradeToDept の結果 ("中学部"/"高校部") がタグを含む
//      → "中学" / "中学部" は中学の全コマ、"高校" / "高校部" は高校の全コマ
//   4. 表記ゆらぎ: SCHOOL_TAG_ALIASES で subj トークン表記 ⇔ タグ表記を対応

import { gradeToDept } from "./scheduleHelpers";
import { isSlotForTeacher } from "./biweekly";

// subj 側の学校トークン表記 (キー) に対して、タグとして使われうる別表記
// (値) の対応表。単純な部分文字列では拾えないゆらぎだけをここに足す。
// 例: 高松第一高校はコマの subj では "高松一" だが、タグでは "第一" と
// 書かれる (types.d.ts の ExamPeriod.tags の例示より)。
export const SCHOOL_TAG_ALIASES = Object.freeze({
  高松一: Object.freeze(["第一", "一高"]),
});

// タグが slot (の科目・学年・部) に関係するか。
export function slotMatchesTag(slot, tag) {
  if (!tag || !slot) return false;
  if (slot.subj && slot.subj.includes(tag)) return true;
  if (slot.grade && slot.grade.includes(tag)) return true;
  const dept = slot.grade ? gradeToDept(slot.grade) : null;
  if (dept && dept.includes(tag)) return true;
  for (const [token, aliases] of Object.entries(SCHOOL_TAG_ALIASES)) {
    if (aliases.includes(tag) && slot.subj?.includes(token)) return true;
  }
  return false;
}

// 講師の担当コマから tagFilters (EventVisibilityToggles の内部表現:
// キー無し = ON / false = OFF) の初期値を導出する。
//   - どのコマにもマッチしないタグは授業データから判定できない自由ラベル
//     (行事名など) なので触らない = 既定の ON のまま残す
//   - いずれかのコマにマッチする「学校系」タグは、講師本人の担当コマ
//     (隔週パートナー含む: isSlotForTeacher) にマッチしなければ OFF にする
export function deriveTagFiltersForTeacher({ teacher, slots, tags }) {
  const filters = {};
  if (!teacher || !Array.isArray(slots) || !Array.isArray(tags)) return filters;
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, teacher));
  for (const tag of tags) {
    if (!slots.some((s) => slotMatchesTag(s, tag))) continue;
    if (!teacherSlots.some((s) => slotMatchesTag(s, tag))) filters[tag] = false;
  }
  return filters;
}
