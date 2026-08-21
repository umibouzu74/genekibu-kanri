import { useEffect, useMemo, useRef, useState } from "react";
import { splitTeacherField } from "../../../utils/biweekly";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { sortTeacherNames } from "../../../utils/teacherKana";
import { pickSubjectId } from "../../../utils/subjectMatch";
import { SUB_STATE, subState, subStateMeta } from "../../../utils/substituteState";
import {
  biweeklyActiveTeacher,
  biweeklyDisplaySubject,
  getSlotTeachers,
} from "../../../utils/biweekly";

// ─── 代行ピッカーポップオーバー ───────────────────────────────
// 欠勤組み換え UI 用の簡易ピッカー。
// 指定コマの教科に担当可能な先生を優先表示し、"全員表示" で常勤含め全員から選べる。
//
// 代行者が見つかっていなくても「代行未定のまま欠勤にする」で登録できる。
// これは代行者が空の代行レコード (status: "requested") になり、
// スケジュール各画面には「代行未定」として出る。後から名前が入るだけなので、
// **欠勤のための別モデルは作らない** (utils/absenceHelpers.collectAbsenceTargets)。

function computePosition(anchorRect) {
  const popoverWidth = Math.min(280, window.innerWidth - 16);
  const popoverMaxHeight = Math.min(360, window.innerHeight - 24);
  const top = anchorRect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8)
  );
  const maxTop = window.innerHeight - popoverMaxHeight - 8;
  return {
    top: top > maxTop ? Math.max(8, anchorRect.top - popoverMaxHeight - 4) : top,
    left,
  };
}

