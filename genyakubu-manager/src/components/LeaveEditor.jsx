import { useState } from "react";
import { useToasts } from "../hooks/useToasts";
import { S, colors } from "../styles/common";
import { fmtMDWeekday } from "../utils/dateHelpers";
import {
  LEAVE_KINDS,
  leaveKindMeta,
  leaveRangeDates,
  leaveRecordsFor,
  restoreLeaveRecords,
  setLeaveForDates,
} from "../utils/staffLeave";
import { classCheckText } from "../utils/leaveClassCheck";
import { LEAVE_SEVERITY_TONE, leaveKindChip } from "../styles/leave";

// ─── 1 人 × 1 日の有給・半休を入れる欄 ─────────────────────────────
// 有給・半休の画面 (LeaveView。月の表のマスを押した下) と、講師の月間の 🌴 から
// 開くダイアログ (LeaveQuickDialog) で共有する。種類のボタンを押せば保存
// (「期間でまとめて入れる」なら何日も)。入れ直し・消すは 6 秒の「元に戻す」で、
// 控えた (人, 日) だけを戻す (restoreLeaveRecords)。
//
// 呼び出し側は (name, date) が変わったら key で作り直す (メモ・期間の入力を
// 前の人・日から持ち越さない)。

/**
 * @param {object} props
 * @param {string} props.name
 * @param {string} props.date            "YYYY-MM-DD"
 * @param {object|null} props.record     その日の今の記録 (無ければ null)
 * @param {object} props.leave           今の保存値 ({records, grants}。「元に戻す」で控える)
 * @param {Function} props.onSave        useSyncedStorage の setter (updater を渡す)
 * @param {object|null} props.classCheck leaveClassCheck の戻り値
 * @param {string} [props.holidayLabel]  塾の全体休講日ならその名前
 * @param {Function} [props.onRegisterAbsence] ({teachers, date}) 複数日の欠勤登録を開く
 * @param {Function} [props.onClose]
 * @param {Function} [props.onApplied]   保存した後 (ダイアログを閉じるなど)
 */
