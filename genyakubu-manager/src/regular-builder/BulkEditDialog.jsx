import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { BULK_FIELDS, bulkEditCells, describeBulkEdit } from "./bulkEdit";

// ─── ✎ 選択セルの一括変更ダイアログ ─────────────────────────────────
// チェックしたフィールドだけを指定の値に揃える。空欄のまま実行すれば
// そのフィールドのクリアになる。実行前に「何コマ変わるか」を dry-run で
// 出す (表示と実行で同じ bulkEditCells を通すのでズレない)。

const PLACEHOLDER = {
  subj: "教科（空欄で消去）",
  teacher: "講師（·区切りで複数・空欄で消去）",
  room: "教室（空欄で消去 = 列の既定教室に戻す）",
  note: "備考（空欄で消去）",
};
const DATALIST = {
  subj: "regb-subjects",
  teacher: "regb-teachers",
  room: "regb-rooms",
};

export function BulkEditDialog({ tabs, refs, onApply, onClose }) {
  // { subj: {on, value}, ... }
  const [fields, setFields] = useState(() =>
    Object.fromEntries(BULK_FIELDS.map(([f]) => [f, { on: false, value: "" }]))
  );

  const patch = useMemo(() => {
    const out = {};
    for (const [f] of BULK_FIELDS) if (fields[f].on) out[f] = fields[f].value;
    return out;
  }, [fields]);

  const preview = useMemo(
    () => bulkEditCells(tabs, refs, patch),
    [tabs, refs, patch]
  );
  const hasPatch = Object.keys(patch).length > 0;
  const canApply = hasPatch && preview.changed > 0;

  const setField = (f, next) =>
    setFields((prev) => ({ ...prev, [f]: { ...prev[f], ...next } }));

  return (
    <Modal title={`選択中の ${refs.length} セルを一括変更`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <div style={{ color: "#555", lineHeight: 1.7 }}>
          チェックした項目だけを、選択中のコマすべてに同じ値で設定します。
          値を空欄にすればその項目を消せます。
          中身の無いマスとロック中のコマは対象外です。
        </div>

        {BULK_FIELDS.map(([f, label]) => (
          <div key={f} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label
              style={{
                fontWeight: 600,
                display: "inline-flex",
                gap: 4,
                alignItems: "center",
                minWidth: 72,
              }}
            >
              <input
                type="checkbox"
                checked={fields[f].on}
                onChange={(e) => setField(f, { on: e.target.checked })}
              />
              {label}
            </label>
            <input
              type="text"
              value={fields[f].value}
              disabled={!fields[f].on}
              list={DATALIST[f]}
              placeholder={PLACEHOLDER[f]}
              aria-label={`${label}に設定する値`}
              onChange={(e) => setField(f, { value: e.target.value })}
              style={{
                ...S.input,
                flex: 1,
                opacity: fields[f].on ? 1 : 0.5,
              }}
            />
          </div>
        ))}

        <div style={{ background: "#f6f8fc", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700 }}>
            {hasPatch
              ? describeBulkEdit(preview, patch).replace(
                  "変更しました",
                  "変更します"
                )
              : "変更する項目にチェックを入れてください"}
          </div>
          {canApply && (
            <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
              実行後は Ctrl+Z で戻せます。
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onApply(patch)}
            disabled={!canApply}
            style={{
              ...S.btn(true),
              background: "#2a4a8e",
              opacity: canApply ? 1 : 0.5,
            }}
          >
            変更する
          </button>
        </div>
      </div>
    </Modal>
  );
}