export function SubstitutePickerPopover({
  anchorRect,
  slot,
  date,
  biweeklyAnchors,
  holidays,
  examPeriods,
  partTimeStaff,
  subjects,
  teacherKana = {},
  daySlots,
  teachers = [], // 対象日に実際に担当する講師 (隔週の A/B 解決済み)
  subsByTeacher = {}, // 元講師 -> { substitute, status } (下書き / 登録済み)
  onAssign, // (元講師, 代行者名, status)
  onClear, // (元講師)
  onClose,
}) {
  const ref = useRef(null);
  const [showAll, setShowAll] = useState(false);

  // 多担任コマ (例: プレップ "香川·福江·川井") は**講師ごとに 1 件**なので、
  // まず「誰の代行 / 欠勤か」を決める。単一担任ならその 1 人で固定。
  const slotTeachers = useMemo(
    () => (teachers.length > 0 ? teachers : getSlotTeachers(slot)),
    [teachers, slot]
  );
  const isMultiTeacher = slotTeachers.length > 1;
  const [originalTeacher, setOriginalTeacher] = useState(
    () => slotTeachers[0] || ""
  );
  const current = subsByTeacher[originalTeacher] || null;
  const currentSubstitute = current?.substitute || "";
  const hasSubEntry = !!current;
  const [statusOverride, setStatusOverride] = useState(null);
  // 元講師を切り替えたらその人の現状に追従する (自分で触るまで)。
  const status = statusOverride ?? current?.status ?? "confirmed";
  const setStatus = setStatusOverride;
  // 矢印キーで選択中の候補のインデックス。-1 はリスト未フォーカス。
  // 開いた直後は何もハイライトせず、↓ を押した時点で先頭に移る挙動。
  const [focusIdx, setFocusIdx] = useState(-1);
  const listboxId = "sub-picker-listbox";
  const optionId = (i) => `sub-picker-opt-${i}`;

  const pos = anchorRect
    ? computePosition(anchorRect)
    : { top: 100, left: 100 };

  // Primary 候補: そのコマの教科を担当できるバイト講師。
  //   subjId が解決できた場合   → subjectIds に該当 id を持つ講師
  //   subjId が解決できない場合 → 教科フィルタを適用できないので全員
  const subjId = pickSubjectId(slot.subj, subjects);
  const allStaff = useMemo(() => partTimeStaff || [], [partTimeStaff]);
  const staffSubjectMatch = useMemo(
    () =>
      subjId != null
        ? allStaff.filter(
            (p) => Array.isArray(p.subjectIds) && p.subjectIds.includes(subjId)
          )
        : allStaff,
    [subjId, allStaff]
  );

  // 同日の他のコマで担当している先生 (常勤含む) を secondary 候補に加える
  const dayTeachers = useMemo(() => {
    const set = new Set();
    for (const s of daySlots || []) {
      for (const t of splitTeacherField(s.teacher)) set.add(t);
    }
    set.delete(slot.teacher);
    return set;
  }, [daySlots, slot.teacher]);

  const primary = useMemo(
    () => sortTeacherNames(staffSubjectMatch.map((s) => s.name), teacherKana),
    [staffSubjectMatch, teacherKana]
  );
  const list = useMemo(() => {
    if (!showAll) return primary;
    const rest = sortTeacherNames(
      [
        ...new Set([...allStaff.map((s) => s.name), ...dayTeachers]),
      ].filter((n) => !primary.includes(n) && n !== slot.teacher),
      teacherKana
    );
    return [...primary, ...rest];
  }, [showAll, primary, allStaff, dayTeachers, slot.teacher, teacherKana]);

  // showAll 切替などで候補が変わったらフォーカスをリセット (範囲外参照防止)。
  useEffect(() => {
    setFocusIdx((idx) => (idx >= list.length ? -1 : idx));
  }, [list.length]);

  // 矢印キーでリスト内を移動し、Enter で確定する。
  // ピッカー上で focus が当たっていない時 (開いた直後) でもキー操作で
  // 選べるよう、document レベルで ↑↓ Enter を捕捉する。
  // input / select / textarea にフォーカスがある時はブラウザ標準動作
  // (select のオプション切替、テキスト入力等) を優先させるため握り潰さない。
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      const isField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (isField) return;
      if (e.key === "ArrowDown") {
        if (list.length === 0) return;
        e.preventDefault();
        setFocusIdx((idx) => Math.min(list.length - 1, idx < 0 ? 0 : idx + 1));
      } else if (e.key === "ArrowUp") {
        if (list.length === 0) return;
        e.preventDefault();
        setFocusIdx((idx) => Math.max(0, idx < 0 ? 0 : idx - 1));
      } else if (e.key === "Enter") {
        if (focusIdx >= 0 && focusIdx < list.length) {
          e.preventDefault();
          onAssign(originalTeacher, list[focusIdx], status);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [list, focusIdx, status, originalTeacher, onAssign, onClose]);

  // 矢印キーで focusIdx が画面外へ進んだら、対応する <button role="option">
  // を可視範囲へスクロール。block:"nearest" でリストが上下にバウンドするのを防ぐ。
  // mouseenter で focusIdx を更新するケースは scroll 不要 (既に可視) なので
  // 連発を避けるため、focusIdx >= 0 の時だけ呼ぶ。
  useEffect(() => {
    if (focusIdx < 0 || !ref.current) return;
    const el = ref.current.querySelector(`#${optionId(focusIdx)}`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.min(280, window.innerWidth - 16),
        maxHeight: Math.min(360, window.innerHeight - 24),
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 2100,
        fontSize: 12,
      }}
    >
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #eee" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          代行を割り当て
        </div>
        <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
          {slot.grade}
          {slot.cls && slot.cls !== "-" ? slot.cls : ""}{" "}
          {date
            ? biweeklyDisplaySubject(slot, date, biweeklyAnchors, holidays, examPeriods)
            : slot.subj}{" "}
          (
          {date
            ? biweeklyActiveTeacher(slot, date, biweeklyAnchors, holidays, examPeriods)
            : slot.teacher}
          )
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <label style={{ color: "#555" }}>ステータス:</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ ...S.input, padding: "2px 6px", fontSize: 11 }}
        >
          <option value="confirmed">確定</option>
          <option value="requested">依頼中</option>
        </select>
        <label
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            gap: 4,
            alignItems: "center",
            color: "#555",
          }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          全員表示
        </label>
      </div>

      {/* 多担任コマ (プレップ等): 欠勤・代行は**講師ごとに 1 件**なので、
          まず誰のぶんかを選ぶ。登録済みの講師にはその状態を付けて出す。 */}
      {isMultiTeacher && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 4,
            padding: "6px 10px",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <span style={{ color: "#555" }}>対象の講師:</span>
          {slotTeachers.map((t) => {
            const active = t === originalTeacher;
            const meta = subStateMeta(subsByTeacher[t]);
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setOriginalTeacher(t);
                  setStatusOverride(null);
                }}
                style={{
                  padding: "2px 8px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: `1px solid ${active ? colors.danger : "#ccc"}`,
                  background: active ? "#fdecec" : "#fff",
                  color: active ? colors.danger : "#444",
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {t}
                {meta && (
                  <span style={{ marginLeft: 3, color: meta.color, fontSize: 10 }}>
                    ({meta.badge})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 代行が見つかっていなくても、まず「欠勤」だけ登録できるようにする。
          代行を探すか (代行未定)、探さずに残りの担当者で回すか (代行なし)
          を選ぶ。同じ状態で登録済みなら押しても変わらないので出さない
          (取り消しは下の「欠勤を取り消す」)。 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "6px 10px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        {subState(current) !== SUB_STATE.PENDING && (
          <button
            type="button"
            onClick={() => {
              onAssign(originalTeacher, "", "requested");
              onClose();
            }}
            style={{
              ...S.btn(false),
              width: "100%",
              fontSize: 11,
              padding: "5px 8px",
              color: colors.danger,
              borderColor: colors.danger,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ❗ 代行未定のまま欠勤にする
          </button>
        )}
        {/* 「残りの担当者で回す」は複数人で担当するコマだけ。1 人担当の
            コマで代行を立てないなら休講・回数補正の話になる。 */}
        {isMultiTeacher && subState(current) !== SUB_STATE.NOSUB && (
          <button
            type="button"
            onClick={() => {
              onAssign(originalTeacher, "", "confirmed");
              onClose();
            }}
            title="代行を立てず、このコマの残りの担当者で回す"
            style={{
              ...S.btn(false),
              width: "100%",
              fontSize: 11,
              padding: "5px 8px",
              color: "#8a6a20",
              borderColor: "#d8b878",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            欠勤 (代行なし・残りの担当者で回す)
          </button>
        )}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="代行候補"
        aria-activedescendant={
          focusIdx >= 0 && focusIdx < list.length ? optionId(focusIdx) : undefined
        }
        style={{ padding: "4px 0" }}
      >
        {list.length === 0 ? (
          <div style={{ padding: "8px 10px", color: "#888" }}>
            候補が見つかりません
          </div>
        ) : (
          list.map((name, i) => {
            const isCurrent = name === currentSubstitute;
            const isPrimary = primary.includes(name);
            const isFocused = i === focusIdx;
            const bg = isFocused
              ? "#dcebff"
              : isCurrent
                ? "#e8f4ff"
                : "transparent";
            return (
              <button
                key={name}
                id={optionId(i)}
                role="option"
                aria-selected={isFocused}
                type="button"
                onClick={() => {
                  onAssign(originalTeacher, name, status);
                  onClose();
                }}
                onMouseEnter={() => setFocusIdx(i)}
                style={{
                  display: "flex",
                  width: "100%",
                  padding: "6px 10px",
                  border: "none",
                  background: bg,
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 12,
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: isPrimary ? 700 : 400 }}>{name}</span>
                {isPrimary && (
                  <span style={{ color: "#2a6a9e", fontSize: 10 }}>担当可</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {(currentSubstitute || hasSubEntry) && onClear && (
        <div
          style={{
            padding: "6px 10px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onClear(originalTeacher);
              onClose();
            }}
            style={{
              ...S.btn(false),
              fontSize: 11,
              padding: "4px 10px",
              color: colors.danger,
            }}
          >
            {currentSubstitute ? "代行を解除" : "欠勤を取り消す"}
          </button>
        </div>
      )}
    </div>
  );
}
