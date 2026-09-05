import { S } from "../../styles/common";
import { unitLabel } from "../../utils/classSetSuggestions";

// 授業セットの候補 (ClassSetManager から 2026-09-05 に切り出し)。
// 「🔀 コース分けの候補」(週 4 日の学年を 火木 / 水金 のように 2 コースへ) と
// 自動提案 (未登録の学年 × 曜日を 1 セットに)。どちらも候補であって自動適用
// はしない — 受け入れは親のハンドラ経由で登録する。
export function ClassSetSuggestions({
  isAdmin,
  splitSuggestions,
  suggestions,
  onAcceptSplit,
  onAcceptSuggestion,
}) {
  return (
    <>
    {isAdmin && splitSuggestions.length > 0 && (
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #e0e0e0",
          background: "#fff6f0",
        }}
      >
        <div
          style={{ fontSize: 12, fontWeight: 700, color: "#9a4a1e", marginBottom: 6 }}
        >
          🔀 コース分けの候補 ({splitSuggestions.length}件)
        </div>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 8, lineHeight: 1.6 }}>
          週 4 日ある学年です。既定では<strong>平日ぜんぶで 1 コース</strong>として
          回数を数えるので、火木コース / 水金コースのように分かれている場合は
          ここで分けてください（分けないと水曜の第1回が火曜の続きになります）。
          全曜日に同じ生徒が通う学年なら、分けずにこのままで構いません。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {splitSuggestions.map((sug) => (
            <div
              key={sug.key}
              style={{
                padding: "6px 10px",
                background: "#fff",
                borderRadius: 4,
                border: "1px solid #f0d0bc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{sug.label}</div>
                <div style={{ fontSize: 9, color: "#888" }}>
                  {sug.groups
                    .map((g) => `${g.label} ${g.slotCount}コマ`)
                    .join("  /  ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAcceptSplit(sug)}
                style={{
                  ...S.btn(true),
                  fontSize: 10,
                  padding: "3px 10px",
                  background: "#9a4a1e",
                }}
              >
                {sug.groups.length} セットで登録
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

    {isAdmin && suggestions.length > 0 && (
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #e0e0e0",
          background: "#f0f7ff",
        }}
      >
        <div
          style={{ fontSize: 12, fontWeight: 700, color: "#2a4a8e", marginBottom: 6 }}
        >
          💡 自動提案 ({suggestions.length}件)
        </div>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 8, lineHeight: 1.6 }}>
          同じ (学年・クラス) が複数曜日に出現するパターンを検出しました。
          {splitSuggestions.length > 0 && (
            <>
              <br />
              上の「コース分けの候補」と同じ学年が出ている場合は、
              <strong>どちらか一方だけ</strong>を登録してください
              （まとめるか、分けるかの選択です）。
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {suggestions.slice(0, 30).map((sug) => (
            <div
              key={sug.key}
              style={{
                padding: "6px 10px",
                background: "#fff",
                borderRadius: 4,
                border: "1px solid #d0dff0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{sug.label}</div>
                <div style={{ fontSize: 9, color: "#888" }}>
                  {sug.units.map((u) => unitLabel(u)).join(" + ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAcceptSuggestion(sug)}
                style={{
                  ...S.btn(true),
                  fontSize: 10,
                  padding: "3px 10px",
                  background: "#2a4a8e",
                }}
              >
                登録
              </button>
            </div>
          ))}
          {suggestions.length > 30 && (
            <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>
              他 {suggestions.length - 30} 件
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
