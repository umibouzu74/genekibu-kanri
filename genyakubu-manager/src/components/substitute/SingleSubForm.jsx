import { useEffect, useMemo, useState } from "react";
import { SUB_STATUS, SUB_STATUS_KEYS, sortSlots as sortS } from "../../data";
import { S } from "../../styles/common";
import { getSlotTeachers } from "../../utils/biweekly";
import { pickSubjectId } from "../../utils/subjectMatch";
import { sortJa } from "../../utils/sortJa";

// ─── 単一コマ代行フォーム ──────────────────────────────────────────
// SubstituteForm の "single" モード相当。
// フォーム入力 state (f) と "全員表示" トグルは親で保持し、モード切替時
// にも維持される (UX: ユーザが途中でモード切替しても入力が消えない)。
export function SingleSubForm({
  sub,
  date,
  dayOfDate,
  slots,
  subs,
  partTimeStaff,
  subjects,
  f,
  setF,
  showAllCandidates,
  setShowAllCandidates,
  onSave,
  onCancel,
}) {
  const [errors, setErrors] = useState({});

  const up = (k, v) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // すでに代行記録がある slotId → 登録済み教師名の Set (同日内)
  const takenSlotTeachers = useMemo(() => {
    if (!date) return new Map();
    const m = new Map();
    for (const x of subs) {
      if (x.date !== date) continue;
      if (sub && x.id === sub.id) continue;
      if (!m.has(x.slotId)) m.set(x.slotId, new Set());
      m.get(x.slotId).add(x.originalTeacher);
    }
    return m;
  }, [subs, date, sub]);

  const isSlotFullyTaken = (s) => {
    const taken = takenSlotTeachers.get(s.id);
    if (!taken) return false;
    const teachers = getSlotTeachers(s);
    if (teachers.length <= 1) return true;
    return teachers.every((t) => taken.has(t));
  };

  const slotOptions = useMemo(() => {
    if (!dayOfDate) return [];
    const filtered = sortS(
      slots.filter((s) => s.day === dayOfDate && !isSlotFullyTaken(s))
    );
    const hasPT = (s) => getSlotTeachers(s).some((t) => staffNameSet.has(t));
    return [
      ...filtered.filter((s) => hasPT(s)),
      ...filtered.filter((s) => !hasPT(s)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takenSlotTeachers covered by subs/date/sub
  }, [slots, dayOfDate, staffNameSet, subs, date, sub]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === Number(f.slotId)) || null,
    [slots, f.slotId]
  );
  const selectedSlotTeachers = useMemo(
    () => (selectedSlot ? getSlotTeachers(selectedSlot) : []),
    [selectedSlot]
  );
  const isMultiTeacher = selectedSlotTeachers.length > 1;

  // slot 変更時に元講師を自動入力 (単一教師のみ)
  useEffect(() => {
    if (!selectedSlot) return;
    const teachers = getSlotTeachers(selectedSlot);
    if (teachers.length === 1 && selectedSlot.teacher !== f.originalTeacher) {
      setF((p) => ({ ...p, originalTeacher: selectedSlot.teacher }));
    } else if (teachers.length > 1) {
      if (!teachers.includes(f.originalTeacher)) {
        setF((p) => ({ ...p, originalTeacher: "" }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on slot change
  }, [selectedSlot?.id]);

  const matchedSubjectId = useMemo(
    () => pickSubjectId(selectedSlot?.subj, subjects),
    [selectedSlot?.subj, subjects]
  );
  const matchedSubject = useMemo(
    () =>
      matchedSubjectId
        ? subjects.find((s) => s.id === matchedSubjectId) || null
        : null,
    [matchedSubjectId, subjects]
  );
  const filteredPartTimeStaff = useMemo(() => {
    if (!matchedSubjectId || showAllCandidates) return partTimeStaff;
    return partTimeStaff.filter((s) => s.subjectIds.includes(matchedSubjectId));
  }, [partTimeStaff, matchedSubjectId, showAllCandidates]);
  const allTeachers = useMemo(() => {
    const set = new Set(filteredPartTimeStaff.map((s) => s.name));
    if (!matchedSubjectId || showAllCandidates) {
      slots.forEach((s) => s.teacher && set.add(s.teacher));
    }
    return sortJa([...set]);
  }, [slots, filteredPartTimeStaff, matchedSubjectId, showAllCandidates]);

  const handleSave = () => {
    const errs = {};
    if (!f.slotId) errs.slotId = "コマを選択してください";
    if (isMultiTeacher && !f.originalTeacher)
      errs.originalTeacher = "元講師を選択してください";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({ ...f, date, slotId: Number(f.slotId) });
  };

  return (
    <>
      <div>
        <label
          style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}
        >
          対象コマ <span style={{ color: "#c44" }}>*</span>
        </label>
        <select
          value={f.slotId}
          onChange={(e) => up("slotId", e.target.value)}
          style={{ ...S.input, borderColor: errors.slotId ? "#c44" : "#ccc" }}
        >
          <option value="">-- コマを選択 --</option>
          {slotOptions.map((s) => {
            const hasPT = getSlotTeachers(s).some((t) => staffNameSet.has(t));
            return (
              <option key={s.id} value={s.id}>
                {hasPT ? "★ " : ""}
                {s.time} / {s.grade}
                {s.cls && s.cls !== "-" ? s.cls : ""} / {s.subj} / {s.teacher}
                {s.room ? ` (${s.room})` : ""}
              </option>
            );
          })}
        </select>
        {dayOfDate === null && (
          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
            ※ 日付を選ぶと該当曜日のコマが表示されます
          </div>
        )}
        {dayOfDate && slotOptions.length === 0 && (
          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
            該当コマがありません (代行済みを除く)
          </div>
        )}
        {errors.slotId && (
          <div style={{ fontSize: 10, color: "#c44", marginTop: 2 }}>
            {errors.slotId}
          </div>
        )}
      </div>

      {selectedSlot && (
        <div
          style={{
            background: "#f5f7fa",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 11,
            color: "#555",
          }}
        >
          {isMultiTeacher ? (
            <>
              <div style={{ marginBottom: 6 }}>
                元講師（{selectedSlotTeachers.length}名）: 代行が必要な講師を選択
                {selectedSlot.note && (
                  <span style={{ marginLeft: 6, color: "#e67a00" }}>
                    ({selectedSlot.note})
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selectedSlotTeachers.map((t) => {
                  const active = f.originalTeacher === t;
                  const alreadyTaken =
                    takenSlotTeachers.get(Number(f.slotId))?.has(t) ?? false;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={alreadyTaken}
                      onClick={() => up("originalTeacher", t)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: alreadyTaken ? "not-allowed" : "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        background: alreadyTaken
                          ? "#eee"
                          : active
                            ? "#1a1a2e"
                            : "#fff",
                        color: alreadyTaken
                          ? "#aaa"
                          : active
                            ? "#fff"
                            : "#333",
                        border: `2px solid ${alreadyTaken ? "#ddd" : active ? "#1a1a2e" : "#ccc"}`,
                        textDecoration: alreadyTaken ? "line-through" : "none",
                      }}
                    >
                      {t}
                      {alreadyTaken ? (
                        " (登録済)"
                      ) : staffNameSet.has(t) ? (
                        <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
                          ★
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {errors.originalTeacher && (
                <div style={{ fontSize: 10, color: "#c44", marginTop: 4 }}>
                  {errors.originalTeacher}
                </div>
              )}
            </>
          ) : (
            <>
              元講師:{" "}
              <b style={{ color: "#1a1a2e", fontSize: 13 }}>
                {selectedSlot.teacher}
              </b>
              {selectedSlot.note && (
                <span style={{ marginLeft: 10, color: "#e67a00" }}>
                  ({selectedSlot.note})
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <label
          style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}
        >
          代行者
        </label>
        {matchedSubject && (
          <div
            style={{
              fontSize: 10,
              color: "#555",
              background: "#f0f8ea",
              border: "1px solid #cde5b8",
              borderRadius: 4,
              padding: "4px 8px",
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>
              教科「<b>{matchedSubject.name}</b>」を担当できるバイトに絞り込み中 (
              {filteredPartTimeStaff.length} 名)
            </span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={showAllCandidates}
                onChange={(e) => setShowAllCandidates(e.target.checked)}
                style={{ margin: 0 }}
              />
              全員表示
            </label>
          </div>
        )}
        <input
          list="sub-teacher-list"
          value={f.substitute}
          onChange={(e) => up("substitute", e.target.value)}
          placeholder="代行者名 (空欄なら依頼中)"
          style={S.input}
        />
        <datalist id="sub-teacher-list">
          {allTeachers.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div>
        <label
          style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}
        >
          ステータス
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SUB_STATUS_KEYS.map((k) => {
            const st = SUB_STATUS[k];
            const active = f.status === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => up("status", k)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
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
        {!f.substitute && f.status !== "requested" && (
          <div style={{ fontSize: 10, color: "#c77", marginTop: 4 }}>
            ※ 代行者が未入力の場合は「依頼中」として保存されます
          </div>
        )}
      </div>

      <div>
        <label
          style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}
        >
          メモ
        </label>
        <textarea
          value={f.memo || ""}
          onChange={(e) => up("memo", e.target.value)}
          placeholder="理由・引継ぎ事項など"
          rows={3}
          style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

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
