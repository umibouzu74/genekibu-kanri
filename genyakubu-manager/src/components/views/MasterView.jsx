import { useMemo, useState } from "react";
import { DAYS, fmtDate, sortSlots as sortS, timeToMin } from "../../data";
import { S } from "../../styles/common";
import {
  DEFAULT_MASTER_TAB,
  MASTER_TAB,
  MASTER_TABS,
  normalizeMasterTab,
} from "../../constants/masterTabs";
import { getWeekType } from "../../utils/biweekly";
import {
  describeCurrentTimetables,
  filterSlotsCurrentOn,
  filterSlotsOfTimetable,
} from "../../utils/timetable";
import { useToasts } from "../../hooks/useToasts";
import { useToday } from "../../hooks/useToday";
import { ExcelGridView } from "./ExcelGridView";
import { BiweeklyTab } from "./master/BiweeklyTab";
import { MasterListTab } from "./master/MasterListTab";
import { TeacherChangeTab } from "./master/TeacherChangeTab";
import { CURRENT_TIMETABLE, TimetableScopePicker } from "./master/TimetableScopePicker";
import { PrintButton } from "../PrintButton";

// 印刷系統: PrintButton (window.print() 直接呼び) を使う。
// ヘッダ/凡例の動的注入は不要。詳細は src/components/PrintButton.jsx 冒頭コメント。
// ただし MasterView 内に埋め込まれる ExcelGridView は handlePrint (popup) 系統
// なので、時間割タブから印刷する場合はトップバー右の 🖨 ボタンを使うこと。

