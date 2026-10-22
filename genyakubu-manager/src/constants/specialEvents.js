// ─── Special event type metadata ──────────────────────────────────
// Shared between SpecialEventManager / Dashboard / MonthView /
// EventCalendarView so type icons・色・ラベルが一箇所で揃う。
//
// 種別は塾の実情に合わせた 7 つ (2026-10-21、schema v24)。teacherMonth は
// 「講師の月間予定 (月間・週間・まとめて印刷・画像) に出すか」の既定値で、
// 実際の値は全員共通の設定 (LS.specialEventDisplay) が持つ
// (utils/specialEventDisplay)。学校の始業式や入試日程まで全員の月間予定に
// 出ると見づらいので、学校の予定・入試は既定で出さない。
//
// 模試 (mock) は 2026-10-22 (schema v26) に追加。学校ごとの校外模試・学力
// テストで、学校タグ (+ 冠模試・希望者だけの模試は「希望者」タグ) を付けると
// 年間カレンダーの学校バッジ・学校別タイムラインにまとまる (utils/schoolSchedule)。
// 学校の予定と同じく講師の月間予定には既定で出さない。色は学校の予定 (空色) と
// 見分けが付くよう藍色。
export const SPECIAL_EVENT_TYPES = Object.freeze([
  { key: "school", label: "学校の予定", icon: "🏫", bg: "#e0ecf8", fg: "#1a4a7a", accent: "#3a7ac4", teacherMonth: false },
  { key: "jukuTest", label: "塾のテスト", icon: "📝", bg: "#fbe0ec", fg: "#9a2a5a", accent: "#c44a8a", teacherMonth: true },
  { key: "entrance", label: "入試", icon: "🎓", bg: "#ede0f5", fg: "#5a3a8e", accent: "#8a5ec4", teacherMonth: false },
  { key: "course", label: "講習", icon: "📚", bg: "#dff3f1", fg: "#17605a", accent: "#2f9a90", teacherMonth: true },
  { key: "parents", label: "保護者会", icon: "👪", bg: "#fff4d4", fg: "#8a6a10", accent: "#caa030", teacherMonth: true },
  { key: "staff", label: "社内", icon: "🏢", bg: "#e6e9f0", fg: "#3a4560", accent: "#6a7590", teacherMonth: true },
  { key: "mock", label: "模試", icon: "✏️", bg: "#e7e7fb", fg: "#2e2f86", accent: "#5b5fd6", teacherMonth: false },
  { key: "other", label: "その他", icon: "📌", bg: "#e8e8e8", fg: "#444", accent: "#888", teacherMonth: true },
]);

export const DEFAULT_SPECIAL_EVENT_TYPE = "other";

export const SPECIAL_EVENT_TYPE_BY_KEY = (() => {
  const m = new Map();
  for (const t of SPECIAL_EVENT_TYPES) m.set(t.key, t);
  return m;
})();

export function specialEventTypeMeta(key) {
  return SPECIAL_EVENT_TYPE_BY_KEY.get(key) || SPECIAL_EVENT_TYPE_BY_KEY.get("other");
}

// 講師の月間予定に出す種別の既定値 ({ school: false, jukuTest: true, ... })。
export const DEFAULT_TEACHER_MONTH_TYPES = Object.freeze(
  Object.fromEntries(SPECIAL_EVENT_TYPES.map((t) => [t.key, t.teacherMonth]))
);

// schema v23 までの種別 → v24 の種別。announcement (告知) は「入試」タグ付き
// なら entrance だが、それはタグの読み替え (SPECIAL_EVENT_TYPE_TAGS) で決まる
// ので、ここではタグが無いときの行き先だけを持つ (utils/specialEventTypes)。
export const LEGACY_SPECIAL_EVENT_TYPES = Object.freeze({
  trip: "school",
  ceremony: "school",
  festival: "school",
  announcement: "other",
});

// 種別が足りなかった間 (2026-10-20 の 28 件) にタグで仮置きした種別。
// v24 の移行で種別へ移し、タグからは消す (学校名タグと種別を混ぜない)。
export const SPECIAL_EVENT_TYPE_TAGS = Object.freeze({
  公立中: "school",
  塾テスト: "jukuTest",
  入試: "entrance",
  講習: "course",
  保護者会: "parents",
});

// 講師の月間・週間で、これより長い期間 (日数) のイベントは日のセルに出さず
// 月の上部の帯にまとめる (「中3 直前ポイント」1/12〜3/4 で毎日のセルが埋まる)。
// 7 日以下 (冬期講習の前半/後半・期末テスト) は従来どおりセルに出す。
export const SPECIAL_EVENT_BAND_MIN_DAYS = 8;
