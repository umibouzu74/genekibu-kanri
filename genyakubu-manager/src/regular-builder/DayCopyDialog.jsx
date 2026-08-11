import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { REGULAR_DAYS } from "./model";
import { copyDay, describeDayCopy } from "./dayCopy";

// ─── ⧉ 曜日コピーダイアログ ─────────────────────────────────────────
// 「火曜を組んでから木曜を作る」ための曜日まるごとの複製。実行前に
// 何コマ書き込まれ、何コマ上書きされるかをその場で出す (計算は copyDay の
// dry-run — 表示と実行で同じ関数を通すのでズレない)。

export function DayCopyDialog({ project, usedDays, initialFrom, onApply, onClose }) {
  const [from, setFrom] = useState(
    initialFrom && usedDays.includes(initialFrom) ? initialFrom : usedDays[0] || ""
  );
  const [to, setTo] = useState(
    () => REGULAR_DAYS.find((d) => d !== initialFrom) || ""
  );
  const [mode, setMode] = useState("overwrite");
  const [addDay, setAddDay] = useState(false);

  const preview = useMemo(
    () => copyDay(project.tabs || [], from, to, { mode, addDay }),
    [project.tabs, from, to, mode, addDay]
  );
  const summary = describeDayCopy(preview, from, to);
  const canApply = from && to && from !== to && preview.copied > 0;

  const daySelect = (value, onChange, label, exclude) => (
    <label style={{ fontWeight: 600 }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...S.input, marginTop: 2, display: "block", minWidth: 120 }}
      >
        {REGULAR_DAYS.filter((d) => d !== exclude).map((d) => (
          <option key={d} value={d}>
            {d}曜日{usedDays.includes(d) ? "" : "（未使用）"}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal title="曜日をコピー" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <div style={{ color: "#555", lineHeight: 1.7 }}>
          コピー元の曜日のコマを、そのままコピー先の曜日へ複製します
          （コピー元は残ります）。同じ内容で回る曜日の組（火・木など）を
          作るときに使います。
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {daySelect(from, setFrom, "コピー元", to)}
          <span style={{ paddingBottom: 8, fontWeight: 700 }}>→</span>
          {daySelect(to, setTo, "コピー先", from)}
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: 16 }}>
          <label style={{ fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input
              type="radio"
              name="day-copy-mode"
              checked={mode === "overwrite"}
              onChange={() => setMode("overwrite")}
            />
            コピー先を上書きする
          </label>
          <label style={{ fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input
              type="radio"
              name="day-copy-mode"
              checked={mode === "fill"}
              onChange={() => setMode("fill")}
            />
            空いているマスだけ埋める
          </label>
        </fieldset>

        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={addDay}
            onChange={(e) => setAddDay(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            コピー先の曜日を使っていない学年にも、その曜日を追加する
            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
              新しく使いはじめる曜日へコピーするときに入れます。
              チェックが無いとその学年は対象外になります。
            </div>
          </span>
        </label>

        <div style={{ background: "#f6f8fc", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700 }}>
            {from === to ? "同じ曜日は選べません" : summary}
          </div>
          {preview.copied > 0 && (
            <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
              ロック中のコマは上書きされません。実行後は Ctrl+Z で戻せます。
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onApply({ from, to, mode, addDay })}
            disabled={!canApply}
            style={{
              ...S.btn(true),
              background: "#2a4a8e",
              opacity: canApply ? 1 : 0.5,
            }}
          >
            コピーする
          </button>
        </div>
      </div>
    </Modal>
  );
}
