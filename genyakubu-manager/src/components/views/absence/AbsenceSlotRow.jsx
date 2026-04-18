import { useMemo } from "react";
import { S } from "../../../styles/common";
import { sortJa } from "../../../utils/sortJa";
import { pickSubjectId } from "../../../utils/subjectMatch";
import { formatBiweeklyNote } from "../../../utils/biweekly";

// ─── 欠勤ワークフロー: 1 コマ分の編集行 ─────────────────────────
// 各行でアクションタブ (代行 | 合同 | 移動 | 回数補正) を切り替える。
// 代行/合同/移動 は相互排他、回数補正は独立して併用可。

export function AbsenceSlotRow({
  slot,
  row,
  timeOptions,
  candidateHostSlots,
  partTimeStaff,
  subjects,
  setAction,
  updateSub,
  updateMove,
  setCombine,
  clearCombine,
  updateOverride,
  sessionCountBefore,
}) {
  const teachers = useMemo(() => {
    const subjId = pickSubjectId(slot.subj, subjects);
    const filteredStaff =
      subjId
        ? (partTimeStaff || []).filter((s) =>
            Array.isArray(s.subjectIds) ? s.subjectIds.includes(subjId) : false
          )
        : partTimeStaff || [];
    const set = new Set(filteredStaff.map((s) => s.name));
    return sortJa([...set]);
  }, [slot.subj, subjects, partTimeStaff]);

  const isAbsorbed = row?.absorbedBy != null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            background: "#1a1a2e",
            color: "#fff",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {slot.time}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}
        </span>
        <span style={{ fontSize: 12, color: "#666" }}>
          {formatBiweeklyNote(slot.teacher, slot.note)}
        </span>
        {slot.room && (
          <span style={{ fontSize: 11, color: "#888" }}>／{slot.room}</span>
        )}
        {sessionCountBefore != null && sessionCountBefore > 0 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#666",
              background: "#f5f5f5",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            現在: 第{sessionCountBefore}回
          </span>
        )}
      </div>

      {isAbsorbed ? (
        <div
          style={{
            marginTop: 6,
            padding: "6px 8px",
            background: "#fff8e0",
            borderRadius: 4,
            fontSize: 12,
            color: "#8a6a20",
          }}
        >
          このコマは別のコマに合同吸収されます (ID: {row.absorbedBy})
        </div>
      ) : (
        <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
          <ActionTab label="代行" active={row?.action === "sub"} onClick={() => setAction(slot.id, "sub")} />
          <ActionTab
            label="合同"
            active={row?.action === "combine"}
            onClick={() => setAction(slot.id, "combine")}
          />
          <ActionTab label="移動" active={row?.action === "move"} onClick={() => setAction(slot.id, "move")} />
          <ActionTab
            label="クリア"
            active={row?.action == null}
            onClick={() => setAction(slot.id, null)}
          />
        </div>
      )}

      {row?.action === "sub" && !isAbsorbed && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "#555" }}>代行者</label>
          <select
            value={row.sub?.substitute || ""}
            onChange={(e) => updateSub(slot.id, { substitute: e.target.value })}
            style={{ ...S.input, width: 140 }}
          >
            <option value="">(選択)</option>
            {teachers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={row.sub?.status || "confirmed"}
            onChange={(e) => updateSub(slot.id, { status: e.target.value })}
            style={{ ...S.input, width: 110 }}
          >
            <option value="confirmed">確定</option>
            <option value="requested">依頼中</option>
          </select>
          <input
            type="text"
            placeholder="メモ"
            value={row.sub?.memo || ""}
            onChange={(e) => updateSub(slot.id, { memo: e.target.value })}
            style={{ ...S.input, flex: 1, minWidth: 120 }}
          />
        </div>
      )}

      {row?.action === "combine" && !isAbsorbed && (
        <CombineEditor
          slot={slot}
          row={row}
          candidateHostSlots={candidateHostSlots}
          setCombine={setCombine}
          clearCombine={clearCombine}
        />
      )}

      {row?.action === "move" && !isAbsorbed && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "#555" }}>移動先</label>
          <select
            value={row.move?.targetTime || ""}
            onChange={(e) => updateMove(slot.id, e.target.value)}
            style={{ ...S.input, width: 150 }}
          >
            <option value="">(時間帯を選択)</option>
            {timeOptions.map((t) => (
              <option key={t} value={t} disabled={t === slot.time}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 回数補正は常に表示 (action と独立) */}
      {!isAbsorbed && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            background: "#fafafa",
            borderRadius: 4,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <span style={{ color: "#666" }}>回数補正:</span>
          <select
            value={row?.override?.mode || ""}
            onChange={(e) => {
              const m = e.target.value;
              if (!m) updateOverride(slot.id, null);
              else updateOverride(slot.id, { mode: m });
            }}
            style={{ ...S.input, width: 110 }}
          >
            <option value="">(なし)</option>
            <option value="set">回数指定</option>
            <option value="skip">カウントしない</option>
          </select>
          {row?.override?.mode === "set" && (
            <input
              type="number"
              min={1}
              value={row.override.value ?? ""}
              onChange={(e) => updateOverride(slot.id, { value: e.target.value })}
              placeholder="例: 4"
              style={{ ...S.input, width: 80 }}
            />
          )}
          {row?.override?.mode === "skip" && (
            <input
              type="number"
              min={1}
              value={row.override.displayAs ?? ""}
              onChange={(e) => updateOverride(slot.id, { displayAs: e.target.value })}
              placeholder="表示する回 (例: 4)"
              title="この日に表示する回数。以降の通常カウントはこの値を飛ばす。未入力なら空欄表示。"
              style={{ ...S.input, width: 130 }}
            />
          )}
          {row?.override && (
            <input
              type="text"
              placeholder="メモ"
              value={row.override.memo || ""}
              onChange={(e) => updateOverride(slot.id, { memo: e.target.value })}
              style={{ ...S.input, flex: 1, minWidth: 120 }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActionTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 4,
        border: `1px solid ${active ? "#1a1a2e" : "#ccc"}`,
        background: active ? "#1a1a2e" : "#fff",
        color: active ? "#fff" : "#333",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function CombineEditor({ slot, row, candidateHostSlots, setCombine, clearCombine }) {
  // このコマを host とし、候補から吸収するコマを選択する。
  const absorbedIds = row.combine?.absorbedSlotIds || [];
  const toggleAbsorbed = (otherId) => {
    const next = absorbedIds.includes(otherId)
      ? absorbedIds.filter((x) => x !== otherId)
      : [...absorbedIds, otherId];
    if (next.length === 0) {
      clearCombine(slot.id);
    } else {
      setCombine(slot.id, next);
    }
  };

  if (!candidateHostSlots || candidateHostSlots.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>
        合同可能な相手がいません
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
        このコマに吸収するコマを選択 (複数選択可):
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {candidateHostSlots.map((c) => {
          const checked = absorbedIds.includes(c.id);
          return (
            <label
              key={c.id}
              style={{
                padding: "4px 8px",
                border: `1px solid ${checked ? "#1a1a2e" : "#ccc"}`,
                background: checked ? "#e8e8f8" : "#fff",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleAbsorbed(c.id)}
                style={{ margin: 0 }}
              />
              {c.time} {c.grade}
              {c.cls && c.cls !== "-" ? c.cls : ""} {c.subj}
              {c.teacher ? ` (${c.teacher})` : ""}
            </label>
          );
        })}
      </div>
    </div>
  );
}
