import { useMemo } from "react";
import { DAY_BG, DAY_COLOR, gradeColor } from "../constants/colors";
import { formatPrintDateJa } from "../timetable-builder/utils/printHeader";
import { filterProjectForSet } from "./courseSets";
import { RegularGrid } from "./RegularGrid";

// ─── 🧩 セット編集ビュー ────────────────────────────────────────────
// 「中3（火・木）」「中3（水・金）」のようなコースセット (courseSets で
// 自動検出) を 1 つ選び、その曜日の表を横に並べて一画面で編集する。
// 各曜日は通常の RegularGrid をセットの学年 × クラス列に絞って表示する
// だけなので、セル編集・重複表示・複数選択・右クリック操作は曜日ビューと
// 同一。コマは曜日をまたいでドラッグ入替 / Ctrl+ドラッグでコピーできる
// (RegularGrid のグリッド横断 D&D)。
// 印刷は表示中のセットを曜日ごとに改ページして刷る (regb-print-day)。

export function CourseSetView({
  project,
  /** computeCourseSets(project) の結果 (タブ定義順 → 先頭曜日順) */
  sets,
  /** 表示中のセット (App が selectedSetKey から解決。null = セットなし) */
  activeSet,
  onSelectSet,
  /** RegularGrid へそのまま渡す共有 prop (曜日ビューと同じもの) */
  gridProps,
}) {
  const filtered = useMemo(
    () => (activeSet ? filterProjectForSet(project, activeSet) : null),
    [project, activeSet]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* セット切替チップ (学年チップと同じ配色。検出はデータから自動) */}
      <div className="no-print flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs font-bold text-builder-ink-muted">セット:</span>
        {sets.length === 0 && (
          <span className="text-xs text-builder-ink-subtle">
            表示できるセットがありません。学年チップから曜日・使う時限・クラスを設定してください。
          </span>
        )}
        {sets.map((s) => {
          const gc = gradeColor(s.grade || s.tabName);
          const selected = activeSet?.key === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectSet(s.key)}
              title={`${s.label} の ${s.days.length} 曜日を横に並べて編集（入力済み ${s.cellCount} コマ）`}
              className={`px-3 py-1 rounded-full border-0 cursor-pointer text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                selected ? "ring-2 ring-builder-blue" : ""
              }`}
              style={{ background: gc.b, color: gc.f }}
            >
              {s.label}
              <span className="text-[10px] font-normal opacity-80">
                {s.cellCount}
              </span>
            </button>
          );
        })}
        {sets.length > 0 && (
          <span className="text-[10px] text-builder-ink-subtle ml-1">
            コマは曜日をまたいでドラッグ入替 / Ctrl+ドラッグでコピーできます
          </span>
        )}
      </div>

      {activeSet && filtered && (
        /* 画面は曜日を横並び (flex)。紙面は縦積み (print:block) — 改ページ
           (regb-print-day の break-before) はフレックスアイテムに効かない
           ため、印刷時はコンテナごと block に戻す */
        <div className="flex flex-wrap items-start gap-4 print:block">
          {activeSet.days.map((d) => (
            <div
              key={d}
              className="regb-print-day flex flex-col gap-1 max-w-full"
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="text-sm font-extrabold px-2.5 py-0.5 rounded-lg"
                  style={{
                    background: DAY_BG[d] || "#ececec",
                    color: DAY_COLOR[d] || "#555555",
                  }}
                >
                  {d}曜日
                </span>
                <span className="hidden print:inline text-xs text-builder-ink-muted">
                  {project.name || "通常時間割"} — {activeSet.label} / 印刷日:{" "}
                  {formatPrintDateJa(new Date())}
                </span>
              </div>
              <RegularGrid
                {...gridProps}
                project={filtered}
                fullProject={project}
                day={d}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
