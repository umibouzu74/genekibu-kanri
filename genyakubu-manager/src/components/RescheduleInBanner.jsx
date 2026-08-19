import { ADJ_COLOR } from "../constants/colors";
import { fmtDateWeekday } from "../utils/dateHelpers";

// 他日から「この日へ」振り替えられてくるコマのバナー表示。
// 元コマは別の曜日に属するので通常の描画ループには現れない。追加授業
// (ExtraLessonBanner) と同じく「その日にやると明示登録されたコマ」なので、
// 休講日でも巻き添えにせず表示する (呼び出し側も非表示にしないこと)。
// 日まるごと振替 (12/7 の授業を全部 12/4 へ) の受け先が休講日になるのが
// 典型なので、ここを隠すと紙面にも画面にも何も出なくなる。
export function RescheduleInBanner({ items, style }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      style={{
        background: ADJ_COLOR.reschedule.bannerBg,
        border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
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
          fontSize: 11,
          fontWeight: 800,
          color: ADJ_COLOR.reschedule.deep,
        }}
      >
        ↻ 他の日から振替 ({items.length}件)
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
            }}
            title={adj.memo || undefined}
          >
            <span
              style={{
                background: ADJ_COLOR.reschedule.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              振替
            </span>
            <span style={{ fontSize: 11, color: "#888" }}>
              {fmtDateWeekday(adj.date)} から
            </span>
            <b>{adj.targetTime || slot.time}</b>
            <span style={{ fontWeight: 700 }}>
              {slot.grade}
              {cls} {slot.subj}
            </span>
            <span style={{ color: "#555" }}>
              {adj.targetTeacher || slot.teacher}
            </span>
            {slot.room && <span style={{ color: "#888" }}>@{slot.room}</span>}
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
