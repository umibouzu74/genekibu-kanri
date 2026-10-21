import { useMemo, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { useToasts } from "../../hooks/useToasts";
import { useRemoveManyWithUndo, useRemoveWithUndo } from "../../hooks/useCrudResource";
import { MonthNav } from "../MonthNav";
import { PrintButton } from "../PrintButton";
import { nextNumericId } from "../../utils/schema";
import { formatDateRange } from "../../utils/dateHelpers";
import {
  fiscalYearStartYm,
  genyakuEntries,
  monthRange,
  monthsFrom,
  shiftYm,
  spreadByDate,
  yobikoDayMarks,
  yobikoEntries,
} from "../../utils/yearCalendar";
import {
  yobikoEventLabel,
  yobikoEventsToTsv,
  yobikoSources,
} from "../../utils/yobikoEvents";
import {
  YEAR_CAL_LANES,
  YOBIKO_EVENT_KINDS,
  yobikoKindMeta,
} from "../../constants/yobikoEvents";
import { EVENT_KIND, EXAM_META, HOLIDAY_META } from "../../constants/eventKinds";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
import { YearCalendarMonth } from "./yearCalendar/YearCalendarMonth";
import { YobikoEventDialog } from "./yearCalendar/YobikoEventDialog";
import { YobikoBulkImportDialog } from "./yearCalendar/YobikoBulkImportDialog";

// 年間カレンダー: 1 日の欄を上 = 予備校部 / 線 / 下 = 現役部 に分けて、両方の
// 予定を 1 枚で見る (2026-10-21)。予備校部の予定は utils/yobikoEvents
// (この画面だけが読む)、現役部は休講・テスト期間・特別イベントを読むだけ。
//
// 期間は 1 / 3 / 6 か月と年度 (4 月〜3 月)。印刷は PrintButton (window.print)
// 系統で、1 か月 = 1 ページ (2 か月目から改ページ)。
//
// 予備校部の予定の登録・編集・削除は管理者だけ。削除は cascade が無いので
// removeWithUndo。現役部の記録はクリックで「休講・テスト期間・イベント」の
// 編集へ (イベントカレンダーと同じ導線)。

export const SS_YEAR_CAL_KEY = "genyakubu:yearCalendar";
const COUNT_OPTIONS = [1, 3, 6, 12];
const DEFAULT_COUNT = 3;

function loadViewState(todayYm) {
  const fallback = { ym: todayYm, count: DEFAULT_COUNT, lanes: { yobiko: true, genyaku: true } };
  try {
    const raw = JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY) || "null");
    if (!raw || typeof raw !== "object") return fallback;
    const ym = typeof raw.ym === "string" && /^\d{4}-\d{2}$/.test(raw.ym) ? raw.ym : todayYm;
    const count = COUNT_OPTIONS.includes(raw.count) ? raw.count : DEFAULT_COUNT;
    const yobiko = raw.lanes?.yobiko !== false;
    const genyaku = raw.lanes?.genyaku !== false;
    return { ym, count, lanes: yobiko || genyaku ? { yobiko, genyaku } : fallback.lanes };
  } catch {
    return fallback;
  }
}

