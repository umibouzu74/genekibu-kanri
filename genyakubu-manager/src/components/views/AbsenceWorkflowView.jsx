import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, dateToDay, sortSlots as sortS, DAY_COLOR as DC } from "../../data";
import { S } from "../../styles/common";
import { getSlotTeachers } from "../../utils/biweekly";
import { sortJa } from "../../utils/sortJa";
import { saveAbsenceBatch } from "../../utils/absenceBatch";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { buildSessionCountMap } from "../../utils/sessionCount";
import { makeHolidayHelpers } from "./dashboardHelpers";
import { useAbsenceDraft } from "./absence/useAbsenceDraft";
import { AbsenceTimetable } from "./absence/AbsenceTimetable";
import { getAbsentSlotIds } from "../../utils/absenceHelpers";

// ─── 先生欠勤 統合ワークフロー (直接操作 UI 版) ─────────────────
// 上部: 対象日 + 欠勤先生選択 / 下部: 時間割グリッド
// 全ての操作 (代行・合同・移動・回数補正) はグリッド上で DnD や右クリック
// から行い、下書きは useAbsenceDraft が保持する。画面右下のフローティング
// ボタンで一括保存。

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
  timetables,
  saveSubs,
  saveAdjustments,
  saveSessionOverrides,
  isAdmin,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [date, setDate] = useState(fmtDate(new Date()));
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState(false);
  const teacherDropdownRef = useRef(null);
  const draft = useAbsenceDraft();

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!teacherDropdownOpen) return undefined;
    const handler = (e) => {
      if (
        teacherDropdownRef.current &&
        !teacherDropdownRef.current.contains(e.target)
      ) {
        setTeacherDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [teacherDropdownOpen]);

  const dayName = useMemo(() => dateToDay(date), [date]);

  // 休講/テスト期間判定 (sessionCount 計算 + 振替先警告で共有)
  const isOffForGrade = useMemo(
    () => makeHolidayHelpers(holidays || [], examPeriods || []).isOffForGrade,
    [holidays, examPeriods]
  );

  // 全先生リスト
  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) {
      for (const t of getSlotTeachers(s)) set.add(t);
    }
    for (const p of partTimeStaff || []) set.add(p.name);
    return sortJa([...set]);
  }, [slots, partTimeStaff]);

  // 対象日のコマ群
  const daySlots = useMemo(() => {
    if (!dayName) return [];
    return sortS(slots.filter((s) => s.day === dayName));
  }, [slots, dayName]);

  // 欠勤先生が担当するコマ集合 (赤枠表示用)
  const absentSlotIds = useMemo(
    () => getAbsentSlotIds(slots, dayName, selectedTeachers),
    [slots, dayName, selectedTeachers]
  );

  // ドラフト反映済みの回数 map
  const sessionCountMap = useMemo(() => {
    if (!date || !displayCutoff) return new Map();

    // ドラフトを effective な adjustments / overrides に連結
    const draftAdjustments = [];
    const draftOverridesLocal = [];
    const draftOverridingSlots = {
      combine: new Set(),
      move: new Set(),
      reschedule: new Set(),
    };
    let idBase = -1000;
    for (const [sidStr, row] of Object.entries(draft.draft)) {
      const slotId = Number(sidStr);
      if (row.combine?.absorbedSlotIds?.length) {
        draftAdjustments.push({
          id: idBase--,
          date,
          type: "combine",
          slotId,
          combineSlotIds: [...row.combine.absorbedSlotIds],
          memo: "(draft)",
        });
        draftOverridingSlots.combine.add(slotId);
      }
      if (row.move?.targetTime) {
        draftAdjustments.push({
          id: idBase--,
          date,
          type: "move",
          slotId,
          targetTime: row.move.targetTime,
          memo: "(draft)",
        });
        draftOverridingSlots.move.add(slotId);
      }
      if (row.reschedule?.targetDate) {
        const entry = {
          id: idBase--,
          date,
          type: "reschedule",
          slotId,
          targetDate: row.reschedule.targetDate,
          memo: "(draft)",
        };
        if (row.reschedule.targetTime) entry.targetTime = row.reschedule.targetTime;
        if (row.reschedule.targetTeacher) {
          entry.targetTeacher = row.reschedule.targetTeacher;
        }
        draftAdjustments.push(entry);
        draftOverridingSlots.reschedule.add(slotId);
      }
      if (row.override) {
        if (row.override.mode === "set" && Number.isFinite(Number(row.override.value))) {
          draftOverridesLocal.push({
            id: idBase--,
            date,
            slotId,
            mode: "set",
            value: Number(row.override.value),
            memo: "(draft)",
          });
        } else if (row.override.mode === "skip") {
          const entry = { id: idBase--, date, slotId, mode: "skip", memo: "(draft)" };
          const d = Number(row.override.displayAs);
          if (Number.isFinite(d) && d > 0) entry.displayAs = d;
          draftOverridesLocal.push(entry);
        }
      }
    }

    // 既存 adjustments から、draft で上書きされるものと解除マークされたものを除外
    const removedIds = draft.removedAdjustmentIds || new Set();
    const filteredAdjustments = (adjustments || []).filter((a) => {
      if (removedIds.has(a.id)) return false;
      if (a.date === date) {
        if (a.type === "combine" && draftOverridingSlots.combine.has(a.slotId)) return false;
        if (a.type === "move" && draftOverridingSlots.move.has(a.slotId)) return false;
        if (a.type === "reschedule" && draftOverridingSlots.reschedule.has(a.slotId)) {
          return false;
        }
      }
      return true;
    });

    return buildSessionCountMap(daySlots, date, {
      classSets: classSets || [],
      allSlots: slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: [...filteredAdjustments, ...draftAdjustments],
      sessionOverrides: [...(sessionOverrides || []), ...draftOverridesLocal],
      orientationOnFirstDay: true,
    });
  }, [daySlots, slots, date, classSets, displayCutoff, isOffForGrade, biweeklyAnchors, adjustments, sessionOverrides, draft.draft, draft.removedAdjustmentIds]);

  const toggleTeacher = useCallback(
    (name) => {
      // 欠勤先生の追加 / 削除は「どのコマを赤枠強調するか」だけを変える
      // ため、既存の下書きはそのまま維持する (過去に "リセット" していたが、
      // 別先生を追加しようとして下書きが全消去される事故が起きるため廃止)。
      setSelectedTeachers((prev) =>
        prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
      );
    },
    []
  );

  // 下書きの件数カウント (保存ボタン表示用)
  const draftCount = useMemo(() => {
    let c = 0;
    for (const row of Object.values(draft.draft)) {
      if (row.sub?.substitute) c++;
      if (row.combine?.absorbedSlotIds?.length) c++;
      if (row.move?.targetTime) c++;
      if (row.reschedule?.targetDate) c++;
      if (row.override) c++;
    }
    c += (draft.removedAdjustmentIds?.size || 0);
    c += (draft.removedSubIds?.size || 0);
    return c;
  }, [draft.draft, draft.removedAdjustmentIds, draft.removedSubIds]);

  // 下書きがある状態でタブを閉じる / リロードしようとしたら警告
  useEffect(() => {
    if (draftCount === 0) return undefined;
    const handler = (e) => {
      e.preventDefault();
      // Chrome ではメッセージ文字列は無視され固定のダイアログが出る
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftCount]);

  const handleDiscard = useCallback(async () => {
    const ok = await confirm({
      title: "下書きを破棄",
      message: `下書きが ${draftCount} 件あります。破棄しますか？`,
      okLabel: "破棄",
      tone: "danger",
    });
    if (ok) draft.reset();
  }, [confirm, draft, draftCount]);

  const handleDateChange = useCallback(
    async (newDate) => {
      if (draftCount > 0) {
        const ok = await confirm({
          title: "下書きがあります",
          message: "日付を変更すると下書きが破棄されます。続行しますか？",
          okLabel: "破棄して変更",
          tone: "danger",
        });
        if (!ok) return;
        draft.reset();
      }
      setDate(newDate);
    },
    [confirm, draft, draftCount]
  );

  const handleSave = useCallback(() => {
    const {
      draftSubs,
      draftAdjustments,
      draftOverrides,
      removedAdjustmentIds,
      removedSubIds,
    } = draft.toBatchPayload(date, slots, adjustments || []);
    if (
      draftSubs.length === 0 &&
      draftAdjustments.length === 0 &&
      draftOverrides.length === 0 &&
      (!removedAdjustmentIds || removedAdjustmentIds.length === 0) &&
      (!removedSubIds || removedSubIds.length === 0)
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
        removedAdjustmentIds,
        removedSubIds,
        saveSubs,
        saveAdjustments,
        saveSessionOverrides,
      });
      const parts = [];
      if (res.added.subs) parts.push(`代行 ${res.added.subs} 件`);
      if (res.added.adjustments) parts.push(`調整 ${res.added.adjustments} 件`);
      if (res.added.overrides) parts.push(`回数補正 ${res.added.overrides} 件`);
      if (res.added.removed) parts.push(`調整解除 ${res.added.removed} 件`);
      if (res.added.removedSubs) parts.push(`代行解除 ${res.added.removedSubs} 件`);
      toasts.success(`保存しました (${parts.join(" / ")})`);
      draft.reset();
    } catch (err) {
      console.error(err);
      toasts.error("保存に失敗しました");
    }
  }, [draft, date, slots, subs, adjustments, sessionOverrides, saveSubs, saveAdjustments, saveSessionOverrides, toasts]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, color: "#888", fontSize: 13 }}>
        このビューは管理者のみ利用できます。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 80 }}>
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
          onChange={(e) => handleDateChange(e.target.value)}
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
        <div ref={teacherDropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setTeacherDropdownOpen((v) => !v)}
            style={{ ...S.btn(false), cursor: "pointer" }}
          >
            {selectedTeachers.length > 0
              ? selectedTeachers.join(", ")
              : "(クリックして選択)"}
          </button>
          {teacherDropdownOpen && (
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
                top: "100%",
                marginTop: 2,
              }}
            >
              {allTeachers.map((t) => (
                <label
                  key={t}
                  style={{
                    display: "flex",
                    gap: 6,
                    padding: "2px 4px",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
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
          )}
        </div>
      </div>

      {/* Timetable grid */}
      <AbsenceTimetable
        slots={daySlots}
        allSlots={slots}
        draft={draft.draft}
        draftApi={draft}
        existingSubs={subs}
        existingAdjustments={adjustments}
        removedAdjustmentIds={draft.removedAdjustmentIds}
        removedSubIds={draft.removedSubIds}
        sessionCountMap={sessionCountMap}
        absentSlotIds={absentSlotIds}
        partTimeStaff={partTimeStaff}
        subjects={subjects}
        biweeklyAnchors={biweeklyAnchors}
        allTeachers={allTeachers}
        timetables={timetables}
        isOffForGrade={isOffForGrade}
        sessionOverrides={sessionOverrides}
        date={date}
      />

      {/* Floating save button */}
      {draftCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 500,
            display: "flex",
            gap: 6,
            alignItems: "center",
            background: "#fff",
            padding: "8px 10px",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(0,0,0,.25)",
            border: "1px solid #ddd",
          }}
        >
          <button
            type="button"
            onClick={handleDiscard}
            style={{ ...S.btn(false), fontSize: 12 }}
          >
            破棄
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: "#2a6a9e",
              color: "#fff",
              padding: "8px 16px",
              border: "none",
              borderRadius: 6,
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {draftCount} 件の変更を保存
          </button>
        </div>
      )}
    </div>
  );
}
