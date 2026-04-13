import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  DAY_COLOR as DC,
  dateToDay,
  fmtDateWeekday,
  gradeColor as GC,
  monthlyTally,
  staffMonthlyAbsenceDates,
  staffMonthlyRegularDates,
  staffMonthlyWorkDates,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../../data";
import { S } from "../../styles/common";
import { sortJa } from "../../utils/sortJa";
import { encodeShareData } from "../../utils/shareCodec";
import { useToasts } from "../../hooks/useToasts";
import { StatusBadge } from "../StatusBadge";
import { AdjustmentEditor } from "./AdjustmentEditor";

export function SubstituteView({
  subs,
  slots,
  holidays,
  partTimeStaff,
  onNew,
  onEdit,
  onDel,
  onGoToStaffView,
  initFilter,
  onConsumeInitFilter,
  adjustments,
  onAddAdjustment,
  onDelAdjustment,
  onRemoveAdjustment,
  onReplaceAdjustment,
  isAdmin,
}) {
  const now = new Date();
  const [tab, setTab] = useState("list");
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [expandedTally, setExpandedTally] = useState(new Set());

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
    return sortJa([...set]);
  }, [slots, staffNameSet]);

  const toasts = useToasts();
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    const target = filtered.length > 0 ? filtered : subs;
    if (target.length === 0) {
      toasts.error("共有する代行データがありません");
      return;
    }
    setSharing(true);
    try {
      const referencedSlotIds = new Set(target.map((s) => s.slotId));
      const referencedSlots = slots.filter((s) => referencedSlotIds.has(s.id));
      const encoded = await encodeShareData({
        slots: referencedSlots,
        substitutions: target,
        generatedAt: new Date().toISOString(),
      });
      const url = `${window.location.origin}${window.location.pathname}#/share/${encoded}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "代行情報", url });
          toasts.success("共有しました");
          return;
        } catch {
          // User cancelled or Web Share unavailable – fall through to clipboard
        }
      }
      await navigator.clipboard.writeText(url);
      toasts.success("共有リンクをコピーしました");
    } catch {
      toasts.error("共有リンクの生成に失敗しました");
    } finally {
      setSharing(false);
    }
  }, [filtered, subs, slots, sharing, toasts]);

  const TabBtn = ({ k, label, count }) => (
    <button onClick={() => setTab(k)} style={S.btn(tab === k)}>
      {label}
      {count != null && <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {isAdmin && (
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
      )}
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
        <TabBtn k="adjust" label="時間割調整" count={adjustments?.length || null} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            style={{
              ...S.btn(false),
              fontSize: 11,
              background: "#eef2ff",
              color: "#1a1a6e",
              border: "1px solid #c0c8e8",
              opacity: sharing ? 0.6 : 1,
            }}
          >
            {sharing ? "生成中..." : "共有リンクを作成"}
          </button>
          <button
            type="button"
            onClick={onGoToStaffView}
            style={{
              ...S.btn(false),
              fontSize: 11,
              background: "#fff",
              border: "1px solid #ccc",
            }}
          >
            バイト・教科管理へ
          </button>
        </div>
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
                    {isAdmin && (
                      <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>
                        操作
                      </th>
                    )}
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
                        {isAdmin && (
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
                        )}
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
      )}

      {tab === "adjust" && (
        <AdjustmentEditor
          slots={slots}
          adjustments={adjustments || []}
          onAddAdjustment={onAddAdjustment}
          onDelAdjustment={onDelAdjustment}
          onRemoveAdjustment={onRemoveAdjustment}
          onReplaceAdjustment={onReplaceAdjustment}
          isAdmin={isAdmin}
        />
      )}

    </div>
  );
}
