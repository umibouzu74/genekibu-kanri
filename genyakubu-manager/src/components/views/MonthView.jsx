import { useCallback, useMemo } from "react";
import { DAYS, WEEKDAYS } from "../../data";
import { indexExtraLessonsByDate } from "../../utils/extraLessons";
import { resolveSlotDaySchedule } from "../../utils/daySchedules";
import { indexKoshuLessonsByDate } from "../../utils/builderLessons";
import { isTimetableActiveForDate, isSlotBeyondCutoff, getCutoffGroupLabelsWithSlots } from "../../utils/timetable";
import { isBiweekly, isSlotForTeacher, isTeacherActiveOnDate } from "../../utils/biweekly";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { EVENT_KIND } from "../../constants/eventKinds";
import {
  DEFAULT_EVENT_VISIBILITY,
  EventVisibilityToggles,
  isEventKindVisible,
  isExamPeriodVisible,
  isSpecialEventVisible,
} from "../EventVisibilityToggles";
import { MonthDayCell } from "./month/MonthDayCell";

// 印刷系統: App.jsx の handlePrint (popup 経由でヘッダ/凡例を注入する方式)。
// トップバー右の 🖨 ボタンから起動。ヘッダ HTML 生成は
// src/utils/printStyles.js の buildMonthHeaderHtml / buildMonthLabel。
// 月内 DOM ルートに `.month-print-root` クラスを付けておくと、handlePrint が
// その直前にヘッダを差し込んでくる。
// PrintButton (window.print() 直接) は使わない。



