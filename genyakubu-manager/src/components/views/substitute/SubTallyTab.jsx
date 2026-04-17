import { Fragment } from "react";
import {
  fmtDateWeekday,
  staffMonthlyAbsenceDates,
  staffMonthlyRegularDates,
  staffMonthlyWorkDates,
} from "../../../data";
import { S } from "../../../styles/common";

// 月次集計タブ : 代行した / された件数表 + 差引バーチャート。
export function SubTallyTab({
  tallyRows,
  subs,
  slots,
  holidays,
  ty,
  tm,
  fMonth,
  setFMonth,
  expandedTally,
  setExpandedTally,
}) {
  return (
    <div>
      <div
        style={{
          background: "#fff",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 700 }}>集計月:</label>
        <input
          type="month"
          value={fMonth}
          onChange={(e) => setFMonth(e.target.value)}
          style={{ ...S.input, width: "auto" }}
        />
        <span style={{ fontSize: 11, color: "#888" }}>
          ※ 依頼中のレコードは集計対象外
        </span>
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1a1a2e", color: "#fff" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>氏名</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>代行した</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>代行された</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>差引</th>
            </tr>
          </thead>
          <tbody>
            {tallyRows.map((r, i) => {
              const diff = r.covered - r.coveredFor;
              const isExpanded = expandedTally.has(r.name);
              const workDates = isExpanded
                ? staffMonthlyWorkDates(subs, r.name, ty, tm)
                : [];
              const absenceDates = isExpanded
                ? staffMonthlyAbsenceDates(subs, r.name, ty, tm)
                : [];
              const regularDates = isExpanded
                ? staffMonthlyRegularDates(slots, r.name, holidays || [], ty, tm)
                : [];
              return (
                <Fragment key={r.name}>
                  <tr
                    style={{
                      background: i % 2 ? "#f8f9fa" : "#fff",
                      borderTop: "1px solid #eee",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setExpandedTally((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.name)) next.delete(r.name);
                        else next.add(r.name);
                        return next;
                      });
                    }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 14 }}>
                      <span
                        style={{
                          display: "inline-block",
                          marginRight: 4,
                          fontSize: 10,
                          color: "#888",
                          transform: isExpanded ? "rotate(90deg)" : "none",
                          transition: "transform 0.15s",
                        }}
                      >
                        ▶
                      </span>
                      {r.isPT && (
                        <span
                          style={{
                            marginRight: 6,
                            background: "#ffe8a0",
                            color: "#7a5a1a",
                            borderRadius: 4,
                            padding: "1px 6px",
                            fontSize: 9,
                            fontWeight: 700,
                            verticalAlign: "middle",
                          }}
                        >
                          バイト
                        </span>
                      )}
                      {r.name}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: r.covered ? 800 : 400,
                        color: r.covered ? "#2a7a4a" : "#ccc",
                      }}
                    >
                      {r.covered || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: r.coveredFor ? 800 : 400,
                        color: r.coveredFor ? "#c03030" : "#ccc",
                      }}
                    >
                      {r.coveredFor || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "center",
                        fontSize: 16,
                        fontWeight: 700,
                        color: diff > 0 ? "#2a7a4a" : diff < 0 ? "#c03030" : "#888",
                      }}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: i % 2 ? "#f0f2f4" : "#f8f9fa" }}>
                      <td
                        colSpan={4}
                        style={{ padding: "8px 14px 12px 36px", fontSize: 12, color: "#555" }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 11, color: "#666" }}>
                              通常出勤日（{regularDates.length}日）:
                            </span>{" "}
                            {regularDates.length > 0
                              ? regularDates.map((d) => fmtDateWeekday(d)).join("、")
                              : "—"}
                          </div>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 11, color: "#2a7a4a" }}>
                              代行出勤日（{workDates.length}日）:
                            </span>{" "}
                            {workDates.length > 0
                              ? workDates.map((d) => fmtDateWeekday(d)).join("、")
                              : "—"}
                          </div>
                          <div>
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {tallyRows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    textAlign: "center",
                    color: "#bbb",
                    padding: 40,
                    fontSize: 13,
                  }}
                >
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* 代行差引バーチャート */}
      {tallyRows.length > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            padding: 14,
            marginTop: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#444" }}>
            代行差引グラフ（代行した - 代行された）
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tallyRows
              .filter((r) => r.covered || r.coveredFor)
              .map((r) => {
                const diff = r.covered - r.coveredFor;
                const maxAbs = Math.max(
                  ...tallyRows.map((x) => Math.abs(x.covered - x.coveredFor)),
                  1
                );
                const barWidth = Math.abs(diff) / maxAbs * 100;
                const isPos = diff >= 0;
                return (
                  <div
                    key={r.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 60,
                        textAlign: "right",
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      title={r.name}
                    >
                      {r.name}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 18,
                        background: "#f5f5f5",
                        borderRadius: 4,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          [isPos ? "left" : "right"]: "50%",
                          width: `${barWidth / 2}%`,
                          height: "100%",
                          background: isPos ? "#4a9a4a" : "#c05050",
                          borderRadius: 4,
                          transition: "width .3s",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: "#ccc",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 30,
                        textAlign: "left",
                        fontWeight: 700,
                        color: isPos ? "#2a7a4a" : "#c03030",
                        fontSize: 11,
                      }}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
