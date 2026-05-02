import { useEffect, useRef, useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";

// ─── 回数補正ポップオーバー ────────────────────────────────────
// set モード: その日の回数を value に強制
// skip モード: カウントしない (displayAs を指定すると "その値を表示 +
//              以降の通常カウントがその値を飛ばす")

function computePosition(anchorRect) {
  const popoverWidth = Math.min(300, window.innerWidth - 16);
  const popoverMaxHeight = Math.min(280, window.innerHeight - 24);
  const top = anchorRect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8)
  );
  const maxTop = window.innerHeight - popoverMaxHeight - 8;
  return {
    top: top > maxTop ? Math.max(8, anchorRect.top - popoverMaxHeight - 4) : top,
    left,
  };
}

export function SessionOverridePopover({
  anchorRect,
  initial,
  currentSessionNumber,
  onSave,
  onClear,
  onClose,
}) {
  const ref = useRef(null);
  const [mode, setMode] = useState(initial?.mode || "set");
  const [value, setValue] = useState(
    initial?.value != null ? String(initial.value) : ""
  );
  const [displayAs, setDisplayAs] = useState(
    initial?.displayAs != null ? String(initial.displayAs) : ""
  );
  const [memo, setMemo] = useState(initial?.memo || "");
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const pos = anchorRect
    ? computePosition(anchorRect)
    : { top: 100, left: 100 };

  const handleSave = () => {
    setError(null);
    if (mode === "set") {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 1) {
        setError("1 以上の数値を入力してください");
        return;
      }
      onSave({ mode: "set", value: v, memo });
    } else {
      // skip: displayAs は任意 (未入力なら回数空欄)。空白は許容、
      // 入力されたが無効 (0 以下 / 非数字) の場合は明示エラー。
      const trimmed = displayAs.trim();
      if (trimmed !== "") {
        const d = Number(trimmed);
        if (!Number.isFinite(d) || d < 1) {
          setError("表示する回数は 1 以上の数値、または未入力にしてください");
          return;
        }
        onSave({ mode: "skip", memo, displayAs: d });
      } else {
        onSave({ mode: "skip", memo });
      }
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.min(300, window.innerWidth - 16),
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,.2)",
        padding: "10px 12px",
        zIndex: 2100,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
        回数補正
        {currentSessionNumber > 0 && (
          <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>
            (通常: 第{currentSessionNumber}回)
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => {
            setMode("set");
            setError(null);
          }}
          style={{
            ...S.btn(mode === "set"),
            fontSize: 11,
            padding: "4px 10px",
          }}
        >
          回数を指定
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("skip");
            setError(null);
          }}
          style={{
            ...S.btn(mode === "skip"),
            fontSize: 11,
            padding: "4px 10px",
          }}
        >
          カウントしない
        </button>
      </div>

      {mode === "set" && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            第 何 回として扱うか
          </label>
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: 4"
            style={{ ...S.input, width: "100%" }}
          />
          <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
            以降の通常カウントはこの値 +1 から連続します
          </div>
        </div>
      )}

      {mode === "skip" && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            表示する回数 (任意)
          </label>
          <input
            type="number"
            min={1}
            value={displayAs}
            onChange={(e) => setDisplayAs(e.target.value)}
            placeholder="例: 4 (未入力なら空欄)"
            style={{ ...S.input, width: "100%" }}
          />
          <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
            値を入れるとその日は第 N 回表示。以降の通常カウントはその値を自動で飛ばします
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
          メモ
        </label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="任意"
          style={{ ...S.input, width: "100%" }}
        />
      </div>

      {error && (
        <div
          style={{
            background: "#fde8e8",
            border: "1px solid #f5c2c2",
            color: colors.danger,
            padding: "4px 8px",
            borderRadius: 4,
            marginBottom: 6,
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        {onClear && initial && (
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            style={{
              ...S.btn(false),
              fontSize: 11,
              padding: "4px 10px",
              color: colors.danger,
            }}
          >
            補正を解除
          </button>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              ...S.btn(true),
              fontSize: 11,
              padding: "4px 12px",
              background: "#2a6a9e",
              color: "#fff",
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}
