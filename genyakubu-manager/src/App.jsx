import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DAY_BG as DB, DAY_COLOR as DC, DAYS } from "./data";

import { VIEWS } from "./constants/views";
import { VIEW_CHORDS, CHORD_TIMEOUT_MS } from "./constants/chords";
import { useBuilderProject } from "./hooks/useBuilderProject";
import { useTeacherGroups } from "./hooks/useTeacherGroups";
import { STAFF_GROUP_KEY } from "./utils/groupTeacherNames";
import { useToasts } from "./hooks/useToasts";
import { useConfirm } from "./hooks/useConfirm";
import { useChordNavigation } from "./hooks/useChordNavigation";
import { useDateKeyNav } from "./hooks/useDateKeyNav";
import { hasOpenDialog, isTypingTarget } from "./utils/keyboardGuards";
import { monthOffsetFromToday } from "./utils/dateHelpers";
import { draftDiscardPrompt } from "./utils/absenceDraftPrompt";
import { ChordWaitingBadge } from "./components/ChordWaitingBadge";
import { MonthNav } from "./components/MonthNav";
import { useAuth } from "./hooks/useAuth";
import { useSlotsCrud } from "./hooks/useSlotsCrud";
import { useSubsCrud } from "./hooks/useSubsCrud";
import { useAdjustmentsCrud } from "./hooks/useAdjustmentsCrud";
import { DayRescheduleDialog } from "./components/DayRescheduleDialog";
import { HandoverQuickAddDialog } from "./components/HandoverQuickAddDialog";
import { HandoverSeasonBanner } from "./components/HandoverSeasonBanner";
import { MultiDayAbsenceDialog } from "./components/MultiDayAbsenceDialog";
import { LeaveQuickDialog } from "./components/LeaveQuickDialog";
import { TestPrepLessonDialog } from "./components/TestPrepLessonDialog";
import { useSessionOverridesCrud } from "./hooks/useSessionOverridesCrud";
import { useTimetablesCrud } from "./hooks/useTimetablesCrud";
import { useStaffCrud } from "./hooks/useStaffCrud";
import { useExamPrepSchedulesCrud } from "./hooks/useExamPrepSchedulesCrud";
import { useDataIO } from "./hooks/useDataIO";
import {
  defaultTimetableIdOn,
  filterSlotsCurrentOn,
  filterSlotsCurrentOrUpcoming,
} from "./utils/timetable";
import { useToday } from "./hooks/useToday";
import { slotWeight, formatCount, isSlotForTeacher } from "./utils/biweekly";
import { visibilityForTeacher } from "./utils/teacherTags";
import { buildKoshuLessons } from "./utils/builderLessons";
import { colors, font, S } from "./styles/common";
import { LS, SS } from "./constants/storageKeys";
import { LAYOUT } from "./constants/layout";
import { EVENT_KIND, eventSectionAnchorId } from "./constants/eventKinds";
import { DEFAULT_MASTER_TAB } from "./constants/masterTabs";
import { DEFAULT_STAFF_TAB, STAFF_TAB } from "./constants/staffTabs";
import { fmtDate, fmtDateWeekday } from "./utils/dateHelpers";
import { sortJa } from "./utils/sortJa";
import { sortTeacherNames } from "./utils/teacherKana";
import {
  categoryMeta,
  fiscalYearOf,
  indexAffiliationChanges,
  resolveAffiliation,
} from "./utils/teacherAffiliations";
import {
  calendarFor,
  leaveKindMeta,
  offDayPredicate,
  restoreCalendars,
  setCalendar,
  setLeaveForDates,
} from "./utils/staffLeave";
import {
  applyOrphanCleanup,
  cascadeOrphansForSlots,
  describeOrphanDetection,
  listOrphanDetection,
} from "./utils/orphanCleanup";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppData } from "./hooks/useAppData";
import { usePrintJobs } from "./hooks/usePrintJobs";
import "./styles/appShell.css";

import { Modal } from "./components/Modal";
import { SlotForm } from "./components/SlotForm";
import { Sidebar } from "./components/Sidebar";
import { CurrentTimetableBadge } from "./components/CurrentTimetableBadge";
import { TIMETABLE_SECTION } from "./constants/timetableSections";

