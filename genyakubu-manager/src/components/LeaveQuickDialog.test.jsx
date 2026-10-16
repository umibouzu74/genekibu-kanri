// @vitest-environment jsdom
// 講師の月間の 🌴 から開く有給・半休の入力: 種類を押すと保存して閉じる・
// 授業があって欠勤の登録が無ければ知らせて欠勤登録へつなぐ。
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeaveQuickDialog } from "./LeaveQuickDialog";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

// 2026-10-21 は水曜。石原に水曜 1 コマ
const slots = [
  {
    id: 1,
    day: "水",
    time: "16:25-17:25",
    grade: "附中2",
    cls: "-",
    room: "402",
    subj: "英語",
    teacher: "石原",
    note: "",
  },
];

function Harness({ onSaveSpy, onClose, onRegisterAbsence, initial = { records: [], grants: [] } }) {
  const [leave, setLeave] = useState(initial);
  return (
    <LeaveQuickDialog
      name="石原"
      date="2026-10-21"
      staffLeave={leave}
      onSave={(next) =>
        setLeave((prev) => {
          const v = typeof next === "function" ? next(prev) : next;
          onSaveSpy?.(v);
          return v;
        })
      }
      slots={slots}
      subs={[]}
      adjustments={[]}
      holidays={[]}
      timetables={[{ id: 1, name: "2026", startDate: "2026-04-01" }]}
      onRegisterAbsence={onRegisterAbsence}
      onClose={onClose}
    />
  );
}

const renderDialog = (props) =>
  render(
    <ToastProvider>
      <Harness {...props} />
    </ToastProvider>
  );

describe("LeaveQuickDialog", () => {
  it("種類を押すと保存して閉じる", () => {
    const onSaveSpy = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onSaveSpy, onClose });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "通院" } });
    fireEvent.click(screen.getByRole("button", { name: "有給" }));
    expect(onSaveSpy).toHaveBeenLastCalledWith({
      records: [{ id: 1, name: "石原", date: "2026-10-21", kind: "full", memo: "通院" }],
      grants: [],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("授業があって代行・欠勤の登録が無ければ知らせ、欠勤登録を開ける", () => {
    const onRegisterAbsence = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onRegisterAbsence, onClose });
    expect(screen.getByRole("note")).toHaveTextContent("代行・欠勤の登録なし 1 コマ");
    fireEvent.click(screen.getByRole("button", { name: "欠勤を登録…" }));
    expect(onClose).toHaveBeenCalled();
    expect(onRegisterAbsence).toHaveBeenCalledWith({ teachers: ["石原"], date: "2026-10-21" });
  });
});
