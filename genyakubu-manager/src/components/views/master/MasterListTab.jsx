import { DAY_COLOR as DC, DAYS, DEPT_COLOR, timeToMin } from "../../../data";
import { DASH_SECTIONS } from "../../../constants/schedule";
import { S } from "../../../styles/common";
import { formatCount, weightedSlotCount } from "../../../utils/biweekly";
import { MasterSlotCard } from "./MasterSlotCard";

// コマ一覧タブ : フィルタ (曜日 / 学年 / 講師 / 科目) + 曜日別セクション列。
export function MasterListTab({
  slots,
  filtered,
  dayGroups,
  grades,
  filterDay,
  setFilterDay,
  filterGrade,
  setFilterGrade,
  filterTeacher,
  setFilterTeacher,
  filterSubj,
  setFilterSubj,
  onNew,
  onEdit,
  onDel,
  isAdmin,
}) {
  return (
    <>
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
        {isAdmin && (
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={onNew}
              style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
            >
              ＋ 新規追加
            </button>
          </div>
        )}
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
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                {formatCount(weightedSlotCount(daySlots))}コマ
              </span>
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
                  ([a], [b]) =>
                    timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
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
                          {formatCount(weightedSlotCount(secSlots))}コマ / {teachers.length}名
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
                        <div
                          style={{ display: "flex", flexDirection: "column", gap: 12 }}
                        >
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
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 400,
                                    color: "#888",
                                  }}
                                >
                                  {formatCount(weightedSlotCount(tSlots))}コマ
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fill,minmax(170px,1fr))",
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
                                      isAdmin={isAdmin}
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
    </>
  );
}
