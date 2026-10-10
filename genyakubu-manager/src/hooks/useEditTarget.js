import { useEffect } from "react";

// 編集 / 新規フォームを画面に出す。一覧の ✏️ を押してもフォームが画面外
// (一覧のずっと上) にあると、書き換わったことに気付けず「押しても何も起きない」
// ように見える。描画が確定してから (次フレーム) スクロールする。
// scrollIntoView の無い環境 (jsdom) では何もしない。
export function scrollFormIntoView(formRef) {
  requestAnimationFrame(() => {
    const el = formRef?.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// 外部 (例: イベントカレンダーやコマンドパレット) からの編集要求を
// Manager 側で消化するための共通フック。
//
// editTargetId が変化したら以下を行う:
//  1. items から該当 id を探す
//  2. isAdmin が true なら onEdit(target) を呼んでフォームを開く
//  3. formRef があれば次フレームで scrollIntoView してフォームを可視化
//  4. onConsume() で親側の状態をクリアする
//
// editTargetId 以外を deps に入れると items 配列の参照変化や
// onEdit の再生成で無限ループするので、意図的に editTargetId のみで
// 起動する。eslint の exhaustive-deps はこの 1 行のみ抑制する。
export function useEditTarget({
  editTargetId,
  items,
  onEdit,
  onConsume,
  formRef,
  isAdmin,
}) {
  useEffect(() => {
    if (editTargetId == null) return;
    const target = items.find((it) => it.id === editTargetId);
    if (target && isAdmin) {
      onEdit(target);
      scrollFormIntoView(formRef);
    }
    onConsume?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTargetId]);
}

// 外部からの「新規登録フォームを開く」要求を消化するフック。
// token が変化したら resetForm + scrollIntoView を行う。トークンは
// クリック毎に変化させる必要があるため、親側で Date.now() などを設定する。
// date ("YYYY-MM-DD") を渡すと onReset(date) に渡る (イベントカレンダーの
// 日付セルから登録するとき、その日をフォームに入れておくため)。
export function useNewEntryTarget({
  token,
  date = null,
  onReset,
  onConsume,
  formRef,
  isAdmin,
}) {
  useEffect(() => {
    if (token == null) return;
    if (isAdmin) {
      onReset?.(date || undefined);
      scrollFormIntoView(formRef);
    }
    onConsume?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
}
