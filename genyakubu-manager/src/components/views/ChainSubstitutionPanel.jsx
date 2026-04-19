import { useCallback, useMemo, useState } from "react";
import { dateToDay, fmtDate, DEPT_COLOR, sortSlots } from "../../data";
import { S } from "../../styles/common";
import { sortJa } from "../../utils/sortJa";
import { getDashSections } from "../../constants/schedule";
import { getSlotTeachers } from "../../utils/biweekly";
import { filterSlotsForDate } from "../../utils/timetable";
import { makeHolidayHelpers } from "./dashboardHelpers";
import {
  computeAvailableTeachers,
  suggestChainSubstitutions,
  validateSubstituteChange,
} from "../../utils/chainSubstitution";
import { pickSubjectId } from "../../utils/subjectMatch";

export function ChainSubstitutionPanel({
  slots,
  subs,
  holidays,
  examPeriods,
  partTimeStaff,
  subjects,
  subjectCategories,
  timetables,
  biweeklyAnchors,
  teacherSubjects = {},
  saveSubs,
  isAdmin,
}) {
  const today = fmtDate(new Date());
  const [date, setDate] = useState(today);
  const [generated, setGenerated] = useState(false);
  const [autoAvailable, setAutoAvailable] = useState([]);
  const [manualAvailable, setManualAvailable] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [manualTeacher, setManualTeacher] = useState("");
  const [manualTime, setManualTime] = useState("all");
  const [saved, setSaved] = useState(false);

  const dayOfDate = dateToDay(date);
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // 全講師リスト（手動追加ドロップダウン用）
  const allTeachers = useMemo(() => {
    const set = new Set(partTimeStaff.map((s) => s.name));
    slots.forEach((s) => {
      if (!s.teacher) return;
      const names = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
      names.forEach((n) => set.add(n));
    });
    return sortJa([...set]);
  }, [slots, partTimeStaff]);

  // その日の時間帯リスト（手動追加で選ぶ用）
  const dayTimeSlots = useMemo(() => {
    if (!dayOfDate) return [];
    const times = new Set();
    slots.filter((s) => s.day === dayOfDate).forEach((s) => times.add(s.time));
    return [...times].sort();
  }, [slots, dayOfDate]);

  // その日の時間割（3列表示用）
  const daySchedule = useMemo(() => {
    if (!dayOfDate || !date) return [];
    const { isOffForGrade } = makeHolidayHelpers(holidays, examPeriods);
    const daySlots = filterSlotsForDate(slots, date, timetables).filter(
      (s) => s.day === dayOfDate
    );
    const sections = getDashSections(dayOfDate);
    const subsForDate = subs.filter((s) => s.date === date);
    return sections.map((sec) => {
      const color = sec.color || DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
      const secSlots = sortSlots(daySlots.filter(sec.filterFn));
      const rows = secSlots.map((slot) => {
        const off = isOffForGrade(date, slot.grade, slot.subj);
        const sub = subsForDate.find((s) => s.slotId === slot.id);
        return { slot, off, sub };
      });
      return { sec, color, rows };
    }).filter((s) => s.rows.length > 0);
  }, [dayOfDate, date, slots, timetables, subs, holidays, examPeriods]);

  // 代行が必要なコマ（依頼中で代行者未定）
  const uncoveredSubs = useMemo(() => {
    return subs.filter(
      (s) => s.date === date && s.status === "requested" && !s.substitute
    );
  }, [subs, date]);

  // 空き講師の合計（自動＋手動）
  const allAvailable = useMemo(
    () => [...autoAvailable, ...manualAvailable],
    [autoAvailable, manualAvailable]
  );

  const handleGenerate = useCallback(() => {
    const auto = computeAvailableTeachers(
      date, slots, holidays, examPeriods, subs,
      partTimeStaff, subjects, timetables, biweeklyAnchors, teacherSubjects
    );
    setAutoAvailable(auto);

    const combined = [...auto, ...manualAvailable];
    const sugg = suggestChainSubstitutions(
      uncoveredSubs.map((s) => ({
        slotId: s.slotId, originalTeacher: s.originalTeacher, date: s.date,
      })),
      combined, slots, subjects, subjectCategories, partTimeStaff
    );
    setSuggestions(sugg);
    setGenerated(true);
    setSaved(false);
  }, [
    date, slots, holidays, examPeriods, subs, partTimeStaff,
    subjects, subjectCategories, timetables, biweeklyAnchors, teacherSubjects,
    manualAvailable, uncoveredSubs,
  ]);

  const handleAddManual = useCallback(() => {
    if (!manualTeacher) return;
    if (allAvailable.some((a) => a.name === manualTeacher)) return;
    const isPartTime = staffNameSet.has(manualTeacher);
    let subjectIds;
    if (isPartTime) {
      const staff = partTimeStaff.find((s) => s.name === manualTeacher);
      subjectIds = staff ? staff.subjectIds : [];
    } else {
      subjectIds = [];
      slots.forEach((s) => {
        if (!s.teacher) return;
        const ts = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
        if (ts.includes(manualTeacher)) {
          const sid = pickSubjectId(s.subj, subjects);
          if (sid != null && !subjectIds.includes(sid)) subjectIds.push(sid);
        }
      });
    }
    const entry = {
      name: manualTeacher,
      isFreeAllDay: manualTime === "all",
      freeTimeSlots: manualTime === "all" ? dayTimeSlots : [manualTime],
      cancelledSlots: [],
      reason: "手動追加",
      subjectIds,
      isPartTime,
    };
    setManualAvailable((p) => [...p, entry]);
    setManualTeacher("");
    setManualTime("all");
  }, [
    manualTeacher, manualTime, allAvailable, staffNameSet,
    partTimeStaff, slots, subjects, dayTimeSlots,
  ]);

  const handleRemoveManual = useCallback((name) => {
    setManualAvailable((p) => p.filter((a) => a.name !== name));
  }, []);

  const handleChangeSub = useCallback((idx, newTeacher) => {
    setSuggestions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], suggestedSubstitute: newTeacher };
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (suggestions.length === 0) return;
    const ts = new Date().toISOString();
    let nextId = subs.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

    // 既存の requested レコードを更新 + 新規を追加
    const updatedIds = new Set();
    const newRecords = [];
    for (const sugg of suggestions) {
      const existing = subs.find(
        (s) =>
          s.date === date &&
          s.slotId === sugg.slotId &&
          s.originalTeacher === sugg.originalTeacher &&
          !s.substitute
      );
      if (existing) {
        updatedIds.add(existing.id);
      }
      newRecords.push({
        id: existing ? existing.id : nextId++,
        date,
        slotId: sugg.slotId,
        originalTeacher: sugg.originalTeacher,
        substitute: sugg.suggestedSubstitute,
        status: "confirmed",
        memo: "玉突き代行",
        createdAt: existing?.createdAt || ts,
        updatedAt: ts,
      });
    }
    const kept = subs.filter((s) => !updatedIds.has(s.id));
    saveSubs([...kept, ...newRecords]);
    setSaved(true);
  }, [suggestions, subs, date, saveSubs]);

  const handleReset = useCallback(() => {
    setGenerated(false);
    setAutoAvailable([]);
    setSuggestions([]);
    setSaved(false);
  }, []);

  // 教科名を取得するヘルパー
  const subjName = (ids) => {
    if (!ids || ids.length === 0) return "";
    return ids
      .map((id) => subjects.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join("・");
  };

  const slotMap = useMemo(() => {
    const m = {};
    slots.forEach((s) => { m[s.id] = s; });
    return m;
  }, [slots]);

  // --- レンダリング ---
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 日付選択 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>日付</label>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); handleReset(); }}
          style={{ ...S.input, width: "auto" }}
        />
        {dayOfDate && (
          <span style={{ fontSize: 11, color: "#888" }}>({dayOfDate}曜日)</span>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!dayOfDate}
            style={{
              ...S.btn(true),
              background: "#2a7a2a",
              opacity: dayOfDate ? 1 : 0.5,
            }}
          >
            提案を作成
          </button>
        )}
      </div>

      {/* その日の時間割（3列表示） */}
      {dayOfDate && daySchedule.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 8,
          }}
        >
          {daySchedule.map(({ sec, color, rows }) => (
            <div key={sec.key} style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
              <div style={{
                background: color.accent, color: "#fff",
                padding: "4px 10px", fontSize: 11, fontWeight: 800,
              }}>
                {sec.label}
              </div>
              <div style={{ fontSize: 11 }}>
                {rows.map(({ slot, off, sub }) => {
                  const teachers = getSlotTeachers(slot);
                  const hasSub = Boolean(sub);
                  const needsSub = hasSub && !sub.substitute;
                  const bg = off ? "#f5f0e0" : needsSub ? "#fde4e4" : hasSub ? "#e0f2e4" : "#fff";
                  return (
                    <div
                      key={slot.id}
                      style={{
                        padding: "3px 8px", borderBottom: "1px solid #f0f0f0",
                        background: bg, display: "flex", gap: 6,
                        alignItems: "center", flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 700, minWidth: 80, fontSize: 10 }}>{slot.time}</span>
                      <span style={{ fontSize: 10 }}>
                        {slot.grade}{slot.cls && slot.cls !== "-" ? slot.cls : ""}
                      </span>
                      <span style={{ color: "#555", fontSize: 10 }}>{slot.subj}</span>
                      <span style={{ fontWeight: 700, fontSize: 10 }}>{teachers.join("・")}</span>
                      {off && <span style={{ fontSize: 9, color: "#b8860b" }}>休講</span>}
                      {needsSub && <span style={{ fontSize: 9, color: "#c03030", fontWeight: 700 }}>代行必要</span>}
                      {hasSub && sub.substitute && (
                        <span style={{ fontSize: 9, color: "#2a7a4a" }}>← {sub.substitute}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 代行が必要なコマ (常に表示) */}
      <Section title={`代行が必要なコマ (${uncoveredSubs.length}件)`}>
        {uncoveredSubs.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888", padding: 8 }}>
            {date} に代行者未定のコマはありません
          </div>
        ) : (
          uncoveredSubs.map((sub) => {
            const slot = slotMap[sub.slotId];
            if (!slot) return null;
            return (
              <SlotRow key={sub.id} slot={slot} teacher={sub.originalTeacher}
                staffNameSet={staffNameSet} />
            );
          })
        )}
      </Section>

      {generated && (
        <>
          {/* 空き講師 */}
          <Section title={`空き講師 (${allAvailable.length}名)`}>
            {allAvailable.map((t) => (
              <div
                key={t.name}
                style={{
                  display: "flex", gap: 8, alignItems: "center",
                  padding: "6px 10px", borderBottom: "1px solid #f0f0f0",
                  fontSize: 12, flexWrap: "wrap",
                }}
              >
                <b style={{ color: "#1a1a2e", minWidth: 50 }}>{t.name}</b>
                {subjName(t.subjectIds) && (
                  <span style={{
                    fontSize: 10, background: "#f0f8ea",
                    border: "1px solid #cde5b8", borderRadius: 4,
                    padding: "1px 6px",
                  }}>
                    {subjName(t.subjectIds)}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "#888" }}>
                  {t.isFreeAllDay ? "全日空き" : t.freeTimeSlots.join(", ")}
                </span>
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 4,
                  background: t.reason === "手動追加" ? "#eef2ff" : "#e8f5e8",
                  color: t.reason === "手動追加" ? "#1a1a6e" : "#2a7a2a",
                  border: `1px solid ${t.reason === "手動追加" ? "#c0c8e8" : "#a8d8b0"}`,
                }}>
                  {t.reason}
                </span>
                {t.reason === "手動追加" && (
                  <button
                    type="button"
                    onClick={() => handleRemoveManual(t.name)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#c44", fontSize: 14, padding: 0, lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            {/* 手動追加フォーム */}
            {isAdmin && (
              <div style={{
                display: "flex", gap: 6, alignItems: "center",
                padding: "8px 10px", flexWrap: "wrap",
                borderTop: "1px solid #e0e0e0",
              }}>
                <select
                  value={manualTeacher}
                  onChange={(e) => setManualTeacher(e.target.value)}
                  style={{ ...S.input, width: "auto", flex: "0 1 120px" }}
                >
                  <option value="">-- 講師 --</option>
                  {allTeachers
                    .filter((t) => !allAvailable.some((a) => a.name === t))
                    .map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <select
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  style={{ ...S.input, width: "auto", flex: "0 1 140px" }}
                >
                  <option value="all">全日</option>
                  {dayTimeSlots.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddManual}
                  disabled={!manualTeacher}
                  style={{
                    ...S.btn(false), fontSize: 11,
                    opacity: manualTeacher ? 1 : 0.5,
                  }}
                >
                  追加
                </button>
              </div>
            )}
          </Section>

          {/* 提案結果 */}
          <Section title="提案結果">
            {suggestions.length === 0 && uncoveredSubs.length > 0 && (
              <div style={{ fontSize: 11, color: "#c77", padding: 8 }}>
                現在の空き講師では代行を割り当てられるコマがありません。
                手動で空き講師を追加してから再度「提案を作成」を押してください。
              </div>
            )}
            {suggestions.length === 0 && uncoveredSubs.length === 0 && (
              <div style={{ fontSize: 11, color: "#888", padding: 8 }}>
                代行が必要なコマがないため、提案はありません。
              </div>
            )}
            {suggestions.map((sugg, idx) => {
              const slot = slotMap[sugg.slotId];
              if (!slot) return null;
              const validation = validateSubstituteChange(
                sugg.suggestedSubstitute, sugg.slotId,
                slots, suggestions, subjects, partTimeStaff
              );
              return (
                <SuggestionRow
                  key={`${sugg.slotId}-${sugg.originalTeacher}`}
                  sugg={sugg}
                  slot={slot}
                  idx={idx}
                  allTeachers={allTeachers}
                  validation={validation}
                  onChange={handleChangeSub}
                  isAdmin={isAdmin}
                />
              );
            })}
            {suggestions.length > 0 && (
              <div style={{
                padding: "10px", borderTop: "1px solid #e0e0e0",
                display: "flex", gap: 8, alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 11, color: "#555" }}>
                  カバー: {suggestions.length}件
                  {uncoveredSubs.length - suggestions.length > 0 && (
                    <span style={{ color: "#c44", marginLeft: 8 }}>
                      未カバー: {uncoveredSubs.length - suggestions.length}件
                    </span>
                  )}
                </div>
                {isAdmin && !saved && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={handleReset}
                      style={S.btn(false)}>
                      リセット
                    </button>
                    <button type="button" onClick={handleSave}
                      style={{ ...S.btn(true), background: "#2a7a2a" }}>
                      一括保存
                    </button>
                  </div>
                )}
                {saved && (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: "#2a7a4a", background: "#e0f2e4",
                    padding: "4px 12px", borderRadius: 6,
                  }}>
                    保存しました
                  </span>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ─── サブコンポーネント ───────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{
      border: "1px solid #e0e0e0", borderRadius: 8,
      overflow: "hidden",
    }}>
      <div style={{
        background: "#f5f7fa", padding: "8px 12px",
        fontSize: 12, fontWeight: 700, color: "#1a1a2e",
        borderBottom: "1px solid #e0e0e0",
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SlotRow({ slot, teacher, staffNameSet }) {
  const isPT = staffNameSet.has(teacher);
  return (
    <div style={{
      padding: "6px 10px", borderBottom: "1px solid #f0f0f0",
      fontSize: 12, display: "flex", gap: 8, alignItems: "center",
      flexWrap: "wrap",
    }}>
      {isPT && <span style={{ color: "#e67a00", fontSize: 10 }}>★</span>}
      <b>{slot.time}</b>
      <span>{slot.grade}{slot.cls && slot.cls !== "-" ? slot.cls : ""}</span>
      <span style={{ color: "#555" }}>{slot.subj}</span>
      <span style={{ color: "#1a1a2e", fontWeight: 700 }}>{teacher}</span>
      {slot.room && (
        <span style={{ fontSize: 10, color: "#888" }}>({slot.room})</span>
      )}
    </div>
  );
}

function SuggestionRow({ sugg, slot, idx, allTeachers, validation, onChange, isAdmin }) {
  return (
    <div style={{
      padding: "8px 10px", borderBottom: "1px solid #f0f0f0",
      display: "flex", gap: 8, alignItems: "center",
      flexWrap: "wrap", fontSize: 12,
      background: sugg.isChain ? "#fffbe6" : "transparent",
    }}>
      <span style={{
        fontWeight: 800, color: "#888", fontSize: 10, minWidth: 48,
      }}>
        Step {sugg.chainStep}
      </span>
      <span>
        {sugg.originalTeacher}の{slot.subj}({slot.time})
      </span>
      <span style={{ color: "#888" }}>←</span>
      {isAdmin ? (
        <select
          value={sugg.suggestedSubstitute}
          onChange={(e) => onChange(idx, e.target.value)}
          style={{
            ...S.input, width: "auto", flex: "0 1 100px",
            borderColor: validation.timeConflict ? "#c44"
              : validation.subjectMismatch ? "#e6a800" : "#ccc",
          }}
        >
          <option value="">-- 選択 --</option>
          {allTeachers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : (
        <b>{sugg.suggestedSubstitute}</b>
      )}
      {sugg.isChain && (
        <span style={{
          fontSize: 9, background: "#fff3cd", color: "#856404",
          padding: "1px 6px", borderRadius: 4, border: "1px solid #ffc107",
        }}>
          玉突き
        </span>
      )}
      {validation.timeConflict && (
        <span style={{ fontSize: 10, color: "#c44" }}>時間重複</span>
      )}
      {validation.subjectMismatch && (
        <span style={{ fontSize: 10, color: "#e6a800" }}>教科注意</span>
      )}
    </div>
  );
}