import { Dashboard } from "./components/views/Dashboard";
import { AllView } from "./components/views/AllView";
import { MainMenuView } from "./components/views/MainMenuView";
import { MainMenuPanel } from "./components/MainMenuPanel";
import { visibleMainMenu } from "./constants/mainMenu";

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
const TeachingMinutesView = lazy(() =>
  import("./components/views/TeachingMinutesView").then((m) => ({
    default: m.TeachingMinutesView,
  }))
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
const FuzokuPlanView = lazy(() =>
  import("./components/views/FuzokuPlanView").then((m) => ({ default: m.FuzokuPlanView }))
);
const HandoverView = lazy(() =>
  import("./components/views/HandoverView").then((m) => ({ default: m.HandoverView }))
);
const OffsiteLessonView = lazy(() =>
  import("./components/views/OffsiteLessonView").then((m) => ({ default: m.OffsiteLessonView }))
);
const YoteihyoCheckView = lazy(() =>
  import("./components/views/YoteihyoCheckView").then((m) => ({ default: m.YoteihyoCheckView }))
);
const LeaveView = lazy(() =>
  import("./components/views/LeaveView").then((m) => ({ default: m.LeaveView }))
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

// トップバーの 🔍 に添える Cmd+K の表記 (Mac は ⌘、それ以外は Ctrl)
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
const CMD_K_HINT = IS_MAC ? "⌘K" : "Ctrl+K";

// 起動時の画面 (新しいタブで開いたとき・データの初期化の後)。
// 2026-10-15 にダッシュボードからメインメニューへ変えた
const START_VIEW = VIEWS.MENU;

// 全講師ビュー以外のヘッダタイトル。teacher 選択中は別ロジック。
const VIEW_TITLES = {
  [VIEWS.MENU]: "メインメニュー",
  [VIEWS.DASH]: "ダッシュボード",
  [VIEWS.ALL]: "全講師コマ数一覧",
  [VIEWS.MINUTES]: "授業時間の集計",
  [VIEWS.TIMETABLE]: "時間割管理",
  [VIEWS.MASTER]: "コースマスター管理",
  [VIEWS.HOLIDAYS]: "休講・テスト期間・イベント",
  [VIEWS.EVENTS]: "イベントカレンダー",
  [VIEWS.SUBS]: "授業管理",
  [VIEWS.CONFIRMED_SUBS]: "代行確定一覧",
  [VIEWS.ABSENCE_FLOW]: "欠勤組み換え",
  [VIEWS.STAFF]: "講師管理",
  [VIEWS.BUILDER]: "講習時間割作成",
  [VIEWS.REGULAR_BUILDER]: "通常時間割作成",
  [VIEWS.FUZOKU_PLAN]: "附属の授業予定",
  [VIEWS.HANDOVER]: "引継ぎメモ",
  [VIEWS.OFFSITE]: "他校舎の授業",
  [VIEWS.YOTEIHYO]: "予定表チェック",
  [VIEWS.LEAVE]: "有給・半休",
};

export default function App() {
  const toasts = useToasts();
  const confirm = useConfirm();
  const { isAdmin, signIn, signOutAdmin } = useAuth();

  // ─── Persisted state (synced with Firebase when configured) ───────
  // 宣言は hooks/useAppData.js に集約 (20 本の useSyncedStorage + 端末限定の
  // eventVisibility + 保存エラーの通知)
  const appData = useAppData({ toasts, isAdmin });
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
    specialEventDisplay,
    saveSpecialEventDisplay,
    extraLessons,
    saveExtraLessons,
    daySchedules,
    saveDaySchedules,
    fuzokuPlan,
    saveFuzokuPlan,
    offsiteLessons,
    saveOffsiteLessons,
    handoverNotes,
    saveHandoverNotes,
    handoverEnabled,
    teacherAffiliations,
    saveTeacherAffiliations,
    staffLeave,
    saveStaffLeave,
    yoteihyoCourseMapping,
    saveYoteihyoCourseMapping,
    yoteihyoConfirmed,
    saveYoteihyoConfirmed,
    eventVisibility,
    saveEventVisibility,
  } = appData;

  // 講習時間割作成 (builder) の project を読み取り専用で購読し、個人月間
  // スケジュール (MonthView) に載せる講習コマへ変換する。編集は builder 側。
  // 日付ラベルの年は project.updatedAt を基準に推定するため todayYmd は
  // updatedAt/createdAt を持たない外部 JSON 由来データの保険にすぎない。
  const builderProject = useBuilderProject();
  const koshuLessons = useMemo(
    () => buildKoshuLessons(builderProject, { todayYmd: fmtDate(new Date()) }),
    [builderProject]
  );

  // 講習時間割作成の出勤可能調査で「バイトのみ」に絞るための名前 (読み取り専用)
  const partTimeStaffNames = useMemo(
    () => (partTimeStaff || []).map((s) => s?.name).filter(Boolean),
    [partTimeStaff]
  );

  // 有給・半休を記録する人か (その日の年度の講師の所属が現役部 常勤)。
  // 欠勤の登録ダイアログが「有給・半休にも記録する」を出すかに使う
  const affiliationIndex = useMemo(
    () => indexAffiliationChanges(teacherAffiliations),
    [teacherAffiliations]
  );
  const partTimeNameSet = useMemo(() => new Set(partTimeStaffNames), [partTimeStaffNames]);
  const isLeaveTracked = useCallback(
    (name, date) =>
      categoryMeta(
        resolveAffiliation(affiliationIndex, name, fiscalYearOf(date), partTimeNameSet).category
      ).tracksLeave,
    [affiliationIndex, partTimeNameSet]
  );
  // 期間で有給・半休を入れるときに除く日 (年間カレンダーの公休。無ければ null =
  // 呼び出し側は日曜を除く)。複数日の欠勤登録の「有給・半休にも記録する」で使う
  const leaveOffDay = useCallback(
    (name, from, to) => offDayPredicate(staffLeave, name, from, to),
    [staffLeave]
  );
  // 予定表チェックの年間カレンダーを有給・半休に取り込む (同じ年度のものは入れ替え)。
  // 6 秒の「元に戻す」は、その年度の前のカレンダーへ戻すだけ
  const importLeaveCalendar = useCallback(
    (cal) => {
      const previous = (staffLeave?.calendars || []).filter((c) => c.year === cal.year);
      saveStaffLeave((prev) => setCalendar(prev, cal));
      toasts.success(
        `${cal.year}年度の年間カレンダーを有給・半休に取り込みました` +
          (previous.length ? " (前に取り込んだものと入れ替えました)" : ""),
        {
          duration: 6000,
          action: {
            label: "元に戻す",
            onClick: () => saveStaffLeave((prev) => restoreCalendars(prev, [cal.year], previous)),
          },
        }
      );
    },
    [staffLeave, saveStaffLeave, toasts]
  );
  // 有給・半休を書く ([{name, dates, kind, memo}])。書く時点の保存値から
  const recordLeave = useCallback(
    (entries) =>
      saveStaffLeave((prev) =>
        entries.reduce((acc, e) => setLeaveForDates(acc, e), prev)
      ),
    [saveStaffLeave]
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
  // なのでタブ単位 — 新しいタブで開いたときは START_VIEW = メインメニュー)。
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
      if (!Object.values(VIEWS).includes(saved)) return START_VIEW;
      // WEEK / MONTH は講師選択中専用ビュー。講師なしで復元すると
      // 空画面になるため、その場合は起動時の画面に倒す。
      if (
        (saved === VIEWS.WEEK || saved === VIEWS.MONTH) &&
        !sessionStorage.getItem(SS.teacher)
      ) {
        return START_VIEW;
      }
      return saved;
    } catch {
      return START_VIEW;
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
  // 代行フォームで直前に作ったレコード (授業管理の月フィルタ追従用)
  const [createdSubs, setCreatedSubs] = useState(null);
  // スマホ (768px 以下) では閉じた状態から始める。開いた状態だと初回表示で
  // backdrop + サイドバーがダッシュボードを隠し、まず ✕ を押す操作が要る
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(min-width: 769px)").matches;
  });
  const [showDataMgr, setShowDataMgr] = useState(false);
  // 日まるごと振替ダイアログ (サイドバー / Cmd+K / 時間割調整一覧から開く)
  const [showDayReschedule, setShowDayReschedule] = useState(false);
  // 振替元・振替先を入れた状態で開く (予定表チェックの「12/7 の振替」から)
  const [dayRescheduleInit, setDayRescheduleInit] = useState(null);
  // 予定表チェックで読み込んだ予定表 (画面を離れて戻っても読み直さずに済むように
  // ここで持つ。端末には保存しない)
  const [yoteihyoSession, setYoteihyoSession] = useState(null);
  // 「✏ 引継ぎメモを書く」ダイアログ (Cmd+K / ダッシュボードの去年のこの時期)
  const [showHandoverAdd, setShowHandoverAdd] = useState(false);
  // 引継ぎメモの 1 件へ飛ぶ要求 ({id, token})。token で同じ id の再要求も効かせる
  const [handoverFocus, setHandoverFocus] = useState(null);
  // 他校舎の授業の画面への要求 ({id} = その 1 件を開く / {teacher} = その講師で
  // 新規登録を始める。token は同じ要求の繰り返しも効かせるため)
  const [offsiteFocus, setOffsiteFocus] = useState(null);
  // 複数日の欠勤登録ダイアログ。null = 閉じている / { teachers?, date? } = 開く
  const [multiDayAbsence, setMultiDayAbsence] = useState(null);
  // 講師の月間から 1 日の有給・半休を入れるダイアログ。null = 閉じている / { name, date }
  const [leaveQuick, setLeaveQuick] = useState(null);
  // 有給・半休の画面を「入れる欄を開いた状態」で開く要求 ({name?, date?, token})
  const [leaveFocus, setLeaveFocus] = useState(null);
  // テスト対策の振替・追加授業ダイアログ。null = 閉じている / { mode } = 開く
  // (mode: "reschedule" | "extra"。追加授業管理から開くと追加授業から始める)
  const [testPrep, setTestPrep] = useState(null);
  // サイドバーの子項目から「休講・テスト期間・イベント」の特定セクションへ
  // スクロールする要求 (EVENT_KIND)。ビューを切り替えた直後は lazy 読み込みで
  // まだ DOM に無いことがあるので、見つかるまで数フレーム探す。
  const [eventSectionRequest, setEventSectionRequest] = useState(null);
  // 時間割管理のセクション (コース別終講日など) へ飛ぶ要求 ({key, token})。
  // スクロールは画面の側 (TimetableManagerView) が受け取ってから行う
  const [timetableSectionRequest, setTimetableSectionRequest] = useState(null);
  const [importing, setImporting] = useState(false);
  const [subsInitFilter, setSubsInitFilter] = useState(null);
  // コースマスター管理のタブ。サイドバー / Cmd+K から直接開けるよう App が持つ。
  const [masterTab, setMasterTab] = useState(DEFAULT_MASTER_TAB);
  // 講師管理のタブ。同じく App が持つ (サイドバー / メインメニュー / Cmd+K /
  // 有給・半休の「講師の所属」から直接そのタブを開く)
  const [staffTab, setStaffTab] = useState(DEFAULT_STAFF_TAB);
  // 一覧から欠勤振替画面へ遷移するときの初期日 (YYYY-MM-DD)
  const [absenceFlowInitDate, setAbsenceFlowInitDate] = useState(null);
  // Cmd+K の日付ジャンプでダッシュボードを開くときの表示日 (YYYY-MM-DD)
  const [dashInitDate, setDashInitDate] = useState(null);
  // EventCalendar / CommandPalette などからの編集要求 ({ kind, id })
  const [eventEditRequest, setEventEditRequest] = useState(null);
  // EventCalendar からの「新規登録フォームを開く」要求 ({ kind, token })。
  // token は単調増加カウンタで、同じ kind を連続クリックしても useEffect が再発火するよう毎回別値にする。
  const [eventNewRequest, setEventNewRequest] = useState(null);
  const eventNewTokenRef = useRef(0);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const todayStr = useToday();
  // 「今の時間割」(週計・全講師一覧・タイムテーブルの通常表示など、日付を
  // 持たない画面の時間割) は今日の日付から決める
  // (utils/timetable.filterSlotsCurrentOn)。以前はヘッダのセレクタで端末ごとに
  // 選んで localStorage に覚えていたため、期切替のあと閲覧用の端末だけ前の期の
  // まま、が起きた (2026-10-21)。古い端末に残った選択はここで消す。
  useEffect(() => {
    try { localStorage.removeItem(LS.activeTimetableId); } catch { /* private mode 等 */ }
  }, []);
  // 新しく作るコマの既定の時間割 (コマの追加・反映ダイアログの「前の時間割」)
  const currentTimetableId = useMemo(
    () => defaultTimetableIdOn(slots, timetables, todayStr),
    [slots, timetables, todayStr]
  );
  // コースマスター管理で時間割を選んでから「＋ 追加」したときの時間割。
  // それ以外の「＋ コマ追加」は今の時間割 (null)
  const [newSlotTimetableId, setNewSlotTimetableId] = useState(null);
  const openNewSlot = useCallback((timetableId) => {
    setNewSlotTimetableId(timetableId ?? null);
    setEditSlot("new");
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
    holidays,
    saveHolidays,
  });
  const subsCrud = useSubsCrud({ subs, saveSubs });
  const ttCrud = useTimetablesCrud({
    timetables, saveTimetables, slots, saveSlots,
    classSets, saveClassSets,
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
  // 永続 state とその setter は useAppData の返り値と同じ名前なので丸ごと渡す
  // (以前は 40 個の名前を並べていた)
  const dataIO = useDataIO({
    ...appData,
    lsKeys: LS,
    setImporting,
    setShowDataMgr,
    setSelected,
    setView,
    defaultView: START_VIEW,
  });

  // 今の時間割のコマ (日付を持たない画面用。サイドバーの講師ごとのコマ数・
  // 講師の週計・全講師一覧)。日付を持つ画面 (ダッシュボード・月間・週間) は
  // 全コマを渡し、画面の側で日ごとに時間割の有効期間を見る。
  const currentSlots = useMemo(
    () => filterSlotsCurrentOn(slots, timetables, todayStr),
    [slots, timetables, todayStr]
  );
  // 講師の名前を並べる一覧 (サイドバー・まとめて印刷・講師ごとのタグの導出) は
  // これから始まる時間割の講師も入れる。期切替は切替日より前に反映するので、
  // その間も次の期から入る講師の月間を開いたり翌月の予定を刷ったりできるように。
  // コマ数を数える用途には使わない (切替前は 2 つの期を数えてしまう)。
  // selectTeacher のタグ導出でも参照するため Navigation より前に置く。
  const rosterSlots = useMemo(
    () => filterSlotsCurrentOrUpcoming(slots, timetables, todayStr),
    [slots, timetables, todayStr]
  );

  // ─── Navigation / teacher selection ─────────────────────────────
  // 講師の個人スケジュールを開くときの既定ビューは月間 (MONTH)。
  // あわせてタグフィルタ (eventVisibility.tagFilters) を担当コマから導出した
  // 初期値にリセットする: 学校系タグは本人の担当コマに関係するものだけ ON、
  // 授業データから判定できない自由タグは既定 ON のまま (utils/teacherTags)。
  // 手動トグルは次に講師を選択するまで有効。
  //
  // 講師 → その講師用の表示設定の組み立ては visibilityForTeacherName。
  // 📋 まとめて印刷も講師ごとにこれを通す (usePrintJobs の
  // visibilityForBatchTeacher)。片方だけ変えない
  const visibilityForTeacherName = useCallback(
    (t, base) =>
      visibilityForTeacher({
        visibility: base,
        teacher: t,
        slots: rosterSlots,
        tags: availableTags,
      }),
    [rosterSlots, availableTags]
  );
  // ─── 欠勤組み換えの下書きを守るビュー移動ガード ─────────────────
  // AbsenceWorkflowView は lazy で、ビューを離れるとアンマウントされて
  // useAbsenceDraft の下書きが消える (beforeunload はタブを閉じるときしか
  // 守れない)。ビューが onDirtyChange で「未保存の下書きあり」を知らせ、
  // 別ビューへ移る経路 (サイドバー / chord / Cmd+K / 講師選択 / 各ビューの
  // ジャンプ) は全部 navigateGuarded を通す。同じビューに留まる移動
  // (jumpToAbsenceFlow の日付ジャンプ) はビュー側が確認するので止めない。
  // ref なのは selectView (useCallback) を安定させるため。下書きは画面を
  // 再描画しなくてよい
  const absenceDraftDirtyRef = useRef(false);
  const navigateGuarded = useCallback(
    async (nextView, go) => {
      if (absenceDraftDirtyRef.current && nextView !== VIEWS.ABSENCE_FLOW) {
        const count = Number(absenceDraftDirtyRef.current) || 0;
        const ok = await confirm(draftDiscardPrompt({ count }));
        if (!ok) return false;
        absenceDraftDirtyRef.current = false;
      }
      go();
      return true;
    },
    [confirm]
  );

  // opts.month ("YYYY-MM") を渡すとその月の月間を開く (授業時間の集計のように
  // 特定の月を見ている画面から。省略時は表示中の月のまま)
  const selectTeacher = useCallback(
    (t, opts) =>
      navigateGuarded(VIEWS.MONTH, () => {
        setSelected(t);
        setView(VIEWS.MONTH);
        setSidebarOpen(false);
        const off = opts?.month ? monthOffsetFromToday(opts.month, new Date()) : null;
        if (off != null) setMonthOff(off);
        saveEventVisibility((p) => visibilityForTeacherName(t, p));
      }),
    [navigateGuarded, visibilityForTeacherName, saveEventVisibility]
  );
  const visibilityForBatchTeacher = useCallback(
    (t) => visibilityForTeacherName(t, eventVisibility),
    [visibilityForTeacherName, eventVisibility]
  );

  // 戻り値は「移動したか」の Promise。呼び出し側が無視してもよい
  // before: 移動先が読む初期状態 (表示日・編集対象・タブなど) を書く関数。
  // 移動と同じ go() の中で実行するので、下書きガードでキャンセルしたときに
  // 初期状態だけが残って、後の無関係な移動で発火することがない
  const selectView = useCallback(
    (v, before) =>
      navigateGuarded(v, () => {
        before?.();
        setSelected(null);
        setView(v);
        setSidebarOpen(false);
      }),
    [navigateGuarded]
  );

  // 一覧 (合同授業 / 回数補正など) から欠勤振替画面の特定日へ遷移する。
  const jumpToAbsenceFlow = useCallback(
    (date) => {
      selectView(VIEWS.ABSENCE_FLOW, () => setAbsenceFlowInitDate(date || null));
    },
    [selectView]
  );

  // 日付 → その日のダッシュボード (Cmd+K の日付ジャンプ、月間・イベント
  // カレンダーの日付クリックで共有)
  const openDashboardAt = useCallback(
    (date) => {
      selectView(VIEWS.DASH, () => setDashInitDate(date));
    },
    [selectView]
  );

  // 追加授業をバナー / カードから編集する (休講・テスト期間・イベント画面の
  // 追加授業マネージャを対象 id で開く)。ダッシュボード・月間・週間で共有
  const openExtraLessonEditor = useCallback(
    (id) => {
      selectView(VIEWS.HOLIDAYS, () =>
        setEventEditRequest({ kind: EVENT_KIND.EXTRA_LESSON, id })
      );
    },
    [selectView]
  );

  // 特別時程を対象 id で開く / 日付を入れて新規で開く (附属の授業予定から、
  // プリセットで表せない時程を細かく決めるとき)
  // 引継ぎメモの画面を開く (id を渡すとその 1 件までスクロールして強調)
  const openHandoverNote = useCallback(
    (id) => {
      selectView(VIEWS.HANDOVER, () =>
        setHandoverFocus(id == null ? null : { id, token: Date.now() })
      );
    },
    [selectView]
  );

  // 有給・半休の画面を開く。target ({name?, date?}) を渡すと入れる欄を開いた状態で
  // (ダッシュボードの「今後7日の休暇」・講師の月間のダイアログ・Cmd+K から)
  const openLeave = useCallback(
    (target = null) => {
      selectView(VIEWS.LEAVE, () =>
        setLeaveFocus(target ? { ...target, token: Date.now() } : null)
      );
    },
    [selectView]
  );

  // 時間割管理を開いて、そのセクション (constants/timetableSections) へ飛ぶ
  // (サイドバーの子項目 / メインメニュー / Cmd+K)
  const openTimetableSection = useCallback(
    (key) => {
      selectView(VIEWS.TIMETABLE, () =>
        setTimetableSectionRequest(key ? { key, token: Date.now() } : null)
      );
    },
    [selectView]
  );

  // 他校舎の授業の画面を開く。{id} でその 1 件 (管理者は編集)、{teacher} で
  // その講師の新規登録 (月間・週間・ダッシュボードのバナー・Cmd+K から)
  const openOffsite = useCallback(
    (req) => {
      selectView(VIEWS.OFFSITE, () =>
        setOffsiteFocus(req ? { ...req, token: Date.now() } : null)
      );
    },
    [selectView]
  );

  // メインメニューに出す項目 (閲覧者には管理者専用の項目を出さない)
  const mainMenu = useMemo(
    () => visibleMainMenu({ isAdmin, canUseAdminData: handoverEnabled }),
    [isAdmin, handoverEnabled]
  );

  // 画面を移ったら本文のスクロールを先頭へ戻す。ダッシュボードの下のメニュー
  // から移ると、次の画面が途中までスクロールした位置で開き、見出しが見えなかった
  // (セクションへのスクロール・引継ぎメモの強調はこの後に走るので邪魔しない)
  const mainScrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (el && typeof el.scrollTo === "function") el.scrollTo(0, 0);
    else if (el) el.scrollTop = 0;
  }, [view, selected]);

  const openDayScheduleEditor = useCallback(
    (id) => {
      selectView(VIEWS.HOLIDAYS, () =>
        setEventEditRequest({ kind: EVENT_KIND.DAY_SCHEDULE, id })
      );
    },
    [selectView]
  );
  const openNewDaySchedule = useCallback(
    (date) => {
      selectView(VIEWS.HOLIDAYS, () => {
        eventNewTokenRef.current += 1;
        setEventNewRequest({
          kind: EVENT_KIND.DAY_SCHEDULE,
          token: eventNewTokenRef.current,
          date: date || null,
        });
      });
    },
    [selectView]
  );

  // データ管理モーダルから「孤立データ一括掃除」を実行する。
  // バッチ destructive 操作 (CLAUDE.md 「cascade ありは confirmedRemove」
  // ルール) に該当するため、適用前に確認ダイアログを挟む。
  const handleCleanupOrphans = useCallback(
    async (detection) => {
      if (!detection || detection.total === 0) return;
      // 種類と件数は orphanCleanup.listOrphanDetection の 1 か所から
      const summary = listOrphanDetection(detection).map(
        (r) => `・${r.label}: ${r.count} 件 (${r.action})`
      );
      const ok = await confirm({
        title: "孤立データを掃除",
        message: `次の孤立データを掃除します:\n\n${summary.join("\n")}\n\n実行しますか？`,
        okLabel: "実行",
        tone: "danger",
      });
      if (!ok) return;
      const { nextSubs, nextAdjustments, nextOverrides, nextClassSets, nextHolidays } =
        applyOrphanCleanup({
          subs,
          adjustments,
          sessionOverrides,
          classSets,
          holidays,
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
      if (detection.updatedHolidays?.length) saveHolidays(nextHolidays);
      toasts.success(`孤立データを掃除しました (${describeOrphanDetection(detection)})`);
    },
    [
      confirm,
      subs,
      adjustments,
      sessionOverrides,
      classSets,
      holidays,
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
      saveClassSets,
      saveHolidays,
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
        holidays,
      });
      if (r.changed.subs) saveSubs(r.nextSubs);
      if (r.changed.adjustments) saveAdjustments(r.nextAdjustments);
      if (r.changed.sessionOverrides) saveSessionOverrides(r.nextOverrides);
      if (r.changed.classSets) saveClassSets(r.nextClassSets);
      if (r.changed.holidays) saveHolidays(r.nextHolidays);
      return r.detection;
    },
    [
      subs,
      adjustments,
      sessionOverrides,
      classSets,
      holidays,
      saveSubs,
      saveAdjustments,
      saveSessionOverrides,
      saveClassSets,
      saveHolidays,
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
      // 欠勤組み換えは管理者専用 (サイドバー・Cmd+K と同じく閲覧者は飛ばない)
      if (v === VIEWS.ABSENCE_FLOW && !isAdmin) return;
      if (v === VIEWS.WEEK || v === VIEWS.MONTH) {
        if (!selected) return;
        setView(v);
        setSidebarOpen(false);
        return;
      }
      selectView(v);
    },
    [selected, selectView, isAdmin]
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
  // 講師の所属 (今年度) で分けている端末では、現役部 常勤 → 現役部 非常勤 →
  // バイト → 予備校部 (教科別) の順に並べる
  const allTeacherGroups = useTeacherGroups({
    slots: rosterSlots,
    partTimeStaff,
    subjects,
    teacherKana,
    affiliations: teacherAffiliations,
    year: fiscalYearOf(todayStr),
  });
  // 講師名の入力候補 (他校舎の授業)。グループを平らにしてよみ順に並べ直す
  const allTeacherNames = useMemo(
    () =>
      sortTeacherNames(
        [...new Set(allTeacherGroups.flatMap((g) => g.teachers))],
        teacherKana
      ),
    [allTeacherGroups, teacherKana]
  );
  // 一括印刷ダイアログに出す「バイト以外の講師」(常勤講師) の教科別グループ
  const fulltimeGroups = useMemo(
    () => allTeacherGroups.filter((g) => g.key !== STAFF_GROUP_KEY),
    [allTeacherGroups]
  );

  const selDayCounts = useMemo(() => {
    if (!selected) return { total: 0, byDay: {} };
    const byDay = {};
    let total = 0;
    for (const s of currentSlots) {
      if (!isSlotForTeacher(s, selected)) continue;
      const w = slotWeight(s.note);
      byDay[s.day] = (byDay[s.day] || 0) + w;
      total += w;
    }
    return { total, byDay };
  }, [currentSlots, selected]);
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
    handleBatchImages,
    handleBatchPrintAbort,
    batchPrintOpen,
    setBatchPrintOpen,
    closeBatchPrint,
    batchImages,
    clearBatchImages,
    batchPrintBusy,
    batchPrintProgress,
    batchVisibility,
  } = usePrintJobs({
    view,
    selected,
    monthOff,
    vy,
    vm,
    eventVisibility,
    visibilityForBatchTeacher,
    setSelected,
    setView,
    setMonthOff,
    toasts,
  });

  // 月間予定のまとめて印刷・画像 (サイドバー / メインメニュー / Cmd+K から)。
  // まとめて印刷・画像は月間を講師ごとに描き替えて撮るので、その間いまの画面は
  // いったん外れ、終わると作り直しになる (usePrintJobs)。画面の中に覚えておく
  // ものが無い画面 (メインメニュー・ダッシュボード・講師の月間) ではその場で
  // 開き、それ以外はメインメニューへ移ってから開く。欠勤組み換えの下書きや
  // 入力途中のフォームを、印刷のついでに黙って捨てないため (移動は
  // navigateGuarded が下書きを確認する)
  const openMonthBatch = useCallback(() => {
    const keepsScreen = selected
      ? view === VIEWS.MONTH
      : view === VIEWS.MENU || view === VIEWS.DASH;
    if (keepsScreen) setBatchPrintOpen(true);
    else selectView(VIEWS.MENU, () => setBatchPrintOpen(true));
  }, [selected, view, selectView, setBatchPrintOpen]);
  // ダイアログの対象月の基準。講師の月間から開いたときは表示中の月、それ以外
  // (メインメニューなど) は今月 (前に見ていた月間の月を引きずらない)
  const batchBaseMonth =
    selected && view === VIEWS.MONTH
      ? { year: vy, month: vm }
      : { year: now.getFullYear(), month: now.getMonth() + 1 };

  // メインメニュー (起動時の画面 / ダッシュボードの下) の項目を押したときの移動。
  // 項目の kind ごとに、サイドバー・Cmd+K と同じ経路を通す (constants/mainMenu)
  const navigateMenuItem = useCallback(
    (item) => {
      switch (item.kind) {
        case "view":
          selectView(item.view);
          break;
        case "section":
          selectView(VIEWS.HOLIDAYS, () => setEventSectionRequest(item.section));
          break;
        case "timetableSection":
          openTimetableSection(item.section);
          break;
        case "masterTab":
          selectView(VIEWS.MASTER, () => setMasterTab(item.tab));
          break;
        case "subsTab":
          selectView(VIEWS.SUBS, () => setSubsInitFilter({ tab: item.tab }));
          break;
        case "staffTab":
          selectView(VIEWS.STAFF, () => setStaffTab(item.tab));
          break;
        case "modal":
          if (item.modal === "dayReschedule") setShowDayReschedule(true);
          else if (item.modal === "multiDayAbsence") setMultiDayAbsence({});
          else if (item.modal === "testPrep") setTestPrep({});
          else if (item.modal === "monthBatch") openMonthBatch();
          else if (item.modal === "data") setShowDataMgr(true);
          break;
        default:
          break;
      }
    },
    [selectView, openMonthBatch, openTimetableSection]
  );

  // 月間 (講師選択中) の ← / → / t = 前の月 / 次の月 / 今月。まとめて印刷の
  // ダイアログを開いている間は月を動かさない (印刷対象の月がずれる)。
  // 日別ダッシュボードは DashboardDateNav、イベントカレンダー・週間は
  // それぞれのビューが同じ hook を持つ
  useDateKeyNav({
    onPrev: () => setMonthOff((o) => o - 1),
    onNext: () => setMonthOff((o) => o + 1),
    onToday: () => setMonthOff(0),
    enabled: !!selected && view === VIEWS.MONTH && !batchPrintOpen,
  });
  // 月ピッカー (MonthNav) で選んだ月 → monthOff の換算
  const handleMonthPicked = (value) => {
    const off = monthOffsetFromToday(value, new Date());
    if (off != null) setMonthOff(off);
  };

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
        teacherKana={teacherKana}
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
        onOpenMultiDayAbsence={() => {
          setMultiDayAbsence({});
          setSidebarOpen(false);
        }}
        onOpenTestPrep={() => {
          setTestPrep({});
          setSidebarOpen(false);
        }}
        onOpenMonthBatch={() => {
          openMonthBatch();
          setSidebarOpen(false);
        }}
        onSelectEventSection={(kind) => {
          selectView(VIEWS.HOLIDAYS, () => setEventSectionRequest(kind));
        }}
        onSelectTimetableSection={openTimetableSection}
        masterTab={masterTab}
        onSelectMasterTab={(tabKey) => {
          selectView(VIEWS.MASTER, () => setMasterTab(tabKey));
        }}
        staffTab={staffTab}
        onSelectStaffTab={(tabKey) => {
          selectView(VIEWS.STAFF, () => setStaffTab(tabKey));
        }}
        onJumpToRequestedSubs={() =>
          selectView(VIEWS.SUBS, () => setSubsInitFilter({ status: "open" }))
        }
        canUseAdminData={handoverEnabled}
        teacherGroups={allTeacherGroups}
        subjectCategories={subjectCategories}
        /* 講師名の横のコマ数は今の時間割で数える (以前は全時間割のコマを
           数えていたため、期切替の後は前の期の分まで足されていた) */
        slots={currentSlots}
        subs={subs}
        isAdmin={isAdmin}
        onSignIn={signIn}
        onSignOut={signOutAdmin}
      />

      {/* Desktop sidebar spacer */}
      <div className="sidebar-spacer" style={{ width: LAYOUT.SIDEBAR_WIDTH, flexShrink: 0 }} />

      {/* Main */}
      <div
        ref={mainScrollRef}
        className="app-main"
        style={{ flex: 1, overflow: "auto", padding: "16px 24px", minWidth: 0 }}
      >
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
                onClick={() => openNewSlot(null)}
                style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
              >
                ＋ コマ追加
              </button>
            )}
            <CurrentTimetableBadge
              slots={slots}
              timetables={timetables}
              onOpenTimetables={() => openTimetableSection(TIMETABLE_SECTION.LIST)}
            />
            {/* §M: 講習時間割作成 (BUILDER) はツールバー自前の 🖨️
                (window.print() 系統) を持つ。popup 系のこのボタンは builder の
                Tailwind CSS が popup に注入されず無スタイルで刷られるため隠す。
                通常時間割作成 (REGULAR_BUILDER) も入力フィールド主体で popup
                印刷に耐えない (input の値は innerHTML に載らない) ため隠す。 */}
            {/* タッチ端末には Cmd+K も ? も無いので、ボタンでも開けるようにする */}
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              aria-label="コマンドパレットを開く"
              title={`コマンドパレット (${CMD_K_HINT})`}
              style={{ ...S.btn(false), border: "1px solid #ccc" }}
            >
              🔍 検索
            </button>
            <button
              type="button"
              onClick={() => setShortcutsHelpOpen(true)}
              aria-label="キーボードショートカット"
              title="キーボードショートカット (?)"
              style={{ ...S.btn(false), border: "1px solid #ccc", padding: "8px 11px" }}
            >
              ?
            </button>
            {view !== VIEWS.BUILDER && view !== VIEWS.REGULAR_BUILDER && view !== VIEWS.MENU && (
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
                aria-label="講師を選んでまとめて印刷・画像にする"
                style={{ ...S.btn(false), border: "1px solid #ccc" }}
              >
                🖼 まとめて印刷・画像
              </button>
            )}
          </div>
        </div>

        {selected && view === VIEWS.MONTH && (
          <MonthNav
            year={vy}
            month={vm}
            onPrev={() => setMonthOff((o) => o - 1)}
            onNext={() => setMonthOff((o) => o + 1)}
            onToday={() => setMonthOff(0)}
            onPick={handleMonthPicked}
            isCurrent={monthOff === 0}
            style={{ display: "flex", gap: 10, marginBottom: 8 }}
          />
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
          {/* 去年のこの時期 (引継ぎメモ) は起動時の画面とダッシュボードの上に */}
          {(view === VIEWS.DASH || view === VIEWS.MENU) && !selected && handoverEnabled && (
            <HandoverSeasonBanner
              notes={handoverNotes}
              onOpenNote={openHandoverNote}
              onOpenList={() => openHandoverNote(null)}
              onAdd={() => setShowHandoverAdd(true)}
            />
          )}
          {view === VIEWS.MENU && !selected && (
            <MainMenuView
              categories={mainMenu}
              onNavigate={navigateMenuItem}
              onOpenDashboard={() => selectView(VIEWS.DASH)}
              subs={subs}
              onOpenPendingSubs={() =>
                selectView(VIEWS.SUBS, () => setSubsInitFilter({ status: "open" }))
              }
              cmdKHint={CMD_K_HINT}
            />
          )}
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
              partTimeStaff={partTimeStaff}
              teacherKana={teacherKana}
              subjects={subjects}
              subjectCategories={subjectCategories}
              teacherSubjects={teacherSubjects}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
              offsiteLessons={offsiteLessons}
              onOpenOffsite={(id) => openOffsite({ id })}
              saveSubs={saveSubs}
              onJumpToEventCalendar={() => selectView(VIEWS.EVENTS)}
              onJumpToSubs={(status) => {
                selectView(VIEWS.SUBS, () => setSubsInitFilter({ status: status || "open" }));
              }}
              onJumpToAbsenceFlow={jumpToAbsenceFlow}
              isAdmin={isAdmin}
              initDate={dashInitDate}
              onConsumeInitDate={() => setDashInitDate(null)}
              onSelectTeacher={selectTeacher}
              onEditExtraLesson={openExtraLessonEditor}
              staffLeave={handoverEnabled ? staffLeave : null}
              onOpenLeave={openLeave}
            />
          )}
          {/* ダッシュボードの下のメニュー (メインメニューの小さい版)。紙面には
              載せない (no-print: PrintButton の window.print と 🖨 の popup の
              どちらでも消える) */}
          {view === VIEWS.DASH && !selected && (
            <nav
              className="no-print"
              aria-label="メニュー"
              style={{
                marginTop: 20,
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: 13 }}>メニュー</strong>
                <button
                  type="button"
                  onClick={() => selectView(VIEWS.MENU)}
                  className="main-menu-item"
                  style={{ ...S.btn(false), fontSize: 12, padding: "4px 10px", border: "1px solid #ccc" }}
                >
                  🏠 メインメニュー (説明つき)
                </button>
              </div>
              <MainMenuPanel categories={mainMenu} onNavigate={navigateMenuItem} variant="compact" />
            </nav>
          )}
          {view === VIEWS.ALL && !selected && (
            <AllView slots={currentSlots} onSelectTeacher={selectTeacher} teacherKana={teacherKana} />
          )}
          {view === VIEWS.MINUTES && !selected && (
            // 日付ベースの集計なので今の時間割では絞らない (有効期間は日ごとに見る)
            <TeachingMinutesView
              slots={slots}
              subs={subs}
              adjustments={adjustments}
              daySchedules={daySchedules}
              timetables={timetables}
              displayCutoff={displayCutoff}
              holidays={holidays}
              examPeriods={examPeriods}
              examPrepSchedules={examPrepSchedules}
              specialEvents={specialEvents}
              biweeklyAnchors={biweeklyAnchors}
              extraLessons={extraLessons}
              koshuLessons={koshuLessons}
              partTimeStaff={partTimeStaff}
              subjects={subjects}
              teacherKana={teacherKana}
              onSelectTeacher={selectTeacher}
            />
          )}
          {view === VIEWS.MASTER && !selected && (
            <MasterView
              slots={slots}
              onEdit={setEditSlot}
              onDel={slotsCrud.del}
              onNew={openNewSlot}
              biweeklyAnchors={biweeklyAnchors}
              onSetBiweeklyAnchors={saveBiweeklyAnchors}
              isAdmin={isAdmin}
              timetables={timetables}
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
              adjustments={adjustments}
              isAdmin={isAdmin}
              sectionRequest={timetableSectionRequest}
              onConsumeSectionRequest={() => setTimetableSectionRequest(null)}
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
                timetables={timetables}
                displayCutoff={displayCutoff}
                onSave={saveHolidays}
                isAdmin={isAdmin}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.HOLIDAY ? eventEditRequest.id : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.HOLIDAY ? eventNewRequest.token : null
                }
                newEntryDate={
                  eventNewRequest?.kind === EVENT_KIND.HOLIDAY ? eventNewRequest.date : null
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
                newEntryDate={
                  eventNewRequest?.kind === EVENT_KIND.EXAM ? eventNewRequest.date : null
                }
                onConsumeNewEntry={() => setEventNewRequest(null)}
              />
              </div>
              <div id={eventSectionAnchorId(EVENT_KIND.SPECIAL)}>
              <SpecialEventManager
                specialEvents={specialEvents}
                onSave={saveSpecialEvents}
                display={specialEventDisplay}
                onSaveDisplay={saveSpecialEventDisplay}
                isAdmin={isAdmin}
                knownTags={availableTags}
                editTargetId={
                  eventEditRequest?.kind === EVENT_KIND.SPECIAL ? eventEditRequest.id : null
                }
                onConsumeEditTarget={() => setEventEditRequest(null)}
                newEntryToken={
                  eventNewRequest?.kind === EVENT_KIND.SPECIAL ? eventNewRequest.token : null
                }
                newEntryDate={
                  eventNewRequest?.kind === EVENT_KIND.SPECIAL ? eventNewRequest.date : null
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
                onOpenTestPrep={isAdmin ? () => setTestPrep({ mode: "extra" }) : null}
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
                newEntryDate={
                  eventNewRequest?.kind === EVENT_KIND.EXTRA_LESSON ? eventNewRequest.date : null
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
                newEntryDate={
                  eventNewRequest?.kind === EVENT_KIND.DAY_SCHEDULE ? eventNewRequest.date : null
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
              /* 日まるごと振替・コマ休講 (時間割調整) を日単位で出す。
                 調整が指すコマを引くため全コマを渡す */
              adjustments={adjustments}
              slots={slots}
              biweeklyAnchors={biweeklyAnchors}
              isAdmin={isAdmin}
              visibility={eventVisibility}
              onChangeVisibility={saveEventVisibility}
              availableTags={availableTags}
              onSelectDate={openDashboardAt}
              onJumpToAbsenceFlow={isAdmin ? jumpToAbsenceFlow : undefined}
              onEventClick={(ev) => {
                selectView(VIEWS.HOLIDAYS, () =>
                  setEventEditRequest({ kind: ev.kind, id: ev.source.id })
                );
              }}
              onAddNewEvent={(kind, date) => {
                selectView(VIEWS.HOLIDAYS, () => {
                  eventNewTokenRef.current += 1;
                  setEventNewRequest({ kind, token: eventNewTokenRef.current, date: date || null });
                });
              }}
            />
          )}
          {view === VIEWS.FUZOKU_PLAN && !selected && (
            <FuzokuPlanView
              slots={slots}
              holidays={holidays}
              examPeriods={examPeriods}
              specialEvents={specialEvents}
              timetables={timetables}
              displayCutoff={displayCutoff}
              daySchedules={daySchedules}
              adjustments={adjustments}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              extraLessons={extraLessons}
              offsiteLessons={offsiteLessons}
              subs={subs}
              fuzokuPlan={fuzokuPlan}
              onSaveFuzokuPlan={saveFuzokuPlan}
              onSaveDaySchedules={saveDaySchedules}
              isAdmin={isAdmin}
              onSelectDate={openDashboardAt}
              onEditDaySchedule={isAdmin ? openDayScheduleEditor : undefined}
              onAddDaySchedule={isAdmin ? openNewDaySchedule : undefined}
            />
          )}
          {view === VIEWS.OFFSITE && !selected && (
            <OffsiteLessonView
              offsiteLessons={offsiteLessons}
              onSave={saveOffsiteLessons}
              isAdmin={isAdmin}
              holidays={holidays}
              teacherNames={allTeacherNames}
              teacherKana={teacherKana}
              focusRequest={offsiteFocus}
              onConsumeFocus={() => setOffsiteFocus(null)}
              onSelectTeacher={selectTeacher}
            />
          )}
          {view === VIEWS.YOTEIHYO && !selected && (
            // 日付ベースの突き合わせなので今の時間割では絞らない
            <YoteihyoCheckView
              slots={slots}
              holidays={holidays}
              saveHolidays={saveHolidays}
              adjustments={adjustments}
              saveAdjustments={saveAdjustments}
              subs={subs}
              examPeriods={examPeriods}
              specialEvents={specialEvents}
              displayCutoff={displayCutoff}
              timetables={timetables}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              daySchedules={daySchedules}
              extraLessons={extraLessons}
              isAdmin={isAdmin}
              session={yoteihyoSession}
              onSessionChange={setYoteihyoSession}
              courseMapping={yoteihyoCourseMapping}
              saveCourseMapping={saveYoteihyoCourseMapping}
              confirmed={yoteihyoConfirmed}
              saveConfirmed={saveYoteihyoConfirmed}
              saveDisplayCutoff={saveDisplayCutoff}
              saveSlots={saveSlots}
              onOpenDayReschedule={(init) => {
                setDayRescheduleInit(init || null);
                setShowDayReschedule(true);
              }}
              onEditHoliday={(id) =>
                selectView(VIEWS.HOLIDAYS, () => setEventEditRequest({ kind: EVENT_KIND.HOLIDAY, id }))
              }
              onOpenTimetableManager={() => selectView(VIEWS.TIMETABLE)}
              onImportLeaveCalendar={handoverEnabled ? importLeaveCalendar : undefined}
              leaveCalendarFor={handoverEnabled ? (y) => calendarFor(staffLeave, y) : undefined}
              onOpenLeave={handoverEnabled ? () => openLeave(null) : undefined}
            />
          )}
          {view === VIEWS.HANDOVER && !selected && (
            <HandoverView
              notes={handoverNotes}
              onSave={saveHandoverNotes}
              enabled={handoverEnabled}
              focusRequest={handoverFocus}
              onConsumeFocus={() => setHandoverFocus(null)}
            />
          )}
          {view === VIEWS.LEAVE && !selected && (
            // 授業がある日の「代行・欠勤の登録なし」を数えるために本体のデータも渡す
            // (日付ベースなので今の時間割では絞らない)
            <LeaveView
              staffLeave={staffLeave}
              onSave={saveStaffLeave}
              enabled={handoverEnabled}
              affiliations={teacherAffiliations}
              partTimeStaff={partTimeStaff}
              teacherKana={teacherKana}
              slots={slots}
              subs={subs}
              adjustments={adjustments}
              holidays={holidays}
              examPeriods={examPeriods}
              specialEvents={specialEvents}
              timetables={timetables}
              displayCutoff={displayCutoff}
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              daySchedules={daySchedules}
              onRegisterAbsence={isAdmin ? (init) => setMultiDayAbsence(init) : undefined}
              onOpenAffiliation={() =>
                selectView(VIEWS.STAFF, () => setStaffTab(STAFF_TAB.AFFILIATION))
              }
              onSelectTeacher={selectTeacher}
              focusRequest={leaveFocus}
              onConsumeFocus={() => setLeaveFocus(null)}
            />
          )}
          {view === VIEWS.BUILDER && !selected && (
            // 他校舎の授業を講習の「講師不在」へ取り込む・出勤可能調査をバイトで
            // 絞るための読み取り専用データ
            <BuilderApp
              offsiteLessons={offsiteLessons}
              holidays={holidays}
              partTimeStaffNames={partTimeStaffNames}
            />
          )}
          {view === VIEWS.REGULAR_BUILDER && !selected && (
            <RegularBuilderApp
              slots={slots}
              saveSlots={saveSlots}
              timetables={timetables}
              saveTimetables={saveTimetables}
              /* 科目カラーを「教科」単位に揃えるための教科マスタ
                 (理科A / 理科B が別色になるのを防ぐ) */
              subjects={subjects}
              /* 期切替の点検 (表示期間設定・授業セット) と、期切替の既定の
                 「前の時間割」(今の時間割) */
              displayCutoff={displayCutoff}
              saveDisplayCutoff={saveDisplayCutoff}
              classSets={classSets}
              defaultTimetableId={currentTimetableId}
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
              createdSubs={createdSubs}
              onEdit={setEditSub}
              onDel={subsCrud.del}
              onQuickUpdate={subsCrud.quickUpdate}
              onGoToStaffView={() => setView(VIEWS.STAFF)}
              initFilter={subsInitFilter}
              onConsumeInitFilter={() => setSubsInitFilter(null)}
              isAdmin={isAdmin}
              saveSubs={saveSubs}
              examPeriods={examPeriods}
              subjects={subjects}
              subjectCategories={subjectCategories}
              timetables={timetables}
              biweeklyAnchors={biweeklyAnchors}
              teacherSubjects={teacherSubjects}
              classSets={classSets}
              displayCutoff={displayCutoff}
              daySchedules={daySchedules}
              extraLessons={extraLessons}
              offsiteLessons={offsiteLessons}
              onAddAdjustment={adjCrud.add}
              onDelAdjustment={adjCrud.del}
              /* 日まるごと振替はサイドバー / Cmd+K からも開くので
                 ダイアログ本体は App が持つ。一覧タブにはボタンだけ置く */
              onOpenDayReschedule={
                isAdmin ? () => setShowDayReschedule(true) : null
              }
              onOpenTestPrep={isAdmin ? () => setTestPrep({}) : null}
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
              saveHolidays={saveHolidays}
              isAdmin={isAdmin}
              initDate={absenceFlowInitDate}
              onConsumeInitDate={() => setAbsenceFlowInitDate(null)}
              daySchedules={daySchedules}
              extraLessons={extraLessons}
              offsiteLessons={offsiteLessons}
              onOpenOffsite={(id) => openOffsite({ id })}
              onOpenMultiDayAbsence={(init) => setMultiDayAbsence(init || {})}
              onOpenChainSubstitution={(date) => {
                selectView(VIEWS.SUBS, () => setSubsInitFilter({ tab: "chain", date }));
              }}
              onDirtyChange={(dirty) => {
                // 件数 (number) か真偽値。0 / false = 下書きなし
                absenceDraftDirtyRef.current = dirty;
              }}
              isLeaveTracked={handoverEnabled ? isLeaveTracked : null}
              onRecordLeave={handoverEnabled ? recordLeave : null}
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
              subs={subs}
              holidays={holidays}
              examPeriods={examPeriods}
              displayCutoff={displayCutoff}
              daySchedules={daySchedules}
              adjustments={adjustments}
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
              affiliations={teacherAffiliations}
              onSaveAffiliations={saveTeacherAffiliations}
              onOpenLeave={handoverEnabled ? () => selectView(VIEWS.LEAVE) : undefined}
              tab={staffTab}
              onTabChange={setStaffTab}
            />
          )}
          {selected && view === VIEWS.WEEK && (
            <WeekView
              teacher={selected}
              slots={slots}
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
              specialEventDisplay={specialEventDisplay}
              extraLessons={extraLessons}
              daySchedules={daySchedules}
              onEditExtraLesson={openExtraLessonEditor}
              offsiteLessons={offsiteLessons}
              onOpenOffsite={openOffsite}
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
              specialEventDisplay={specialEventDisplay}
              extraLessons={extraLessons}
              koshuLessons={koshuLessons}
              daySchedules={daySchedules}
              onEditExtraLesson={openExtraLessonEditor}
              offsiteLessons={offsiteLessons}
              onOpenOffsite={openOffsite}
              staffLeave={handoverEnabled ? staffLeave : null}
              onOpenLeave={handoverEnabled ? () => selectView(VIEWS.LEAVE) : undefined}
              onEditLeave={
                handoverEnabled && isLeaveTracked(selected, `${vy}-${String(vm).padStart(2, "0")}-01`)
                  ? (date) => setLeaveQuick({ name: selected, date })
                  : undefined
              }
              classSets={classSets}
              biweeklyAnchors={biweeklyAnchors}
              sessionOverrides={sessionOverrides}
              visibility={batchVisibility ?? eventVisibility}
              onChangeVisibility={saveEventVisibility}
              availableTags={availableTags}
              onSelectDate={openDashboardAt}
              onJumpToAbsenceFlow={isAdmin ? jumpToAbsenceFlow : undefined}
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
            defaultTimetableId={newSlotTimetableId ?? currentTimetableId}
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
              biweeklyAnchors={biweeklyAnchors}
              holidays={holidays}
              examPeriods={examPeriods}
              timetables={timetables}
              displayCutoff={displayCutoff}
              onSave={(f) => {
                const created = subsCrud.save(editSub, f, setEditSub);
                if (created?.length) setCreatedSubs(created);
              }}
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
      {multiDayAbsence && (
        <MultiDayAbsenceDialog
          slots={slots}
          subs={subs}
          adjustments={adjustments}
          holidays={holidays}
          examPeriods={examPeriods}
          timetables={timetables}
          displayCutoff={displayCutoff}
          classSets={classSets}
          biweeklyAnchors={biweeklyAnchors}
          sessionOverrides={sessionOverrides}
          daySchedules={daySchedules}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          initial={multiDayAbsence}
          isAdmin={isAdmin}
          saveSubs={saveSubs}
          isLeaveTracked={handoverEnabled ? isLeaveTracked : null}
          onRecordLeave={handoverEnabled ? recordLeave : null}
          leaveOffDay={handoverEnabled ? leaveOffDay : null}
          onClose={() => setMultiDayAbsence(null)}
          onSaved={({ count, mode, fromDate, toDate, teachers: names, leave }) => {
            const range = `${fmtDateWeekday(fromDate)} 〜 ${fmtDateWeekday(toDate)}`;
            const leaveText = leave
              ? `${
                  leave.perName
                    ? leave.perName.map((x) => `${x.name} ${x.days} 日`).join("・")
                    : `${leave.names.join("・")} の ${leave.days} 日`
                }を「${leaveKindMeta(leave.kind).label}」として記録しました`
              : "";
            toasts.success(
              count > 0
                ? `${names.join("・")} の ${range} を` +
                    `${mode === "nosub" ? "欠勤 (代行なし)" : "欠勤 (代行未定)"} ${count} 件として登録しました` +
                    (leaveText ? `。${leaveText}` : "")
                : leaveText
            );
          }}
        />
      )}
      {/* 講師の月間の 🌴 から 1 日の有給・半休を入れる (管理者だけが読めるデータ) */}
      {leaveQuick && handoverEnabled && (
        <LeaveQuickDialog
          name={leaveQuick.name}
          date={leaveQuick.date}
          staffLeave={staffLeave}
          onSave={saveStaffLeave}
          slots={slots}
          subs={subs}
          adjustments={adjustments}
          holidays={holidays}
          examPeriods={examPeriods}
          specialEvents={specialEvents}
          timetables={timetables}
          displayCutoff={displayCutoff}
          classSets={classSets}
          biweeklyAnchors={biweeklyAnchors}
          sessionOverrides={sessionOverrides}
          daySchedules={daySchedules}
          onRegisterAbsence={isAdmin ? (init) => setMultiDayAbsence(init) : undefined}
          onOpenLeaveView={() => openLeave({ name: leaveQuick.name, date: leaveQuick.date })}
          onClose={() => setLeaveQuick(null)}
        />
      )}
      {/* テスト対策の振替・追加授業 (コースを選んで振替 / 追加授業を登録)。
          実施判定用の索引をダイアログの中で組むので、開いている間だけマウントする */}
      {testPrep && isAdmin && (
        <TestPrepLessonDialog
          slots={slots}
          adjustments={adjustments}
          extraLessons={extraLessons}
          subs={subs}
          offsiteLessons={offsiteLessons}
          holidays={holidays}
          examPeriods={examPeriods}
          timetables={timetables}
          displayCutoff={displayCutoff}
          classSets={classSets}
          biweeklyAnchors={biweeklyAnchors}
          sessionOverrides={sessionOverrides}
          daySchedules={daySchedules}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          initialMode={testPrep.mode}
          isAdmin={isAdmin}
          saveAdjustments={saveAdjustments}
          saveExtraLessons={saveExtraLessons}
          onClose={() => setTestPrep(null)}
        />
      )}
      {showHandoverAdd && handoverEnabled && (
        <HandoverQuickAddDialog
          notes={handoverNotes}
          onSave={saveHandoverNotes}
          onClose={() => setShowHandoverAdd(false)}
          onOpenNote={openHandoverNote}
        />
      )}
      {showDayReschedule && (
        <DayRescheduleDialog
          slots={slots}
          adjustments={adjustments}
          extraLessons={extraLessons}
          subs={subs}
          offsiteLessons={offsiteLessons}
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
          initialSourceDate={dayRescheduleInit?.sourceDate}
          initialTargetDate={dayRescheduleInit?.targetDate}
          onClose={() => {
            setShowDayReschedule(false);
            setDayRescheduleInit(null);
          }}
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
            teacherKana={teacherKana}
            subs={subs}
            holidays={holidays}
            examPeriods={examPeriods}
            specialEvents={specialEvents}
            extraLessons={extraLessons}
            offsiteLessons={offsiteLessons}
            onOpenOffsite={(id) => {
              openOffsite({ id });
              setCmdPaletteOpen(false);
            }}
            onAddOffsite={
              isAdmin
                ? (teacher) => {
                    openOffsite({ teacher });
                    setCmdPaletteOpen(false);
                  }
                : undefined
            }
            selectedTeacher={selected}
            canUseAdminData={handoverEnabled}
            handoverNotes={handoverEnabled ? handoverNotes : undefined}
            onOpenHandoverNote={handoverEnabled ? openHandoverNote : undefined}
            onOpenHandoverAdd={handoverEnabled ? () => setShowHandoverAdd(true) : undefined}
            onOpenLeaveEntry={handoverEnabled ? () => openLeave({}) : undefined}
            onSelectTeacher={(t) => {
              selectTeacher(t);
              setCmdPaletteOpen(false);
            }}
            onSelectView={(v) => {
              selectView(v);
              setCmdPaletteOpen(false);
            }}
            onSelectEvent={(req) => {
              selectView(VIEWS.HOLIDAYS, () => setEventEditRequest(req));
              setCmdPaletteOpen(false);
            }}
            onOpenDayReschedule={() => {
              setShowDayReschedule(true);
              setCmdPaletteOpen(false);
            }}
            onOpenMultiDayAbsence={
              isAdmin
                ? () => {
                    setMultiDayAbsence({});
                    setCmdPaletteOpen(false);
                  }
                : undefined
            }
            onOpenTestPrep={
              isAdmin
                ? () => {
                    setTestPrep({});
                    setCmdPaletteOpen(false);
                  }
                : undefined
            }
            onOpenMonthBatch={() => {
              setCmdPaletteOpen(false);
              openMonthBatch();
            }}
            onSelectDate={(date) => {
              openDashboardAt(date);
              setCmdPaletteOpen(false);
            }}
            onJumpToAbsenceFlow={
              isAdmin
                ? (date) => {
                    jumpToAbsenceFlow(date);
                    setCmdPaletteOpen(false);
                  }
                : undefined
            }
            onSelectSubsSubTab={(tabKey) => {
              selectView(VIEWS.SUBS, () => setSubsInitFilter({ tab: tabKey }));
              setCmdPaletteOpen(false);
            }}
            onSelectMasterTab={(tabKey) => {
              selectView(VIEWS.MASTER, () => setMasterTab(tabKey));
              setCmdPaletteOpen(false);
            }}
            onSelectTimetableSection={(key) => {
              openTimetableSection(key);
              setCmdPaletteOpen(false);
            }}
            onSelectStaffTab={(tabKey) => {
              selectView(VIEWS.STAFF, () => setStaffTab(tabKey));
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
            teacherKana={teacherKana}
            year={batchBaseMonth.year}
            month={batchBaseMonth.month}
            onClose={closeBatchPrint}
            onPrint={handleBatchPrint}
            onExportImages={handleBatchImages}
            onBackFromImages={clearBatchImages}
            images={batchImages}
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
