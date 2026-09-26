import { useMemo, useState } from "react";
import { DAY_COLOR as DC, dateToDay, gradeColor as GC } from "../../../data";
import { ICON_BTN_CLASS, S } from "../../../styles/common";
import { StatusBadge } from "../../StatusBadge";
import { groupTeacherNames } from "../../../utils/groupTeacherNames";
import { findReplacementSlots, isSlotShownOnDate } from "../../../utils/absenceHelpers";
import {
  SUB_STATE_FILTERS,
  isUnresolved,
  subState,
  SUB_STATE,
} from "../../../utils/substituteState";
import { splitTeacherField } from "../../../utils/biweekly";
import { fmtDateWeekday, fmtIsoLocal } from "../../../utils/dateHelpers";
import { buildSubContactMessage, contactGroupKey } from "../../../utils/subContactMessage";
import { useToasts } from "../../../hooks/useToasts";

// クリップボードへ書く。navigator.clipboard は https / localhost でしか
// 使えないので、使えない環境では textarea + execCommand に落とす。
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下の予備経路へ
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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

// 期間外の代行を、同じ位置で有効なコマへ付け替える (候補が 1 件ならボタン
// だけ、複数なら select で選ぶ)。
function ReplaceSlotControl({ sub, candidates, timetables, onQuickUpdate }) {
  const [pick, setPick] = useState(candidates[0]?.id ?? "");
  const ttName = (slot) => {
    const tt = (timetables || []).find((t) => t.id === (slot.timetableId ?? 1));
    return tt ? tt.name : `時間割 ${slot.timetableId ?? 1}`;
  };
  const target = candidates.find((c) => String(c.id) === String(pick)) || candidates[0];
  const apply = () => {
    if (!target) return;
    onQuickUpdate(sub.id, { slotId: target.id }, {
      successMsg: `${sub.date} の代行を「${ttName(target)}」のコマへ付け替えました`,
    });
  };
  return (
    <span
      className="no-print"
      style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 6 }}
    >
      {candidates.length > 1 && (
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label={`${sub.date} の付け替え先`}
          style={{ ...S.input, width: "auto", fontSize: 11, padding: "2px 4px" }}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {ttName(c)} (#{c.id})
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={apply}
        aria-label={`${sub.date} の代行を有効なコマへ付け替え`}
        title={`この日に有効な同じ位置のコマ (${target ? ttName(target) : ""}) へ付け替えます`}
        style={{
          ...S.btn(false),
          fontSize: 11,
          padding: "2px 8px",
          color: "#2a6a9e",
          borderColor: "#9ec0e0",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        ↪ 有効なコマへ
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
  // 並び順 (親 SubstituteView が filtered をこの順で渡す。CSV も同じ順):
  //   "date" 対象日昇順 / "date-desc" 対象日降順 /
  //   "createdAt-desc" 登録が新しい順 / "createdAt" 登録が古い順
  // 列見出しのボタンで列を選び、同じ列をもう一度押すと昇順 / 降順が反転する
  sortBy = "date",
  setSortBy,
  isAdmin,
  slots = [],
  partTimeStaff = [],
  subjects = [],
  // 講師プルダウンの教科グループ内をよみ順に (時間割調整一覧と同じ)
  teacherKana = {},
  // 「その日に有効でないコマ」の点検用 (時間割の有効期間 / 表示期間)
  timetables = [],
  displayCutoff = null,
  // 連絡文 (💬) の時刻をその日の実際の時刻にするため (コマ移動 / 特別時程)
  adjustments = [],
  daySchedules = [],
  onEdit,
  onDel,
  onQuickUpdate,
  onNew,
  // 「その日の欠勤組み換えへ」(🚑)。管理者のみ。時間割調整一覧と同じ導線
  onJumpToDate,
  todayStr = "",
}) {
  const teacherGroups = useMemo(
    () => groupTeacherNames(allTeachers, { slots, partTimeStaff, subjects, teacherKana }),
    [allTeachers, slots, partTimeStaff, subjects, teacherKana],
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
  const toasts = useToasts();
  // 💬 連絡文。同じ日・同じ元講師・同じ代行者・同じ状態の行は 1 通に束ねる
  // (utils/subContactMessage)。束ねる相手は表示中の行から探す
  const contactGroups = useMemo(() => {
    const m = new Map();
    for (const sub of filtered) {
      const k = contactGroupKey(sub);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(sub);
    }
    return m;
  }, [filtered]);
  const copyContactMessage = async (sub) => {
    const group = contactGroups.get(contactGroupKey(sub)) || [sub];
    const text = buildSubContactMessage(group, slotMap, { adjustments, daySchedules });
    if (!text) {
      toasts.error("コマが見つからないため連絡文を作れませんでした");
      return;
    }
    if (await copyText(text)) {
      toasts.success(
        group.length > 1
          ? `連絡文をコピーしました (${group.length} コマ分をまとめました)`
          : "連絡文をコピーしました"
      );
    } else {
      toasts.error("クリップボードにコピーできませんでした");
    }
  };
  const canSort = typeof setSortBy === "function";
  const sortColumn = sortBy.startsWith("createdAt") ? "createdAt" : "date";
  const sortDir = sortBy.endsWith("-desc") ? "descending" : "ascending";
  // 別の列を押したときの既定: 対象日は昇順 (近い日から)、作成日時は降順
  // (登録が新しい順)。同じ列なら向きを反転
  const toggleSort = (column) => {
    if (!canSort) return;
    if (column !== sortColumn) {
      setSortBy(column === "createdAt" ? "createdAt-desc" : "date");
      return;
    }
    const nextDesc = sortDir !== "descending";
    setSortBy(nextDesc ? `${column}-desc` : column);
  };
  // 見出しの並べ替えボタン。th 自体をクリックしても同じ (押しやすさ)。
  // ボタンのクリックは th へバブルするので、th 側は直接クリックだけ拾う
  const sortHeaderProps = (column) =>
    canSort
      ? {
          "aria-sort": column === sortColumn ? sortDir : "none",
          onClick: (e) => {
            if (e.target === e.currentTarget) toggleSort(column);
          },
        }
      : {};
  const sortHeaderStyle = { cursor: canSort ? "pointer" : undefined, userSelect: "none" };
  const renderSortButton = (column, label) =>
    canSort ? (
      <button
        type="button"
        className="no-print"
        aria-label={`${label}で並べ替え`}
        title={
          column === sortColumn
            ? `クリックで${sortDir === "descending" ? "昇順" : "降順"}にする`
            : `クリックで${label}順にする`
        }
        onClick={() => toggleSort(column)}
        style={{
          border: "none",
          background: "none",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          padding: 0,
          marginLeft: 2,
        }}
      >
        <span aria-hidden="true">
          {column !== sortColumn ? "↕" : sortDir === "descending" ? "↓" : "↑"}
        </span>
      </button>
    ) : null;
  const notShownTitle =
    "このコマの時間割はこの日に有効ではないため、スケジュール (ダッシュボード / タイムテーブル / 講師別カレンダー) には出ません。同じ位置の有効なコマがあれば ↪ で付け替え、無ければ ✏️ で選び直してください";
  // 期間外の行 → 同じ位置 (曜日・時刻・学年・クラス・科目) で有効なコマ
  const replacementBySub = useMemo(() => {
    const m = new Map();
    if (!canQuick) return m;
    for (const id of notShownIds) {
      const sub = filtered.find((x) => x.id === id);
      const slot = sub && slotMap[sub.slotId];
      if (!slot) continue;
      const cands = findReplacementSlots(slot, sub.date, slots, { timetables, displayCutoff });
      if (cands.length > 0) m.set(id, cands);
    }
    return m;
  }, [canQuick, notShownIds, filtered, slotMap, slots, timetables, displayCutoff]);
  return (
    <div>
      <style>{`@media print { .sub-list-table { min-width: 0 !important; } }`}</style>
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
            className="sub-list-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              // 画面では 860 (作成日時・操作の列ぶん)。紙面ではその 2 列が
              // no-print で消えるので、下の @media print で min-width を外す
              minWidth: 860,
            }}
          >
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                <th
                  scope="col"
                  {...sortHeaderProps("date")}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    ...sortHeaderStyle,
                  }}
                >
                  対象日{renderSortButton("date", "対象日")}
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
                {/* 作成日時は画面での並べ替え用。紙面には載せない (幅も食う) */}
                <th
                  scope="col"
                  className="no-print"
                  {...sortHeaderProps("createdAt")}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    ...sortHeaderStyle,
                  }}
                >
                  作成日時{renderSortButton("createdAt", "作成日時")}
                </th>
                {isAdmin && (
                  <th scope="col"
                    className="no-print"
                    style={{ padding: "8px 10px", textAlign: "center", width: 110 }}
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
                      {replacementBySub.has(sub.id) && (
                        <ReplaceSlotControl
                          sub={sub}
                          candidates={replacementBySub.get(sub.id)}
                          timetables={timetables}
                          onQuickUpdate={onQuickUpdate}
                        />
                      )}
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
                    <td
                      className="no-print"
                      style={{
                        padding: "8px 10px",
                        fontSize: 10,
                        color: "#999",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtIsoLocal(sub.createdAt)}
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
                          onClick={() => copyContactMessage(sub)}
                          aria-label={`${fmtDateWeekday(sub.date)} ${sub.originalTeacher} の連絡文をコピー`}
                          title={
                            (contactGroups.get(contactGroupKey(sub))?.length || 1) > 1
                              ? `LINE などに貼れる連絡文をコピー (この日の ${sub.originalTeacher} の ${contactGroups.get(contactGroupKey(sub)).length} コマをまとめて 1 通に)`
                              : "LINE などに貼れる連絡文をコピー"
                          }
                          className={ICON_BTN_CLASS}
                          style={{ ...S.iconBtn, marginRight: 2 }}
                        >
                          💬
                        </button>
                        {onJumpToDate && sub.date && (
                          <button
                            type="button"
                            onClick={() => onJumpToDate(sub.date)}
                            aria-label={`${fmtDateWeekday(sub.date)} の欠勤組み換えを開く`}
                            title={`${fmtDateWeekday(sub.date)} の欠勤組み換えを開く`}
                            className={ICON_BTN_CLASS}
                            style={{ ...S.iconBtn, marginRight: 2 }}
                          >
                            🚑
                          </button>
                        )}
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
