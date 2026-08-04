import { useMemo } from "react";
import { computeTeacherWeek } from "./teacherLoad";
import { DAY_COLOR } from "../constants/colors";
import { UI } from "./ui";

// ─── 👁 講師の週間ミニビュー ────────────────────────────────────────
// 強調表示で講師を選んでいる間、その講師の週間 (曜日ごとの担当コマを
// 開始時刻順) を一覧する。ハイライトは表示中の曜日しか光らないため、
// 週全体のやりくりはここで見る。各エントリはクリックで該当セルへ
// ジャンプ (曜日切替 + スクロール + 一時ハイライト)。

export function RegularTeacherWeek({ project, teacher, onJump }) {
  const week = useMemo(
    () => computeTeacherWeek(project, teacher),
    [project, teacher]
  );

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className={UI.panelHead}>
        👁 {teacher} の週間（計 {week.total} コマ）
      </div>
      {week.total === 0 ? (
        <div className="text-builder-ink-subtle">担当コマがありません。</div>
      ) : (
        <div className="flex gap-4 flex-wrap items-start">
          {week.days.map((d) => {
            const entries = week.byDay[d] || [];
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
