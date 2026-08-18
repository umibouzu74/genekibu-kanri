import { useMemo, useState } from "react";
import { S } from "../styles/common";
import { fmtDateWeekday } from "../utils/dateHelpers";
import { gradeToDept } from "../utils/scheduleHelpers";
import {
  findGroupForGrade,
  findUngroupedGrades,
  summarizeCutoffGroups,
} from "../utils/timetable";
import { isOrientationEnabledForGrade } from "../utils/sessionCount";
import { findLastSessionOnOrBefore } from "../utils/lastSessionDate";
import { useConfirm } from "../hooks/useConfirm";

// ─── 表示期間設定 (学年グループの開始日 / 終了日 / 対象学年) ───────────
// 開始日は表示のフィルタであると同時に「第N回」のカウント起点でもある
// (sessionCount.getSlotCountStartDate)。設定の効き目が見えないと期切替で
// 事故るので、各行に「対象コマ数 / 授業曜日 / 実際の最終授業日 (第N回)」を
// 出し、矛盾した設定 (開始日 > 終了日 など) は警告する。
//
// 学年欄は自由入力なので「附中」「高1高2」のような表記が生まれる。どの
// グループにも属さない学年は表示期間も終講日も効かず第N回も出ないため、
// カード末尾で警告し、その場でグループへ割り当てられるようにする
// (対象学年はグループごとに編集できる)。
//
// 削除 UX: 学年グループの削除は「そのグループの学年が全部フィルタ対象外に
// なる」= 表示・回数への波及があるので confirm ダイアログ (CLAUDE.md の
// 削除 UX ルールで cascade あり側)。

const noteStyle = {
  fontSize: 11,
  color: "#777",
  marginTop: 3,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
const warnStyle = { fontSize: 11, color: "#a05a00", marginTop: 3 };
const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  fontSize: 11,
  fontWeight: 700,
  color: "#445",
  background: "#f2f5fa",
  border: "1px solid #dde3ee",
  borderRadius: 8,
  padding: "1px 4px 1px 7px",
};

// グループの学部 (一括設定の対象絞り込み用)。学年が混在するグループは
// 最初に判定できた学年で代表する。
const groupDept = (group) => {
  for (const g of group.grades || []) {
    const dept = gradeToDept(g);
    if (dept) return dept;
  }
  return null;
};

