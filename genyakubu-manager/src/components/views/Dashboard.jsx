import { useCallback, useEffect, useMemo, useState } from "react";
import { dateToDay } from "../../data";
import { S } from "../../styles/common";
import { buildDayRange, shiftDate } from "./dashboardHelpers";
import { ExcelGridView } from "./ExcelGridView";
import { DAY_COUNT_OPTIONS } from "./dashboard/constants";
import { DashboardDateNav } from "./dashboard/DashboardDateNav";
import { DashboardListView } from "./dashboard/DashboardListView";
import { EventSummaryCards } from "./dashboard/EventSummaryCards";
import { SubSummaryCards } from "./dashboard/SubSummaryCards";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { useToday } from "../../hooks/useToday";
import { PrintButton } from "../PrintButton";

// 印刷系統: PrintButton (window.print() 直接呼び) を使う。
// ヘッダ/凡例の動的注入は不要、App.jsx 末尾のグローバル @media print +
// 各 DOM 自前の no-print CSS で仕上がる。詳細は src/components/PrintButton.jsx
// 冒頭コメント。

// Re-export DashDayRow so existing call sites (e.g. ConfirmedSubsView)
// keep working without import-path churn.
export { DashDayRow } from "./dashboard/DashDayRow";

const LS_DAY_COUNT_KEY = "genyakubu-dash-day-count";
// 表示日はタブ単位 (sessionStorage) で覚える。来週の準備中に別の画面へ
// 寄って戻ると今日に戻ってしまい、日付を打ち直しになるため。
// タブを閉じれば今日に戻る (localStorage にすると翌日開いても昨日のまま)
const SS_START_DATE_KEY = "genyakubu-dash-start-date";
function loadStartDate(todayStr) {
  try {
    const v = sessionStorage.getItem(SS_START_DATE_KEY);
    return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : todayStr;
  } catch {
    return todayStr;
  }
}

function loadDayCount() {
  try {
    const v = parseInt(localStorage.getItem(LS_DAY_COUNT_KEY), 10);
    return DAY_COUNT_OPTIONS.includes(v) ? v : 7;
  } catch {
    return 7;
  }
}

const LS_VIEW_MODE_KEY = "genyakubu-dash-view-mode";
const VIEW_MODES = ["list", "timetable"];
function loadViewMode() {
  try {
    const v = localStorage.getItem(LS_VIEW_MODE_KEY);
    return VIEW_MODES.includes(v) ? v : "timetable";
  } catch {
    return "timetable";
  }
}

