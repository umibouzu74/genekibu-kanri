import { Fragment, useMemo, useState } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  gradeColor as GC,
  sortSlots as sortS,
} from "../../data";
import { S } from "../../styles/common";
import { sortTeacherNames } from "../../utils/teacherKana";
import { formatCount, weightedSlotCount, isSlotForTeacher, getSlotTeachers } from "../../utils/biweekly";
import { groupTeacherNames } from "../../utils/groupTeacherNames";

const TEACHER_COLORS = ["#2e6a9e", "#c05030", "#3d7a4a", "#9e6a2e"];

export function CompareView({ slots, partTimeStaff = [], subjects = [], teacherKana = {} }) {
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [searchInput, setSearchInput] = useState("");

  // 全講師リスト
  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const t of getSlotTeachers(s)) set.add(t);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, teacherKana]);

  // 検索でフィルタ
  const filteredTeachers = useMemo(
    () =>
      searchInput
        ? allTeachers.filter((t) => t.includes(searchInput))
        : allTeachers,
    [allTeachers, searchInput]
  );
  // 教科ごとにグループ化したチップ一覧 (バイト → 英数国理社 → その他)
  const teacherGroups = useMemo(
    () => groupTeacherNames(filteredTeachers, { slots, partTimeStaff, subjects }),
    [filteredTeachers, slots, partTimeStaff, subjects],
  );

  const toggleTeacher = (t) => {
    setSelectedTeachers((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 4) return prev; // 最大4名
      return [...prev, t];
    });
  };

  // 選択講師ごとの曜日別コマ
  const teacherSlots = useMemo(() => {
    const m = {};
    for (const t of selectedTeachers) {
      const ts = sortS(slots.filter((s) => isSlotForTeacher(s, t)));
      const byDay = {};
      DAYS.forEach((d) => {
        byDay[d] = ts.filter((s) => s.day === d);
      });
      m[t] = byDay;
    }
    return m;
  }, [slots, selectedTeachers]);

  return (
    <div style={{ marginTop: 12 }}>
      {/* 講師選択エリア */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 14,
          border: "1px solid #e0e0e0",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>
            比較する講師を選択（最大4名）
          </span>
          <input
            type="text"
            placeholder="講師名で検索…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ ...S.input, width: "100%", maxWidth: 200 }}
          />
          {selectedTeachers.length > 0 && (
            <button
              onClick={() => setSelectedTeachers([])}
              style={{ ...S.btn(false) }}
            >
              クリア
            </button>
          )}
        </div>

        {/* 選択中の講師 */}
        {selectedTeachers.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {selectedTeachers.map((t, i) => (
              <span
                key={t}
                style={{
                  background: TEACHER_COLORS[i] || "#888",
                  color: "#fff",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                onClick={() => toggleTeacher(t)}
                title="クリックで解除"
              >
                {t}
                <span style={{ fontSize: 10 }}>✕</span>
              </span>
            ))}
          </div>
        )}

        {/* 講師候補リスト (教科ごとにグループ表示)。
            グループが 1 つだけのときは見出しを省略して flat 表示 (1 教科
            しか出ない検索結果でヘッダが空間を無駄にするのを防ぐ — code-review P3)。
            maxHeight は折りたたみ全体が見えやすいよう 280 に拡張。 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {teacherGroups.map((group) => (
            <Fragment key={group.key}>
              {teacherGroups.length > 1 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#666", marginTop: 2 }}>
                  ━ {group.label}
                </div>
              )}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {group.teachers.map((t) => {
                  const isSelected = selectedTeachers.includes(t);
                  const idx = selectedTeachers.indexOf(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTeacher(t)}
                      disabled={!isSelected && selectedTeachers.length >= 4}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        border: isSelected
                          ? `2px solid ${TEACHER_COLORS[idx]}`
                          : "1px solid #ddd",
                        background: isSelected ? TEACHER_COLORS[idx] + "18" : "#fff",
                        color: isSelected ? TEACHER_COLORS[idx] : "#555",
                        fontSize: 11,
                        fontWeight: isSelected ? 700 : 400,
                        cursor:
                          !isSelected && selectedTeachers.length >= 4
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          !isSelected && selectedTeachers.length >= 4 ? 0.4 : 1,
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* 比較グリッド */}
      {selectedTeachers.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: 40,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          上のリストから講師を選択してください
        </div>
      ) : (
        <div className="mobile-scroll-x" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th scope="col"
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    background: "#1a1a2e",
                    color: "#fff",
                    fontSize: 12,
                    width: 60,
                  }}
                >
                  曜日
                </th>
                {selectedTeachers.map((t, i) => (
                  <th scope="col"
                    key={t}
                    style={{
                      padding: "8px 10px",
                      textAlign: "center",
                      background: TEACHER_COLORS[i],
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td
                    style={{
                      padding: "8px 10px",
                      fontWeight: 800,
                      fontSize: 13,
                      color: DC[d],
                      background: DB[d],
                      borderBottom: "1px solid #e0e0e0",
                      verticalAlign: "top",
                    }}
                  >
                    {d}
                  </td>
                  {selectedTeachers.map((t, i) => {
                    const daySlots = teacherSlots[t]?.[d] || [];
                    return (
                      <td
                        key={t}
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid #e0e0e0",
                          borderLeft: "1px solid #e8e8e8",
                          verticalAlign: "top",
                          background: "#fff",
                          minWidth: 120,
                        }}
                      >
                        {daySlots.length === 0 ? (
                          <span style={{ color: "#ccc", fontSize: 11 }}>—</span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                            }}
                          >
                            {daySlots.map((s) => {
                              const gc = GC(s.grade);
                              return (
                                <div
                                  key={s.id}
                                  style={{
                                    fontSize: 10,
                                    lineHeight: 1.3,
                                    padding: "3px 5px",
                                    borderRadius: 4,
                                    background: gc.b,
                                    borderLeft: `3px solid ${TEACHER_COLORS[i]}`,
                                  }}
                                  title={`${s.time} ${s.grade} ${s.subj} ${s.room || ""}`}
                                >
                                  <div style={{ fontWeight: 700, color: gc.f }}>
                                    {s.time.split("-")[0]}
                                  </div>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{s.subj}</span>
                                    <span style={{ color: "#888", marginLeft: 4 }}>
                                      {s.grade}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td
                  style={{
                    padding: "8px 10px",
                    fontWeight: 800,
                    background: "#f0f0f0",
                  }}
                >
                  合計
                </td>
                {selectedTeachers.map((t, i) => {
                  const total = DAYS.reduce(
                    (sum, d) => sum + weightedSlotCount(teacherSlots[t]?.[d] || []),
                    0
                  );
                  return (
                    <td
                      key={t}
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 14,
                        background: "#f0f0f0",
                        color: TEACHER_COLORS[i],
                      }}
                    >
                      {formatCount(total)}コマ
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