export function MonthView({
  teacher,
  slots,
  holidays,
  subs,
  adjustments = [],
  year,
  month,
  onEdit,
  isAdmin,
  timetables,
  displayCutoff,
  examPeriods = [],
  examPrepSchedules = [],
  specialEvents = [],
  extraLessons = [],
  koshuLessons = [],
  daySchedules = [],
  onEditExtraLesson,
  classSets,
  biweeklyAnchors,
  sessionOverrides,
  visibility = DEFAULT_EVENT_VISIBILITY,
  onChangeVisibility,
  availableTags = [],
}) {
  const showExam = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const showSpecial = isEventKindVisible(visibility, EVENT_KIND.SPECIAL);
  // 日付 → この講師の特訓シフト一覧。cells.map の各セルで O(1) 参照するための索引。
  // assignments は名前キーなので、アルバイト・通常講師を問わず該当者全員を拾う。
  const examPrepByDate = useMemo(() => {
    const m = new Map();
    for (const ep of examPeriods || []) {
      if (!ep.startDate || !ep.endDate) continue;
      if (ep.startDate.slice(0, 7) > `${year}-${String(month).padStart(2, "0")}`)
        continue;
      if (ep.endDate.slice(0, 7) < `${year}-${String(month).padStart(2, "0")}`)
        continue;
      const sch = (examPrepSchedules || []).find(
        (s) => s.examPeriodId === ep.id
      );
      if (!sch) continue;
      for (const day of sch.days || []) {
        if (day.date < ep.startDate || day.date > ep.endDate) continue;
        const nos = day.assignments?.[teacher];
        if (!Array.isArray(nos) || nos.length === 0) continue;
        const set = new Set(nos);
        const shifts = (day.periods || [])
          .filter((p) => set.has(p.no))
          .sort((a, b) => a.no - b.no);
        if (shifts.length > 0) m.set(day.date, shifts);
      }
    }
    return m;
  }, [examPeriods, examPrepSchedules, teacher, year, month]);
  // 日付 → この講師の追加授業。cells.map の各セルで O(1) 参照するための索引
  // (examPrepByDate と同型。セルごとの全走査を避ける)。
  const extraByDate = useMemo(
    () => indexExtraLessonsByDate(extraLessons, teacher),
    [extraLessons, teacher]
  );
  // 日付 → この講師の講習コマ (講習時間割作成からの読み取り専用反映)。
  const koshuByDate = useMemo(
    () => indexKoshuLessonsByDate(koshuLessons, teacher),
    [koshuLessons, teacher]
  );
  // 対象: 元々この teacher のコマ + この teacher が代行に入った他人のコマ
  const teacherSubs = useMemo(
    () =>
      (subs || []).filter((s) => s.originalTeacher === teacher || s.substitute === teacher),
    [subs, teacher]
  );
  const ts = useMemo(
    () => slots.filter((s) => isSlotForTeacher(s, teacher)),
    [teacher, slots]
  );

  // 代行レコードを (date, slotId, 元講師) で索引化。日 × コマのループ内で
  // Array.find を回さないように。
  // **元講師まで鍵に入れる。** プレップのように 1 コマを 3 人で担当する
  // コマは同じ (date, slotId) に複数件立つので、(date, slotId) だけだと
  // 他人の欠勤を自分の欄に出したり、自分の欠勤を落としたりする。
  const subByDateSlotTeacher = useMemo(() => {
    const m = new Map();
    for (const s of subs || []) {
      m.set(`${s.date}|${s.slotId}|${s.originalTeacher}`, s);
    }
    return m;
  }, [subs]);
  // この講師のコマに対する、この講師自身の代行 / 欠勤レコード。
  const subForTeacher = useCallback(
    (ds, slotId) => subByDateSlotTeacher.get(`${ds}|${slotId}|${teacher}`) || null,
    [subByDateSlotTeacher, teacher]
  );

  // slotId → slot の逆引き。cells.map ループ内で合同ホスト・吸収先・
  // 代行元・振替元のスロットを引くのに以前は毎回 slots.find していたため、
  // 月 30 セル × 各セル数件 × O(slots) になっていた。
  const slotById = useMemo(() => {
    const m = new Map();
    for (const s of slots) m.set(s.id, s);
    return m;
  }, [slots]);

  // 合同の索引
  //   hostByAbsorbedKey:   (date|absorbedSlotId) -> hostSlotId  (吸収された側)
  //   absorbedByHostKey:   (date|hostSlotId) -> absorbedSlotIds[]  (ホスト側に何を吸収したか)
  // 吸収された側は「代行と同じく自分のコマが別人に渡った」状態、
  // ホスト側は「自分のコマに別クラスが追加された」状態。
  // 移動の索引
  //   moveByKey:           (date|slotId) -> targetTime
  // 振替の索引
  //   rescheduleOutByKey:  (date|slotId) -> adj  (元日付で他日へ送り出されている)
  //   rescheduleInByDate:  targetDate -> adj[]   (その日に振替で入るコマ)
  const {
    hostByAbsorbedKey,
    absorbedByHostKey,
    moveByKey,
    rescheduleOutByKey,
    rescheduleInByDate,
  } = useMemo(() => {
    const absMap = new Map();
    const hostMap = new Map();
    const moveMap = new Map();
    const rOutMap = new Map();
    const rInMap = new Map();
    for (const adj of adjustments) {
      if (adj.type === "combine") {
        const absorbedIds = adj.combineSlotIds || [];
        if (absorbedIds.length > 0) {
          hostMap.set(`${adj.date}|${adj.slotId}`, [...absorbedIds]);
        }
        for (const id of absorbedIds) {
          absMap.set(`${adj.date}|${id}`, adj.slotId);
        }
      } else if (adj.type === "move" && adj.targetTime) {
        moveMap.set(`${adj.date}|${adj.slotId}`, adj.targetTime);
      } else if (adj.type === "reschedule" && adj.targetDate) {
        rOutMap.set(`${adj.date}|${adj.slotId}`, adj);
        if (!rInMap.has(adj.targetDate)) rInMap.set(adj.targetDate, []);
        rInMap.get(adj.targetDate).push(adj);
      }
    }
    return {
      hostByAbsorbedKey: absMap,
      absorbedByHostKey: hostMap,
      moveByKey: moveMap,
      rescheduleOutByKey: rOutMap,
      rescheduleInByDate: rInMap,
    };
  }, [adjustments]);
  const dayMap = useMemo(() => {
    const m = {};
    DAYS.forEach((d) => {
      m[d] = ts.filter((s) => s.day === d);
    });
    return m;
  }, [ts]);
  // 全日判定 (開講前 / 未確定) 用。講師で絞る前の全コマから、実際にコマを
  // 持っている学年グループだけを対象にする (運用していない学年グループの
  // 終了日が空だと、他が全部終わってもバナーが出ないため)。
  const activeGroupLabels = useMemo(
    () => getCutoffGroupLabelsWithSlots(slots, displayCutoff),
    [slots, displayCutoff]
  );
  const holMap = useMemo(() => {
    const m = {};
    holidays.forEach((h) => {
      if (!m[h.date]) m[h.date] = [];
      m[h.date].push(h);
    });
    return m;
  }, [holidays]);

  // 各日付セルで使う sessionCtx (第N回バッジ用)。Dashboard/WeekView と同仕様。
  // isOffForGrade は同じ hook から取得して makeEventHelpers の重複を避ける。
  const { sessionCtx, isOffForGrade } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    specialEvents,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
  });

  // Returns exam period names active on a given date (for label display)
  // 表示用にタグフィルタ済みのリストを 1 度だけ作り、各セルでは日付 in 範囲
  // だけを判定する。授業停止判定 (isInExamPeriodForGrade) とは別軸。
  const visibleExamPeriods = useMemo(
    () => examPeriods.filter((ep) => isExamPeriodVisible(ep, visibility)),
    [examPeriods, visibility]
  );
  const examPeriodsForDate = useCallback(
    (ds) =>
      visibleExamPeriods.filter(
        (ep) => ds >= ep.startDate && ds <= ep.endDate
      ),
    [visibleExamPeriods]
  );

  // 表示用にタグフィルタ済みの特別イベントリストを 1 度だけ作る。
  const visibleSpecialEvents = useMemo(
    () => specialEvents.filter((ev) => isSpecialEventVisible(ev, visibility)),
    [specialEvents, visibility]
  );
  const specialEventsForDate = useCallback(
    (ds) =>
      visibleSpecialEvents.filter(
        (ev) => ds >= ev.startDate && ds <= ev.endDate
      ),
    [visibleSpecialEvents]
  );

  // この講師が (slot, ds) のコマを「月次ビューに載せるか」を判定する。
  // 休講・カットオフ・時間割外の場合は非表示。
  // 確定代行で本人が外されたコマ / 合同で吸収されたコマは、描画時に `away`
  // フラグでグレー表示+代/合バッジを出すため、ここでは除外しない
  // (以前は除外していたが バッジが消えて代行/合同されたことが判らない問題があった)。
  const isTeacherAttending = useCallback(
    (slot, ds) => {
      if (isOffForGrade(ds, slot.grade, slot.subj)) return false;
      // 特別時程の部分休講 (1限カット等) は休講同様このビューから外す
      if (resolveSlotDaySchedule(slot, ds, daySchedules)?.cancelled) return false;
      if (
        timetables &&
        timetables.length > 0 &&
        !isTimetableActiveForDate(
          timetables.find((t) => t.id === (slot.timetableId ?? 1)),
          ds,
          slot.grade
        )
      ) {
        return false;
      }
      if (isSlotBeyondCutoff(ds, slot, displayCutoff)) return false;
      // 隔週スロットは「その週に実施する側の講師」のビューにだけ載せる。
      if (
        isBiweekly(slot.note) &&
        !isTeacherActiveOnDate(slot, teacher, ds, biweeklyAnchors, holidays, examPeriods)
      ) {
        return false;
      }
      return true;
    },
    [isOffForGrade, timetables, displayCutoff, teacher, biweeklyAnchors, holidays, examPeriods, daySchedules]
  );

  const first = new Date(year, month - 1, 1);
  const dim = new Date(year, month, 0).getDate();
  const sd = first.getDay();
  const cells = [];
  for (let i = 0; i < sd; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const today = new Date();
  const todayD = today.getDate();
  const todayM = today.getMonth() + 1;
  const todayY = today.getFullYear();

  // 1 日ぶんのセル (MonthDayCell) に渡す月単位の索引・判定関数
  const dayCtx = {
    absorbedByHostKey,
    activeGroupLabels,
    biweeklyAnchors,
    dayMap,
    daySchedules,
    displayCutoff,
    examPeriods,
    examPeriodsForDate,
    examPrepByDate,
    extraByDate,
    holMap,
    holidays,
    hostByAbsorbedKey,
    isAdmin,
    isTeacherAttending,
    koshuByDate,
    month,
    moveByKey,
    onEdit,
    onEditExtraLesson,
    rescheduleInByDate,
    rescheduleOutByKey,
    sessionCtx,
    showExam,
    showSpecial,
    slotById,
    specialEventsForDate,
    subForTeacher,
    teacher,
    teacherSubs,
    todayD,
    todayM,
    todayY,
    year,
  };

  return (
    <div className="month-print-root" style={{ marginTop: 12 }}>
      {onChangeVisibility && (
        <div className="no-print" style={{ marginBottom: 8 }}>
          <EventVisibilityToggles
            visibility={visibility}
            onChange={onChangeVisibility}
            availableTags={availableTags}
          />
        </div>
      )}
      <div
        className="month-print-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 1,
          background: "#ccc",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              background: w === "日" ? "#f5e0e0" : w === "土" ? "#e0e0f5" : "#eee",
              textAlign: "center",
              padding: "6px 0",
              fontWeight: 800,
              fontSize: 12,
              color: w === "日" ? "#c44" : w === "土" ? "#44c" : "#333",
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d)
            return (
              <div key={`empty-${i}`} style={{ background: "#fafafa", minHeight: 90 }} />
            );
          return <MonthDayCell key={`day-${d}`} d={d} ctx={dayCtx} />;
        })}
      </div>
    </div>
  );
}
