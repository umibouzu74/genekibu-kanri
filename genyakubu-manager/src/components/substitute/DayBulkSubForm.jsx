import { useEffect, useId, useMemo, useState } from "react";
import { activeTeachersOnDate, getAbsenceDaySlots } from "../../utils/absenceHelpers";
import { sortSlots as sortS, SUB_STATUS, SUB_STATUS_KEYS } from "../../data";
import { S } from "../../styles/common";
import { formatBiweeklyNote, getSlotTeachers } from "../../utils/biweekly";
import { hasSubstitute, needsSubstitute, SUB_STATE, subState } from "../../utils/substituteState";
import { pickSubjectId } from "../../utils/subjectMatch";
import { sortTeacherNames } from "../../utils/teacherKana";
import { FieldError } from "../FieldError";
import { buildTakenSlotTeachers, uncoveredTeachersForSlot } from "./slotTaken";

// ─── 1日分まとめて代行フォーム ───────────────────────────────────
// SubstituteForm の "full-day" モード相当。
// 対象日の曜日に該当する (未代行の) コマ一覧を行表示し、一括で
// 複数の代行レコードを登録する。
// 行入力 state (rowState) と "全員表示" トグルは親で保持し、モード切替で
// リセットされないようにしている。
//
// 代行レコードは **コマ × 講師** の単位。多担任コマ ("香川·福江·川井") は
// 1 人に記録が付いても残りの担当者の穴が空いたままなので、行は
// 「まだ記録の無い担当者が 1 人でも居る間」出し続け、元講師の選択肢も
// その人たちだけにする (判定は単一コマフォームと共有の ./slotTaken)。
//
// 「明日は全部休み、代行はこれから探す」も登録できるように、行ごとに
// 「代行未定で登録」(代行者空 + 依頼中 = 欠勤・代行未定) を選べる。
// 欠勤専用のモデルは足さない — 代行者が空の代行レコードそのもの。
export function DayBulkSubForm({
  date,
  dayOfDate,
  slots,
  subs,
  partTimeStaff,
  subjects,
  teacherKana = {},
  biweeklyAnchors = [],
  holidays = [],
  examPeriods = [],
  // その日に有効なコマだけを並べるための材料 (時間割の有効期間 / 表示期間)
  timetables = [],
  displayCutoff = null,
  rowState,
  setRowState,
  showAllCandidates,
  setShowAllCandidates,
  onSave,
  onCancel,
}) {
  const formId = useId();
  const memoInputId = `${formId}-bulk-memo`;
  const [errors, setErrors] = useState({});
  // その日の全レコードに共通のメモ (理由など)
  const [memo, setMemo] = useState("");

  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // 同日に登録済みの (コマ, 元講師) の索引
  const takenSlotTeachers = useMemo(
    () => buildTakenSlotTeachers(subs, date),
    [subs, date]
  );

  // 単一コマと同じく「その日に有効な時間割のコマ」だけ (旧期の同名コマを
  // 並べない。判定は欠勤登録と共有の getAbsenceDaySlots)。
  // 各行には「その日に実際に担当し、まだ代行レコードの無い講師」を添える
  // (隔週は A/B を解く)。全員に記録が付いたコマだけを一覧から外す
  const fullDayRows = useMemo(() => {
    if (!dayOfDate) return [];
    const ctx = { biweeklyAnchors, holidays, examPeriods };
    const rows = sortS(
      getAbsenceDaySlots(slots, date, dayOfDate, { timetables, displayCutoff })
    )
      .map((slot) => ({
        slot,
        uncovered: uncoveredTeachersForSlot(
          slot,
          takenSlotTeachers,
          activeTeachersOnDate(slot, date, ctx)
        ),
      }))
      .filter((r) => r.uncovered.length > 0);
    const hasPT = (r) => getSlotTeachers(r.slot).some((t) => staffNameSet.has(t));
    return [...rows.filter(hasPT), ...rows.filter((r) => !hasPT(r))];
  }, [
    slots, dayOfDate, date, staffNameSet, timetables, displayCutoff,
    takenSlotTeachers, biweeklyAnchors, holidays, examPeriods,
  ]);

  // 日付変更時に rowState と共通メモをリセット (対象コマも「その日の理由」も
  // 変わるため。メモだけ残すと前の日の理由が別の日の全件に付く)
  useEffect(() => {
    setRowState({});
    setMemo("");
    setErrors((p) => ({ ...p, rows: undefined }));
  }, [date, setRowState]);

  // 「該当コマがありません」の内訳。一覧から外れるのは代行者が付いたコマ
  // だけではなく、代行未定 / 代行なしで確定も含めた**登録済み**すべて
  // (slotTaken.buildTakenSlotTeachers) なので、その日のレコードを 3 つに
  // 分けて見せる (「代行済み」と書くと代行未定が消えたように読める)
  const registeredSummary = useMemo(() => {
    let withSub = 0;
    let pending = 0;
    let nosub = 0;
    for (const x of subs || []) {
      if (x.date !== date) continue;
      if (hasSubstitute(x)) withSub++;
      else if (needsSubstitute(x)) pending++;
      else if (subState(x) === SUB_STATE.NOSUB) nosub++;
    }
    return { withSub, pending, nosub, total: withSub + pending + nosub };
  }, [subs, date]);

  const updateRow = (slotId, patch) => {
    setRowState((p) => ({
      ...p,
      [slotId]: {
        substitute: "",
        status: "requested",
        absent: false,
        ...(p[slotId] || {}),
        ...patch,
      },
    }));
    setErrors((p) => ({ ...p, rows: undefined }));
  };

  // 「代行未定で登録」= 代行者空 + 依頼中 (欠勤・代行未定)。
  // 入れてあった代行者名は捨て、status も依頼中へ戻す
  const toggleAbsent = (slotId, absent) => {
    updateRow(
      slotId,
      absent ? { absent: true, substitute: "", status: "requested" } : { absent: false }
    );
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
      // 講師欄は "香川·福江" のように複数名のことがあるので分解して足す
      slots.forEach((s) => getSlotTeachers(s).forEach((t) => set.add(t)));
    }
    return sortTeacherNames([...set], teacherKana);
  };

  // 行の元講師: 選んだ人が今も未登録なら
  // それ、そうでなければ未登録の先頭 (多担任コマの既定)
  const resolveOriginalTeacher = (row, uncovered) =>
    row?.originalTeacher && uncovered.includes(row.originalTeacher)
      ? row.originalTeacher
      : uncovered[0] || "";

  const handleSave = () => {
    const errs = {};
    const records = [];
    for (const { slot, uncovered } of fullDayRows) {
      const v = rowState[slot.id];
      if (!v) continue;
      const substitute = (v.substitute || "").trim();
      if (!v.absent && !substitute) continue;
      records.push({
        date,
        slotId: slot.id,
        // 代行レコードはコマ × 講師の単位なので、講師欄を丸ごと入れない
        originalTeacher: resolveOriginalTeacher(v, uncovered),
        substitute: v.absent ? "" : substitute,
        status: v.absent ? "requested" : v.status || "requested",
        memo: memo.trim(),
      });
    }
    if (records.length === 0) {
      errs.rows = "代行者を 1 件以上入力するか、代行未定にしてください";
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
          対象日のコマごとに代行者を入力してください (空欄の行はスキップ。
          代行がまだ決まっていない欠勤は「代行未定で登録」)
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
          <div>該当コマがありません (登録済みを除く)</div>
          {registeredSummary.total > 0 && (
            <div style={{ marginTop: 2 }}>
              登録済み: 代行あり {registeredSummary.withSub} 件 / 代行未定{" "}
              {registeredSummary.pending} 件
              {registeredSummary.nosub > 0
                ? ` / 代行なし ${registeredSummary.nosub} 件`
                : ""}
            </div>
          )}
        </div>
      )}

      {fullDayRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fullDayRows.map(({ slot, uncovered }) => {
            const hasPT = getSlotTeachers(slot).some((t) => staffNameSet.has(t));
            const row = rowState[slot.id] || {
              substitute: "",
              status: "requested",
              absent: false,
            };
            const listId = `sub-teacher-list-${slot.id}`;
            const slotLabelId = `sub-row-label-${slot.id}`;
            const teachers = teachersForSlot(slot);
            const originalTeacher = resolveOriginalTeacher(row, uncovered);
            // 多担任コマで一部の人に記録が付いている = 残りの人だけ選べる
            const takenCount = takenSlotTeachers.get(slot.id)?.size || 0;
            return (
              <div
                key={slot.id}
                style={{
                  border: "1px solid #e0e0e4",
                  borderRadius: 6,
                  padding: "8px 10px",
                  background: row.absent ? "#fff5f5" : "#fafafc",
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
                    元講師:{" "}
                    {uncovered.length > 1 ? (
                      <select
                        value={originalTeacher}
                        onChange={(e) => updateRow(slot.id, { originalTeacher: e.target.value })}
                        aria-label="元講師"
                        style={{ ...S.input, padding: "1px 4px", fontSize: 11, width: "auto" }}
                      >
                        {uncovered.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <b style={{ color: "#1a1a2e" }}>{originalTeacher || slot.teacher}</b>
                    )}
                    {takenCount > 0 && (
                      <span style={{ marginLeft: 6, color: "#999" }}>
                        (他 {takenCount} 名は登録済)
                      </span>
                    )}
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
                    disabled={row.absent}
                    onChange={(e) =>
                      updateRow(slot.id, { substitute: e.target.value })
                    }
                    placeholder={row.absent ? "代行未定" : "代行者名"}
                    aria-label="代行者"
                    aria-describedby={slotLabelId}
                    style={{
                      ...S.input,
                      flex: "1 1 140px",
                      minWidth: 120,
                      background: row.absent ? "#f3f3f3" : "#fff",
                    }}
                  />
                  <datalist id={listId}>
                    {teachers.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  {!row.absent && (
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
                  )}
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 10,
                      color: row.absent ? "#b03030" : "#555",
                      fontWeight: row.absent ? 700 : 400,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!row.absent}
                      onChange={(e) => toggleAbsent(slot.id, e.target.checked)}
                      aria-describedby={slotLabelId}
                      style={{ margin: 0 }}
                    />
                    代行未定で登録
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fullDayRows.length > 0 && (
        <div>
          <label htmlFor={memoInputId} style={S.formLabel}>
            メモ (この日の全件に共通)
          </label>
          <textarea
            id={memoInputId}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="理由・引継ぎ事項など"
            rows={2}
            style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }}
          />
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
