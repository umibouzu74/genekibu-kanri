import { DEPT_COLOR, gradeToDept } from "../../data";
import { S } from "../../styles/common";
import { TAG_META } from "../../constants/eventKinds";
import { findScheduleByExamPeriodId } from "../../utils/examPrepHelpers";

// テスト期間の一覧 (ExamPeriodManager から 2026-09-05 に切り出し)。
// 表示だけを持ち、編集 / 削除 / 特訓シフトは親のハンドラを呼ぶ。
//   sorted … 開始日順に並べ済みのテスト期間
export function ExamPeriodList({
  sorted,
  editId,
  isAdmin,
  examPrepCrud,
  examPrepSchedules,
  onEdit,
  onDel,
  onOpenSchedule,
}) {
  return (
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
          <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>📝</div>
          <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
            登録されたテスト期間はありません
          </div>
          {isAdmin && (
            <div style={{ fontSize: 12, color: "#888" }}>
              上のフォームから開始日・終了日・対象を指定して追加してください
            </div>
          )}
        </div>
      ) : (
        sorted.map((ep, i) => (
          <div
            key={ep.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom:
                i < sorted.length - 1 ? "1px solid #eee" : "none",
              background:
                editId === ep.id
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
              <strong style={{ fontSize: 13 }}>{ep.name}</strong>
              <span style={{ fontSize: 11, color: "#666" }}>
                {ep.startDate} 〜 {ep.endDate}
              </span>
              {ep.stopsClasses === false && (
                <span
                  title="授業を休止しない (表示のみ)"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "#fff",
                    color: "#7a4a10",
                    border: "1px dashed #e0a030",
                  }}
                >
                  表示のみ
                </span>
              )}
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {ep.targetGrades.length === 0 ? (
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
                  ep.targetGrades.map((g) => {
                    const dept = gradeToDept(g);
                    const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
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
              {(ep.classExceptions || []).length > 0 &&
                ep.stopsClasses !== false && (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {[...ep.classExceptions]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((ex) => {
                        const gl =
                          (ex.grades || []).length === 0
                            ? "対象学年すべて"
                            : ex.grades.join("・");
                        return (
                          <span
                            key={ex.date}
                            title={`${ex.date} は ${gl} の授業を行う${ex.memo ? `\n${ex.memo}` : ""}`}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#e8f3e8",
                              color: "#2f6b2f",
                              border: "1px solid #9fc79f",
                            }}
                          >
                            📖 {ex.date.slice(5).replace("-", "/")} 授業あり
                            {(ex.grades || []).length > 0
                              ? ` (${ex.grades.join("・")})`
                              : ""}
                          </span>
                        );
                      })}
                  </div>
                )}
              {(ep.tags || []).length > 0 && (
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {ep.tags.map((t) => (
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
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                {examPrepCrud && (
                  <button
                    type="button"
                    onClick={() => onOpenSchedule(ep)}
                    aria-label={`${ep.name} の特訓シフトを設定`}
                    style={{
                      ...S.btn(false),
                      fontSize: 11,
                      padding: "4px 10px",
                    }}
                  >
                    特訓シフト
                    {(() => {
                      const sch = findScheduleByExamPeriodId(examPrepSchedules, ep.id);
                      const n = (sch?.days || []).length;
                      return n > 0 ? ` (${n})` : "";
                    })()}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(ep)}
                  aria-label={`${ep.name} を編集`}
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
                  onClick={() => onDel(ep)}
                  aria-label={`${ep.name} を削除`}
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
        ))
      )}
    </div>
  );
}
