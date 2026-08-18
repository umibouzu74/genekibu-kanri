import { useMemo } from "react";
import { S } from "../styles/common";
import { fmtDateWeekday } from "../utils/dateHelpers";
import {
  findUngroupedGrades,
  summarizeCutoffGroups,
} from "../utils/timetable";
import { isOrientationEnabledForGrade } from "../utils/sessionCount";
import { findLastSessionOnOrBefore } from "../utils/lastSessionDate";

// ─── 表示期間設定 (学年グループの開始日 / 終了日) ─────────────────────
// 開始日は表示のフィルタであると同時に「第N回」のカウント起点でもある
// (sessionCount.getSlotCountStartDate)。設定の効き目が見えないと期切替で
// 事故るので、各行に「対象コマ数 / 授業曜日 / 実際の最終授業日 (第N回)」を
// 出し、矛盾した設定 (開始日 > 終了日 など) は警告する。
//
// どの学年グループにも属さない学年 (学年欄は自由入力なので「附中」「高1高2」
// のような表記が生まれる) は、表示期間も終講日も効かず第N回も出ない。
// 気付けるようにカード末尾で警告する。

const noteStyle = {
  fontSize: 11,
  color: "#777",
  marginTop: 3,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
const warnStyle = { fontSize: 11, color: "#a05a00", marginTop: 3 };

export function DisplayCutoffEditor({
  slots,
  displayCutoff,
  onSave,
  isAdmin,
  sessionCtx,
}) {
  const groups = useMemo(() => displayCutoff?.groups || [], [displayCutoff]);

  const summary = useMemo(
    () => summarizeCutoffGroups(slots, displayCutoff),
    [slots, displayCutoff]
  );

  const ungrouped = useMemo(
    () => findUngroupedGrades(slots, displayCutoff),
    [slots, displayCutoff]
  );

  // 終了日を入れているグループだけ「実際の最終授業日」を逆算する
  // (終了日が無いグループは終わりが無いので出す意味がない)。
  const lastSessions = useMemo(() => {
    const out = new Map();
    if (!sessionCtx) return out;
    const slotById = new Map((slots || []).map((s) => [s.id, s]));
    for (const g of groups) {
      const info = summary.get(g.label);
      if (!g.date || !info || info.slotCount === 0) continue;
      const groupSlots = info.slotIds.map((id) => slotById.get(id)).filter(Boolean);
      out.set(g.label, findLastSessionOnOrBefore(groupSlots, g.date, sessionCtx));
    }
    return out;
  }, [groups, summary, slots, sessionCtx]);

  const patchGroup = (idx, patch) => {
    if (!isAdmin) return;
    const next = [...groups];
    next[idx] = { ...next[idx], ...patch };
    onSave({ ...displayCutoff, groups: next });
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fafafa",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>表示期間設定</span>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          各学年グループの表示期間（開始日〜終了日）を設定します。
          この範囲外の予定はダッシュボード等に表示されません。
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          <b>開始日は「第N回」のカウント起点でもあります</b>
          （期の途中で動かすと回数が数え直しになります）。
          「オリエン」= 開始日以降の初回授業日の1限をオリエンテーション扱いにして
          授業回数に数えません。2学期以降などオリエンが入らない期はオフにします。
        </div>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((group, idx) => {
          const info = summary.get(group.label) || { slotCount: 0, days: [] };
          // 未設定 (従来データ) は中学部のみ有効の既定値を解決して表示する。
          const orientationOn =
            typeof group.orientationFirstDay === "boolean"
              ? group.orientationFirstDay
              : isOrientationEnabledForGrade((group.grades || [])[0], {
                  groups: [group],
                });
          const invertedRange =
            group.startDate && group.date && group.startDate > group.date;
          const last = lastSessions.get(group.label);
          return (
            <div key={group.label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 80 }}>
                  {group.label}
                </span>
                <input
                  type="date"
                  aria-label={`${group.label} の開始日`}
                  value={group.startDate || ""}
                  onChange={(e) => patchGroup(idx, { startDate: e.target.value || null })}
                  disabled={!isAdmin}
                  style={{ ...S.input, width: "auto", minWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: "#888" }}>〜</span>
                <input
                  type="date"
                  aria-label={`${group.label} の終了日`}
                  value={group.date || ""}
                  onChange={(e) => patchGroup(idx, { date: e.target.value || null })}
                  disabled={!isAdmin}
                  style={{ ...S.input, width: "auto", minWidth: 140 }}
                />
                {(group.startDate || group.date) && isAdmin && (
                  <button
                    type="button"
                    onClick={() => patchGroup(idx, { startDate: null, date: null })}
                    style={{ ...S.btn(false), fontSize: 10, padding: "3px 6px" }}
                  >
                    解除
                  </button>
                )}
                <label
                  title="開始日以降の初回授業日の1限をオリエンテーション扱いにし、授業回数に数えません（2学期以降などオリエンが無い期はオフ）"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: isAdmin ? "#555" : "#aaa",
                    cursor: isAdmin ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={orientationOn}
                    onChange={(e) => patchGroup(idx, { orientationFirstDay: e.target.checked })}
                    disabled={!isAdmin}
                    style={{ margin: 0 }}
                  />
                  初回1限はオリエン（回数に数えない）
                </label>
                <span style={{ fontSize: 10, color: "#aaa" }}>
                  {(group.grades || []).join(", ")}
                </span>
              </div>

              <div style={noteStyle}>
                <span>{info.slotCount} コマ</span>
                {info.days.length > 0 && <span>授業曜日 {info.days.join("")}</span>}
                {group.startDate && <span>開講 {fmtDateWeekday(group.startDate)}</span>}
                {group.date && <span>終了 {fmtDateWeekday(group.date)}</span>}
                {last && (
                  <span style={{ color: "#2a6a3a", fontWeight: 600 }}>
                    最終授業日 {fmtDateWeekday(last.date)}
                    {last.sessionNo > 0 ? `（第${last.sessionNo}回）` : ""}
                  </span>
                )}
              </div>

              {invertedRange && (
                <div style={warnStyle}>
                  ⚠ 開始日が終了日より後です。この学年のコマはどの日にも表示されません。
                </div>
              )}
              {info.slotCount === 0 && (
                <div style={{ ...warnStyle, color: "#999" }}>
                  この学年グループのコマは登録されていません（設定しても効果はありません）。
                </div>
              )}
              {group.date && info.slotCount > 0 && !last && (
                <div style={warnStyle}>
                  ⚠ 終了日の直前 4 週間にこの学年の授業がありません。終了日が早すぎないか確認してください。
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div
            style={{
              background: "#fffaf0",
              border: "1px solid #e0c080",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#a05a00" }}>
              ⚠ どの学年グループにも属さない学年があります
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {ungrouped.map((u) => (
                <span
                  key={u.grade}
                  style={{
                    fontSize: 11,
                    color: "#a05a00",
                    background: "#fff",
                    border: "1px solid #e8d0a0",
                    borderRadius: 8,
                    padding: "2px 8px",
                    fontWeight: 700,
                  }}
                >
                  {u.grade} ({u.slotCount} コマ)
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#a05a00", marginTop: 6, lineHeight: 1.5 }}>
              これらのコマは表示期間・終講日のどちらも効かず（常に表示され）、
              「第N回」も出ません。コマの学年表記を上のグループの対象学年に
              合わせてください（例:「附中」→「附中3」)。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
