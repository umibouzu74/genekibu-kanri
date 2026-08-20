import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DAY_COLOR as DC,
  DAY_BG as DB,
  DAYS,
  DEPT_COLOR,
  fmtDate,
  dateToDay,
} from "../../data";
import { getDashSections } from "../../constants/schedule";
import { getSlotTeachers } from "../../utils/biweekly";
import { cutoffBannerText } from "../../constants/cutoffMessages";
import { extraLessonsOnDate } from "../../utils/extraLessons";
import {
  getDaySchedulesForDate,
  isSlotCancelledByDaySchedule,
} from "../../utils/daySchedules";
import { groupParallelSlots } from "../../utils/parallelSlots";
import { useTeacherGroups } from "../../hooks/useTeacherGroups";
import { useSubstitutionMode } from "../../hooks/useSubstitutionMode";
import { useToday } from "../../hooks/useToday";
import { useOptionalToasts } from "../../hooks/useToasts";
import {
  buildAllDaysBodyHtml,
  buildAllDaysDocTitle,
  buildPrintStyles,
  formatPrintDate,
  injectTimetableHeaders,
} from "../../utils/printStyles";
import { openPrintWindow, writePrintDocument } from "../../utils/printWindow";
import { ExtraLessonBanner } from "../ExtraLessonBanner";
import { RescheduleInBanner } from "../RescheduleInBanner";
import { collectIncomingReschedules } from "../../utils/adjustmentDisplay";
import { StaffUnavailabilityPanel } from "../StaffUnavailabilityPanel";
import { SubstitutionPopover } from "../SubstitutionPopover";
import { S } from "../../styles/common";
import { buildSessionCountMap } from "../../utils/sessionCount";
import {
  filterSlotsByActiveTimetable,
  filterSlotsForDate,
  getCutoffGroupLabelsWithSlots,
  getDayCutoffKind,
  isSlotBeyondCutoff,
} from "../../utils/timetable";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { ExcelSection } from "./excelGrid/ExcelSection";

// 印刷系統: App.jsx の handlePrint (popup 経由でヘッダ/凡例を注入する方式)。
// トップバー右の 🖨 ボタンから起動。ヘッダ HTML 生成は
// src/utils/printStyles.js の buildTimetableHeaderHtml。
// 中学・高校セクションそれぞれの DOM ルートに `.excel-print-col-ms` /
// `.excel-print-col-hs` クラスを付けておくと、handlePrint が直前に
// セクションヘッダを差し込んでくる。
// PrintButton (window.print() 直接) は使わない。
//
// 「🖨 全曜日」ボタン (曜日タブの右) は同じ popup 系統の別入口。トップバーの
// 🖨 が「表示中の曜日」を刷るのに対し、こちらは月〜土を 1 ジョブにまとめる。
// トップバー側から出せないのは、グリッドを出しているか (コースマスター管理の
// 時間割タブ / ダッシュボードの時間割モード / 授業管理の時間割タブ) と選択中の
// 曜日が、いずれもこのコンポーネントの内部状態だから。popup の生成は
// utils/printWindow、CSS/HTML の組み立ては utils/printStyles を App.jsx の
// handlePrint と共有している。

// DAYS = ["月","火","水","木","金","土"]。viewDate を含む週の月曜日を起点に
// 各曜日の日付 (YYYY-MM-DD) を算出して返す。viewDate 未指定時は空 Map。
function computeWeekDates(viewDate) {
  const out = new Map();
  if (!viewDate) return out;
  const [y, m, d] = viewDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  // getDay: 日=0, 月=1, ..., 土=6。日曜日を基準に月曜までの差分を引く。
  const dow = dt.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + mondayOffset);
  for (let i = 0; i < DAYS.length; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    out.set(DAYS[i], fmtDate(cur));
  }
  return out;
}

