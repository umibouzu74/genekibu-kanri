// 予定表の講座 ↔ システムのコマ (学年|科目名) の対応。自動の推定を見せ、
// 違っていれば選び直せる (選び直した結果はこの端末に保存)。

import { Fragment, useMemo, useState } from "react";
import { S } from "../../../styles/common";
import { gradeToDept } from "../../../utils/scheduleHelpers";
import { courseWeekdays } from "../../../utils/yoteihyo/highSchoolSheet";
import { subjectKey, systemGradesFor } from "../../../utils/yoteihyo/courseMapping";
import { courseLabel, subjectLabel } from "../../../utils/yoteihyo/labels";

const WD_ORDER = "月火水木金土日";
const sortDays = (days) => [...new Set(days)].sort((a, b) => WD_ORDER.indexOf(a) - WD_ORDER.indexOf(b));

export function MappingPanel({ courses, suggestions, mapping, overrides, onChangeOverrides, slots }) {
  const [editing, setEditing] = useState(null); // course key
  const [draft, setDraft] = useState([]);

  // 学年|科目名 → 曜日 (候補の表示用)
  const daysBySubject = useMemo(() => {
    const m = new Map();
    for (const s of slots || []) {
      if (!s?.grade || !s.subj || gradeToDept(s.grade) !== "高校部") continue;
      const k = subjectKey(s.grade, s.subj);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s.day);
    }
    return m;
  }, [slots]);

  const rows = courses.map((c) => ({ course: c, m: mapping.get(c.key), wd: courseWeekdays(c).regular }));
  const problems = rows.filter((r) => r.m && !r.m.skip && r.m.subjects.length === 0).length;

  const startEdit = (course) => {
    setEditing(course.key);
    setDraft(mapping.get(course.key)?.subjects || []);
  };
  const setOverride = (key, value) => {
    const next = { ...(overrides || {}) };
    if (value == null) delete next[key];
    else next[key] = value;
    onChangeOverrides(next);
    setEditing(null);
  };

  const td = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 12, verticalAlign: "top" };
  const chip = {
    display: "inline-block",
    padding: "1px 6px",
    margin: "1px 3px 1px 0",
    borderRadius: 4,
    background: "#eef2f8",
    color: "#1a3a6a",
    fontSize: 11,
  };

  return (
    <details
      style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e0e0e0", marginBottom: 16 }}
      open={problems > 0}
    >
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
        講座とシステムのコマの対応 ({courses.length} 講座{problems > 0 ? `、うち ${problems} 講座はコマが見つかりません` : ""})
      </summary>
      <p style={{ fontSize: 12, color: "#555", lineHeight: 1.7, margin: "8px 0" }}>
        予定表の講座が、システムのどのコマ (学年・科目名) に当たるかの推定です。違っていれば「変える」で選び直してください
        (この端末に保存します)。比べるのは、予定表でその講座の授業がある曜日のコマだけです。
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead>
            <tr>
              {["予定表の講座", "曜日", "システムのコマ", ""].map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  style={{ ...td, textAlign: "left", fontWeight: 700, color: "#444", background: "#f5f5f7" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ course, m, wd }) => {
              const isEditing = editing === course.key;
              const grades = systemGradesFor(course);
              const candidates = [...daysBySubject.entries()]
                .filter(([k, days]) => grades.has(k.split("|")[0]) && days.some((d) => wd.includes(d)))
                .map(([k]) => k);
              for (const k of draft) if (isEditing && !candidates.includes(k)) candidates.push(k);
              candidates.sort();
              return (
                <Fragment key={course.key}>
                  <tr>
                    <td style={{ ...td, minWidth: 180 }}>{courseLabel(course)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{wd.join("・") || "-"}</td>
                    <td style={td}>
                      {m?.skip ? (
                        <span style={{ color: "#777" }}>照合しない</span>
                      ) : m?.subjects.length ? (
                        m.subjects.map((k) => (
                          <span key={k} style={chip}>
                            {subjectLabel(k)}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "#c03030" }}>見つかりません (照合しません)</span>
                      )}
                      {m?.manual && !m.skip && <span style={{ color: "#777", marginLeft: 4 }}>(手で選んだ)</span>}
                      {!m?.manual && suggestions.byCourse.get(course.key)?.ambiguous.length > 0 && (
                        <span style={{ color: "#a05000", marginLeft: 4 }}>(他の講座と同点の推定あり)</span>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditing(null) : startEdit(course))}
                        style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12 }}
                        aria-expanded={isEditing}
                      >
                        {isEditing ? "閉じる" : "変える"}
                      </button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr>
                      <td colSpan={4} style={{ ...td, background: "#fafbfc" }}>
                        {candidates.length === 0 ? (
                          <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
                            この講座の学年・曜日のコマがシステムにありません。
                          </p>
                        ) : (
                          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                            <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                              {courseLabel(course)} に当たるコマ
                            </legend>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                              {candidates.map((k) => (
                                <label key={k} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={draft.includes(k)}
                                    onChange={(e) =>
                                      setDraft((prev) =>
                                        e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)
                                      )
                                    }
                                  />
                                  {subjectLabel(k)}
                                  <span style={{ color: "#888" }}>({sortDays(daysBySubject.get(k) || []).join("・")})</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setOverride(course.key, { subjects: [...draft].sort() })}
                            style={{ ...S.btn(true), padding: "4px 12px", fontSize: 12 }}
                          >
                            この対応にする
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(course.key, null)}
                            style={{ ...S.btn(false), padding: "4px 12px", fontSize: 12 }}
                            disabled={!overrides?.[course.key]}
                          >
                            自動の推定に戻す
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(course.key, { skip: true })}
                            style={{ ...S.btn(false), padding: "4px 12px", fontSize: 12 }}
                          >
                            この講座は照合しない
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {suggestions.unmatched.length > 0 && (
        <p style={{ fontSize: 12, color: "#555", lineHeight: 1.7, margin: "8px 0 0" }}>
          予定表のどの講座にも当たらなかったシステムのコマ (予定表の学年・曜日の範囲内):{" "}
          {suggestions.unmatched.map((u) => `${subjectLabel(u.key)} (${sortDays(u.days).join("・")})`).join("、")}
        </p>
      )}
    </details>
  );
}
