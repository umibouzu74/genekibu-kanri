import { useMemo, useState } from "react";
import { DAYS, fmtDate, sortSlots as sortS, timeToMin } from "../../data";
import { S } from "../../styles/common";
import { getWeekType } from "../../utils/biweekly";
import { ExcelGridView } from "./ExcelGridView";
import { BiweeklyTab } from "./master/BiweeklyTab";
import { MasterListTab } from "./master/MasterListTab";

function TabSwitcher({ tab, setTab }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
      <button onClick={() => setTab("list")} style={S.btn(tab === "list")}>
        コマ一覧
      </button>
      <button onClick={() => setTab("biweekly")} style={S.btn(tab === "biweekly")}>
        隔週管理
      </button>
      <button onClick={() => setTab("excel")} style={S.btn(tab === "excel")}>
        時間割表
      </button>
    </div>
  );
}

export function MasterView({
  slots,
  onEdit,
  onDel,
  onNew,
  biweeklyAnchors,
  onSetBiweeklyAnchors,
  isAdmin,
  timetables,
  activeTimetableId,
  saveSlots,
  partTimeStaff,
  subjects,
  holidays,
  examPeriods,
  classSets,
  displayCutoff,
  adjustments = [],
  sessionOverrides = [],
}) {
  const [filterDay, setFilterDay] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSubj, setFilterSubj] = useState("");
  const [tab, setTab] = useState("list");

  const grades = useMemo(
    () => [...new Set(slots.map((s) => s.grade))].sort(),
    [slots]
  );

  const filtered = useMemo(() => {
    const r = slots.filter(
      (s) =>
        (!filterDay || s.day === filterDay) &&
        (!filterGrade || s.grade === filterGrade) &&
        (!filterTeacher || s.teacher.includes(filterTeacher)) &&
        (!filterSubj || s.subj.includes(filterSubj)) &&
        (!timetables ||
          timetables.length <= 1 ||
          (s.timetableId ?? 1) === (activeTimetableId || 1))
    );
    return sortS(r);
  }, [
    slots,
    filterDay,
    filterGrade,
    filterTeacher,
    filterSubj,
    timetables,
    activeTimetableId,
  ]);

  const dayGroups = useMemo(() => {
    const activeDays = filterDay ? [filterDay] : DAYS;
    return activeDays
      .map((day) => {
        const daySlots = filtered.filter((s) => s.day === day);
        if (daySlots.length === 0) return null;
        return { day, slots: daySlots };
      })
      .filter(Boolean);
  }, [filtered, filterDay]);

  const biweeklyGroups = useMemo(() => {
    const alt = slots.filter((s) => s.note?.includes("隔週"));
    const g = {};
    alt.forEach((s) => {
      const k = `${s.day}_${s.time}`;
      if (!g[k]) g[k] = { day: s.day, time: s.time, slots: [] };
      g[k].slots.push(s);
    });
    const di = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    return Object.values(g).sort((a, b) => {
      const dd = (di[a.day] ?? 99) - (di[b.day] ?? 99);
      return dd || timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]);
    });
  }, [slots]);

  const currentWeekType = useMemo(
    () => getWeekType(fmtDate(new Date()), biweeklyAnchors),
    [biweeklyAnchors]
  );

  const [newAnchorDate, setNewAnchorDate] = useState("");

  const sortedAnchors = useMemo(
    () => [...(biweeklyAnchors || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [biweeklyAnchors]
  );

  const addAnchor = () => {
    if (!newAnchorDate) return;
    if (biweeklyAnchors.some((a) => a.date === newAnchorDate)) return;
    onSetBiweeklyAnchors([...biweeklyAnchors, { date: newAnchorDate, weekType: "A" }]);
    setNewAnchorDate("");
  };

  const removeAnchor = (date) => {
    onSetBiweeklyAnchors(biweeklyAnchors.filter((a) => a.date !== date));
  };

  if (tab === "excel") {
    return (
      <div style={{ marginTop: 12 }}>
        <TabSwitcher tab={tab} setTab={setTab} />
        <ExcelGridView
          slots={slots}
          saveSlots={saveSlots}
          onEdit={onEdit}
          biweeklyAnchors={biweeklyAnchors}
          isAdmin={isAdmin}
          timetables={timetables}
          activeTimetableId={activeTimetableId}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          holidays={holidays}
          examPeriods={examPeriods}
          classSets={classSets}
          displayCutoff={displayCutoff}
          adjustments={adjustments}
          sessionOverrides={sessionOverrides}
        />
      </div>
    );
  }

  if (tab === "biweekly") {
    return (
      <div style={{ marginTop: 12 }}>
        <TabSwitcher tab={tab} setTab={setTab} />
        <BiweeklyTab
          biweeklyAnchors={biweeklyAnchors}
          sortedAnchors={sortedAnchors}
          currentWeekType={currentWeekType}
          newAnchorDate={newAnchorDate}
          setNewAnchorDate={setNewAnchorDate}
          addAnchor={addAnchor}
          removeAnchor={removeAnchor}
          biweeklyGroups={biweeklyGroups}
          isAdmin={isAdmin}
          onEdit={onEdit}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <TabSwitcher tab={tab} setTab={setTab} />
      <MasterListTab
        slots={slots}
        filtered={filtered}
        dayGroups={dayGroups}
        grades={grades}
        filterDay={filterDay}
        setFilterDay={setFilterDay}
        filterGrade={filterGrade}
        setFilterGrade={setFilterGrade}
        filterTeacher={filterTeacher}
        setFilterTeacher={setFilterTeacher}
        filterSubj={filterSubj}
        setFilterSubj={setFilterSubj}
        onNew={onNew}
        onEdit={onEdit}
        onDel={onDel}
        isAdmin={isAdmin}
      />
    </div>
  );
}
