import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { VIEW_CHORDS, CHORD_TIMEOUT_MS } from "./constants/chords";
import { useSyncedStorage, useSyncedStorageRaw } from "./hooks/useSyncedStorage";
import { useBuilderProject } from "./hooks/useBuilderProject";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useTeacherGroups } from "./hooks/useTeacherGroups";
import { STAFF_GROUP_KEY } from "./utils/groupTeacherNames";
import { useToasts } from "./hooks/useToasts";
import { useConfirm } from "./hooks/useConfirm";
import { useChordNavigation } from "./hooks/useChordNavigation";
import { ChordWaitingBadge } from "./components/ChordWaitingBadge";
import { useAuth } from "./hooks/useAuth";
import { useSlotsCrud } from "./hooks/useSlotsCrud";
import { useSubsCrud } from "./hooks/useSubsCrud";
import { useAdjustmentsCrud } from "./hooks/useAdjustmentsCrud";
import { useSessionOverridesCrud } from "./hooks/useSessionOverridesCrud";
import { useTimetablesCrud } from "./hooks/useTimetablesCrud";
import { useStaffCrud } from "./hooks/useStaffCrud";
import { useExamPrepSchedulesCrud } from "./hooks/useExamPrepSchedulesCrud";
import {
  useDataIO,
  migrateDaySchedules,
  migrateDisplayCutoff,
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
} from "./hooks/useDataIO";
import { DEFAULT_TIMETABLE, DEFAULT_DISPLAY_CUTOFF } from "./utils/schema";
import { filterSlotsByActiveTimetable } from "./utils/timetable";
import { slotWeight, formatCount, isSlotForTeacher } from "./utils/biweekly";
import { deriveTagFiltersForTeacher } from "./utils/teacherTags";
import { buildKoshuLessons } from "./utils/builderLessons";
import { colors, font, S } from "./styles/common";
import { LS, SS } from "./constants/storageKeys";
import { LAYOUT } from "./constants/layout";
import { EVENT_KIND } from "./constants/eventKinds";
import { DEFAULT_EVENT_VISIBILITY } from "./components/EventVisibilityToggles";
import { escapeHtml } from "./utils/escape";
import { dateToDay, fmtDate } from "./utils/dateHelpers";
import {
  buildBatchDocTitle,
  buildBatchPrintBodyHtml,
  buildMonthHeaderHtml,
  buildMonthLabel,
  buildPrintStyles,
  buildTimetableHeaderHtml,
  formatPrintDate,
} from "./utils/printStyles";
import { sortJa } from "./utils/sortJa";
import { applyOrphanCleanup } from "./utils/orphanCleanup";

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
const AbsenceWorkflowView = lazy(() =>
  import("./components/views/AbsenceWorkflowView").then((m) => ({
    default: m.AbsenceWorkflowView,
  }))
);
// 旧 jikanwarikun を timetable-builder/ として取り込み。
// 講習 (夏・冬・春) 用の時間割を MRV+バックトラッキングで自動生成する。
// 親アプリの Slot/Sub データには触れず、独自に LocalStorage + RTDB
// (appData/builder) で永続化。親アプリ側は useBuilderProject でこれを
// 読み取り専用購読し、個人月間スケジュールへ講習コマとして反映する
// (utils/builderLessons — 書き戻しは無く、正は常に builder 側)。
const BuilderApp = lazy(() => import("./timetable-builder/BuilderApp"));
// 通常時間割 (曜日ベース) を講習ビルダーの操作感で設計する専用ビュー。
// 下書きは appData/genyakubu-regular-builder-project に独立保存し、
// 「本体へ反映」で Timetable + Slot に書き出す (regular-builder/reflect)。
const RegularBuilderApp = lazy(() => import("./regular-builder/RegularBuilderApp"));

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
const SpecialEventManager = lazy(() =>
  import("./components/SpecialEventManager").then((m) => ({ default: m.SpecialEventManager }))
);
const ExtraLessonManager = lazy(() =>
  import("./components/ExtraLessonManager").then((m) => ({ default: m.ExtraLessonManager }))
);
const DayScheduleManager = lazy(() =>
  import("./components/DayScheduleManager").then((m) => ({ default: m.DayScheduleManager }))
);
const EventCalendarView = lazy(() =>
  import("./components/views/EventCalendarView").then((m) => ({ default: m.EventCalendarView }))
);
const DataManager = lazy(() =>
  import("./components/DataManager").then((m) => ({ default: m.DataManager }))
);
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);
const ShortcutsHelp = lazy(() =>
  import("./components/ShortcutsHelp").then((m) => ({ default: m.ShortcutsHelp }))
);
const BatchPrintDialog = lazy(() =>
  import("./components/BatchPrintDialog").then((m) => ({ default: m.BatchPrintDialog }))
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

// 全講師ビュー以外のヘッダタイトル。teacher 選択中は別ロジック。
const VIEW_TITLES = {
  [VIEWS.DASH]: "ダッシュボード",
  [VIEWS.ALL]: "全講師コマ数一覧",
  [VIEWS.COMPARE]: "講師比較",
  [VIEWS.TIMETABLE]: "時間割管理",
  [VIEWS.MASTER]: "コースマスター管理",
  [VIEWS.HOLIDAYS]: "休講・テスト期間・イベント",
  [VIEWS.EVENTS]: "イベントカレンダー",
  [VIEWS.SUBS]: "授業管理",
  [VIEWS.CONFIRMED_SUBS]: "代行確定一覧",
  [VIEWS.ABSENCE_FLOW]: "欠勤組み換え",
  [VIEWS.STAFF]: "バイト管理",
  [VIEWS.BUILDER]: "講習時間割作成",
  [VIEWS.REGULAR_BUILDER]: "通常時間割作成",
};

export default function App() {
  const toasts = useToasts();
  const confirm = useConfirm();
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
    { migrate: migrateDisplayCutoff, onError: onStorageError }
  );
  const [examPeriods, saveExamPeriods] = useSyncedStorage(
    LS.examPeriods,
    [],
    { migrate: migrateExamPeriods, onError: onStorageError }
  );
  const [examPrepSchedules, saveExamPrepSchedules] = useSyncedStorage(
    LS.examPrepSchedules,
    [],
    { migrate: migrateExamPrepSchedules, onError: onStorageError }
  );
  const [classSets, saveClassSets] = useSyncedStorage(
    LS.classSets,
    [],
    { onError: onStorageError }
  );
  const [sessionOverrides, saveSessionOverrides] = useSyncedStorage(
    LS.sessionOverrides,
    [],
    { onError: onStorageError }
  );
  const [teacherSubjects, saveTeacherSubjects] = useSyncedStorage(
    LS.teacherSubjects,
    {},
    { onError: onStorageError }
  );
  const [specialEvents, saveSpecialEvents] = useSyncedStorage(
    LS.specialEvents,
    [],
    { migrate: migrateSpecialEvents, onError: onStorageError }
  );
  const [extraLessons, saveExtraLessons] = useSyncedStorage(
    LS.extraLessons,
    [],
    { onError: onStorageError }
  );
  const [daySchedules, saveDaySchedules] = useSyncedStorage(
    LS.daySchedules,
    [],
    { migrate: migrateDaySchedules, onError: onStorageError }
  );
  // 表示トグルは「人 (端末) 単位の見え方」が望ましいので、Firebase 同期せず
  // localStorage 限定にする (高校部担当 / 担当外で初期表示が違うのを許容)。
  const [eventVisibility, saveEventVisibility] = useLocalStorage(
    LS.eventVisibility,
    DEFAULT_EVENT_VISIBILITY,
    { onError: onStorageError }
  );

  // 講習時間割作成 (builder) の project を読み取り専用で購読し、個人月間
  // スケジュール (MonthView) に載せる講習コマへ変換する。編集は builder 側。
  // 日付ラベルの年は project.updatedAt を基準に推定するため todayYmd は
  // updatedAt/createdAt を持たない外部 JSON 由来データの保険にすぎない。
  const builderProject = useBuilderProject();
  const koshuLessons = useMemo(
    () => buildKoshuLessons(builderProject, { todayYmd: fmtDate(new Date()) }),
    [builderProject]
  );

  // タグ別フィルタ用の候補一覧。テスト期間 + 特別イベント の両方から
  // 重複なく抽出 (五十音順)。タグは両者で共有する空間として扱う。
  const availableTags = useMemo(() => {
    const set = new Set();
    for (const ep of examPeriods) {
      for (const t of ep.tags || []) if (t) set.add(t);
    }
    for (const ev of specialEvents) {
      for (const t of ev.tags || []) if (t) set.add(t);
    }
    return sortJa([...set]);
  }, [examPeriods, specialEvents]);

  // ─── UI state ─────────────────────────────────────────────────────
  // view / selected はリロードしても直前の画面を維持する (sessionStorage
  // なのでタブ単位 — 新しいタブで開いたときは従来どおりダッシュボード)。
  const [selected, setSelected] = useState(() => {
    try {
      return sessionStorage.getItem(SS.teacher) || null;
    } catch {
      return null;
    }
  });
  const [view, setView] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SS.view);
      if (!Object.values(VIEWS).includes(saved)) return VIEWS.DASH;
      // WEEK / MONTH は講師選択中専用ビュー。講師なしで復元すると
      // 空画面になるため、その場合はダッシュボードに倒す。
      if (
        (saved === VIEWS.WEEK || saved === VIEWS.MONTH) &&
        !sessionStorage.getItem(SS.teacher)
      ) {
        return VIEWS.DASH;
      }
      return saved;
    } catch {
      return VIEWS.DASH;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(SS.view, view);
      if (selected) sessionStorage.setItem(SS.teacher, selected);
      else sessionStorage.removeItem(SS.teacher);
    } catch {
      /* private mode 等で保存できなくても画面遷移自体は妨げない */
    }
  }, [view, selected]);
  const [monthOff, setMonthOff] = useState(0);
  const [search, setSearch] = useState("");
  const [editSlot, setEditSlot] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDataMgr, setShowDataMgr] = useState(false);
  const [importing, setImporting] = useState(false);
  const [subsInitFilter, setSubsInitFilter] = useState(null);
  // 一覧から欠勤振替画面へ遷移するときの初期日 (YYYY-MM-DD)
  const [absenceFlowInitDate, setAbsenceFlowInitDate] = useState(null);
  // EventCalendar / CommandPalette などからの編集要求 ({ kind, id })
  const [eventEditRequest, setEventEditRequest] = useState(null);
  // EventCalendar からの「新規登録フォームを開く」要求 ({ kind, token })。
  // token は単調増加カウンタで、同じ kind を連続クリックしても useEffect が再発火するよう毎回別値にする。
  const [eventNewRequest, setEventNewRequest] = useState(null);
  const eventNewTokenRef = useRef(0);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  // 講師一括印刷ダイアログ。busy 中は閉じられないようロックする。
  // progress は { current, total, name } を持ち、ダイアログで <progress>
  // 要素として描画する。abortRef は中断ボタンから for ループへの伝達役。
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchPrintBusy, setBatchPrintBusy] = useState(false);
  const [batchPrintProgress, setBatchPrintProgress] = useState({
    current: 0,
    total: 0,
    name: "",
  });
  const batchPrintAbortRef = useRef(null);
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

  // ─── Global shortcuts ──────────────────────────────────────────
  // Cmd+K: コマンドパレット / ?: ショートカットヘルプ
  // フォーカスが入力要素にあるときや、他のダイアログが既に開いているときは
  // ? を無効化する (文字入力や既存モーダルの Esc 処理を妨げない)。
  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };
    const hasOpenDialog = () =>
      !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;
        // 他のダイアログ (Modal / CommandPalette / ShortcutsHelp 自身)
        // が開いている場合は、その Esc 処理に委ねるため握りつぶす。
        if (hasOpenDialog()) return;
        e.preventDefault();
        setShortcutsHelpOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ─── CRUD hooks ───────────────────────────────────────────────────
  const slotsCrud = useSlotsCrud({
    slots,
    saveSlots,
    subs,
    saveSubs,
    subjects,
    partTimeStaff,
    adjustments,
    saveAdjustments,
    sessionOverrides,
    saveSessionOverrides,
  });
  const subsCrud = useSubsCrud({ subs, saveSubs });
  const ttCrud = useTimetablesCrud({
    timetables, saveTimetables, slots, saveSlots,
    classSets, saveClassSets,
    onRemoveActive: useCallback((deletedId) => {
      if (activeTimetableId === deletedId) changeActiveTimetable(1);
    }, [activeTimetableId, changeActiveTimetable]),
  });
  const adjCrud = useAdjustmentsCrud({ adjustments, saveAdjustments });
  const overridesCrud = useSessionOverridesCrud({
    sessionOverrides,
    saveSessionOverrides,
  });
  const examPrepCrud = useExamPrepSchedulesCrud({
    examPrepSchedules,
    saveExamPrepSchedules,
  });
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
    examPrepSchedules,
    saveExamPrepSchedules,
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
    examPrepSchedules,
    classSets,
    sessionOverrides,
    teacherSubjects,
    specialEvents,
    extraLessons,
    daySchedules,
    activeTimetableId,
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
    saveExamPrepSchedules,
    saveClassSets,
    saveSessionOverrides,
    saveTeacherSubjects,
    saveSpecialEvents,
    saveExtraLessons,
    saveDaySchedules,
    lsKeys: LS,
    setImporting,
    setShowDataMgr,
    setSelected,
    setView,
    setActiveTimetableId,
    defaultView: VIEWS.DASH,
  });

  // Slots filtered by active timetable (for aggregate views that show
  // the "current" timetable rather than a specific date).
  // selectTeacher のタグ導出でも参照するため Navigation より前に置く。
  const ttFilteredSlots = useMemo(
    () => filterSlotsByActiveTimetable(slots, timetables, activeTimetableId),
    [slots, timetables, activeTimetableId]
  );

  // ─── Navigation / teacher selection ─────────────────────────────
  // 講師の個人スケジュールを開くときの既定ビューは月間 (MONTH)。
  // あわせてタグフィルタ (eventVisibility.tagFilters) を担当コマから導出した
  // 初期値にリセットする: 学校系タグは本人の担当コマに関係するものだけ ON、
  // 授業データから判定できない自由タグは既定 ON のまま (utils/teacherTags)。
  // 手動トグルは次に講師を選択するまで有効。
  const selectTeacher = useCallback(
    (t) => {
      setSelected(t);
      setView(VIEWS.MONTH);
      setSidebarOpen(false);
      saveEventVisibility((p) => ({
        ...(p || {}),
        tagFilters: deriveTagFiltersForTeacher({
          teacher: t,
          slots: ttFilteredSlots,
          tags: availableTags,
        }),
      }));
    },
    [ttFilteredSlots, availableTags, saveEventVisibility]
  );

  const selectView = useCallback((v) => {
    setSelected(null);
    setView(v);
    setSidebarOpen(false);
  }, []);

  // 一覧 (合同授業 / 回数補正など) から欠勤振替画面の特定日へ遷移する。
  const jumpToAbsenceFlow = useCallback(
    (date) => {
      setAbsenceFlowInitDate(date || null);
      selectView(VIEWS.ABSENCE_FLOW);
    },
    [selectView]
  );

  // データ管理モーダルから「孤立データ一括掃除」を実行する。
  // バッチ destructive 操作 (CLAUDE.md 「cascade ありは confirmedRemove」
  // ルール) に該当するため、適用前に確認ダイアログを挟む。
  const handleCleanupOrphans = useCallback(
    async (detection) => {
      if (!detection || detection.total === 0) return;
      const summary = [];
      if (detection.orphanSubs.length)
        summary.push(`・代行記録: ${detection.orphanSubs.length} 件 (削除)`);
      if (detection.orphanAdjustments.length)
        summary.push(`・時間割調整: ${detection.orphanAdjustments.length} 件 (削除)`);
      if (detection.updatedAdjustments.length)
        summary.push(
          `・合同授業: ${detection.updatedAdjustments.length} 件 (削除済みコマを除外)`
        );
      if (detection.orphanOverrides.length)
        summary.push(`・回数補正: ${detection.orphanOverrides.length} 件 (削除)`);
      const ok = await confirm({
        title: "孤立データを掃除",
        message: `次の孤立データを掃除します:\n\n${summary.join("\n")}\n\n実行しますか？`,
        okLabel: "実行",
        tone: "danger",
      });
      if (!ok) return;
      const { nextSubs, nextAdjustments, nextOverrides } = applyOrphanCleanup({
        subs,
        adjustments,
        sessionOverrides,
        detection,
      });
      if (detection.orphanSubs.length > 0) saveSubs(nextSubs);
      if (
        detection.orphanAdjustments.length > 0 ||
        detection.updatedAdjustments.length > 0
      ) {
        saveAdjustments(nextAdjustments);
      }
      if (detection.orphanOverrides.length > 0) saveSessionOverrides(nextOverrides);
      const parts = [];
      if (detection.orphanSubs.length)
        parts.push(`代行 ${detection.orphanSubs.length} 件`);
      if (detection.orphanAdjustments.length)
        parts.push(`調整 ${detection.orphanAdjustments.length} 件`);
      if (detection.updatedAdjustments.length)
        parts.push(`合同 ${detection.updatedAdjustments.length} 件更新`);
      if (detection.orphanOverrides.length)
        parts.push(`回数補正 ${detection.orphanOverrides.length} 件`);
      toasts.success(`孤立データを掃除しました (${parts.join(" / ")})`);
    },
    [
      confirm,
      subs,
      adjustments,
      sessionOverrides,
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
      toasts,
    ]
  );

  // ─── g-prefix chord navigation ──────────────────────────────────
  // `g` を押した直後の 1.2 秒以内に 2 キー目を押すと、対応するビューへ遷移する。
  // 入力要素・モーダル表示中は無効化して、文字入力やダイアログ操作を妨げない。
  // タイムアウト時は ShortcutsHelp を開く（chord 忘れ救済 = A14）。
  //
  // WEEK / MONTH は「講師選択中」専用ビューなので、selected が無いまま飛ぶと
  // 空画面になる。chord ハンドラ側で:
  //   - selected が null なら g w / g o は no-op (誤操作で講師を失わない)
  //   - selected がある場合は selected を保ったまま view だけ切り替える
  const handleChordMatch = useCallback(
    (v) => {
      if (v === VIEWS.WEEK || v === VIEWS.MONTH) {
        if (!selected) return;
        setView(v);
        setSidebarOpen(false);
        return;
      }
      selectView(v);
    },
    [selected, selectView]
  );
  const { waiting: chordWaiting, reset: resetChord } = useChordNavigation({
    chordMap: VIEW_CHORDS,
    onMatch: handleChordMatch,
    onTimeout: useCallback(() => setShortcutsHelpOpen(true), []),
    timeoutMs: CHORD_TIMEOUT_MS,
  });

  // モーダル／パレットが開いたら chord 待機を即クリア。
  // バッジが最大 1.2 秒間モーダル上に残留するのを防ぐ。
  useEffect(() => {
    if (cmdPaletteOpen || shortcutsHelpOpen) {
      resetChord();
    }
  }, [cmdPaletteOpen, shortcutsHelpOpen, resetChord]);

  // ─── Derived data ───────────────────────────────────────────────
  const now = new Date();
  const vd = new Date(now.getFullYear(), now.getMonth() + monthOff, 1);
  const vy = vd.getFullYear();
  const vm = vd.getMonth() + 1;

  const teacherGroups = useTeacherGroups({ slots: ttFilteredSlots, partTimeStaff, subjects, search });

  // 一括印刷ダイアログに出す「バイト以外の講師」(常勤講師) の教科別グループ。
  // サイドバーの teacherGroups は検索文字列でフィルタされるため、search を
  // 空にした全量から「バイト」グループだけ除いたものを渡す。
  const allTeacherGroups = useTeacherGroups({
    slots: ttFilteredSlots,
    partTimeStaff,
    subjects,
    search: "",
  });
  const fulltimeGroups = useMemo(
    () => allTeacherGroups.filter((g) => g.key !== STAFF_GROUP_KEY),
    [allTeacherGroups]
  );

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
  // popup window を開いて #main-content の innerHTML をコピーし、
  // ビュー別の印刷スタイルとヘッダ HTML を注入してから print() を呼ぶ。
  // CSS / HTML ビルダは `utils/printStyles` に切り出してテスト可能にしている。
  // (各ビューの PrintButton はメインドキュメント側を直接 window.print() する
  // 別系統。ヘッダや凡例の整った印刷物が必要なビューはこちらを使う。)
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
    const dateInput = el.querySelector('input[type="date"]');
    const printDate = dateInput?.value || "";
    const printDay = printDate ? dateToDay(printDate) : "";
    // 紙面ヘッダは和式 (YYYY年MM月DD日（曜）) に統一 (E1h)
    const dateText = printDate ? formatPrintDate(printDate, printDay) : "";
    const dateLabel = printDate
      ? `${printDate}${printDay ? `（${printDay}）` : ""} 授業予定`
      : "授業予定";
    const hasTimetableGrid = !!el.querySelector(".excel-print-col-ms");
    const hasMonthView =
      view === VIEWS.MONTH && !!el.querySelector(".month-print-root");
    const docTitle = hasMonthView
      ? buildMonthLabel({ teacher: selected, year: vy, month: vm })
      : selected
        ? `${selected} 授業予定`
        : dateLabel;

    const printStyles = buildPrintStyles({ hasTimetableGrid, hasMonthView });

    let bodyHtml = el.innerHTML;
    if (hasTimetableGrid) {
      // 中学/高校で別々のヘッダを注入する (印刷時は別ページ)。各ヘッダには
      // セクション名・日付・印刷日・講師名 (選択中のみ) を載せる。
      const msHeader = buildTimetableHeaderHtml({
        section: "中学",
        dateText,
        selected,
      });
      const hsHeader = buildTimetableHeaderHtml({
        section: "高校",
        dateText,
        selected,
      });
      bodyHtml = bodyHtml.replace(
        /(<div[^>]*class="[^"]*\bexcel-print-col-ms\b[^"]*"[^>]*>)/,
        `${msHeader}$1`
      );
      bodyHtml = bodyHtml.replace(
        /(<div[^>]*class="[^"]*\bexcel-print-col-hs\b[^"]*"[^>]*>)/,
        `${hsHeader}$1`
      );
    }
    if (hasMonthView) {
      const header = buildMonthHeaderHtml({
        teacher: selected,
        year: vy,
        month: vm,
        visibility: eventVisibility,
      });
      bodyHtml = bodyHtml.replace(
        /(<div[^>]*class="[^"]*\bmonth-print-root\b[^"]*"[^>]*>)/,
        `${header}$1`
      );
    }

    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>${printStyles}</style></head><body>${bodyHtml}</body></html>`
    );
    w.document.close();
    // 印刷ダイアログが閉じたらポップアップも自動で閉じる (取り消した場合含む)。
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 300);
  };

  // ─── Batch Print ────────────────────────────────────────────────
  // 講師 (バイト + 常勤) を複数選択して各人の月次予定を 1 ジョブに
  // まとめて印刷する。months ({year, month}[] 昇順) を複数選ぶと
  // 講師ごとに各月 1 枚ずつ連続で出す (配布時に人単位で束ねやすい順)。
  // selected / monthOff (現在の MonthView 表示講師・表示月) を順次
  // 差し替えて React に再描画させ、各回の .month-print-root の outerHTML
  // をスナップショット。全員ぶん集まったら popup window に流し込んで
  // window.print() する。終了後は元の selected / view / monthOff に戻す。
  //
  // popup は user gesture (ボタンクリック) 直下で開かないと Safari/Firefox
  // でブロックされやすい。await を挟む前に先に window.open しておく。
  //
  // 途中中断は AbortController 経由で handleBatchPrintAbort から signal を
  // 立てて、ループ先頭で aborted を見て break する。
  const handleBatchPrintAbort = useCallback(() => {
    batchPrintAbortRef.current?.abort();
  }, []);

  const handleBatchPrint = useCallback(
    async (teachers, months) => {
      if (!Array.isArray(teachers) || teachers.length === 0) return;
      // months 未指定 (旧呼び出し互換) は現在表示中の月のみ。
      const monthList =
        Array.isArray(months) && months.length > 0
          ? months
          : [{ year: vy, month: vm }];
      const w = window.open("", "_blank");
      if (!w) {
        toasts.error(
          "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
        );
        return;
      }
      const ac = new AbortController();
      batchPrintAbortRef.current = ac;
      const savedSelected = selected;
      const savedView = view;
      const savedMonthOff = monthOff;
      // monthOff は「今日の月」からのオフセット。対象年月 → monthOff の
      // 変換基準も同じく今日にする。
      const base = new Date();
      const offsetOf = (y, m) =>
        (y - base.getFullYear()) * 12 + (m - 1 - base.getMonth());
      // 講師ごとに各月を連続で出す (人単位で束ねて配布できる紙順)。
      const jobs = [];
      for (const t of teachers) {
        for (const mo of monthList) {
          jobs.push({ teacher: t, year: mo.year, month: mo.month });
        }
      }
      setBatchPrintBusy(true);
      setBatchPrintProgress({ current: 0, total: jobs.length, name: "" });
      try {
        const slides = [];
        for (let i = 0; i < jobs.length; i++) {
          if (ac.signal.aborted) break;
          const { teacher: t, year: jy, month: jm } = jobs[i];
          setBatchPrintProgress({
            current: i + 1,
            total: jobs.length,
            name: monthList.length > 1 ? `${t}・${jm}月` : t,
          });
          // flushSync で同期的にコミット → DOM が更新されてから outerHTML を取る。
          flushSync(() => {
            setSelected(t);
            setMonthOff(offsetOf(jy, jm));
            setView(VIEWS.MONTH);
          });
          // useMemo の再評価が DOM へ反映されるまで 2 フレーム待つ
          // (1 frame だと concurrent rendering で間に合わないケースの保険)。
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r))
          );
          if (ac.signal.aborted) break;
          const root = document.querySelector(".month-print-root");
          if (!root) continue;
          slides.push({
            teacher: t,
            headerHtml: buildMonthHeaderHtml({
              teacher: t,
              year: jy,
              month: jm,
              visibility: eventVisibility,
            }),
            monthRootHtml: root.outerHTML,
          });
        }

        if (ac.signal.aborted) {
          toasts.info("一括印刷を中断しました");
          w.close();
          return;
        }

        if (slides.length === 0) {
          toasts.error("印刷データを生成できませんでした。");
          w.close();
          return;
        }

        const printStyles = buildPrintStyles({
          hasTimetableGrid: false,
          hasMonthView: true,
        });
        const bodyHtml = buildBatchPrintBodyHtml({ slides });
        const nameCount = new Set(slides.map((s) => s.teacher)).size;
        const docTitle = buildBatchDocTitle({ nameCount, months: monthList });
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>${printStyles}</style></head><body>${bodyHtml}</body></html>`
        );
        w.document.close();
        w.onafterprint = () => w.close();
        setTimeout(() => w.print(), 300);
      } finally {
        // 元の選択状態 / view / 表示月に戻す。null だった場合も含めそのまま代入。
        batchPrintAbortRef.current = null;
        setSelected(savedSelected);
        setView(savedView);
        setMonthOff(savedMonthOff);
        setBatchPrintBusy(false);
        setBatchPrintProgress({ current: 0, total: 0, name: "" });
        setBatchPrintOpen(false);
      }
    },
    [selected, view, monthOff, vy, vm, eventVisibility, toasts]
  );

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div
      className="app-shell"
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
              {selected ? selected : VIEW_TITLES[view] || ""}
            </h1>
          </div>
          {/* 操作ボタン群は紙面に不要 (window.print() 系の印刷で写り込んでいた) */}
          <div
            className="no-print"
            style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}
          >
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
            {/* §M: 講習時間割作成 (BUILDER) はツールバー自前の 🖨️
                (window.print() 系統) を持つ。popup 系のこのボタンは builder の
                Tailwind CSS が popup に注入されず無スタイルで刷られるため隠す。
                通常時間割作成 (REGULAR_BUILDER) も入力フィールド主体で popup
                印刷に耐えない (input の値は innerHTML に載らない) ため隠す。 */}
            {view !== VIEWS.BUILDER && view !== VIEWS.REGULAR_BUILDER && (
              <button
                type="button"
                onClick={handlePrint}
                aria-label="現在のビューを印刷"
                style={{ ...S.btn(false), border: "1px solid #ccc" }}
              >
                🖨 印刷
              </button>
            )}
            {view === VIEWS.MONTH && (
              <button
                type="button"
                onClick={() => setBatchPrintOpen(true)}
                aria-label="講師を選んでまとめて印刷"
                style={{ ...S.btn(false), border: "1px solid #ccc" }}
              >
                📋 まとめて印刷
              </button>
            )}
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
              specialEvents={specialEvents}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
              activeTimetableId={activeTimetableId}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              subjectCategories={subjectCategories}
              teacherSubjects={teacherSubjects}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
              saveSubs={saveSubs}
              onJumpToEventCalendar={() => selectView(VIEWS.EVENTS)}
              onJumpToRequestedSubs={() => {
                setSubsInitFilter({ status: "requested" });
                selectView(VIEWS.SUBS);
              }}
            />
          )}
          {view === VIEWS.ALL && !selected && (
            <AllView slots={ttFilteredSlots} onSelectTeacher={selectTeacher} />
          )}
          {view === VIEWS.COMPARE && !selected && (
            <CompareView slots={ttFilteredSlots} partTimeStaff={partTimeStaff} subjects={subjects} />
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
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
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
              <HolidayManager
                holidays={holidays}
                slots={slots}
                onSave={saveHolidays}
                isAdmin={isAdmin}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.HOLIDAY ? eventEditRequest.id : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.HOLIDAY ? eventNewRequest.token : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
              <ExamPeriodManager
                examPeriods={examPeriods}
                onSave={saveExamPeriods}
                isAdmin={isAdmin}
                partTimeStaff={partTimeStaff}
                examPrepSchedules={examPrepSchedules}
                examPrepCrud={examPrepCrud}
                slots={slots}
                subjects={subjects}
                teacherSubjects={teacherSubjects}
                knownTags={availableTags}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.EXAM ? eventEditRequest.id : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.EXAM ? eventNewRequest.token : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
              <SpecialEventManager
                specialEvents={specialEvents}
                onSave={saveSpecialEvents}
                isAdmin={isAdmin}
                knownTags={availableTags}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.SPECIAL ? eventEditRequest.id : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.SPECIAL ? eventNewRequest.token : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
              <ExtraLessonManager
                extraLessons={extraLessons}
                onSave={saveExtraLessons}
                isAdmin={isAdmin}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.EXTRA_LESSON
                    ? eventEditRequest.id
                    : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.EXTRA_LESSON
                    ? eventNewRequest.token
                    : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
              <DayScheduleManager
                daySchedules={daySchedules}
                onSave={saveDaySchedules}
                slots={slots}
                timetables={timetables}
                isAdmin={isAdmin}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.DAY_SCHEDULE
                    ? eventEditRequest.id
                    : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.DAY_SCHEDULE
                    ? eventNewRequest.token
                    : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
            </>
          )}
          {view === VIEWS.EVENTS && !selected && (
            <EventCalendarView
              holidays={holidays}
              examPeriods={examPeriods}
              specialEvents={specialEvents}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
              isAdmin={isAdmin}
              visibility={eventVisibility}
              onChangeVisibility={saveEventVisibility}
              availableTags={availableTags}
              onEventClick={(ev) => {
                setEventEditRequest({ kind: ev.kind, id: ev.source.id });
                selectView(VIEWS.HOLIDAYS);
              }}
              onAddNewEvent={(kind) => {
                eventNewTokenRef.current += 1;
                setEventNewRequest({ kind, token: eventNewTokenRef.current });
                selectView(VIEWS.HOLIDAYS);
              }}
            />
          )}
          {view === VIEWS.BUILDER && !selected && <BuilderApp />}
          {view === VIEWS.REGULAR_BUILDER && !selected && (
            <RegularBuilderApp
              slots={slots}
              saveSlots={saveSlots}
              timetables={timetables}
              saveTimetables={saveTimetables}
              isAdmin={isAdmin}
            />
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
              extraLessons={extraLessons}
              onAddAdjustment={adjCrud.add}
              onDelAdjustment={adjCrud.del}
              onDelSessionOverride={overridesCrud.del}
              onJumpToAbsenceFlow={jumpToAbsenceFlow}
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
            />
          )}
          {view === VIEWS.CONFIRMED_SUBS && !selected && (
            <ConfirmedSubsView
              slots={slots}
              holidays={holidays}
              subs={subs}
              timetables={timetables}
              displayCutoff={displayCutoff}
              examPeriods={examPeriods}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              adjustments={adjustments}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
            />
          )}
          {view === VIEWS.ABSENCE_FLOW && !selected && (
            <AbsenceWorkflowView
              slots={slots}
              subs={subs}
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
              holidays={holidays}
              examPeriods={examPeriods}
              biweeklyAnchors={biweeklyAnchors}
              classSets={classSets}
              displayCutoff={displayCutoff}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              timetables={timetables}
              saveSubs={saveSubs}
              saveAdjustments={saveAdjustments}
              saveSessionOverrides={saveSessionOverrides}
              isAdmin={isAdmin}
              initDate={absenceFlowInitDate}
              onConsumeInitDate={() => setAbsenceFlowInitDate(null)}
            />
          )}
          {view === VIEWS.STAFF && !selected && (
            <StaffManagerView
              partTimeStaff={partTimeStaff}
              teacherSubjects={teacherSubjects}
              subjectCategories={subjectCategories}
              subjects={subjects}
              slots={slots}
              timetables={timetables}
              activeTimetableId={activeTimetableId}
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
              allSlots={slots}
              subs={subs}
              adjustments={adjustments}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              isAdmin={isAdmin}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              holidays={holidays}
              examPeriods={examPeriods}
              examPrepSchedules={examPrepSchedules}
              specialEvents={specialEvents}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
              onEditExtraLesson={(id) => {
                setEventEditRequest({ kind: EVENT_KIND.EXTRA_LESSON, id });
                selectView(VIEWS.HOLIDAYS);
              }}
              displayCutoff={displayCutoff}
              timetables={timetables}
              visibility={eventVisibility}
              onChangeVisibility={saveEventVisibility}
              availableTags={availableTags}
            />
          )}
          {selected && view === VIEWS.MONTH && (
            <MonthView
              teacher={selected}
              slots={slots}
              holidays={holidays}
              subs={subs}
              adjustments={adjustments}
              year={vy}
              month={vm}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              isAdmin={isAdmin}
              timetables={timetables}
              displayCutoff={displayCutoff}
              examPeriods={examPeriods}
              examPrepSchedules={examPrepSchedules}
              specialEvents={specialEvents}
              extraLessons={extraLessons}
              koshuLessons={koshuLessons}
              daySchedules={daySchedules}
              onEditExtraLesson={(id) => {
                setEventEditRequest({ kind: EVENT_KIND.EXTRA_LESSON, id });
                selectView(VIEWS.HOLIDAYS);
              }}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              visibility={eventVisibility}
              onChangeVisibility={saveEventVisibility}
              availableTags={availableTags}
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
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
              onExport={dataIO.handleExport}
              onImport={dataIO.handleImport}
              onReset={dataIO.handleReset}
              onCleanupOrphans={handleCleanupOrphans}
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
            holidays={holidays}
            examPeriods={examPeriods}
            specialEvents={specialEvents}
            extraLessons={extraLessons}
            selectedTeacher={selected}
            onSelectTeacher={(t) => {
              selectTeacher(t);
              setCmdPaletteOpen(false);
            }}
            onSelectView={(v) => {
              selectView(v);
              setCmdPaletteOpen(false);
            }}
            onSelectEvent={(req) => {
              setEventEditRequest(req);
              selectView(VIEWS.HOLIDAYS);
              setCmdPaletteOpen(false);
            }}
            onSelectSubsSubTab={(tabKey) => {
              setSubsInitFilter({ tab: tabKey });
              selectView(VIEWS.SUBS);
              setCmdPaletteOpen(false);
            }}
            onShowShortcuts={() => setShortcutsHelpOpen(true)}
            views={VIEWS}
          />
        </Suspense>
      )}

      {/* Shortcuts help (?) — lazy-loaded overlay */}
      {shortcutsHelpOpen && (
        <Suspense fallback={null}>
          <ShortcutsHelp
            open={shortcutsHelpOpen}
            onClose={() => setShortcutsHelpOpen(false)}
          />
        </Suspense>
      )}

      {/* 講師一括印刷ダイアログ — lazy-loaded */}
      {batchPrintOpen && (
        <Suspense fallback={null}>
          <BatchPrintDialog
            partTimeStaff={partTimeStaff}
            fulltimeGroups={fulltimeGroups}
            subjects={subjects}
            year={vy}
            month={vm}
            onClose={() => setBatchPrintOpen(false)}
            onPrint={handleBatchPrint}
            onAbort={handleBatchPrintAbort}
            busy={batchPrintBusy}
            progress={batchPrintProgress}
          />
        </Suspense>
      )}

      {/* Chord waiting badge (g を押したあと次のキーを待っている間だけ表示) */}
      <ChordWaitingBadge open={chordWaiting} />

      {/* Responsive CSS */}
      <style>{`
        /* 既定で disabled なボタンに not-allowed カーソルを当てる。
           インライン cursor: pointer (S.btn) を上書きするため !important
           を使う。視覚的なフェード (opacity) は各コンポーネントで明示する */
        button:disabled, [role="button"][aria-disabled="true"] {
          cursor: not-allowed !important;
        }
        /* 一覧操作列のアイコンボタン (S.iconBtn 併用)。
           インラインスタイルで書けない :hover / :focus-visible のフィードバックを
           グローバル CSS で当てる。disabled の時はホバー演出を消す。 */
        .icon-btn:hover:not(:disabled) {
          background: #eef0f5 !important;
        }
        .icon-btn:focus-visible {
          outline: 2px solid #5b8dee;
          outline-offset: 1px;
        }
        /* VISUALLY_HIDDEN な checkbox を内包する <label>。
           input 自体は視覚上隠れているので、Tab フォーカス時に label 側に
           リングを出してキーボード位置を可視化する。 */
        .toggle-label:focus-within {
          outline: 2px solid #5b8dee;
          outline-offset: 1px;
        }
        /* chord 待機バッジのタイムアウト残量バー（A19） */
        /* toast の残量バーでも同じ keyframes を流用する。 */
        @keyframes chord-decay {
          from { width: 100%; }
          to   { width: 0%; }
        }
        /* toast 出現時の fade-in（A22） */
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
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
          /* サイドバーのメニュー + 講師一覧を 1 つのスクロール領域に統合する。
             デスクトップの「メニュー固定・講師のみスクロール」分割のままだと
             低い画面では講師一覧の高さが 0 になり講師に辿り着けない。 */
          .sidebar-scroll {
            display: block !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
          }
          .sidebar-teachers { overflow-y: visible !important; }
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
          /* アプリシェルは通常 height:100vh のフレックス + .app-main が
             overflow:auto のスクロールペイン。そのまま window.print() すると
             1 ページ分 (ビューポート高) でクリップされ、以降のページが
             印刷されない。印刷時はスクロールを解除して全内容を紙面へ流す
             (直接 window.print() する全ビュー = builder / dashboard 等に効く)。 */
          .app-shell { display: block !important; height: auto !important; overflow: visible !important; }
          .app-main { overflow: visible !important; height: auto !important; }
          .sidebar, .sidebar-spacer, .hamburger { display: none !important; }
          .dash-sections { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .master-slot-actions { display: none !important; }
          .no-print { display: none !important; }
          /* E1h: 時間グループ / カレンダーセルがページ境界で割れないように */
          .dash-time-group, .event-cal-cell { break-inside: avoid; page-break-inside: avoid; }
          body { font-size: 10px !important; }
          input, select, textarea { font-size: 10px !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
