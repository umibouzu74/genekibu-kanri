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
import { useToasts } from "../../hooks/useToasts";
import { ExcelGridView } from "./ExcelGridView";
import { BiweeklyTab } from "./master/BiweeklyTab";
import { MasterListTab } from "./master/MasterListTab";
import { PrintButton } from "../PrintButton";

// 印刷系統: PrintButton (window.print() 直接呼び) を使う。
// ヘッダ/凡例の動的注入は不要。詳細は src/components/PrintButton.jsx 冒頭コメント。
// ただし MasterView 内に埋め込まれる ExcelGridView は handlePrint (popup) 系統
// なので、時間割タブから印刷する場合はトップバー右の 🖨 ボタンを使うこと。

// タブの定義は constants/masterTabs.js が正 (サイドバー / Cmd+K と共有)。
// ここでラベルを書き起こすと導線側と食い違うので、必ず配列から作る。
function TabSwitcher({ tab, setTab }) {
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
  activeTimetableId,
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

  const grades = useMemo(
    () => [...new Set(slots.map((s) => s.grade))].sort(),
    [slots]
  );

  const filtered = useMemo(() => {
    const r = slots.filter(
      (s) =>
        (!filterDay || s.day === filterDay) &&
        (!filterGrade || s.grade === filterGrade) &&
        // teacher/subj は Firebase 別クライアント書込等で欠落しうるので
        // null ガード (extraLessons 側の防御と同じ理由。無いと view ごと落ちる)
        (!filterTeacher || (s.teacher ?? "").includes(filterTeacher)) &&
        (!filterSubj || (s.subj ?? "").includes(filterSubj)) &&
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

  if (tab === MASTER_TAB.BIWEEKLY) {
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
