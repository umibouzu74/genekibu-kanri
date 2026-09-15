import { useCallback, useId, useMemo, useState } from "react";
import { splitTeacherField } from "../../utils/biweekly";
import { needsSubstitute, subStateMeta } from "../../utils/substituteState";
import { dateToDay, fmtDate, DEPT_COLOR, sortSlots } from "../../data";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
import { sortTeacherNames } from "../../utils/teacherKana";
import { getDashSections } from "../../constants/schedule";
import { getSlotTeachers } from "../../utils/biweekly";
import { filterSlotsForDate } from "../../utils/timetable";
import { makeEventHelpers } from "./dashboardHelpers";
import {
  computeAvailableTeachers,
  sortAvailableTeachers,
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
  teacherKana = {},
  saveSubs,
  isAdmin,
  // 欠勤組み換えから日付つきで開いたとき
  initDate = null,
}) {
  const today = fmtDate(new Date());
  const [date, setDate] = useState(initDate || today);
  const [generated, setGenerated] = useState(false);
  const [autoAvailable, setAutoAvailable] = useState([]);
  const [manualAvailable, setManualAvailable] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [manualTeacher, setManualTeacher] = useState("");
  const [manualTime, setManualTime] = useState("all");
  const [saved, setSaved] = useState(false);
  const manualListId = `${useId()}-manual-teachers`;

  const dayOfDate = dateToDay(date);
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // 全講師リスト（手動追加ドロップダウン用）
  const allTeachers = useMemo(() => {
    const set = new Set(partTimeStaff.map((s) => s.name));
    slots.forEach((s) => {
      splitTeacherField(s.teacher).forEach((n) => set.add(n));
    });
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);

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
    const { isOffForGrade } = makeEventHelpers(holidays, examPeriods);
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
        // 元講師ごとに 1 件 (多担任コマは複数件)。
        const slotSubs = subsForDate.filter((s) => s.slotId === slot.id);
        return { slot, off, slotSubs };
      });
      return { sec, color, rows };
    }).filter((s) => s.rows.length > 0);
  }, [dayOfDate, date, slots, timetables, subs, holidays, examPeriods]);

  // 代行が必要なコマ (代行者を探している欠勤)。
  // **「代行なしで確定」(残りの担当者で回す) は探していない**ので出さない。
  const uncoveredSubs = useMemo(
    () => subs.filter((s) => s.date === date && needsSubstitute(s)),
    [subs, date]
  );

  // 空き講師の合計（自動＋手動）。並びは関連度 (休講・隔週で空いた人 →
  // その日に担当の無い人 → 手動追加) が主で、同点はよみのあいうえお順
  const allAvailable = useMemo(
    () => sortAvailableTeachers([...autoAvailable, ...manualAvailable], teacherKana),
    [autoAvailable, manualAvailable, teacherKana]
  );

  const handleGenerate = useCallback(() => {
    // 候補は「その日のコマの講師」で閉じない — 常勤はその曜日にコマが無くても
    // 代行に入る (2026-09-10 の西岡)。その日に担当の無い講師も
    // 「この日は担当なし」として候補に出す (玉突き代行の画面だけオプトイン)
    const auto = computeAvailableTeachers(
      date, slots, holidays, examPeriods, subs,
      partTimeStaff, subjects, timetables, biweeklyAnchors, teacherSubjects,
      { includeIdleTeachers: true }
    );
    setAutoAvailable(auto);

    const combined = [...auto, ...manualAvailable];
    const sugg = suggestChainSubstitutions(
      uncoveredSubs.map((s) => ({
        slotId: s.slotId, originalTeacher: s.originalTeacher, date: s.date,
      })),
      combined, slots, subjects, subjectCategories, partTimeStaff, teacherKana
    );
    setSuggestions(sugg);
    setGenerated(true);
    setSaved(false);
  }, [
    date, slots, holidays, examPeriods, subs, partTimeStaff,
    subjects, subjectCategories, timetables, biweeklyAnchors, teacherSubjects,
    teacherKana, manualAvailable, uncoveredSubs,
  ]);

  // 手動追加。一覧に無い名前 (どのコマにも出てこない人) も直接入力できる
  const manualName = manualTeacher.trim();
  const manualDuplicate = allAvailable.some((a) => a.name === manualName);
  const handleAddManual = useCallback(() => {
    const name = manualTeacher.trim();
    if (!name) return;
    if (allAvailable.some((a) => a.name === name)) return;
    const isPartTime = staffNameSet.has(name);
    let subjectIds;
    if (isPartTime) {
      const staff = partTimeStaff.find((s) => s.name === name);
      subjectIds = staff ? staff.subjectIds : [];
    } else {
      subjectIds = [];
      slots.forEach((s) => {
        if (splitTeacherField(s.teacher).includes(name)) {
          const sid = pickSubjectId(s.subj, subjects);
          if (sid != null && !subjectIds.includes(sid)) subjectIds.push(sid);
        }
      });
    }
    const entry = {
      name,
      isFreeAllDay: manualTime === "all",
      freeTimeSlots: manualTime === "all" ? dayTimeSlots : [manualTime],
      cancelledSlots: [],
      reason: "手動追加",
      subjectIds,
      isPartTime,
      noSlotsToday: false,
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
                {rows.map(({ slot, off, slotSubs }) => {
                  const teachers = getSlotTeachers(slot);
                  const hasSub = slotSubs.length > 0;
                  // 1 人でも代行を探している人が居れば「代行必要」。
                  const needsSub = slotSubs.some((x) => needsSubstitute(x));
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
                      {slotSubs.map((x) => {
                        const meta = subStateMeta(x);
                        return (
                          <span
                            key={x.id}
                            style={{ fontSize: 9, color: meta.color, fontWeight: 700 }}
                          >
                            {teachers.length > 1 ? `${x.originalTeacher}: ` : ""}
                            {x.substitute ? `← ${x.substitute}` : meta.label}
                          </span>
                        );
                      })}
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
                <span style={reasonBadgeStyle(t)}>
                  {t.reason}
                </span>
                {t.reason === "手動追加" && (
                  <button
                    type="button"
                    onClick={() => handleRemoveManual(t.name)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: colors.danger, fontSize: 14, padding: 0, lineHeight: 1,
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
                <input
                  list={manualListId}
                  value={manualTeacher}
                  onChange={(e) => setManualTeacher(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddManual();
                    }
                  }}
                  placeholder="講師名 (一覧に無い名前も可)"
                  aria-label="手動追加する講師"
                  style={{ ...S.input, width: "auto", flex: "0 1 160px" }}
                />
                <datalist id={manualListId}>
                  {allTeachers
                    .filter((t) => !allAvailable.some((a) => a.name === t))
                    .map((t) => (
                      <option key={t} value={t} />
                    ))}
                </datalist>
                <select
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  aria-label="手動追加する時間帯"
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
                  disabled={!manualName || manualDuplicate}
                  style={{
                    ...S.btn(false), fontSize: 11,
                    opacity: manualName && !manualDuplicate ? 1 : 0.5,
                  }}
                >
                  追加
                </button>
                {manualDuplicate && (
                  <span style={{ fontSize: 10, color: "#888" }}>
                    {manualName} は既に空き講師に入っています
                  </span>
                )}
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
                    <span style={{ color: colors.danger, marginLeft: 8 }}>
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

// 空き講師の理由バッジ。休講・隔週で空いた人 (緑) / その日に担当の無い人
// (灰) / 手動追加 (青) を色で見分ける
function reasonBadgeStyle(t) {
  const tone =
    t.reason === "手動追加"
      ? { bg: "#eef2ff", fg: "#1a1a6e", bd: "#c0c8e8" }
      : t.noSlotsToday
        ? { bg: "#f3f3f3", fg: "#555", bd: "#d0d0d0" }
        : { bg: "#e8f5e8", fg: "#2a7a2a", bd: "#a8d8b0" };
  return {
    fontSize: 10, padding: "1px 6px", borderRadius: 4,
    background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
  };
}

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
          aria-label={`${sugg.originalTeacher}の${slot.subj}(${slot.time}) の代行者`}
          style={{
            ...S.input, width: "auto", flex: "0 1 100px",
            borderColor: validation.timeConflict ? colors.danger
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
        <span style={{ fontSize: 10, color: colors.danger }}>時間重複</span>
      )}
      {validation.subjectMismatch && (
        <span style={{ fontSize: 10, color: "#e6a800" }}>教科注意</span>
      )}
    </div>
  );
}
