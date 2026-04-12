import { useEffect, useMemo, useState } from "react";
import {
  dateToDay,
  fmtDate,
  getSubForSlot,
  sortSlots as sortS,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../data";
import { S } from "../styles/common";
import { formatBiweeklyNote, getSlotTeachers } from "../utils/biweekly";
import { sortJa } from "../utils/sortJa";

// コマの科目文字列から対応する Subject.id を推定する。
// 完全一致 → 名前を含む → 別名を含む の順で判定し、最初のマッチを返す。
function pickSubjectId(subjStr, subjects) {
  if (!subjStr) return null;
  const exact = subjects.find((s) => s.name === subjStr);
  if (exact) return exact.id;
  const byName = subjects.find((s) => subjStr.includes(s.name));
  if (byName) return byName.id;
  const byAlias = subjects.find(
    (s) =>
      Array.isArray(s.aliases) &&
      s.aliases.some((a) => a && subjStr.includes(a))
  );
  return byAlias ? byAlias.id : null;
}

export function SubstituteForm({
  sub,
  slots,
  subs = [],
  partTimeStaff,
  subjects = [],
  onSave,
  onCancel,
}) {
  const today = fmtDate(new Date());
  const isEdit = Boolean(sub);
  const [mode, setMode] = useState("single");
  const [f, setF] = useState(
    sub || {
      date: today,
      slotId: "",
      originalTeacher: "",
      substitute: "",
      status: "requested",
      memo: "",
    }
  );
  const [errors, setErrors] = useState({});
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  // 1日分モードの行ごとの state: { [slotId]: { substitute, status } }
  const [rowState, setRowState] = useState({});
  const up = (k, v) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  // 編集時は強制的に単一モード
  const activeMode = isEdit ? "single" : mode;

  const dayOfDate = dateToDay(f.date);

  // partTimeStaff の名前集合 (新形式オブジェクトのみ想定)
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // すでに代行記録がある slotId の集合 (同じ日付内)。
  // 編集中のレコード自身は除外する。
  const takenSlotIds = useMemo(() => {
    if (!f.date) return new Set();
    return new Set(
      subs
        .filter((x) => x.date === f.date && (!sub || x.id !== sub.id))
        .map((x) => x.slotId)
    );
  }, [subs, f.date, sub]);

  // 候補コマ: 選択日の曜日に該当する slot、アルバイト担当を優先、代行済みは除外
  const slotOptions = useMemo(() => {
    if (!dayOfDate) return [];
    const filtered = sortS(
      slots.filter((s) => s.day === dayOfDate && !takenSlotIds.has(s.id))
    );
    const hasPT = (s) => getSlotTeachers(s).some((t) => staffNameSet.has(t));
    return [
      ...filtered.filter((s) => hasPT(s)),
      ...filtered.filter((s) => !hasPT(s)),
    ];
  }, [slots, dayOfDate, staffNameSet, takenSlotIds]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === Number(f.slotId)) || null,
    [slots, f.slotId]
  );

  const selectedSlotTeachers = useMemo(
    () => (selectedSlot ? getSlotTeachers(selectedSlot) : []),
    [selectedSlot]
  );
  const isMultiTeacher = selectedSlotTeachers.length > 1;

  // slot 変更時に元講師を自動入力（単一教師の場合のみ）
  useEffect(() => {
    if (!selectedSlot) return;
    const teachers = getSlotTeachers(selectedSlot);
    if (teachers.length === 1 && selectedSlot.teacher !== f.originalTeacher) {
      setF((p) => ({ ...p, originalTeacher: selectedSlot.teacher }));
    } else if (teachers.length > 1) {
      // マルチ教師: 現在の originalTeacher がこのスロットの教師でなければクリア
      if (!teachers.includes(f.originalTeacher)) {
        setF((p) => ({ ...p, originalTeacher: "" }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when selected slot changes, not on every f.originalTeacher change
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

  // 担当可能なバイト一覧 (科目フィルタ適用後)
  const filteredPartTimeStaff = useMemo(() => {
    if (!matchedSubjectId || showAllCandidates) return partTimeStaff;
    return partTimeStaff.filter((s) => s.subjectIds.includes(matchedSubjectId));
  }, [partTimeStaff, matchedSubjectId, showAllCandidates]);

  const allTeachers = useMemo(() => {
    const set = new Set(filteredPartTimeStaff.map((s) => s.name));
    // フィルタが効いているときは全講師を混ぜずに候補を絞る
    if (!matchedSubjectId || showAllCandidates) {
      slots.forEach((s) => s.teacher && set.add(s.teacher));
    }
    return sortJa([...set]);
  }, [slots, filteredPartTimeStaff, matchedSubjectId, showAllCandidates]);

  // ── 1日分モード用 ───────────────────────────────────────
  // 対象日の曜日に該当し、まだ代行がついていないコマ一覧
  const fullDayRows = useMemo(() => {
    if (!dayOfDate) return [];
    const filtered = sortS(
      slots.filter(
        (s) => s.day === dayOfDate && !getSubForSlot(subs, s.id, f.date)
      )
    );
    const hasPT = (s) => getSlotTeachers(s).some((t) => staffNameSet.has(t));
    return [
      ...filtered.filter((s) => hasPT(s)),
      ...filtered.filter((s) => !hasPT(s)),
    ];
  }, [slots, subs, dayOfDate, f.date, staffNameSet]);

  // 日付変更時に rowState をリセット (対象コマが変わるため)
  useEffect(() => {
    setRowState({});
    setErrors((p) => ({ ...p, rows: undefined }));
  }, [f.date, activeMode]);

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

  // 1行分の候補教師リスト (行ごとの科目フィルタ付き)
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
    if (!f.date) errs.date = "日付を入力してください";
    if (!f.slotId) errs.slotId = "コマを選択してください";
    if (isMultiTeacher && !f.originalTeacher) errs.originalTeacher = "元講師を選択してください";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({ ...f, slotId: Number(f.slotId) });
  };

  const handleSaveFullDay = () => {
    const errs = {};
    if (!f.date) errs.date = "日付を入力してください";
    const records = Object.entries(rowState)
      .filter(([, v]) => v && v.substitute && v.substitute.trim())
      .map(([slotId, v]) => {
        const slot = slots.find((s) => s.id === Number(slotId));
        return {
          date: f.date,
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

  const modeBtn = (key, label) => {
    const active = activeMode === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setMode(key)}
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          background: active ? "#1a1a2e" : "#f5f5f5",
          color: active ? "#fff" : "#888",
          border: `2px solid ${active ? "#1a1a2e" : "#e0e0e0"}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!isEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          {modeBtn("single", "単一コマ")}
          {modeBtn("full-day", "1日分まとめて")}
        </div>
      )}

      <div>
        <label
          style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}
        >
          日付 <span style={{ color: "#c44" }}>*</span>
        </label>
        <input
          type="date"
          value={f.date}
          onChange={(e) => up("date", e.target.value)}
          style={{ ...S.input, borderColor: errors.date ? "#c44" : "#ccc" }}
        />
        {dayOfDate && (
          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
            ({dayOfDate}曜日)
          </span>
        )}
        {errors.date && (
          <div style={{ fontSize: 10, color: "#c44", marginTop: 2 }}>{errors.date}</div>
        )}
      </div>

      {activeMode === "single" && (
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
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => up("originalTeacher", t)}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            background: active ? "#1a1a2e" : "#fff",
                            color: active ? "#fff" : "#333",
                            border: `2px solid ${active ? "#1a1a2e" : "#ccc"}`,
                          }}
                        >
                          {t}
                          {staffNameSet.has(t) && (
                            <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>★</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  元講師: <b style={{ color: "#1a1a2e", fontSize: 13 }}>{selectedSlot.teacher}</b>
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
        </>
      )}

      {activeMode === "full-day" && (
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
                    <div style={{ fontSize: 11, color: "#333", lineHeight: 1.35 }}>
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
                        style={{ ...S.input, flex: "1 1 140px", minWidth: 120 }}
                      />
                      <datalist id={listId}>
                        {teachers.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                      <div style={{ display: "flex", gap: 4 }}>
                        {SUB_STATUS_KEYS.map((k) => {
                          const st = SUB_STATUS[k];
                          const active = row.status === k;
                          return (
                            <button
                              key={k}
                              type="button"
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

          {errors.rows && (
            <div style={{ fontSize: 10, color: "#c44" }}>{errors.rows}</div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onCancel} style={S.btn(false)}>
          キャンセル
        </button>
        <button
          onClick={activeMode === "full-day" ? handleSaveFullDay : handleSave}
          style={S.btn(true)}
        >
          保存
        </button>
      </div>
    </div>
  );
}
