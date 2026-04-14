import { useMemo, useState } from "react";
import { S } from "../../styles/common";
import { compareJa, sortJa } from "../../utils/sortJa";
import { isSlotForTeacher } from "../../utils/biweekly";
import {
  staffMonthlyWorkDates,
  staffMonthlyAbsenceDates,
  staffMonthlyRegularDates,
  fmtDateWeekday,
} from "../../data";

// バイト管理ビュー。2 タブ構成：
//   - バイト一覧: 登録・削除・担当教科の割り当て (カテゴリ別チェックボックス)
//   - 教科マスター: カテゴリと教科の CRUD (インライン編集)
export function StaffManagerView({
  partTimeStaff,
  teacherSubjects = {},
  subjectCategories,
  subjects,
  slots,
  subs,
  holidays,
  onAddStaff,
  onDelStaff,
  onToggleStaffSubject,
  onSaveCategory,
  onDelCategory,
  onSaveSubject,
  onDelSubject,
  isAdmin,
}) {
  const [tab, setTab] = useState("staff");
  const [newStaff, setNewStaff] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#888");
  const [newSubjByCat, setNewSubjByCat] = useState({}); // { [categoryId]: "名前" }

  const [nowYear, nowMonth] = useMemo(() => {
    const d = new Date();
    return [d.getFullYear(), d.getMonth() + 1];
  }, []);

  const subjectsByCat = useMemo(() => {
    const m = new Map();
    for (const c of subjectCategories) m.set(c.id, []);
    for (const s of subjects) {
      if (!m.has(s.categoryId)) m.set(s.categoryId, []);
      m.get(s.categoryId).push(s);
    }
    return m;
  }, [subjects, subjectCategories]);

  const sortedPartTimeStaff = useMemo(
    () => [...partTimeStaff].sort((a, b) => compareJa(a.name, b.name)),
    [partTimeStaff]
  );

  const allTeachers = useMemo(() => {
    const set = new Set(partTimeStaff.map((s) => s.name));
    slots.forEach((s) => {
      if (!s.teacher) return;
      const names = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
      names.forEach((n) => set.add(n));
    });
    return sortJa([...set]);
  }, [slots, partTimeStaff]);

  // 常勤講師 = スロットに出現するがバイト一覧にない講師
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );
  const fulltimeTeachers = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => {
      if (!s.teacher) return;
      const names = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
      names.forEach((n) => { if (!staffNameSet.has(n)) set.add(n); });
    });
    return sortJa([...set]);
  }, [slots, staffNameSet]);

  const handleAddStaff = () => {
    if (onAddStaff(newStaff)) setNewStaff("");
  };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    onSaveCategory({ name, color: newCatColor });
    setNewCatName("");
    setNewCatColor("#888");
  };

  const handleAddSubject = (categoryId) => {
    const name = (newSubjByCat[categoryId] || "").trim();
    if (!name) return;
    onSaveSubject({ name, categoryId });
    setNewSubjByCat((p) => ({ ...p, [categoryId]: "" }));
  };

  const TabBtn = ({ k, label, count }) => (
    <button onClick={() => setTab(k)} style={S.btn(tab === k)}>
      {label}
      {count != null && <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <TabBtn k="staff" label="バイト一覧" count={partTimeStaff.length} />
        <TabBtn k="fulltime" label="常勤講師" count={fulltimeTeachers.length} />
        <TabBtn k="subjects" label="教科マスター" count={subjects.length} />
      </div>

      {tab === "staff" && (
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
              バイトを追加
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={newStaff}
                  onChange={(e) => setNewStaff(e.target.value)}
                  placeholder="名前を入力"
                  list="staff-candidates"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddStaff();
                  }}
                  style={{ ...S.input, width: 180 }}
                />
                <datalist id="staff-candidates">
                  {allTeachers
                    .filter((t) => !partTimeStaff.some((s) => s.name === t))
                    .map((t) => (
                      <option key={t} value={t} />
                    ))}
                </datalist>
                <button onClick={handleAddStaff} style={S.btn(true)}>
                  ＋ 追加
                </button>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
              ※ 既存講師名を入れると候補補完されます
            </div>
          </div>

          {partTimeStaff.length === 0 ? (
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
              登録されていません
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedPartTimeStaff.map((staff) => {
                const cnt = slots.filter((s) => isSlotForTeacher(s, staff.name)).length;
                return (
                  <div
                    key={staff.name}
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
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{staff.name}</span>
                        <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                          担当コマ: {cnt}
                        </span>
                        <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                          担当教科: {staff.subjectIds.length}
                        </span>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDelStaff(staff.name)}
                          aria-label={`${staff.name} を削除`}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            color: "#c44",
                          }}
                        >
                          ✕
                        </button>
                      )}
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
                                  const checked = staff.subjectIds.includes(subj.id);
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
                                        cursor: "pointer",
                                        background: checked ? (cat.color || "#4a7") : "#fff",
                                        color: checked ? "#fff" : "#555",
                                        border: `1px solid ${checked ? (cat.color || "#4a7") : "#ccc"}`,
                                        fontWeight: checked ? 700 : 400,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          onToggleStaffSubject(staff.name, subj.id)
                                        }
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

                    {/* 今月の出勤状況 */}
                    {subs && (() => {
                      const regularDates = staffMonthlyRegularDates(slots, staff.name, holidays || [], nowYear, nowMonth);
                      const workDates = staffMonthlyWorkDates(subs, staff.name, nowYear, nowMonth);
                      const absenceDates = staffMonthlyAbsenceDates(subs, staff.name, nowYear, nowMonth);
                      return (
                        <div
                          style={{
                            marginTop: 8,
                            background: "#f0f7ff",
                            borderRadius: 6,
                            padding: "8px 10px",
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 11, color: "#4a6a9a", marginBottom: 6 }}>
                            {nowMonth}月の出勤状況
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ color: "#555", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 700, fontSize: 11, color: "#666" }}>
                                通常出勤日（{regularDates.length}日）:
                              </span>{" "}
                              {regularDates.length > 0
                                ? regularDates.map((d) => fmtDateWeekday(d)).join("、")
                                : "—"}
                            </div>
                            <div style={{ color: "#555", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 700, fontSize: 11, color: "#2a7a4a" }}>
                                代行出勤日（{workDates.length}日）:
                              </span>{" "}
                              {workDates.length > 0
                                ? workDates.map((d) => fmtDateWeekday(d)).join("、")
                                : "—"}
                            </div>
                            <div style={{ color: "#555", lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 700, fontSize: 11, color: "#c03030" }}>
                                代行された日（{absenceDates.length}日）:
                              </span>{" "}
                              {absenceDates.length > 0 ? (
                                <>
                                  {absenceDates.map((d) => fmtDateWeekday(d)).join("、")}
                                  <span style={{ marginLeft: 6, fontSize: 10, color: "#999" }}>
                                    ※ 出勤なし
                                  </span>
                                </>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "fulltime" && (
        <div>
          {fulltimeTeachers.length === 0 ? (
            <div style={{
              background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0",
              textAlign: "center", color: "#bbb", padding: 30, fontSize: 13,
            }}>
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
                      background: "#fff", borderRadius: 8,
                      border: "1px solid #e0e0e0", padding: "12px 16px",
                    }}
                  >
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 8,
                    }}>
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
                      <div style={{
                        display: "flex", flexDirection: "column", gap: 8,
                        background: "#f8f9fa", borderRadius: 6, padding: 10,
                      }}>
                        {subjectCategories.map((cat) => {
                          const catSubjects = subjectsByCat.get(cat.id) || [];
                          if (catSubjects.length === 0) return null;
                          return (
                            <div key={cat.id}>
                              <div style={{
                                fontSize: 11, fontWeight: 700,
                                color: cat.color || "#555", marginBottom: 4,
                              }}>
                                {cat.name}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {catSubjects.map((subj) => {
                                  const checked = sids.includes(subj.id);
                                  return (
                                    <label
                                      key={subj.id}
                                      style={{
                                        display: "inline-flex", alignItems: "center",
                                        gap: 4, padding: "3px 8px", borderRadius: 14,
                                        fontSize: 11, cursor: isAdmin ? "pointer" : "default",
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
      )}

      {tab === "subjects" && (
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
                          color: "#c44",
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
                                color: "#c44",
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
      )}
    </div>
  );
}
