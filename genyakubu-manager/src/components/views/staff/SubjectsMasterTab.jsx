import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";

// 教科マスタータブ : カテゴリと教科のインライン CRUD。
export function SubjectsMasterTab({
  subjectCategories,
  subjectsByCat,
  newCatName,
  setNewCatName,
  newCatColor,
  setNewCatColor,
  handleAddCategory,
  newSubjByCat,
  setNewSubjByCat,
  handleAddSubject,
  onSaveCategory,
  onDelCategory,
  onSaveSubject,
  onDelSubject,
}) {
  return (
    <div>
      <div
        style={{
          background: "#fff",
          padding: 14,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          カテゴリを追加
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="カテゴリ名 (例: 文系)"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCategory();
            }}
            style={{ ...S.input, width: 200 }}
          />
          <label style={{ fontSize: 11, color: "#666" }}>
            色:
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              style={{ marginLeft: 6, verticalAlign: "middle" }}
            />
          </label>
          <button onClick={handleAddCategory} style={S.btn(true)}>
            ＋ 追加
          </button>
        </div>
      </div>

      {subjectCategories.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            textAlign: "center",
            color: "#bbb",
            padding: 30,
            fontSize: 13,
          }}
        >
          カテゴリが登録されていません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subjectCategories.map((cat) => {
            const catSubjects = subjectsByCat.get(cat.id) || [];
            return (
              <div
                key={cat.id}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: `2px solid ${cat.color || "#e0e0e0"}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: cat.color ? `${cat.color}22` : "#f8f9fa",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="color"
                      value={cat.color || "#888"}
                      onChange={(e) =>
                        onSaveCategory({ ...cat, color: e.target.value })
                      }
                      title="カテゴリ色"
                      style={{ width: 26, height: 20 }}
                    />
                    <input
                      value={cat.name}
                      onChange={(e) =>
                        onSaveCategory({ ...cat, name: e.target.value })
                      }
                      style={{
                        ...S.input,
                        fontWeight: 800,
                        fontSize: 14,
                        width: 180,
                        color: cat.color || "#333",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {catSubjects.length} 教科
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelCategory(cat.id)}
                    aria-label={`${cat.name} を削除`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: colors.danger,
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ padding: "10px 14px" }}>
                  {catSubjects.length === 0 && (
                    <div style={{ fontSize: 11, color: "#bbb", marginBottom: 6 }}>
                      教科が登録されていません
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {catSubjects.map((subj) => (
                      <div
                        key={subj.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          padding: "4px 0",
                        }}
                      >
                        <input
                          value={subj.name}
                          onChange={(e) =>
                            onSaveSubject({ ...subj, name: e.target.value })
                          }
                          style={{ ...S.input, width: 140 }}
                        />
                        <input
                          value={(subj.aliases || []).join(", ")}
                          onChange={(e) =>
                            onSaveSubject({
                              ...subj,
                              aliases: e.target.value
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="別名 (カンマ区切り)"
                          style={{ ...S.input, flex: 1, maxWidth: 320 }}
                        />
                        <button
                          type="button"
                          onClick={() => onDelSubject(subj.id)}
                          aria-label={`${subj.name} を削除`}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                            color: colors.danger,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed #e0e0e0",
                    }}
                  >
                    <input
                      value={newSubjByCat[cat.id] || ""}
                      onChange={(e) =>
                        setNewSubjByCat((p) => ({ ...p, [cat.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddSubject(cat.id);
                      }}
                      placeholder="教科名を追加"
                      style={{ ...S.input, width: 180 }}
                    />
                    <button onClick={() => handleAddSubject(cat.id)} style={S.btn(true)}>
                      ＋ 教科
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginTop: 10,
          padding: 10,
          background: "#fffbea",
          borderRadius: 6,
          border: "1px solid #f0e8c0",
        }}
      >
        ※ 別名 (aliases) は代行候補フィルタで使用されます。コマの科目文字列が
        教科名または別名のいずれかを含むと、その教科を担当できるバイトが優先表示されます。
      </div>
    </div>
  );
}
