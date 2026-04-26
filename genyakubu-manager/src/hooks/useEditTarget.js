import { useEffect } from "react";

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
      requestAnimationFrame(() => {
        formRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    onConsume?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTargetId]);
}
