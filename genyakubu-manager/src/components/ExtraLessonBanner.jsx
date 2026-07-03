import { EXTRA_LESSON_COLOR } from "../constants/colors";

// 追加授業 (特定日付の単発コマ) のバナー表示。
// Dashboard 日別 (DashDayRow) と時間割グリッド (ExcelGridView) で共有する。
// 「その日にやる」と明示登録されたコマなので、休講日でも巻き添えにせず
// 表示する (呼び出し側も非表示にしないこと)。
export function ExtraLessonBanner({ lessons, style }) {
  if (!lessons || lessons.length === 0) return null;
  return (
    <div
      style={{
        background: EXTRA_LESSON_COLOR.bannerBg,
        border: `1px solid ${EXTRA_LESSON_COLOR.bannerBorder}`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      {lessons.map((l) => (
        <div
          key={l.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12,
          }}
          title={l.note || undefined}
        >
          <span
            style={{
              background: EXTRA_LESSON_COLOR.color,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "1px 6px",
              borderRadius: 3,
            }}
          >
            追加授業{l.label ? ` ${l.label}` : ""}
          </span>
          <b>{l.time}</b>
          <span style={{ fontWeight: 700 }}>
            {l.grade}
            {l.cls && l.cls !== "-" ? l.cls : ""} {l.subj}
          </span>
          {l.teacher && <span style={{ color: "#555" }}>{l.teacher}</span>}
          {l.room && <span style={{ color: "#888" }}>@{l.room}</span>}
        </div>
      ))}
    </div>
  );
}