export function DisplayCutoffEditor({
  slots,
  displayCutoff,
  onSave,
  isAdmin,
  sessionCtx,
}) {
  const confirm = useConfirm();
  const groups = useMemo(() => displayCutoff?.groups || [], [displayCutoff]);
  const [newGradeByIdx, setNewGradeByIdx] = useState({});
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [bulk, setBulk] = useState({ target: "all", startDate: "", date: "" });

  const summary = useMemo(
    () => summarizeCutoffGroups(slots, displayCutoff),
    [slots, displayCutoff]
  );

  const ungrouped = useMemo(
    () => findUngroupedGrades(slots, displayCutoff),
    [slots, displayCutoff]
  );

  // 同じ学年が複数のグループに一致すると、findGroupForGrade は**先頭の
  // グループ**を返すので、後ろの行の設定は黙って効かなくなる。とくに複合学年
  // (「中1-3」は中1 として中1・2 グループにも一致する) で起きやすいので、
  // 効かない学年を行ごとに拾って警告する。
  const shadowedByIdx = useMemo(() => {
    const out = new Map();
    groups.forEach((g, idx) => {
      const shadowed = [];
      for (const grade of g.grades || []) {
        const owner = findGroupForGrade(grade, groups);
        if (owner && owner !== g) shadowed.push({ grade, ownerLabel: owner.label });
      }
      if (shadowed.length > 0) out.set(idx, shadowed);
    });
    return out;
  }, [groups]);

  // 終了日を入れているグループだけ「実際の最終授業日」を逆算する
  // (終了日が無いグループは終わりが無いので出す意味がない)。
  // 第N回は出さない: 学年グループには複数のコース (曜日ペア・学校) が
  // 混ざっていて進度カウンタが別々なので「何回目で終わる」が一意に決まらない。
  // コース単位の第N回はコース別終講日カードに出している。
  const lastSessions = useMemo(() => {
    const out = new Map();
    if (!sessionCtx) return out;
    const slotById = new Map((slots || []).map((s) => [s.id, s]));
    for (const g of groups) {
      const info = summary.get(g.label);
      if (!g.date || !info || info.slotCount === 0) continue;
      // 開始日 > 終了日 の行は期間として成立していないので逆算しない
      // (警告の隣に最終授業日が出ると矛盾して見える)
      if (g.startDate && g.startDate > g.date) continue;
      const groupSlots = info.slotIds.map((id) => slotById.get(id)).filter(Boolean);
      out.set(
        g.label,
        findLastSessionOnOrBefore(groupSlots, g.date, sessionCtx, { withSessionNo: false })
      );
    }
    return out;
  }, [groups, summary, slots, sessionCtx]);

  const saveGroups = (next) => onSave({ ...displayCutoff, groups: next });

  const patchGroup = (idx, patch) => {
    if (!isAdmin) return;
    const next = [...groups];
    next[idx] = { ...next[idx], ...patch };
    saveGroups(next);
  };

  // 学年は 1 つのグループにだけ属する (findGroupForGrade は先頭一致なので、
  // 二重登録すると後ろのグループの設定が黙って効かなくなる)。
  const addGradeToGroup = (idx, rawGrade) => {
    if (!isAdmin) return;
    const grade = (rawGrade || "").trim();
    if (!grade) return;
    const next = groups.map((g, i) => {
      const grades = (g.grades || []).filter((x) => x !== grade);
      if (i === idx) grades.push(grade);
      return { ...g, grades };
    });
    saveGroups(next);
    setNewGradeByIdx((prev) => ({ ...prev, [idx]: "" }));
  };

  const removeGradeFromGroup = (idx, grade) => {
    if (!isAdmin) return;
    const next = [...groups];
    next[idx] = {
      ...next[idx],
      grades: (next[idx].grades || []).filter((x) => x !== grade),
    };
    saveGroups(next);
  };

  const addGroup = () => {
    if (!isAdmin) return;
    const label = newGroupLabel.trim();
    if (!label || groups.some((g) => g.label === label)) return;
    saveGroups([...groups, { label, grades: [], startDate: null, date: null }]);
    setNewGroupLabel("");
  };

  const removeGroup = async (idx) => {
    if (!isAdmin) return;
    const group = groups[idx];
    const info = summary.get(group.label);
    const ok = await confirm({
      title: "学年グループを削除",
      message:
        `「${group.label}」(${(group.grades || []).join(", ") || "対象学年なし"}) を削除します。\n` +
        (info && info.slotCount > 0
          ? `・この学年の ${info.slotCount} コマは表示期間・終講日のフィルタが効かなくなり、授業回数（第N回）も出なくなります\n`
          : "・対象のコマはありません\n") +
        "\nよろしいですか？",
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    saveGroups(groups.filter((_, i) => i !== idx));
  };

  // 一括設定: 空欄の項目は触らない (「終了日だけ揃える」ができる)。
  const applyBulk = () => {
    if (!isAdmin) return;
    if (!bulk.startDate && !bulk.date) return;
    const next = groups.map((g) => {
      if (bulk.target !== "all" && groupDept(g) !== bulk.target) return g;
      const patch = {};
      if (bulk.startDate) patch.startDate = bulk.startDate;
      if (bulk.date) patch.date = bulk.date;
      return { ...g, ...patch };
    });
    saveGroups(next);
  };

  const bulkTargetCount = groups.filter(
    (g) => bulk.target === "all" || groupDept(g) === bulk.target
  ).length;

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
          「オリエン」＝ 開始日以降の初回授業日の1限をオリエンテーション扱いにして
          授業回数に数えません。2学期以降などオリエンが入らない期はオフにします。
        </div>
      </div>

      {isAdmin && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #eee",
            background: "#fbfcfe",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          <span style={{ fontWeight: 700, color: "#555" }}>一括設定</span>
          <select
            aria-label="一括設定の対象"
            value={bulk.target}
            onChange={(e) => setBulk({ ...bulk, target: e.target.value })}
            style={{ ...S.input, width: "auto", fontSize: 11, padding: "3px 6px" }}
          >
            <option value="all">全グループ</option>
            <option value="中学部">中学部</option>
            <option value="高校部">高校部</option>
          </select>
          <input
            type="date"
            aria-label="一括設定の開始日"
            value={bulk.startDate}
            onChange={(e) => setBulk({ ...bulk, startDate: e.target.value })}
            style={{ ...S.input, width: "auto", fontSize: 11, padding: "3px 6px" }}
          />
          <span style={{ color: "#888" }}>〜</span>
          <input
            type="date"
            aria-label="一括設定の終了日"
            value={bulk.date}
            onChange={(e) => setBulk({ ...bulk, date: e.target.value })}
            style={{ ...S.input, width: "auto", fontSize: 11, padding: "3px 6px" }}
          />
          <button
            type="button"
            onClick={applyBulk}
            disabled={!bulk.startDate && !bulk.date}
            style={{
              ...S.btn(false),
              fontSize: 11,
              padding: "3px 8px",
              opacity: !bulk.startDate && !bulk.date ? 0.5 : 1,
            }}
          >
            {bulkTargetCount} グループに適用
          </button>
          <span style={{ color: "#aaa", fontSize: 10 }}>
            空欄の項目は変更しません（終了日だけ揃えることもできます）
          </span>
        </div>
      )}

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
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
            <div key={`${group.label}-${idx}`}>
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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => removeGroup(idx)}
                    aria-label={`${group.label} を削除`}
                    title="この学年グループを削除します（対象学年のフィルタが効かなくなります）"
                    style={{
                      ...S.btn(false),
                      fontSize: 10,
                      padding: "3px 6px",
                      color: "#888",
                      marginLeft: "auto",
                    }}
                  >
                    グループ削除
                  </button>
                )}
              </div>

              {/* 対象学年 (チップ + 追加) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 10, color: "#aaa" }}>対象学年</span>
                {(group.grades || []).map((g) => (
                  <span key={g} style={chipStyle}>
                    {g}
                    {isAdmin && (
                      <button
                        type="button"
                        aria-label={`${group.label} から ${g} を外す`}
                        onClick={() => removeGradeFromGroup(idx, g)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#889",
                          cursor: "pointer",
                          fontSize: 12,
                          lineHeight: 1,
                          padding: "0 2px",
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {(group.grades || []).length === 0 && (
                  <span style={{ fontSize: 10, color: "#c88" }}>
                    未設定（このグループはどのコマにも一致しません）
                  </span>
                )}
                {isAdmin && (
                  <>
                    <input
                      type="text"
                      list="cutoff-ungrouped-grades"
                      placeholder="学年を追加"
                      aria-label={`${group.label} に学年を追加`}
                      value={newGradeByIdx[idx] || ""}
                      onChange={(e) =>
                        setNewGradeByIdx((prev) => ({ ...prev, [idx]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addGradeToGroup(idx, newGradeByIdx[idx]);
                        }
                      }}
                      style={{ ...S.input, width: 110, fontSize: 11, padding: "2px 6px" }}
                    />
                    <button
                      type="button"
                      aria-label={`${group.label} に入力した学年を追加`}
                      onClick={() => addGradeToGroup(idx, newGradeByIdx[idx])}
                      disabled={!(newGradeByIdx[idx] || "").trim()}
                      style={{ ...S.btn(false), fontSize: 10, padding: "2px 6px" }}
                    >
                      追加
                    </button>
                  </>
                )}
              </div>

              <div style={noteStyle}>
                <span>{info.slotCount} コマ</span>
                {info.days.length > 0 && <span>授業曜日 {info.days.join("")}</span>}
                {group.startDate && <span>開講 {fmtDateWeekday(group.startDate)}</span>}
                {group.date && <span>終了 {fmtDateWeekday(group.date)}</span>}
                {last && last.date !== group.date && (
                  <span style={{ color: "#2a6a3a", fontWeight: 600 }}>
                    実際の最終授業日 {fmtDateWeekday(last.date)}
                  </span>
                )}
              </div>

              {shadowedByIdx.has(idx) &&
                shadowedByIdx.get(idx).map((sh) => (
                  <div key={sh.grade} style={warnStyle}>
                    ⚠ {sh.grade} は「{sh.ownerLabel}」が先に一致するため、この行の設定は
                    効きません（同じ学年は先に並んでいるグループが優先されます）。
                  </div>
                ))}
              {invertedRange && (
                <div style={warnStyle}>
                  ⚠ 開始日が終了日より後です。このグループのコマはどの日にも表示されません。
                </div>
              )}
              {info.slotCount === 0 && (
                <div style={{ ...warnStyle, color: "#999" }}>
                  この学年グループのコマは登録されていません（設定しても効果はありません）。
                </div>
              )}
              {group.date && info.slotCount > 0 && !invertedRange && !last && (
                <div style={warnStyle}>
                  ⚠ 終了日の直前 4 週間にこの学年の授業がありません。終了日が早すぎないか確認してください。
                </div>
              )}
            </div>
          );
        })}

        {/* 学年の候補 (未所属の学年)。各グループの入力欄が共有する */}
        <datalist id="cutoff-ungrouped-grades">
          {ungrouped.map((u) => (
            <option key={u.grade} value={u.grade} />
          ))}
        </datalist>

        {isAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="新しい学年グループ名"
              aria-label="新しい学年グループ名"
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGroup();
                }
              }}
              style={{ ...S.input, width: 180, fontSize: 11, padding: "3px 6px" }}
            />
            <button
              type="button"
              onClick={addGroup}
              disabled={
                !newGroupLabel.trim() || groups.some((g) => g.label === newGroupLabel.trim())
              }
              style={{ ...S.btn(false), fontSize: 11, padding: "3px 8px" }}
            >
              + グループを追加
            </button>
            {newGroupLabel.trim() && groups.some((g) => g.label === newGroupLabel.trim()) && (
              <span style={{ fontSize: 10, color: "#a33" }}>同じ名前のグループがあります</span>
            )}
          </div>
        )}

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
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {ungrouped.map((u) => (
                <div
                  key={u.grade}
                  style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                >
                  <span
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
                  {isAdmin && groups.length > 0 && (
                    <select
                      aria-label={`${u.grade} をグループに追加`}
                      value=""
                      onChange={(e) => {
                        const i = Number(e.target.value);
                        if (Number.isInteger(i) && groups[i]) addGradeToGroup(i, u.grade);
                      }}
                      style={{ ...S.input, width: "auto", fontSize: 11, padding: "2px 6px" }}
                    >
                      <option value="">グループに追加…</option>
                      {groups.map((g, i) => (
                        <option key={`${g.label}-${i}`} value={i}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#a05a00", marginTop: 6, lineHeight: 1.5 }}>
              これらのコマは表示期間も終講日も効かず（常に表示され）、
              「第N回」も出ません。上のプルダウンでグループに入れるか、
              コマの学年表記を揃えてください。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
