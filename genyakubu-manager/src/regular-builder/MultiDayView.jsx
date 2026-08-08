import { DAY_BG, DAY_COLOR, gradeColor } from "../constants/colors";
import { formatPrintDateJa } from "../timetable-builder/utils/printHeader";
import { RegularGrid } from "./RegularGrid";

// ─── ◫ 曜日を並べるビュー ───────────────────────────────────────────
// 選んだ複数の曜日 (例: 火と木) の表を横に並べて一画面で同時に表示・
// 編集する。各曜日は通常の曜日ビューと同一の RegularGrid のフル表示
// (全学年・全クラス) — 「火木セットのクラスを編集しつつ、同じ曜日の
// 他学年・他コースとの講師・教室の兼ね合いも見ながら調整する」ため、
// クラスは絞らない。各曜日の中はセクションを縦 1 列に積み、中学部 →
// 高校部の順に揃える (stackSections — 左右の曜日で同じ部が横に並ぶ)。
// 並べる曜日の選択はツールバーの曜日チップ (複数
// 選択化)。「中3（火・木）」のようなコースセット (courseSets で自動
// 検出) はチップから曜日の組を一発で切り替えるショートカット。
// コマは曜日をまたいでドラッグ入替 / Ctrl+ドラッグでコピーできる
// (RegularGrid のグリッド横断 D&D)。
// 印刷は表示中の曜日を曜日ごとに改ページして刷る (regb-print-day)。

export function MultiDayView({
  project,
  /** computeCourseSets(project) の結果 (曜日の組のショートカットチップ) */
  sets,
  /** 並べて表示する曜日 (REGULAR_DAYS 順。App の multiDays) */
  days,
  /** セットチップのクリックで曜日の組をまとめて選び直す (days 配列) */
  onSelectDays,
  /** RegularGrid へそのまま渡す共有 prop (曜日ビューと同じもの) */
  gridProps,
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* セットチップ (学年チップと同じ配色)。表示中の曜日と一致する組は
          押下状態に。検出はスケジュールから自動 (courseSets.js) */}
      {sets.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-xs font-bold text-builder-ink-muted">セット:</span>
          {sets.map((s) => {
            const gc = gradeColor(s.grade || s.tabName);
            const active = s.days.join("") === days.join("");
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectDays(s.days)}
                title={`${s.days.join("・")}曜日の同時表示に切り替える（${s.label} 入力済み ${s.cellCount} コマ）`}
                className={`px-3 py-1 rounded-full border-0 cursor-pointer text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                  active ? "ring-2 ring-builder-blue" : ""
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
          <span className="text-[10px] text-builder-ink-subtle ml-1">
            曜日チップでも並べる曜日を足し外しできます。コマは曜日をまたいでドラッグ入替 / Ctrl+ドラッグでコピー
          </span>
        </div>
      )}

      {/* 画面は曜日を折り返し禁止の等幅カラム (flex-nowrap + flex-1) で
          横並びに固定する。セル編集でプルダウン分だけ表が広がっても、
          カラム幅は変わらずセクション内の横スクロールで吸収されるので、
          編集のたびに右の曜日が下へ落ちて縦一列に崩れない (最小幅
          320px を切る狭い画面ではページ側が横スクロールになる)。
          紙面は縦積み (print:block) — 改ページ (regb-print-day の
          break-before) はフレックスアイテムに効かないため、印刷時は
          コンテナごと block に戻す */}
      <div className="flex flex-nowrap items-start gap-4 print:block">
        {days.map((d) => (
          <div
            key={d}
            className="regb-print-day flex-1 min-w-[320px] flex flex-col gap-1"
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
                {project.name || "通常時間割"} — 印刷日:{" "}
                {formatPrintDateJa(new Date())}
              </span>
            </div>
            <RegularGrid {...gridProps} project={project} day={d} stackSections />
          </div>
        ))}
      </div>
    </div>
  );
}
