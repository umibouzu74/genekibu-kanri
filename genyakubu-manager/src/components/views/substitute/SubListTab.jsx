import { useMemo, useState } from "react";
import { DAY_COLOR as DC, dateToDay, gradeColor as GC } from "../../../data";
import { ICON_BTN_CLASS, S } from "../../../styles/common";
import { StatusBadge } from "../../StatusBadge";
import { groupTeacherNames } from "../../../utils/groupTeacherNames";
import { isSlotShownOnDate } from "../../../utils/absenceHelpers";
import {
  SUB_STATE_FILTERS,
  isUnresolved,
  subState,
  SUB_STATE,
} from "../../../utils/substituteState";
import { splitTeacherField } from "../../../utils/biweekly";

// 行内の「代行者名 + ✓ 確定」。モーダル (SubstituteForm) を開かずに
// 未処理の行を片付けるための最小の操作だけを置く。
//   - 入力欄で Enter → 代行者名だけ保存 (状態は据え置き。未定 → 依頼中 になる)
//   - ✓ 確定 → 入力欄の名前 (空なら「代行なしで確定」) + confirmed
// 名前の候補は代行一覧の講師プルダウンと同じ集合 (datalist)。
// フォーカスを外しただけでは保存しない: blur で保存すると、名前を打って
// そのまま「✓ 確定」を押したときに mousedown の blur で先に行が更新され、
// 押したボタンが差し替わってクリックが届かない (2 回押しが要る) ため。
function QuickResolveCell({ sub, onQuickUpdate, listId }) {
  const [name, setName] = useState(sub.substitute || "");
  const dirty = name.trim() !== (sub.substitute || "");
  const commitName = () => {
    const v = name.trim();
    if (v === (sub.substitute || "")) return;
    onQuickUpdate(sub.id, { substitute: v }, {
      successMsg: v ? `代行者を ${v} にしました (依頼中)` : "代行者を外しました",
    });
  };
  const confirmNow = () => {
    const v = name.trim();
    const patch = { status: "confirmed" };
    if (v !== (sub.substitute || "")) patch.substitute = v;
    onQuickUpdate(sub.id, patch, {
      successMsg: v ? `${v} の代行で確定しました` : "代行なしで確定しました",
    });
  };
  return (
    <span
      className="no-print"
      style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 6 }}
    >
      <input
        type="text"
        list={listId}
        value={name}
        placeholder="代行者"
        aria-label={`${sub.date} ${sub.originalTeacher} の代行者`}
        title={dirty ? "Enter で代行者名を保存 (状態はそのまま) / ✓ 確定 で確定" : "代行者名を入れて Enter"}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            commitName();
          }
        }}
        style={{
          ...S.input,
          width: 90,
          padding: "2px 6px",
          fontSize: 11,
          borderColor: dirty ? "#2a6a9e" : undefined,
        }}
      />
      <button
        type="button"
        onClick={confirmNow}
        title={
          name.trim()
            ? `${name.trim()} の代行で確定にする`
            : "代行者を空のまま確定にする (代行なしで確定)"
        }
        aria-label={`${sub.date} ${sub.originalTeacher} の代行を確定`}
        style={{
          ...S.btn(false),
          fontSize: 11,
          padding: "2px 8px",
          color: "#2a7a4a",
          borderColor: "#a8d8b0",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        ✓ 確定
      </button>
    </span>
  );
}

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
  slots = [],
  partTimeStaff = [],
  subjects = [],
  // 「その日に有効でないコマ」の点検用 (時間割の有効期間 / 表示期間)
  timetables = [],
  displayCutoff = null,
  onEdit,
  onDel,
  onQuickUpdate,
  onNew,
  todayStr = "",
}) {
  const teacherGroups = useMemo(
    () => groupTeacherNames(allTeachers, { slots, partTimeStaff, subjects }),
    [allTeachers, slots, partTimeStaff, subjects],
  );
  // 代行レコードが指すコマが、その日にスケジュールへ出ないもの (期切替で
  // 残してある旧期の同名コマなど) を点検する。一覧には載るのにダッシュ
  // ボード・タイムテーブルのどこにも出ない、という食い違いをここで見せる
  const notShownIds = useMemo(() => {
    const set = new Set();
    for (const sub of filtered) {
      const slot = slotMap[sub.slotId];
      if (slot && !isSlotShownOnDate(slot, sub.date, { timetables, displayCutoff })) {
        set.add(sub.id);
      }
    }
    return set;
  }, [filtered, slotMap, timetables, displayCutoff]);
  // 行内の代行者入力の候補。講師欄は "香川·福江" のような複数講師を
  // 1 人ずつに分解して出す
  const quickListId = "sub-list-quick-teachers";
  const quickCandidates = useMemo(() => {
    const set = new Set();
    for (const t of allTeachers) for (const x of splitTeacherField(t)) set.add(x);
    return [...set];
  }, [allTeachers]);
  const canQuick = isAdmin && typeof onQuickUpdate === "function";
  const notShownTitle =
    "このコマの時間割はこの日に有効ではないため、スケジュール (ダッシュボード / タイムテーブル / 講師別カレンダー) には出ません。✏️ で同じ曜日の有効なコマへ付け替えてください";
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
            {teacherGroups.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.teachers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
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
            {SUB_STATE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
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
        {fStatus === "open" && todayStr && (
          <span style={{ marginLeft: 8 }}>
            (今日以降 {filtered.filter((s) => !(s.date < todayStr)).length} 件 / 過去{" "}
            {filtered.filter((s) => s.date < todayStr).length} 件)
          </span>
        )}
      </div>
      {canQuick && (
        <datalist id={quickListId}>
          {quickCandidates.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      {notShownIds.size > 0 && (
        <div
          role="status"
          style={{
            fontSize: 11,
            color: "#8a4a00",
            background: "#fff6e5",
            border: "1px solid #f0c070",
            borderRadius: 6,
            padding: "6px 10px",
            marginBottom: 6,
          }}
        >
          {`⚠ ${notShownIds.size} 件は、その日に有効でない時間割のコマ (旧期の同名コマなど) を指しています。スケジュールには出ないので、✏️ で同じ曜日の有効なコマへ付け替えてください`}
        </div>
      )}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "auto",
        }}
      >
        {filtered.length === 0 ? (
          // 空状態に次アクションへの導線を出す (K3d)
          <div
            style={{ textAlign: "center", color: "#888", padding: 40, fontSize: 13 }}
          >
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 10 }}>
              該当する代行記録はありません
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {(fMonth || fStaff || fStatus) && (
                <button
                  type="button"
                  onClick={() => {
                    setFMonth("");
                    setFStaff("");
                    setFStatus("");
                  }}
                  style={{ ...S.btn(false), fontSize: 12 }}
                >
                  フィルタをクリア
                </button>
              )}
              {isAdmin && onNew && (
                <button
                  type="button"
                  onClick={onNew}
                  style={{ ...S.btn(true), fontSize: 12 }}
                >
                  ＋ 代行を登録
                </button>
              )}
            </div>
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
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  日付
                </th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  時間
                </th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  学年
                </th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left" }}>科目</th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                  元 → 代行
                </th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                  状態
                </th>
                <th scope="col" style={{ padding: "8px 10px", textAlign: "left" }}>メモ</th>
                {isAdmin && (
                  <th scope="col"
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
                const isPast = !!todayStr && sub.date < todayStr;
                const open = isUnresolved(sub);
                return (
                  <tr
                    key={sub.id}
                    style={{
                      background: i % 2 ? "#f8f9fa" : "#fff",
                      borderTop: "1px solid #eee",
                      // 未処理の行は左に色を付けて目で拾えるようにする
                      // (未定 = 橙 / 依頼中 = 赤。substituteState の色)
                      boxShadow: open
                        ? `inset 4px 0 0 ${
                            subState(sub) === SUB_STATE.PENDING ? "#b34700" : "#c03030"
                          }`
                        : undefined,
                      opacity: isPast && fStatus === "open" ? 0.75 : 1,
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
                      {notShownIds.has(sub.id) && (
                        <span
                          title={notShownTitle}
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#8a4a00",
                            background: "#fff6e5",
                            border: "1px solid #f0c070",
                            borderRadius: 4,
                            padding: "0 5px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ⚠ この日は期間外
                        </span>
                      )}
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
                      {canQuick && open ? (
                        <QuickResolveCell
                          key={`${sub.id}:${sub.substitute || ""}:${sub.status}`}
                          sub={sub}
                          onQuickUpdate={onQuickUpdate}
                          listId={quickListId}
                        />
                      ) : (
                        <span style={{ color: "#2a7a4a" }}>
                          {sub.substitute || "未定"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <StatusBadge status={sub.status} substitute={sub.substitute} />
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
