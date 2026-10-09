// 予定表のブックに入っているシートの一覧。比べるのに使うシートを選ぶ。
// 読めるのは高校部の予定表だけ (中学部・カレンダーは名前と「未対応」だけ出す)。

import { useState } from "react";
import { colors } from "../../../styles/tokens";
import { fiscalYearRange } from "../../../utils/yoteihyo/sheetSelection";
import { WARN_TEXT } from "./styles";

const KIND_LABEL = {
  middle: "中学部 (未対応)",
  calendar: "年間カレンダー (未対応)",
  unreadable: "高校部 (表の形が読めません)",
  unknown: "予定表として読めません",
};

// 同じ年の期間は 2 つ目の年を省く (「2026/10/1〜12/31」)
function shortRange(r) {
  const [y1, m1, d1] = r.start.split("-").map(Number);
  const [y2, m2, d2] = r.end.split("-").map(Number);
  return y1 === y2 ? `${y1}/${m1}/${d1}〜${m2}/${d2}` : `${y1}/${m1}/${d1}〜${y2}/${m2}/${d2}`;
}

const td = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 12, verticalAlign: "top" };

function SheetTable({ sheets, selected, onToggle }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["使う", "シート", "種類", "期間"].map((h) => (
              <th
                key={h}
                scope="col"
                style={{ ...td, textAlign: "left", fontWeight: 700, color: colors.ink, background: "#f5f5f7" }}
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
              <tr key={s.index} style={{ opacity: usable ? 1 : 0.7 }}>
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.index)}
                    disabled={!usable}
                    onChange={() => onToggle(s.index)}
                    aria-label={`「${s.name}」を使う`}
                  />
                </td>
                <td style={{ ...td, fontWeight: selected.has(s.index) ? 700 : 400 }}>
                  {s.name}
                  {p?.warnings?.length > 0 && (
                    <div style={{ color: WARN_TEXT, fontWeight: 400 }}>⚠ {p.warnings[0].message}</div>
                  )}
                </td>
                <td style={td}>{usable ? `高校部 ${p.grades.join("・")}` : KIND_LABEL[s.kind] || s.kind}</td>
                <td style={td}>{p ? shortRange(p.range) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 学校のブックには前の年度のシートが何枚も残っている。今年度以外の高校部の
// シートは畳んでおく。分け方は年度だけで決め、チェックで表をまたいで動かさない
// (動かすとフォーカスが消える)。今年度以外のシートを使っているときは件数を
// 見出しに出す (畳んだ中で選ばれたままにしない)
export function SheetList({ sheets, selected, onChange, today }) {
  const toggle = (index) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange(next);
  };
  const fy = fiscalYearRange(today);
  const isOld = (s) => s.kind === "high" && (s.parsed.range.end < fy.start || s.parsed.range.start > fy.end);
  const current = sheets.filter((s) => !isOld(s));
  const old = sheets.filter(isOld);
  const oldSelected = old.filter((s) => selected.has(s.index)).length;
  const [oldOpen, setOldOpen] = useState(() => oldSelected > 0);
  return (
    <>
      <SheetTable sheets={current} selected={selected} onToggle={toggle} />
      {old.length > 0 && (
        <details style={{ marginTop: 8 }} open={oldOpen} onToggle={(e) => setOldOpen(e.currentTarget.open)}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: colors.inkMuted }}>
            今年度以外のシート ({old.length} 枚{oldSelected ? `、うち ${oldSelected} 枚を使う` : ""})
          </summary>
          <div style={{ marginTop: 6 }}>
            <SheetTable sheets={old} selected={selected} onToggle={toggle} />
          </div>
        </details>
      )}
    </>
  );
}
