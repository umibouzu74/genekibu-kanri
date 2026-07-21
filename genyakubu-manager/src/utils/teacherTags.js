// ─── タグ × 講師担当コマの関連判定 ─────────────────────────────────
// テスト期間 / 特別イベントのタグ (学校名等の自由ラベル) が講師の担当コマに
// 関係するかを判定し、講師の個人スケジュールを開いたときのタグフィルタ
// 初期値を導出する。判定はすべて「現在の時間割の担当コマ」からの導出で、
// ユーザ行動の履歴・統計は一切使わない。
//
// マッチ規則 (slotMatchesTag):
//   1. 学校名タグ: slot.subj の先頭トークン (= 学校。cohorts.firstSubjToken)
//      と照合する。素の部分文字列だと "高松" が 高松桜井/高松西/高松一 にも
//      当たるため、schoolCore で正規化した「核」同士で比較する
//      (例: タグ "高松" は 高松高 のみ、タグ "第一" は 高松一 のみ)
//   2. slot.grade がタグ文字列を含む  (例: "附中1" × タグ "附中")
//   3. 部単位のタグ: gradeToDept の結果 ("中学部"/"高校部") がタグを含む
//      → "中学" / "中学部" は中学の全コマ、"高校" / "高校部" は高校の全コマ

import { gradeToDept } from "./scheduleHelpers";
import { isSlotForTeacher } from "./biweekly";
import { firstSubjToken } from "./cohorts";

// 正規化 (schoolCore) では拾えない略称の対応表。subj 側の学校トークン表記
// (キー) に対して、タグとして使われうる別表記 (値) を列挙する。
export const SCHOOL_TAG_ALIASES = Object.freeze({
  高松高: Object.freeze(["高高"]),
});

// 学校名の「核」を取り出す正規化。先頭の "高松" / "第"、末尾の "高校" /
// "高" を落とす:
//   "高松桜井" → "桜井"   "高松一" → "一"   "第一" → "一"   "一高" → "一"
//   "西高" → "西"         "桜井高校" → "桜井"
//   "高松高" / "高松" / "高松高校" / "高松第一高校" → "" / "" / "" / "一"
// 空核 = 「素の高松高校」を指す表記。
export function schoolCore(s) {
  let t = String(s ?? "").trim();
  if (t.startsWith("高松")) t = t.slice(2);
  if (t.startsWith("第")) t = t.slice(1);
  if (t.endsWith("高校")) t = t.slice(0, -2);
  else if (t.endsWith("高")) t = t.slice(0, -1);
  return t;
}

// 学校トークン (subj 先頭トークン) がタグに該当するか。
export function schoolTokenMatchesTag(token, tag) {
  if (!token || !tag) return false;
  if (token === tag) return true;
  if (SCHOOL_TAG_ALIASES[token]?.includes(tag)) return true;
  const tokenCore = schoolCore(token);
  const tagCore = schoolCore(tag);
  // 空核 (高松/高松高/高松高校) は空核同士でのみマッチさせる。素の包含で
  // 判定すると "高松" が 高松桜井/高松西/高松一 の全部に当たってしまう。
  if (tagCore === "") return tokenCore === "";
  // 核ベースの包含 (例: タグ "桜井" × トークン "高松桜井"、
  // タグ "東大" × トークン "東大京大医進")
  return tokenCore.includes(tagCore);
}

// タグが slot (の学校・学年・部) に関係するか。
export function slotMatchesTag(slot, tag) {
  if (!tag || !slot) return false;
  if (schoolTokenMatchesTag(firstSubjToken(slot.subj), tag)) return true;
  if (slot.grade && slot.grade.includes(tag)) return true;
  const dept = slot.grade ? gradeToDept(slot.grade) : null;
  if (dept && dept.includes(tag)) return true;
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
