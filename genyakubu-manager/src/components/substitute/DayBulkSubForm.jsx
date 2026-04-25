import { useEffect, useMemo, useState } from "react";
import {
  getSubForSlot,
  sortSlots as sortS,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../../data";
import { S } from "../../styles/common";
import { formatBiweeklyNote, getSlotTeachers } from "../../utils/biweekly";
import { pickSubjectId } from "../../utils/subjectMatch";
import { sortJa } from "../../utils/sortJa";
import { FieldError } from "../FieldError";

// ─── 1日分まとめて代行フォーム ───────────────────────────────────
// SubstituteForm の "full-day" モード相当。
// 対象日の曜日に該当する (未代行の) コマ一覧を行表示し、一括で
// 複数の代行レコードを登録する。
// 行入力 state (rowState) と "全員表示" トグルは親で保持し、モード切替で
// リセットされないようにしている。
export function DayBulkSubForm({
  date,
  dayOfDate,
  slots,
  subs,
  partTimeStaff,
  subjects,
  rowState,
  setRowState,
  showAllCandidates,
  setShowAllCandidates,
  onSave,
  onCancel,
}) {
  const [errors, setErrors] = useState({});

  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  const fullDayRows = useMemo(() => {
    if (!dayOfDate) return [];
    const filtered = sortS(
      slots.filter(
        (s) => s.day === dayOfDate && !getSubForSlot(subs, s.id, date)
      )
    );
    const hasPT = (s) => getSlotTeachers(s).some((t) => staffNameSet.has(t));
    return [
      ...filtered.filter((s) => hasPT(s)),
      ...filtered.filter((s) => !hasPT(s)),
    ];
  }, [slots, subs, dayOfDate, date, staffNameSet]);

  // 日付変更時に rowState をリセット (対象コマが変わるため)
  useEffect(() => {
    setRowState({});
    setErrors((p) => ({ ...p, rows: undefined }));
  }, [date, setRowState]);

  const updateRow = (slotId, patch) => {
    setRowState((p) => ({
      ...p,
      [slotId]: {
        substitute: "",
        status: "requested",
        ...(p[slotId] || {}),
        ...patch,
      },
    }));
    setErrors((p) => ({ ...p, rows: undefined }));
  };

  // 行ごとの候補教師リスト (科目フィルタ付き)
  const teachersForSlot = (slot) => {
    const subjId = pickSubjectId(slot.subj, subjects);
    const filteredStaff =
      !subjId || showAllCandidates
        ? partTimeStaff
        : partTimeStaff.filter((s) => s.subjectIds.includes(subjId));
    const set = new Set(filteredStaff.map((s) => s.name));
    if (!subjId || showAllCandidates) {
      slots.forEach((s) => s.teacher && set.add(s.teacher));
    }
    return sortJa([...set]);
  };

  const handleSave = () => {
    const errs = {};
    const records = Object.entries(rowState)
      .filter(([, v]) => v && v.substitute && v.substitute.trim())
      .map(([slotId, v]) => {
        const slot = slots.find((s) => s.id === Number(slotId));
        return {
          date,
          slotId: Number(slotId),
          originalTeacher: slot ? slot.teacher : "",
          substitute: v.substitute.trim(),
          status: v.substitute ? v.status || "requested" : "requested",
          memo: "",
        };
      });
    if (records.length === 0) {
      errs.rows = "代行者を 1 件以上入力してください";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave(records);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11, color: "#555" }}>
          対象日のコマごとに代行者を入力してください (空欄の行はスキップ)
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: "#555",
          }}
        >
          <input
            type="checkbox"
            checked={showAllCandidates}
            onChange={(e) => setShowAllCandidates(e.target.checked)}
            style={{ margin: 0 }}
          />
          全員表示 (科目フィルタ解除)
        </label>
      </div>

      {dayOfDate === null && (
        <div style={{ fontSize: 11, color: "#888" }}>
          ※ 日付を選ぶと該当曜日のコマが表示されます
        </div>
      )}
      {dayOfDate && fullDayRows.length === 0 && (
        <div style={{ fontSize: 11, color: "#888" }}>
          該当コマがありません (代行済みを除く)
        </div>
      )}

      {fullDayRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fullDayRows.map((slot) => {
            const hasPT = getSlotTeachers(slot).some((t) => staffNameSet.has(t));
            const row = rowState[slot.id] || {
              substitute: "",
              status: "requested",
            };
            const listId = `sub-teacher-list-${slot.id}`;
            const slotLabelId = `sub-row-label-${slot.id}`;
            const teachers = teachersForSlot(slot);
            return (
              <div
                key={slot.id}
                style={{
                  border: "1px solid #e0e0e4",
                  borderRadius: 6,
                  padding: "8px 10px",
                  background: "#fafafc",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div id={slotLabelId} style={{ fontSize: 11, color: "#333", lineHeight: 1.35 }}>
                  {hasPT ? "★ " : ""}
                  <b>{slot.time}</b> / {slot.grade}
                  {slot.cls && slot.cls !== "-" ? slot.cls : ""} / {slot.subj}
                  {slot.room ? ` (${slot.room})` : ""}
                  <div style={{ fontSize: 10, color: "#777" }}>
                    元講師: <b style={{ color: "#1a1a2e" }}>{slot.teacher}</b>
                    {slot.note && (
                      <span style={{ marginLeft: 6, color: "#e67a00" }}>
                        ({formatBiweeklyNote(slot.teacher, slot.note)})
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    list={listId}
                    value={row.substitute}
                    onChange={(e) =>
                      updateRow(slot.id, { substitute: e.target.value })
                    }
                    placeholder="代行者名"
                    aria-label="代行者"
                    aria-describedby={slotLabelId}
                    style={{ ...S.input, flex: "1 1 140px", minWidth: 120 }}
                  />
                  <datalist id={listId}>
                    {teachers.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <div
                    role="radiogroup"
                    aria-label="ステータス"
                    style={{ display: "flex", gap: 4 }}
                  >
                    {SUB_STATUS_KEYS.map((k) => {
                      const st = SUB_STATUS[k];
                      const active = row.status === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => updateRow(slot.id, { status: k })}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: 700,
                            background: active ? st.bg : "#f5f5f5",
                            color: active ? st.color : "#888",
                            border: `2px solid ${active ? st.border : "#e0e0e0"}`,
                          }}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FieldError>{errors.rows}</FieldError>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onCancel} style={S.btn(false)}>
          キャンセル
        </button>
        <button onClick={handleSave} style={S.btn(true)}>
          保存
        </button>
      </div>
    </>
  );
}
