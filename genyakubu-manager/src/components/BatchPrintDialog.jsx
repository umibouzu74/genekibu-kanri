import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { groupStaffBySubject } from "../utils/printStyles";
import { S } from "../styles/common";

// 月次カレンダーをバイト複数人ぶん「まとめて印刷」する選択ダイアログ。
// 教科ごとにバイトをグループ化して表示し、教科横断でチェックボックス選択する。
// 同一バイトが複数教科を担当する場合は両方のグループに出すが、選択状態は名前
// 単位で共有する (重複印刷は呼び出し側で起きない)。
//
// onPrint には選択された名前配列が渡る。busy true のあいだは選択 UI を
// fieldset disabled でロックし、フッタの「中断」ボタンだけ反応するようにする。
// onAbort は中断ボタン押下時のコールバック (省略可、未指定時は中断ボタンを
// 出さない)。progress は { current, total, name } を期待する。
export function BatchPrintDialog({
  partTimeStaff = [],
  subjects = [],
  onClose,
  onPrint,
  onAbort,
  busy = false,
  progress = { current: 0, total: 0, name: "" },
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
      onClose={onClose}
      closeDisabled={busy}
      width={560}
    >
      {/* fieldset で busy 中の選択 UI を一括ロック (内部の input/button が
          disabled になる)。フッタの「中断」ボタンは fieldset の外に出して
          busy 中でも押せるようにする。 */}
      <fieldset
        disabled={busy}
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          opacity: busy ? 0.6 : 1,
        }}
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
            disabled={total === 0}
          >
            全選択
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            style={{ ...S.btn(false), padding: "4px 10px", fontSize: 12 }}
            disabled={count === 0}
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
                    }}
                  >
                    {g.subjectName} ({selectedInGroup} / {g.staff.length})
                  </legend>
                  {/* グループ単位の全選択/解除トグルは legend semantics を壊さないよう
                      legend の外に出す */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setGroup(g, !allSelected)}
                      style={{
                        fontSize: 11,
                        padding: "2px 10px",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                        background: "#fff",
                      }}
                    >
                      {allSelected ? "グループ解除" : "グループ選択"}
                    </button>
                  </div>
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
                            background: on ? "#eef" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleOne(name)}
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
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={S.btn(true)}
            disabled={count === 0}
          >
            {busy ? "準備中…" : `${count} 名分を印刷`}
          </button>
        </div>
      </fieldset>

      {/* busy 中の進捗表示と中断ボタン。fieldset の外に出すことで disabled
          の影響を受けず、ループ実行中でも中断ボタンが押せる。 */}
      {busy && progress.total > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            border: "1px solid #d8e0ec",
            borderRadius: 8,
            background: "#f4f7fb",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
          aria-live="polite"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 12,
              color: "#444",
            }}
          >
            <span>
              {progress.current} / {progress.total} 名分を生成中…
              {progress.name ? `（${progress.name}）` : ""}
            </span>
            {onAbort && (
              <button
                type="button"
                onClick={onAbort}
                style={{
                  ...S.btn(false),
                  padding: "4px 12px",
                  fontSize: 12,
                  background: "#fde4e4",
                  color: "#a02020",
                }}
              >
                中断
              </button>
            )}
          </div>
          <progress
            value={progress.current}
            max={progress.total}
            aria-label="一括印刷の生成進捗"
            style={{ width: "100%", height: 8 }}
          />
        </div>
      )}
    </Modal>
  );
}