function saveViewState(state) {
  try {
    sessionStorage.setItem(SS_YEAR_CAL_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても表示はそのまま
  }
}

export function YearCalendarView({
  yobikoEvents = [],
  onSaveYobikoEvents,
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  isAdmin = false,
  // 日付の数字 → その日のダッシュボード
  onSelectDate,
  // 現役部の記録 (休講・テスト期間・特別イベント) をクリック → その編集画面
  onEditGenyakuEvent,
}) {
  const toasts = useToasts();
  const todayStr = useToday();
  const todayYm = todayStr.slice(0, 7);
  const [viewState, setViewStateRaw] = useState(() => loadViewState(todayYm));
  const setViewState = (patch) =>
    setViewStateRaw((cur) => {
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      saveViewState(next);
      return next;
    });
  const { ym, count, lanes } = viewState;

  const months = useMemo(() => monthsFrom(ym, count), [ym, count]);
  const from = monthRange(months[0]).from;
  const to = monthRange(months[months.length - 1]).to;

  const yobikoByDate = useMemo(
    () => spreadByDate(yobikoEntries(yobikoEvents), from, to),
    [yobikoEvents, from, to]
  );
  const marksByDate = useMemo(() => yobikoDayMarks(yobikoEvents, from, to), [yobikoEvents, from, to]);
  const genyakuByDate = useMemo(
    () => spreadByDate(genyakuEntries({ holidays, examPeriods, specialEvents }), from, to),
    [holidays, examPeriods, specialEvents, from, to]
  );

  // ← / → で 1 か月ずつ、t で今月から (入力中・ダイアログ中は効かない)
  const goPrev = () => setViewState((s) => ({ ym: shiftYm(s.ym, -1) }));
  const goNext = () => setViewState((s) => ({ ym: shiftYm(s.ym, 1) }));
  const goThisMonth = () => setViewState({ ym: todayYm });
  useDateKeyNav({ onPrev: goPrev, onNext: goNext, onToday: goThisMonth });

  const canEdit = isAdmin && !!onSaveYobikoEvents;
  const [dialog, setDialog] = useState(null); // { event } | { date }
  const [bulkOpen, setBulkOpen] = useState(false);
  const removeWithUndo = useRemoveWithUndo({ list: yobikoEvents, save: onSaveYobikoEvents });
  const removeManyWithUndo = useRemoveManyWithUndo({ list: yobikoEvents, save: onSaveYobikoEvents });

  const submitDialog = (event) => {
    const editId = dialog?.event?.id;
    if (editId != null) {
      onSaveYobikoEvents((prev) => prev.map((e) => (e.id === editId ? { id: editId, ...event } : e)));
      toasts.success("予備校部の予定を更新しました");
    } else {
      onSaveYobikoEvents((prev) => [...prev, { id: nextNumericId(prev), ...event }]);
      toasts.success("予備校部の予定を追加しました");
    }
    setDialog(null);
  };
  const deleteEvent = (ev) => {
    removeWithUndo(ev.id, { successMsg: `「${yobikoEventLabel(ev)}」を削除しました` });
    setDialog(null);
  };

  const [y0, m0] = months[0].split("-").map(Number);
  const [y1, m1] = months[months.length - 1].split("-").map(Number);
  const rangeLabel =
    count === 1 ? `${y0}年${m0}月` : y0 === y1 ? `${y0}年${m0}月〜${m1}月` : `${y0}年${m0}月〜${y1}年${m1}月`;
  const fiscalStart = fiscalYearStartYm(todayYm);
  const isFiscalView = count === 12 && ym.endsWith("-04");

  return (
    <div className="year-cal-view">
      <style>{YEAR_CAL_CSS}</style>
      <div
        className="no-print"
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}
      >
        <MonthNav
          year={y0}
          month={m0}
          label={rangeLabel}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goThisMonth}
          onPick={(v) => /^\d{4}-\d{2}$/.test(v) && setViewState({ ym: v })}
          isCurrent={ym === todayYm}
        />
        <div role="group" aria-label="表示する期間" style={{ display: "inline-flex", gap: 4 }}>
          {COUNT_OPTIONS.filter((n) => n !== 12).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => setViewState({ count: n })}
              style={{ ...S.btn(count === n), fontSize: 11, padding: "4px 10px" }}
            >
              {n}か月
            </button>
          ))}
          <button
            type="button"
            aria-pressed={isFiscalView}
            onClick={() => setViewState({ ym: isFiscalView ? ym : fiscalStart, count: 12 })}
            title="4 月〜3 月の 12 か月"
            style={{ ...S.btn(isFiscalView), fontSize: 11, padding: "4px 10px" }}
          >
            年度
          </button>
        </div>
        <div role="group" aria-label="表示する段" style={{ display: "inline-flex", gap: 8, fontSize: 12 }}>
          {["yobiko", "genyaku"].map((lane) => (
            <label key={lane} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={lanes[lane]}
                // 両方外すと何も出ないので、最後の 1 つは外せない
                disabled={lanes[lane] && !lanes[lane === "yobiko" ? "genyaku" : "yobiko"]}
                onChange={(e) => setViewState((s) => ({ lanes: { ...s.lanes, [lane]: e.target.checked } }))}
              />
              {YEAR_CAL_LANES[lane].label}
            </label>
          ))}
        </div>
        <PrintButton />
      </div>

      {/* 紙面だけの見出し (画面はトップバーの題と期間の操作で足りる) */}
      <h2 className="year-cal-print-title">
        {rangeLabel} (上: {YEAR_CAL_LANES.yobiko.label} / 下: {YEAR_CAL_LANES.genyaku.label})
      </h2>
      <Legend lanes={lanes} />

      {lanes.yobiko && yobikoEvents.length === 0 && (
        <div className="no-print" style={{ fontSize: 12, color: colors.inkMuted, margin: "6px 0 10px" }}>
          予備校部の予定はまだありません。
          {canEdit
            ? "下の「📋 まとめて登録」で予定表を表 (TSV) にして貼り付けるか、日付の「＋」から 1 件ずつ入れられます。"
            : "管理者が登録すると上の段に出ます。"}
        </div>
      )}

      <div className="year-cal-months">
        {months.map((m) => (
          <YearCalendarMonth
            key={m}
            ym={m}
            todayStr={todayStr}
            lanes={lanes}
            yobikoByDate={yobikoByDate}
            marksByDate={marksByDate}
            genyakuByDate={genyakuByDate}
            onSelectDate={onSelectDate}
            onAddYobiko={canEdit ? (date) => setDialog({ date }) : null}
            onEditYobiko={canEdit ? (event) => setDialog({ event }) : null}
            onEditGenyaku={
              isAdmin && onEditGenyakuEvent
                ? (it) => onEditGenyakuEvent(it.kind, it.source.id)
                : null
            }
          />
        ))}
      </div>

      {canEdit && (
        <YobikoEventPanel
          yobikoEvents={yobikoEvents}
          from={from}
          to={to}
          rangeLabel={rangeLabel}
          onAdd={() => setDialog({ date: "" })}
          onEdit={(event) => setDialog({ event })}
          onDelete={deleteEvent}
          onBulk={() => setBulkOpen(true)}
          onRemoveSource={(src) => {
            const ids = yobikoEvents.filter((e) => e.source === src).map((e) => e.id);
            removeManyWithUndo(ids, {
              successMsg: (n) => `出典「${src}」の ${n} 件を削除しました`,
            });
          }}
          onCopyTsv={async (list) => {
            try {
              await navigator.clipboard.writeText(yobikoEventsToTsv(list));
              toasts.success(`${list.length} 件を表 (TSV) としてコピーしました`);
            } catch {
              toasts.error("クリップボードにコピーできませんでした");
            }
          }}
        />
      )}

      {dialog && (
        <YobikoEventDialog
          event={dialog.event || null}
          initialDate={dialog.date || ""}
          onSubmit={submitDialog}
          onDelete={deleteEvent}
          onClose={() => setDialog(null)}
        />
      )}
      {bulkOpen && (
        <YobikoBulkImportDialog
          yobikoEvents={yobikoEvents}
          onSave={onSaveYobikoEvents}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

// 凡例 (紙面にも載せる)。予備校部は日の種別の塗り、現役部は記録の種類
function Legend({ lanes }) {
  const chip = (key, label, style) => (
    <span
      key={key}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "1px 6px",
        borderRadius: 3,
        ...style,
      }}
    >
      {label}
    </span>
  );
  return (
    <div className="year-cal-legend" style={{ display: "grid", gap: 4, margin: "4px 0 10px" }}>
      {lanes.yobiko && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <b style={{ fontSize: 11, color: YEAR_CAL_LANES.yobiko.fg, minWidth: 56 }}>
            {YEAR_CAL_LANES.yobiko.label}
          </b>
          {YOBIKO_EVENT_KINDS.filter((k) => k.dayFill).map((k) =>
            chip(k.key, k.label, {
              background: k.dayFill,
              color: k.dayFg,
              border: "1px solid rgba(0,0,0,.15)",
            })
          )}
          {chip("event", "行事", {
            background: "#e3ecf9",
            color: "#1f4e8c",
            borderLeft: "3px solid #5b85c4",
          })}
        </div>
      )}
      {lanes.genyaku && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <b style={{ fontSize: 11, color: YEAR_CAL_LANES.genyaku.fg, minWidth: 56 }}>
            {YEAR_CAL_LANES.genyaku.label}
          </b>
          {chip(EVENT_KIND.HOLIDAY, "休講", {
            background: HOLIDAY_META.bg,
            color: HOLIDAY_META.fg,
            borderLeft: `3px solid ${HOLIDAY_META.accent}`,
          })}
          {chip(EVENT_KIND.EXAM, "テスト期間", {
            background: EXAM_META.bg,
            color: EXAM_META.fg,
            borderLeft: `3px solid ${EXAM_META.accent}`,
          })}
          {chip(EVENT_KIND.SPECIAL, "特別イベント (種別の色)", {
            background: "#f2eefa",
            color: "#5a3a8e",
            borderLeft: "3px solid #8a5ec4",
          })}
        </div>
      )}
    </div>
  );
}

