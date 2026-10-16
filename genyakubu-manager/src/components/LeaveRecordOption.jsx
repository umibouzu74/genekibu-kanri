import { LEAVE_KINDS } from "../utils/staffLeave";

// 欠勤の登録 (複数日の欠勤登録 / 欠勤組み換えの「欠勤にする」) に添える
// 「🌴 有給・半休にも記録する」の選択。休む人に現役部 常勤 (講師の所属) が
// いるときだけ呼び出し側が出す。既定は「記録しない」— 欠勤が有給とは限らない
// (代休・出張など) ので、人事の記録を黙って作らない。
//
// kind: null = 記録しない / LEAVE_KINDS の key
export function LeaveRecordOption({ names, detail, kind, onChange, idPrefix = "leave-opt" }) {
  if (!names || names.length === 0) return null;
  const options = [{ key: null, label: "記録しない" }, ...LEAVE_KINDS];
  return (
    <div
      role="group"
      aria-labelledby={`${idPrefix}-label`}
      style={{
        border: "1px solid #b9dcc3",
        background: "#f1f9f3",
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div id={`${idPrefix}-label`} style={{ fontSize: 12, fontWeight: 800, color: "#1f6a3a" }}>
        🌴 有給・半休にも記録する
        <span style={{ fontWeight: 400, color: "#4a6a52", marginLeft: 6 }}>
          ({names.join("・")} は現役部 常勤)
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => {
          const active = kind === o.key;
          const tone = o.tone || { bg: "#fff", fg: "#555", border: "#ccc" };
          return (
            <button
              key={o.key ?? "none"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.key)}
              title={o.desc}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                background: active ? tone.fg : tone.bg,
                color: active ? "#fff" : tone.fg,
                border: `1.5px solid ${active ? tone.fg : tone.border}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {detail && <div style={{ fontSize: 11, color: "#4a6a52" }}>{detail}</div>}
    </div>
  );
}
