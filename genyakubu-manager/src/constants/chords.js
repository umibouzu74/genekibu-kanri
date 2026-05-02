import { VIEWS } from "./views";

// `g` プレフィックス chord による view 遷移定義。
// useChordNavigation と Sidebar のヒント表示で共有する単一の定義元。
//
// 注意: WEEK / MONTH は「講師が選択されている」前提のビューなので、
// selected が null の時に chord で飛ぶと空画面になる。実際の遷移は
// App.jsx 側のラッパで selected を保ちつつ view だけ切り替え、
// selected が null なら chord を no-op にする。
export const VIEW_CHORDS = Object.freeze({
  d: VIEWS.DASH,
  a: VIEWS.ABSENCE_FLOW,
  s: VIEWS.SUBS,
  c: VIEWS.CONFIRMED_SUBS,
  t: VIEWS.TIMETABLE,
  h: VIEWS.HOLIDAYS,
  m: VIEWS.MASTER,
  v: VIEWS.STAFF,
  e: VIEWS.EVENTS,
  w: VIEWS.WEEK,
  // MONTH は m が MASTER で取られているので mOnth から o を採用。
  o: VIEWS.MONTH,
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

// chord 待機中バッジで「次のキー一覧」を出すための短ラベル。
// バッジ幅を抑えるため、サイドバーよりさらに短い表記を用意。
export const VIEW_CHORD_LABEL = Object.freeze({
  d: "ダッシュ",
  a: "欠勤",
  s: "授業",
  c: "代行確定",
  t: "時間割",
  h: "休講日",
  m: "マスター",
  v: "バイト",
  e: "イベント",
  w: "週間",
  o: "月間",
});

// chord タイムアウト ms（hook と badge で共有）。
export const CHORD_TIMEOUT_MS = 1200;
