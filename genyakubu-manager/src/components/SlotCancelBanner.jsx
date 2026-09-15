import { colors } from "../styles/tokens";

// コマ休講 (adjustments の cancel。utils/slotCancel) の日単位バナー。
// 日別ダッシュボード (DashDayRow) と時間割グリッド (ExcelGridView) で共有する。
//
// 休講になったコマは各ビューのコマ一覧から外れる (休講 / 特別時程の部分
// 休講と同じ扱い) ので、ここで「この日はこのコマだけ休講」と 1 か所に
// まとめて出す。黙って減らすと「コマが消えた」ように見えるため
// (日まるごと振替の RescheduleOutBanner と同じ理由)。
export function SlotCancelBanner({ items, style }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      role="status"
      style={{
        background: "#f4f4f4",
        border: "1px solid #cfcfcf",
        borderLeft: `4px solid ${colors.danger}`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#555" }}>
        🚫 コマ休講 ({items.length} コマ) — この日はこのコマだけ休講
      </div>
      {items.map(({ slot, adj }) => (
        <div
          key={adj.id ?? slot.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <span
            style={{
              background: colors.danger,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "1px 6px",
              borderRadius: 3,
            }}
          >
            休講
          </span>
          <b style={{ textDecoration: "line-through", color: "#777" }}>{slot.time}</b>
          <span style={{ fontWeight: 700 }}>
            {slot.grade}
            {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}
          </span>
          {slot.teacher && <span style={{ color: "#555" }}>{slot.teacher}</span>}
          {adj.memo && <span style={{ color: "#888" }}>— {adj.memo}</span>}
        </div>
      ))}
    </div>
  );
}
