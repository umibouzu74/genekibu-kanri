import { useMemo, useState } from "react";
import {
  ADJ_COLOR,
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  fmtDate,
  fmtDateWeekday,
  parseLocalDate,
  sortSlots as sortS,
} from "../../data";
import { SlotCard } from "../SlotCard";
import { StatusBadge } from "../StatusBadge";
import { subStateMeta, subTargetLabel } from "../../utils/substituteState";
import { exportTeacherIcs } from "../../utils/ics";
import {
  biweeklyDisplaySubject,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
} from "../../utils/biweekly";
import { findNextSessionMap } from "../../utils/nextSessionDate";
import { upcomingExtraLessons } from "../../utils/extraLessons";
import { EXTRA_LESSON_COLOR } from "../../constants/colors";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { S } from "../../styles/common";
import { getExamPrepShiftsForStaff } from "../../utils/examPrepHelpers";
import {
  overlapsRange,
  formatDateRange,
  dateToDay,
} from "../../utils/dateHelpers";
import { useToday } from "../../hooks/useToday";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { shiftDate } from "./dashboardHelpers";
import { resolveSlotDaySchedule } from "../../utils/daySchedules";
import { filterSlotsForDate, isSlotBeyondCutoff } from "../../utils/timetable";
import { EVENT_KIND, EXAM_META, HOLIDAY_META } from "../../constants/eventKinds";
import { makeEventHelpers } from "./dashboardHelpers";
import { isCancelAdjustment } from "../../utils/slotCancel";
import { timeStartToMin } from "../../utils/dateHelpers";
import { specialEventTypeMeta } from "../../constants/specialEvents";
import { PrintButton } from "../PrintButton";
import {
  DEFAULT_EVENT_VISIBILITY,
  EventVisibilityToggles,
  isEventKindVisible,
  isExamPeriodVisible,
  isSpecialEventVisible,
} from "../EventVisibilityToggles";

// 印刷系統: PrintButton (window.print() 直接呼び) を使う。
// ヘッダ/凡例の動的注入は不要。詳細は src/components/PrintButton.jsx 冒頭コメント。

// 基準日〜+14日の [start, end] を返す (終日 00:00)。useMemo で毎回計算しないため。
function getUpcomingWindow(baseStr) {
  const base = parseLocalDate(baseStr);
  const end = new Date(base);
  end.setDate(end.getDate() + 14);
  return [base, end];
}

// 基準日を含む週の月曜。表は月〜土なので、日曜は「前の週の末尾」ではなく
// 次の月曜から始まる週として扱う (日曜に開いて見たいのは翌週の予定。
// ダッシュボードの時間割モードが日曜を飛ばすのと同じ向き)
function weekMondayOf(dateStr) {
  const dt = parseLocalDate(dateStr);
  if (!dt) return dateStr;
  const dow = dt.getDay(); // 日=0 .. 土=6
  return shiftDate(dateStr, dow === 0 ? 1 : 1 - dow);
}

