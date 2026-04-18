import { memo } from "react";

// 隔週コマの A 週 / B 週 を示す小さなバッジ。
// Dashboard の時間割グリッドと欠勤組み換え画面の両方で使われる。
function BiweeklyWeekBadgeImpl({ weekType }) {
  if (weekType !== "A" && weekType !== "B") return null;
  return (
    <span
      style={{
        background: weekType === "A" ? "#2e6a9e" : "#c05030",
        color: "#fff",
        padding: "0 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
      }}
    >
      {weekType}週
    </span>
  );
}

export const BiweeklyWeekBadge = memo(BiweeklyWeekBadgeImpl);
