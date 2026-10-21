// ─── 特別イベントの「講師の月間予定に出す」設定と長い期間の帯 ─────────
// 設定は端末ごとではなく全員共通 (管理者が決める、LS.specialEventDisplay)。
// 値は { monthTypes: { school: false, jukuTest: true, ... } }。
//
// RTDB は空の {} をノードごと消すので、**全種別の真偽値を必ず持たせる**
// (normalizeSpecialEventDisplay を読み込みの migrate に通す)。欠けた種別は
// 既定値 (constants/specialEvents の teacherMonth) で埋める。
//
// 効く場所は講師別の月間 (MonthView)・週間 (WeekView)。📋 まとめて印刷・
// 🖼 画像は MonthView を通るので揃う。イベントカレンダー・ダッシュボードは
// 全体を見る画面なので全種別を出す。判定は EventVisibilityToggles の
// isSpecialEventVisibleInTeacherView の 1 か所 (各ビューで書き起こさない)。

import {
  SPECIAL_EVENT_BAND_MIN_DAYS,
  SPECIAL_EVENT_TYPES,
  specialEventTypeMeta,
} from "../constants/specialEvents";

export const DEFAULT_SPECIAL_EVENT_DISPLAY = Object.freeze({
  monthTypes: Object.freeze(
    Object.fromEntries(SPECIAL_EVENT_TYPES.map((t) => [t.key, t.teacherMonth]))
  ),
});

export function normalizeSpecialEventDisplay(raw) {
  const src =
    raw && typeof raw === "object" && raw.monthTypes && typeof raw.monthTypes === "object"
      ? raw.monthTypes
      : {};
  const monthTypes = {};
  for (const t of SPECIAL_EVENT_TYPES) {
    monthTypes[t.key] = typeof src[t.key] === "boolean" ? src[t.key] : t.teacherMonth;
  }
  return { monthTypes };
}

// その種別を講師の月間予定に出すか。設定に無い種別 (未知の種別は "other"
// 扱い) は既定値
export function isTypeShownInTeacherMonth(display, eventType) {
  const v = display?.monthTypes?.[eventType];
  if (typeof v === "boolean") return v;
  return specialEventTypeMeta(eventType).teacherMonth;
}

// ─── 長い期間のイベント ─────────────────────────────────────────────
// 講師別の月間・週間では、期間が SPECIAL_EVENT_BAND_MIN_DAYS 日以上の
// イベントを日のセルに出さず、上部の帯 (「この月: 📚 中3 直前ポイント
// 1/12〜3/4」) にまとめる。イベントカレンダーは続きのバーのままでよい。

const dayNumber = (ds) => {
  const [y, m, d] = String(ds || "").split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
};

// 開始日〜終了日の日数 (両端を含む)。単日 = 1
export function specialEventSpanDays(ev) {
  if (!ev?.startDate) return 0;
  const end = ev.endDate || ev.startDate;
  return Math.max(1, dayNumber(end) - dayNumber(ev.startDate) + 1);
}

export function isBandSpecialEvent(ev) {
  return specialEventSpanDays(ev) >= SPECIAL_EVENT_BAND_MIN_DAYS;
}

// 帯に出すイベント (期間が from〜to と重なる長いもの)。開始日順
export function bandSpecialEventsInRange(events, from, to) {
  return (events || [])
    .filter(
      (ev) =>
        isBandSpecialEvent(ev) &&
        ev.startDate <= to &&
        (ev.endDate || ev.startDate) >= from
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}
