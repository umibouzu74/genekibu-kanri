import { memo } from "react";

// ─── AbsenceExcelCell ──────────────────────────────────────────────
// 欠勤組み換えの Excel グリッド 1 セル。親 (AbsenceExcelSection) から
// 対象時間/学年/クラス/教室に該当するスロット配列 (cards) を受け取り、
// 1 枚以上の AbsenceSlotCard を縦スタックで表示する。
// ドロップ時は slotId を dataTransfer から取り出して onDrop(slotId) を
// 発火する — 呼び出し側で「時間のみを更新する move ドラフト」を作成する。
export const AbsenceExcelCell = memo(function AbsenceExcelCell({
  cards,
  colSpan,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCard,
}) {
  const hasCards = cards && cards.length > 0;

  const handleDrop = (e) => {
    e.preventDefault();
    const slotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (Number.isNaN(slotId)) return;
    onDrop(slotId);
  };

  return (
    <td
      colSpan={colSpan}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver && onDragOver(e);
      }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      style={{
        border: hasCards ? "1px solid #ccc" : "1px dashed #ddd",
        padding: 4,
        minWidth: 120,
        height: hasCards ? undefined : 60,
        verticalAlign: "top",
        background: isDragOver ? "#e8f4ff" : hasCards ? "#fff" : "#fafafa",
        transition: "background .15s",
        position: "relative",
        overflow: "visible",
      }}
    >
      {hasCards && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {cards.map((slot) => renderCard(slot))}
        </div>
      )}
    </td>
  );
});
