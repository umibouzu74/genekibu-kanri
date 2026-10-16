// @vitest-environment jsdom
// テスト期間の対象学年: 共通学年 (附中の確認テストなど) をそれ自体で選べる。
// 対象学年は完全一致で効くので、附中 1〜3 を選んでも学年「附中」のコマは止まらない。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPeriodManager } from "./ExamPeriodManager";
import { ConfirmProvider } from "../hooks/useConfirm";
import { ToastProvider } from "../hooks/useToasts";
import { examPeriodStopsClassesOn } from "../utils/scheduleHelpers";

afterEach(cleanup);

const SLOTS = [
  { id: 1, day: "水", time: "21:00-21:30", grade: "附中", cls: "", room: "", subj: "確認テスト", teacher: "B", note: "" },
  { id: 2, day: "土", time: "15:00-16:20", grade: "中1-3", cls: "", room: "", subj: "プレップ", teacher: "C", note: "" },
];

function renderManager() {
  const onSave = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ExamPeriodManager examPeriods={[]} onSave={onSave} isAdmin slots={SLOTS} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

describe("ExamPeriodManager の対象学年", () => {
  it("附中を足すと 11/18 の附中 確認テストが休止になり、中1-3 のプレップは止まらない", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByPlaceholderText(/名称/), { target: { value: "２学期期末特訓" } });
    const [start, end] = screen.getAllByDisplayValue("").filter((el) => el.type === "date");
    fireEvent.change(start, { target: { value: "2026-11-17" } });
    fireEvent.change(end, { target: { value: "2026-11-26" } });
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    for (const g of ["中1", "中2", "中3", "附中1", "附中2", "附中3", "附中"]) {
      fireEvent.click(screen.getByLabelText(g));
    }
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    const ep = onSave.mock.calls[0][0][0];
    expect(ep.targetGrades).toContain("附中");
    expect(ep.targetGrades).not.toContain("中1-3");
    expect(examPeriodStopsClassesOn(ep, "2026-11-18", "附中")).toBe(true);
    expect(examPeriodStopsClassesOn(ep, "2026-11-21", "中1-3")).toBe(false);
  });

  it("全解除のままでは登録しない", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByPlaceholderText(/名称/), { target: { value: "テスト" } });
    const [start, end] = screen.getAllByDisplayValue("").filter((el) => el.type === "date");
    fireEvent.change(start, { target: { value: "2026-11-17" } });
    fireEvent.change(end, { target: { value: "2026-11-26" } });
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
