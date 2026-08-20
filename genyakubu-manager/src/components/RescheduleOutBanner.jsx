import { ADJ_COLOR } from "../constants/colors";
import {
  describeRescheduleTarget,
  outgoingDayLabel,
} from "../utils/adjustmentDisplay";

// 「この日の授業が全部よそへ行った」= 振替で実質休みになった日のバナー。
//
// コマ 1 つ 1 つには取消線と「振」バッジが付くが、それだけだと月の中で
// その日が休みになったことに気付けない (2026-08-20 の指摘)。休講日の
// 「休講日」表示と同じ強さで、日単位の状態として出す。
//
// **コマ自体は消さない。** どこへ移したかはコマ側に残す方が調べやすいので、
// このバナーは日単位の見出しとして上に足すだけ。呼び出し側は
// `isDayEmptiedByReschedule` が true のときにだけ描くこと (一部だけ
// 振り替えた日はコマ側のバッジで足りる)。
export function RescheduleOutBanner({ items, style }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      style={{
        background: ADJ_COLOR.reschedule.bannerBg,
        border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
        borderLeft: `4px solid ${ADJ_COLOR.reschedule.color}`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: ADJ_COLOR.reschedule.deep,
        }}
      >
        ↻ {outgoingDayLabel(items)}
      </div>
      {items.map(({ adj, slot }) => {
        const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
        return (
          <div
            key={adj.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              paddingLeft: 14,
            }}
            title={adj.memo || undefined}
          >
            <b style={{ color: "#888", textDecoration: "line-through" }}>
              {slot.time}
            </b>
            <span style={{ fontWeight: 700, color: "#666" }}>
              {slot.grade}
              {cls} {slot.subj}
            </span>
            {slot.teacher && <span style={{ color: "#888" }}>{slot.teacher}</span>}
            <span style={{ color: ADJ_COLOR.reschedule.deep, fontWeight: 700 }}>
              → {describeRescheduleTarget(adj)}
            </span>
            {adj.memo && (
              <span style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>
                {adj.memo}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
