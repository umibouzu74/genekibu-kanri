import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY_BG as DB, DAY_COLOR as DC, DAYS } from "./data";

import { VIEWS } from "./constants/views";
import { VIEW_CHORDS, CHORD_TIMEOUT_MS } from "./constants/chords";
import { useBuilderProject } from "./hooks/useBuilderProject";
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
import { DayRescheduleDialog } from "./components/DayRescheduleDialog";
import { useSessionOverridesCrud } from "./hooks/useSessionOverridesCrud";
import { useTimetablesCrud } from "./hooks/useTimetablesCrud";
import { useStaffCrud } from "./hooks/useStaffCrud";
import { useExamPrepSchedulesCrud } from "./hooks/useExamPrepSchedulesCrud";
import { useDataIO } from "./hooks/useDataIO";
import { filterSlotsByActiveTimetable } from "./utils/timetable";
import { slotWeight, formatCount, isSlotForTeacher } from "./utils/biweekly";
import { deriveTagFiltersForTeacher } from "./utils/teacherTags";
import { buildKoshuLessons } from "./utils/builderLessons";
import { colors, font, S } from "./styles/common";
import { LS, SS } from "./constants/storageKeys";
import { LAYOUT } from "./constants/layout";
import { EVENT_KIND, eventSectionAnchorId } from "./constants/eventKinds";
import { DEFAULT_MASTER_TAB } from "./constants/masterTabs";
import { fmtDate, fmtDateWeekday } from "./utils/dateHelpers";
import { sortJa } from "./utils/sortJa";
import {
  applyOrphanCleanup,
  cascadeOrphansForSlots,
  describeOrphanDetection,
} from "./utils/orphanCleanup";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppData } from "./hooks/useAppData";
import { usePrintJobs } from "./hooks/usePrintJobs";
import "./styles/appShell.css";

import { Modal } from "./components/Modal";
import { SlotForm } from "./components/SlotForm";
import { Sidebar } from "./components/Sidebar";
import { TimetableSelector } from "./components/TimetableSelector";

import { Dashboard } from "./components/views/Dashboard";
import { AllView } from "./components/views/AllView";

