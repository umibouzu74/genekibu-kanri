// ─── 予備校部の予定の種別 ─────────────────────────────────────────────
// 年間カレンダー (components/views/YearCalendarView) の上半分 = 予備校部の
// 予定。種別は予備校部の「年間行事予定表 (教員用)」の凡例に合わせてある:
//   ■ 休校日 / 月〜金出勤者休日 / 火〜土出勤者休日 / 登校日で授業のない日 / 入寮日
// これらは日付の数字の塗りで見せる「日の種別」。それ以外 (マークテスト・
// 進研模試・ダブル授業・冬期講習…) は「行事」で、名称を欄に出す。
//
// dayFill / dayFg = 日付の数字の塗りと文字色 (紙の予定表の色に寄せる)。
// rank = 1 日に日の種別が 2 つ重なったときに数字の塗りに使う順 (小さい方)。
// 行事 (event) は日付を塗らない。
export const YOBIKO_EVENT_KINDS = Object.freeze([
  { key: "event", label: "行事", short: "", dayFill: null, dayFg: null, rank: 99 },
  { key: "closed", label: "休校日", short: "休校", dayFill: "#2b2b2b", dayFg: "#fff", rank: 0 },
  { key: "dorm", label: "入寮日", short: "入寮", dayFill: "#c0504d", dayFg: "#fff", rank: 1 },
  {
    key: "noClass",
    label: "登校日で授業のない日",
    short: "授業なし",
    dayFill: "#fde74c",
    dayFg: "#333",
    rank: 2,
  },
  {
    key: "offTueSat",
    label: "火〜土出勤者休日",
    short: "火〜土休",
    dayFill: "#f2c094",
    dayFg: "#333",
    rank: 3,
  },
  {
    key: "offMonFri",
    label: "月〜金出勤者休日",
    short: "月〜金休",
    dayFill: "#faeab0",
    dayFg: "#333",
    rank: 4,
  },
]);

export const DEFAULT_YOBIKO_EVENT_KIND = "event";

export const YOBIKO_EVENT_KIND_BY_KEY = (() => {
  const m = new Map();
  for (const k of YOBIKO_EVENT_KINDS) m.set(k.key, k);
  return m;
})();

export function yobikoKindMeta(key) {
  return YOBIKO_EVENT_KIND_BY_KEY.get(key) || YOBIKO_EVENT_KIND_BY_KEY.get(DEFAULT_YOBIKO_EVENT_KIND);
}

/** 日付の数字を塗る種別 (行事以外) か */
export function isYobikoDayMark(key) {
  return key !== DEFAULT_YOBIKO_EVENT_KIND && YOBIKO_EVENT_KIND_BY_KEY.has(key);
}

// 年間カレンダーの 2 つの段 (上 = 予備校部、下 = 現役部) の色。
// 紙面 (白黒印刷) でも見分けが付くよう、段の見出しに名前を出し、段の間に線を引く
export const YEAR_CAL_LANES = Object.freeze({
  yobiko: { label: "予備校部", short: "予備校", bg: "#eaf1fb", fg: "#1f4e8c" },
  genyaku: { label: "現役部", short: "現役", bg: "#fdf0e4", fg: "#8a4a12" },
});
