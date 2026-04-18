import { useCallback, useMemo, useState } from "react";
import { fmtDate, dateToDay, sortSlots as sortS, DAY_COLOR as DC } from "../../data";
import { S } from "../../styles/common";
import { getSlotTeachers } from "../../utils/biweekly";
import { sortJa } from "../../utils/sortJa";
import { saveAbsenceBatch } from "../../utils/absenceBatch";
import { useToasts } from "../../hooks/useToasts";
import { buildSessionCountMap } from "../../utils/sessionCount";
import { makeHolidayHelpers } from "./dashboardHelpers";
import { AbsenceSlotRow } from "./absence/AbsenceSlotRow";
import { AbsenceDayPreview } from "./absence/AbsenceDayPreview";
import { useAbsenceDraft } from "./absence/useAbsenceDraft";

// ─── 先生欠勤 統合ワークフロー ──────────────────────────────────
// 先生の欠勤日を指定 → その先生が担当する当該日のコマを一覧化 →
// 各コマに対して 代行 / 合同 / 移動 / 回数補正 をその場で設定し、
// 一括保存する。

export function AbsenceWorkflowView({
  slots,
  subs,
  adjustments,
  sessionOverrides,
  holidays,
  examPeriods,
  biweeklyAnchors,
  classSets,
  displayCutoff,
  partTimeStaff,
  subjects,
  saveSubs,
  saveAdjustments,
  saveSessionOverrides,
  isAdmin,
}) {
  const toasts = useToasts();
  const [date, setDate] = useState(fmtDate(new Date()));
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const draft = useAbsenceDraft();

  const dayName = useMemo(() => dateToDay(date), [date]);

  // 全先生リスト (slot.teacher + 隔週パートナー + partTimeStaff)
  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) {
      for (const t of getSlotTeachers(s)) set.add(t);
    }
    for (const p of partTimeStaff || []) set.add(p.name);
    return sortJa([...set]);
  }, [slots, partTimeStaff]);

  // 対象日にこれらの先生が担当するコマ群
  const affectedSlots = useMemo(() => {
    if (!dayName || selectedTeachers.length === 0) return [];
    const teacherSet = new Set(selectedTeachers);
    return sortS(
      slots.filter(
        (s) =>
          s.day === dayName &&
          getSlotTeachers(s).some((t) => teacherSet.has(t))
      )
    );
  }, [slots, dayName, selectedTeachers]);

  // その日の全コマ (合同ホスト候補 / 移動先の時間帯候補)
  const allDaySlots = useMemo(() => {
    if (!dayName) return [];
    return sortS(slots.filter((s) => s.day === dayName));
  }, [slots, dayName]);

  const timeOptions = useMemo(() => {
    const set = new Set();
    for (const s of allDaySlots) set.add(s.time);
    return [...set].sort();
  }, [allDaySlots]);

  // 対象日の回数 (現在の確定データに対する値 — draft 反映前)
  const sessionCountsBase = useMemo(() => {
    if (!date || !displayCutoff) return new Map();
    const { isOffForGrade } = makeHolidayHelpers(holidays || [], examPeriods || []);
    return buildSessionCountMap(affectedSlots, date, {
      classSets: classSets || [],
      allSlots: slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: adjustments || [],
      sessionOverrides: sessionOverrides || [],
      orientationOnFirstDay: true,
    });
  }, [affectedSlots, slots, date, classSets, displayCutoff, holidays, examPeriods, biweeklyAnchors, adjustments, sessionOverrides]);

  const toggleTeacher = useCallback((name) => {
    setSelectedTeachers((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
    draft.reset();
  }, [draft]);

  const handleSave = useCallback(() => {
    const { draftSubs, draftAdjustments, draftOverrides } =
      draft.toBatchPayload(date, slots);
    if (
      draftSubs.length === 0 &&
      draftAdjustments.length === 0 &&
      draftOverrides.length === 0
    ) {
      toasts.error("変更がありません");
      return;
    }
    try {
      const res = saveAbsenceBatch({
        subsList: subs,
        adjustmentsList: adjustments,
        sessionOverridesList: sessionOverrides,
        draftSubs,
        draftAdjustments,
        draftOverrides,
        saveSubs,
        saveAdjustments,
        saveSessionOverrides,
      });
      const parts = [];
      if (res.added.subs) parts.push(`代行 ${res.added.subs} 件`);
      if (res.added.adjustments) parts.push(`調整 ${res.added.adjustments} 件`);
      if (res.added.overrides) parts.push(`回数補正 ${res.added.overrides} 件`);
      toasts.success(`保存しました (${parts.join(" / ")})`);
      draft.reset();
    } catch (err) {
      console.error(err);
      toasts.error("保存に失敗しました");
    }
  }, [draft, date, slots, subs, adjustments, sessionOverrides, saveSubs, saveAdjustments, saveSessionOverrides, toasts]);

  const candidateHostSlotsFor = useCallback(
    (slot) => {
      // 合同候補: 同じ day の他のコマ。同時刻や同学年を優先するために
      // ソートはせず、UI 側で並べる。
      return allDaySlots.filter(
        (other) => other.id !== slot.id && other.day === slot.day
      );
    },
    [allDaySlots]
  );

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, color: "#888", fontSize: 13 }}>
        このビューは管理者のみ利用できます。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header: date + teacher selection */}
      <div
        style={{
          background: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 700 }}>対象日:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            draft.reset();
          }}
          style={{ ...S.input, width: "auto" }}
        />
        {dayName && (
          <span
            style={{
              background: DC[dayName] || "#666",
              color: "#fff",
              padding: "3px 10px",
              borderRadius: 6,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {dayName}
          </span>
        )}
        <div style={{ fontSize: 12, color: "#666" }}>
          欠勤する先生 ({selectedTeachers.length} 名選択):
        </div>
        <details style={{ position: "relative" }}>
          <summary
            style={{
              ...S.btn(false),
              cursor: "pointer",
              listStyle: "none",
            }}
          >
            {selectedTeachers.length > 0
              ? selectedTeachers.join(", ")
              : "(クリックして選択)"}
          </summary>
          <div
            style={{
              position: "absolute",
              zIndex: 10,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 6,
              padding: "6px 8px",
              maxHeight: 280,
              overflowY: "auto",
              minWidth: 180,
              boxShadow: "0 2px 6px rgba(0,0,0,.1)",
            }}
          >
            {allTeachers.map((t) => (
              <label
                key={t}
                style={{ display: "flex", gap: 6, padding: "2px 4px", cursor: "pointer", fontSize: 12 }}
              >
                <input
                  type="checkbox"
                  checked={selectedTeachers.includes(t)}
                  onChange={() => toggleTeacher(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </details>
      </div>

      {affectedSlots.length === 0 && selectedTeachers.length > 0 && (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            color: "#888",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          対象日にこれらの先生のコマはありません
        </div>
      )}

      {affectedSlots.length > 0 && (
        <div
          className="absence-workflow-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
          }}
        >
          {/* 左: 編集行 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              影響コマ ({affectedSlots.length} 件)
            </div>
            {affectedSlots.map((s) => (
              <AbsenceSlotRow
                key={s.id}
                slot={s}
                row={draft.getRow(s.id)}
                timeOptions={timeOptions}
                candidateHostSlots={candidateHostSlotsFor(s)}
                partTimeStaff={partTimeStaff}
                subjects={subjects}
                setAction={draft.setAction}
                updateSub={draft.updateSub}
                updateMove={draft.updateMove}
                setCombine={draft.setCombine}
                clearCombine={draft.clearCombine}
                updateOverride={draft.updateOverride}
                sessionCountBefore={sessionCountsBase.get(s.id) || 0}
              />
            ))}
          </div>

          {/* 右: プレビュー */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              padding: "10px 14px",
              position: "sticky",
              top: 16,
              maxHeight: "calc(100vh - 140px)",
              overflowY: "auto",
            }}
          >
            <AbsenceDayPreview
              date={date}
              dayOfDate={dayName}
              slots={slots}
              draft={draft.draft}
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
              classSets={classSets}
              displayCutoff={displayCutoff}
              holidays={holidays}
              examPeriods={examPeriods}
              biweeklyAnchors={biweeklyAnchors}
              subs={subs}
            />
          </div>
        </div>
      )}

      {affectedSlots.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "10px 14px",
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
          }}
        >
          <button
            type="button"
            onClick={() => draft.reset()}
            style={{ ...S.btn(false) }}
          >
            下書きをクリア
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{ ...S.btn(true), background: "#2a6a9e", color: "#fff" }}
          >
            一括保存
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .absence-workflow-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