export function Dashboard({
  slots,
  holidays,
  subs,
  timetables,
  displayCutoff,
  examPeriods = [],
  specialEvents = [],
  classSets = [],
  biweeklyAnchors = [],
  adjustments = [],
  sessionOverrides = [],
  activeTimetableId,
  partTimeStaff,
  teacherKana = {},
  subjects,
  subjectCategories,
  teacherSubjects,
  extraLessons = [],
  daySchedules = [],
  saveSubs,
  onJumpToEventCalendar,
  onJumpToSubs,
  onJumpToAbsenceFlow,
  isAdmin = false,
  // Cmd+K の日付ジャンプなど、外から表示日を指定して開くとき
  initDate = null,
  onConsumeInitDate,
  // 講師名クリックでその人の月間へ
  onSelectTeacher,
}) {
  // 「今日」は useToday (タブを開いたまま日付を跨いでも翌 0 時に更新される)
  const todayStr = useToday();
  const [startDate, setStartDateRaw] = useState(() => loadStartDate(todayStr));
  const setStartDate = useCallback((d) => {
    setStartDateRaw(d);
    try { sessionStorage.setItem(SS_START_DATE_KEY, d); } catch { /* quota */ }
  }, []);
  useEffect(() => {
    if (!initDate) return;
    setStartDate(initDate);
    onConsumeInitDate?.();
    // initDate が変わったときだけ (setStartDate は安定、onConsumeInitDate は毎回新しい)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDate]);
  const [daysInRange, setDaysInRange] = useState(loadDayCount);
  const [viewMode, setViewMode] = useState(loadViewMode);
  // 時間割モードは曜日 (月〜土) の表なので日曜は表せない。日付欄で日曜を
  // 選んだときは黙って別の日を出さず、前後の日へ送るボタンを出す
  const isSundayInTimetable = viewMode === "timetable" && dateToDay(startDate) == null;
  // 管理者だけが欠勤組み換えを開ける (閲覧者には導線を出さない)
  const jumpToAbsenceFlow = isAdmin && onJumpToAbsenceFlow ? onJumpToAbsenceFlow : null;

  const changeDayCount = (n) => {
    setDaysInRange(n);
    try { localStorage.setItem(LS_DAY_COUNT_KEY, String(n)); } catch { /* quota */ }
  };

  const changeViewMode = (m) => {
    setViewMode(m);
    try { localStorage.setItem(LS_VIEW_MODE_KEY, m); } catch { /* quota */ }
  };

  const days = useMemo(
    () => buildDayRange(startDate, daysInRange),
    [startDate, daysInRange]
  );

  const isToday = startDate === todayStr;

  // Session count 用の共通 ctx + ホリデーヘルパをまとめて取得。
  const {
    sessionCtx,
    holidaysFor,
    examPeriodsFor,
    specialEventsFor,
    isOffForGrade,
  } = useSessionCtx({
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
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 表示モード切替 */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          background: "#fff",
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid #e0e0e0",
          alignSelf: "flex-start",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#666", marginRight: 6 }}>
          表示:
        </span>
        <button
          type="button"
          onClick={() => changeViewMode("list")}
          style={{ ...S.btn(viewMode === "list"), fontSize: 12, padding: "4px 12px" }}
        >
          日別
        </button>
        <button
          type="button"
          onClick={() => changeViewMode("timetable")}
          style={{ ...S.btn(viewMode === "timetable"), fontSize: 12, padding: "4px 12px" }}
        >
          時間割
        </button>
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 18,
            background: "#e0e0e0",
            margin: "0 6px",
          }}
        />
        <PrintButton />
      </div>

      {/* 日付ナビゲーション (両モード共通) */}
      <div className="no-print">
        <DashboardDateNav
          startDate={startDate}
          setStartDate={setStartDate}
          daysInRange={daysInRange}
          changeDayCount={changeDayCount}
          todayStr={todayStr}
          isToday={isToday}
          days={days}
          viewMode={viewMode}
          onJumpToAbsenceFlow={jumpToAbsenceFlow}
        />
      </div>

      {/* 要対応 (代行未定・依頼中・今日明日の代行) と直近 7 日のイベントは
          表示モードを問わず出す。時間割モードにしか無いと、既定のままの人には
          「今日なにが要対応か」が一度も見えない */}
      <SubSummaryCards
        subs={subs}
        slots={slots}
        todayStr={todayStr}
        onJumpToSubs={onJumpToSubs}
        onJumpToAbsenceFlow={jumpToAbsenceFlow}
      />
      <EventSummaryCards
        todayStr={todayStr}
        holidays={holidays}
        examPeriods={examPeriods}
        specialEvents={specialEvents}
        onJumpToEventCalendar={onJumpToEventCalendar}
      />

      {isSundayInTimetable ? (
        <div
          role="status"
          style={{
            background: "#fff8e0",
            border: "1px solid #e0d080",
            borderRadius: 10,
            padding: "14px 16px",
            color: "#8a7020",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>{startDate} は日曜日です。時間割 (月〜土) はありません。</span>
          <button
            type="button"
            onClick={() => setStartDate(shiftDate(startDate, -1))}
            style={S.btn(false)}
          >
            ← 土曜へ
          </button>
          <button
            type="button"
            onClick={() => setStartDate(shiftDate(startDate, 1))}
            style={S.btn(false)}
          >
            月曜へ →
          </button>
        </div>
      ) : viewMode === "timetable" ? (
        <ExcelGridView
          slots={slots}
          saveSlots={() => {}}
          biweeklyAnchors={biweeklyAnchors}
          isAdmin={false}
          timetables={timetables || []}
          activeTimetableId={activeTimetableId}
          partTimeStaff={partTimeStaff || []}
          teacherKana={teacherKana}
          subjects={subjects || []}
          subs={subs}
          saveSubs={saveSubs || (() => {})}
          holidays={holidays}
          examPeriods={examPeriods}
          subjectCategories={subjectCategories || []}
          teacherSubjects={teacherSubjects || {}}
          classSets={classSets}
          displayCutoff={displayCutoff}
          viewDate={startDate}
          onViewDateChange={setStartDate}
          adjustments={adjustments}
          sessionOverrides={sessionOverrides}
          extraLessons={extraLessons}
          daySchedules={daySchedules}
          dashboardMode
          onSelectTeacher={onSelectTeacher}
        />
      ) : (
        <DashboardListView
          slots={slots}
          subs={subs}
          timetables={timetables}
          displayCutoff={displayCutoff}
          days={days}
          holidays={holidays}
          examPeriods={examPeriods}
          specialEvents={specialEvents}
          extraLessons={extraLessons}
          daySchedules={daySchedules}
          holidaysFor={holidaysFor}
          examPeriodsFor={examPeriodsFor}
          specialEventsFor={specialEventsFor}
          isOffForGrade={isOffForGrade}
          sessionCtx={sessionCtx}
          todayStr={todayStr}
          adjustments={adjustments}
          onJumpToAbsenceFlow={jumpToAbsenceFlow}
          onSelectTeacher={onSelectTeacher}
        />
      )}
    </div>
  );
}
