import { useState } from "react";

// 欠勤組み換えの Excel グリッド 1 セル。ドラッグオーバーは親へ伝搬させず
// ローカル状態で扱う (親まで持ち上げると 5 セクション全体が再レンダーされる)。
export function AbsenceExcelCell({ cards, colSpan, onDrop, renderCard }) {
  const [dragOver, setDragOver] = useState(false);
  const hasCards = cards.length > 0;

  return (
    <td
      colSpan={colSpan}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const slotId = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!Number.isNaN(slotId)) onDrop(slotId);
      }}
      style={{
        border: hasCards ? "1px solid #ccc" : "1px dashed #ddd",
        padding: 4,
        minWidth: 120,
        height: hasCards ? undefined : 60,
        verticalAlign: "top",
        background: dragOver ? "#e8f4ff" : hasCards ? "#fff" : "#fafafa",
        transition: "background .15s",
        position: "relative",
        overflow: "visible",
      }}
    >
      {hasCards && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {cards.map((slot) => renderCard(slot))}
        </div>
      )}
    </td>
  );
}
