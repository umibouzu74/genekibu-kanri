// ─── Special event type metadata ──────────────────────────────────
// Shared between SpecialEventManager / Dashboard / MonthView /
// EventCalendarView so type icons・色・ラベルが一箇所で揃う。
export const SPECIAL_EVENT_TYPES = Object.freeze([
  { key: "trip", label: "校外行事", icon: "🚌", bg: "#ede0f5", fg: "#5a3a8e", accent: "#8a5ec4" },
  { key: "ceremony", label: "式典", icon: "🎓", bg: "#e0ecf8", fg: "#1a4a7a", accent: "#3a7ac4" },
  { key: "festival", label: "学校行事", icon: "🎉", bg: "#fbe0ec", fg: "#9a2a5a", accent: "#c44a8a" },
  { key: "announcement", label: "告知", icon: "📢", bg: "#fff4d4", fg: "#8a6a10", accent: "#caa030" },
  { key: "other", label: "その他", icon: "📌", bg: "#e8e8e8", fg: "#444", accent: "#888" },
]);

export const SPECIAL_EVENT_TYPE_BY_KEY = (() => {
  const m = new Map();
  for (const t of SPECIAL_EVENT_TYPES) m.set(t.key, t);
  return m;
})();

export function specialEventTypeMeta(key) {
  return SPECIAL_EVENT_TYPE_BY_KEY.get(key) || SPECIAL_EVENT_TYPE_BY_KEY.get("other");
}
