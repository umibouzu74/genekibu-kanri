import { useMemo } from "react";
import { computeTeacherWeek } from "./teacherLoad";
import { formatPrintDateJa } from "../timetable-builder/utils/printHeader";
import { DAY_COLOR } from "../constants/colors";
import { UI } from "./ui";

// ─── 👁 講師の週間ミニビュー ────────────────────────────────────────
// 強調表示で講師を選んでいる間、その講師の週間 (曜日ごとの担当コマを
// 開始時刻順) を一覧する。ハイライトは表示中の曜日しか光らないため、
// 週全体のやりくりはここで見る。各エントリはクリックで該当セルへ
// ジャンプ (曜日切替 + スクロール + 一時ハイライト)。

export function RegularTeacherWeek({ project, teacher, onJump, onPrint }) {
  const week = useMemo(
    () => computeTeacherWeek(project, teacher),
    [project, teacher]
  );
  // NG (不在) だけの講師でも週間は出す (割り当てる前に不在が見えるのが目的)
  const hasNg = week.days.some((d) => (week.ngByDay[d] || []).length > 0);

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className="flex items-center gap-2">
        <div className={`${UI.panelHead} flex-1`}>
          👁 {teacher} の週間（計 {week.total} コマ）
        </div>
        {onPrint && week.total > 0 && (
          <button
            type="button"
            className={UI.btn}
            onClick={onPrint}
            title="この講師の週間時間割を印刷 (A4 縦)"
          >
            🖨 印刷
          </button>
        )}
      </div>
      {week.total === 0 && !hasNg ? (
        <div className="text-builder-ink-subtle">担当コマがありません。</div>
      ) : (
        <div className="flex gap-4 flex-wrap items-start">
          {week.days.map((d) => {
            const entries = week.byDay[d] || [];
            const ngs = week.ngByDay[d] || [];
            return (
              <div key={d} className="min-w-[11rem]">
                <div
                  className="font-bold mb-0.5"
                  style={{ color: DAY_COLOR[d] || undefined }}
                >
                  {d}曜{" "}
                  <span className="font-normal text-builder-ink-subtle">
                    {entries.length ? `${entries.length} コマ` : "－"}
                  </span>
                </div>
                {/* NG (不在) を先頭に出す — この曜日に入れられない時間帯の予告 */}
                {ngs.map((s, i) => (
                  <div
                    key={`ng-${i}`}
                    className="px-1 py-0.5 text-builder-red whitespace-nowrap"
                    title="講師マスタの NG（不在）設定です（⚙ 全体設定で変更できます）"
                  >
                    🚫 <span className="tabular-nums">{s.time || "終日"}</span> NG
                  </div>
                ))}
                {entries.map((e) => (
                  <button
                    key={e.ref}
                    type="button"
                    onClick={() => onJump([e.ref], d)}
                    title="クリックで該当セルへ移動"
                    className="block w-full text-left border-0 bg-transparent cursor-pointer px-1 py-0.5 rounded hover:bg-builder-info-soft text-builder-ink whitespace-nowrap"
                  >
                    <span className="text-builder-ink-muted tabular-nums">
                      {e.time || e.periodLabel}
                    </span>{" "}
                    {e.tabName} {e.clsLabel} <b>{e.subj}</b>
                    {e.room && (
                      <span className="text-builder-ink-subtle"> {e.room}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 印刷専用シート (講師の週間時間割) ──────────────────────────────
// 印刷中だけ描画される print 専用 DOM (画面のミニビューは no-print)。
// 曜日ごとの担当コマを表で並べる。A4 縦 1 枚想定。

export function RegularTeacherWeekPrintSheet({ project, teacher }) {
  const week = useMemo(
    () => computeTeacherWeek(project, teacher),
    [project, teacher]
  );
  return (
    <div className="hidden print:block" aria-hidden="true">
      <div className="text-lg font-bold text-builder-ink">
        {teacher} の週間時間割 — {project.name || "通常時間割"}
      </div>
      <div className="text-xs text-builder-ink-muted mb-2">
        計 {week.total} コマ / 印刷日: {formatPrintDateJa(new Date())}
      </div>
      {week.days.map((d) => {
        const entries = week.byDay[d] || [];
        const ngs = week.ngByDay[d] || [];
        if (entries.length === 0 && ngs.length === 0) return null;
        return (
          <div key={d} className="mb-2" style={{ breakInside: "avoid" }}>
            <div
              className="text-sm font-extrabold"
              style={{ color: DAY_COLOR[d] || undefined }}
            >
              {d}曜日
            </div>
            {ngs.length > 0 && (
              <div className="text-xs text-builder-red">
                🚫 NG: {ngs.map((s) => s.time || "終日").join("、")}
              </div>
            )}
            <table className="border-collapse text-xs w-full">
              <tbody>
                {entries.map((e) => (
                  <tr key={e.ref} className="border-b border-builder-border">
                    <td className="py-0.5 pr-3 whitespace-nowrap tabular-nums w-32">
                      {e.time || e.periodLabel}
                    </td>
                    <td className="py-0.5 pr-3 whitespace-nowrap">
                      {e.tabName} {e.clsLabel}
                    </td>
                    <td className="py-0.5 pr-3 font-bold">{e.subj}</td>
                    <td className="py-0.5 text-builder-ink-muted">{e.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
