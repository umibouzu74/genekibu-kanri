import { isSlotForTeacher } from "../../../utils/biweekly";

// 常勤講師タブ : 時間割のコマに登場するがバイト一覧に無い講師の教科設定。
export function FulltimeTab({
  fulltimeTeachers,
  slots,
  teacherSubjects,
  subjectCategories,
  subjectsByCat,
  onToggleStaffSubject,
  isAdmin,
}) {
  return (
    <div>
      {fulltimeTeachers.length === 0 ? (
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
          常勤講師が見つかりません（時間割にコマを登録すると自動的に表示されます）
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            時間割のコマに登録されている講師のうち、バイト一覧に含まれない講師です。教科を設定すると玉突き代行の提案精度が上がります。
          </div>
          {fulltimeTeachers.map((name) => {
            const cnt = slots.filter((s) => isSlotForTeacher(s, name)).length;
            const sids = teacherSubjects[name] || [];
            return (
              <div
                key={name}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid #e0e0e0",
                  padding: "12px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{name}</span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                      担当コマ: {cnt}
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                      担当教科: {sids.length}
                    </span>
                  </div>
                </div>
                {subjectCategories.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#bbb" }}>
                    教科マスターが未登録です。「教科マスター」タブから追加してください。
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "#f8f9fa",
                      borderRadius: 6,
                      padding: 10,
                    }}
                  >
                    {subjectCategories.map((cat) => {
                      const catSubjects = subjectsByCat.get(cat.id) || [];
                      if (catSubjects.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cat.color || "#555",
                              marginBottom: 4,
                            }}
                          >
                            {cat.name}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {catSubjects.map((subj) => {
                              const checked = sids.includes(subj.id);
                              return (
                                <label
                                  key={subj.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "3px 8px",
                                    borderRadius: 14,
                                    fontSize: 11,
                                    cursor: isAdmin ? "pointer" : "default",
                                    background: checked ? (cat.color || "#4a7") : "#fff",
                                    color: checked ? "#fff" : "#555",
                                    border: `1px solid ${checked ? (cat.color || "#4a7") : "#ccc"}`,
                                    fontWeight: checked ? 700 : 400,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!isAdmin}
                                    onChange={() => onToggleStaffSubject(name, subj.id)}
                                    style={{ margin: 0, accentColor: cat.color || "#4a7" }}
                                  />
                                  {subj.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
