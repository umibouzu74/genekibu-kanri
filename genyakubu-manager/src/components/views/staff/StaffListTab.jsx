import {
  fmtDateWeekday,
  staffMonthlyAbsenceDates,
  staffMonthlyRegularDates,
  staffMonthlyWorkDates,
} from "../../../data";
import { S } from "../../../styles/common";
import { isSlotForTeacher } from "../../../utils/biweekly";

// バイト一覧タブ : 新規追加フォーム + 各バイトの担当教科 + 今月の出勤状況。
export function StaffListTab({
  partTimeStaff,
  sortedPartTimeStaff,
  allTeachers,
  subjectCategories,
  subjectsByCat,
  slots,
  subs,
  holidays,
  examPeriods,
  nowYear,
  nowMonth,
  newStaff,
  setNewStaff,
  handleAddStaff,
  onDelStaff,
  onToggleStaffSubject,
  isAdmin,
}) {
  return (
    <div>
      <div
        style={{
          background: "#fff",
          padding: 14,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          バイトを追加
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={newStaff}
              onChange={(e) => setNewStaff(e.target.value)}
              placeholder="名前を入力"
              list="staff-candidates"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddStaff();
              }}
              style={{ ...S.input, width: 180 }}
            />
            <datalist id="staff-candidates">
              {allTeachers
                .filter((t) => !partTimeStaff.some((s) => s.name === t))
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
            <button onClick={handleAddStaff} style={S.btn(true)}>
              ＋ 追加
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
          ※ 既存講師名を入れると候補補完されます
        </div>
      </div>

      {partTimeStaff.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            textAlign: "center",
            color: "#bbb",
            padding: 30,
            fontSize: 13,
          }}
        >
          登録されていません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sortedPartTimeStaff.map((staff) => {
            const cnt = slots.filter((s) => isSlotForTeacher(s, staff.name)).length;
            return (
              <div
                key={staff.name}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid #e0e0e0",
                  padding: "12px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{staff.name}</span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                      担当コマ: {cnt}
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>
                      担当教科: {staff.subjectIds.length}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onDelStaff(staff.name)}
                      aria-label={`${staff.name} を削除`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 14,
                        color: "#c44",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {subjectCategories.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#bbb" }}>
                    教科マスターが未登録です。「教科マスター」タブから追加してください。
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "#f8f9fa",
                      borderRadius: 6,
                      padding: 10,
                    }}
                  >
                    {subjectCategories.map((cat) => {
                      const catSubjects = subjectsByCat.get(cat.id) || [];
                      if (catSubjects.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cat.color || "#555",
                              marginBottom: 4,
                            }}
                          >
                            {cat.name}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {catSubjects.map((subj) => {
                              const checked = staff.subjectIds.includes(subj.id);
                              return (
                                <label
                                  key={subj.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "3px 8px",
                                    borderRadius: 14,
                                    fontSize: 11,
                                    cursor: "pointer",
                                    background: checked ? (cat.color || "#4a7") : "#fff",
                                    color: checked ? "#fff" : "#555",
                                    border: `1px solid ${checked ? (cat.color || "#4a7") : "#ccc"}`,
                                    fontWeight: checked ? 700 : 400,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      onToggleStaffSubject(staff.name, subj.id)
                                    }
                                    style={{ margin: 0, accentColor: cat.color || "#4a7" }}
                                  />
                                  {subj.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 今月の出勤状況 */}
                {subs && (() => {
                  const regularDates = staffMonthlyRegularDates(
                    slots,
                    staff.name,
                    holidays || [],
                    nowYear,
                    nowMonth,
                    examPeriods || []
                  );
                  const workDates = staffMonthlyWorkDates(subs, staff.name, nowYear, nowMonth);
                  const absenceDates = staffMonthlyAbsenceDates(subs, staff.name, nowYear, nowMonth);
                  return (
                    <div
                      style={{
                        marginTop: 8,
                        background: "#f0f7ff",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 11, color: "#4a6a9a", marginBottom: 6 }}>
                        {nowMonth}月の出勤状況
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ color: "#555", lineHeight: 1.6 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, color: "#666" }}>
                            通常出勤日（{regularDates.length}日）:
                          </span>{" "}
                          {regularDates.length > 0
                            ? regularDates.map((d) => fmtDateWeekday(d)).join("、")
                            : "—"}
                        </div>
                        <div style={{ color: "#555", lineHeight: 1.6 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, color: "#2a7a4a" }}>
                            代行出勤日（{workDates.length}日）:
                          </span>{" "}
                          {workDates.length > 0
                            ? workDates.map((d) => fmtDateWeekday(d)).join("、")
                            : "—"}
                        </div>
                        <div style={{ color: "#555", lineHeight: 1.6 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, color: "#c03030" }}>
                            代行された日（{absenceDates.length}日）:
                          </span>{" "}
                          {absenceDates.length > 0 ? (
                            <>
                              {absenceDates.map((d) => fmtDateWeekday(d)).join("、")}
                              <span style={{ marginLeft: 6, fontSize: 10, color: "#999" }}>
                                ※ 出勤なし
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
