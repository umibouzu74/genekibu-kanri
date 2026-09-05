import { useMemo } from "react";
import { computeTeacherLoad, formatMinutes } from "./teacherLoad";
import { computeClassSubjectLoad } from "./classLoad";
import { formatCount } from "../utils/biweekly";
import { DAY_COLOR, gradeColor } from "../constants/colors";
import { LS } from "../constants/storageKeys";
import { usePersistedToggle } from "../hooks/usePersistedToggle";
import { UI } from "./ui";

// ─── 📊 集計パネル (講師 × 曜日 / クラス × 科目) ────────────────────
// 講習ビルダーの集計パネルに相当。通常時間割は講師の週バランスを見ながら
// 組むため、曜日別 + 週計を一覧する。学年で 1 コマの長さが違う (中学 45 分
// / 高校 60 分〜) ため、各セルはコマ数の下段に稼働時間 (時:分) を併記する。
// 上限 (講師マスタの maxPerDay / maxPerWeek) の超過は赤字で警告するが、
// 入力は妨げない。
// 下段はカリキュラム側の検算 (「中3 の数学が週 3 コマあるか」) 用の
// クラス × 科目 の週コマ数 (computeClassSubjectLoad)。

const CELL =
  "border border-builder-border px-2 py-0.5 text-center tabular-nums";

export function RegularSummaryPanel({ project }) {
  const { days, rows, untimedCount } = useMemo(
    () => computeTeacherLoad(project),
    [project]
  );
  const classLoad = useMemo(() => computeClassSubjectLoad(project), [project]);
  const hasAny = rows.some((r) => r.total > 0);
  // 時限に時刻が 1 つも入っていない段階では時間の段を出さない (0:00 の羅列
  // になるだけ)。入りはじめたら全セルに出し、未設定分は注意書きで知らせる
  const hasMinutes = rows.some((r) => r.totalMinutes > 0);
  // ⏱ 拘束・空き: 稼働時間の代わりに「拘束 (空き)」を出すモード。
  // 空きコマの多い講師を探すとき用 (明示トグルの保存で自動学習ではない)
  const [showSpan, setShowSpan] = usePersistedToggle(
    LS.regularBuilderSummarySpan,
    false
  );
  const hasGap = rows.some((r) => r.totalGap > 0);

  // 各セルの下段: 稼働時間 or 「拘束 (空き)」
  const subLine = (minutes, span, gap) =>
    showSpan
      ? `${formatMinutes(span || 0)}${gap > 0 ? ` (空${formatMinutes(gap)})` : ""}`
      : formatMinutes(minutes || 0);

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className={UI.panelHead}>
          📊 講師別コマ数・{showSpan ? "拘束時間" : "稼働時間"}（曜日 × 週計）
        </div>
        {hasMinutes && (
          <button
            type="button"
            onClick={() => setShowSpan((v) => !v)}
            title="下段を「稼働時間 (担当コマの合計)」と「拘束時間 (その日の最初のコマの開始〜最後のコマの終了) + 空き」で切り替える"
            className={UI.btnToggle(showSpan)}
          >
            ⏱ 拘束・空き
          </button>
        )}
      </div>
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
                        {/* 隔週 (0.5 重み) で端数が出るため formatCount */}
                        {n ? formatCount(n) : ""}
                        {over ? "!" : ""}
                        {n > 0 && hasMinutes && (
                          <div className="text-[10px] font-normal leading-tight text-builder-ink-muted">
                            {subLine(
                              r.minutesByDay[d],
                              r.spanByDay[d],
                              r.gapByDay[d] || 0
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={`${CELL} font-bold ${r.overWeek ? "text-builder-red bg-builder-danger-soft" : ""}`}
                    title={r.overWeek ? `週上限 ${r.maxPerWeek} コマを超過` : undefined}
                  >
                    {r.maxPerWeek != null
                      ? `${formatCount(r.total)}/${r.maxPerWeek}`
                      : formatCount(r.total)}
                    {r.total > 0 && hasMinutes && (
                      <div className="text-[10px] font-normal leading-tight text-builder-ink-muted">
                        {subLine(r.totalMinutes, r.totalSpan, r.totalGap)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMinutes && (
        <div className={UI.hint}>
          {showSpan ? (
            <>
              下段の 時:分 は拘束時間（その日の最初のコマの開始 〜 最後のコマの終了）。
              「空」はコマとコマの間の空き時間です。実際に居る時間なので隔週の重み付けはしません。
              {!hasGap && "（今は空きコマのある講師はいません）"}
            </>
          ) : (
            <>下段の 時:分 は稼働時間（時限の時刻から算出。隔週コマは 0.5 週分で算入）。</>
          )}
        </div>
      )}
      {hasMinutes && untimedCount > 0 && (
        <div className="text-[10px] text-builder-orange">
          ⚠ 時刻未設定の時限の担当コマ {untimedCount} 件は稼働時間に含まれていません（時限の時刻は「⚙
          全体設定」で設定できます）。
        </div>
      )}
      {rows.length > 0 && !hasAny && (
        <div className="text-builder-ink-subtle">
          まだ担当コマがありません。セルに講師を割り当てると集計されます。
        </div>
      )}

      {/* クラス × 科目 (カリキュラム側の検算) */}
      <div className={`${UI.panelHead} mt-1`}>📚 クラス別 科目コマ数（週計）</div>
      {classLoad.tabs.length === 0 ? (
        <div className="text-builder-ink-subtle">
          教科の入ったセルがありません。セルに教科を入れると学年ごとに集計されます。
        </div>
      ) : (
        <>
          <div className={UI.hint}>
            教科の入ったセルだけを数えます。合同（結合）コマは合同クラスの行に数えます。
          </div>
          <div className="flex gap-4 flex-wrap items-start">
            {classLoad.tabs.map((t) => {
              const gc = gradeColor(t.grade || t.tabName);
              return (
                <div key={t.tabId} className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th
                          className={`${CELL} text-left font-extrabold whitespace-nowrap`}
                          style={{ background: gc.b, color: gc.f }}
                        >
                          {t.tabName}
                        </th>
                        {t.subjects.map((s) => (
                          <th
                            key={s}
                            className={`${CELL} bg-builder-surface-alt font-bold min-w-[2.5rem]`}
                          >
                            {s}
                          </th>
                        ))}
                        <th className={`${CELL} bg-builder-surface-alt font-bold`}>
                          週計
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((r) => (
                        <tr
                          key={r.classId}
                          className={r.total === 0 ? "opacity-40" : ""}
                        >
                          <th
                            scope="row"
                            className={`${CELL} text-left font-bold whitespace-nowrap`}
                          >
                            {r.label}
                          </th>
                          {t.subjects.map((s) => (
                            <td key={s} className={CELL}>
                              {r.bySubj[s] || ""}
                            </td>
                          ))}
                          <td className={`${CELL} font-bold`}>{r.total}</td>
                        </tr>
                      ))}
                      {t.rows.length > 1 && (
                        <tr>
                          <th
                            scope="row"
                            className={`${CELL} text-left font-bold bg-builder-surface-alt`}
                          >
                            計
                          </th>
                          {t.subjects.map((s) => (
                            <td
                              key={s}
                              className={`${CELL} font-bold bg-builder-surface-alt`}
                            >
                              {t.subjTotals[s] || ""}
                            </td>
                          ))}
                          <td className={`${CELL} font-bold bg-builder-surface-alt`}>
                            {t.total}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
