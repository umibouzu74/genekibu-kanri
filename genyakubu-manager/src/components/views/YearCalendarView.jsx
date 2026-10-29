import { useMemo, useRef, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { useToasts } from "../../hooks/useToasts";
import { useRemoveManyWithUndo, useRemoveWithUndo } from "../../hooks/useCrudResource";
import { MonthNav } from "../MonthNav";
import { PrintButton } from "../PrintButton";
import { nextNumericId } from "../../utils/schema";
import { fmtMDWeekday, formatDateRange } from "../../utils/dateHelpers";
import { fiscalYearOf } from "../../utils/teacherAffiliations";
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
import { SchoolBadgeLegend } from "./yearCalendar/SchoolBadges";
import { SchoolSchedulePopover } from "./yearCalendar/SchoolSchedulePopover";
import { SchoolTimeline, SchoolTimelineLegend } from "./yearCalendar/SchoolTimeline";
import { SchoolScheduleList } from "./yearCalendar/SchoolScheduleList";
import { SCHOOL_SCHEDULE_CSS } from "./yearCalendar/schoolScheduleStyle";
import {
  SCHOOL_GRADE_FILTERS,
  buildSchoolBadges,
  describeSchoolFilter,
  normalizeSchoolFilter,
  schoolKeyOf,
  stripSchoolPrefix,
} from "../../utils/schoolSchedule";

// 年間カレンダー: 1 日の欄を上 = 予備校部 / 線 / 下 = 現役部 に分けて、両方の
// 予定を 1 枚で見る (2026-10-21)。予備校部の予定は utils/yobikoEvents
// (この画面だけが読む)、現役部は休講・テスト期間・特別イベントを読むだけ。
//
// 期間は 1 / 3 / 6 か月と年度 (4 月〜3 月)。年度の表示では ◀ / ▶ が 1 年ずつ
// 動く (前年度 / 次年度)。「年度」ボタン・まとめて登録の年度の既定は、今日では
// なく**見ている月の年度** (3 月に来年度の予定表を入れる)。
// 印刷は PrintButton (window.print) 系統で、1 か月 = 1 ページ (2 か月目から改ページ)。
// 紙の向きは既定で横 (曜日の欄が広くなり、行事の名前が折り返さない)。縦にも
// 切り替えられる (@page の size は向きだけを決め、紙の大きさは印刷ダイアログで選ぶ)。
//
// 予備校部の予定の登録・編集・削除は管理者だけ。削除は cascade が無いので
// removeWithUndo。現役部の記録はクリックで「休講・テスト期間・イベント」の
// 編集へ (イベントカレンダーと同じ導線)。
//
// 学校の考査・模試 (2026-10-22、utils/schoolSchedule): 授業を止めない学校の
// テスト期間と学校の模試は、現役部の欄の先頭に学校ごとのバッジ 1 行にまとめ
// (1 件ずつは出さない)、表示の切替「学校別」では行 = 学校のタイムラインにする。
// 絞り込み (学年・発表〜考査・模試・希望者) はバッジとタイムラインだけに効く。
// 表示・絞り込みは期間と同じく sessionStorage (使用統計は取らない)。バッジ・
// 帯を押すと内訳のポップオーバー (管理者は記録ごとに「編集」)。
//
// 紙の大きさ「A4 / B4・A3」(2026-10-29): B4・A3 は大きい紙に刷る前提で、画面も
// 同じ表示になる。字を大きくし、カレンダーはバッジの下に模試の名前・対象学年と
// 考査の範囲、学校別は札に発表・考査の日付まで出す。学校別は A4 でも模試の札と
// 学校ごとの一覧を出す (縦に余裕があるため)。紙の大きさは @page に書かない
// (印刷ダイアログで用紙を選ぶ。向きと同じ理由)。

export const SS_YEAR_CAL_KEY = "genyakubu:yearCalendar";
const COUNT_OPTIONS = [1, 3, 6, 12];
const DEFAULT_COUNT = 3;
// 印刷の向き。key は @page の size にそのまま書く
const ORIENT_OPTIONS = [
  { key: "landscape", label: "横" },
  { key: "portrait", label: "縦" },
];
const DEFAULT_ORIENT = "landscape";
// 紙の大きさ。large = B4・A3 (字を大きくし、名前・対象学年まで出す)
const PAPER_OPTIONS = [
  { key: "a4", label: "A4", title: "A4 の紙に収まる表示" },
  {
    key: "large",
    label: "B4・A3",
    title:
      "B4・A3 の紙を前提に、字を大きくして模試の名前・対象学年・考査の範囲まで出す (画面も同じ表示)。用紙は印刷ダイアログで選ぶ",
  },
];
const DEFAULT_PAPER = "a4";
// 表示: カレンダー (日ごと) / 学校別 (学校の考査・模試を学校ごとの横棒で比べる)
const DISPLAY_OPTIONS = [
  { key: "calendar", label: "カレンダー" },
  { key: "school", label: "学校別" },
];
const DEFAULT_DISPLAY = "calendar";

function loadViewState(todayYm) {
  const fallback = {
    ym: todayYm,
    count: DEFAULT_COUNT,
    lanes: { yobiko: true, genyaku: true },
    orient: DEFAULT_ORIENT,
    paper: DEFAULT_PAPER,
    display: DEFAULT_DISPLAY,
    schoolFilter: normalizeSchoolFilter(null),
  };
  try {
    const raw = JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY) || "null");
    if (!raw || typeof raw !== "object") return fallback;
    const ym = typeof raw.ym === "string" && /^\d{4}-\d{2}$/.test(raw.ym) ? raw.ym : todayYm;
    const count = COUNT_OPTIONS.includes(raw.count) ? raw.count : DEFAULT_COUNT;
    const yobiko = raw.lanes?.yobiko !== false;
    const genyaku = raw.lanes?.genyaku !== false;
    const orient = ORIENT_OPTIONS.some((o) => o.key === raw.orient) ? raw.orient : DEFAULT_ORIENT;
    const display = DISPLAY_OPTIONS.some((o) => o.key === raw.display) ? raw.display : DEFAULT_DISPLAY;
    const paper = PAPER_OPTIONS.some((o) => o.key === raw.paper) ? raw.paper : DEFAULT_PAPER;
    return {
      ym,
      count,
      lanes: yobiko || genyaku ? { yobiko, genyaku } : fallback.lanes,
      orient,
      paper,
      display,
      schoolFilter: normalizeSchoolFilter(raw.schoolFilter),
    };
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
  // 内訳のポップオーバー ({ key, x, y, title, items, opener })。期間・表示を
  // 変えたら閉じる (開いたチップが消える)
  const [popover, setPopover] = useState(null);
  const setViewState = (patch) => {
    setPopover(null);
    setViewStateRaw((cur) => {
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      saveViewState(next);
      return next;
    });
  };
  const { ym, count, lanes, orient, paper, display, schoolFilter } = viewState;
  const large = paper === "large";
  const setSchoolFilter = (patch) =>
    setViewState((s) => ({ schoolFilter: { ...s.schoolFilter, ...patch } }));

  const months = useMemo(() => monthsFrom(ym, count), [ym, count]);
  const from = monthRange(months[0]).from;
  const to = monthRange(months[months.length - 1]).to;

  const yobikoByDate = useMemo(
    () => spreadByDate(yobikoEntries(yobikoEvents), from, to),
    [yobikoEvents, from, to]
  );
  const marksByDate = useMemo(() => yobikoDayMarks(yobikoEvents, from, to), [yobikoEvents, from, to]);
  // 学校のテスト期間・模試はバッジにまとめるので、1 件ずつの記録からは外す
  const genyakuByDate = useMemo(
    () =>
      spreadByDate(
        genyakuEntries({ holidays, examPeriods, specialEvents }, { excludeSchoolBadged: true }),
        from,
        to
      ),
    [holidays, examPeriods, specialEvents, from, to]
  );
  const schoolBadgesByDate = useMemo(
    () => buildSchoolBadges({ examPeriods, specialEvents, filter: schoolFilter }, from, to),
    [examPeriods, specialEvents, schoolFilter, from, to]
  );

  const editGenyaku =
    isAdmin && onEditGenyakuEvent
      ? (kind, record) => {
          setPopover(null);
          onEditGenyakuEvent(kind === "exam" ? EVENT_KIND.EXAM : EVENT_KIND.SPECIAL, record.id);
        }
      : null;
  const togglePopover = (key, el, make) => {
    if (popover?.key === key) {
      setPopover(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setPopover({ key, x: r.left, y: r.bottom + 4, opener: el, ...make() });
  };
  const openBadge = (ds, badge, el) =>
    togglePopover(`${ds}|${badge.school}`, el, () => ({
      title: `${fmtMDWeekday(ds)} ${badge.school}`,
      items: [
        ...badge.exams.map(({ exam, state }) => ({ kind: "exam", record: exam, state, ds })),
        ...badge.mocks.map((ev) => ({ kind: "mock", record: ev })),
      ],
    }));
  const openTimelineItem = (item, el) =>
    togglePopover(`${item.kind}|${item.record.id}`, el, () => {
      const school = schoolKeyOf(item.record);
      return {
        title:
          item.kind === "exam"
            ? `${school} ${stripSchoolPrefix(item.record.name, school)}`
            : `${school} 模試`,
        items: [item],
      };
    });

  // ← / → で前後へ (12 か月の表示は 1 年ずつ)、t で今月 (12 か月の表示は今年度) から。
  // 入力中・ダイアログ中は効かない
  const step = (s) => (s.count === 12 ? 12 : 1);
  const goPrev = () => setViewState((s) => ({ ym: shiftYm(s.ym, -step(s)) }));
  const goNext = () => setViewState((s) => ({ ym: shiftYm(s.ym, step(s)) }));
  const goThisMonth = () =>
    setViewState((s) => ({ ym: s.count === 12 ? fiscalYearStartYm(todayYm) : todayYm }));
  useDateKeyNav({ onPrev: goPrev, onNext: goNext, onToday: goThisMonth });

  const canEdit = isAdmin && !!onSaveYobikoEvents;
  const [dialog, setDialog] = useState(null); // { event } | { date }
  const [bulkOpen, setBulkOpen] = useState(false);
  const removeWithUndo = useRemoveWithUndo({ list: yobikoEvents, save: onSaveYobikoEvents });
  const removeManyWithUndo = useRemoveManyWithUndo({ list: yobikoEvents, save: onSaveYobikoEvents });

  // 新しい id は、この画面を開いてから見た最大の id より後にする。消した直後に
  // 足すと消した id を使い回し、6 秒の「元に戻す」が「同じ id がある」として
  // 何もしなくなるため (removeWithUndo は最新の一覧に同じ id があれば戻さない)
  const maxIdSeen = useRef(0);
  for (const e of yobikoEvents) if (e.id > maxIdSeen.current) maxIdSeen.current = e.id;
  const allocId = (prev) => {
    const id = Math.max(nextNumericId(prev), maxIdSeen.current + 1);
    maxIdSeen.current = id;
    return id;
  };

  const submitDialog = (event) => {
    const editId = dialog?.event?.id;
    if (editId != null) {
      onSaveYobikoEvents((prev) => prev.map((e) => (e.id === editId ? { id: editId, ...event } : e)));
      toasts.success("予備校部の予定を更新しました");
    } else {
      onSaveYobikoEvents((prev) => [...prev, { id: allocId(prev), ...event }]);
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
  // 「年度」= 見ている月の年度 (今日の年度ではない)
  const fiscalStart = fiscalYearStartYm(ym);
  const isFiscalView = count === 12 && ym.endsWith("-04");
  const viewedFiscalYear = fiscalYearOf(`${ym}-01`);
  const laneCaption =
    lanes.yobiko && lanes.genyaku
      ? `上: ${YEAR_CAL_LANES.yobiko.label} / 下: ${YEAR_CAL_LANES.genyaku.label}`
      : YEAR_CAL_LANES[lanes.yobiko ? "yobiko" : "genyaku"].label;
  const isSchoolView = display === "school";
  const filterCaption = describeSchoolFilter(schoolFilter);
  // 紙面の見出しの (…) の中身。学校の予定の絞り込みは効いている表示だけに添える
  const printCaption = isSchoolView
    ? ["学校別の考査・模試", filterCaption].filter(Boolean).join(" / ")
    : [laneCaption, lanes.genyaku && filterCaption ? `学校の予定: ${filterCaption}` : ""]
        .filter(Boolean)
        .join(" / ");

  return (
    <div className={`year-cal-view${large ? " year-cal-view--large" : ""}`}>
      <style>{YEAR_CAL_CSS + SCHOOL_SCHEDULE_CSS + yearCalPageRule(orient)}</style>
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
          isCurrent={ym === (count === 12 ? fiscalYearStartYm(todayYm) : todayYm)}
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
            onClick={() => setViewState({ ym: fiscalStart, count: 12 })}
            title="見ている月の年度 (4 月〜3 月) の 12 か月。◀ / ▶ で前年度 / 次年度"
            style={{ ...S.btn(isFiscalView), fontSize: 11, padding: "4px 10px" }}
          >
            年度
          </button>
        </div>
        <div role="group" aria-label="表示" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.inkMuted }}>表示</span>
          {DISPLAY_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={display === o.key}
              onClick={() => setViewState({ display: o.key })}
              title={
                o.key === "school"
                  ? "学校の考査・模試を、行 = 学校の横棒で比べる (どの学校がいつ忙しいか)"
                  : "日ごとのカレンダー (上: 予備校部 / 下: 現役部)"
              }
              style={{ ...S.btn(display === o.key), fontSize: 11, padding: "4px 10px" }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {!isSchoolView && (
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
        )}
        {(isSchoolView || lanes.genyaku) && (
          <SchoolFilterControls filter={schoolFilter} onChange={setSchoolFilter} />
        )}
        <div role="group" aria-label="紙の大きさ" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.inkMuted }}>紙の大きさ</span>
          {PAPER_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={paper === o.key}
              onClick={() => setViewState({ paper: o.key })}
              title={o.title}
              style={{ ...S.btn(paper === o.key), fontSize: 11, padding: "4px 10px" }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="印刷の向き" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.inkMuted }}>印刷の向き</span>
          {ORIENT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={orient === o.key}
              onClick={() => setViewState({ orient: o.key })}
              title={`${o.label}向きの紙に 1 か月ずつ刷る (紙の大きさは印刷ダイアログで選ぶ)`}
              style={{ ...S.btn(orient === o.key), fontSize: 11, padding: "4px 10px" }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <PrintButton />
        {large && (
          <span style={{ flexBasis: "100%", fontSize: 11, color: colors.inkMuted }}>
            B4・A3 用の表示です。印刷するときは、印刷ダイアログの用紙サイズで B4 か A3 を選んでください。
          </span>
        )}
      </div>

      {/* 紙面だけの見出し (画面はトップバーの題と期間の操作で足りる)。トップバーの
          🖨 (popup) で刷ったときの印刷ジョブ名も data-print-title から */}
      <h2
        className="year-cal-print-title"
        data-print-title={`${isSchoolView ? "学校別の考査・模試" : "年間カレンダー"} ${rangeLabel}`}
      >
        {rangeLabel} ({printCaption})
      </h2>
      {isSchoolView ? (
        <div className="year-cal-legend" style={{ margin: "4px 0 10px" }}>
          <SchoolTimelineLegend />
        </div>
      ) : (
        <Legend lanes={lanes} showSchoolBadges={lanes.genyaku && schoolBadgesByDate.size > 0} />
      )}

      {!isSchoolView && lanes.yobiko && yobikoEvents.length === 0 && (
        <div className="no-print" style={{ fontSize: 12, color: colors.inkMuted, margin: "6px 0 10px" }}>
          予備校部の予定はまだありません。
          {canEdit
            ? "下の「📋 まとめて登録」に予定表 (1 行目が見出しの表) を貼り付けるか、日付の「＋」から 1 件ずつ入れてください。"
            : "管理者が登録すると予備校部の段に出ます。"}
        </div>
      )}

      {isSchoolView ? (
        <>
          <SchoolTimeline
            examPeriods={examPeriods}
            specialEvents={specialEvents}
            filter={schoolFilter}
            from={from}
            to={to}
            todayStr={todayStr}
            openKey={popover?.key}
            onOpen={openTimelineItem}
            large={large}
          />
          <SchoolScheduleList
            examPeriods={examPeriods}
            specialEvents={specialEvents}
            filter={schoolFilter}
            from={from}
            to={to}
            large={large}
          />
        </>
      ) : (
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
              schoolBadgesByDate={schoolBadgesByDate}
              large={large}
              openBadgeKey={popover?.key}
              onOpenBadge={openBadge}
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
      )}

      {popover && (
        <SchoolSchedulePopover
          x={popover.x}
          y={popover.y}
          title={popover.title}
          items={popover.items}
          opener={popover.opener}
          onClose={() => setPopover(null)}
          onEdit={editGenyaku}
        />
      )}

      {canEdit && !isSchoolView && (
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

      {/* 開いている間に管理者でなくなったら (別のタブでログアウト等) 閉じる */}
      {dialog && canEdit && (
        <YobikoEventDialog
          event={dialog.event || null}
          initialDate={dialog.date || ""}
          onSubmit={submitDialog}
          onDelete={deleteEvent}
          onClose={() => setDialog(null)}
        />
      )}
      {bulkOpen && canEdit && (
        <YobikoBulkImportDialog
          yobikoEvents={yobikoEvents}
          defaultFiscalYear={viewedFiscalYear}
          idFloor={maxIdSeen.current + 1}
          onSave={onSaveYobikoEvents}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

// 凡例 (紙面にも載せる)。予備校部は日の種別の塗り、現役部は記録の種類
// (学校の考査・模試のバッジがある期間はその見方も)
function Legend({ lanes, showSchoolBadges }) {
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
      {lanes.genyaku && showSchoolBadges && <SchoolBadgeLegend />}
    </div>
  );
}

// 学校の予定 (考査・模試) の絞り込み。バッジとタイムラインだけに効く
// (休講など 1 件ずつの記録には効かせない)
function SchoolFilterControls({ filter, onChange }) {
  const check = (key, label, title) => (
    <label key={key} title={title} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input type="checkbox" checked={filter[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <div
      role="group"
      aria-label="学校の予定"
      style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}
    >
      <span style={{ fontSize: 11, color: colors.inkMuted }}>学校の予定</span>
      {check("exam", "発表〜考査", "授業を休止しない学校のテスト期間 (考査発表〜考査)")}
      {check("mock", "模試", "種別「模試」の特別イベント")}
      {check("optional", "希望者・冠模試", "「希望者」タグの模試 (東大京大OP・希望者だけの小論文模試など)")}
      <span role="group" aria-label="学校の予定の学年" style={{ display: "inline-flex", gap: 2 }}>
        {SCHOOL_GRADE_FILTERS.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={filter.grade === g.key}
            onClick={() => onChange({ grade: g.key })}
            style={{ ...S.btn(filter.grade === g.key), fontSize: 11, padding: "3px 8px" }}
          >
            {g.label}
          </button>
        ))}
      </span>
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
                aria-label={`出典「${source}」の ${count} 件をまとめて削除`}
                title="この出典の予定をまとめて削除します (6 秒間は元に戻せます)。改訂版の予定表を入れ直すときに使います"
                style={{ ...S.btn(false), fontSize: 10, padding: "1px 8px", color: colors.danger }}
              >
                まとめて削除
              </button>
            </span>
          ))}
        </div>
      )}
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
        <input type="checkbox" checked={allPeriods} onChange={(e) => setAllPeriods(e.target.checked)} />
        表示中の期間 ({rangeLabel}) より前・後の予定も出す
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

// 紙の向き。この画面を開いている間だけ <style> が文書にあるので、他の画面の
// 印刷には効かない。トップバーの 🖨 (popup) で刷ったときも、本文ごと写した
// この <style> が popup の既定 (A4 縦) より後ろにあるので、こちらの向きになる。
// size は向きだけ (紙の大きさを書くと、Chrome の印刷ダイアログで用紙を選べなくなる)
function yearCalPageRule(orient) {
  const size = orient === "portrait" ? "portrait" : "landscape";
  return `\n@media print {\n  @page { size: ${size}; margin: 8mm; }\n}\n`;
}

// 表の見た目と紙面 (2026-10-29 に紙面で読みやすく)。1 日 (日付 + 2 段) を太い枠で
// 囲み、週の境は濃い線。日付と段の間は細い線、予備校部と現役部の間は点線。
// border-collapse の表では同じ太さなら実線が点線に勝つので、段の線は上下を
// 明示して点線どうしをぶつける (予備校部の下の線は引かない)。
// 塗り (休校日の黒など) は紙面でも出す (print-color-adjust)。紙面ではアプリの
// 灰色の地を白にする (この <style> はこの画面を開いている間だけ文書にある)。
// .year-cal-view--large = 紙の大きさ「B4・A3」(字を大きく)
const DAY_FRAME = "1.5px solid #5f6b7a";
const WEEK_FRAME = "2px solid #3b4a5a";
const YEAR_CAL_CSS = `
.year-cal-months { display: grid; gap: 22px; }
.year-cal-month-title { margin: 0 0 6px; font-size: 16px; font-weight: 800; }
.year-cal-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  table-layout: fixed;
  background: #fff;
  border: ${WEEK_FRAME};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* position: relative = 読み上げ用の .year-cal-sr (absolute) をこの枠の中に収める
   (無いと右端の欄の分だけページ全体が横にはみ出し、スマホ幅で横に揺れる) */
.year-cal-month { overflow-x: auto; position: relative; }
.year-cal-lane-col { width: 4.8em; }
.year-cal-table thead th {
  font-size: 12px;
  padding: 3px 0;
  background: #3b4a5a;
  color: #fff;
  border: 1px solid #3b4a5a;
}
.year-cal-table thead th:first-child { background: #3b4a5a; }
.year-cal-table td, .year-cal-table tbody th {
  border: 0;
  border-left: ${DAY_FRAME};
  border-right: ${DAY_FRAME};
  vertical-align: top;
}
.year-cal-week { break-inside: avoid; page-break-inside: avoid; }
/* 週の境 (日付の行の上と、週の最後の段の下) */
.year-cal-daterow > td, .year-cal-daterow > th { border-top: ${WEEK_FRAME}; }
.year-cal-week > tr:last-child > td, .year-cal-week > tr:last-child > th { border-bottom: ${WEEK_FRAME}; }
/* 日付と段の間は細い線、予備校部と現役部の間は点線 */
.year-cal-lane > td, .year-cal-lane > th { border-top: 1px solid #c3c8d0; }
.year-cal-lane-yobiko + .year-cal-lane-genyaku > td,
.year-cal-lane-yobiko + .year-cal-lane-genyaku > th { border-top: 2px dotted #6b7280; }
.year-cal-date { padding: 2px 4px; font-size: 12px; font-weight: 700; height: 1.6em; background: #f7f8fa; }
.year-cal-date-inner { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.year-cal-mark { font-size: 9px; font-weight: 600; opacity: .9; }
.year-cal-add {
  margin-left: auto; background: none; border: none; padding: 0 2px; font-size: 12px;
  color: inherit; opacity: .35; cursor: pointer; line-height: 1;
}
.year-cal-add:hover, .year-cal-add:focus-visible { opacity: 1; }
.year-cal-today { outline: 2px solid #e67a00; outline-offset: -2px; }
.year-cal-out { background: #eceef1 !important; }
.year-cal-cell { padding: 2px; height: 2.2em; }
.year-cal-lane-head {
  font-size: 10px; font-weight: 700; padding: 2px; text-align: center; white-space: nowrap;
  vertical-align: middle !important; line-height: 1.25;
}
.year-cal-daterow .year-cal-lane-head { background: #f7f8fa; }
@media screen {
  /* 期間の続きの日は薄く (紙面では薄くしない。小さい字がさらに読めなくなる) */
  .year-cal-cont { opacity: .65; }
}
.year-cal-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
.year-cal-print-title { display: none; }

/* B4・A3: 字を大きく */
.year-cal-view--large .year-cal-table { min-width: 980px; }
.year-cal-view--large .year-cal-month-title { font-size: 19px; }
.year-cal-view--large .year-cal-lane-col { width: 5.4em; }
.year-cal-view--large .year-cal-table thead th { font-size: 13.5px; }
.year-cal-view--large .year-cal-date { font-size: 15px; }
.year-cal-view--large .year-cal-mark { font-size: 10.5px; }
.year-cal-view--large .year-cal-lane-head { font-size: 12px; }
.year-cal-view--large .year-cal-item { font-size: 12px !important; }
.year-cal-view--large .ycs-chip { font-size: 12px; height: 20px; }
.year-cal-view--large .year-cal-legend span,
.year-cal-view--large .year-cal-legend b { font-size: 12px !important; }

@media print {
  .app-shell { background: #fff !important; }
  .year-cal-print-title { display: block; margin: 0 0 4px; font-size: 14px; }
  .year-cal-months { display: block; }
  .year-cal-month { overflow: visible; }
  .year-cal-month + .year-cal-month { break-before: page; page-break-before: always; }
  .year-cal-table { min-width: 0 !important; }
  .year-cal-item { font-size: 9px !important; }
  .year-cal-today { outline: none; }
  .year-cal-view--large .year-cal-print-title { font-size: 17px; }
  .year-cal-view--large .year-cal-month-title { font-size: 20px; }
  .year-cal-view--large .year-cal-date { font-size: 16px; }
  .year-cal-view--large .year-cal-item { font-size: 11.5px !important; }
  .year-cal-view--large .ycs-chip { font-size: 11.5px; height: 18px; padding: 0 4px; }
  .year-cal-view--large .ycs-line { font-size: 11px; }
  .year-cal-view--large .ycs-line .ysl-grade,
  .year-cal-view--large .ycs-line .ysl-optmark { font-size: 10px; line-height: 13px; }
}
`;