// Lazy-loaded views (less frequently used or gated by navigation).
// 講師別の週間 / 月間 (合わせて 2,300 行超) は講師を選んだときにだけ要るので
// 初期バンドルから外す (2026-09-04)。一括印刷 (handleBatchPrint) は月間
// ビューを開いた状態から起動するのでチャンクは読み込み済み
const WeekView = lazy(() =>
  import("./components/views/WeekView").then((m) => ({ default: m.WeekView }))
);
const MonthView = lazy(() =>
  import("./components/views/MonthView").then((m) => ({ default: m.MonthView }))
);
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

  // ─── Persisted state (synced with Firebase when configured) ───────
  // 宣言は hooks/useAppData.js に集約 (20 本の useSyncedStorage + 端末限定の
  // eventVisibility + 保存エラーの通知)
  const {
    slots,
    saveSlots,
    holidays,
    saveHolidays,
    subs,
    saveSubs,
    partTimeStaff,
    savePartTimeStaff,
    subjectCategories,
    saveSubjectCategories,
    subjects,
    saveSubjects,
    biweeklyBase,
    saveBiweeklyBase,
    biweeklyAnchors,
    saveBiweeklyAnchors,
    adjustments,
    saveAdjustments,
    timetables,
    saveTimetables,
    displayCutoff,
    saveDisplayCutoff,
    examPeriods,
    saveExamPeriods,
    examPrepSchedules,
    saveExamPrepSchedules,
    classSets,
    saveClassSets,
    sessionOverrides,
    saveSessionOverrides,
    teacherSubjects,
    saveTeacherSubjects,
    teacherKana,
    saveTeacherKana,
    specialEvents,
    saveSpecialEvents,
    extraLessons,
    saveExtraLessons,
    daySchedules,
    saveDaySchedules,
    eventVisibility,
    saveEventVisibility,
  } = useAppData({ toasts, isAdmin });

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
  const [editSlot, setEditSlot] = useState(null);
  const [editSub, setEditSub] = useState(null);
  // スマホ (768px 以下) では閉じた状態から始める。開いた状態だと初回表示で
  // backdrop + サイドバーがダッシュボードを隠し、まず ✕ を押す操作が要る
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(min-width: 769px)").matches;
  });
  const [showDataMgr, setShowDataMgr] = useState(false);
  // 日まるごと振替ダイアログ (サイドバー / Cmd+K / 時間割調整一覧から開く)
  const [showDayReschedule, setShowDayReschedule] = useState(false);
  // サイドバーの子項目から「休講・テスト期間・イベント」の特定セクションへ
  // スクロールする要求 (EVENT_KIND)。ビューを切り替えた直後は lazy 読み込みで
  // まだ DOM に無いことがあるので、見つかるまで数フレーム探す。
  const [eventSectionRequest, setEventSectionRequest] = useState(null);
  const [importing, setImporting] = useState(false);
  const [subsInitFilter, setSubsInitFilter] = useState(null);
  // コースマスター管理のタブ。サイドバー / Cmd+K から直接開けるよう App が持つ。
  const [masterTab, setMasterTab] = useState(DEFAULT_MASTER_TAB);
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
    teacherKana,
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

  useEffect(() => {
    if (!eventSectionRequest || view !== VIEWS.HOLIDAYS) return undefined;
    let raf = 0;
    let tries = 0;
    const seek = () => {
      const el = document.getElementById(eventSectionAnchorId(eventSectionRequest));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setEventSectionRequest(null);
        return;
      }
      // 約 1 秒 (60 フレーム) 探して見つからなければあきらめる
      if (tries++ > 60) {
        setEventSectionRequest(null);
        return;
      }
      raf = requestAnimationFrame(seek);
    };
    raf = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(raf);
  }, [eventSectionRequest, view]);
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
    teacherKana,
    saveTeacherKana,
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
    teacherKana,
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
    saveTeacherKana,
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
      if (detection.orphanClassSets?.length)
        summary.push(`・授業セット (旧形式): ${detection.orphanClassSets.length} 件 (削除)`);
      if (detection.updatedClassSets?.length)
        summary.push(
          `・授業セット (旧形式): ${detection.updatedClassSets.length} 件 (削除済みコマを除外)`
        );
      const ok = await confirm({
        title: "孤立データを掃除",
        message: `次の孤立データを掃除します:\n\n${summary.join("\n")}\n\n実行しますか？`,
        okLabel: "実行",
        tone: "danger",
      });
      if (!ok) return;
      const { nextSubs, nextAdjustments, nextOverrides, nextClassSets } = applyOrphanCleanup({
        subs,
        adjustments,
        sessionOverrides,
        classSets,
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
      if (detection.orphanClassSets?.length || detection.updatedClassSets?.length) {
        saveClassSets(nextClassSets);
      }
      toasts.success(`孤立データを掃除しました (${describeOrphanDetection(detection)})`);
    },
    [
      confirm,
      subs,
      adjustments,
      sessionOverrides,
      classSets,
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
      saveClassSets,
      toasts,
    ]
  );

  // 通常時間割作成の「置き換え」反映で消えたコマの後始末。コマ削除の
  // cascade と同じ対象 (代行・調整・回数補正・旧式の授業セット) を、反映後の
  // slots に対して掃除する。ReflectDialog が saveSlots の直後に呼ぶ。
  // 残すと孤立データになり、そのバックアップのインポートで警告が出続ける
  // (2026-09-04)。反映ダイアログの確認文で「一緒に削除される」と断っている
  const handleSlotsReflected = useCallback(
    (nextSlots) => {
      const r = cascadeOrphansForSlots({
        slots: nextSlots,
        subs,
        adjustments,
        sessionOverrides,
        classSets,
      });
      if (r.changed.subs) saveSubs(r.nextSubs);
      if (r.changed.adjustments) saveAdjustments(r.nextAdjustments);
      if (r.changed.sessionOverrides) saveSessionOverrides(r.nextOverrides);
      if (r.changed.classSets) saveClassSets(r.nextClassSets);
      return r.detection;
    },
    [
      subs,
      adjustments,
      sessionOverrides,
      classSets,
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
      saveClassSets,
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

  // 講師のグループ分け (バイト → 教科別 → その他) は全量を 1 度だけ作る。
  // サイドバーの検索文字列によるフィルタは Sidebar の中 (ローカル state +
  // filterTeacherGroups) で行う。以前は search が App の state だったため、
  // 1 打鍵ごとに App 全体 (ダッシュボード・月間カレンダー…) が再描画されていた
  const allTeacherGroups = useTeacherGroups({
    slots: ttFilteredSlots,
    partTimeStaff,
    subjects,
    teacherKana,
  });
  // 一括印刷ダイアログに出す「バイト以外の講師」(常勤講師) の教科別グループ
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
  // ─── Print (popup 系。hooks/usePrintJobs.js) ───────────────────
  const {
    handlePrint,
    handleBatchPrint,
    handleBatchPrintAbort,
    batchPrintOpen,
    setBatchPrintOpen,
    batchPrintBusy,
    batchPrintProgress,
  } = usePrintJobs({
    view,
    selected,
    monthOff,
    vy,
    vm,
    eventVisibility,
    setSelected,
    setView,
    setMonthOff,
    toasts,
  });

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
      <a href="#main-content" className="skip-link no-print">
        本文へ移動
      </a>
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
        onOpenDayReschedule={() => {
          setShowDayReschedule(true);
          setSidebarOpen(false);
        }}
        onSelectEventSection={(kind) => {
          selectView(VIEWS.HOLIDAYS);
          setEventSectionRequest(kind);
        }}
        masterTab={masterTab}
        onSelectMasterTab={(tabKey) => {
          setMasterTab(tabKey);
          selectView(VIEWS.MASTER);
        }}
        onJumpToRequestedSubs={() => {
          setSelected(null);
          setView(VIEWS.SUBS);
          setSubsInitFilter({ status: "requested" });
          setSidebarOpen(false);
        }}
        teacherGroups={allTeacherGroups}
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
              aria-label="前の月"
              title="前の月"
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
            >
              ◀
            </button>
            <span style={{ fontSize: 15, fontWeight: 700 }} aria-live="polite">
              {vy}年{vm}月
            </span>
            <button
              onClick={() => setMonthOff((o) => o + 1)}
              aria-label="次の月"
              title="次の月"
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
          {/* ビュー 1 つの描画バグやチャンク読込失敗でサイドバーごと
              落とさない。別のビューへ移れば自動で復帰する */}
          <ErrorBoundary scope="view" resetKey={`${view}:${selected || ""}`}>
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
              teacherKana={teacherKana}
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
            <CompareView
              slots={ttFilteredSlots}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              teacherKana={teacherKana}
            />
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
              teacherKana={teacherKana}
              subjects={subjects}
              holidays={holidays}
              examPeriods={examPeriods}
              classSets={classSets}
              displayCutoff={displayCutoff}
              adjustments={adjustments}
              sessionOverrides={sessionOverrides}
              tab={masterTab}
              onTabChange={setMasterTab}
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
              holidays={holidays}
              examPeriods={examPeriods}
              specialEvents={specialEvents}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              daySchedules={daySchedules}
              isAdmin={isAdmin}
            />
          )}
          {view === VIEWS.HOLIDAYS && !selected && (
            <>
              {/* 各セクションにアンカーを振る (サイドバーの子項目から
                  スクロールで飛ぶ。id は eventSectionAnchorId が正) */}
              <div id={eventSectionAnchorId(EVENT_KIND.HOLIDAY)}>
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
              </div>
              <div id={eventSectionAnchorId(EVENT_KIND.EXAM)}>
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
                teacherKana={teacherKana}
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
              </div>
              <div id={eventSectionAnchorId(EVENT_KIND.SPECIAL)}>
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
              </div>
              <div id={eventSectionAnchorId(EVENT_KIND.EXTRA_LESSON)}>
              <ExtraLessonManager
                extraLessons={extraLessons}
                onSave={saveExtraLessons}
                isAdmin={isAdmin}
                teacherSuggestions={slotsCrud.suggestions.teachers}
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
              </div>
              <div id={eventSectionAnchorId(EVENT_KIND.DAY_SCHEDULE)}>
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
              </div>
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
              /* 科目カラーを「教科」単位に揃えるための教科マスタ
                 (理科A / 理科B が別色になるのを防ぐ) */
              subjects={subjects}
              /* 期切替の点検 (表示期間設定・授業セット) と、反映後に
                 ヘッダの時間割セレクタを新しい方へ向けるための配線 */
              displayCutoff={displayCutoff}
              saveDisplayCutoff={saveDisplayCutoff}
              classSets={classSets}
              activeTimetableId={activeTimetableId}
              onActivateTimetable={changeActiveTimetable}
              onSlotsReflected={handleSlotsReflected}
              isAdmin={isAdmin}
            />
          )}
          {view === VIEWS.SUBS && !selected && (
            <SubstituteView
              subs={subs}
              slots={slots}
              holidays={holidays}
              partTimeStaff={partTimeStaff}
              teacherKana={teacherKana}
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
              daySchedules={daySchedules}
              extraLessons={extraLessons}
              onAddAdjustment={adjCrud.add}
              onDelAdjustment={adjCrud.del}
              /* 日まるごと振替はサイドバー / Cmd+K からも開くので
                 ダイアログ本体は App が持つ。一覧タブにはボタンだけ置く */
              onOpenDayReschedule={
                isAdmin ? () => setShowDayReschedule(true) : null
              }
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
              teacherKana={teacherKana}
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
              teacherKana={teacherKana}
              subjectCategories={subjectCategories}
              subjects={subjects}
              slots={slots}
              timetables={timetables}
              activeTimetableId={activeTimetableId}
              subs={subs}
              holidays={holidays}
              examPeriods={examPeriods}
              displayCutoff={displayCutoff}
              daySchedules={daySchedules}
              onAddStaff={staffCrud.addStaff}
              onDelStaff={staffCrud.delStaff}
              onToggleStaffSubject={staffCrud.toggleStaffSubject}
              onSetStaffKana={staffCrud.setStaffKana}
              onImportKana={staffCrud.importKanaFromRegularBuilder}
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
          </ErrorBoundary>
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
              teacherKana={teacherKana}
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
              classSets={classSets}
              isAdmin={isAdmin}
              onExport={dataIO.handleExport}
              onImport={dataIO.handleImport}
              onReset={dataIO.handleReset}
              onCleanupOrphans={handleCleanupOrphans}
              importing={importing}
            />
          </Suspense>
        </Modal>
      )}

      {/* 日まるごと振替 (ある日の授業をまとめて別の日へ)。ダイアログの中で
          実施判定用の索引を組むので、開いている間だけマウントする */}
      {showDayReschedule && (
        <DayRescheduleDialog
          slots={slots}
          adjustments={adjustments}
          extraLessons={extraLessons}
          subs={subs}
          holidays={holidays}
          examPeriods={examPeriods}
          timetables={timetables}
          displayCutoff={displayCutoff}
          classSets={classSets}
          biweeklyAnchors={biweeklyAnchors}
          sessionOverrides={sessionOverrides}
          daySchedules={daySchedules}
          isAdmin={isAdmin}
          saveAdjustments={saveAdjustments}
          onRemoveAdjustments={adjCrud.delMany}
          onClose={() => setShowDayReschedule(false)}
          onSaved={({ added, replaced, sourceDate, targetDate }) =>
            toasts.success(
              `${fmtDateWeekday(sourceDate)} → ${fmtDateWeekday(targetDate)} に ` +
                `${added} コマを振り替えました` +
                (replaced > 0 ? ` (${replaced} 件を上書き)` : "")
            )
          }
        />
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
            onOpenDayReschedule={() => {
              setShowDayReschedule(true);
              setCmdPaletteOpen(false);
            }}
            onSelectSubsSubTab={(tabKey) => {
              setSubsInitFilter({ tab: tabKey });
              selectView(VIEWS.SUBS);
              setCmdPaletteOpen(false);
            }}
            onSelectMasterTab={(tabKey) => {
              setMasterTab(tabKey);
              selectView(VIEWS.MASTER);
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

    </div>
  );
}