// "YYYY-MM-DD" → "9/14" (曜日ヘッダ・期間表示用の短い表記)
function shortMD(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

// 休講チップの配色。EVENT_SECTIONS と同じ 🚫 を頭に付ける
const HOLIDAY_META_WITH_ICON = { ...HOLIDAY_META, icon: "🚫" };

function isWithinWindow(dateStr, start, end) {
  const dt = parseLocalDate(dateStr);
  return !!dt && dt >= start && dt <= end;
}

// ─── 直近2週間のお知らせバナー (合同 / 移動 / 振替 / 特訓 / 代行) ──
// 5 種類のバナーが「枠 + タイトル + 行リスト」という同じ構造を共有して
// いたため、外殻と各行を共通コンポーネントに切り出す。配色は呼び出し側
// から指定する (ADJ_COLOR.* または個別カラー)。
function UpcomingBanner({ bg, borderColor, titleColor, title, children }) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          marginBottom: 8,
          color: titleColor,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function UpcomingRow({ children, onActivate, activateTitle }) {
  return (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      title={onActivate ? activateTitle : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#fff",
        padding: "6px 10px",
        borderRadius: 6,
        flexWrap: "wrap",
        cursor: onActivate ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

export function WeekView({
  teacher,
  slots,
  subs,
  adjustments = [],
  onEdit,
  onDel,
  isAdmin,
  allSlots,
  classSets,
  biweeklyAnchors,
  sessionOverrides,
  holidays = [],
  examPeriods = [],
  examPrepSchedules = [],
  specialEvents = [],
  extraLessons = [],
  daySchedules = [],
  onEditExtraLesson,
  displayCutoff,
  timetables = [],
  visibility = DEFAULT_EVENT_VISIBILITY,
  onChangeVisibility,
  availableTags = [],
}) {
  const showExam = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const showSpecial = isEventKindVisible(visibility, EVENT_KIND.SPECIAL);
  // 「今日」はタブを開いたまま日付を跨いでも更新される (useToday)
  const todayStr = useToday();
  // 基準日 (既定は今日)。表示する週・隔週 A/B・お知らせバナーの 2 週間窓は
  // すべてこの日付から決める。講師を切り替えても週は保つ (同じ週で講師を
  // 見比べる使い方のため)
  const [weekBase, setWeekBase] = useState(todayStr);
  const weekMonday = useMemo(() => weekMondayOf(weekBase), [weekBase]);
  // 曜日 → 表示中の週のその曜日の日付 ("月" → "2026-09-14")
  const weekDates = useMemo(() => {
    const m = {};
    DAYS.forEach((d, idx) => {
      m[d] = shiftDate(weekMonday, idx);
    });
    return m;
  }, [weekMonday]);
  const weekSaturday = weekDates["土"];
  const isCurrentWeek = weekMonday <= todayStr && todayStr <= weekSaturday;
  useDateKeyNav({
    onPrev: () => setWeekBase((b) => shiftDate(b, -7)),
    onNext: () => setWeekBase((b) => shiftDate(b, 7)),
    onToday: () => setWeekBase(todayStr),
  });

  // 隔週スロットは「その週の実施側講師」のビューにだけ出す。判定は列の日付
  // (その曜日の実際の日付) で行う — 休講・テスト期間で週送りが止まる分も
  // 他の画面と同じ答えになる
  const ts = useMemo(
    () =>
      sortS(
        slots
          .filter((s) => isSlotForTeacher(s, teacher))
          .filter(
            (s) =>
              !isBiweekly(s.note) ||
              isTeacherActiveOnDate(
                s,
                teacher,
                weekDates[s.day] || weekBase,
                biweeklyAnchors,
                holidays,
                examPeriods
              )
          )
      ),
    [teacher, slots, weekDates, weekBase, biweeklyAnchors, holidays, examPeriods]
  );
  const byDay = useMemo(() => {
    const m = {};
    DAYS.forEach((d) => {
      m[d] = [];
    });
    ts.forEach((s) => m[s.day]?.push(s));
    return m;
  }, [ts]);

  // 基準日から 14 日の [start,end] (メモの恩恵を狙って 1 回だけ作る)。
  // 週を送ってもバナーは「基準日から 2 週間」のまま
  const [winStart, winEnd] = useMemo(() => getUpcomingWindow(weekBase), [weekBase]);

  // slotId → slot の逆引き。合同・移動・振替・代行の各 useMemo が
  // それぞれローカルで Map を作っていたため、slots に変化が無くても
  // 4 回構築されていた。コンポーネントスコープで 1 度だけ作る。
  const slotById = useMemo(() => {
    const m = new Map();
    for (const s of slots) m.set(s.id, s);
    return m;
  }, [slots]);

  // ダッシュボードと同じ仕組みで 第N回 (①②③…) バッジを出す。
  // 曜日ごとに「表示中の週の月曜以降で最初に実際の講義が成立する日」の
  // 回数マップを保持 (見出しに出ている日付と同じ日の回数になる)。
  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    allSlots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });
  const sessionMapByDay = useMemo(() => {
    const monday = parseLocalDate(weekMonday);
    const result = {};
    DAYS.forEach((d, idx) => {
      // DAYS は月〜土。Date#getDay は日=0..土=6 なので月=1..土=6 に変換。
      result[d] = findNextSessionMap(byDay[d], idx + 1, monday, sessionCtx);
    });
    return result;
  }, [byDay, sessionCtx, weekMonday]);

  // 各スロットに対する直近14日間の代行予定をマップ化し、SlotCard にインライン表示する
  const slotSubMap = useMemo(() => {
    if (!subs?.length) return new Map();
    const m = new Map();
    for (const sub of subs) {
      if (sub.originalTeacher !== teacher && sub.substitute !== teacher) continue;
      if (!isWithinWindow(sub.date, winStart, winEnd)) continue;
      if (!m.has(sub.slotId)) m.set(sub.slotId, []);
      m.get(sub.slotId).push(sub);
    }
    return m;
  }, [subs, teacher, winStart, winEnd]);

  // 合同: 各スロットに対する直近14日間の合同予定 (host or absorbed)
  // 戻り値の各エントリ: { date, role: "host"|"absorbed", hostSlot, absorbedSlot?, absorbedSlots? }
  // 隔週スロットは「その日付に実施する側の講師」にだけ通知を出す。
  const slotCombineMap = useMemo(() => {
    if (!adjustments?.length) return new Map();

    const m = new Map();
    const push = (slotId, entry) => {
      if (!m.has(slotId)) m.set(slotId, []);
      m.get(slotId).push(entry);
    };
    const isTeacherInactiveOnDate = (slot, dateStr) =>
      isBiweekly(slot.note) &&
      !isTeacherActiveOnDate(slot, teacher, dateStr, biweeklyAnchors, holidays, examPeriods);

    for (const adj of adjustments) {
      if (adj.type !== "combine") continue;
      if (!isWithinWindow(adj.date, winStart, winEnd)) continue;

      const hostSlot = slotById.get(adj.slotId);
      if (!hostSlot) continue;

      if (
        isSlotForTeacher(hostSlot, teacher) &&
        !isTeacherInactiveOnDate(hostSlot, adj.date)
      ) {
        const absorbedSlots = (adj.combineSlotIds || [])
          .map((id) => slotById.get(id))
          .filter(Boolean);
        push(adj.slotId, { date: adj.date, role: "host", hostSlot, absorbedSlots });
      }
      for (const absorbedId of adj.combineSlotIds || []) {
        const absorbedSlot = slotById.get(absorbedId);
        if (!absorbedSlot) continue;
        if (!isSlotForTeacher(absorbedSlot, teacher)) continue;
        if (isTeacherInactiveOnDate(absorbedSlot, adj.date)) continue;
        push(absorbedId, { date: adj.date, role: "absorbed", hostSlot, absorbedSlot });
      }
    }
    return m;
  }, [adjustments, slotById, teacher, winStart, winEnd, biweeklyAnchors, holidays, examPeriods]);

  // 移動: 各スロットに対する直近14日間の移動予定
  // 隔週スロットは「その日付に実施する側の講師」にだけ通知を出す。
  const slotMoveMap = useMemo(() => {
    if (!adjustments?.length) return new Map();

    const m = new Map();
    for (const adj of adjustments) {
      if (adj.type !== "move") continue;
      if (!isWithinWindow(adj.date, winStart, winEnd)) continue;
      const slot = slotById.get(adj.slotId);
      if (!slot) continue;
      if (!isSlotForTeacher(slot, teacher)) continue;
      if (
        isBiweekly(slot.note) &&
        !isTeacherActiveOnDate(slot, teacher, adj.date, biweeklyAnchors, holidays, examPeriods)
      ) {
        continue;
      }
      if (!m.has(adj.slotId)) m.set(adj.slotId, []);
      m.get(adj.slotId).push({ date: adj.date, slot, targetTime: adj.targetTime });
    }
    return m;
  }, [adjustments, slotById, teacher, winStart, winEnd, biweeklyAnchors, holidays, examPeriods]);

  // 振替: 直近14日間に「振替元」または「振替先」となる予定。
  // 該当する講師は (a) 元担当 = adj 対象 slot.teacher または
  //               (b) targetTeacher が指定されていればその講師。
  // 表示は targetDate (実際に実施される日) でソートする。
  const upcomingReschedules = useMemo(() => {
    if (!adjustments?.length) return [];

    const out = [];
    for (const adj of adjustments) {
      if (adj.type !== "reschedule") continue;
      const slot = slotById.get(adj.slotId);
      if (!slot) continue;
      const involved =
        isSlotForTeacher(slot, teacher) ||
        (adj.targetTeacher && adj.targetTeacher === teacher);
      if (!involved) continue;
      // ウィンドウ内に「元日」または「振替先日」が入っていれば候補
      const inSrc = isWithinWindow(adj.date, winStart, winEnd);
      const inTgt =
        adj.targetDate && isWithinWindow(adj.targetDate, winStart, winEnd);
      if (!inSrc && !inTgt) continue;
      out.push({ adj, slot });
    }
    out.sort((a, b) =>
      (a.adj.targetDate || a.adj.date).localeCompare(
        b.adj.targetDate || b.adj.date
      )
    );
    return out;
  }, [adjustments, slotById, teacher, winStart, winEnd]);

  // 上部バナー用: フラット化 + 日付ソート
  const upcomingCombines = useMemo(() => {
    const list = [];
    for (const arr of slotCombineMap.values()) list.push(...arr);
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [slotCombineMap]);

  const upcomingMoves = useMemo(() => {
    const list = [];
    for (const arr of slotMoveMap.values()) list.push(...arr);
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [slotMoveMap]);

  // 今日から+14日間の特訓シフト (assignments に登録のある講師全員)
  const upcomingExamPrep = useMemo(() => {
    if (!examPrepSchedules?.length || !examPeriods?.length) return [];
    const out = [];
    const cur = new Date(winStart);
    while (cur <= winEnd) {
      const ds = fmtDate(cur);
      const shifts = getExamPrepShiftsForStaff(
        teacher,
        ds,
        examPeriods,
        examPrepSchedules
      );
      if (shifts.length > 0) {
        const ep = examPeriods.find(
          (e) => ds >= e.startDate && ds <= e.endDate
        );
        out.push({ date: ds, shifts, examPeriodName: ep?.name || "" });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [examPrepSchedules, examPeriods, teacher, winStart, winEnd]);

  // 今日から+14日間の追加授業 (この teacher が担当する分)
  const upcomingExtras = useMemo(
    () =>
      upcomingExtraLessons(extraLessons, {
        teacher,
        winStartStr: fmtDate(winStart),
        winEndStr: fmtDate(winEnd),
      }),
    [extraLessons, teacher, winStart, winEnd]
  );

  // 今日から+14日間の代行予定 (この teacher が元講師 or 代行者)
  const upcomingSubs = useMemo(() => {
    if (!subs?.length) return [];
    return subs
      .filter((sub) => {
        if (sub.originalTeacher !== teacher && sub.substitute !== teacher) return false;
        return isWithinWindow(sub.date, winStart, winEnd);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, teacher, winStart, winEnd]);

  // 今日から+14日間のコマ休講 (adjustments の cancel) のうち、この teacher の
  // コマに効くもの。隔週は担当する週だけ。
  const upcomingCancels = useMemo(() => {
    if (!adjustments?.length) return [];
    const out = [];
    for (const adj of adjustments) {
      if (!isCancelAdjustment(adj)) continue;
      if (!isWithinWindow(adj.date, winStart, winEnd)) continue;
      const slot = slotById.get(adj.slotId);
      if (!slot || !isSlotForTeacher(slot, teacher)) continue;
      if (
        isBiweekly(slot.note) &&
        !isTeacherActiveOnDate(slot, teacher, adj.date, biweeklyAnchors, holidays, examPeriods)
      ) {
        continue;
      }
      out.push({ adj, slot });
    }
    return out.sort(
      (a, b) =>
        a.adj.date.localeCompare(b.adj.date) ||
        timeStartToMin(a.slot.time) - timeStartToMin(b.slot.time)
    );
  }, [adjustments, slotById, teacher, winStart, winEnd, biweeklyAnchors, holidays, examPeriods]);

  // 今日から+14日間の特別時程のうち、この teacher のコマに効くもの。
  // 各件について「どのコマがどう変わるか」(時刻読み替え / 休講) を添える。
  const upcomingDaySchedules = useMemo(() => {
    if (!daySchedules?.length) return [];
    const out = [];
    for (const d of daySchedules) {
      if (!isWithinWindow(d.date, winStart, winEnd)) continue;
      const dow = dateToDay(d.date);
      if (!dow) continue;
      const items = [];
      for (const slot of ts) {
        if (slot.day !== dow) continue;
        const r = resolveSlotDaySchedule(slot, d.date, [d]);
        if (!r) continue;
        items.push({ slot, cancelled: !!r.cancelled, to: r.time });
      }
      if (items.length > 0) out.push({ schedule: d, items });
    }
    return out.sort((a, b) => a.schedule.date.localeCompare(b.schedule.date));
  }, [daySchedules, ts, winStart, winEnd]);

  // 直近 14 日の休講のうち、この講師のコマに効くもの。週間ビューの曜日マスは
  // 日付を持たないので休講バッジは立たない = ここで出さないとどこにも出ない。
  // 部門 (scope) / 学年 / 教科キーワードの読み方はダッシュボードと同じ
  // (dashboardHelpers.makeEventHelpers.isHolidayForSlot)。休講ごとにヘルパを
  // 作るのは「どの休講が当たったか」を出すため (まとめて索引にすると
  // 同じ日の別の休講と区別できない)。隔週コマはその日の担当週だけ見る
  const upcomingHolidays = useMemo(() => {
    if (!holidays?.length) return [];
    const teacherSlots = slots.filter((s) => isSlotForTeacher(s, teacher));
    const out = [];
    for (const h of holidays) {
      if (!h?.date || !isWithinWindow(h.date, winStart, winEnd)) continue;
      const dow = dateToDay(h.date);
      if (!dow) continue;
      const { isHolidayForSlot } = makeEventHelpers([h]);
      // その日に実施されるコマだけ (曜日だけで絞ると、終了日を入れた旧期の
      // コマや終講後のコマにも休講が付く。CLAUDE.md「表示期間設定」)
      const heldSlots = filterSlotsForDate(teacherSlots, h.date, timetables).filter(
        (s) => !isSlotBeyondCutoff(h.date, s, displayCutoff)
      );
      const affected = heldSlots.filter(
        (s) =>
          s.day === dow &&
          isHolidayForSlot(h.date, s.grade, s.subj) &&
          (!isBiweekly(s.note) ||
            isTeacherActiveOnDate(s, teacher, h.date, biweeklyAnchors, holidays, examPeriods))
      );
      if (affected.length === 0) continue;
      out.push({ holiday: h, affected });
    }
    return out;
  }, [holidays, slots, teacher, winStart, winEnd, biweeklyAnchors, examPeriods, timetables, displayCutoff]);

  // 直近 14 日に重なるイベント (休講・テスト期間・特別イベント) を一覧に出す。
  // 休講は visibility トグルの対象外 (常時表示)
  const upcomingEvents = useMemo(() => {
    const winStartStr = fmtDate(winStart);
    const winEndStr = fmtDate(winEnd);
    const out = [];
    for (const { holiday: h, affected } of upcomingHolidays) {
      out.push({
        kind: EVENT_KIND.HOLIDAY,
        id: `h-${h.id ?? h.date}`,
        name: h.label || "休講",
        startDate: h.date,
        endDate: h.date,
        tags: [],
        affected: affected.map(
          (s) => `${s.grade}${s.cls && s.cls !== "-" ? s.cls : ""} ${s.subj}`
        ),
      });
    }
    if (showExam) {
      for (const ep of examPeriods) {
        if (!isExamPeriodVisible(ep, visibility)) continue;
        if (!overlapsRange(ep.startDate, ep.endDate, winStartStr, winEndStr)) continue;
        out.push({
          kind: EVENT_KIND.EXAM,
          id: `e-${ep.id}`,
          name: ep.name,
          startDate: ep.startDate,
          endDate: ep.endDate,
          tags: ep.tags || [],
          stopsClasses: ep.stopsClasses,
        });
      }
    }
    if (showSpecial) {
      for (const ev of specialEvents) {
        if (!isSpecialEventVisible(ev, visibility)) continue;
        if (!overlapsRange(ev.startDate, ev.endDate, winStartStr, winEndStr)) continue;
        out.push({
          kind: EVENT_KIND.SPECIAL,
          id: `s-${ev.id}`,
          name: ev.name,
          startDate: ev.startDate,
          endDate: ev.endDate,
          eventType: ev.eventType,
          tags: ev.tags || [],
        });
      }
    }
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [upcomingHolidays, examPeriods, specialEvents, showExam, showSpecial, visibility, winStart, winEnd]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {onChangeVisibility && (
          <EventVisibilityToggles
            visibility={visibility}
            onChange={onChangeVisibility}
            availableTags={availableTags}
          />
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => exportTeacherIcs(teacher, slots, biweeklyAnchors)}
            style={{ ...S.btn(false), fontSize: 11 }}
            title="Google Calendar に取り込み可能な iCal ファイルをダウンロード"
          >
            📅 iCalエクスポート
          </button>
          <PrintButton style={{ fontSize: 11 }} />
        </div>
      </div>
      {/* 基準週の切替。← / → で前後の週、t で今週 (useDateKeyNav) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          background: "#fff",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #e0e0e0",
          marginBottom: 10,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 13, color: "#444" }}>表示する週</span>
        <button
          type="button"
          onClick={() => setWeekBase((b) => shiftDate(b, -7))}
          style={{ ...S.btn(false), fontSize: 12 }}
          title="前の週 (←)"
        >
          ◀ 前の週
        </button>
        <button
          type="button"
          onClick={() => setWeekBase(todayStr)}
          style={{ ...S.btn(isCurrentWeek), fontSize: 12 }}
          title="今週 (t)"
        >
          今週
        </button>
        <button
          type="button"
          onClick={() => setWeekBase((b) => shiftDate(b, 7))}
          style={{ ...S.btn(false), fontSize: 12 }}
          title="次の週 (→)"
        >
          次の週 ▶
        </button>
        <input
          type="date"
          aria-label="基準日"
          value={weekBase}
          onChange={(e) => e.target.value && setWeekBase(e.target.value)}
          style={{ ...S.input, width: "auto", padding: "4px 8px", fontSize: 12 }}
        />
        <span
          data-testid="week-range"
          style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#555" }}
        >
          {shortMD(weekMonday)} (月) 〜 {shortMD(weekSaturday)} (土)
          {isCurrentWeek && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "#b08000" }}>今週</span>
          )}
        </span>
      </div>
      {upcomingEvents.length > 0 && (
        <div
          style={{
            background: "#fbf9f3",
            border: "1px solid #e0d8c0",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#7a6020",
              marginRight: 4,
            }}
          >
            直近2週間のイベント:
          </span>
          {upcomingEvents.map((ev) => {
            const meta =
              ev.kind === EVENT_KIND.SPECIAL
                ? specialEventTypeMeta(ev.eventType)
                : ev.kind === EVENT_KIND.HOLIDAY
                  ? HOLIDAY_META_WITH_ICON
                  : EXAM_META;
            const range = formatDateRange(ev.startDate, ev.endDate);
            const affectedText = ev.affected?.length
              ? `休講: ${ev.affected.join(" / ")}`
              : "";
            return (
              <span
                key={ev.id}
                title={`${range} ${ev.name}${affectedText ? `\n${affectedText}` : ""}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: meta.bg,
                  color: meta.fg,
                  border: `1px solid ${meta.accent}`,
                }}
              >
                {meta.icon ? `${meta.icon} ` : ""}
                {ev.name}
                {ev.affected?.length > 0 && (
                  <span style={{ marginLeft: 4, opacity: 0.75, fontWeight: 400 }}>
                    ({ev.affected.join(" / ")})
                  </span>
                )}
                {(ev.tags || []).length > 0 && (
                  <span style={{ marginLeft: 4, opacity: 0.75 }}>
                    [{ev.tags.join("·")}]
                  </span>
                )}
                <span style={{ fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                  {range}
                </span>
              </span>
            );
          })}
        </div>
      )}
      {upcomingCombines.length > 0 && (
        <UpcomingBanner
          bg={ADJ_COLOR.combine.bannerBg}
          borderColor={ADJ_COLOR.combine.bannerBorder}
          titleColor={ADJ_COLOR.combine.deep}
          title={`🔗 直近2週間の合同予定 (${upcomingCombines.length}件)`}
        >
          {upcomingCombines.map((c, i) => {
            const host = c.hostSlot;
            const hostLabel = `${host.grade}${host.cls && host.cls !== "-" ? host.cls : ""} ${host.subj}`;
            const isHost = c.role === "host";
            return (
              <UpcomingRow key={`${c.date}-${c.role}-${i}`}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                  {fmtDateWeekday(c.date)}
                </span>
                <span style={{ fontSize: 11, color: "#666", minWidth: 90 }}>
                  {host.time}
                </span>
                {isHost ? (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{hostLabel}</span>
                    <span style={{ fontSize: 11, color: "#888" }}>
                      + {c.absorbedSlots
                        .map((a) => `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}`)
                        .join(" / ")}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        background: ADJ_COLOR.combine.chipBg,
                        color: ADJ_COLOR.combine.deep,
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 700,
                        marginLeft: "auto",
                      }}
                    >
                      ホスト側
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {c.absorbedSlot.grade}
                      {c.absorbedSlot.cls && c.absorbedSlot.cls !== "-" ? c.absorbedSlot.cls : ""}{" "}
                      {c.absorbedSlot.subj}
                    </span>
                    <span style={{ fontSize: 11, color: "#888" }}>
                      → {hostLabel} ({host.teacher})
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        background: ADJ_COLOR.combine.bg,
                        color: ADJ_COLOR.combine.color,
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 700,
                        marginLeft: "auto",
                      }}
                    >
                      吸収される側
                    </span>
                  </>
                )}
              </UpcomingRow>
            );
          })}
        </UpcomingBanner>
      )}
      {upcomingMoves.length > 0 && (
        <UpcomingBanner
          bg={ADJ_COLOR.move.bannerBg}
          borderColor={ADJ_COLOR.move.bannerBorder}
          titleColor={ADJ_COLOR.move.deep}
          title={`↔ 直近2週間の時間変更予定 (${upcomingMoves.length}件)`}
        >
          {upcomingMoves.map((mv, i) => {
            const slot = mv.slot;
            return (
              <UpcomingRow key={`mv-${mv.date}-${i}`}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                  {fmtDateWeekday(mv.date)}
                </span>
                <span style={{ fontSize: 11, color: "#888", minWidth: 110 }}>
                  <span style={{ textDecoration: "line-through" }}>{slot.time}</span>
                  <span style={{ margin: "0 4px" }}>→</span>
                  <span style={{ fontWeight: 700, color: ADJ_COLOR.move.deep }}>
                    {mv.targetTime}
                  </span>
                </span>
                <span style={{ fontSize: 11 }}>
                  {slot.grade}
                  {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}
                </span>
              </UpcomingRow>
            );
          })}
        </UpcomingBanner>
      )}
      {upcomingDaySchedules.length > 0 && (
        <UpcomingBanner
          bg="#efeafa"
          borderColor="#a898d8"
          titleColor="#4a3a8e"
          title={`⏰ 直近2週間の特別時程 (${upcomingDaySchedules.length}件)`}
        >
          {upcomingDaySchedules.map(({ schedule, items }) => (
            <UpcomingRow key={`dsch-${schedule.id}`}>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                {fmtDateWeekday(schedule.date)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#4a3a8e" }}>
                {schedule.label || "特別時程"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#555",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {items.map(({ slot, cancelled, to }) => (
                  <span key={slot.id}>
                    {slot.grade}
                    {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}{" "}
                    {cancelled ? (
                      <span style={{ color: "#b03030", fontWeight: 700 }}>
                        休講
                      </span>
                    ) : (
                      <>
                        <span style={{ textDecoration: "line-through" }}>
                          {slot.time}
                        </span>
                        <span style={{ margin: "0 3px" }}>→</span>
                        <span style={{ fontWeight: 700, color: "#4a3a8e" }}>
                          {to}
                        </span>
                      </>
                    )}
                  </span>
                ))}
              </span>
            </UpcomingRow>
          ))}
        </UpcomingBanner>
      )}
      {upcomingCancels.length > 0 && (
        <UpcomingBanner
          bg="#f4f4f4"
          borderColor="#cfcfcf"
          titleColor="#555"
          title={`🚫 直近2週間のコマ休講 (${upcomingCancels.length}件)`}
        >
          {upcomingCancels.map(({ adj, slot }) => (
            <UpcomingRow key={`cancel-${adj.id}`}>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                {fmtDateWeekday(adj.date)}
              </span>
              <span
                style={{ fontSize: 11, color: "#888", textDecoration: "line-through" }}
              >
                {slot.time}
              </span>
              <span style={{ fontSize: 11 }}>
                {slot.grade}
                {slot.cls && slot.cls !== "-" ? slot.cls : ""} {slot.subj}
              </span>
              <span style={{ fontSize: 11, color: "#b03030", fontWeight: 700 }}>休講</span>
              {adj.memo && (
                <span style={{ fontSize: 11, color: "#666" }}>({adj.memo})</span>
              )}
            </UpcomingRow>
          ))}
        </UpcomingBanner>
      )}
      {upcomingReschedules.length > 0 && (
        <UpcomingBanner
          bg={ADJ_COLOR.reschedule.bannerBg}
          borderColor={ADJ_COLOR.reschedule.bannerBorder}
          titleColor={ADJ_COLOR.reschedule.deep}
          title={`↻ 直近2週間の振替予定 (${upcomingReschedules.length}件)`}
        >
          {upcomingReschedules.map(({ adj, slot }, i) => {
            const tgtTime = adj.targetTime || slot.time;
            const tgtTeacher = adj.targetTeacher || slot.teacher;
            const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
            return (
              <UpcomingRow key={`rsch-${adj.id}-${i}`}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                  {fmtDateWeekday(adj.targetDate)}
                </span>
                <span style={{ fontSize: 11, color: "#888", minWidth: 130 }}>
                  <span style={{ textDecoration: "line-through" }}>
                    {adj.date} {slot.time}
                  </span>
                  <span style={{ margin: "0 4px" }}>→</span>
                  <span
                    style={{ fontWeight: 700, color: ADJ_COLOR.reschedule.deep }}
                  >
                    {tgtTime}
                  </span>
                </span>
                <span style={{ fontSize: 11 }}>
                  {slot.grade}
                  {cls} {slot.subj}
                  <span style={{ color: "#666", marginLeft: 4 }}>
                    ({tgtTeacher})
                  </span>
                </span>
                {adj.memo && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#888",
                      fontStyle: "italic",
                    }}
                  >
                    {adj.memo}
                  </span>
                )}
              </UpcomingRow>
            );
          })}
        </UpcomingBanner>
      )}
      {upcomingExamPrep.length > 0 && (
        <UpcomingBanner
          bg="#fdf5e8"
          borderColor="#e0a030"
          titleColor="#8a5a1a"
          title={`📝 直近2週間のテスト直前特訓シフト (${upcomingExamPrep.length}日)`}
        >
          {upcomingExamPrep.map((e) => {
            const first = e.shifts[0];
            const last = e.shifts[e.shifts.length - 1];
            return (
              <UpcomingRow key={e.date}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                  {fmtDateWeekday(e.date)}
                </span>
                <span style={{ fontSize: 11, color: "#666", minWidth: 110 }}>
                  {first.start}〜{last.end}
                </span>
                <span style={{ fontSize: 11 }}>
                  {e.shifts.map((s) => `${s.no}校時`).join(" / ")}
                </span>
                {e.examPeriodName && (
                  <span
                    style={{
                      fontSize: 9,
                      background: "#fff2d8",
                      color: "#8a5a1a",
                      padding: "1px 6px",
                      borderRadius: 10,
                      fontWeight: 700,
                      marginLeft: "auto",
                    }}
                  >
                    {e.examPeriodName}
                  </span>
                )}
              </UpcomingRow>
            );
          })}
        </UpcomingBanner>
      )}
      {upcomingSubs.length > 0 && (
        <UpcomingBanner
          bg="#fffbe6"
          borderColor="#f0d878"
          titleColor="#8a6a1a"
          title={`🔄 直近2週間の代行予定 (${upcomingSubs.length}件)`}
        >
          {upcomingSubs.map((sub) => {
            const slot = slotById.get(sub.slotId);
            const isOriginal = sub.originalTeacher === teacher;
            return (
              <UpcomingRow key={sub.id}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                  {fmtDateWeekday(sub.date)}
                </span>
                <span style={{ fontSize: 11, color: "#666", minWidth: 90 }}>
                  {slot?.time || "-"}
                </span>
                <span style={{ fontSize: 11 }}>
                  {slot
                    ? `${slot.grade}${slot.cls && slot.cls !== "-" ? slot.cls : ""} ${slot.subj}`
                    : "(削除済)"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>
                  <span style={{ color: isOriginal ? "#c03030" : "#888" }}>
                    {sub.originalTeacher}
                  </span>
                  <span style={{ margin: "0 4px", color: "#888" }}>→</span>
                  <span style={{ color: !isOriginal ? "#2a7a4a" : "#888" }}>
                    {subTargetLabel(sub)}
                  </span>
                </span>
                <StatusBadge status={sub.status} substitute={sub.substitute} />
                {isOriginal ? (
                  <span
                    style={{
                      fontSize: 9,
                      background: "#fde4e4",
                      color: "#c03030",
                      padding: "1px 6px",
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    お願いする側
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 9,
                      background: "#e0f2e4",
                      color: "#2a7a4a",
                      padding: "1px 6px",
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    代行する側
                  </span>
                )}
              </UpcomingRow>
            );
          })}
        </UpcomingBanner>
      )}
      {upcomingExtras.length > 0 && (
        <UpcomingBanner
          bg={EXTRA_LESSON_COLOR.bannerBg}
          borderColor={EXTRA_LESSON_COLOR.bannerBorder}
          titleColor={EXTRA_LESSON_COLOR.deep}
          title={`➕ 直近2週間の追加授業 (${upcomingExtras.length}件)`}
        >
          {upcomingExtras.map((l) => (
            <UpcomingRow
              key={l.id}
              onActivate={
                onEditExtraLesson ? () => onEditExtraLesson(l.id) : undefined
              }
              activateTitle="クリックで追加授業の編集画面を開きます"
            >
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110 }}>
                {fmtDateWeekday(l.date)}
              </span>
              <span style={{ fontSize: 11, color: "#666", minWidth: 90 }}>
                {l.time}
              </span>
              <span style={{ fontSize: 11 }}>
                {l.grade}
                {l.cls && l.cls !== "-" ? l.cls : ""} {l.subj}
                {l.room ? ` @${l.room}` : ""}
              </span>
              {l.label && (
                <span
                  style={{
                    fontSize: 9,
                    background: EXTRA_LESSON_COLOR.chipBg,
                    color: EXTRA_LESSON_COLOR.deep,
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontWeight: 700,
                    marginLeft: "auto",
                  }}
                >
                  {l.label}
                </span>
              )}
            </UpcomingRow>
          ))}
        </UpcomingBanner>
      )}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
            minWidth: 600,
          }}
        >
          {DAYS.map((d) => {
            const colDate = weekDates[d];
            const isTodayCol = colDate === todayStr;
            return (
            <div
              key={d}
              className={isTodayCol ? "week-col-today" : undefined}
              style={{
                borderRadius: 8,
                // 今日の列は黄枠で目立たせる (月間カレンダーの今日と同じ色)
                outline: isTodayCol ? "2px solid #e6a800" : "none",
                outlineOffset: isTodayCol ? 1 : 0,
              }}
            >
              <div
                style={{
                  background: DC[d],
                  color: "#fff",
                  textAlign: "center",
                  padding: "7px 0",
                  borderRadius: "8px 8px 0 0",
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: 2,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span>{d}</span>
                {/* 列の日付は紙面にも出す (どの週の表か判るように) */}
                <span style={{ fontSize: 11, letterSpacing: 0, opacity: 0.9 }}>
                  {shortMD(colDate)}
                </span>
                {isTodayCol && (
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: 0,
                      background: "#e6a800",
                      color: "#fff",
                      padding: "0 5px",
                      borderRadius: 8,
                      fontWeight: 800,
                    }}
                  >
                    今日
                  </span>
                )}
              </div>
              <div
                style={{
                  background: DB[d],
                  borderRadius: "0 0 8px 8px",
                  padding: 6,
                  minHeight: 80,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {byDay[d].length === 0 ? (
                  <div style={{ color: "#ccc", textAlign: "center", padding: 16, fontSize: 11 }}>
                    —
                  </div>
                ) : (
                  byDay[d].map((s) => {
                    const slotSubs = slotSubMap.get(s.id);
                    const slotCombines = slotCombineMap.get(s.id);
                    const slotMoves = slotMoveMap.get(s.id);
                    // 直近 14 日以内のイベント件数: SlotCard 右上にサマリーバッジ。
                    // 詳細は下のインラインリストで見せるが、一目で「このコマは
                    // 何か起きる」ことが判るよう本体にもヒントを出す。
                    const subCount = slotSubs?.length || 0;
                    const combineCount = slotCombines?.length || 0;
                    const moveCount = slotMoves?.length || 0;
                    const hasAny = subCount + combineCount + moveCount > 0;
                    const summaryBadge = (label, count, color, key) => (
                      <span
                        key={key}
                        style={{
                          background: color,
                          color: "#fff",
                          fontSize: 8,
                          fontWeight: 800,
                          padding: "0 4px",
                          borderRadius: 3,
                          lineHeight: "14px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                          boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                        }}
                      >
                        {label}
                        {count > 1 && <span style={{ fontSize: 8 }}>×{count}</span>}
                      </span>
                    );
                    return (
                      <div key={s.id} style={{ position: "relative" }}>
                        <SlotCard
                          slot={s}
                          compact
                          sessionNum={sessionMapByDay[d]?.get(s.id) || 0}
                          onEdit={isAdmin ? onEdit : undefined}
                          onDel={isAdmin ? onDel : undefined}
                          displaySubject={
                            isBiweekly(s.note)
                              ? `${biweeklyDisplaySubject(s, weekDates[d], biweeklyAnchors, holidays, examPeriods)}（隔週）`
                              : undefined
                          }
                          hideNote={isBiweekly(s.note)}
                        />
                        {hasAny && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              display: "flex",
                              gap: 2,
                              zIndex: 1,
                              pointerEvents: "none",
                            }}
                            title={[
                              subCount > 0 ? `代行 ${subCount} 件` : null,
                              combineCount > 0 ? `合同 ${combineCount} 件` : null,
                              moveCount > 0 ? `時間変更 ${moveCount} 件` : null,
                            ]
                              .filter(Boolean)
                              .join(" / ")}
                          >
                            {subCount > 0 && summaryBadge("代", subCount, "#3a6ea5", "sub")}
                            {combineCount > 0 &&
                              summaryBadge("合", combineCount, ADJ_COLOR.combine.color, "combine")}
                            {moveCount > 0 &&
                              summaryBadge("移", moveCount, ADJ_COLOR.move.color, "move")}
                          </div>
                        )}
                        {slotCombines && slotCombines.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              marginTop: 2,
                            }}
                          >
                            {slotCombines.map((c, i) => {
                              const isHost = c.role === "host";
                              return (
                                <div
                                  key={`cmb-${c.date}-${i}`}
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1.3,
                                    padding: "2px 4px",
                                    borderRadius: 4,
                                    background: ADJ_COLOR.combine.bg,
                                    borderLeft: `2px solid ${ADJ_COLOR.combine.color}`,
                                    display: "flex",
                                    gap: 4,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                  title={
                                    isHost
                                      ? `${c.date} 合同ホスト\n+ ${c.absorbedSlots
                                          .map(
                                            (a) =>
                                              `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}`
                                          )
                                          .join(" / ")}`
                                      : `${c.date} 合同で吸収\n→ ${c.hostSlot.grade}${c.hostSlot.cls && c.hostSlot.cls !== "-" ? c.hostSlot.cls : ""} ${c.hostSlot.subj} (${c.hostSlot.teacher})`
                                  }
                                >
                                  <span style={{ fontWeight: 700 }}>{c.date.slice(5)}</span>
                                  <span style={{ color: ADJ_COLOR.combine.color, fontWeight: 700 }}>
                                    {isHost ? "合同ホスト" : "合同吸収"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {slotMoves && slotMoves.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              marginTop: 2,
                            }}
                          >
                            {slotMoves.map((mv, i) => (
                              <div
                                key={`mv-${mv.date}-${i}`}
                                style={{
                                  fontSize: 9,
                                  lineHeight: 1.3,
                                  padding: "2px 4px",
                                  borderRadius: 4,
                                  background: ADJ_COLOR.move.bg,
                                  borderLeft: `2px solid ${ADJ_COLOR.move.color}`,
                                  display: "flex",
                                  gap: 4,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                                title={`${mv.date} 時間変更\n${mv.slot.time} → ${mv.targetTime}`}
                              >
                                <span style={{ fontWeight: 700 }}>{mv.date.slice(5)}</span>
                                <span style={{ color: ADJ_COLOR.move.color, fontWeight: 700 }}>
                                  {mv.slot.time.split("-")[0]}→{mv.targetTime.split("-")[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {slotSubs && slotSubs.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              marginTop: 2,
                            }}
                          >
                            {slotSubs.map((sub) => {
                              const st = subStateMeta(sub);
                              const isOriginal = sub.originalTeacher === teacher;
                              return (
                                <div
                                  key={sub.id}
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1.3,
                                    padding: "2px 4px",
                                    borderRadius: 4,
                                    background: st.bg,
                                    borderLeft: `2px solid ${st.color}`,
                                    display: "flex",
                                    gap: 4,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                  title={`${sub.date} ${isOriginal ? st.note : "代行予定"}\n${sub.originalTeacher} → ${subTargetLabel(sub)}${sub.memo ? "\n" + sub.memo : ""}`}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    {sub.date.slice(5)}
                                  </span>
                                  <span style={{ color: st.color, fontWeight: 700 }}>
                                    {st.label}
                                  </span>
                                  <span style={{ color: "#666" }}>
                                    {isOriginal
                                      ? `→${subTargetLabel(sub)}`
                                      : `←${sub.originalTeacher}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
