import { useCallback, useMemo } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  SUB_STATUS,
  WEEKDAYS,
} from "../../data";
import { isTimetableActiveForDate, isBeyondCutoff, isEntireDayBeyondCutoff } from "../../utils/timetable";
import { isSlotForTeacher } from "../../utils/biweekly";
import { makeHolidayHelpers } from "./dashboardHelpers";

export function MonthView({ teacher, slots, holidays, subs, adjustments = [], year, month, onEdit, isAdmin, timetables, displayCutoff, examPeriods = [] }) {
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

  // 日付ごとに「合同で吸収されたコマ id」を索引化。吸収されたコマは当該日に
  // 出勤扱いしない (host 側に統合されるため)。
  const absorbedByDate = useMemo(() => {
    const m = new Map();
    for (const adj of adjustments) {
      if (adj.type !== "combine") continue;
      const set = m.get(adj.date) || new Set();
      for (const id of adj.combineSlotIds || []) set.add(id);
      m.set(adj.date, set);
    }
    return m;
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

  const { isOffForGrade } = useMemo(
    () => makeHolidayHelpers(holidays, examPeriods),
    [holidays, examPeriods]
  );

  // Returns exam period names active on a given date (for label display)
  const examPeriodsForDate = useCallback(
    (ds) => examPeriods.filter((ep) => ds >= ep.startDate && ds <= ep.endDate),
    [examPeriods]
  );

  // この講師が (slot, ds) のコマを「月次ビューに載せるか」を判定する。
  // 休講・カットオフ・時間割外・合同で吸収された場合は非表示。
  // 確定代行で本人が外されたコマは、描画時に `away` フラグでグレー表示+代バッジを
  // 出すため、ここでは除外しない (以前は除外していたが 代 バッジが消えて
  // 代行されたことが判らない問題があった)。
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
      const absorbedSet = absorbedByDate.get(ds);
      if (absorbedSet && absorbedSet.has(slot.id)) return false;
      return true;
    },
    [isOffForGrade, timetables, displayCutoff, absorbedByDate]
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
                  const sub = subByDateSlot.get(`${ds}|${s.id}`);
                  const st = sub ? SUB_STATUS[sub.status] || SUB_STATUS.requested : null;
                  const away =
                    sub && sub.originalTeacher === teacher && sub.substitute !== teacher; // 自分が休み
                  return (
                    <div
                      key={`slot-${s.id}`}
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        padding: "2px 3px",
                        margin: "1px 0",
                        borderRadius: 3,
                        background: sub ? st.bg : DB[s.day],
                        borderLeft: `2px solid ${sub ? st.color : DC[s.day]}`,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: isAdmin && onEdit ? "pointer" : "default",
                        opacity: away ? 0.55 : 1,
                      }}
                      onClick={() => isAdmin && onEdit && onEdit(s)}
                      title={`${s.time} ${s.grade} ${s.subj} ${s.room || ""}${sub ? `\n[代行] ${sub.originalTeacher} → ${sub.substitute || "未定"} (${st.label})${sub.memo ? "\n" + sub.memo : ""}` : ""}${isAdmin ? "\nクリックで編集" : ""}`}
                    >
                      {sub && (
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
                      )}
                      <b>{s.time.split("-")[0]}</b> {s.subj}
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
                        <b>{slot.time.split("-")[0]}</b> {slot.subj}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
