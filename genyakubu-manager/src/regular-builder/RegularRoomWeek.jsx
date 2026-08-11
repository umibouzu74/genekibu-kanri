import { useMemo } from "react";
import { computeRoomWeek, formatMinutes } from "./teacherLoad";
import { DAY_COLOR } from "../constants/colors";
import { UI } from "./ui";

// ─── 👁 教室の週間ミニビュー ────────────────────────────────────────
// 講師の週間ミニビュー (RegularTeacherWeek) と対になる教室版。強調表示で
// 教室を選んでいる間、その教室が週のいつ塞がっているかを一覧する
// (= 空いている時間帯が見える)。ハイライトは表示中の曜日しか光らないため、
// 「木曜の 19 時台は空いているか」は週で見ないと分からない。
// 各エントリはクリックで該当セルへジャンプする。

export function RegularRoomWeek({ project, room, onJump }) {
  const week = useMemo(() => computeRoomWeek(project, room), [project, room]);

  return (
    <div className={`no-print ${UI.panel} text-xs`}>
      <div className={UI.panelHead}>
        👁 教室 {room} の週間（計 {week.total} コマ
        {week.totalMinutes > 0 ? `・${formatMinutes(week.totalMinutes)}` : ""}）
      </div>
      {week.total === 0 ? (
        <div className="text-builder-ink-subtle">
          この教室のコマがありません（列の既定教室・セルの教室のどちらにも一致しません）。
        </div>
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
                    {entries.length
                      ? `${entries.length} コマ${
                          week.minutesByDay[d] > 0
                            ? `・${formatMinutes(week.minutesByDay[d])}`
                            : ""
                        }`
                      : "空き"}
                  </span>
                </div>
                {entries.map((e) => (
                  <button
                    key={e.ref}
                    type="button"
                    onClick={() => onJump([e.ref], d)}
                    title={
                      e.overlap
                        ? "同じ教室・同じ時間帯に別のコマがあります（クリックで該当セルへ移動）"
                        : "クリックで該当セルへ移動"
                    }
                    className={`block w-full text-left border-0 bg-transparent cursor-pointer px-1 py-0.5 rounded hover:bg-builder-info-soft whitespace-nowrap ${
                      e.overlap ? "text-builder-red" : "text-builder-ink"
                    }`}
                  >
                    {e.overlap && <span aria-label="教室重複">⚠️ </span>}
                    <span className="text-builder-ink-muted tabular-nums">
                      {e.time || e.periodLabel}
                    </span>{" "}
                    {e.tabName} {e.clsLabel} <b>{e.subj}</b>
                    {e.teacher && (
                      <span className="text-builder-blue"> {e.teacher}</span>
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
