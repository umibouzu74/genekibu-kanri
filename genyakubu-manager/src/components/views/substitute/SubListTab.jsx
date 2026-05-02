import {
  DAY_COLOR as DC,
  dateToDay,
  gradeColor as GC,
  SUB_STATUS,
  SUB_STATUS_KEYS,
} from "../../../data";
import { ICON_BTN_CLASS, S } from "../../../styles/common";
import { StatusBadge } from "../../StatusBadge";

// Sub list tab : フィルタ (月 / 講師 / ステータス) + 代行レコード一覧テーブル。
export function SubListTab({
  filtered,
  subs,
  slotMap,
  allTeachers,
  fMonth,
  setFMonth,
  fStaff,
  setFStaff,
  fStatus,
  setFStatus,
  isAdmin,
  onEdit,
  onDel,
}) {
  return (
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
            htmlFor="sub-list-filter-month"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            月
          </label>
          <input
            id="sub-list-filter-month"
            type="month"
            value={fMonth}
            onChange={(e) => setFMonth(e.target.value)}
            style={{ ...S.input, width: "auto" }}
          />
        </div>
        <div>
          <label
            htmlFor="sub-list-filter-staff"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            講師・代行者
          </label>
          <select
            id="sub-list-filter-staff"
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
            htmlFor="sub-list-filter-status"
            style={{ fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 }}
          >
            ステータス
          </label>
          <select
            id="sub-list-filter-status"
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
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  日付
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  時間
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  学年
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>科目</th>
                <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  元 → 代行
                </th>
                <th style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                  状態
                </th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>メモ</th>
                {isAdmin && (
                  <th
                    className="no-print"
                    style={{ padding: "8px 10px", textAlign: "center", width: 60 }}
                  >
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
                        <span style={{ color: "#999", fontSize: 10, marginLeft: 4 }}>
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
                        className="no-print"
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
                          className={ICON_BTN_CLASS}
                          style={S.iconBtn}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => onDel(sub.id)}
                          aria-label={`${sub.date} の代行を削除`}
                          className={ICON_BTN_CLASS}
                          style={S.iconBtn}
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
  );
}
