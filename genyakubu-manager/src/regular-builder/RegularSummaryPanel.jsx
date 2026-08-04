import { useMemo } from "react";
import { computeTeacherLoad } from "./teacherLoad";
import { DAY_COLOR } from "../constants/colors";
import { UI } from "./ui";

// ─── 📊 集計パネル (講師 × 曜日のコマ数) ────────────────────────────
// 講習ビルダーの集計パネルに相当。通常時間割は講師の週バランスを見ながら
// 組むため、曜日別 + 週計を一覧する。上限 (講師マスタの maxPerDay /
// maxPerWeek) の超過は赤字で警告するが、入力は妨げない。

const CELL =
  "border border-builder-border px-2 py-0.5 text-center tabular-nums";

export function RegularSummaryPanel({ project }) {
  const { days, rows } = useMemo(() => computeTeacherLoad(project), [project]);
  const hasAny = rows.some((r) => r.total > 0);

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className={UI.panelHead}>📊 講師別コマ数（曜日 × 週計）</div>
      {rows.length === 0 ? (
        <div className="text-builder-ink-subtle">
          講師がいません。「⚙ 全体設定」で講師を登録するか、セルに講師を割り当ててください。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className={`${CELL} bg-builder-surface-alt text-left font-bold`}>
                  講師
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={`${CELL} bg-builder-surface-alt font-bold min-w-[2.5rem]`}
                    style={{ color: DAY_COLOR[d] || undefined }}
                  >
                    {d}
                  </th>
                ))}
                <th className={`${CELL} bg-builder-surface-alt font-bold`}>週計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className={r.total === 0 ? "opacity-40" : ""}>
                  <th scope="row" className={`${CELL} text-left font-bold whitespace-nowrap`}>
                    {r.name}
                    {!r.inMaster && (
                      <span
                        className="ml-1 font-normal text-[10px] text-builder-ink-subtle"
                        title="講師マスタに未登録 (セルの直接入力)"
                      >
                        (マスタ外)
                      </span>
                    )}
                  </th>
                  {days.map((d) => {
                    const n = r.byDay[d] || 0;
                    const over = r.overDays.includes(d);
                    return (
                      <td
                        key={d}
                        className={`${CELL} ${over ? "text-builder-red font-extrabold bg-builder-danger-soft" : ""}`}
                        title={over ? `1日上限 ${r.maxPerDay} コマを超過` : undefined}
                      >
                        {n || ""}
                        {over ? "!" : ""}
                      </td>
                    );
                  })}
                  <td
                    className={`${CELL} font-bold ${r.overWeek ? "text-builder-red bg-builder-danger-soft" : ""}`}
                    title={r.overWeek ? `週上限 ${r.maxPerWeek} コマを超過` : undefined}
                  >
                    {r.maxPerWeek != null ? `${r.total}/${r.maxPerWeek}` : r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && !hasAny && (
        <div className="text-builder-ink-subtle">
          まだ担当コマがありません。セルに講師を割り当てると集計されます。
        </div>
      )}
    </div>
  );
}
