import {
  DAY_COLOR as DC,
  DEPT_COLOR,
  fmtDate,
  getSubForSlot,
  gradeColor as GC,
  gradeToDept,
  sortSlots as sortS,
  SUB_STATUS,
  timeToMin,
  WEEKDAYS,
} from "../../data";
import { DASH_SECTIONS } from "../../constants/schedule";

function SectionColumn({ label, color, sl, deptOff, subs, date }) {
  const byTime = {};
  sl.forEach((s) => {
    if (!byTime[s.time]) byTime[s.time] = [];
    byTime[s.time].push(s);
  });
  const timeGroups = Object.entries(byTime).sort(
    ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
  );
  const teachers = [...new Set(sl.map((s) => s.teacher))];

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          background: color.b,
          color: color.f,
          padding: "8px 12px",
          borderRadius: "8px 8px 0 0",
          fontWeight: 800,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {!deptOff && sl.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
            {sl.length}コマ / {teachers.length}名
          </span>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: "0 0 8px 8px",
          border: "1px solid #e0e0e0",
          borderTop: "none",
          padding: 10,
          minHeight: 80,
        }}
      >
        {deptOff ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            休講日
          </div>
        ) : sl.length === 0 ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>
            授業なし
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeGroups.map(([time, tSlots]) => (
              <div key={time}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: color.f,
                    marginBottom: 4,
                    paddingBottom: 3,
                    borderBottom: `2px solid ${color.accent}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{time}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#888" }}>
                    {tSlots.length}コマ
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                    background: "#555",
                    gap: 2,
                    border: "2px solid #555",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  {tSlots.map((s, i) => {
                    const gc = GC(s.grade);
                    const sub = date ? getSubForSlot(subs, s.id, date) : null;
                    const st = sub ? SUB_STATUS[sub.status] || SUB_STATUS.requested : null;
                    const newGradeRow =
                      i > 0 &&
                      s.grade !== tSlots[i - 1].grade &&
                      !s.grade.includes("附中") &&
                      !tSlots[i - 1].grade.includes("附中");
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: sub ? st.bg : "#fff",
                          padding: "8px 6px",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 96,
                          position: "relative",
                          ...(newGradeRow ? { gridColumnStart: 1 } : null),
                        }}
                      >
                        {sub && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              background: st.color,
                              color: "#fff",
                              fontSize: 8,
                              fontWeight: 800,
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                            title={`${sub.originalTeacher} → ${sub.substitute || "未定"}\n${st.label}${sub.memo ? "\n" + sub.memo : ""}`}
                          >
                            代
                          </div>
                        )}
                        <div style={{ lineHeight: 1.4 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                background: gc.b,
                                color: gc.f,
                                borderRadius: 3,
                                padding: "1px 4px",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {s.grade}
                              {s.cls && s.cls !== "-" ? s.cls : ""}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>
                              {s.subj}
                            </span>
                          </div>
                          {(s.room || s.note) && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 6,
                                marginTop: 2,
                                flexWrap: "wrap",
                              }}
                            >
                              {s.room && (
                                <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>
                                  {s.room}
                                </span>
                              )}
                              {s.note && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#a0331a" }}>
                                  ({s.note})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: sub ? 16 : 22,
                            fontWeight: 800,
                            color: "#1a1a2e",
                            lineHeight: 1.1,
                            marginTop: 6,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sub ? (
                            <span>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "#999",
                                  fontSize: 12,
                                }}
                              >
                                {sub.originalTeacher}
                              </span>
                              <span style={{ margin: "0 2px", color: st.color }}>→</span>
                              <span style={{ color: st.color }}>{sub.substitute || "?"}</span>
                            </span>
                          ) : (
                            s.teacher
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashDayRow({ date, dow, holidays: hols, slots, subs }) {
  const fullOff = hols.some((h) => (h.scope || ["全部"]).includes("全部"));
  const offDepts = [...new Set(hols.flatMap((h) => h.scope || ["全部"]))].filter(
    (d) => d !== "全部"
  );
  const hasPartial = !fullOff && offDepts.length > 0;
  const holLabel = hols[0]?.label;

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
          <div style={{ display: "flex", gap: 3 }}>
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
          </div>
        )}
      </div>
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
            const color = DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
            return (
              <SectionColumn
                key={sec.key}
                label={sec.label}
                color={color}
                sl={secSlots}
                deptOff={deptOff}
                subs={subs}
                date={date}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Dashboard({ slots, holidays, subs }) {
  const now = new Date();
  const todayStr = fmtDate(now);
  const todayDow = WEEKDAYS[now.getDay()];
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const tmrStr = fmtDate(tmr);
  const tmrDow = WEEKDAYS[tmr.getDay()];

  const holidaysFor = (d) => holidays.filter((h) => h.date === d);
  const isOffForGrade = (d, grade) => {
    const dept = gradeToDept(grade);
    return holidays.some((h) => {
      if (h.date !== d) return false;
      const sc = h.scope || ["全部"];
      return sc.includes("全部") || (dept && sc.includes(dept));
    });
  };

  const todayHols = holidaysFor(todayStr);
  const tmrHols = holidaysFor(tmrStr);
  const todaySlots = slots.filter(
    (s) => s.day === todayDow && !isOffForGrade(todayStr, s.grade)
  );
  const tmrSlots = slots.filter((s) => s.day === tmrDow && !isOffForGrade(tmrStr, s.grade));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <DashDayRow
        date={todayStr}
        dow={todayDow}
        holidays={todayHols}
        slots={todaySlots}
        subs={subs}
      />
      <DashDayRow
        date={tmrStr}
        dow={tmrDow}
        holidays={tmrHols}
        slots={tmrSlots}
        subs={subs}
      />
    </div>
  );
}