// ─── Main Component ────────────────────────────────────────────────
export function ExcelGridView({
  slots,
  saveSlots,
  onEdit,
  biweeklyAnchors,
  isAdmin,
  timetables,
  activeTimetableId,
  partTimeStaff,
  teacherKana = {},
  subjects,
  subs,
  saveSubs,
  holidays,
  examPeriods,
  subjectCategories,
  teacherSubjects,
  classSets,
  displayCutoff,
  viewDate,
  onViewDateChange,
  onAddAdjustment,
  enableSubMode = false,
  adjustments = [],
  sessionOverrides = [],
  extraLessons = [],
  daySchedules = [],
  dashboardMode = false,
}) {
  const [selectedDay, setSelectedDay] = useState("月");
  const [dragState, setDragState] = useState({ draggingId: null, overCell: null });
  const [unavailableTeachers, setUnavailableTeachers] = useState(new Set());
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // 全曜日まとめ印刷: 紙面用に曜日を差し替えている間だけ "月".."土"。
  // 画面の選択 (selectedDay) は動かさず、グリッドの描画対象だけを切り替える。
  const [printDay, setPrintDay] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const rootRef = useRef(null);
  const toasts = useOptionalToasts();
  // 描画対象の曜日。全曜日印刷中のみ printDay が勝つ。
  const activeDay = printDay || selectedDay;

  // 表示するコマの母集合。
  // 単体のタイムテーブルビューは日付を持たない「現在の時間割」の表示なので
  // ヘッダの時間割セレクタ (activeTimetableId) で絞る。
  // ダッシュボード表示は表示日が決まっており、どの時間割が有効かは日付が
  // 決める (下の filterSlotsForDate)。ここでセレクタでも絞ると、期切替
  // (1学期 → 2学期) の直後に切替日より前の日を開いたとき、その日のコマが
  // まるごと消えてしまう。日別リスト (DashboardListView) は日付だけで
  // 判定しているので、そちらに合わせる。
  const filteredSlots = useMemo(
    () =>
      dashboardMode
        ? slots
        : filterSlotsByActiveTimetable(slots, timetables, activeTimetableId),
    [dashboardMode, slots, timetables, activeTimetableId]
  );

  // Check which days have slots
  const daysWithSlots = useMemo(() => {
    const days = new Set();
    for (const s of filteredSlots) days.add(s.day);
    return days;
  }, [filteredSlots]);

  // Teacher groups for the unavailability panel
  const teacherGroups = useTeacherGroups({
    slots: filteredSlots,
    partTimeStaff: partTimeStaff || [],
    subjects: subjects || [],
    search: "",
  });

  // Substitution mode hook
  const subMode = useSubstitutionMode({
    slots: filteredSlots,
    subs: subs || [],
    saveSubs: saveSubs || (() => {}),
    holidays: holidays || [],
    examPeriods: examPeriods || [],
    partTimeStaff: partTimeStaff || [],
    subjects: subjects || [],
    subjectCategories: subjectCategories || [],
    timetables: timetables || [],
    biweeklyAnchors: biweeklyAnchors || [],
    teacherSubjects: teacherSubjects || {},
    unavailableTeachers,
  });

  // Clear unavailable selection when day changes
  useEffect(() => {
    setUnavailableTeachers(new Set());
  }, [selectedDay]);

  const toggleTeacher = useCallback((name) => {
    setUnavailableTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const bulkToggleTeachers = useCallback((names, selected) => {
    setUnavailableTeachers((prev) => {
      const next = new Set(prev);
      for (const n of names) {
        if (selected) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  }, []);

  const clearAllUnavailable = useCallback(() => {
    setUnavailableTeachers(new Set());
  }, []);

  // Destructure stable callbacks from subMode to avoid stale deps
  const {
    setSubDate, clearSubMode: clearSub, openPopover,
    combineMode, completeCombine, popoverTarget,
    startCombine, assignSubstitute, removeAssignment, closePopover,
    saveAll, discardAll,
  } = subMode;

  // Handle drag-and-drop swap in substitution mode
  const handleSubDrop = useCallback((sourceSlot, targetSlot) => {
    const sourceTeachers = getSlotTeachers(sourceSlot);
    const targetTeachers = getSlotTeachers(targetSlot);
    // Prefer absent teacher, fall back to first
    const sourceTeacher = sourceTeachers.find((t) => unavailableTeachers.has(t)) || sourceTeachers[0];
    const targetTeacher = targetTeachers.find((t) => unavailableTeachers.has(t)) || targetTeachers[0];
    if (!sourceTeacher || !targetTeacher) return;
    if (sourceTeacher === targetTeacher) return;

    // Assign source teacher's slot to target teacher (and vice versa)
    assignSubstitute(sourceSlot.id, sourceTeacher, targetTeacher);
    assignSubstitute(targetSlot.id, targetTeacher, sourceTeacher);
  }, [assignSubstitute, unavailableTeachers]);

  // Handle date change: set date and auto-select the day
  const handleDateChange = useCallback((dateStr) => {
    if (!dateStr) {
      clearSub();
      return;
    }
    // Validate: dateToDay returns null for days without slots (e.g. Sunday)
    const day = dateToDay(dateStr);
    if (!day) return;
    setSubDate(dateStr);
    setSelectedDay(day);
  }, [clearSub, setSubDate]);

  // Handle cell click in substitution mode
  const handleCellClick = useCallback((slot, rect, originalTeacher, anchorEl) => {
    // If in combine mode, complete the combine
    if (combineMode) {
      if (slot.id !== combineMode.sourceSlotId) {
        completeCombine(slot.id, onAddAdjustment);
      }
      return;
    }
    openPopover(slot.id, rect, originalTeacher, anchorEl);
  }, [combineMode, completeCombine, onAddAdjustment, openPopover]);

  // Popover slot lookup
  const popoverSlot = useMemo(() => {
    if (!popoverTarget) return null;
    return filteredSlots.find((s) => s.id === popoverTarget.slotId) || null;
  }, [popoverTarget, filteredSlots]);

  // viewDate を含む週の月〜土の日付を曜日→"YYYY-MM-DD" で保持。
  const weekDates = useMemo(() => computeWeekDates(viewDate), [viewDate]);

  // viewDate が指定されたらその曜日に selectedDay を自動同期
  useEffect(() => {
    if (!viewDate) return;
    const day = dateToDay(viewDate);
    if (day && day !== selectedDay) setSelectedDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // ─── 表示対象日の決定 ──────────────────────────────────────────
  // 優先順位:
  //   1. 代行モードの subDate
  //   2. 全曜日印刷中は「表示中の週」の同曜日 (weekDates)
  //   3. viewDate (ダッシュボードの日付ピッカー等) — 曜日が一致する時
  //   4. activeDay の直近発生日 (今日以前) — フォールバック
  // 「今日」は useToday で state 化してあり、タブを開いたまま深夜0時を
  // 跨いでも翌 0 時に再計算される (H2c)。
  const today = useToday();
  const sessionTargetDate = useMemo(() => {
    if (subMode.subDate) return subMode.subDate;
    if (printDay) {
      // 週の日付が判るのは viewDate がある時だけ (ダッシュボード)。無ければ
      // 下のフォールバック (直近発生日) に落ちる。
      const wd = weekDates.get(printDay);
      if (wd) return wd;
    }
    if (viewDate && dateToDay(viewDate) === activeDay) return viewDate;
    if (!activeDay) return null;
    const [ty, tm, td] = today.split("-").map(Number);
    const d = new Date(ty, tm - 1, td);
    for (let i = 0; i < 14; i++) {
      const dateStr = fmtDate(d);
      if (dateToDay(dateStr) === activeDay) return dateStr;
      d.setDate(d.getDate() - 1);
    }
    return null;
  }, [subMode.subDate, viewDate, activeDay, printDay, weekDates, today]);

  // 表示中の日付。代行モード中は subDate、そうでなければ選択曜日に対応する
  // 実日付 (sessionTargetDate を流用)。第N回計算・隔週 weekType 計算・
  // ダッシュボードの代行表示/表示期間フィルタで使う。
  const displayDate = subMode.subDate || sessionTargetDate;

  // ─── ダッシュボード表示モードの表示期間フィルタ ─────────────────
  // 表示日を基準に、日別リスト (DashboardListView) と同じ判定で
  // 表示期間外のコマを除外する:
  //   - 時間割の適用期間 (startDate/endDate) 外 → filterSlotsForDate
  //   - displayCutoff の開始日前 / 終講日後 (コホート別終講日を含む)
  //     → isSlotBeyondCutoff
  // 全学年グループが期間外の日は getDayCutoffKind で判定し、グリッドの
  // 代わりに「開講前 / 未確定」バナーを出す (render 側で分岐)。
  // コマが 1 つも無い学年グループは全日判定から外す (DashboardListView と同じ)。
  const activeGroupLabels = useMemo(
    () => getCutoffGroupLabelsWithSlots(slots, displayCutoff),
    [slots, displayCutoff]
  );
  const dashboardCutoffKind =
    dashboardMode && !!displayDate
      ? getDayCutoffKind(displayDate, displayCutoff, { activeGroupLabels })
      : null;
  const dashboardEntireDayCutoff = dashboardCutoffKind != null;
  const dashboardVisibleSlots = useMemo(() => {
    if (!dashboardMode || !displayDate) return filteredSlots;
    if (dashboardEntireDayCutoff) return [];
    return filterSlotsForDate(filteredSlots, displayDate, timetables).filter(
      (s) => !isSlotBeyondCutoff(displayDate, s, displayCutoff)
    );
  }, [
    dashboardMode,
    displayDate,
    dashboardEntireDayCutoff,
    filteredSlots,
    timetables,
    displayCutoff,
  ]);

  // Sub mode > dashboard (date-filtered) > timetable-filtered slots
  const rawDisplaySlots = subMode.isSubMode
    ? subMode.dateFilteredSlots
    : dashboardVisibleSlots;

  // 同一コホートで担任だけ異なる並列スロット (例: 中3 火 確認テスト 藤田 + 大屋敷)
  // を 1 コマにまとめる。groupTeacherMap は代表スロットに「藤田・大屋敷」を割当。
  const grouped = useMemo(
    () => groupParallelSlots(rawDisplaySlots),
    [rawDisplaySlots]
  );
  // 集約は閲覧用途限定。管理モード (スロット編集) および代行モード (個別
  // スロットに対する欠席/代行割当) では個別スロット情報を保つ必要があるため
  // 元配列をそのまま使う。セッション回数のカウントは sessionCount 内部で
  // 並列スロットを重複除去するため、どちらのパスでも正しく集計される。
  const shouldGroup = !isAdmin && !subMode.isSubMode;
  const displaySlots = shouldGroup ? grouped.representativeSlots : rawDisplaySlots;
  const groupTeacherMap = shouldGroup ? grouped.groupTeacherMap : null;

  const { sessionCtx, isOffForGrade, holidaysFor } = useSessionCtx({
    classSets,
    slots: displaySlots,
    // ダッシュボードの表示期間フィルタはあくまで「表示」の絞り込み。
    // 第N回計算のセット兄弟コマ解決の母集合はフィルタ前の filteredSlots を
    // 使い、カウントが日付フィルタで変わらないようにする。
    allSlots: dashboardMode ? filteredSlots : undefined,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
  });

  const sessionCountMap = useMemo(() => {
    if (!sessionTargetDate || !sessionCtx.displayCutoff) return new Map();
    const daySlots = displaySlots.filter((s) => s.day === activeDay);
    return buildSessionCountMap(daySlots, sessionTargetDate, sessionCtx);
  }, [sessionTargetDate, activeDay, displaySlots, sessionCtx]);

  // ダッシュボード表示用: 表示中日付の代行を slotId → Substitute でマップ化。
  // 代行モード中は subMode.existingSubMap を優先する (下で分岐)。
  const dashboardSubMap = useMemo(() => {
    if (!dashboardMode || !displayDate) return new Map();
    const m = new Map();
    for (const sub of subs || []) {
      if (sub.date === displayDate) m.set(sub.slotId, sub);
    }
    return m;
  }, [dashboardMode, displayDate, subs]);

  const effectiveSubMap = subMode.isSubMode
    ? subMode.existingSubMap
    : dashboardSubMap;

  // ダッシュボード表示モードでも休講・試験期間の対象スロットをセル側で
  // ハイライトできるよう holidayOffSlots を組み立てる。代行モード中は
  // subMode.holidayOffSlots を優先するので干渉しない。
  const dashboardHolidayOffSlots = useMemo(() => {
    if (!dashboardMode || !displayDate || !isOffForGrade) return new Set();
    const offSet = new Set();
    for (const s of displaySlots) {
      if (s.day !== activeDay) continue;
      if (
        isOffForGrade(displayDate, s.grade, s.subj) ||
        // 特別時程の部分休講 (1限カット等) も休講ハイライトに含める
        isSlotCancelledByDaySchedule(s, displayDate, daySchedules)
      )
        offSet.add(s.id);
    }
    return offSet;
  }, [dashboardMode, displayDate, displaySlots, activeDay, isOffForGrade, daySchedules]);

  const effectiveHolidayOffSlots = subMode.isSubMode
    ? subMode.holidayOffSlots
    : dashboardHolidayOffSlots;

  // ダッシュボード表示モードのみ: 表示日に該当する休講をヘッダで一覧表示。
  const dashboardHolidaysForDay = useMemo(() => {
    if (!dashboardMode || !displayDate || !holidaysFor) return [];
    return holidaysFor(displayDate);
  }, [dashboardMode, displayDate, holidaysFor]);

  // 「scope=全部 かつ 学年/教科キーワード未指定」の休講が 1 件でもあれば
  // 全部門が一律休講なので、各セクションを描画せず日全体で 1 回だけ
  // メッセージを出す (DashDayRow の fullOff 相当)。
  const dashboardFullOff = useMemo(() => {
    return dashboardHolidaysForDay.some((h) => {
      const sc = h.scope || ["全部"];
      if (!sc.includes("全部")) return false;
      if ((h.targetGrades || []).length > 0) return false;
      if ((h.subjKeywords || []).length > 0) return false;
      return true;
    });
  }, [dashboardHolidaysForDay]);

  // 表示日の休講ラベル一覧 (各セクションの「本日休講」表示で利用)。
  const dashboardHolidayLabels = useMemo(
    () => dashboardHolidaysForDay.map((h) => h.label).filter(Boolean),
    [dashboardHolidaysForDay]
  );

  // 表示日に該当する特別時程 (ヘッダバナー表示用)。
  const dashboardDaySchedules = useMemo(
    () =>
      dashboardMode && displayDate
        ? getDaySchedulesForDate(daySchedules, displayDate)
        : [],
    [dashboardMode, displayDate, daySchedules]
  );

  // 表示日の追加授業 (H1a)。グリッドの列は曜日ベースで特定日付の単発コマを
  // 埋め込めないため、Dashboard 日別と同じバナーとしてグリッド上部に出す。
  // displayDate の意味論 (代行日 > viewDate > 選択曜日の直近日) は
  // 第N回表示と同じ。休講日でも巻き添えにせず表示するが、全日カットオフ
  // (未確定日) は日別リストと同様に出さない。
  const extraLessonsForDisplayDate = useMemo(
    () =>
      dashboardEntireDayCutoff
        ? []
        : extraLessonsOnDate(extraLessons, displayDate),
    [extraLessons, displayDate, dashboardEntireDayCutoff]
  );

  // ダッシュボード表示モードで、表示期間フィルタの結果この曜日のコマが
  // 1 つも残らなかった (時間割期間外・全コホート終講後など)。空のグリッド
  // 枠を並べる代わりに案内メッセージを出す。
  const dashboardDayFilteredOut =
    dashboardMode &&
    !dashboardEntireDayCutoff &&
    daysWithSlots.has(activeDay) &&
    !displaySlots.some((s) => s.day === activeDay);

  // 全日休講 / コマ無しでセクションを描かない日は、セクション内の
  // 「振替で入るコマ」バナーも出ない。日まるごと振替の受け先は休講日に
  // なるのが典型なので、そのときはグリッド上部にまとめて出す
  // (追加授業バナーと同じ扱い。ここを出さないと画面のどこにも残らない)。
  const sectionsHidden = dashboardFullOff || dashboardDayFilteredOut;
  const incomingReschedulesForDisplayDate = useMemo(
    () =>
      dashboardEntireDayCutoff || !sectionsHidden
        ? []
        : collectIncomingReschedules(adjustments, displayDate, slots),
    [
      adjustments,
      displayDate,
      slots,
      sectionsHidden,
      dashboardEntireDayCutoff,
    ]
  );

  // ─── 全曜日まとめ印刷 ──────────────────────────────────────────
  // コマのある曜日を順に printDay へ差し替え、そのつど描画後の DOM
  // (日付固有のバナー + セクション欄) をスナップショットして 1 つの popup に
  // 連結する。月次の一括印刷 (App.jsx の handleBatchPrint) と同じ要領で、
  // 「実際に画面へ出るもの」をそのまま紙にするので描画ロジックが二重化しない。
  //
  // 代行モード中は表示コマが subDate の 1 日に固定されるため無効
  // (他の曜日を刷っても空になる)。
  const printableDays = useMemo(
    () => DAYS.filter((d) => daysWithSlots.has(d)),
    [daysWithSlots]
  );
  const canPrintAllDays =
    !subMode.isSubMode && !printBusy && printableDays.length > 0;

  const handlePrintAllDays = useCallback(async () => {
    if (printableDays.length === 0) return;
    // popup はクリック直下で開く (await を挟むとブロックされやすい)。
    const w = openPrintWindow();
    if (!w) {
      toasts?.error(
        "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
      );
      return;
    }
    setPrintBusy(true);
    const blocks = [];
    try {
      for (const d of printableDays) {
        // 印刷準備中に popup を閉じられたら中断 (書き込み先が無い)
        if (w.closed) break;
        // flushSync で同期コミット → 2 フレーム待って DOM 反映を確実にする
        // (handleBatchPrint と同じ待ち方)。
        flushSync(() => setPrintDay(d));
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        const root = rootRef.current;
        const body = root?.querySelector(".excel-print-day-body");
        if (!body) continue;
        // 日付固有のバナー (休講 / 特別時程) はグリッドの外にあるので拾う。
        const notes = Array.from(
          root.querySelectorAll(".excel-print-day-note")
        )
          .map((el) => el.outerHTML)
          .join("");
        const dateStr = weekDates.get(d) || "";
        blocks.push({
          html: injectTimetableHeaders(`${notes}${body.outerHTML}`, {
            day: d,
            dateText: dateStr ? formatPrintDate(dateStr, d) : "",
          }),
        });
      }
    } catch (e) {
      // スナップショット中に落ちても空 popup を残さない
      console.error("全曜日印刷に失敗:", e);
    } finally {
      // 画面を元の曜日に戻す (途中で抜けても差し替えが残らないように)
      flushSync(() => setPrintDay(null));
      setPrintBusy(false);
    }
    if (w.closed) return;
    if (blocks.length === 0) {
      toasts?.error("印刷データを生成できませんでした。");
      w.close();
      return;
    }
    writePrintDocument(w, {
      title: buildAllDaysDocTitle({ days: printableDays }),
      styles: buildPrintStyles({ hasTimetableGrid: true, hasMonthView: false }),
      bodyHtml: buildAllDaysBodyHtml({ blocks }),
    });
  }, [printableDays, weekDates, toasts]);

  return (
    <div ref={rootRef}>
      {/* Date selector for substitution mode (only when enabled) */}
      {enableSubMode && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 10,
            flexWrap: "wrap",
            padding: "8px 12px",
            background: subMode.isSubMode ? "#f0f8ff" : "#f8f8f8",
            border: `1px solid ${subMode.isSubMode ? "#b0d0f0" : "#e0e0e0"}`,
            borderRadius: 8,
          }}
        >
          <label style={{ fontSize: 11, fontWeight: 700, color: "#555" }}>
            代行管理日付
          </label>
          <input
            type="date"
            value={subMode.subDate || ""}
            onChange={(e) => handleDateChange(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 140 }}
          />
          {subMode.isSubMode && (
            <>
              <span style={{ fontSize: 11, color: "#3a6ea5", fontWeight: 700 }}>
                {subMode.dayOfDate}曜日 - 代行モード
              </span>
              {subMode.uncoveredSlots.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#c03030",
                  background: "#fde4e4", padding: "2px 8px", borderRadius: 10,
                }}>
                  未割当: {subMode.uncoveredSlots.length}件
                </span>
              )}
              <button
                onClick={() => handleDateChange("")}
                style={{ ...S.btn(false), fontSize: 10 }}
              >
                解除
              </button>
            </>
          )}
          {!subMode.isSubMode && (
            <span style={{ fontSize: 10, color: "#999" }}>
              日付を入力すると代行モードになります
            </span>
          )}
        </div>
      )}

      {/* Day Tab Bar */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {DAYS.map((d) => {
          const active = selectedDay === d;
          const hasSlotsForDay = daysWithSlots.has(d);
          const isLocked = subMode.isSubMode && d !== subMode.dayOfDate;
          const dateStr = weekDates.get(d);
          const mdLabel = dateStr
            ? (() => {
                const [, mm, dd] = dateStr.split("-");
                return `${Number(mm)}/${Number(dd)}`;
              })()
            : null;
          const handleClick = () => {
            if (isLocked) return;
            setSelectedDay(d);
            if (dateStr && onViewDateChange) onViewDateChange(dateStr);
          };
          return (
            <button
              key={d}
              type="button"
              onClick={handleClick}
              style={{
                padding: "6px 14px",
                border: active ? `2px solid ${DC[d]}` : "1px solid #ddd",
                borderRadius: 8,
                background: active ? DC[d] : hasSlotsForDay ? DB[d] : "#f5f5f5",
                color: active ? "#fff" : hasSlotsForDay ? DC[d] : "#bbb",
                fontWeight: 800,
                fontSize: 15,
                cursor: isLocked ? "not-allowed" : hasSlotsForDay ? "pointer" : "default",
                opacity: isLocked ? 0.3 : hasSlotsForDay ? 1 : 0.5,
                transition: "all .15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.15,
                minWidth: 52,
              }}
            >
              <span>{d}</span>
              {mdLabel && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    opacity: 0.85,
                    marginTop: 2,
                  }}
                >
                  {mdLabel}
                </span>
              )}
            </button>
          );
        })}

        {/* 全曜日まとめ印刷。トップバーの 🖨 (表示中の曜日のみ) の隣ではなく
            曜日タブの並びに置く — 「どの曜日を刷るか」の話だから */}
        <button
          type="button"
          onClick={handlePrintAllDays}
          disabled={!canPrintAllDays}
          aria-label="全曜日をまとめて印刷"
          title={
            subMode.isSubMode
              ? "代行モード中は使えません (表示が代行日の 1 日に固定されるため)"
              : printableDays.length === 0
                ? "印刷できる曜日がありません"
                : `コマのある全曜日 (${printableDays.join("・")}) を 1 回の印刷にまとめます (曜日ごとに改ページ)`
          }
          style={{
            ...S.btn(false),
            marginLeft: "auto",
            border: "1px solid #ccc",
            opacity: canPrintAllDays ? 1 : 0.45,
            cursor: canPrintAllDays ? "pointer" : "not-allowed",
          }}
        >
          {printBusy ? "🖨 準備中…" : "🖨 全曜日"}
        </button>
      </div>

      {/* Guide */}
      <div className="no-print" style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        {subMode.isSubMode
          ? "欠席講師を右パネルで選択 → セルをクリックして代行者を割り当て / ドラッグで入れ替え"
          : isAdmin
            ? "コマをドラッグして移動 / ダブルクリックで編集"
            : "時間割の閲覧モード"}
      </div>

      {/* Holiday banner (dashboard mode): 表示日に該当する休講をまとめて表示。
          excel-print-day-note は全曜日印刷が曜日ブロックに含めるための目印 */}
      {dashboardMode && dashboardHolidaysForDay.length > 0 && (
        <div
          className="excel-print-day-note"
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            background: "#fff5e0",
            border: "1px solid #e0b860",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: "#8a5a10" }}>
            🚫 休講
          </span>
          {dashboardHolidaysForDay.map((h) => {
            const sc = h.scope || ["全部"];
            const tg = h.targetGrades || [];
            const sk = h.subjKeywords || [];
            const parts = [];
            if (sc.length > 0) parts.push(sc.join("・"));
            if (tg.length > 0) parts.push(tg.join("・"));
            if (sk.length > 0) parts.push(sk.join("・"));
            return (
              <span
                key={h.id}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#8a5a10",
                  border: "1px solid #e0b860",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}
              >
                {parts.join(" / ")}
                {h.label ? ` (${h.label})` : ""}
              </span>
            );
          })}
        </div>
      )}

      {/* Day schedule banner (dashboard mode): 表示日の特別時程を表示 */}
      {dashboardMode && dashboardDaySchedules.length > 0 && (
        <div
          className="excel-print-day-note"
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            background: "#efeafa",
            border: "1px solid #a898d8",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: "#4a3a8e" }}>
            ⏰ 特別時程
          </span>
          {dashboardDaySchedules.map((d) => (
            <span
              key={d.id}
              title={d.memo || undefined}
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "#fff",
                color: "#4a3a8e",
                border: "1px solid #a898d8",
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {(d.targetGrades || []).join("・")}
              {d.label ? ` (${d.label})` : ""}
            </span>
          ))}
        </div>
      )}

      {/* Combine mode banner */}
      {combineMode && (
        <div
          style={{
            padding: "8px 14px",
            marginBottom: 10,
            background: "#fff8e0",
            border: "1px solid #e0c860",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6000" }}>
            合同にするコマをクリックしてください
          </span>
          <button
            onClick={subMode.cancelCombine}
            style={{ ...S.btn(false), fontSize: 10 }}
          >
            キャンセル
          </button>
        </div>
      )}

      {/* Grid + Panel layout */}
      <div className="mobile-stack" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Sections。excel-print-day-body は全曜日印刷のスナップショット単位
            (右の講師パネルは紙面に要らないので含めない) */}
        <div className="excel-print-day-body" style={{ flex: 1, minWidth: 0 }}>
          <ExtraLessonBanner lessons={extraLessonsForDisplayDate} />
          <RescheduleInBanner items={incomingReschedulesForDisplayDate} />
          {dashboardEntireDayCutoff ? (
            <div
              style={{
                background: "#fff8e0",
                border: "1px solid #e0d080",
                borderRadius: 8,
                padding: "40px 20px",
                textAlign: "center",
                color: "#8a7020",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {cutoffBannerText(dashboardCutoffKind)}
            </div>
          ) : dashboardDayFilteredOut ? (
            <div
              style={{
                background: "#f8f8f8",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: "40px 20px",
                textAlign: "center",
                color: "#888",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              表示期間外のため、この日に表示するコマはありません
            </div>
          ) : !daysWithSlots.has(activeDay) ? (
            <div
              style={{
                textAlign: "center",
                color: "#666",
                padding: "40px 20px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                lineHeight: 1.7,
              }}
            >
              <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
                📭
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                {activeDay}曜日のコマがありません
              </div>
              {daysWithSlots.size > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
                    display: "flex",
                    gap: 6,
                    justifyContent: "center",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  <span>コマのある曜日:</span>
                  {DAYS.filter((d) => daysWithSlots.has(d)).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      style={{
                        background: "#3a6ea5",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#888" }}>
                  コースマスターからコマを登録してください
                </div>
              )}
            </div>
          ) : (
            (() => {
              const sections = getDashSections(activeDay);
              const leftCol = [];
              const rightCol = [];
              const otherCol = [];
              for (const sec of sections) {
                if (sec.dept === "中学部") leftCol.push(sec);
                else if (sec.dept === "高校部") rightCol.push(sec);
                else otherCol.push(sec);
              }
              const renderSection = (sec) => {
                const color =
                  sec.color || DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
                return (
                  <ExcelSection
                    key={sec.key}
                    label={sec.label}
                    headerColor={color.accent}
                    slots={displaySlots}
                    day={activeDay}
                    sectionFilterFn={sec.filterFn}
                    isAdmin={isAdmin}
                    biweeklyAnchors={biweeklyAnchors}
                    holidays={holidays}
                    examPeriods={examPeriods}
                    onEdit={onEdit}
                    saveSlots={saveSlots}
                    allSlots={slots}
                    dragState={dragState}
                    setDragState={setDragState}
                    unavailableTeachers={unavailableTeachers}
                    isSubMode={subMode.isSubMode}
                    subDate={displayDate}
                    holidayOffSlots={effectiveHolidayOffSlots}
                    pendingSubMap={subMode.pendingSubMap}
                    existingSubMap={effectiveSubMap}
                    onCellClick={subMode.isSubMode ? handleCellClick : undefined}
                    combineMode={combineMode}
                    onSubDrop={subMode.isSubMode ? handleSubDrop : undefined}
                    sessionCountMap={sessionCountMap}
                    groupTeacherMap={groupTeacherMap}
                    dashboardMode={dashboardMode}
                    closureLabels={dashboardHolidayLabels}
                    adjustments={dashboardMode || subMode.isSubMode ? adjustments : []}
                    daySchedules={dashboardMode || subMode.isSubMode ? daySchedules : []}
                  />
                );
              };
              if (dashboardFullOff) {
                return (
                  <div
                    style={{
                      background: "#faf5e8",
                      border: "1px solid #e0b860",
                      borderRadius: 8,
                      padding: "40px 20px",
                      textAlign: "center",
                      color: "#8a6010",
                      fontSize: 16,
                      fontWeight: 800,
                    }}
                  >
                    本日休講
                    {dashboardHolidayLabels.length > 0 && (
                      <span style={{ fontWeight: 600 }}>
                        （{dashboardHolidayLabels.join("・")}）
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div
                  className="excel-grid-sections"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    className="excel-print-col-ms"
                    style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}
                  >
                    {leftCol.map(renderSection)}
                  </div>
                  <div
                    className="excel-print-col-hs"
                    style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}
                  >
                    {[...rightCol, ...otherCol].map(renderSection)}
                  </div>
                </div>
              );
            })()
          )}

          {/* Pending subs save bar */}
          {subMode.isSubMode && subMode.pendingSubs.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 16px",
                background: "#e8f5e8",
                border: "1px solid #b0d8b0",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#2a7a2a" }}>
                仮代行: {subMode.pendingSubs.length}件
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => window.confirm("仮代行をすべて破棄しますか？") && discardAll()}
                  style={S.btn(false)}
                >
                  破棄
                </button>
                <button
                  onClick={saveAll}
                  style={{ ...S.btn(true), background: "#2a7a2a" }}
                >
                  確定して保存
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Unavailability Panel (only in substitution-enabled views) */}
        {enableSubMode && (
          <StaffUnavailabilityPanel
            teacherGroups={teacherGroups}
            unavailableTeachers={unavailableTeachers}
            onToggleTeacher={toggleTeacher}
            onBulkToggle={bulkToggleTeachers}
            onClearAll={clearAllUnavailable}
            collapsed={panelCollapsed}
            onToggleCollapse={() => setPanelCollapsed((p) => !p)}
            slots={displaySlots}
            selectedDay={selectedDay}
          />
        )}
      </div>

      {/* Substitution Popover */}
      {popoverTarget && popoverSlot && (
        <SubstitutionPopover
          anchorEl={popoverTarget.anchorEl}
          anchorRect={popoverTarget.rect}
          slot={popoverSlot}
          originalTeacher={popoverTarget.originalTeacher}
          availableTeachers={subMode.availableTeachers}
          allTeachersForDay={subMode.allTeachersForDay}
          suggestion={subMode.suggestionMap.get(popoverSlot.id) || null}
          subjects={subjects || []}
          pendingSub={subMode.pendingSubMap.get(popoverSlot.id) || null}
          onAssign={(teacher) =>
            assignSubstitute(
              popoverSlot.id,
              popoverTarget.originalTeacher,
              teacher
            )
          }
          onRemoveAssignment={() => removeAssignment(popoverSlot.id)}
          onCombine={() => startCombine(popoverSlot.id)}
          onClose={closePopover}
          slots={displaySlots}
          pendingSubs={subMode.pendingSubs}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
        />
      )}
    </div>
  );
}
