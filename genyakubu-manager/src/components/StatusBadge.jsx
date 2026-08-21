import { memo } from "react";
import { SUB_STATUS } from "../data";
import { subStateMeta } from "../utils/substituteState";

// 代行レコードの状態バッジ。
// substitute を渡すと 4 状態 (代行未定 / 代行なし / 依頼中 / 代行確定) で
// 出す。status だけだと「代行なしで確定」が「確定」と出て、代行が付いた
// ように読める (utils/substituteState)。
function StatusBadgeImpl({ status, substitute }) {
  const meta =
    substitute === undefined
      ? SUB_STATUS[status] || SUB_STATUS.requested
      : subStateMeta({ status, substitute });
  const label = meta.label;
  const border = meta.border || meta.color;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeImpl);
