import { memo, useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  DAYS,
  DEPT_COLOR,
  gradeColor as GC,
  sortSlots as sortS,
  timeToMin,
} from "../../data";
import { DASH_SECTIONS } from "../../constants/schedule";
import { S } from "../../styles/common";
import { formatBiweeklyTeacher } from "../../utils/biweekly";

// Extracted to its own component so that hover state is scoped to a
// single card instead of requiring DOM querySelector manipulation.
const MasterSlotCard = memo(function MasterSlotCard({ s, newGradeRow, onEdit, onDel }) {
  const [hover, setHover] = useState(false);
  const gc = GC(s.grade);
  return (
    <div
      style={{
        background: "#fff",
        padding: "8px 6px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 96,
        position: "relative",
        ...(newGradeRow ? { gridColumnStart: 1 } : null),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
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
          <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>{s.subj}</span>
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
              <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>{s.room}</span>
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
          fontSize: 22,
          fontWeight: 800,
          color: "#1a1a2e",
          lineHeight: 1.1,
          marginTop: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {formatBiweeklyTeacher(s.teacher, s.note)}
      </div>
      <div
        className="master-slot-actions"
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          display: "flex",
          gap: 1,
          opacity: hover ? 1 : 0,
          transition: "opacity .15s",
        }}
      >
        <button
          onClick={() => onEdit(s)}
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #ddd",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 11,
            padding: "1px 3px",
            lineHeight: 1,
          }}
        >
          ✏️
        </button>
        <button
          onClick={() => onDel(s.id)}
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #ddd",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 11,
            padding: "1px 3px",
            lineHeight: 1,
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
});

