import { useMemo } from "react";
import {
  ADJ_COLOR,
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  fmtDate,
  fmtDateWeekday,
  parseLocalDate,
  sortSlots as sortS,
  SUB_STATUS,
} from "../../data";
import { SlotCard } from "../SlotCard";
import { StatusBadge } from "../StatusBadge";
import { exportTeacherIcs } from "../../utils/ics";
import {
  biweeklyDisplaySubject,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
} from "../../utils/biweekly";
import { findNextSessionMap } from "../../utils/nextSessionDate";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { S } from "../../styles/common";
import { getExamPrepShiftsForStaff } from "../../utils/examPrepHelpers";
import { overlapsRange, formatDateRange } from "../../utils/dateHelpers";
import { EVENT_KIND, EXAM_META } from "../../constants/eventKinds";
import { specialEventTypeMeta } from "../../constants/specialEvents";
import { PrintButton } from "../PrintButton";

// 今日〜+14日の [start, end] を返す (終日 00:00)。useMemo で毎回計算しないため。
function getUpcomingWindow() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  return [today, end];
}

function isWithinWindow(dateStr, start, end) {
  const dt = parseLocalDate(dateStr);
  return !!dt && dt >= start && dt <= end;
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
  partTimeStaff = [],
  displayCutoff,
}) {
  // 隔週スロットは「今週の実施側講師」のビューにだけ出す。今日を基準週として扱う。
  const refDateStr = useMemo(() => fmtDate(new Date()), []);
  const ts = useMemo(
    () =>
      sortS(
        slots
          .filter((s) => isSlotForTeacher(s, teacher))
          .filter(
            (s) =>
              !isBiweekly(s.note) ||
              isTeacherActiveOnDate(s, teacher, refDateStr, biweeklyAnchors)
          )
      ),
    [teacher, slots, refDateStr, biweeklyAnchors]
  );
  const byDay = useMemo(() => {
    const m = {};
    DAYS.forEach((d) => {
      m[d] = [];
    });
    ts.forEach((s) => m[s.day]?.push(s));
    return m;
  }, [ts]);

  // 直近14日の [start,end] (メモの恩恵を狙って 1 回だけ作る)
  const [winStart, winEnd] = useMemo(() => getUpcomingWindow(), []);

  // ダッシュボードと同じ仕組みで 第N回 (①②③…) バッジを出す。
  // 曜日ごとに「今日以降で最初に実際の講義が成立する日」の回数マップを保持。
  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    allSlots,
    displayCutoff,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
  });
  const sessionMapByDay = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = {};
    DAYS.forEach((d, idx) => {
      // DAYS は月〜土。Date#getDay は日=0..土=6 なので月=1..土=6 に変換。
      result[d] = findNextSessionMap(byDay[d], idx + 1, today, sessionCtx);
    });
    return result;
  }, [byDay, sessionCtx]);

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
    const slotById = new Map();
    for (const s of slots) slotById.set(s.id, s);

    const m = new Map();
    const push = (slotId, entry) => {
      if (!m.has(slotId)) m.set(slotId, []);
      m.get(slotId).push(entry);
    };
    const isTeacherInactiveOnDate = (slot, dateStr) =>
      isBiweekly(slot.note) &&
      !isTeacherActiveOnDate(slot, teacher, dateStr, biweeklyAnchors);

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
  }, [adjustments, slots, teacher, winStart, winEnd, biweeklyAnchors]);

  // 移動: 各スロットに対する直近14日間の移動予定
  // 隔週スロットは「その日付に実施する側の講師」にだけ通知を出す。
  const slotMoveMap = useMemo(() => {
    if (!adjustments?.length) return new Map();
    const slotById = new Map();
    for (const s of slots) slotById.set(s.id, s);

    const m = new Map();
    for (const adj of adjustments) {
      if (adj.type !== "move") continue;
      if (!isWithinWindow(adj.date, winStart, winEnd)) continue;
      const slot = slotById.get(adj.slotId);
      if (!slot) continue;
      if (!isSlotForTeacher(slot, teacher)) continue;
      if (
        isBiweekly(slot.note) &&
        !isTeacherActiveOnDate(slot, teacher, adj.date, biweeklyAnchors)
      ) {
        continue;
      }
      if (!m.has(adj.slotId)) m.set(adj.slotId, []);
      m.get(adj.slotId).push({ date: adj.date, slot, targetTime: adj.targetTime });
    }
    return m;
  }, [adjustments, slots, teacher, winStart, winEnd, biweeklyAnchors]);

  // 振替: 直近14日間に「振替元」または「振替先」となる予定。
  // 該当する講師は (a) 元担当 = adj 対象 slot.teacher または
  //               (b) targetTeacher が指定されていればその講師。
  // 表示は targetDate (実際に実施される日) でソートする。
  const upcomingReschedules = useMemo(() => {
    if (!adjustments?.length) return [];
    const slotById = new Map();
    for (const s of slots) slotById.set(s.id, s);

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
  }, [adjustments, slots, teacher, winStart, winEnd]);

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

  // 今日から+14日間の特訓シフト (アルバイト講師の場合のみ)
  const isPartTime = useMemo(
    () => partTimeStaff.some((p) => p.name === teacher),
    [partTimeStaff, teacher]
  );
  const upcomingExamPrep = useMemo(() => {
    if (!isPartTime) return [];
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
  }, [isPartTime, examPrepSchedules, examPeriods, teacher, winStart, winEnd]);

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

  // 直近 14 日に重なるイベント (休講以外) を一覧に出す。休講は曜日マスに
  // 既に休バッジが立っているので除外。
  const upcomingEvents = useMemo(() => {
    const winStartStr = fmtDate(winStart);
    const winEndStr = fmtDate(winEnd);
    const out = [];
    for (const ep of examPeriods) {
      if (!overlapsRange(ep.startDate, ep.endDate, winStartStr, winEndStr)) continue;
      out.push({
        kind: EVENT_KIND.EXAM,
        id: `e-${ep.id}`,
        name: ep.name,
        startDate: ep.startDate,
        endDate: ep.endDate,
      });
    }
    for (const ev of specialEvents) {
      if (!overlapsRange(ev.startDate, ev.endDate, winStartStr, winEndStr)) continue;
      out.push({
        kind: EVENT_KIND.SPECIAL,
        id: `s-${ev.id}`,
        name: ev.name,
        startDate: ev.startDate,
        endDate: ev.endDate,
        eventType: ev.eventType,
      });
    }
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [examPeriods, specialEvents, winStart, winEnd]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        className="no-print"
        style={{ display: "flex", gap: 6, marginBottom: 8, justifyContent: "flex-end" }}
      >
        <button
          type="button"
          onClick={() => exportTeacherIcs(teacher, slots)}
          style={{ ...S.btn(false), fontSize: 11 }}
          title="Google Calendar に取り込み可能な iCal ファイルをダウンロード"
        >
          📅 iCalエクスポート
        </button>
        <PrintButton style={{ fontSize: 11 }} />
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
                : EXAM_META;
            const range = formatDateRange(ev.startDate, ev.endDate);
            return (
              <span
                key={ev.id}
                title={`${range} ${ev.name}`}
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
                <span style={{ fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                  {range}
                </span>
              </span>
            );
          })}
        </div>
      )}
      {upcomingCombines.length > 0 && (
        <div
          style={{
            background: ADJ_COLOR.combine.bannerBg,
            border: `1px solid ${ADJ_COLOR.combine.bannerBorder}`,
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
              color: ADJ_COLOR.combine.deep,
            }}
          >
            🔗 直近2週間の合同予定 ({upcomingCombines.length}件)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingCombines.map((c, i) => {
              const host = c.hostSlot;
              const hostLabel = `${host.grade}${host.cls && host.cls !== "-" ? host.cls : ""} ${host.subj}`;
              const isHost = c.role === "host";
              return (
                <div
                  key={`${c.date}-${c.role}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
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
                </div>
              );
            })}
          </div>
        </div>
      )}
      {upcomingMoves.length > 0 && (
        <div
          style={{
            background: ADJ_COLOR.move.bannerBg,
            border: `1px solid ${ADJ_COLOR.move.bannerBorder}`,
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
              color: ADJ_COLOR.move.deep,
            }}
          >
            ↔ 直近2週間の時間変更予定 ({upcomingMoves.length}件)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingMoves.map((mv, i) => {
              const slot = mv.slot;
              return (
                <div
                  key={`mv-${mv.date}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
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
                </div>
              );
            })}
          </div>
        </div>
      )}
      {upcomingReschedules.length > 0 && (
        <div
          style={{
            background: ADJ_COLOR.reschedule.bannerBg,
            border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
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
              color: ADJ_COLOR.reschedule.deep,
            }}
          >
            ↻ 直近2週間の振替予定 ({upcomingReschedules.length}件)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingReschedules.map(({ adj, slot }, i) => {
              const tgtTime = adj.targetTime || slot.time;
              const tgtTeacher = adj.targetTeacher || slot.teacher;
              const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
              return (
                <div
                  key={`rsch-${adj.id}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
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
                </div>
              );
            })}
          </div>
        </div>
      )}
      {upcomingExamPrep.length > 0 && (
        <div
          style={{
            background: "#fdf5e8",
            border: "1px solid #e0a030",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#8a5a1a" }}>
            📝 直近2週間のテスト直前特訓シフト ({upcomingExamPrep.length}日)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingExamPrep.map((e) => {
              const first = e.shifts[0];
              const last = e.shifts[e.shifts.length - 1];
              return (
                <div
                  key={e.date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
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
                </div>
              );
            })}
          </div>
        </div>
      )}
      {upcomingSubs.length > 0 && (
        <div
          style={{
            background: "#fffbe6",
            border: "1px solid #f0d878",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#8a6a1a" }}>
            🔄 直近2週間の代行予定 ({upcomingSubs.length}件)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingSubs.map((sub) => {
              const slot = slots.find((s) => s.id === sub.slotId);
              const isOriginal = sub.originalTeacher === teacher;
              return (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#fff",
                    padding: "6px 10px",
                    borderRadius: 6,
                    flexWrap: "wrap",
                  }}
                >
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
                      {sub.substitute || "未定"}
                    </span>
                  </span>
                  <StatusBadge status={sub.status} />
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
                </div>
              );
            })}
          </div>
        </div>
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
          {DAYS.map((d) => (
            <div key={d}>
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
                }}
              >
                {d}
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
                              ? `${biweeklyDisplaySubject(s, refDateStr, biweeklyAnchors)}（隔週）`
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
                              const st = SUB_STATUS[sub.status] || SUB_STATUS.requested;
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
                                  title={`${sub.date} ${isOriginal ? "代行依頼中" : "代行予定"}\n${sub.originalTeacher} → ${sub.substitute || "未定"}${sub.memo ? "\n" + sub.memo : ""}`}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    {sub.date.slice(5)}
                                  </span>
                                  <span style={{ color: st.color, fontWeight: 700 }}>
                                    {st.label}
                                  </span>
                                  <span style={{ color: "#666" }}>
                                    {isOriginal ? `→${sub.substitute || "?"}` : `←${sub.originalTeacher}`}
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
          ))}
        </div>
      </div>
    </div>
  );
}
