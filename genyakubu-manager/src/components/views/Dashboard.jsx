import { useMemo, useState } from "react";
import { fmtDate } from "../../data";
import { S } from "../../styles/common";
import { buildDayRange, makeHolidayHelpers } from "./dashboardHelpers";
import { ExcelGridView } from "./ExcelGridView";
import { DAY_COUNT_OPTIONS } from "./dashboard/constants";
import { DashboardDateNav } from "./dashboard/DashboardDateNav";
import { DashboardListView } from "./dashboard/DashboardListView";

// Re-export DashDayRow so existing call sites (e.g. ConfirmedSubsView)
// keep working without import-path churn.
export { DashDayRow } from "./dashboard/DashDayRow";

const LS_DAY_COUNT_KEY = "genyakubu-dash-day-count";

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
    return VIEW_MODES.includes(v) ? v : "list";
  } catch {
    return "list";
  }
}

export function Dashboard({
  slots,
  holidays,
  subs,
  timetables,
  displayCutoff,
  examPeriods = [],
  classSets = [],
  biweeklyAnchors = [],
  activeTimetableId,
  partTimeStaff,
  subjects,
  subjectCategories,
  teacherSubjects,
  saveSubs,
}) {
  const todayStr = fmtDate(new Date());
  const [startDate, setStartDate] = useState(todayStr);
  const [daysInRange, setDaysInRange] = useState(loadDayCount);
  const [viewMode, setViewMode] = useState(loadViewMode);

  const changeDayCount = (n) => {
    setDaysInRange(n);
    try { localStorage.setItem(LS_DAY_COUNT_KEY, String(n)); } catch { /* quota */ }
  };

  const changeViewMode = (m) => {
    setViewMode(m);
    try { localStorage.setItem(LS_VIEW_MODE_KEY, m); } catch { /* quota */ }
  };

  const { holidaysFor, examPeriodsFor, isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays, examPeriods),
    [holidays, examPeriods]
  );

  const days = useMemo(
    () => buildDayRange(startDate, daysInRange),
    [startDate, daysInRange]
  );

  const isToday = startDate === todayStr;

  // Session count 用の共通 ctx。DashDayRow ごとに buildSessionCountMap を
  // 呼び、その日の対象スロットにセッション番号を振る。
  const sessionCtx = useMemo(
    () => ({
      classSets,
      allSlots: slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors,
      orientationOnFirstDay: true,
    }),
    [classSets, slots, displayCutoff, isOffForGrade, biweeklyAnchors]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 表示モード切替 */}
      <div
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
      </div>

      {/* 日付ナビゲーション (両モード共通) */}
      <DashboardDateNav
        startDate={startDate}
        setStartDate={setStartDate}
        daysInRange={daysInRange}
        changeDayCount={changeDayCount}
        todayStr={todayStr}
        isToday={isToday}
        days={days}
        viewMode={viewMode}
      />

      {viewMode === "timetable" ? (
        <ExcelGridView
          slots={slots}
          saveSlots={() => {}}
          biweeklyAnchors={biweeklyAnchors}
          isAdmin={false}
          timetables={timetables || []}
          activeTimetableId={activeTimetableId}
          partTimeStaff={partTimeStaff || []}
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
        />
      ) : (
        <DashboardListView
          slots={slots}
          subs={subs}
          timetables={timetables}
          displayCutoff={displayCutoff}
          days={days}
          holidaysFor={holidaysFor}
          examPeriodsFor={examPeriodsFor}
          isOffForGrade={isOffForGrade}
          sessionCtx={sessionCtx}
          todayStr={todayStr}
        />
      )}
    </div>
  );
}
