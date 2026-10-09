// 予定表の講座 ↔ システムのコマ (学年|科目名) の対応。自動で当てはめた対応を
// 見せ、違っていれば選び直せる (選び直した結果はこの端末に保存)。
// 開閉は最初だけ決める (コマが見つからない講座があれば開く)。その後は人に任せ、
// 対応を直して件数が 0 になっても勝手に閉じない。ファイルを読み直すと親が
// key で作り直す。

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { courseWeekdays } from "../../../utils/yoteihyo/highSchoolSheet";
import {
  MAPPING_PROBLEMS,
  mappingStatus,
  subjectDays,
  systemGradesFor,
} from "../../../utils/yoteihyo/courseMapping";
import { courseLabel, subjectLabel } from "../../../utils/yoteihyo/labels";
import { WARN_TEXT } from "./styles";

const WD_ORDER = "月火水木金土日";
const sortDays = (days) => [...new Set(days)].sort((a, b) => WD_ORDER.indexOf(a) - WD_ORDER.indexOf(b));

export function MappingPanel({ courses, suggestions, mapping, overrides, onChangeOverrides, slots }) {
  const [editing, setEditing] = useState(null); // course key
  const [draft, setDraft] = useState([]);
  const [focusKey, setFocusKey] = useState(null); // 保存後に「変える」へフォーカスを戻す
  const buttonRefs = useRef(new Map());

  // 学年|科目名 → 曜日 (候補の表示用)
  const daysBySubject = useMemo(() => subjectDays(slots), [slots]);

  const rows = courses.map((c) => {
    const m = mapping.get(c.key);
    const wd = courseWeekdays(c).regular;
    return { course: c, m, wd, ...mappingStatus(c, m, daysBySubject) };
  });
  const problems = rows.filter((r) => MAPPING_PROBLEMS.has(r.status)).length;
  const [open, setOpen] = useState(() => problems > 0);

  useEffect(() => {
    if (!focusKey) return;
    buttonRefs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

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
    setFocusKey(key);
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
      className="no-print"
      style={{ ...S.panel, padding: 14, marginBottom: 16 }}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 800, color: problems ? WARN_TEXT : colors.ink }}>
        {problems > 0
          ? `⚠ 講座とシステムのコマの対応 (${courses.length} 講座、うち ${problems} 講座はコマが見つかりません)`
          : `講座とシステムのコマの対応 (${courses.length} 講座)`}
      </summary>
      <p style={{ fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: "8px 0" }}>
        {"予定表の各講座が、システムのどのコマ (学年・科目名) に当たるかを自動で当てはめています。" +
          "違っていれば「変える」で選び直してください (この端末に保存します)。" +
          "比べるのは、予定表でその講座の授業がいつもある曜日 (3 回以上ある曜日) のコマだけです。"}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["予定表の講座", "いつもの曜日", "システムのコマ"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  style={{ ...td, textAlign: "left", fontWeight: 700, color: colors.ink, background: "#f5f5f7" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ course, m, wd, status, valid, stale }) => {
              const isEditing = editing === course.key;
              const label = courseLabel(course);
              const grades = systemGradesFor(course);
              const candidates = [...daysBySubject.entries()]
                .filter(([k, days]) => grades.has(k.split("|")[0]) && days.some((d) => wd.includes(d)))
                .map(([k]) => k);
              for (const k of draft) if (isEditing && !candidates.includes(k)) candidates.push(k);
              candidates.sort();
              const ambiguous = !m?.manual ? suggestions.byCourse.get(course.key)?.ambiguous || [] : [];
              return (
                <Fragment key={course.key}>
                  <tr>
                    {/* 「変える」は講座名の下に置く (スマホ幅で右端の列が枠の外に切れないように) */}
                    <td style={{ ...td, minWidth: 120 }}>
                      <div>{label}</div>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) buttonRefs.current.set(course.key, el);
                          else buttonRefs.current.delete(course.key);
                        }}
                        onClick={() => (isEditing ? setEditing(null) : startEdit(course))}
                        style={{ ...S.btn(false), padding: "2px 10px", fontSize: 12, marginTop: 4 }}
                        aria-expanded={isEditing}
                        aria-label={isEditing ? `${label} の対応の編集を閉じる` : `${label} の対応を変える`}
                      >
                        {isEditing ? "閉じる" : "変える"}
                      </button>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{wd.join("・") || "-"}</td>
                    <td style={td}>
                      {status === "skip" && <span style={{ color: colors.inkMuted }}>比べない</span>}
                      {status === "noSessions" && (
                        <span style={{ color: colors.inkMuted }}>この予定表の期間には授業がありません (比べません)</span>
                      )}
                      {status === "noWeekday" && (
                        <span style={{ color: colors.inkMuted }}>
                          授業が少なく、いつもの曜日が決まらないため比べません
                        </span>
                      )}
                      {status === "unmapped" && (
                        <span style={{ color: colors.accentRed }}>コマが見つかりません (比べません)</span>
                      )}
                      {valid.map((k) => (
                        <span key={k} style={chip}>
                          {subjectLabel(k)}
                        </span>
                      ))}
                      {status === "offDay" && (
                        <span style={{ color: colors.accentRed, marginLeft: 2 }}>
                          {`このコマは予定表のいつもの曜日 (${wd.join("・")}) にありません (比べません)`}
                        </span>
                      )}
                      {stale.length > 0 && status !== "skip" && (
                        <span style={{ color: colors.accentRed, marginLeft: 2 }}>
                          {`「${stale.map(subjectLabel).join("」「")}」は今の時間割にありません`}
                          {status === "stale" ? " (比べません)" : ""}
                        </span>
                      )}
                      {m?.manual && status !== "skip" && (
                        <span style={{ color: colors.inkMuted, marginLeft: 4 }}>(手で選んだ)</span>
                      )}
                      {ambiguous.length > 0 && (
                        <div style={{ color: WARN_TEXT }}>
                          {`「${ambiguous.map(subjectLabel).join("」「")}」は他の講座にも同じくらい当てはまります。確かめてください。`}
                        </div>
                      )}
                    </td>
                  </tr>
                  {isEditing && (
                    <tr>
                      <td colSpan={3} style={{ ...td, background: "#fafbfc" }}>
                        {candidates.length === 0 ? (
                          <p style={{ fontSize: 12, color: colors.inkMuted, margin: 0 }}>
                            この講座の学年・曜日のコマがシステムにありません。
                          </p>
                        ) : (
                          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                            <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                              「{label}」に当たるコマ
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
                                  <span style={{ color: colors.inkMuted }}>
                                    {daysBySubject.has(k)
                                      ? `(${sortDays(daysBySubject.get(k)).join("・")})`
                                      : "(今の時間割にありません)"}
                                  </span>
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
                            disabled={draft.length === 0}
                          >
                            この対応にする
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(course.key, null)}
                            style={{ ...S.btn(false), padding: "4px 12px", fontSize: 12 }}
                            disabled={!overrides?.[course.key]}
                          >
                            自動の対応に戻す
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(course.key, { skip: true })}
                            style={{ ...S.btn(false), padding: "4px 12px", fontSize: 12 }}
                          >
                            この講座は比べない
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
        <p style={{ fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: "8px 0 0" }}>
          予定表のどの講座にも当たらなかったシステムのコマ (予定表の学年・曜日の範囲内):{" "}
          {suggestions.unmatched.map((u) => `${subjectLabel(u.key)} (${sortDays(u.days).join("・")})`).join("、")}
        </p>
      )}
    </details>
  );
}
