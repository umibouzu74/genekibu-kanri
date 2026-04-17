import {
  DAY_COLOR as DC,
  fmtDate,
  gradeColor as GC,
} from "../../../data";
import { S } from "../../../styles/common";
import {
  formatBiweeklyTeacher,
  formatCount,
  getSlotWeekType,
  weightedSlotCount,
} from "../../../utils/biweekly";

// 隔週管理タブ : グローバル基準日の表 + 隔週コマを時間帯ごとにグループ化して表示。
export function BiweeklyTab({
  biweeklyAnchors,
  sortedAnchors,
  currentWeekType,
  newAnchorDate,
  setNewAnchorDate,
  addAnchor,
  removeAnchor,
  biweeklyGroups,
  isAdmin,
  onEdit,
}) {
  return (
    <>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          border: "1px solid #e0e0e0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>隔週の基準設定</div>
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

        {sortedAnchors.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>基準日</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>種別</th>
                {isAdmin && (
                  <th style={{ textAlign: "center", padding: "4px 6px", width: 40 }}>
                    削除
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedAnchors.map((a) => (
                <tr key={a.date} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px", fontWeight: 600 }}>{a.date}</td>
                  <td style={{ padding: "6px" }}>
                    <span
                      style={{
                        background: "#2e6a9e",
                        color: "#fff",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      A週
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => removeAnchor(a.date)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#c05030",
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>A週の基準日を追加:</label>
            <input
              type="date"
              value={newAnchorDate}
              onChange={(e) => setNewAnchorDate(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
            <button
              type="button"
              onClick={addAnchor}
              disabled={!newAnchorDate}
              style={{
                ...S.btn(false),
                fontSize: 12,
                opacity: newAnchorDate ? 1 : 0.5,
              }}
            >
              追加
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
          ここで設定する基準日は全隔週コマのデフォルトです。
          個別にずれたコマは、コマの編集画面から専用の基準日を設定できます。
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
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {formatCount(weightedSlotCount(g.slots))}コマ
                </span>
              </div>
              <div style={{ padding: 10 }}>
                <table
                  style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee" }}>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>学年</th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>クラス</th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>科目</th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>担当</th>
                      <th style={{ textAlign: "center", padding: "4px 6px" }}>今週</th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>基準</th>
                      {isAdmin && (
                        <th
                          style={{ textAlign: "center", padding: "4px 6px", width: 40 }}
                        >
                          編集
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {g.slots.map((s) => {
                      const slotWt = getSlotWeekType(
                        fmtDate(new Date()),
                        s,
                        biweeklyAnchors
                      );
                      const hasCustomAnchors =
                        s.biweeklyAnchors && s.biweeklyAnchors.length > 0;
                      return (
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
                          <td style={{ padding: "6px", textAlign: "center" }}>
                            {slotWt && (
                              <span
                                style={{
                                  background: slotWt === "A" ? "#2e6a9e" : "#c05030",
                                  color: "#fff",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                {slotWt}週
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "6px" }}>
                            {hasCustomAnchors ? (
                              <span
                                style={{
                                  background: "#e67a00",
                                  color: "#fff",
                                  padding: "1px 6px",
                                  borderRadius: 3,
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}
                              >
                                個別
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, color: "#aaa" }}>共通</span>
                            )}
                          </td>
                          {isAdmin && (
                            <td style={{ padding: "6px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => onEdit(s)}
                                aria-label={`${s.subj} を編集`}
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
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16, fontSize: 11, color: "#888" }}>
        ※ 備考欄に「隔週」を含むコマが自動的に表示されます。
        「個別」マーク付きのコマは独自の基準日が設定されています。
      </div>
    </>
  );
}
