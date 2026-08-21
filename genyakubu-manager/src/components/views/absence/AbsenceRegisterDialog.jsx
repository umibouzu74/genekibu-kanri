import { useMemo, useState } from "react";
import { Modal } from "../../Modal";
import { S } from "../../../styles/common";
import { gradeColor as GC } from "../../../data";
import { colors } from "../../../styles/tokens";

// ─── 欠勤登録ダイアログ ────────────────────────────────────────
// 「香川と福江が 9/5 は欠勤」を **(コマ, 講師) の組** で登録する。
// 1 コマを 3 人で担当するプレップのようなコマがあるので、コマ単位では
// なく組単位。既定は全選択で、来られるコマだけチェックを外す
// (川井は本校の内申対策には来るがプレップには来ない、のようなケース)。
//
// 作るのは代行者が空の代行レコード。代行を探すか (代行未定) 探さずに
// 残りの担当者で回すか (代行なし) をここで選ぶ。
// 対象外のコマは理由つきで畳んで出す (日まるごと振替と同じ作法)。

function slotLabel(slot) {
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}

export function AbsenceRegisterDialog({ date, targets, skipped = [], onSubmit, onClose }) {
  // key = "slotId|teacher"。既定は全部にチェック。
  const keyOf = (t) => `${t.slotId}|${t.teacher}`;
  const [excluded, setExcluded] = useState(() => new Set());
  const [mode, setMode] = useState("pending"); // pending = 代行を探す / nosub = 代行なし

  const byTeacher = useMemo(() => {
    const m = new Map();
    for (const t of targets) {
      if (!m.has(t.teacher)) m.set(t.teacher, []);
      m.get(t.teacher).push(t);
    }
    return [...m.entries()];
  }, [targets]);

  const selected = targets.filter((t) => !excluded.has(keyOf(t)));

  const toggle = (t) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      const k = keyOf(t);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleTeacher = (teacher, on) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const t of targets) {
        if (t.teacher !== teacher) continue;
        if (on) next.delete(keyOf(t));
        else next.add(keyOf(t));
      }
      return next;
    });
  };

  return (
    <Modal title="❗ 欠勤を登録" onClose={onClose} width="min(680px, 96vw)">
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.7 }}>
        {date} に休むコマを選んで登録します。1 コマを複数人で担当するコマ
        (プレップ等) は<b>講師ごと</b>に登録するので、休む人だけにチェックを
        付けてください。来られるコマはチェックを外します。
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
        <span style={{ fontSize: 12, fontWeight: 700 }}>代行:</span>
        {[
          { key: "pending", label: "これから探す (代行未定)", hint: "代行が決まるまで依頼中として残ります" },
          {
            key: "nosub",
            label: "代行なし (残りの担当者で回す)",
            hint: "代行を探さない。代行未定の一覧には出しません",
          },
        ].map((opt) => {
          const active = mode === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMode(opt.key)}
              title={opt.hint}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                background: active ? "#1a1a2e" : "#f5f5f5",
                color: active ? "#fff" : "#888",
                border: `2px solid ${active ? "#1a1a2e" : "#e0e0e0"}`,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {targets.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888", padding: "12px 0" }}>
          登録できるコマがありません。
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {byTeacher.map(([teacher, list]) => {
            const on = list.filter((t) => !excluded.has(keyOf(t))).length;
            return (
              <div key={teacher}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "#f5f7fa",
                    borderBottom: "1px solid #e8e8ec",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <span>{teacher}</span>
                  <span style={{ fontWeight: 400, color: "#666" }}>
                    {on} / {list.length} コマ
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTeacher(teacher, on < list.length)}
                    style={{
                      ...S.btn(false),
                      marginLeft: "auto",
                      fontSize: 10,
                      padding: "2px 8px",
                      cursor: "pointer",
                    }}
                  >
                    {on < list.length ? "全部選ぶ" : "全部外す"}
                  </button>
                </div>
                {list.map((t) => {
                  const gc = GC(t.slot.grade);
                  const checked = !excluded.has(keyOf(t));
                  return (
                    <label
                      key={keyOf(t)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderBottom: "1px solid #f0f0f0",
                        cursor: "pointer",
                        opacity: checked ? 1 : 0.5,
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggle(t)} />
                      <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                        {t.slot.time}
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
                        {t.slot.grade}
                        {t.slot.cls && t.slot.cls !== "-" ? t.slot.cls : ""}
                      </span>
                      <span style={{ fontSize: 12 }}>{t.slot.subj}</span>
                      <span style={{ fontSize: 11, color: "#666" }}>{t.slot.teacher}</span>
                      {t.slot.room && (
                        <span style={{ fontSize: 10, color: "#888" }}>{t.slot.room}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {skipped.length > 0 && (
        <details style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
          <summary style={{ cursor: "pointer" }}>
            対象外のコマ {skipped.length} 件 (欠勤を登録しないもの)
          </summary>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {skipped.map((x, i) => (
              <li key={i}>
                {x.slot.time} {slotLabel(x.slot)}
                {x.teacher ? ` (${x.teacher})` : ""} —{" "}
                <span style={{ color: "#a06010" }}>{x.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={S.btn(false)}>
          キャンセル
        </button>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onSubmit(selected, mode)}
          style={{
            ...S.btn(true),
            cursor: selected.length === 0 ? "not-allowed" : "pointer",
            background: selected.length === 0 ? "#ccc" : colors.danger,
            borderColor: selected.length === 0 ? "#ccc" : colors.danger,
          }}
        >
          {selected.length} 件を欠勤にする
        </button>
      </div>
    </Modal>
  );
}
