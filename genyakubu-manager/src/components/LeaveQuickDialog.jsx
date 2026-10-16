import { useMemo } from "react";
import { Modal } from "./Modal";
import { LeaveEditor } from "./LeaveEditor";
import { useSessionCtx } from "../hooks/useSessionCtx";
import { indexLeaveRecords, leaveKey } from "../utils/staffLeave";
import { leaveClassCheck } from "../utils/leaveClassCheck";
import { isFullDayHoliday } from "../utils/scheduleHelpers";

// ─── 講師の月間から 1 日の有給・半休を入れるダイアログ ───────────────
// 講師別の月間カレンダーの日付の 🌴 (その講師が現役部 常勤のとき) / 🌴有給 の
// 印から開く。中身は有給・半休の画面と同じ入力欄 (LeaveEditor)。種類を押して
// 保存したら閉じる (期間でまとめて入れたときも同じ)。
// 授業がある日に代行・欠勤の登録が無ければ、入力欄が知らせて欠勤登録へつなぐ。

export function LeaveQuickDialog({
  name,
  date,
  staffLeave,
  onSave,
  slots,
  subs,
  adjustments,
  holidays,
  examPeriods,
  specialEvents,
  timetables,
  displayCutoff,
  classSets,
  biweeklyAnchors,
  sessionOverrides,
  daySchedules,
  onRegisterAbsence,
  onOpenLeaveView,
  onClose,
}) {
  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    specialEvents,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });
  const record = useMemo(
    () => indexLeaveRecords(staffLeave?.records).get(leaveKey(name, date)) || null,
    [staffLeave, name, date]
  );
  const classCheck = useMemo(
    () => leaveClassCheck({ name, date, slots, subs, adjustments, ctx: sessionCtx }),
    [name, date, slots, subs, adjustments, sessionCtx]
  );
  const holidayLabel = (holidays || []).find((h) => h.date === date && isFullDayHoliday(h))?.label;

  return (
    <Modal title="🌴 有給・半休" onClose={onClose} width="min(640px, 96vw)">
      <LeaveEditor
        key={`${name}|${date}`}
        idPrefix="leave-quick"
        name={name}
        date={date}
        record={record}
        leave={staffLeave}
        onSave={onSave}
        classCheck={classCheck}
        holidayLabel={holidayLabel}
        onRegisterAbsence={
          onRegisterAbsence
            ? (init) => {
                onClose();
                onRegisterAbsence(init);
              }
            : undefined
        }
        onApplied={() => onClose()}
      />
      {onOpenLeaveView && (
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <button
            type="button"
            className="inline-activate"
            onClick={() => {
              onClose();
              onOpenLeaveView();
            }}
            style={{
              border: "none",
              background: "none",
              color: "#2e6a9e",
              cursor: "pointer",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            有給・半休の画面で月の表と年度のまとめを見る →
          </button>
        </div>
      )}
    </Modal>
  );
}
