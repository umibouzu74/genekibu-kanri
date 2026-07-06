// キー順に依存しない JSON 文字列化。
//
// Firebase RTDB はオブジェクトのキーを書き込み順と異なる順序で返すことが
// あるため、素の JSON.stringify 比較では「自分の書込の echo」や「同一内容」
// の検出に失敗する。全レベルでキーをソートしてから直列化することで、
// キー順だけが違う値を同一と判定できるようにする。
//
// 親アプリの useSyncedStorage (echo 抑制) と timetable-builder の
// projectSync (受信 payload の同一性判定) が共用する。**両者は「同じ値」の
// 定義がズレると片側だけ擬似 apply / 二重書込が起きるため、実装を分岐
// させないこと** (2026-07-06 校正レビューで 2 コピーを一本化した経緯)。
export const stableStringify = (val) =>
  JSON.stringify(val, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v)
          .sort()
          .reduce((o, k) => {
            o[k] = v[k];
            return o;
          }, {})
      : v
  );
