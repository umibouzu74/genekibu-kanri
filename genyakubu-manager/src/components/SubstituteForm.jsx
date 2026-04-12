import { useEffect, useMemo, useState } from "react";
import {
  dateToDay,
  fmtDate,
  sortSlots as sortS,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../data";
import { S } from "../styles/common";

export function SubstituteForm({
  sub,
  slots,
  partTimeStaff,
  subjects = [],
  onSave,
  onCancel,
}) {
  const today = fmtDate(new Date());
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
  const up = (k, v) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const dayOfDate = dateToDay(f.date);

  // partTimeStaff の名前集合 (新形式オブジェクトのみ想定)
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  // 候補コマ: 選択日の曜日に該当する slot、アルバイト担当を優先
  const slotOptions = useMemo(() => {
    if (!dayOfDate) return [];
    const filtered = sortS(slots.filter((s) => s.day === dayOfDate));
    const isPT = (t) => staffNameSet.has(t);
    return [
      ...filtered.filter((s) => isPT(s.teacher)),
      ...filtered.filter((s) => !isPT(s.teacher)),
    ];
  }, [slots, dayOfDate, staffNameSet]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === Number(f.slotId)) || null,
    [slots, f.slotId]
  );

  // slot 変更時に元講師を自動入力
  useEffect(() => {
    if (selectedSlot && selectedSlot.teacher !== f.originalTeacher) {
      setF((p) => ({ ...p, originalTeacher: selectedSlot.teacher }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot?.id]);

  // コマの科目文字列から対応する Subject.id を推定する。
  // 完全一致 → 名前を含む → 別名を含む の順で判定し、最初のマッチを返す。
  const matchedSubjectId = useMemo(() => {
    if (!selectedSlot?.subj) return null;
    const subj = selectedSlot.subj;
    // 完全一致
    const exact = subjects.find((s) => s.name === subj);
    if (exact) return exact.id;
    // 教科名を部分一致
    const byName = subjects.find((s) => subj.includes(s.name));
    if (byName) return byName.id;
    // 別名を部分一致
    const byAlias = subjects.find(
      (s) =>
        Array.isArray(s.aliases) &&
        s.aliases.some((a) => a && subj.includes(a))
    );
    return byAlias ? byAlias.id : null;
  }, [selectedSlot?.subj, subjects]);

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
    return [...set].sort();
  }, [slots, filteredPartTimeStaff, matchedSubjectId, showAllCandidates]);

  const handleSave = () => {
    const errs = {};
    if (!f.date) errs.date = "日付を入力してください";
    if (!f.slotId) errs.slotId = "コマを選択してください";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({ ...f, slotId: Number(f.slotId) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}>
          日付 <span style={{ color: "#c44" }}>*</span>
        </label>
        <input
          type="date"
          value={f.date}
          onChange={(e) => up("date", e.target.value)}
          style={{ ...S.input, borderColor: errors.date ? "#c44" : "#ccc" }}
        />
        {dayOfDate && (
          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({dayOfDate}曜日)</span>
        )}
        {errors.date && (
          <div style={{ fontSize: 10, color: "#c44", marginTop: 2 }}>{errors.date}</div>
        )}
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}>
          対象コマ <span style={{ color: "#c44" }}>*</span>
        </label>
        <select
          value={f.slotId}
          onChange={(e) => up("slotId", e.target.value)}
          style={{ ...S.input, borderColor: errors.slotId ? "#c44" : "#ccc" }}
        >
          <option value="">-- コマを選択 --</option>
          {slotOptions.map((s) => {
            const isPT = staffNameSet.has(s.teacher);
            return (
              <option key={s.id} value={s.id}>
                {isPT ? "★ " : ""}
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
          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>該当コマがありません</div>
        )}
        {errors.slotId && (
          <div style={{ fontSize: 10, color: "#c44", marginTop: 2 }}>{errors.slotId}</div>
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
          元講師: <b style={{ color: "#1a1a2e", fontSize: 13 }}>{selectedSlot.teacher}</b>
          {selectedSlot.note && (
            <span style={{ marginLeft: 10, color: "#e67a00" }}>({selectedSlot.note})</span>
          )}
        </div>
      )}

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}>
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
              教科「<b>{matchedSubject.name}</b>」を担当できるバイトに絞り込み中
              ({filteredPartTimeStaff.length} 名)
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
        <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}>
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
        <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 }}>
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
    </div>
  );
}
