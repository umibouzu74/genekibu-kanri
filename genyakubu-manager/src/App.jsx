import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  INIT_HOLIDAYS,
  INIT_PART_TIME_STAFF,
  INIT_SLOTS,
  INIT_SUBJECTS,
  INIT_SUBJECT_CATEGORIES,
} from "./data";

import { VIEWS } from "./constants/views";
import { useSyncedStorage, useSyncedStorageRaw } from "./hooks/useSyncedStorage";
import { useTeacherGroups } from "./hooks/useTeacherGroups";
import { useToasts } from "./hooks/useToasts";
import { useAuth } from "./hooks/useAuth";
import { useSlotsCrud } from "./hooks/useSlotsCrud";
import { useSubsCrud } from "./hooks/useSubsCrud";
import { useAdjustmentsCrud } from "./hooks/useAdjustmentsCrud";
import { useTimetablesCrud } from "./hooks/useTimetablesCrud";
import { useStaffCrud } from "./hooks/useStaffCrud";
import {
  useDataIO,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSubs,
} from "./hooks/useDataIO";
import { DEFAULT_TIMETABLE, DEFAULT_DISPLAY_CUTOFF } from "./utils/schema";
import { filterSlotsByActiveTimetable } from "./utils/timetable";
import { slotWeight, formatCount, isSlotForTeacher } from "./utils/biweekly";
import { colors, font, S } from "./styles/common";
import { LS } from "./constants/storageKeys";
import { LAYOUT } from "./constants/layout";
import { escapeHtml } from "./utils/escape";

import { Modal } from "./components/Modal";
import { SlotForm } from "./components/SlotForm";
import { Sidebar } from "./components/Sidebar";
import { TimetableSelector } from "./components/TimetableSelector";

import { Dashboard } from "./components/views/Dashboard";
import { WeekView } from "./components/views/WeekView";
import { MonthView } from "./components/views/MonthView";
import { AllView } from "./components/views/AllView";

// Lazy-loaded views (less frequently used or gated by navigation).
const MasterView = lazy(() =>
  import("./components/views/MasterView").then((m) => ({ default: m.MasterView }))
);
const SubstituteView = lazy(() =>
  import("./components/views/SubstituteView").then((m) => ({ default: m.SubstituteView }))
);
const ConfirmedSubsView = lazy(() =>
  import("./components/views/ConfirmedSubsView").then((m) => ({ default: m.ConfirmedSubsView }))
);
const StaffManagerView = lazy(() =>
  import("./components/views/StaffManagerView").then((m) => ({ default: m.StaffManagerView }))
);
const CompareView = lazy(() =>
  import("./components/views/CompareView").then((m) => ({ default: m.CompareView }))
);
const TimetableManagerView = lazy(() =>
  import("./components/views/TimetableManagerView").then((m) => ({ default: m.TimetableManagerView }))
);

// Lazy-loaded modals (only rendered on demand).
const SubstituteForm = lazy(() =>
  import("./components/SubstituteForm").then((m) => ({ default: m.SubstituteForm }))
);
const HolidayManager = lazy(() =>
  import("./components/HolidayManager").then((m) => ({ default: m.HolidayManager }))
);
const ExamPeriodManager = lazy(() =>
  import("./components/ExamPeriodManager").then((m) => ({ default: m.ExamPeriodManager }))
);
const DataManager = lazy(() =>
  import("./components/DataManager").then((m) => ({ default: m.DataManager }))
);
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);

function ViewFallback() {
  return (
    <div
      style={{
        padding: 24,
        color: colors.inkMuted,
        fontSize: 13,
      }}
    >
      読み込み中...
    </div>
  );
}

