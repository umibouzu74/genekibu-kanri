import { useMemo, useState } from "react";
import { Modal } from "../../Modal";
import { S } from "../../../styles/common";
import { gradeColor as GC } from "../../../data";
import { colors } from "../../../styles/tokens";
import { slotsStartingBefore } from "../../../utils/slotCancel";

// ─── コマ休講ダイアログ ───────────────────────────────────────────
// 「9/19 (土) は 15:30 より前の授業だけ休講」「このコマとこのコマだけ休講」を
// **コマ単位**で登録する。休講 (Holiday) は日付 × 学年 × 科目で時刻の条件を
// 持たないので、時刻で切れる日はここから。
//
// 作るのは時間割調整 (adjustments) の `cancel` (utils/slotCancel)。既定は
// 何も選ばず、「◯◯:◯◯ より前に始まるコマを選ぶ」で一括、または 1 コマずつ
// チェックする。対象外のコマ (すでに休講 / 合同に関わる) は理由つきで畳んで
// 出す (欠勤登録ダイアログと同じ作法)。

function slotLabel(slot) {
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}

export function SlotCancelDialog({
  date,
  candidates,
  skipped = [],
  initialBefore = "",
  onSubmit,
  onClose,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [before, setBefore] = useState(initialBefore);
  const [memo, setMemo] = useState("");

  const selectedSlots = useMemo(
    () => candidates.filter((s) => selected.has(s.id)),
    [candidates, selected]
  );
  const beforeCount = useMemo(
    () => slotsStartingBefore(candidates, before).length,
    [candidates, before]
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectBefore = () => {
    const ids = slotsStartingBefore(candidates, before).map((s) => s.id);
    setSelected(new Set(ids));
  };
  const selectAll = (on) => {
    setSelected(on ? new Set(candidates.map((s) => s.id)) : new Set());
  };

  return (
    <Modal title="🚫 コマを休講にする" onClose={onClose} width="min(680px, 96vw)">
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.7 }}>
        {date} に休講にするコマを選びます。学年や科目ではなく<b>コマ単位</b>
        なので、「15:30 以降は通常どおり」のように時刻で切れる日や、1 コマだけ
        休みにする日に使います。休講にしたコマは第N回を進めず、出勤日にも
        数えません。
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label htmlFor="slot-cancel-before" style={{ fontSize: 12, fontWeight: 700 }}>
          時刻で選ぶ:
        </label>
        <input
          id="slot-cancel-before"
          type="time"
          value={before}
          onChange={(e) => setBefore(e.target.value)}
          style={{ ...S.input, width: "auto" }}
        />
        <button
          type="button"
          onClick={selectBefore}
          disabled={!before}
          title="この時刻より前に始まるコマだけにチェックを付け直します (以降のコマは通常どおり)"
          style={{
            ...S.btn(false),
            fontSize: 12,
            cursor: before ? "pointer" : "not-allowed",
            color: before ? undefined : "#aaa",
          }}
        >
          より前に始まるコマを選ぶ{before ? ` (${beforeCount} コマ)` : ""}
        </button>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => selectAll(true)}
            style={{ ...S.btn(false), fontSize: 10, padding: "2px 8px" }}
          >
            全部選ぶ
          </button>
          <button
            type="button"
            onClick={() => selectAll(false)}
            style={{ ...S.btn(false), fontSize: 10, padding: "2px 8px" }}
          >
            全部外す
          </button>
        </span>
      </div>

      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888", padding: "12px 0" }}>
          休講にできるコマがありません。
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 12,
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {candidates.map((slot) => {
            const gc = GC(slot.grade);
            const checked = selected.has(slot.id);
            return (
              <label
                key={slot.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  background: checked ? "#fdf1f1" : "#fff",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(slot.id)} />
                <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                  {slot.time}
                </span>
                <span
                  style={{
                    background: gc.b,
                    color: gc.f,
                    borderRadius: 3,
                    padding: "0 5px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {slot.grade}
                  {slot.cls && slot.cls !== "-" ? slot.cls : ""}
                </span>
                <span style={{ fontSize: 12 }}>{slot.subj}</span>
                <span style={{ fontSize: 11, color: "#666" }}>{slot.teacher}</span>
                {slot.room && <span style={{ fontSize: 10, color: "#888" }}>{slot.room}</span>}
              </label>
            );
          })}
        </div>
      )}

      {skipped.length > 0 && (
        <details style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
          <summary style={{ cursor: "pointer" }}>
            対象外のコマ {skipped.length} 件 (ここでは休講にしないもの)
          </summary>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {skipped.map((x, i) => (
              <li key={i}>
                {x.slot.time} {slotLabel(x.slot)} —{" "}
                <span style={{ color: "#a06010" }}>{x.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label htmlFor="slot-cancel-memo" style={{ fontSize: 12, fontWeight: 700 }}>
          理由メモ:
        </label>
        <input
          id="slot-cancel-memo"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="学校行事 / 台風 など (任意。全件に同じメモ)"
          style={{ ...S.input, flex: 1 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={S.btn(false)}>
          キャンセル
        </button>
        <button
          type="button"
          disabled={selectedSlots.length === 0}
          onClick={() => onSubmit(selectedSlots, memo.trim())}
          style={{
            ...S.btn(true),
            cursor: selectedSlots.length === 0 ? "not-allowed" : "pointer",
            background: selectedSlots.length === 0 ? "#ccc" : colors.danger,
            borderColor: selectedSlots.length === 0 ? "#ccc" : colors.danger,
          }}
        >
          {selectedSlots.length} コマを休講にする
        </button>
      </div>
    </Modal>
  );
}
