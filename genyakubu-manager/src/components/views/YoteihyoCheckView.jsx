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
//   - 読めるのは高校部の予定表 (高1・高2 / 高3) だけ。中学部の予定表・
//     年間カレンダーは「未対応」と出す
//   - 講座とコマの対応を手で直した結果は、この端末に保存する (LS.yoteihyoMapping)
//   - 読み込んだ予定表は App が持つ (session)。休講日の画面へ移って戻っても
//     読み直さずに済むように。ファイルの中身は端末に保存しない
//   - 印刷はトップバーの 🖨 (popup 系統)。紙面に載せるのは食い違う日の一覧と
//     予定表の点検だけで、操作部は no-print。印刷ジョブ名は data-print-title

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LS } from "../../constants/storageKeys";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
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
import { MAPPING_PROBLEMS, effectiveMapping, suggestMapping } from "../../utils/yoteihyo/courseMapping";
import {
  applyFixes,
  buildDayPlans,
  compareSchedules,
  newCancelsFor,
  newHolidaysFor,
} from "../../utils/yoteihyo/compare";
import { courseLabel, dateLabel } from "../../utils/yoteihyo/labels";
import { SheetList } from "./yoteihyo/SheetList";
import { MappingPanel } from "./yoteihyo/MappingPanel";
import { DayPlanCard } from "./yoteihyo/DayPlanCard";
import { WARN_TEXT } from "./yoteihyo/styles";

const panel = { ...S.panel, padding: 14, marginBottom: 16 };
const h2 = { fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: colors.ink };
const note = { fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: 0 };
const warnNote = { ...note, color: WARN_TEXT };

const NO_SELECTION = new Set();

function shortRange(r) {
  const f = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return `${f(r.start)}〜${f(r.end)}`;
}

