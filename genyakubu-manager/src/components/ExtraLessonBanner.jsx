import { EXTRA_LESSON_COLOR } from "../constants/colors";

// 追加授業 (特定日付の単発コマ) のバナー表示。
// Dashboard 日別 (DashDayRow) と時間割グリッド (ExcelGridView) で共有する。
// 「その日にやる」と明示登録されたコマなので、休講日でも巻き添えにせず
// 表示する (呼び出し側も非表示にしないこと)。
// onEditExtraLesson (id) を渡すと各行がクリック / Enter / Space で編集へ飛ぶ
// (月次・週間・イベントカレンダーと同じ導線)。渡さなければ従来どおりの
// 素の行のまま。行は文字の高さのままにしたいので、role="button" でも
// モバイルの 40px 規則 (appShell.css) から `inline-activate` で外す。
export function ExtraLessonBanner({ lessons, style, onEditExtraLesson }) {
  if (!lessons || lessons.length === 0) return null;
  const activatable = typeof onEditExtraLesson === "function";
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
          role={activatable ? "button" : undefined}
          className={activatable ? "inline-activate" : undefined}
          tabIndex={activatable ? 0 : undefined}
          onClick={activatable ? () => onEditExtraLesson(l.id) : undefined}
          onKeyDown={
            activatable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditExtraLesson(l.id);
                  }
                }
              : undefined
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12,
            cursor: activatable ? "pointer" : undefined,
          }}
          title={
            activatable
              ? `${l.note ? `${l.note}\n` : ""}クリックで追加授業を編集`
              : l.note || undefined
          }
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
