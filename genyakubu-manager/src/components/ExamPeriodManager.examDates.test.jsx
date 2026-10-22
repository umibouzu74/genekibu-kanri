// @vitest-environment jsdom
// テスト期間の「考査日 (任意・表示用)」: カレンダーで選び、終了日が最後の考査日
// より前なら保存を止め (自動では伸ばさない)、「終了日を最後の考査日に合わせる」で
// 直せる。空ならキーごと持たない。一覧に「発表 → 考査」を出す。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExamPeriodManager } from "./ExamPeriodManager";
import { ConfirmProvider } from "../hooks/useConfirm";
import { ToastProvider } from "../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CHUKAN = {
  id: 1,
  name: "桜井2学期中間",
  startDate: "2026-10-06",
  endDate: "2026-10-16",
  targetGrades: ["高1", "高2", "高3"],
  stopsClasses: false,
  tags: ["桜井"],
  examDates: ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  source: "2026桜井年間行事計画",
};

function renderManager(examPeriods = [CHUKAN]) {
  const onSave = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ExamPeriodManager examPeriods={examPeriods} onSave={onSave} isAdmin />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

const openCalendar = () => {
  fireEvent.click(screen.getByRole("button", { name: "📅 カレンダーで選ぶ" }));
  return screen.getByRole("group", { name: "考査日をカレンダーで選ぶ" });
};

describe("テスト期間の考査日", () => {
  it("一覧に「発表 → 考査」を出す", () => {
    renderManager();
    expect(screen.getByText("発表 10/6 → 考査 10/13〜16（4日）")).toBeTruthy();
  });

  it("編集で考査日を外すと examDates のキーごと消える (出典は残す)", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText("桜井2学期中間 を編集"));
    fireEvent.click(screen.getByRole("button", { name: "すべて外す" }));
    fireEvent.click(screen.getByText("更新"));
    const saved = onSave.mock.calls[0][0][0];
    expect(saved).not.toHaveProperty("examDates");
    expect(saved.source).toBe("2026桜井年間行事計画");
  });

  it("新規: 開始日より前の日は選べない。終了日が最後の考査日より前なら保存を止め、ボタンで合わせる", () => {
    const { onSave } = renderManager([]);
    fireEvent.change(screen.getByPlaceholderText("名称（例: 1学期中間テスト期間）"), {
      target: { value: "第一2学期期末" },
    });
    const [start, end] = screen.getAllByDisplayValue("");
    fireEvent.change(start, { target: { value: "2026-11-25" } });
    fireEvent.change(end, { target: { value: "2026-12-02" } });
    const cal = openCalendar();
    expect(within(cal).getByRole("button", { name: "2026-11-24 (火)" }).disabled).toBe(true);
    // 11 月 → 12 月へ
    fireEvent.click(within(cal).getByRole("button", { name: "次の月" }));
    for (const d of ["2026-12-02 (水)", "2026-12-04 (金)", "2026-12-08 (火)"]) {
      fireEvent.click(within(cal).getByRole("button", { name: d }));
    }
    expect(screen.getByText(/12\/2 \(水\)・12\/4 \(金\)・12\/8 \(火\) \(3日\)/)).toBeTruthy();
    fireEvent.click(screen.getByText("追加"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("終了日が最後の考査日 (12/8) より前です");

    fireEvent.click(screen.getByRole("button", { name: "終了日を最後の考査日 (12/8) に合わせる" }));
    fireEvent.click(screen.getByText("追加"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      name: "第一2学期期末",
      startDate: "2026-11-25",
      endDate: "2026-12-08",
      examDates: ["2026-12-02", "2026-12-04", "2026-12-08"],
    });
  });
});
