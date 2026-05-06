import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { groupStaffBySubject } from "../utils/printStyles";
import { S } from "../styles/common";

// 月次カレンダーをバイト複数人ぶん「まとめて印刷」する選択ダイアログ。
// 教科ごとにバイトをグループ化して表示し、教科横断でチェックボックス選択する。
// 同一バイトが複数教科を担当する場合は両方のグループに出すが、選択状態は名前
// 単位で共有する (重複印刷は呼び出し側で起きない)。
//
// onPrint には選択された名前配列が渡る。busy true のあいだは閉じることも
// 操作することもできなくして、印刷準備中に state を破壊されないようにする。
export function BatchPrintDialog({
  partTimeStaff = [],
  subjects = [],
  onClose,
  onPrint,
  busy = false,
  progress = "",
}) {
  const groups = useMemo(
    () => groupStaffBySubject({ partTimeStaff, subjects }),
    [partTimeStaff, subjects]
  );
  const allNames = useMemo(() => {
    const s = new Set();
    for (const g of groups) for (const n of g.staff) s.add(n);
    return s;
  }, [groups]);

  const [selected, setSelected] = useState(() => new Set());

  const toggleOne = (name) => {
    setSelected((p) => {
      const next = new Set(p);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const setAll = (on) => {
    setSelected(on ? new Set(allNames) : new Set());
  };

  const setGroup = (group, on) => {
    setSelected((p) => {
      const next = new Set(p);
      for (const n of group.staff) {
        if (on) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  };

  const handlePrint = () => {
    const list = [...selected];
    if (list.length > 0) onPrint(list);
  };

  const total = allNames.size;
  const count = selected.size;

  return (
    <Modal
      title="月次予定をまとめて印刷"
      onClose={busy ? () => {} : onClose}
      width={560}
    >
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}
      >
        <span style={{ fontSize: 12, color: "#666", flex: 1 }}>
          {count} / {total} 名選択中
        </span>
        <button
          type="button"
          onClick={() => setAll(true)}
          style={{ ...S.btn(false), padding: "4px 10px", fontSize: 12 }}
          disabled={busy || total === 0}
        >
          全選択
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          style={{ ...S.btn(false), padding: "4px 10px", fontSize: 12 }}
          disabled={busy || count === 0}
        >
          全解除
        </button>
      </div>

      <div
        style={{
          maxHeight: 360,
          overflow: "auto",
          marginBottom: 12,
          border: "1px solid #eee",
          borderRadius: 8,
          padding: 8,
        }}
      >
        {groups.length === 0 ? (
          <div style={{ fontSize: 13, color: "#888", padding: "16px 8px" }}>
            登録されたバイトがありません。
          </div>
        ) : (
          groups.map((g) => {
            const selectedInGroup = g.staff.filter((n) =>
              selected.has(n)
            ).length;
            const allSelected =
              g.staff.length > 0 && selectedInGroup === g.staff.length;
            return (
              <fieldset
                key={g.subjectName}
                style={{
                  margin: "0 0 10px",
                  padding: "6px 10px 10px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              >
                <legend
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "0 6px",
                    color: "#444",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>
                    {g.subjectName} ({selectedInGroup} / {g.staff.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroup(g, !allSelected)}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      background: "#fff",
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                    disabled={busy}
                  >
                    {allSelected ? "解除" : "選択"}
                  </button>
                </legend>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 4,
                  }}
                >
                  {g.staff.map((name) => {
                    const on = selected.has(name);
                    return (
                      <label
                        key={name}
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          fontSize: 13,
                          padding: "4px 6px",
                          borderRadius: 4,
                          cursor: busy ? "not-allowed" : "pointer",
                          background: on ? "#eef" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleOne(name)}
                          disabled={busy}
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
        }}
      >
        {progress && (
          <span
            style={{ flex: 1, fontSize: 12, color: "#666" }}
            aria-live="polite"
          >
            {progress}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          style={S.btn(false)}
          disabled={busy}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handlePrint}
          style={S.btn(true)}
          disabled={count === 0 || busy}
        >
          {busy ? "準備中…" : `${count} 名分を印刷`}
        </button>
      </div>
    </Modal>
  );
}
