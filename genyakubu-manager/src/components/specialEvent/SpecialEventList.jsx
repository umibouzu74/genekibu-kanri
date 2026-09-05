import { DEPT_COLOR, gradeToDept } from "../../data";
import { TAG_META } from "../../constants/eventKinds";
import { formatDateRange } from "../../utils/dateHelpers";
import { specialEventTypeMeta } from "../../constants/specialEvents";

// 特別イベントの一覧 (SpecialEventManager から 2026-09-05 に切り出し)。
// 表示だけを持ち、編集 / 削除は親のハンドラを呼ぶ。
//   sorted … 開始日順に並べ済みのイベント
export function SpecialEventList({ sorted, editId, isAdmin, onEdit, onDel }) {
  return (
    <>
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      {sorted.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: "32px 20px",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>
            📌
          </div>
          <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
            登録された特別イベントはありません
          </div>
          {isAdmin && (
            <div style={{ fontSize: 12, color: "#888" }}>
              修学旅行・テスト発表・式典など、告知したい予定をここで登録します
            </div>
          )}
        </div>
      ) : (
        sorted.map((ev, i) => {
          const meta = specialEventTypeMeta(ev.eventType);
          return (
            <div
              key={ev.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom:
                  i < sorted.length - 1 ? "1px solid #eee" : "none",
                background:
                  editId === ev.id
                    ? "#fffbe6"
                    : i % 2
                      ? "#f8f9fa"
                      : "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: meta.bg,
                    color: meta.fg,
                    border: `1px solid ${meta.accent}`,
                  }}
                >
                  {meta.icon} {meta.label}
                </span>
                <strong style={{ fontSize: 13 }}>{ev.name}</strong>
                <span style={{ fontSize: 11, color: "#666" }}>
                  {formatDateRange(ev.startDate, ev.endDate)}
                </span>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {(ev.targetGrades || []).length === 0 ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#1a1a2e",
                        color: "#fff",
                      }}
                    >
                      全学年
                    </span>
                  ) : (
                    (ev.targetGrades || []).map((g) => {
                      const dept = gradeToDept(g);
                      const col =
                        DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
                      return (
                        <span
                          key={g}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: col.b,
                            color: col.f,
                          }}
                        >
                          {g}
                        </span>
                      );
                    })
                  )}
                </div>
                {(ev.tags || []).length > 0 && (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {ev.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: TAG_META.bg,
                          color: TAG_META.fg,
                          border: `1px solid ${TAG_META.accent}`,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {ev.memo && (
                  <span
                    style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                  >
                    {ev.memo}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => onEdit(ev)}
                    aria-label={`${ev.name} を編集`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 2,
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => onDel(ev)}
                    aria-label={`${ev.name} を削除`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
    <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
      ※特別イベントは告知用の表示のみで、休講や授業数には影響しません。
      授業を休止する場合は、別途「休講日」を登録してください。
      夏期講習の追加回やテスト対策など「授業として実施する単発コマ」は、
      このページ下部の「追加授業管理」で登録すると講師のスケジュールにも
      反映されます (これまで告知イベントで代用していた場合は移行を推奨)。
    </div>
    </>
  );
}