// 管理者だけ: 予備校部の予定の一覧 (表示中の期間) と登録の道具
function YobikoEventPanel({
  yobikoEvents,
  from,
  to,
  rangeLabel,
  onAdd,
  onEdit,
  onDelete,
  onBulk,
  onRemoveSource,
  onCopyTsv,
}) {
  const [allPeriods, setAllPeriods] = useState(false);
  const sources = useMemo(() => yobikoSources(yobikoEvents), [yobikoEvents]);
  const shown = useMemo(
    () =>
      [...yobikoEvents]
        .filter((e) => allPeriods || (e.endDate >= from && e.startDate <= to))
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id),
    [yobikoEvents, allPeriods, from, to]
  );
  return (
    <section
      className="no-print"
      aria-label="予備校部の予定の登録"
      style={{ ...S.panel, padding: 14, marginTop: 18 }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          {YEAR_CAL_LANES.yobiko.label}の予定 (登録 {yobikoEvents.length} 件)
        </h3>
        <button type="button" onClick={onAdd} style={{ ...S.btn(true), fontSize: 12, padding: "5px 12px" }}>
          ＋ 追加
        </button>
        <button type="button" onClick={onBulk} style={{ ...S.btn(false), fontSize: 12, padding: "5px 12px" }}>
          📋 まとめて登録
        </button>
        <button
          type="button"
          onClick={() => onCopyTsv(shown)}
          disabled={shown.length === 0}
          style={{ ...S.btn(false), fontSize: 12, padding: "5px 12px" }}
        >
          📄 表として書き出す (TSV をコピー)
        </button>
      </div>
      {sources.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: colors.inkMuted }}>出典:</span>
          {sources.map(({ source, count }) => (
            <span
              key={source}
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                background: "#f1f3f6",
                borderRadius: 12,
                padding: "2px 4px 2px 10px",
              }}
            >
              {source} ({count})
              <button
                type="button"
                onClick={() => onRemoveSource(source)}
                aria-label={`出典「${source}」の予定を全部削除`}
                title="この出典の予定を全部削除 (6 秒間は元に戻せます)。改訂版の予定表を入れ直すときに"
                style={{ ...S.btn(false), fontSize: 10, padding: "1px 8px", color: colors.danger }}
              >
                全部削除
              </button>
            </span>
          ))}
        </div>
      )}
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
        <input type="checkbox" checked={allPeriods} onChange={(e) => setAllPeriods(e.target.checked)} />
        表示中の期間 ({rangeLabel}) の外も出す
      </label>
      {shown.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.inkMuted }}>この期間の予備校部の予定はありません。</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                {["期間", "種別", "名称", "メモ", "出典", ""].map((h, i) => (
                  <th key={i} style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((ev) => {
                const kind = yobikoKindMeta(ev.kind);
                return (
                  <tr key={ev.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                    <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      {formatDateRange(ev.startDate, ev.endDate, { weekday: true })}
                    </td>
                    <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      {kind.dayFill && (
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            marginRight: 4,
                            background: kind.dayFill,
                            border: "1px solid rgba(0,0,0,.2)",
                            verticalAlign: "middle",
                          }}
                        />
                      )}
                      {kind.label}
                    </td>
                    <td style={{ padding: "4px 6px" }}>{yobikoEventLabel(ev)}</td>
                    <td style={{ padding: "4px 6px", color: "#666" }}>{ev.memo || ""}</td>
                    <td style={{ padding: "4px 6px", color: "#666" }}>{ev.source || ""}</td>
                    <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => onEdit(ev)}
                        style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px" }}
                      >
                        編集
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => onDelete(ev)}
                        aria-label={`「${yobikoEventLabel(ev)}」を削除`}
                        style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px", color: colors.danger }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// 表の見た目と紙面。段の間 (予備校部 / 現役部) は太い線、週の境は濃い線。
// 塗り (休校日の黒など) は紙面でも出す (print-color-adjust)
const YEAR_CAL_CSS = `
.year-cal-months { display: grid; gap: 22px; }
.year-cal-month-title { margin: 0 0 6px; font-size: 16px; font-weight: 800; }
.year-cal-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  table-layout: fixed;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.year-cal-month { overflow-x: auto; }
.year-cal-lane-col { width: 4.8em; }
.year-cal-table thead th {
  font-size: 12px;
  padding: 3px 0;
  background: #3b4a5a;
  color: #fff;
  border: 1px solid #3b4a5a;
}
.year-cal-table thead th:first-child { background: #3b4a5a; }
.year-cal-table td, .year-cal-table tbody th { border: 1px solid #d6d9de; vertical-align: top; }
.year-cal-week { break-inside: avoid; page-break-inside: avoid; }
.year-cal-daterow td, .year-cal-daterow th { border-top: 2px solid #7a8290; }
.year-cal-date { padding: 2px 4px; font-size: 12px; font-weight: 700; height: 1.6em; }
.year-cal-date-inner { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.year-cal-mark { font-size: 9px; font-weight: 600; opacity: .9; }
.year-cal-add {
  margin-left: auto; background: none; border: none; padding: 0 2px; font-size: 12px;
  color: inherit; opacity: .35; cursor: pointer; line-height: 1;
}
.year-cal-add:hover, .year-cal-add:focus-visible { opacity: 1; }
.year-cal-today { outline: 2px solid #e67a00; outline-offset: -2px; }
.year-cal-out { background: #f3f4f6; }
.year-cal-cell { padding: 2px; height: 2.2em; }
.year-cal-lane-head {
  font-size: 10px; font-weight: 700; padding: 2px; text-align: center; white-space: nowrap;
  vertical-align: middle !important; line-height: 1.25;
}
.year-cal-daterow .year-cal-lane-head { background: #fafafa; }
.year-cal-lane-genyaku td, .year-cal-lane-genyaku th { border-top: 2px solid #4a5260; }
.year-cal-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
.year-cal-print-title { display: none; }
@media print {
  .year-cal-print-title { display: block; margin: 0 0 4px; font-size: 14px; }
  .year-cal-months { display: block; }
  .year-cal-month { overflow: visible; }
  .year-cal-month + .year-cal-month { break-before: page; page-break-before: always; }
  .year-cal-table { min-width: 0; }
  .year-cal-item { font-size: 9px !important; }
  .year-cal-today { outline: none; }
}
`;
