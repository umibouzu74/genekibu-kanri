// 予定表のブックに入っているシートの一覧。照合に使うシートを選ぶ。
// 読めるのは高校部の予定表だけ (中学部・カレンダーは名前と「未対応」だけ出す)。

import { fiscalYearRange } from "../../../utils/yoteihyo/sheetSelection";

const KIND_LABEL = {
  middle: "中学部 (この版では未対応)",
  calendar: "年間カレンダー (この版では未対応)",
  unknown: "読めない形",
};

function shortRange(r) {
  const f = (d) => `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return `${f(r.start)} 〜 ${f(r.end)}`;
}

const td = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 12, verticalAlign: "top" };

function SheetTable({ sheets, selected, onToggle }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
        <thead>
          <tr>
            {["使う", "シート", "種類", "期間"].map((h) => (
              <th
                key={h}
                scope="col"
                style={{ ...td, textAlign: "left", fontWeight: 700, color: "#444", background: "#f5f5f7" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => {
            const usable = s.kind === "high";
            const p = s.parsed;
            return (
              <tr key={s.index} style={{ opacity: usable ? 1 : 0.6 }}>
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.index)}
                    disabled={!usable}
                    onChange={() => onToggle(s.index)}
                    aria-label={`「${s.name}」を照合に使う`}
                  />
                </td>
                <td style={{ ...td, fontWeight: selected.has(s.index) ? 700 : 400 }}>
                  {s.name}
                  {p?.warnings?.length > 0 && (
                    <div style={{ color: "#a05000", fontWeight: 400 }}>⚠ {p.warnings[0].message}</div>
                  )}
                </td>
                <td style={td}>{usable ? `高校部 ${p.grades.join("・")}` : KIND_LABEL[s.kind] || s.kind}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{p ? shortRange(p.range) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 学校のブックには前の年度のシートが何枚も残っている。今年度に掛からない
// (選んでいない) 高校部のシートは畳んでおく
export function SheetList({ sheets, selected, onChange, today }) {
  const toggle = (index) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange(next);
  };
  const fy = fiscalYearRange(today);
  const isOld = (s) =>
    s.kind === "high" && !selected.has(s.index) && (s.parsed.range.end < fy.start || s.parsed.range.start > fy.end);
  const current = sheets.filter((s) => !isOld(s));
  const old = sheets.filter(isOld);
  return (
    <>
      <SheetTable sheets={current} selected={selected} onToggle={toggle} />
      {old.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#555" }}>
            今年度に掛からないシート ({old.length} 枚)
          </summary>
          <div style={{ marginTop: 6 }}>
            <SheetTable sheets={old} selected={selected} onToggle={toggle} />
          </div>
        </details>
      )}
    </>
  );
}
