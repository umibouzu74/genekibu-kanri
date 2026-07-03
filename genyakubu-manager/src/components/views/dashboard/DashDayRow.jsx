import { useMemo } from "react";
import { DAY_COLOR as DC, DEPT_COLOR, sortSlots as sortS } from "../../../data";
import { EXTRA_LESSON_COLOR } from "../../../constants/colors";
import { DASH_SECTIONS } from "../../../constants/schedule";
import { buildSessionCountMap } from "../../../utils/sessionCount";
import { specialEventTypeMeta } from "../../../constants/specialEvents";
import { SectionColumn } from "./SectionColumn";

export function DashDayRow({
  date,
  dow,
  holidays: hols,
  slots,
  subs,
  adjustments = [],
  examPeriodsForDate = [],
  specialEventsForDate = [],
  extraLessonsForDate = [],
  sessionCtx,
}) {
  const sessionCountMap = useMemo(() => {
    if (!sessionCtx || !sessionCtx.displayCutoff) return null;
    return buildSessionCountMap(slots, date, sessionCtx);
  }, [slots, date, sessionCtx]);
  const fullOff = hols.some((h) => {
    const sc = h.scope || ["全部"];
    if (!sc.includes("全部")) return false;
    if ((h.targetGrades || []).length > 0) return false;
    if ((h.subjKeywords || []).length > 0) return false;
    return true;
  });
  const offDepts = [
    ...new Set(
      hols
        .filter(
          (h) =>
            (h.targetGrades || []).length === 0 &&
            (h.subjKeywords || []).length === 0
        )
        .flatMap((h) => h.scope || ["全部"])
    ),
  ].filter((d) => d !== "全部");
  const granularHols = hols.filter(
    (h) =>
      (h.targetGrades || []).length > 0 || (h.subjKeywords || []).length > 0
  );
  const hasPartial = !fullOff && (offDepts.length > 0 || granularHols.length > 0);
  const holLabel = hols[0]?.label;
  const hasExamPeriod = examPeriodsForDate.length > 0;
  const examLabel = examPeriodsForDate.map((ep) => ep.name).join(", ");

  return (
    <div>
      <div
        style={{
          background: fullOff ? "#f0f0f0" : DC[dow] || "#666",
          color: fullOff ? "#999" : "#fff",
          padding: "10px 16px",
          borderRadius: 10,
          fontWeight: 800,
          fontSize: 15,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <span>
          {date}（{dow}）
        </span>
        {fullOff && (
          <span
            style={{ fontSize: 11, background: "#ddd", padding: "2px 8px", borderRadius: 4 }}
          >
            🚫 {holLabel}
          </span>
        )}
        {hasPartial && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {offDepts.map((d) => (
              <span
                key={d}
                style={{
                  fontSize: 10,
                  background: "rgba(255,255,255,0.25)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {d}休
              </span>
            ))}
            {granularHols.map((h) => {
              const parts = [
                ...(h.targetGrades || []),
                ...(h.subjKeywords || []),
              ];
              return (
                <span
                  key={h.id}
                  style={{
                    fontSize: 10,
                    background: "rgba(255,255,255,0.25)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {parts.join("・")}休{h.label ? `(${h.label})` : ""}
                </span>
              );
            })}
          </div>
        )}
        {!fullOff && hasExamPeriod && (
          <span
            style={{
              fontSize: 10,
              background: "#f0a030",
              color: "#fff",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700,
            }}
          >
            {examLabel}
          </span>
        )}
        {specialEventsForDate.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {specialEventsForDate.map((ev) => {
              const meta = specialEventTypeMeta(ev.eventType);
              return (
                <span
                  key={ev.id}
                  title={`${meta.label}: ${ev.name}${ev.memo ? "\n" + ev.memo : ""}`}
                  style={{
                    fontSize: 10,
                    background: meta.bg,
                    color: meta.fg,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    border: `1px solid ${meta.accent}`,
                  }}
                >
                  {meta.icon} {ev.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {/* 追加授業 (特定日付の単発コマ)。「その日にやる」と明示登録された
          コマなので、休講日でも巻き添えにせず表示する。 */}
      {extraLessonsForDate.length > 0 && (
        <div
          style={{
            background: EXTRA_LESSON_COLOR.bannerBg,
            border: `1px solid ${EXTRA_LESSON_COLOR.bannerBorder}`,
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {extraLessonsForDate.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 12,
              }}
              title={l.note || undefined}
            >
              <span
                style={{
                  background: EXTRA_LESSON_COLOR.color,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                追加授業{l.label ? ` ${l.label}` : ""}
              </span>
              <b>{l.time}</b>
              <span style={{ fontWeight: 700 }}>
                {l.grade}
                {l.cls && l.cls !== "-" ? l.cls : ""} {l.subj}
              </span>
              {l.teacher && (
                <span style={{ color: "#555" }}>{l.teacher}</span>
              )}
              {l.room && <span style={{ color: "#888" }}>@{l.room}</span>}
            </div>
          ))}
        </div>
      )}
      {fullOff ? (
        <div
          style={{
            textAlign: "center",
            color: "#bbb",
            padding: 30,
            fontSize: 14,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          休講日{holLabel ? `（${holLabel}）` : ""}
        </div>
      ) : (
        <div
          className="dash-sections"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          {DASH_SECTIONS.map((sec) => {
            const deptOff = offDepts.includes(sec.dept);
            const secSlots = deptOff ? [] : sortS(slots.filter(sec.filterFn));
            const color =
              DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
            return (
              <SectionColumn
                key={sec.key}
                label={sec.label}
                color={color}
                sl={secSlots}
                deptOff={deptOff}
                subs={subs}
                adjustments={adjustments}
                allSlots={sessionCtx?.allSlots || slots}
                date={date}
                sessionCountMap={sessionCountMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
