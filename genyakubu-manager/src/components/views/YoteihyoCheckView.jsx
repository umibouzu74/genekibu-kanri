// ─── 予定表チェック ────────────────────────────────────────────────
// 学校から届く予定表 (Excel) を読み込み、システムの休講・振替の登録と
// 食い違う日を一覧にする。読み取り・突き合わせは utils/yoteihyo:
//   - xlsReader / xlsxReader  … .xls (BIFF8) / .xlsx を読む (値・塗り・結合)
//   - highSchoolSheet         … 高校部の予定表から講座ごとの授業日を取り出す
//   - courseMapping           … 予定表の講座 → システムのコマ (学年|科目名) の推定
//   - compare                 … システムの実施判定と比べ、直す案 (休講日・コマ休講) を作る
//
// 決めごと:
//   - **自動では何も書き換えない**。食い違いと直す案を出し、人が押したときだけ
//     休講日・コマ休講を足す (6 秒の「元に戻す」つき)。新しいデータの形は作らない
//   - 予定表で授業があるのにシステムで休みになっている日は、理由 (どの休講日か
//     など) を出すだけ。休講日の削除は休講日の画面で (他の日・学年にも効くため)
//   - 振替で入る授業 (いつもの曜日以外) は、注記の「12/7(月)の振替」から
//     日まるごと振替を開く案内を出す
//   - この版で読めるのは高校部の予定表 (高1・高2 / 高3)。中学部の予定表・
//     年間カレンダーは「未対応」と出すだけ
//   - 講座とコマの対応を手で直した結果は、この端末に保存する (LS.yoteihyoMapping)

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { LS } from "../../constants/storageKeys";
import { S } from "../../styles/common";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { useToday } from "../../hooks/useToday";
import { readWorkbookFile } from "../../utils/yoteihyo/workbookFile";
import { checkPlannedCounts, mergeHighSchoolSheets } from "../../utils/yoteihyo/highSchoolSheet";
import {
  analyzeWorkbook,
  defaultSheetSelection,
  overlappingSelections,
  selectedInMergeOrder,
} from "../../utils/yoteihyo/sheetSelection";
import { effectiveMapping, suggestMapping } from "../../utils/yoteihyo/courseMapping";
import { applyFixes, buildDayPlans, compareSchedules } from "../../utils/yoteihyo/compare";
import { courseLabel } from "../../utils/yoteihyo/labels";
import { SheetList } from "./yoteihyo/SheetList";
import { MappingPanel } from "./yoteihyo/MappingPanel";
import { DayPlanCard } from "./yoteihyo/DayPlanCard";

const panel = {
  background: "#fff",
  borderRadius: 8,
  padding: 14,
  border: "1px solid #e0e0e0",
  marginBottom: 16,
};
const h3 = { fontSize: 14, fontWeight: 800, margin: "0 0 8px" };
const note = { fontSize: 12, color: "#555", lineHeight: 1.7, margin: 0 };

function shortRange(r) {
  const f = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return `${f(r.start)}〜${f(r.end)}`;
}

