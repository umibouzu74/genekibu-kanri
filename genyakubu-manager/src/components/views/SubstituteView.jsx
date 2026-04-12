import { useEffect, useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  dateToDay,
  gradeColor as GC,
  monthlyTally,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../../data";
import { S } from "../../styles/common";
import { StatusBadge } from "../StatusBadge";

export function SubstituteView({
  subs,
  slots,
  partTimeStaff,
  onNew,
  onEdit,
  onDel,
  onGoToStaffView,
  initFilter,
  onConsumeInitFilter,
}) {
  const now = new Date();
  const [tab, setTab] = useState("list");
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState("");

  // 外部から初期フィルタが渡された場合 (例: Sidebar バッジクリック)
  useEffect(() => {
    if (initFilter) {
      if (initFilter.status) {
        setFStatus(initFilter.status);
        setFMonth(""); // 月フィルタを解除して全件から依頼中を表示
        setTab("list");
      }
      onConsumeInitFilter?.();
    }
  }, [initFilter, onConsumeInitFilter]);

  // partTimeStaff は新形式 {name, subjectIds}[] のみを想定
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  const slotMap = useMemo(() => {
    const m = {};
    slots.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [slots]);

  const filtered = useMemo(() => {
    let r = [...subs];
    if (fMonth) r = r.filter((s) => s.date?.startsWith(fMonth));
    if (fStaff) r = r.filter((s) => s.originalTeacher === fStaff || s.substitute === fStaff);
    if (fStatus) r = r.filter((s) => s.status === fStatus);
    return r.sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, fMonth, fStaff, fStatus]);

  const [ty, tm] = fMonth.split("-").map(Number);
  const tally = useMemo(() => monthlyTally(subs, ty, tm), [subs, ty, tm]);

  const tallyRows = useMemo(() => {
    const names = new Set(staffNameSet);
    Object.keys(tally.covered).forEach((n) => names.add(n));
    Object.keys(tally.coveredFor).forEach((n) => names.add(n));
    return [...names]
      .map((name) => ({
        name,
        covered: tally.covered[name] || 0,
        coveredFor: tally.coveredFor[name] || 0,
        isPT: staffNameSet.has(name),
      }))
      .sort(
        (a, b) =>
          b.covered + b.coveredFor - (a.covered + a.coveredFor) || a.name.localeCompare(b.name)
      );
  }, [tally, staffNameSet]);

  const allTeachers = useMemo(() => {
    const set = new Set(staffNameSet);
    slots.forEach((s) => s.teacher && set.add(s.teacher));
    return [...set].sort();
  }, [slots, staffNameSet]);

  const TabBtn = ({ k, label, count }) => (
    <button onClick={() => setTab(k)} style={S.btn(tab === k)}>
      {label}
      {count != null && <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            padding: "12px 24px",
            borderRadius: 8,
            border: "2px solid #2a7a2a",
            background: "#e8f5e8",
            color: "#2a7a2a",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(42,122,42,0.1)",
          }}
        >
          ＋ 新規代行
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TabBtn k="list" label="代行一覧" count={subs.length} />
        <TabBtn k="tally" label="月次集計" />
        <button
          type="button"
          onClick={onGoToStaffView}
          style={{
            ...S.btn(false),
            marginLeft: "auto",
            fontSize: 11,
            background: "#fff",
            border: "1px solid #ccc",
          }}
        >
          👥 バイト・教科管理へ
        </button>
      </div>

      {tab === "list" && (
        <div>
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
                月
              </label>
              <input
                type="month"
                value={fMonth}
                onChange={(e) => setFMonth(e.target.value)}
                style={{ ...S.input, width: "auto" }}
              />
            </div>
            <div>
              <label
                style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
              >
                講師・代行者
              </label>
              <select
                value={fStaff}
                onChange={(e) => setFStaff(e.target.value)}
                style={{ ...S.input, width: "auto", minWidth: 110 }}
              >
                <option value="">すべて</option>
                {allTeachers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
              >
                ステータス
              </label>
              <select
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value)}
                style={{ ...S.input, width: "auto", minWidth: 90 }}
              >
                <option value="">すべて</option>
                {SUB_STATUS_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SUB_STATUS[k].label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                setFMonth("");
                setFStaff("");
                setFStatus("");
              }}
              style={{ ...S.btn(false), fontSize: 11 }}
            >
              クリア
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
            {filtered.length} / {subs.length} 件表示
          </div>
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #e0e0e0",
              overflow: "auto",
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{ textAlign: "center", color: "#bbb", padding: 40, fontSize: 13 }}
              >
                該当する代行記録はありません
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                  minWidth: 760,
                }}
              >
                <thead>
                  <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                    <th
                      style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}
                    >
                      日付
                    </th>
                    <th
                      style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}
                    >
                      時間
                    </th>
                    <th
                      style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}
                    >
                      学年
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>科目</th>
                    <th
                      style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}
                    >
                      元 → 代行
                    </th>
                    <th
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      状態
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>メモ</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sub, i) => {
                    const slot = slotMap[sub.slotId];
                    const gc = slot ? GC(slot.grade) : { b: "#eee", f: "#888" };
                    const dow = dateToDay(sub.date);
                    return (
                      <tr
                        key={sub.id}
                        style={{
                          background: i % 2 ? "#f8f9fa" : "#fff",
                          borderTop: "1px solid #eee",
                        }}
                      >
                        <td
                          style={{
                            padding: "8px 10px",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                          }}
                        >
                          {sub.date}
                          {dow && (
                            <span
                              style={{
                                marginLeft: 4,
                                fontSize: 10,
                                color: DC[dow],
                                fontWeight: 700,
                              }}
                            >
                              ({dow})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {slot?.time || "-"}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {slot ? (
                            <span
                              style={{
                                background: gc.b,
                                color: gc.f,
                                borderRadius: 4,
                                padding: "1px 6px",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              {slot.grade}
                              {slot.cls && slot.cls !== "-" ? slot.cls : ""}
                            </span>
                          ) : (
                            "(削除済)"
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                          {slot?.subj || "-"}
                          {slot?.room ? (
                            <span
                              style={{ color: "#999", fontSize: 10, marginLeft: 4 }}
                            >
                              {slot.room}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                          }}
                        >
                          {sub.originalTeacher}{" "}
                          <span style={{ color: "#888", fontWeight: 400 }}>→</span>{" "}
                          <span style={{ color: "#2a7a4a" }}>
                            {sub.substitute || "未定"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <StatusBadge status={sub.status} />
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            fontSize: 11,
                            color: "#666",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={sub.memo}
                        >
                          {sub.memo}
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onEdit(sub)}
                            aria-label={`${sub.date} の代行を編集`}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 13,
                              padding: 2,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => onDel(sub.id)}
                            aria-label={`${sub.date} の代行を削除`}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 13,
                              padding: 2,
                            }}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "tally" && (
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
                  return (
                    <tr
                      key={r.name}
                      style={{
                        background: i % 2 ? "#f8f9fa" : "#fff",
                        borderTop: "1px solid #eee",
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 14 }}>
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
        </div>
      )}

    </div>
  );
}