// 読み込んだ予定表 ({ fileName, sheets, selected, loadId, onlyUpcoming }) は
// App が持つ。props が無いとき (テストなど) はこの画面で持つ
function useSession(session, onSessionChange) {
  const [local, setLocal] = useState(null);
  return onSessionChange ? [session ?? null, onSessionChange] : [local, setLocal];
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
  session: sessionProp,
  onSessionChange,
  onOpenDayReschedule,
  onEditHoliday,
  onOpenTimetableManager,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const today = useToday();
  const idBase = useId();
  const fileInputRef = useRef(null);
  const [session, setSession] = useSession(sessionProp, onSessionChange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [overrides, setOverrides] = useLocalStorage(LS.yoteihyoMapping, {});
  // 登録してカードが消えたあとにフォーカスを移す先 (日付 / "" = 一覧の見出し)
  const [focusTarget, setFocusTarget] = useState(null);

  const book = session?.sheets ? session : null;
  const sheets = book?.sheets ?? null;
  const selected = session?.selected ?? NO_SELECTION;
  const onlyUpcoming = !!session?.onlyUpcoming;
  const setSelected = (next) => setSession((prev) => (prev ? { ...prev, selected: next } : prev));
  const setOnlyUpcoming = (v) => setSession((prev) => (prev ? { ...prev, onlyUpcoming: v } : prev));

  const listHeadingId = `${idBase}-list`;
  const dayHeadingId = (date) => `${idBase}-day-${date}`;

  // 読み込みは後から選んだファイルが勝つ (先に選んだ方が遅れて終わっても上書きしない)
  const loadSeq = useRef(0);
  const openFile = useCallback(
    async (file) => {
      if (!file) return;
      const seq = ++loadSeq.current;
      setLoading(true);
      setError("");
      try {
        const sheets = analyzeWorkbook(await readWorkbookFile(file));
        if (seq !== loadSeq.current) return;
        setSession((prev) => ({
          fileName: file.name,
          sheets,
          selected: defaultSheetSelection(sheets, today),
          loadId: (prev?.loadId || 0) + 1,
          onlyUpcoming: !!prev?.onlyUpcoming,
        }));
      } catch (err) {
        if (seq !== loadSeq.current) return;
        console.warn("[yoteihyo] 読み込みに失敗", err);
        // 前に読み込んだ結果は消さない (読み込めなかったファイルだけ知らせる)
        setError(`「${file.name}」を読み込めませんでした: ${err?.message || "原因が分かりません"}`);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [today, setSession]
  );

  // 「今日以降だけ」の切り替えでは作り直さない (シートと選択だけで決まる)
  const merged = useMemo(() => {
    if (!sheets) return null;
    const list = selectedInMergeOrder(sheets, selected).map((s) => ({ name: s.name, parsed: s.parsed }));
    return list.length ? mergeHighSchoolSheets(list) : null;
  }, [sheets, selected]);

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
    () => (sheets ? overlappingSelections(sheets, selected) : []),
    [sheets, selected]
  );

  const visiblePlans = onlyUpcoming ? plans.filter((p) => p.date >= today) : plans;
  const fixable = visiblePlans.filter((p) => p.fix.holidays.length || p.fix.cancels.length);
  const upcomingCount = plans.filter((p) => p.date >= today).length;

  // 表示期間設定の外で比べていない期間 (学年の組ごとに同じ区間は 1 回だけ出す)
  const skipped = useMemo(() => {
    if (!merged || !result) return [];
    const out = new Map();
    for (const c of result.courses) {
      const course = merged.courses.get(c.key);
      if (!course) continue;
      for (const t of c.skipped) {
        const k = `${course.family}|${t.start}|${t.end}`;
        if (!out.has(k)) out.set(k, { family: course.family, ...t });
      }
    }
    return [...out.values()].sort((a, b) => a.start.localeCompare(b.start) || a.family.localeCompare(b.family));
  }, [merged, result]);
  // 比べていない講座 (コマが見つからない = 直してほしいもの と、それ以外)
  const notCompared = useMemo(() => {
    if (!merged || !result) return { problems: [], others: 0 };
    const rest = result.courses.filter((c) => c.status !== "ok");
    return {
      problems: rest.filter((c) => MAPPING_PROBLEMS.has(c.status)).map((c) => courseLabel(merged.courses.get(c.key))),
      others: rest.filter((c) => !MAPPING_PROBLEMS.has(c.status)).length,
    };
  }, [merged, result]);

  // 登録後のフォーカス: 消えたカードの次のカードの日付へ (無ければ一覧の見出し)
  useEffect(() => {
    if (focusTarget == null) return;
    const el =
      (focusTarget && document.getElementById(dayHeadingId(focusTarget))) ||
      document.getElementById(listHeadingId);
    el?.focus();
    setFocusTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 見出しの id は idBase だけで決まる
  }, [focusTarget]);

  const apply = useCallback(
    async (targetPlans, { bulk = false } = {}) => {
      if (!isAdmin) return;
      const preview = applyFixes({ holidays, adjustments, plans: targetPlans });
      if (!preview.holidays.length && !preview.adjustments.length) {
        toasts.info("登録済みです (同じ日・同じ対象の休講が既にあります)");
        return;
      }
      if (bulk) {
        const counts = [
          preview.holidays.length ? `休講日 ${preview.holidays.length} 件` : "",
          preview.adjustments.length ? `コマ休講 ${preview.adjustments.length} 件` : "",
        ]
          .filter(Boolean)
          .join("・");
        const past = targetPlans.filter((p) => p.date < today).length;
        const ok = await confirm({
          title: "直す案をまとめて登録",
          message:
            `${targetPlans.length} 日分の直す案 (${counts}) を登録します。` +
            (past ? `今日より前の日が ${past} 日含まれます (第N回の数え方が変わります)。` : "") +
            "登録した後も、休講日は「休講・テスト期間・イベント」の休講から、" +
            "コマ休講は授業管理の「時間割調整一覧」から 1 件ずつ消せます。",
          okLabel: "登録する",
        });
        if (!ok) return;
      }
      // 確認の間に他の端末で足された休講日などを古い配列で上書きしないよう、
      // 書き込む時点の配列 (updater の prev) から足す分と id を決める
      const now = new Date();
      const hIds = new Set();
      const aIds = new Set();
      if (preview.holidays.length) {
        saveHolidays((prev) => {
          const { added } = newHolidaysFor(prev, targetPlans);
          for (const h of added) hIds.add(h.id);
          return added.length ? [...prev, ...added] : prev;
        });
      }
      if (preview.adjustments.length) {
        saveAdjustments((prev) => {
          const { added } = newCancelsFor(prev, targetPlans, now);
          for (const a of added) aIds.add(a.id);
          return added.length ? [...prev, ...added] : prev;
        });
      }
      const parts = [];
      if (preview.holidays.length) parts.push(`休講日を ${preview.holidays.length} 件`);
      if (preview.adjustments.length) parts.push(`コマ休講を ${preview.adjustments.length} 件`);
      const skippedNote = preview.skipped ? ` (登録済みの ${preview.skipped} 件は足していません)` : "";
      toasts.success(`${parts.join("、")}登録しました${skippedNote}`, {
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () => {
            if (hIds.size) saveHolidays((prev) => prev.filter((h) => !hIds.has(h.id)));
            if (aIds.size) saveAdjustments((prev) => prev.filter((a) => !aIds.has(a.id)));
          },
        },
      });
      if (bulk) {
        setFocusTarget("");
      } else {
        const i = visiblePlans.findIndex((p) => p.date === targetPlans[0]?.date);
        const next = visiblePlans[i + 1] || visiblePlans[i - 1];
        setFocusTarget(next ? next.date : "");
      }
    },
    [isAdmin, holidays, adjustments, saveHolidays, saveAdjustments, toasts, confirm, today, visiblePlans]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    openFile(e.dataTransfer?.files?.[0]);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="no-print" style={panel}>
        <p style={note}>
          {"学校から届く予定表 (Excel) を読み込み、システムに登録した休講・振替と食い違う日を一覧にします。" +
            "直す案のボタンを押すまで、システムの登録は変わりません。"}
          <br />
          いま読み込めるのは<b>高校部の予定表 (高1・高2 / 高3)</b>
          {" だけです。予定表の灰色の欄は休講、空欄は授業なし、黄色の欄は変更・振替、赤い行は休校・祝日として読みます。"}
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
            border: `2px dashed ${dragOver ? colors.accentBlue : "#c8c8d0"}`,
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
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="予定表の Excel ファイル"
            onChange={(e) => {
              openFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={S.btn(true)}>
            {book ? "別の予定表を読み込む" : "予定表を読み込む"}
          </button>
          <span role="status" style={{ fontSize: 12, color: colors.inkMuted }}>
            {loading
              ? "読み込み中…"
              : book
                ? `読み込んだファイル: ${book.fileName}`
                : "または、ここに Excel ファイル (.xls / .xlsx) をドロップ"}
          </span>
        </div>
        {error && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: colors.accentRed }}>
            {error}
            {book && !loading && ` (表示しているのは「${book.fileName}」の結果です)`}
          </div>
        )}
      </div>

      {book && (
        <section className="no-print" aria-labelledby={`${idBase}-sheets`} style={panel}>
          <h2 id={`${idBase}-sheets`} style={h2}>
            使うシート
          </h2>
          <SheetList key={book.loadId} sheets={book.sheets} selected={selected} onChange={setSelected} today={today} />
          {!book.sheets.some((s) => s.kind === "high") ? (
            <p role="note" style={{ ...warnNote, marginTop: 6 }}>
              {"このファイルには、読み込める高校部の予定表のシートがありません。" +
                "中学部の予定表・年間カレンダーにはまだ対応していません。"}
            </p>
          ) : (
            !merged && (
              <p role="note" style={{ ...note, marginTop: 6 }}>
                比べるシートにチェックを入れてください。
              </p>
            )
          )}
          {overlapsSel.map(({ first, second }) => (
            <p key={`${first.index}-${second.index}`} role="note" style={{ ...warnNote, marginTop: 6 }}>
              ⚠ 「{first.name}」と「{second.name}」は期間が重なっています。重なる日は「{first.name}」を使います。
            </p>
          ))}
        </section>
      )}

      {merged && <SheetIssues key={`issues-${book.loadId}`} merged={merged} plannedIssues={plannedIssues} />}

      {merged && suggestions && (
        <MappingPanel
          key={`mapping-${book.loadId}`}
          courses={[...merged.courses.values()]}
          suggestions={suggestions}
          mapping={mapping}
          overrides={overrides || {}}
          onChangeOverrides={setOverrides}
          slots={slots}
        />
      )}

      {merged && result && (
        <section aria-labelledby={listHeadingId} style={panel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h2
              id={listHeadingId}
              tabIndex={-1}
              data-print-title={`予定表チェック ${book.fileName}`}
              style={{ ...h2, margin: 0 }}
            >
              予定表と食い違う日
            </h2>
            <span style={{ fontSize: 12, color: colors.inkMuted }}>
              {plans.length} 日 (今日以降 {upcomingCount} 日)
            </span>
            <label
              className="no-print"
              style={{ fontSize: 12, color: colors.ink, display: "flex", alignItems: "center", gap: 4 }}
            >
              <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} />
              今日以降だけ
            </label>
            {isAdmin && fixable.length > 0 && (
              <button
                type="button"
                className="no-print"
                onClick={() => apply(fixable, { bulk: true })}
                style={{ ...S.btn(true), marginLeft: "auto" }}
              >
                表示中の直す案をまとめて登録 ({fixable.length} 日)
              </button>
            )}
          </div>
          <p style={{ ...note, marginBottom: 8 }}>
            予定表「{book.fileName}」と、{dateLabel(today)} 時点のシステムの登録を比べた結果です。
          </p>
          {!isAdmin && (
            <p className="no-print" style={{ ...note, marginBottom: 8 }}>
              直す案の登録と日まるごと振替を開くには、管理者ログインが必要です (サイドバー下の「管理者ログイン」から)。
            </p>
          )}
          {result.ungroupedGrades.length > 0 && (
            <p role="note" style={{ ...warnNote, marginBottom: 8 }}>
              {`⚠ 学年「${result.ungroupedGrades.join("」「")}」は表示期間設定のどの学年グループにも入っていないため、` +
                "表示期間も終講日も効かず、休みの期間にもコマが出ます。"}
              {onOpenTimetableManager && (
                <button
                  type="button"
                  className="no-print"
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
              表示期間設定 (開始日〜終了日) の外のため比べていない期間:{" "}
              {skipped.map((t) => `${t.family} ${shortRange(t)}`).join("、")}
            </p>
          )}
          {notCompared.problems.length > 0 && (
            <p role="note" style={{ ...warnNote, marginBottom: 8 }}>
              {`⚠ システムのコマが見つからないため比べていない講座: ${notCompared.problems.join("、")}` +
                " (上の「講座とシステムのコマの対応」で選べます)"}
            </p>
          )}
          {notCompared.others > 0 && (
            <p style={{ ...note, marginBottom: 8 }}>
              {`ほかに ${notCompared.others} 講座は比べていません (比べないにした講座・授業が少なくいつもの曜日が決まらない講座)。`}
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
                headingId={dayHeadingId(plan.date)}
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
        </section>
      )}
    </div>
  );
}

// 予定表そのものの点検 (曜日が暦と合わない・予定回数と数が合わない・注記)。
// 既定では畳む (件数は見出しに出す)。結果の一覧を下へ押し下げないように
function SheetIssues({ merged, plannedIssues }) {
  const warnings = merged.warnings;
  const count = warnings.length + plannedIssues.length;
  return (
    <details style={panel}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 800, color: count ? WARN_TEXT : colors.ink }}>
        {count > 0 ? `⚠ 予定表の点検 (気になる点 ${count} 件)` : "予定表の点検 (気になる点なし)"}
      </summary>
      <div style={{ marginTop: 8 }}>
        {warnings.map((w, i) => (
          <p key={`w${i}`} style={warnNote}>
            ⚠ {w.sheet}: {w.message}
          </p>
        ))}
        {plannedIssues.map((p) => {
          const course = merged.courses.get(p.courseKey);
          return (
            <p key={`${p.sheet}|${p.courseKey}|${p.weekdays}`} style={warnNote}>
              {`⚠ ${courseLabel(course)}${p.weekdays ? ` (${[...p.weekdays].join("・")}曜)` : ""}: ` +
                `予定表に書かれた回数は ${p.planned} 回、表の印を学期全体で数えると ${p.counted} 回` +
                (p.countedInSheet !== p.counted ? ` (このシートの期間だけでは ${p.countedInSheet} 回)` : "")}
            </p>
          );
        })}
        {merged.notes.length > 0 && (
          <div style={{ marginTop: count ? 8 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>予定表の注記</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: colors.inkMuted, lineHeight: 1.7 }}>
              {merged.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {count === 0 && merged.notes.length === 0 && (
          <p style={note}>曜日は暦どおりで、予定回数も表の印の数と合っています。</p>
        )}
      </div>
    </details>
  );
}