export function YoteihyoCheckView({
  slots = [],
  holidays = [],
  saveHolidays,
  adjustments = [],
  saveAdjustments,
  subs = [],
  examPeriods = [],
  specialEvents = [],
  displayCutoff = null,
  timetables = [],
  classSets = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  daySchedules = [],
  extraLessons = [],
  isAdmin = false,
  onOpenDayReschedule,
  onEditHoliday,
  onOpenTimetableManager,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const today = useToday();
  const fileInputId = useId();
  const fileInputRef = useRef(null);
  const [book, setBook] = useState(null); // { fileName, sheets }
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  const [overrides, setOverrides] = useLocalStorage(LS.yoteihyoMapping, {});

  const openFile = useCallback(
    async (file) => {
      if (!file) return;
      setLoading(true);
      setError("");
      try {
        const sheets = analyzeWorkbook(await readWorkbookFile(file));
        setBook({ fileName: file.name, sheets });
        setSelected(defaultSheetSelection(sheets, today));
      } catch (err) {
        console.warn("[yoteihyo] 読み込みに失敗", err);
        setBook(null);
        setError(err?.message || "読み込めませんでした");
      } finally {
        setLoading(false);
      }
    },
    [today]
  );

  const merged = useMemo(() => {
    if (!book) return null;
    const list = selectedInMergeOrder(book.sheets, selected).map((s) => ({ name: s.name, parsed: s.parsed }));
    return list.length ? mergeHighSchoolSheets(list) : null;
  }, [book, selected]);

  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    specialEvents,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });
  const sys = useMemo(
    () => ({ ctx: sessionCtx, adjustments, holidays, examPeriods, displayCutoff, timetables, extraLessons }),
    [sessionCtx, adjustments, holidays, examPeriods, displayCutoff, timetables, extraLessons]
  );

  const suggestions = useMemo(
    () => (merged ? suggestMapping(merged.courses.values(), slots) : null),
    [merged, slots]
  );
  const mapping = useMemo(
    () => (suggestions ? effectiveMapping(suggestions.byCourse, overrides || {}) : new Map()),
    [suggestions, overrides]
  );
  const result = useMemo(
    () => (merged ? compareSchedules({ merged, mapping, slots, sys }) : null),
    [merged, mapping, slots, sys]
  );
  const plans = useMemo(
    () => (result ? buildDayPlans({ findings: result.findings, merged, slots, sys, subs }) : []),
    [result, merged, slots, sys, subs]
  );
  const plannedIssues = useMemo(() => (merged ? checkPlannedCounts(merged) : []), [merged]);
  const overlapsSel = useMemo(
    () => (book ? overlappingSelections(book.sheets, selected) : []),
    [book, selected]
  );

  const visiblePlans = onlyUpcoming ? plans.filter((p) => p.date >= today) : plans;
  const fixable = visiblePlans.filter((p) => p.fix.holidays.length || p.fix.cancels.length);
  const upcomingCount = plans.filter((p) => p.date >= today).length;

  // 表示期間の外で比べていない学期 (学年の組ごとに 1 回だけ出す)
  const skipped = useMemo(() => {
    if (!merged || !result) return [];
    const out = new Map();
    for (const c of result.courses) {
      const course = merged.courses.get(c.key);
      if (!course) continue;
      for (const t of c.skippedTerms) {
        const k = `${course.family}|${t.start}|${t.end}`;
        if (!out.has(k)) out.set(k, { family: course.family, ...t });
      }
    }
    return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [merged, result]);

  const apply = useCallback(
    async (targetPlans, { askFirst = false } = {}) => {
      if (!isAdmin) return;
      const add = applyFixes({ holidays, adjustments, plans: targetPlans });
      if (!add.holidays.length && !add.adjustments.length) {
        toasts.info("登録済みです (同じ日・同じ対象の休講が既にあります)");
        return;
      }
      if (askFirst) {
        const ok = await confirm({
          title: "直す案をまとめて登録",
          message:
            `休講日 ${add.holidays.length} 件` +
            (add.adjustments.length ? `・コマ休講 ${add.adjustments.length} 件` : "") +
            " を登録します。登録した後でも、休講日の画面・時間割調整一覧から個別に消せます。",
          okLabel: "登録する",
        });
        if (!ok) return;
      }
      if (add.holidays.length) saveHolidays([...holidays, ...add.holidays]);
      if (add.adjustments.length) saveAdjustments([...adjustments, ...add.adjustments]);
      const hIds = new Set(add.holidays.map((h) => h.id));
      const aIds = new Set(add.adjustments.map((a) => a.id));
      const parts = [];
      if (hIds.size) parts.push(`休講日を ${hIds.size} 件`);
      if (aIds.size) parts.push(`コマ休講を ${aIds.size} 件`);
      toasts.success(`${parts.join("、")}登録しました`, {
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () => {
            if (hIds.size) saveHolidays((prev) => prev.filter((h) => !hIds.has(h.id)));
            if (aIds.size) saveAdjustments((prev) => prev.filter((a) => !aIds.has(a.id)));
          },
        },
      });
    },
    [isAdmin, holidays, adjustments, saveHolidays, saveAdjustments, toasts, confirm]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    openFile(e.dataTransfer?.files?.[0]);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={panel}>
        <p style={note}>
          学校から届く予定表 (Excel) を読み込み、システムの休講・振替の登録と食い違う日を一覧にします。
          直す案のボタンを押すまで、システムの登録は変わりません。
          <br />
          この版で読めるのは<b>高校部の予定表 (高1・高2 / 高3)</b> です。灰色のコマ = 休講、黄色 = 変更・振替として読みます。
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            marginTop: 12,
            padding: 16,
            border: `2px dashed ${dragOver ? "#2e6a9e" : "#c8c8d0"}`,
            borderRadius: 8,
            background: dragOver ? "#eef4fb" : "#fafafa",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="予定表の Excel ファイル"
            onChange={(e) => {
              openFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={S.btn(true)} disabled={loading}>
            {book ? "別の予定表を読む" : "予定表を選ぶ"}
          </button>
          <span style={{ fontSize: 12, color: "#666" }}>
            {loading
              ? "読み込み中…"
              : book
                ? `読み込んだファイル: ${book.fileName}`
                : "または、ここに Excel ファイル (.xls / .xlsx) をドロップ"}
          </span>
        </div>
        {error && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "#c03030" }}>
            {error}
          </div>
        )}
      </div>

      {book && (
        <div style={panel}>
          <h3 style={h3}>シート</h3>
          <SheetList sheets={book.sheets} selected={selected} onChange={setSelected} today={today} />
          {!book.sheets.some((s) => s.kind === "high") ? (
            <p role="note" style={{ ...note, color: "#a05000", marginTop: 6 }}>
              このファイルには、読める高校部の予定表のシートがありません。中学部の予定表・年間カレンダーは
              この版では未対応です。
            </p>
          ) : (
            !merged && (
              <p role="note" style={{ ...note, marginTop: 6 }}>
                照合に使うシートにチェックを入れてください。
              </p>
            )
          )}
          {overlapsSel.map(({ first, second }) => (
            <p key={`${first.index}-${second.index}`} role="note" style={{ ...note, color: "#a05000", marginTop: 6 }}>
              ⚠ 「{first.name}」と「{second.name}」は期間が重なっています。重なる日は「{first.name}」を使います。
            </p>
          ))}
        </div>
      )}

      {merged && (
        <SheetIssues merged={merged} plannedIssues={plannedIssues} />
      )}

      {merged && suggestions && (
        <MappingPanel
          courses={[...merged.courses.values()]}
          suggestions={suggestions}
          mapping={mapping}
          overrides={overrides || {}}
          onChangeOverrides={setOverrides}
          slots={slots}
        />
      )}

      {merged && result && (
        <div style={panel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <h3 style={{ ...h3, margin: 0 }}>食い違う日</h3>
            <span style={{ fontSize: 12, color: "#555" }}>
              {plans.length} 日 (今日以降 {upcomingCount} 日)
            </span>
            <label style={{ fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} />
              今日以降だけ
            </label>
            {isAdmin && fixable.length > 0 && (
              <button
                type="button"
                onClick={() => apply(fixable, { askFirst: true })}
                style={{ ...S.btn(true), marginLeft: "auto" }}
              >
                表示中の直す案をまとめて登録 ({fixable.length} 日)
              </button>
            )}
          </div>
          {!isAdmin && (
            <p style={{ ...note, marginBottom: 8 }}>直す案の登録には管理者ログインが必要です。</p>
          )}
          {result.ungroupedGrades.length > 0 && (
            <p role="note" style={{ ...note, color: "#a05000", marginBottom: 8 }}>
              ⚠ 学年「{result.ungroupedGrades.join("」「")}」は表示期間設定のどの学年グループにも入っていないため、
              開講日・終講日が効かず、休みの期間もコマが出ます。
              {onOpenTimetableManager && (
                <button
                  type="button"
                  onClick={onOpenTimetableManager}
                  style={{ ...S.btn(false), padding: "2px 8px", fontSize: 12, marginLeft: 6 }}
                >
                  時間割管理を開く
                </button>
              )}
            </p>
          )}
          {skipped.length > 0 && (
            <p style={{ ...note, marginBottom: 8 }}>
              表示期間 (開講日〜終講日) の外のため比べていない期間:{" "}
              {skipped.map((t) => `${t.family} ${shortRange(t)}`).join("、")}
            </p>
          )}
          {visiblePlans.length === 0 ? (
            <p style={{ ...note, padding: "12px 0" }}>
              {plans.length ? "今日以降の食い違いはありません。" : "食い違う日はありません。"}
            </p>
          ) : (
            visiblePlans.map((plan) => (
              <DayPlanCard
                key={plan.date}
                plan={plan}
                courses={merged.courses}
                today={today}
                isAdmin={isAdmin}
                onApply={() => apply([plan])}
                onOpenDayReschedule={onOpenDayReschedule}
                onEditHoliday={onEditHoliday}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// 予定表そのものの点検 (曜日が暦と合わない・予定回数と数が合わない・注記)
function SheetIssues({ merged, plannedIssues }) {
  const warnings = merged.warnings;
  const count = warnings.length + plannedIssues.length;
  return (
    <details style={panel} open={count > 0}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
        予定表の点検 {count > 0 ? `(気になる点 ${count} 件)` : "(気になる点なし)"}
      </summary>
      <div style={{ marginTop: 8 }}>
        {warnings.map((w, i) => (
          <p key={`w${i}`} style={{ ...note, color: "#a05000" }}>
            ⚠ {w.sheet}: {w.message}
          </p>
        ))}
        {plannedIssues.map((p) => {
          const course = merged.courses.get(p.courseKey);
          return (
            <p key={`${p.sheet}|${p.courseKey}|${p.weekdays}`} style={{ ...note, color: "#a05000" }}>
              ⚠ {courseLabel(course)}
              {p.weekdays ? ` (${p.weekdays}曜)` : ""}: 予定表の回数は {p.planned} 回、表を数えると {p.counted} 回
              {p.countedInSheet !== p.counted ? ` (このシートの期間では ${p.countedInSheet} 回)` : ""}
            </p>
          );
        })}
        {merged.notes.length > 0 && (
          <div style={{ marginTop: count ? 8 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>予定表の注記</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
              {merged.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {count === 0 && merged.notes.length === 0 && <p style={note}>曜日・予定回数とも、表と食い違いはありません。</p>}
      </div>
    </details>
  );
}