export default function App() {
  const toasts = useToasts();
  const { isAdmin, signIn, signOutAdmin } = useAuth();

  // Flags to avoid spamming the same toast on every subsequent save.
  const syncAuthNotifiedRef = useRef(false);

  const onStorageError = useCallback(
    (err, phase) => {
      if (phase === "quota") {
        toasts.error(
          "保存領域の上限に達しました。データ管理からエクスポートして古いデータを整理してください。"
        );
      } else if (phase === "load") {
        toasts.error(
          `保存データの読み込みに失敗しました: ${err?.message || err}`
        );
      } else if (phase === "sync-auth") {
        if (!syncAuthNotifiedRef.current) {
          syncAuthNotifiedRef.current = true;
          toasts.error(
            "クラウドへの書込が拒否されました。管理者ログインが必要です（端末にはローカル保存されています）。"
          );
        }
      }
    },
    [toasts]
  );

  useEffect(() => {
    if (isAdmin) syncAuthNotifiedRef.current = false;
  }, [isAdmin]);

  // ─── Persisted state (synced with Firebase when configured) ───────
  const [slots, saveSlots] = useSyncedStorage(LS.slots, INIT_SLOTS, {
    onError: onStorageError,
  });
  const [holidays, saveHolidays] = useSyncedStorage(LS.holidays, INIT_HOLIDAYS, {
    migrate: migrateHolidays,
    onError: onStorageError,
  });
  const [subs, saveSubs] = useSyncedStorage(LS.subs, [], {
    migrate: migrateSubs,
    onError: onStorageError,
  });
  const [partTimeStaff, savePartTimeStaff] = useSyncedStorage(
    LS.partTime,
    INIT_PART_TIME_STAFF,
    { migrate: migratePartTimeStaff, onError: onStorageError }
  );
  const [subjectCategories, saveSubjectCategories] = useSyncedStorage(
    LS.subjectCategories,
    INIT_SUBJECT_CATEGORIES,
    { onError: onStorageError }
  );
  const [subjects, saveSubjects] = useSyncedStorage(LS.subjects, INIT_SUBJECTS, {
    onError: onStorageError,
  });
  const [biweeklyBase, saveBiweeklyBase] = useSyncedStorageRaw(LS.biweeklyBase, "", {
    onError: onStorageError,
  });
  const [biweeklyAnchors, saveBiweeklyAnchors] = useSyncedStorage(
    LS.biweeklyAnchors,
    [],
    { onError: onStorageError }
  );
  const [adjustments, saveAdjustments] = useSyncedStorage(
    LS.adjustments,
    [],
    { onError: onStorageError }
  );
  const [timetables, saveTimetables] = useSyncedStorage(
    LS.timetables,
    [DEFAULT_TIMETABLE],
    { onError: onStorageError }
  );
  const [displayCutoff, saveDisplayCutoff] = useSyncedStorage(
    LS.displayCutoff,
    DEFAULT_DISPLAY_CUTOFF,
    { onError: onStorageError }
  );
  const [examPeriods, saveExamPeriods] = useSyncedStorage(
    LS.examPeriods,
    [],
    { onError: onStorageError }
  );
  const [classSets, saveClassSets] = useSyncedStorage(
    LS.classSets,
    [],
    { onError: onStorageError }
  );
  const [teacherSubjects, saveTeacherSubjects] = useSyncedStorage(
    LS.teacherSubjects,
    {},
    { onError: onStorageError }
  );

  // ─── UI state ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(VIEWS.DASH);
  const [monthOff, setMonthOff] = useState(0);
  const [search, setSearch] = useState("");
  const [editSlot, setEditSlot] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDataMgr, setShowDataMgr] = useState(false);
  const [importing, setImporting] = useState(false);
  const [subsInitFilter, setSubsInitFilter] = useState(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [activeTimetableId, setActiveTimetableId] = useState(() => {
    try {
      const raw = localStorage.getItem(LS.activeTimetableId);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  });

  const changeActiveTimetable = useCallback((id) => {
    setActiveTimetableId(id);
    try { localStorage.setItem(LS.activeTimetableId, String(id)); } catch { /* quota */ }
  }, []);

  // ─── Runtime migration: biweeklyBase → biweeklyAnchors ─────────
  useEffect(() => {
    if (biweeklyBase && biweeklyAnchors.length === 0) {
      saveBiweeklyAnchors([{ date: biweeklyBase, weekType: "A" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time migration on mount
  }, []);

  // ─── Cmd+K global shortcut ─────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ─── CRUD hooks ───────────────────────────────────────────────────
  const slotsCrud = useSlotsCrud({
    slots, saveSlots, subs, saveSubs, subjects, partTimeStaff,
  });
  const subsCrud = useSubsCrud({ subs, saveSubs });
  const ttCrud = useTimetablesCrud({
    timetables, saveTimetables, slots, saveSlots,
    onRemoveActive: useCallback((deletedId) => {
      if (activeTimetableId === deletedId) changeActiveTimetable(1);
    }, [activeTimetableId, changeActiveTimetable]),
  });
  const adjCrud = useAdjustmentsCrud({ adjustments, saveAdjustments });
  const staffCrud = useStaffCrud({
    partTimeStaff,
    savePartTimeStaff,
    subs,
    slots,
    subjects,
    saveSubjects,
    subjectCategories,
    saveSubjectCategories,
    teacherSubjects,
    saveTeacherSubjects,
  });
  const dataIO = useDataIO({
    slots,
    holidays,
    biweeklyBase,
    biweeklyAnchors,
    adjustments,
    subs,
    partTimeStaff,
    subjectCategories,
    subjects,
    timetables,
    displayCutoff,
    examPeriods,
    classSets,
    teacherSubjects,
    saveSlots,
    saveHolidays,
    saveBiweeklyBase,
    saveBiweeklyAnchors,
    saveAdjustments,
    saveSubs,
    savePartTimeStaff,
    saveSubjectCategories,
    saveSubjects,
    saveTimetables,
    saveDisplayCutoff,
    saveExamPeriods,
    saveClassSets,
    saveTeacherSubjects,
    lsKeys: LS,
    setImporting,
    setShowDataMgr,
    setSelected,
    setView,
    setActiveTimetableId,
    defaultView: VIEWS.DASH,
  });

  // ─── Navigation / teacher selection ─────────────────────────────
  const selectTeacher = useCallback((t) => {
    setSelected(t);
    setView(VIEWS.WEEK);
    setSidebarOpen(false);
  }, []);

  const selectView = useCallback((v) => {
    setSelected(null);
    setView(v);
    setSidebarOpen(false);
  }, []);

  // ─── Derived data ───────────────────────────────────────────────
  const now = new Date();
  const vd = new Date(now.getFullYear(), now.getMonth() + monthOff, 1);
  const vy = vd.getFullYear();
  const vm = vd.getMonth() + 1;

  // Slots filtered by active timetable (for aggregate views that show
  // the "current" timetable rather than a specific date).
  const ttFilteredSlots = useMemo(
    () => filterSlotsByActiveTimetable(slots, timetables, activeTimetableId),
    [slots, timetables, activeTimetableId]
  );

  const teacherGroups = useTeacherGroups({ slots: ttFilteredSlots, partTimeStaff, subjects, search });

  const selDayCounts = useMemo(() => {
    if (!selected) return { total: 0, byDay: {} };
    const byDay = {};
    let total = 0;
    for (const s of ttFilteredSlots) {
      if (!isSlotForTeacher(s, selected)) continue;
      const w = slotWeight(s.note);
      byDay[s.day] = (byDay[s.day] || 0) + w;
      total += w;
    }
    return { total, byDay };
  }, [ttFilteredSlots, selected]);
  const selSlotCount = selDayCounts.total;

  // ─── Print ──────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) {
      toasts.error(
        "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
      );
      return;
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(selected || "現役部")} 授業予定</title><style>body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:16px;font-size:11px}@media print{body{padding:0}}</style></head><body>${el.innerHTML}</body></html>`
    );
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: font.stack,
        display: "flex",
        height: "100vh",
        background: colors.bg,
        color: colors.ink,
      }}
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        view={view}
        selected={selected}
        onSelectView={selectView}
        onSelectTeacher={selectTeacher}
        onOpenDataMgr={() => {
          setShowDataMgr(true);
          setSidebarOpen(false);
        }}
        onJumpToRequestedSubs={() => {
          setSelected(null);
          setView(VIEWS.SUBS);
          setSubsInitFilter({ status: "requested" });
          setSidebarOpen(false);
        }}
        search={search}
        onSearchChange={setSearch}
        teacherGroups={teacherGroups}
        subjectCategories={subjectCategories}
        slots={slots}
        subs={subs}
        isAdmin={isAdmin}
        onSignIn={signIn}
        onSignOut={signOutAdmin}
      />

      {/* Desktop sidebar spacer */}
      <div className="sidebar-spacer" style={{ width: LAYOUT.SIDEBAR_WIDTH, flexShrink: 0 }} />

      {/* Main */}
      <div className="app-main" style={{ flex: 1, overflow: "auto", padding: "16px 24px", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="サイドバーを開く"
              style={{
                background: "#1a1a2e",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: 18,
                padding: "4px 8px",
                borderRadius: 6,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <h1 className="app-h1" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {view === VIEWS.DASH
                ? "ダッシュボード"
                : view === VIEWS.ALL
                  ? "全講師コマ数一覧"
                  : view === VIEWS.COMPARE
                    ? "講師比較"
                    : view === VIEWS.TIMETABLE
                      ? "時間割管理"
                    : view === VIEWS.MASTER
                    ? "コースマスター管理"
                    : view === VIEWS.HOLIDAYS
                      ? "休講日・テスト期間管理"
                      : view === VIEWS.SUBS
                        ? "アルバイト代行管理"
                        : view === VIEWS.STAFF
                          ? "バイト管理"
                          : selected || ""}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {selected && (
              <>
                <button onClick={() => setView(VIEWS.WEEK)} style={S.btn(view === VIEWS.WEEK)}>
                  週間
                </button>
                <button
                  onClick={() => setView(VIEWS.MONTH)}
                  style={S.btn(view === VIEWS.MONTH)}
                >
                  月間
                </button>
              </>
            )}
            {selected && isAdmin && (
              <button
                onClick={() => setEditSlot("new")}
                style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
              >
                ＋ コマ追加
              </button>
            )}
            <TimetableSelector
              timetables={timetables}
              activeTimetableId={activeTimetableId}
              onChange={changeActiveTimetable}
            />
            <button
              type="button"
              onClick={handlePrint}
              aria-label="現在のビューを印刷"
              style={{ ...S.btn(false), border: "1px solid #ccc" }}
            >
              🖨 印刷
            </button>
          </div>
        </div>

        {selected && view === VIEWS.MONTH && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <button
              onClick={() => setMonthOff((o) => o - 1)}
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
            >
              ◀
            </button>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {vy}年{vm}月
            </span>
            <button
              onClick={() => setMonthOff((o) => o + 1)}
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
            >
              ▶
            </button>
            <button
              onClick={() => setMonthOff(0)}
              style={{ ...S.btn(false), fontSize: 11 }}
            >
              今月
            </button>
          </div>
        )}

        {selected && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {DAYS.map((d) => {
              const cnt = selDayCounts.byDay[d] || 0;
              return (
                <div
                  key={d}
                  style={{
                    background: cnt ? DB[d] : "#f5f5f5",
                    border: `2px solid ${cnt ? DC[d] : "#ddd"}`,
                    borderRadius: 8,
                    padding: "4px 12px",
                    textAlign: "center",
                    minWidth: 42,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: DC[d] }}>{d}</div>
                  <div
                    style={{ fontSize: 18, fontWeight: 800, color: cnt ? "#1a1a2e" : "#ccc" }}
                  >
                    {formatCount(cnt)}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                background: "#1a1a2e",
                borderRadius: 8,
                padding: "4px 12px",
                textAlign: "center",
                minWidth: 42,
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800 }}>週計</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{formatCount(selSlotCount)}</div>
            </div>
          </div>
        )}

        <div id="main-content">
          <Suspense fallback={<ViewFallback />}>
          {view === VIEWS.DASH && !selected && (
            <Dashboard
              slots={slots}
              holidays={holidays}
              subs={subs}
              timetables={timetables}
              displayCutoff={displayCutoff}
              examPeriods={examPeriods}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              activeTimetableId={activeTimetableId}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              subjectCategories={subjectCategories}
              teacherSubjects={teacherSubjects}
              saveSubs={saveSubs}
            />
          )}
          {view === VIEWS.ALL && !selected && (
            <AllView slots={ttFilteredSlots} onSelectTeacher={selectTeacher} />
          )}
          {view === VIEWS.COMPARE && !selected && (
            <CompareView slots={ttFilteredSlots} />
          )}
          {view === VIEWS.MASTER && !selected && (
            <MasterView
              slots={slots}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              onNew={() => setEditSlot("new")}
              biweeklyAnchors={biweeklyAnchors}
              onSetBiweeklyAnchors={saveBiweeklyAnchors}
              isAdmin={isAdmin}
              timetables={timetables}
              activeTimetableId={activeTimetableId}
              saveSlots={saveSlots}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              holidays={holidays}
              examPeriods={examPeriods}
              classSets={classSets}
              displayCutoff={displayCutoff}
            />
          )}
          {view === VIEWS.TIMETABLE && !selected && (
            <TimetableManagerView
              timetables={timetables}
              displayCutoff={displayCutoff}
              slots={slots}
              classSets={classSets}
              onSaveClassSets={saveClassSets}
              ttCrud={ttCrud}
              onSaveDisplayCutoff={saveDisplayCutoff}
              isAdmin={isAdmin}
            />
          )}
          {view === VIEWS.HOLIDAYS && !selected && (
            <>
              <HolidayManager holidays={holidays} slots={slots} onSave={saveHolidays} isAdmin={isAdmin} />
              <ExamPeriodManager examPeriods={examPeriods} onSave={saveExamPeriods} isAdmin={isAdmin} />
            </>
          )}
          {view === VIEWS.SUBS && !selected && (
            <SubstituteView
              subs={subs}
              slots={slots}
              holidays={holidays}
              partTimeStaff={partTimeStaff}
              onNew={() => setEditSub("new")}
              onEdit={setEditSub}
              onDel={subsCrud.del}
              onGoToStaffView={() => setView(VIEWS.STAFF)}
              initFilter={subsInitFilter}
              onConsumeInitFilter={() => setSubsInitFilter(null)}
              isAdmin={isAdmin}
              saveSubs={saveSubs}
              examPeriods={examPeriods}
              subjects={subjects}
              subjectCategories={subjectCategories}
              timetables={timetables}
              activeTimetableId={activeTimetableId}
              biweeklyAnchors={biweeklyAnchors}
              teacherSubjects={teacherSubjects}
              classSets={classSets}
              displayCutoff={displayCutoff}
              onAddAdjustment={adjCrud.add}
            />
          )}
          {view === VIEWS.CONFIRMED_SUBS && !selected && (
            <ConfirmedSubsView slots={slots} holidays={holidays} subs={subs} timetables={timetables} displayCutoff={displayCutoff} examPeriods={examPeriods} />
          )}
          {view === VIEWS.STAFF && !selected && (
            <StaffManagerView
              partTimeStaff={partTimeStaff}
              teacherSubjects={teacherSubjects}
              subjectCategories={subjectCategories}
              subjects={subjects}
              slots={slots}
              subs={subs}
              holidays={holidays}
              examPeriods={examPeriods}
              onAddStaff={staffCrud.addStaff}
              onDelStaff={staffCrud.delStaff}
              onToggleStaffSubject={staffCrud.toggleStaffSubject}
              onSaveCategory={staffCrud.saveCategory}
              onDelCategory={staffCrud.delCategory}
              onSaveSubject={staffCrud.saveSubject}
              onDelSubject={staffCrud.delSubject}
              isAdmin={isAdmin}
            />
          )}
          {selected && view === VIEWS.WEEK && (
            <WeekView
              teacher={selected}
              slots={ttFilteredSlots}
              subs={subs}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              isAdmin={isAdmin}
            />
          )}
          {selected && view === VIEWS.MONTH && (
            <MonthView
              teacher={selected}
              slots={slots}
              holidays={holidays}
              subs={subs}
              year={vy}
              month={vm}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              isAdmin={isAdmin}
              timetables={timetables}
              displayCutoff={displayCutoff}
              examPeriods={examPeriods}
            />
          )}
          </Suspense>
        </div>
      </div>

      {/* Edit Modal */}
      {editSlot && (
        <Modal
          title={editSlot === "new" ? "コマを追加" : "コマを編集"}
          onClose={() => setEditSlot(null)}
        >
          <SlotForm
            slot={editSlot === "new" ? null : editSlot}
            onSave={(f) => slotsCrud.save(editSlot, f, setEditSlot)}
            onCancel={() => setEditSlot(null)}
            suggestions={slotsCrud.suggestions}
            timetables={timetables}
            activeTimetableId={activeTimetableId}
          />
        </Modal>
      )}

      {/* Substitute Edit Modal */}
      {editSub && (
        <Modal
          title={editSub === "new" ? "代行を追加" : "代行を編集"}
          onClose={() => setEditSub(null)}
        >
          <Suspense fallback={<ViewFallback />}>
            <SubstituteForm
              sub={editSub === "new" ? null : editSub}
              slots={slots}
              subs={subs}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              onSave={(f) => subsCrud.save(editSub, f, setEditSub)}
              onCancel={() => setEditSub(null)}
            />
          </Suspense>
        </Modal>
      )}

      {/* Data Manager Modal */}
      {showDataMgr && (
        <Modal title="データ管理" onClose={() => setShowDataMgr(false)}>
          <Suspense fallback={<ViewFallback />}>
            <DataManager
              slots={slots}
              holidays={holidays}
              subs={subs}
              onExport={dataIO.handleExport}
              onImport={dataIO.handleImport}
              onReset={dataIO.handleReset}
              importing={importing}
            />
          </Suspense>
        </Modal>
      )}

      {/* Command Palette (Cmd+K) — lazy-loaded; only mount when open so
          the initial bundle doesn't pull in search/filter utilities. */}
      {cmdPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={cmdPaletteOpen}
            onClose={() => setCmdPaletteOpen(false)}
            slots={slots}
            subs={subs}
            onSelectTeacher={(t) => {
              selectTeacher(t);
              setCmdPaletteOpen(false);
            }}
            onSelectView={(v) => {
              selectView(v);
              setCmdPaletteOpen(false);
            }}
            views={VIEWS}
          />
        </Suspense>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (min-width: 769px) {
          .sidebar { left: 0 !important; position: fixed !important; }
          .sidebar-close { display: none !important; }
          .sidebar-backdrop { display: none !important; }
          .hamburger { display: none !important; }
        }
        @media (max-width: 768px) {
          .sidebar-spacer { display: none !important; }
          .dash-sections { grid-template-columns: 1fr !important; }
          .excel-grid-sections { grid-template-columns: 1fr !important; }
          .master-slot-actions { opacity: 1 !important; }
          .sidebar { width: min(85vw, 280px) !important; }
          /* 閉状態の left をモバイル幅に同期 (インライン left: -220 を上書き) */
          .sidebar.is-closed { left: calc(-1 * min(85vw, 280px) - 8px) !important; }
          .app-main { padding: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important; }
          .app-h1 { font-size: 16px !important; }
        }
        @media (max-width: 480px) {
          body { font-size: 14px; }
          /* iOS Safari prevents auto-zoom only when input font-size >= 16px。
             checkbox/radio/range/color は見た目が font-size に連動すると困るため除外。 */
          input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
          select, textarea { font-size: 16px !important; }
          button, [role="button"] { min-height: 40px !important; touch-action: manipulation; }
          .app-main { padding: 10px !important; padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important; }
          .app-h1 { font-size: 15px !important; }
          .mobile-stack { flex-direction: column !important; align-items: stretch !important; }
          .mobile-stack > * { width: 100% !important; }
          .mobile-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .mobile-card-pad { padding: 16px !important; }
          .slot-form-row { flex-direction: column !important; align-items: stretch !important; gap: 4px !important; }
          .slot-form-row > label { width: auto !important; text-align: left !important; }
          .slot-form-row > input, .slot-form-row > select { width: 100% !important; min-width: 0 !important; }
          .slot-form-row-error { margin-left: 0 !important; }
        }
        @media (hover: none) {
          .master-slot-actions { opacity: 1 !important; }
        }
        /* print ルールは mobile ルールの後に置き、印刷時にスマホ用の
           font-size: 16px が勝たないようにする (source order で優先) */
        @media print {
          .sidebar, .sidebar-spacer, .hamburger { display: none !important; }
          .dash-sections { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .master-slot-actions { display: none !important; }
          .no-print { display: none !important; }
          body { font-size: 10px !important; }
          input, select, textarea { font-size: 10px !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
