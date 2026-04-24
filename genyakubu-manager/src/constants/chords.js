import { VIEWS } from "./views";

// `g` プレフィックス chord による view 遷移定義。
// useChordNavigation と Sidebar のヒント表示で共有する単一の定義元。
export const VIEW_CHORDS = Object.freeze({
  d: VIEWS.DASH,
  a: VIEWS.ABSENCE_FLOW,
  s: VIEWS.SUBS,
  c: VIEWS.CONFIRMED_SUBS,
  t: VIEWS.TIMETABLE,
  h: VIEWS.HOLIDAYS,
  m: VIEWS.MASTER,
  v: VIEWS.STAFF,
});

// view key から chord 第 2 キーを引くための逆引き Map（読み取り専用）。
// 例: VIEW_CHORD_BY_VIEW.get(VIEWS.DASH) === "d"
export const VIEW_CHORD_BY_VIEW = (() => {
  const m = new Map();
  for (const [key, view] of Object.entries(VIEW_CHORDS)) {
    m.set(view, key);
  }
  return m;
})();
