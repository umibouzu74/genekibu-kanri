import { useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  DEPT_COLOR,
  fmtDate,
  getSubForSlot,
  gradeColor as GC,
  sortSlots as sortS,
  SUB_STATUS,
  timeToMin,
  WEEKDAYS,
} from "../../data";
import { formatBiweeklyNote, formatCount, weightedSlotCount } from "../../utils/biweekly";
import { DASH_SECTIONS } from "../../constants/schedule";
import { S } from "../../styles/common";
import { buildDayRange, makeHolidayHelpers, shiftDate } from "./dashboardHelpers";
import { isTimetableActiveForDate, isBeyondCutoff, isEntireDayBeyondCutoff } from "../../utils/timetable";
import { buildSessionCountMap, formatSessionNumber } from "../../utils/sessionCount";
import { ExcelGridView } from "./ExcelGridView";

function SectionColumn({ label, color, sl, deptOff, subs, date, sessionCountMap }) {
  const { timeGroups, teachers } = useMemo(() => {
    const byTime = {};
    sl.forEach((s) => {
      if (!byTime[s.time]) byTime[s.time] = [];
      byTime[s.time].push(s);
    });
    return {
      timeGroups: Object.entries(byTime).sort(
        ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
      ),
      teachers: [...new Set(sl.map((s) => s.teacher))],
    };
  }, [sl]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          background: color.b,
          color: color.f,
          padding: "8px 12px",
          borderRadius: "8px 8px 0 0",
          fontWeight: 800,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {!deptOff && sl.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
            {formatCount(weightedSlotCount(sl))}コマ / {teachers.length}名
          </span>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: "0 0 8px 8px",
          border: "1px solid #e0e0e0",
          borderTop: "none",
          padding: 10,
          minHeight: 80,
        }}
      >
        {deptOff ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            休講日
          </div>
        ) : sl.length === 0 ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            授業なし
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeGroups.map(([time, tSlots]) => (
              <div key={time}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: color.f,
                    marginBottom: 4,
                    paddingBottom: 3,
                    borderBottom: `2px solid ${color.accent}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{time}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#888" }}>
                    {formatCount(weightedSlotCount(tSlots))}コマ
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                    background: "#555",
                    gap: 2,
                    border: "2px solid #555",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  {tSlots.map((s, i) => {
                    const gc = GC(s.grade);
                    const sub = date ? getSubForSlot(subs, s.id, date) : null;
                    const st = sub ? SUB_STATUS[sub.status] || SUB_STATUS.requested : null;
                    const sessionNum = sessionCountMap ? sessionCountMap.get(s.id) || 0 : 0;
                    const newGradeRow =
                      i > 0 &&
                      s.grade !== tSlots[i - 1].grade &&
                      !s.grade.includes("附中") &&
                      !tSlots[i - 1].grade.includes("附中");
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: sub ? st.bg : "#fff",
                          padding: "8px 6px",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 96,
                          position: "relative",
                          ...(newGradeRow ? { gridColumnStart: 1 } : null),
                        }}
                      >
                        {sub && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              background: st.color,
                              color: "#fff",
                              fontSize: 8,
                              fontWeight: 800,
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                            title={`${sub.originalTeacher} → ${sub.substitute || "未定"}\n${st.label}${sub.memo ? "\n" + sub.memo : ""}`}
                          >
                            代
                          </div>
                        )}
                        <div style={{ lineHeight: 1.4 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            {sessionNum > 0 && (
                              <span
                                title={`第${sessionNum}回`}
                                aria-label={`第${sessionNum}回`}
                                style={{
                                  background: "#3a6ea5",
                                  color: "#fff",
                                  borderRadius: 4,
                                  padding: "0 5px",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  lineHeight: "18px",
                                  minWidth: 20,
                                  textAlign: "center",
                                  boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                                  flexShrink: 0,
                                }}
                              >
                                {formatSessionNumber(sessionNum)}
                              </span>
                            )}
                            <span
                              style={{
                                background: gc.b,
                                color: gc.f,
                                borderRadius: 3,
                                padding: "1px 4px",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {s.grade}
                              {s.cls && s.cls !== "-" ? s.cls : ""}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>
                              {s.subj}
                            </span>
                          </div>
                          {(s.room || s.note) && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 6,
                                marginTop: 2,
                                flexWrap: "wrap",
                              }}
                            >
                              {s.room && (
                                <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>
                                  {s.room}
                                </span>
                              )}
                              {s.note && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#a0331a" }}>
                                  ({formatBiweeklyNote(s.teacher, s.note)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: sub ? 16 : 22,
                            fontWeight: 800,
                            color: "#1a1a2e",
                            lineHeight: 1.1,
                            marginTop: 6,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sub ? (
                            <span>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "#999",
                                  fontSize: 12,
                                }}
                              >
                                {sub.originalTeacher}
                              </span>
                              <span style={{ margin: "0 2px", color: st.color }}>→</span>
                              <span style={{ color: st.color }}>{sub.substitute || "?"}</span>
                            </span>
                          ) : s.teacher ? (
                            s.teacher
                          ) : (
                            <span style={{ color: "#c44", fontSize: 14, fontStyle: "italic" }}>
                              未割当
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 代行サマリーカード ─────────────────────────────────────────────
// 今日・明日の代行予定と全体の依頼中件数を一目で把握できるウィジェット。
function SubSummaryCards({ subs, slots, todayStr }) {
  const summary = useMemo(() => {
    if (!subs || subs.length === 0) return null;

    const tomorrow = new Date(todayStr + "T12:00:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = fmtDate(tomorrow);
    const tomorrowDow = WEEKDAYS[tomorrow.getDay()];

    const todayDow = (() => {
      const d = new Date(todayStr + "T12:00:00");
      return WEEKDAYS[d.getDay()];
    })();

    const todaySubs = subs.filter((s) => s.date === todayStr);
    const tomorrowSubs = subs.filter((s) => s.date === tomorrowStr);
    const pendingAll = subs.filter((s) => s.status === "requested");

    // 今後7日の代行件数
    const weekAhead = [];
    const base = new Date(todayStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      weekAhead.push(fmtDate(d));
    }
    const weekSubs = subs.filter((s) => weekAhead.includes(s.date));

    return {
      todaySubs,
      todayDow,
      tomorrowSubs,
      tomorrowDow,
      pendingAll,
      weekSubs,
    };
  }, [subs, todayStr]);

  if (!summary) return null;

  const { todaySubs, todayDow, tomorrowSubs, tomorrowDow, pendingAll, weekSubs } =
    summary;

  // 何も無ければ表示しない
  if (todaySubs.length === 0 && tomorrowSubs.length === 0 && pendingAll.length === 0) {
    return null;
  }

  const Card = ({ label, count, color, bg, detail, children }) => (
    <div
      style={{
        background: bg,
        borderRadius: 10,
        padding: "10px 14px",
        border: `1px solid ${color}30`,
        minWidth: 130,
        flex: "1 1 130px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>件</span>
      </div>
      {detail && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{detail}</div>
      )}
      {children}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {/* 今日の代行 */}
      <Card
        label={`今日 (${todayDow}) の代行`}
        count={todaySubs.length}
        color={todaySubs.length > 0 ? "#2e6a9e" : "#888"}
        bg={todaySubs.length > 0 ? "#e8f0fa" : "#f8f8f8"}
        detail={
          todaySubs.length > 0
            ? `確定: ${todaySubs.filter((s) => s.status === "confirmed").length} / 依頼中: ${todaySubs.filter((s) => s.status === "requested").length}`
            : null
        }
      >
        {todaySubs.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {todaySubs.slice(0, 3).map((s) => {
              const slot = slots.find((sl) => sl.id === s.slotId);
              const st = SUB_STATUS[s.status] || SUB_STATUS.requested;
              return (
                <div
                  key={s.id}
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      background: st.color,
                      color: "#fff",
                      padding: "0 3px",
                      borderRadius: 2,
                      fontSize: 8,
                      fontWeight: 800,
                    }}
                  >
                    {st.label}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {slot?.time?.split("-")[0] || "?"} {slot?.subj || "?"}
                  </span>
                  <span style={{ color: "#888" }}>
                    {s.originalTeacher}→{s.substitute || "?"}
                  </span>
                </div>
              );
            })}
            {todaySubs.length > 3 && (
              <div style={{ fontSize: 9, color: "#888" }}>
                他 {todaySubs.length - 3} 件
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 明日の代行 */}
      <Card
        label={`明日 (${tomorrowDow}) の代行`}
        count={tomorrowSubs.length}
        color={tomorrowSubs.length > 0 ? "#6a3d8e" : "#888"}
        bg={tomorrowSubs.length > 0 ? "#f0e8f6" : "#f8f8f8"}
        detail={
          tomorrowSubs.length > 0
            ? `確定: ${tomorrowSubs.filter((s) => s.status === "confirmed").length} / 依頼中: ${tomorrowSubs.filter((s) => s.status === "requested").length}`
            : null
        }
      />

      {/* 依頼中（全体） */}
      {pendingAll.length > 0 && (
        <Card
          label="依頼中（未確定）"
          count={pendingAll.length}
          color="#c03030"
          bg="#fde8e8"
          detail={`今後7日間の代行: ${weekSubs.length}件`}
        />
      )}
    </div>
  );
}

export function DashDayRow({ date, dow, holidays: hols, slots, subs, examPeriodsForDate = [], sessionCtx }) {
  const sessionCountMap = useMemo(() => {
    if (!sessionCtx || !sessionCtx.displayCutoff) return null;
    return buildSessionCountMap(slots, date, sessionCtx);
  }, [slots, date, sessionCtx]);
  const fullOff = hols.some((h) => {
    const sc = h.scope || ["全部"];
    if (!sc.includes("全部")) return false;
    if ((h.targetGrades || []).length > 0) return false;
    if ((h.subjKeywords || []).length > 0) return false;
    return true;
  });
  const offDepts = [
    ...new Set(
      hols
        .filter((h) => (h.targetGrades || []).length === 0 && (h.subjKeywords || []).length === 0)
        .flatMap((h) => h.scope || ["全部"])
    ),
  ].filter((d) => d !== "全部");
  const granularHols = hols.filter(
    (h) => (h.targetGrades || []).length > 0 || (h.subjKeywords || []).length > 0
  );
  const hasPartial = !fullOff && (offDepts.length > 0 || granularHols.length > 0);
  const holLabel = hols[0]?.label;
  const hasExamPeriod = examPeriodsForDate.length > 0;
  const examLabel = examPeriodsForDate.map((ep) => ep.name).join(", ");

  return (
    <div>
      <div
        style={{
          background: fullOff ? "#f0f0f0" : DC[dow] || "#666",
          color: fullOff ? "#999" : "#fff",
          padding: "10px 16px",
          borderRadius: 10,
          fontWeight: 800,
          fontSize: 15,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <span>
          {date}（{dow}）
        </span>
        {fullOff && (
          <span
            style={{ fontSize: 11, background: "#ddd", padding: "2px 8px", borderRadius: 4 }}
          >
            🚫 {holLabel}
          </span>
        )}
        {hasPartial && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {offDepts.map((d) => (
              <span
                key={d}
                style={{
                  fontSize: 10,
                  background: "rgba(255,255,255,0.25)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {d}休
              </span>
            ))}
            {granularHols.map((h) => {
              const parts = [
                ...(h.targetGrades || []),
                ...(h.subjKeywords || []),
              ];
              return (
                <span
                  key={h.id}
                  style={{
                    fontSize: 10,
                    background: "rgba(255,255,255,0.25)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {parts.join("・")}休{h.label ? `(${h.label})` : ""}
                </span>
              );
            })}
          </div>
        )}
        {!fullOff && hasExamPeriod && (
          <span
            style={{
              fontSize: 10,
              background: "#f0a030",
              color: "#fff",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700,
            }}
          >
            {examLabel}
          </span>
        )}
      </div>
      {fullOff ? (
        <div
          style={{
            textAlign: "center",
            color: "#bbb",
            padding: 30,
            fontSize: 14,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          休講日{holLabel ? `（${holLabel}）` : ""}
        </div>
      ) : (
        <div
          className="dash-sections"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          {DASH_SECTIONS.map((sec) => {
            const deptOff = offDepts.includes(sec.dept);
            const secSlots = deptOff ? [] : sortS(slots.filter(sec.filterFn));
            const color = DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
            return (
              <SectionColumn
                key={sec.key}
                label={sec.label}
                color={color}
                sl={secSlots}
                deptOff={deptOff}
                subs={subs}
                date={date}
                sessionCountMap={sessionCountMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAY_COUNT_OPTIONS = [3, 7, 14];
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

  const days = useMemo(() => buildDayRange(startDate, daysInRange), [startDate, daysInRange]);

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

// 日付ナビゲーション (日付ピッカー + 前/今日/次 + 範囲選択)
// viewMode に応じてステップ量と範囲ボタンの表示を切り替える
function DashboardDateNav({
  startDate,
  setStartDate,
  daysInRange,
  changeDayCount,
  todayStr,
  isToday,
  days,
  viewMode,
}) {
  const stepDays = viewMode === "timetable" ? 1 : daysInRange;
  const label = viewMode === "timetable" ? "表示日" : "表示開始日";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        background: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 13, color: "#444" }}>{label}</span>
      <input
        type="date"
        value={startDate}
        onChange={(e) => e.target.value && setStartDate(e.target.value)}
        style={{ ...S.input, width: "auto" }}
      />
      <button
        type="button"
        onClick={() => setStartDate(shiftDate(startDate, -stepDays))}
        style={S.btn(false)}
      >
        ← 前
      </button>
      <button
        type="button"
        onClick={() => setStartDate(todayStr)}
        style={S.btn(isToday)}
      >
        今日
      </button>
      <button
        type="button"
        onClick={() => setStartDate(shiftDate(startDate, stepDays))}
        style={S.btn(false)}
      >
        次 →
      </button>
      {viewMode === "list" && (
        <div style={{ display: "flex", gap: 2 }}>
          {DAY_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => changeDayCount(n)}
              style={{
                ...S.btn(daysInRange === n),
                padding: "4px 8px",
                fontSize: 11,
                minWidth: 32,
              }}
            >
              {n}日
            </button>
          ))}
        </div>
      )}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
        {viewMode === "timetable"
          ? startDate
          : `${startDate} 〜 ${days[days.length - 1].dateStr}（${daysInRange}日間）`}
      </span>
    </div>
  );
}

function DashboardListView({
  slots,
  subs,
  timetables,
  displayCutoff,
  days,
  todayStr,
  holidaysFor,
  examPeriodsFor,
  isOffForGrade,
  sessionCtx,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SubSummaryCards subs={subs} slots={slots} todayStr={todayStr} />
      {days.map(({ dateStr, dow }) => {
        const hols = holidaysFor(dateStr);
        const entireDayCutoff = isEntireDayBeyondCutoff(dateStr, displayCutoff);
        const daySlots = entireDayCutoff
          ? []
          : slots.filter(
              (s) =>
                s.day === dow &&
                !isOffForGrade(dateStr, s.grade, s.subj) &&
                (!timetables ||
                  timetables.length === 0 ||
                  isTimetableActiveForDate(
                    timetables.find((t) => t.id === (s.timetableId ?? 1)),
                    dateStr,
                    s.grade
                  )) &&
                !isBeyondCutoff(dateStr, s.grade, displayCutoff)
            );
        return (
          <div key={dateStr}>
            {entireDayCutoff && (
              <div
                style={{
                  background: "#fff8e0",
                  border: "1px solid #e0d080",
                  borderRadius: 8,
                  padding: "8px 14px",
                  marginBottom: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#8a7020",
                  textAlign: "center",
                }}
              >
                この日以降の予定は未確定です
              </div>
            )}
            <DashDayRow
              date={dateStr}
              dow={dow}
              holidays={hols}
              slots={daySlots}
              subs={subs}
              examPeriodsForDate={examPeriodsFor(dateStr)}
              sessionCtx={sessionCtx}
            />
          </div>
        );
      })}
    </div>
  );
}