export function MasterView({
  slots,
  onEdit,
  onDel,
  onNew,
  biweeklyBase,
  onSetBiweeklyBase,
}) {
  const [filterDay, setFilterDay] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSubj, setFilterSubj] = useState("");
  const [tab, setTab] = useState("list");

  const grades = useMemo(
    () => [...new Set(slots.map((s) => s.grade))].sort(),
    [slots]
  );

  const filtered = useMemo(() => {
    // Single-pass filter to avoid creating 4 intermediate arrays.
    const r = slots.filter(
      (s) =>
        (!filterDay || s.day === filterDay) &&
        (!filterGrade || s.grade === filterGrade) &&
        (!filterTeacher || s.teacher.includes(filterTeacher)) &&
        (!filterSubj || s.subj.includes(filterSubj))
    );
    return sortS(r);
  }, [slots, filterDay, filterGrade, filterTeacher, filterSubj]);

  const dayGroups = useMemo(() => {
    const activeDays = filterDay ? [filterDay] : DAYS;
    return activeDays
      .map((day) => {
        const daySlots = filtered.filter((s) => s.day === day);
        if (daySlots.length === 0) return null;
        return { day, slots: daySlots };
      })
      .filter(Boolean);
  }, [filtered, filterDay]);

  const biweeklyGroups = useMemo(() => {
    const alt = slots.filter((s) => s.note?.includes("隔週"));
    const g = {};
    alt.forEach((s) => {
      const k = `${s.day}_${s.time}`;
      if (!g[k]) g[k] = { day: s.day, time: s.time, slots: [] };
      g[k].slots.push(s);
    });
    const di = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    return Object.values(g).sort((a, b) => {
      const dd = (di[a.day] ?? 99) - (di[b.day] ?? 99);
      return dd || timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]);
    });
  }, [slots]);

  const currentWeekType = useMemo(() => {
    if (!biweeklyBase) return null;
    const base = new Date(biweeklyBase + "T12:00:00");
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const diffDays = Math.round((now - base) / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7);
    return Math.abs(weeks) % 2 === 0 ? "A" : "B";
  }, [biweeklyBase]);

  if (tab === "biweekly")
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setTab("list")} style={S.btn(false)}>
            コマ一覧
          </button>
          <button onClick={() => setTab("biweekly")} style={S.btn(true)}>
            隔週管理
          </button>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #e0e0e0",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>隔週の基準設定</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>A週の基準日:</label>
            <input
              type="date"
              value={biweeklyBase || ""}
              onChange={(e) => onSetBiweeklyBase(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
            {currentWeekType && (
              <span
                style={{
                  background: currentWeekType === "A" ? "#2e6a9e" : "#c05030",
                  color: "#fff",
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                今週は {currentWeekType}週
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            基準日を含む週をA週とし、以降交互にA週・B週が繰り返されます
          </div>
        </div>
        {biweeklyGroups.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: 40 }}>
            隔週コマがありません
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {biweeklyGroups.map((g) => (
              <div
                key={g.day + g.time}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: `2px solid ${DC[g.day]}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: DC[g.day],
                    color: "#fff",
                    padding: "8px 14px",
                    fontWeight: 800,
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {g.day}曜 {g.time}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{g.slots.length}コマ</span>
                </div>
                <div style={{ padding: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #eee" }}>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>学年</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>クラス</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>科目</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>担当</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>備考</th>
                        <th style={{ textAlign: "center", padding: "4px 6px", width: 40 }}>
                          編集
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.slots.map((s) => (
                        <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "6px" }}>
                            <span
                              style={{
                                background: GC(s.grade).b,
                                color: GC(s.grade).f,
                                borderRadius: 4,
                                padding: "1px 6px",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              {s.grade}
                            </span>
                          </td>
                          <td style={{ padding: "6px" }}>{s.cls}</td>
                          <td style={{ padding: "6px", fontWeight: 600 }}>{s.subj}</td>
                          <td style={{ padding: "6px", fontWeight: 700 }}>
                            {formatBiweeklyTeacher(s.teacher, s.note)}
                          </td>
                          <td style={{ padding: "6px", color: "#e67a00", fontSize: 11 }}>
                            {s.note}
                          </td>
                          <td style={{ padding: "6px", textAlign: "center" }}>
                            <button
                              onClick={() => onEdit(s)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              ✏️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: 11, color: "#888" }}>
          ※ 備考欄に「隔週」を含むコマが自動的に表示されます
        </div>
      </div>
    );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setTab("list")} style={S.btn(true)}>
          コマ一覧
        </button>
        <button onClick={() => setTab("biweekly")} style={S.btn(false)}>
          隔週管理
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          background: "#fff",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            曜日
          </label>
          <select
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 60 }}
          >
            <option value="">すべて</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            学年
          </label>
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            style={{ ...S.input, width: "auto", minWidth: 80 }}
          >
            <option value="">すべて</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            講師
          </label>
          <input
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            placeholder="講師名"
            style={{ ...S.input, width: 100 }}
          />
        </div>
        <div>
          <label
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            科目
          </label>
          <input
            value={filterSubj}
            onChange={(e) => setFilterSubj(e.target.value)}
            placeholder="科目名"
            style={{ ...S.input, width: 100 }}
          />
        </div>
        <button
          onClick={() => {
            setFilterDay("");
            setFilterGrade("");
            setFilterTeacher("");
            setFilterSubj("");
          }}
          style={{ ...S.btn(false), fontSize: 11 }}
        >
          クリア
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onNew}
            style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
          >
            ＋ 新規追加
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {filtered.length} / {slots.length} 件表示
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {dayGroups.map(({ day, slots: daySlots }) => (
          <div key={day}>
            <div
              style={{
                background: DC[day] || "#666",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 15,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span>{day}曜日</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>{daySlots.length}コマ</span>
            </div>
            <div
              className="dash-sections"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              {DASH_SECTIONS.map((sec) => {
                const secSlots = daySlots.filter(sec.filterFn);
                const color =
                  DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
                const byTime = {};
                secSlots.forEach((s) => {
                  if (!byTime[s.time]) byTime[s.time] = [];
                  byTime[s.time].push(s);
                });
                const timeGroups = Object.entries(byTime).sort(
                  ([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
                );
                const teachers = [...new Set(secSlots.map((s) => s.teacher))];
                return (
                  <div key={sec.key} style={{ flex: 1, minWidth: 0 }}>
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
                      <span>{sec.label}</span>
                      {secSlots.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
                          {secSlots.length}コマ / {teachers.length}名
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
                      {secSlots.length === 0 ? (
                        <div
                          style={{
                            textAlign: "center",
                            color: "#bbb",
                            padding: 20,
                            fontSize: 13,
                          }}
                        >
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
                                  const newGradeRow =
                                    i > 0 &&
                                    s.grade !== tSlots[i - 1].grade &&
                                    !s.grade.includes("附中") &&
                                    !tSlots[i - 1].grade.includes("附中");
                                  return (
                                    <MasterSlotCard
                                      key={s.id}
                                      s={s}
                                      newGradeRow={newGradeRow}
                                      onEdit={onEdit}
                                      onDel={onDel}
                                    />
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
              })}
            </div>
          </div>
        ))}
        {dayGroups.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#888",
              padding: 40,
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #e0e0e0",
            }}
          >
            該当するコマがありません
          </div>
        )}
      </div>
    </div>
  );
}
