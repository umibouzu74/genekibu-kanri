// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPrepTsvDialog } from "./ExamPrepTsvDialog";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

const EP = { id: 1, name: "2学期期末特訓", startDate: "2026-11-17", endDate: "2026-11-26" };
const P4 = [
  { no: 1, start: "18:00", end: "18:50" },
  { no: 2, start: "19:00", end: "19:50" },
];
const SCHEDULE = { examPeriodId: 1, days: [{ date: "2026-11-19", periods: P4, assignments: { 石原: [1] } }] };

describe("ExamPrepTsvDialog (C2)", () => {
  it("書き出した表を出し、貼った表を確認してから 1 回で置き換える", () => {
    const crud = { replaceDays: vi.fn(), restoreDays: vi.fn() };
    render(
      <ToastProvider render={() => null}>
        <ExamPrepTsvDialog examPeriod={EP} schedule={SCHEDULE} candidateNames={["石原", "半田"]} crud={crud} onClose={() => {}} />
      </ToastProvider>
    );
    expect(screen.getByLabelText("書き出した表 (TSV)").value).toContain("11/19 (木)\t石原\t1");
    const apply = screen.getByRole("button", { name: "置き換える" });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText("貼り付ける表 (TSV)"), {
      target: { value: "日付\t講師\t校時\t来る\t帰る\n11/19\t半田\t1-2\t18:30\t19:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(screen.getByText(/置き換える日: 1 日/)).toBeInTheDocument();
    expect(screen.getByText(/追加 半田/)).toBeInTheDocument();
    fireEvent.click(apply);
    expect(crud.replaceDays).toHaveBeenCalledWith(1, [
      { date: "2026-11-19", periods: P4, assignments: { 半田: [1, 2] }, staffTimes: { 半田: { from: "18:30", to: "19:30" } } },
    ]);
  });
});