export function LeaveEditor({
  name,
  date,
  record,
  leave,
  onSave,
  classCheck,
  holidayLabel,
  onRegisterAbsence,
  onClose,
  onApplied,
  idPrefix = "leave",
}) {
  const toasts = useToasts();
  const [memo, setMemo] = useState(record?.memo || "");
  const [useRange, setUseRange] = useState(false);
  const [rangeTo, setRangeTo] = useState(date);
  const [skipSundays, setSkipSundays] = useState(true);

  const rangeInfo = useRange ? leaveRangeDates(date, rangeTo || date, { skipSundays }) : null;
  const targetDates = () =>
    useRange
      ? leaveRangeDates(date, rangeTo || date, { skipSundays })
      : { dates: [date], errors: [] };

  // 入れる / 消す。控えておいた (人, 日) だけを「元に戻す」で戻す
  const apply = (kind) => {
    const { dates: ds, errors } = targetDates();
    if (errors.length > 0) {
      toasts.error(errors[0]);
      return;
    }
    const before = leaveRecordsFor(leave, name, ds);
    if (!kind && before.length === 0) return;
    onSave((prev) => setLeaveForDates(prev, { name, dates: ds, kind, memo }));
    const what = kind ? leaveKindMeta(kind).label : "休暇";
    const when =
      ds.length === 1
        ? fmtMDWeekday(ds[0])
        : `${fmtMDWeekday(ds[0])} 〜 ${fmtMDWeekday(ds[ds.length - 1])} の ${ds.length} 日`;
    toasts.push(`${name}: ${when} ${kind ? `を「${what}」にしました` : `の${what}を消しました`}`, {
      tone: kind ? "success" : "info",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => onSave((prev) => restoreLeaveRecords(prev, name, ds, before)),
      },
    });
    if (!kind) setMemo("");
    onApplied?.(kind);
  };

  const saveMemo = () => {
    if (!record || useRange) return;
    if ((record.memo || "") === memo.trim()) return;
    onSave((prev) => setLeaveForDates(prev, { name, dates: [date], kind: record.kind, memo }));
    toasts.success("メモを保存しました");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>
          {fmtMDWeekday(date)} {name}
        </b>
        {record && !useRange && (
          <span style={leaveKindChip(leaveKindMeta(record.kind))}>
            いま: {leaveKindMeta(record.kind).label}
          </span>
        )}
        {holidayLabel && (
          <span style={{ fontSize: 12, color: "#c44" }}>(塾の休講日: {holidayLabel})</span>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{ ...S.btn(false), padding: "2px 10px", fontSize: 12, marginLeft: "auto" }}
          >
            ✕ 閉じる
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {LEAVE_KINDS.map((k) => {
          const current = !useRange && record?.kind === k.key;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={current}
              onClick={() => apply(k.key)}
              title={k.desc}
              style={{
                ...S.btn(false),
                padding: "6px 14px",
                fontSize: 13,
                background: current ? k.tone.fg : k.tone.bg,
                color: current ? "#fff" : k.tone.fg,
                border: `1px solid ${k.tone.border}`,
              }}
            >
              {k.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => apply(null)}
          disabled={useRange ? false : !record}
          style={{ ...S.btn(false), padding: "6px 14px", fontSize: 13, color: colors.danger }}
        >
          消す
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, fontWeight: 700 }} htmlFor={`${idPrefix}-memo`}>
          メモ
        </label>
        <input
          id={`${idPrefix}-memo`}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={saveMemo}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveMemo();
            }
          }}
          placeholder="任意 (夏休み・通院・17 時まで など)"
          style={{ ...S.input, width: 280, padding: "5px 8px", fontSize: 13, background: "#fff" }}
        />
        {record && !useRange && (
          <span style={{ fontSize: 11, color: colors.inkMuted }}>Enter / 欄の外で保存</span>
        )}
      </div>

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}
      >
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={useRange}
            onChange={(e) => setUseRange(e.target.checked)}
          />
          期間でまとめて入れる
        </label>
        {useRange && (
          <>
            <span>{fmtMDWeekday(date)} から</span>
            <input
              type="date"
              value={rangeTo}
              min={date}
              onChange={(e) => setRangeTo(e.target.value)}
              aria-label="期間の終わりの日"
              style={{
                ...S.input,
                width: "auto",
                padding: "4px 6px",
                fontSize: 13,
                background: "#fff",
              }}
            />
            <span>まで</span>
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={skipSundays}
                onChange={(e) => setSkipSundays(e.target.checked)}
              />
              日曜を除く
            </label>
            <span
              style={{
                fontSize: 12,
                color: rangeInfo?.errors.length ? colors.danger : colors.inkMuted,
              }}
            >
              {rangeInfo?.errors.length
                ? rangeInfo.errors[0]
                : `${rangeInfo?.dates.length || 0} 日に入れます (種類のボタンを押す)`}
            </span>
          </>
        )}
      </div>

      {!useRange && classCheck && (
        <div
          role="note"
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 6,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            ...(classCheck.open > 0
              ? {
                  background: LEAVE_SEVERITY_TONE.warn.bg,
                  color: LEAVE_SEVERITY_TONE.warn.fg,
                  border: `1px solid ${LEAVE_SEVERITY_TONE.warn.border}`,
                }
              : {
                  background: "#fff",
                  color: colors.inkMuted,
                  border: `1px solid ${colors.border}`,
                }),
          }}
        >
          <span>📚 {classCheckText(classCheck)}</span>
          {classCheck.open > 0 && record?.kind === "am" && (
            <span>(午前半休なら授業にかかるかは時間しだい)</span>
          )}
          {classCheck.open - classCheck.incoming > 0 && onRegisterAbsence && (
            <button
              type="button"
              onClick={() => onRegisterAbsence({ teachers: [name], date })}
              style={{ ...S.btn(true), padding: "3px 10px", fontSize: 12 }}
            >
              欠勤を登録…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