// タブの定義は constants/masterTabs.js が正 (サイドバー / Cmd+K と共有)。
// ここでラベルを書き起こすと導線側と食い違うので、必ず配列から作る。
function TabSwitcher({ tab, setTab, picker }) {
  return (
    <div
      className="no-print"
      style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}
    >
      {MASTER_TABS.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={S.btn(tab === t.key)}>
          {t.label}
        </button>
      ))}
      {picker}
      <span style={{ marginLeft: "auto" }}>
        <PrintButton />
      </span>
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
  saveSlots,
  partTimeStaff,
  teacherKana = {},
  subjects,
  holidays,
  examPeriods,
  classSets,
  displayCutoff,
  adjustments = [],
  sessionOverrides = [],
  subs = [],
  saveSubs,
  tab: tabProp,
  onTabChange,
}) {
  const toasts = useToasts();
  const [filterDay, setFilterDay] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSubj, setFilterSubj] = useState("");
  // タブは App から制御できる (サイドバー / Cmd+K から直接開くため)。
  // 単体で使うときは内部状態にフォールバックする。
  const [innerTab, setInnerTab] = useState(DEFAULT_MASTER_TAB);
  const tab = normalizeMasterTab(tabProp ?? innerTab);
  const setTab = onTabChange ?? setInnerTab;

  // 見る時間割 (この画面だけの選択。TimetableScopePicker)。既定は今の時間割
  const today = useToday();
  const [timetableChoice, setTimetableChoice] = useState(CURRENT_TIMETABLE);
  const multiTimetable = Array.isArray(timetables) && timetables.length > 1;
  // 選んだ時間割が (別の端末で) 消えたら今の時間割に戻す
  const choice =
    timetableChoice !== CURRENT_TIMETABLE &&
    multiTimetable &&
    timetables.some((t) => t.id === timetableChoice)
      ? timetableChoice
      : CURRENT_TIMETABLE;
  const pinnedTimetableId = choice === CURRENT_TIMETABLE ? null : choice;
  const scopedSlots = useMemo(() => {
    if (!multiTimetable) return slots;
    return pinnedTimetableId != null
      ? filterSlotsOfTimetable(slots, pinnedTimetableId)
      : filterSlotsCurrentOn(slots, timetables, today);
  }, [multiTimetable, slots, timetables, pinnedTimetableId, today]);
  const currentNames = useMemo(
    () =>
      multiTimetable
        ? describeCurrentTimetables(slots, timetables, today)
            .timetables.map(({ timetable }) => timetable.name)
            .join("・")
        : "",
    [multiTimetable, slots, timetables, today]
  );
  const picker = (
    <TimetableScopePicker
      timetables={timetables}
      value={choice}
      onChange={setTimetableChoice}
      currentNames={currentNames}
      today={today}
    />
  );

  const grades = useMemo(
    () => [...new Set(scopedSlots.map((s) => s.grade))].sort(),
    [scopedSlots]
  );

  const filtered = useMemo(() => {
    const r = scopedSlots.filter(
      (s) =>
        (!filterDay || s.day === filterDay) &&
        (!filterGrade || s.grade === filterGrade) &&
        // teacher/subj は Firebase 別クライアント書込等で欠落しうるので
        // null ガード (extraLessons 側の防御と同じ理由。無いと view ごと落ちる)
        (!filterTeacher || (s.teacher ?? "").includes(filterTeacher)) &&
        (!filterSubj || (s.subj ?? "").includes(filterSubj))
    );
    return sortS(r);
  }, [scopedSlots, filterDay, filterGrade, filterTeacher, filterSubj]);

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
    const alt = scopedSlots.filter((s) => s.note?.includes("隔週"));
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
  }, [scopedSlots]);

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

  // slot.biweeklyAnchors (個別の隔週基準) を解除してグローバル基準に戻す。
  // SlotForm を開かなくても隔週管理タブから直接リセットできるようにする。
  // cascade なしの単純削除なので即削除 + 6 秒 Undo toast (CLAUDE.md 準拠)。
  const clearSlotBiweeklyAnchors = (slotId) => {
    const target = slots.find((s) => s.id === slotId);
    if (!target || !target.biweeklyAnchors || target.biweeklyAnchors.length === 0) {
      return;
    }
    const original = target.biweeklyAnchors;
    saveSlots(
      slots.map((s) => {
        if (s.id !== slotId) return s;
        const next = { ...s };
        delete next.biweeklyAnchors;
        return next;
      })
    );
    toasts.push("個別基準日を削除しました", {
      tone: "info",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => {
          saveSlots((prev) =>
            prev.map((s) => {
              if (s.id !== slotId) return s;
              // 6 秒のあいだに別経路 (SlotForm 等) で再設定されていたら
              // 上書きしない (Undo 中の意図しないデータ破壊を避ける)。
              if (s.biweeklyAnchors && s.biweeklyAnchors.length > 0) return s;
              return { ...s, biweeklyAnchors: original };
            })
          );
        },
      },
    });
  };

  if (tab === MASTER_TAB.EXCEL) {
    return (
      <div style={{ marginTop: 12 }}>
        <TabSwitcher tab={tab} setTab={setTab} picker={picker} />
        <ExcelGridView
          slots={slots}
          saveSlots={saveSlots}
          onEdit={onEdit}
          biweeklyAnchors={biweeklyAnchors}
          isAdmin={isAdmin}
          timetables={timetables}
          timetableId={pinnedTimetableId}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
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

  if (tab === MASTER_TAB.TEACHER_CHANGE) {
    return (
      <div style={{ marginTop: 12 }}>
        <TabSwitcher tab={tab} setTab={setTab} picker={null} />
        <TeacherChangeTab
          slots={slots}
          timetables={timetables}
          subs={subs}
          saveSubs={saveSubs}
          adjustments={adjustments}
          saveSlots={saveSlots}
          isAdmin={isAdmin}
          teacherKana={teacherKana}
          partTimeStaff={partTimeStaff}
          defaultTimetableId={pinnedTimetableId}
        />
      </div>
    );
  }

  if (tab === MASTER_TAB.BIWEEKLY) {
    return (
      <div style={{ marginTop: 12 }}>
        <TabSwitcher tab={tab} setTab={setTab} picker={picker} />
        <BiweeklyTab
          biweeklyAnchors={biweeklyAnchors}
          sortedAnchors={sortedAnchors}
          currentWeekType={currentWeekType}
          newAnchorDate={newAnchorDate}
          setNewAnchorDate={setNewAnchorDate}
          addAnchor={addAnchor}
          removeAnchor={removeAnchor}
          biweeklyGroups={biweeklyGroups}
          holidays={holidays}
          examPeriods={examPeriods}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onClearSlotAnchors={clearSlotBiweeklyAnchors}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <TabSwitcher tab={tab} setTab={setTab} picker={picker} />
      <MasterListTab
        slots={scopedSlots}
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
        onNew={() => onNew?.(pinnedTimetableId)}
        onEdit={onEdit}
        onDel={onDel}
        isAdmin={isAdmin}
      />
    </div>
  );
}
