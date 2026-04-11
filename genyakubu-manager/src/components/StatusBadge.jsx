import { memo } from "react";
import { SUB_STATUS } from "../data";

function StatusBadgeImpl({ status }) {
  const s = SUB_STATUS[status] || SUB_STATUS.requested;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeImpl);
