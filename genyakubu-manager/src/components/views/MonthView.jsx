import { useCallback, useMemo } from "react";
import {
  ADJ_COLOR,
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  gradeColor as GC,
  SUB_STATUS,
  WEEKDAYS,
} from "../../data";
import { isTimetableActiveForDate, isBeyondCutoff, isEntireDayBeyondCutoff } from "../../utils/timetable";
import {
  biweeklyDisplaySubject,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
} from "../../utils/biweekly";
import { buildSessionCountMap, formatSessionNumber } from "../../utils/sessionCount";
import { useSessionCtx } from "../../hooks/useSessionCtx";

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
  partTimeStaff = [],
  classSets,
  biweeklyAnchors,
  sessionOverrides,
}) {
  const isPartTime = useMemo(
    () => (partTimeStaff || []).some((p) => p.name === teacher),
    [partTimeStaff, teacher]
  );
  // 日付 → この講師の特訓シフト一覧。cells.map の各セルで O(1) 参照するための索引。
  const examPrepByDate = useMemo(() => {
    if (!isPartTime) return new Map();
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
  }, [isPartTime, examPeriods, examPrepSchedules, teacher, year, month]);
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

  // 代行レコードを (date, slotId) で索引化。日 × コマのループ内で
  // Array.find を回さないように。
  const subByDateSlot = useMemo(() => {
    const m = new Map();
    for (const s of subs || []) {
      m.set(`${s.date}|${s.slotId}`, s);
    }
    return m;
  }, [subs]);

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
  const holMap = useMemo(() => {
    const m = {};
    holidays.forEach((h) => {
      if (!m[h.date]) m[h.date] = [];
      m[h.date].push(h);
    });
    return m;
  }, [holidays]);

  // 各日付セルで使う sessionCtx (第N回バッジ用)。Dashboard/WeekView と同仕様。
  // isOffForGrade は同じ hook から取得して makeHolidayHelpers の重複を避ける。
  const { sessionCtx, isOffForGrade } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
  });

  // Returns exam period names active on a given date (for label display)
  const examPeriodsForDate = useCallback(
    (ds) => examPeriods.filter((ep) => ds >= ep.startDate && ds <= ep.endDate),
    [examPeriods]
  );

  // この講師が (slot, ds) のコマを「月次ビューに載せるか」を判定する。
  // 休講・カットオフ・時間割外の場合は非表示。
  // 確定代行で本人が外されたコマ / 合同で吸収されたコマは、描画時に `away`
  // フラグでグレー表示+代/合バッジを出すため、ここでは除外しない
  // (以前は除外していたが バッジが消えて代行/合同されたことが判らない問題があった)。
  const isTeacherAttending = useCallback(
    (slot, ds) => {
      if (isOffForGrade(ds, slot.grade, slot.subj)) return false;
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
      if (isBeyondCutoff(ds, slot.grade, displayCutoff)) return false;
      // 隔週スロットは「その週に実施する側の講師」のビューにだけ載せる。
      if (
        isBiweekly(slot.note) &&
        !isTeacherActiveOnDate(slot, teacher, ds, biweeklyAnchors)
      ) {
        return false;
      }
      return true;
    },
    [isOffForGrade, timetables, displayCutoff, teacher, biweeklyAnchors]
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

  return (
    <div style={{ marginTop: 12 }}>
      <div
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
          const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dow = new Date(year, month - 1, d).getDay();
          const dn = WEEKDAYS[dow];
          const hols = holMap[ds] || [];
          const isFullOff = hols.some((h) => {
            const sc = h.scope || ["全部"];
            if (!sc.includes("全部")) return false;
            if ((h.targetGrades || []).length > 0) return false;
            if ((h.subjKeywords || []).length > 0) return false;
            return true;
          });
          const offDepts = [
            ...new Set(
              hols
                .filter((h) => (h.targetGrades || []).length === 0 && (h.subjKeywords || []).length === 0)
                .flatMap((h) => (h.scope || ["全部"]).filter((s) => s !== "全部"))
            ),
          ];
          const granularHols = hols.filter(
            (h) => (h.targetGrades || []).length > 0 || (h.subjKeywords || []).length > 0
          );
          const epActive = examPeriodsForDate(ds);
          const hasExam = epActive.length > 0;
          const isT = todayY === year && todayM === month && todayD === d;
          const dayCutoff = isEntireDayBeyondCutoff(ds, displayCutoff);
          const sl = isFullOff || dayCutoff
            ? []
            : (dayMap[dn] || []).filter((s) => isTeacherAttending(s, ds));
          // 振替で当日に来る予定のコマ (この teacher が担当する分)。
          // adj.targetTeacher 指定時はその講師、未指定時は元 slot.teacher。
          const incomingForDay =
            isFullOff || dayCutoff
              ? []
              : (rescheduleInByDate.get(ds) || [])
                  .map((adj) => {
                    const slot = slots.find((x) => x.id === adj.slotId);
                    if (!slot) return null;
                    const tgtTeacher = adj.targetTeacher || slot.teacher;
                    if (tgtTeacher !== teacher) return null;
                    return { adj, slot };
                  })
                  .filter(Boolean);
          // この teacher が他人のコマを代行する行で使う slot も session count
          // の対象に含めるため、ここで抽出して結合した計算用リストを作る。
          const externalSubSlots =
            isFullOff || dayCutoff
              ? []
              : teacherSubs
                  .filter(
                    (sub) =>
                      sub.date === ds &&
                      sub.substitute === teacher &&
                      !sl.some((s) => s.id === sub.slotId)
                  )
                  .map((sub) => slots.find((x) => x.id === sub.slotId))
                  .filter(Boolean);
          const sessionCountMap =
            displayCutoff && (sl.length > 0 || externalSubSlots.length > 0)
              ? buildSessionCountMap([...sl, ...externalSubSlots], ds, sessionCtx)
              : null;
          return (
            <div
              key={ds}
              style={{
                background: dayCutoff
                  ? "#f5f5f0"
                  : isFullOff
                    ? "#f8f0f0"
                    : hasExam && !isT
                      ? "#fdf5e8"
                      : isT
                        ? "#fffbe6"
                        : dow === 0
                          ? "#fdf5f5"
                          : dow === 6
                            ? "#f5f5fd"
                            : "#fff",
                minHeight: 90,
                padding: 4,
                border: isT ? "2px solid #e6a800" : "none",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isT ? 800 : 600,
                  color: dow === 0 ? "#c44" : dow === 6 ? "#44c" : "#333",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{d}</span>
                {isFullOff && (
                  <span style={{ fontSize: 9, color: "#c44", fontWeight: 400 }}>
                    {hols[0].label}
                  </span>
                )}
                {!isFullOff && offDepts.length > 0 && (
                  <span style={{ fontSize: 8, color: "#c88", fontWeight: 400 }}>
                    {offDepts.map((d) => d.replace("部", "")).join(",") + "休"}
                  </span>
                )}
                {!isFullOff && granularHols.length > 0 && (
                  <span style={{ fontSize: 7, color: "#4a7a9a", fontWeight: 400, display: "block" }}>
                    {granularHols.map((h) =>
                      [...(h.targetGrades || []), ...(h.subjKeywords || [])].join("・")
                    ).join(", ") + "休"}
                  </span>
                )}
                {!isFullOff && hasExam && (
                  <span style={{ fontSize: 7, color: "#b07020", fontWeight: 700 }}>
                    {epActive[0].name.length > 8 ? epActive[0].name.slice(0, 8) + "…" : epActive[0].name}
                  </span>
                )}
              </div>
              {dayCutoff ? (
                <div
                  style={{ fontSize: 10, color: "#a09060", textAlign: "center", marginTop: 8 }}
                >
                  未確定
                </div>
              ) : isFullOff ? (
                <div
                  style={{ fontSize: 10, color: "#caa", textAlign: "center", marginTop: 8 }}
                >
                  休
                </div>
              ) : (
                sl.map((s) => {
                  const gc = GC(s.grade);
                  const sessionNum = sessionCountMap ? sessionCountMap.get(s.id) || 0 : 0;
                  const sub = subByDateSlot.get(`${ds}|${s.id}`);
                  const st = sub ? SUB_STATUS[sub.status] || SUB_STATUS.requested : null;
                  const hostSlotId = hostByAbsorbedKey.get(`${ds}|${s.id}`);
                  const absorbed = hostSlotId != null;
                  const hostSlot = absorbed ? slots.find((x) => x.id === hostSlotId) : null;
                  const hostedIds = absorbedByHostKey.get(`${ds}|${s.id}`);
                  const isHost = !absorbed && !!hostedIds;
                  const moveTarget = moveByKey.get(`${ds}|${s.id}`);
                  const rescheduledOut = rescheduleOutByKey.get(`${ds}|${s.id}`);
                  // 「自分が不在」: 代行で別人が入る or 合同で吸収された or 振替で他日へ
                  const away =
                    (sub && sub.originalTeacher === teacher && sub.substitute !== teacher) ||
                    absorbed ||
                    (rescheduledOut &&
                      (!rescheduledOut.targetTeacher ||
                        rescheduledOut.targetTeacher !== teacher));
                  // カード全体の色: absorbed > rescheduledOut > sub > 曜日色
                  const cardBg = absorbed
                    ? ADJ_COLOR.combine.bg
                    : rescheduledOut
                      ? ADJ_COLOR.reschedule.bg
                      : sub
                        ? st.bg
                        : DB[s.day];
                  const cardBorder = absorbed
                    ? ADJ_COLOR.combine.color
                    : rescheduledOut
                      ? ADJ_COLOR.reschedule.color
                      : sub
                        ? st.color
                        : DC[s.day];
                  const displayTime = moveTarget
                    ? moveTarget.split("-")[0]
                    : s.time.split("-")[0];
                  const badges = [];
                  if (absorbed) badges.push({ label: "合", color: ADJ_COLOR.combine.color });
                  if (isHost) badges.push({ label: "合+", color: ADJ_COLOR.combine.color });
                  if (sub) badges.push({ label: "代", color: st.color });
                  if (moveTarget) badges.push({ label: "移", color: ADJ_COLOR.move.color });
                  if (rescheduledOut) {
                    badges.push({ label: "振", color: ADJ_COLOR.reschedule.color });
                  }
                  const titleParts = [
                    `${s.time} ${s.grade} ${s.subj} ${s.room || ""}`,
                  ];
                  if (moveTarget) titleParts.push(`[移動] ${s.time} → ${moveTarget}`);
                  if (rescheduledOut) {
                    const tgt = [rescheduledOut.targetDate];
                    if (rescheduledOut.targetTime) tgt.push(rescheduledOut.targetTime);
                    if (rescheduledOut.targetTeacher) {
                      tgt.push(`(${rescheduledOut.targetTeacher})`);
                    }
                    titleParts.push(`[振替] → ${tgt.join(" ")}`);
                  }
                  if (absorbed && hostSlot) {
                    titleParts.push(
                      `[合同] ${hostSlot.grade}${hostSlot.cls && hostSlot.cls !== "-" ? hostSlot.cls : ""} ${hostSlot.subj} に統合 (${hostSlot.teacher})`
                    );
                  }
                  if (isHost && hostedIds) {
                    const labels = hostedIds
                      .map((id) => {
                        const a = slots.find((x) => x.id === id);
                        return a
                          ? `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}`
                          : `#${id}`;
                      })
                      .join(" / ");
                    titleParts.push(`[合同ホスト] + ${labels}`);
                  }
                  if (sub) {
                    titleParts.push(
                      `[代行] ${sub.originalTeacher} → ${sub.substitute || "未定"} (${st.label})${sub.memo ? "\n" + sub.memo : ""}`
                    );
                  }
                  if (isAdmin) titleParts.push("クリックで編集");
                  return (
                    <div
                      key={`slot-${s.id}`}
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        padding: "2px 3px",
                        margin: "1px 0",
                        borderRadius: 3,
                        background: cardBg,
                        borderLeft: `2px solid ${cardBorder}`,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: isAdmin && onEdit ? "pointer" : "default",
                        opacity: away ? 0.55 : 1,
                      }}
                      onClick={() => isAdmin && onEdit && onEdit(s)}
                      title={titleParts.join("\n")}
                    >
                      {badges.map((b, i) => (
                        <span
                          key={`b-${i}`}
                          style={{
                            background: b.color,
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: 800,
                            padding: "0 3px",
                            borderRadius: 2,
                            marginRight: 2,
                          }}
                        >
                          {b.label}
                        </span>
                      ))}
                      {sessionNum > 0 && (
                        <span
                          title={`第${sessionNum}回`}
                          style={{
                            background: "#3a6ea5",
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: 800,
                            padding: "0 3px",
                            borderRadius: 2,
                            marginRight: 2,
                          }}
                        >
                          {formatSessionNumber(sessionNum)}
                        </span>
                      )}
                      <span
                        style={{
                          background: gc.b,
                          color: gc.f,
                          fontSize: 8,
                          fontWeight: 700,
                          padding: "0 3px",
                          borderRadius: 2,
                          marginRight: 2,
                        }}
                      >
                        {s.grade}
                        {s.cls && s.cls !== "-" ? s.cls : ""}
                      </span>
                      <b>{displayTime}</b>{" "}
                      {isBiweekly(s.note)
                        ? `${biweeklyDisplaySubject(s, ds, biweeklyAnchors)}（隔週）`
                        : s.subj}
                    </div>
                  );
                })
              )}
              {/* この teacher が「他人のコマ」を代行する場合 */}
              {!isFullOff &&
                teacherSubs
                  .filter(
                    (sub) =>
                      sub.date === ds &&
                      sub.substitute === teacher &&
                      !sl.some((s) => s.id === sub.slotId)
                  )
                  .map((sub) => {
                    const slot = slots.find((s) => s.id === sub.slotId);
                    if (!slot) return null;
                    const st = SUB_STATUS[sub.status] || SUB_STATUS.requested;
                    const gc = GC(slot.grade);
                    const sessionNum = sessionCountMap
                      ? sessionCountMap.get(slot.id) || 0
                      : 0;
                    return (
                      <div
                        key={`ext-${sub.id}`}
                        style={{
                          fontSize: 11,
                          lineHeight: 1.4,
                          padding: "2px 3px",
                          margin: "1px 0",
                          borderRadius: 3,
                          background: st.bg,
                          borderLeft: `2px solid ${st.color}`,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={`${slot.time} ${slot.grade} ${slot.subj} ${slot.room || ""}\n[代行] ${sub.originalTeacher}の代わりに担当 (${st.label})${sub.memo ? "\n" + sub.memo : ""}`}
                      >
                        <span
                          style={{
                            background: st.color,
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: 800,
                            padding: "0 3px",
                            borderRadius: 2,
                            marginRight: 2,
                          }}
                        >
                          代
                        </span>
                        {sessionNum > 0 && (
                          <span
                            title={`第${sessionNum}回`}
                            style={{
                              background: "#3a6ea5",
                              color: "#fff",
                              fontSize: 8,
                              fontWeight: 800,
                              padding: "0 3px",
                              borderRadius: 2,
                              marginRight: 2,
                            }}
                          >
                            {formatSessionNumber(sessionNum)}
                          </span>
                        )}
                        <span
                          style={{
                            background: gc.b,
                            color: gc.f,
                            fontSize: 8,
                            fontWeight: 700,
                            padding: "0 3px",
                            borderRadius: 2,
                            marginRight: 2,
                          }}
                        >
                          {slot.grade}
                          {slot.cls && slot.cls !== "-" ? slot.cls : ""}
                        </span>
                        <b>{slot.time.split("-")[0]}</b> {slot.subj}
                      </div>
                    );
                  })}
              {/* 振替で当日担当する予定のコマ (元日付は別) */}
              {!isFullOff &&
                incomingForDay.map(({ adj, slot }) => {
                  const gc = GC(slot.grade);
                  const tgtTime = adj.targetTime || slot.time;
                  return (
                    <div
                      key={`rsch-in-${adj.id}`}
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        padding: "2px 3px",
                        margin: "1px 0",
                        borderRadius: 3,
                        background: ADJ_COLOR.reschedule.bg,
                        borderLeft: `2px solid ${ADJ_COLOR.reschedule.color}`,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`[振替で当日担当] ${slot.grade}${
                        slot.cls && slot.cls !== "-" ? slot.cls : ""
                      } ${slot.subj} (${tgtTime})\n元: ${adj.date} ${slot.time}${
                        adj.memo ? "\n" + adj.memo : ""
                      }`}
                    >
                      <span
                        style={{
                          background: ADJ_COLOR.reschedule.color,
                          color: "#fff",
                          fontSize: 8,
                          fontWeight: 800,
                          padding: "0 3px",
                          borderRadius: 2,
                          marginRight: 2,
                        }}
                      >
                        振
                      </span>
                      <span
                        style={{
                          background: gc.b,
                          color: gc.f,
                          fontSize: 8,
                          fontWeight: 700,
                          padding: "0 3px",
                          borderRadius: 2,
                          marginRight: 2,
                        }}
                      >
                        {slot.grade}
                        {slot.cls && slot.cls !== "-" ? slot.cls : ""}
                      </span>
                      <b>{tgtTime.split("-")[0]}</b> {slot.subj}
                    </div>
                  );
                })}
              {/* テスト直前特訓シフト (アルバイト講師のみ) */}
              {isPartTime &&
                (() => {
                  const shifts = examPrepByDate.get(ds);
                  if (!shifts || shifts.length === 0) return null;
                  const first = shifts[0];
                  const last = shifts[shifts.length - 1];
                  return (
                    <div
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        padding: "2px 3px",
                        margin: "1px 0",
                        borderRadius: 3,
                        background: "#fdf5e8",
                        borderLeft: "2px solid #e0a030",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`特訓シフト ${first.start}〜${last.end}\n${shifts
                        .map((s) => `${s.no}校時 ${s.start}-${s.end}`)
                        .join("\n")}`}
                    >
                      <span
                        style={{
                          background: "#e0a030",
                          color: "#fff",
                          fontSize: 8,
                          fontWeight: 800,
                          padding: "0 3px",
                          borderRadius: 2,
                          marginRight: 2,
                        }}
                      >
                        特訓
                      </span>
                      <b>{first.start}</b>〜{last.end}{" "}
                      <span style={{ fontSize: 10, color: "#8a5a1a" }}>
                        ({shifts.length}校時)
                      </span>
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
