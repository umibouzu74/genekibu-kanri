// @vitest-environment jsdom
// 日付の数字 → ダッシュボード / 🚑 → 欠勤組み換え。読み上げ名と title は
// 同じ文言で、DashboardDateNav / DashDayRow とも揃える
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DayNumberLegend, DayNumberLink } from "./DayNumberLink";

afterEach(cleanup);

describe("DayNumberLink", () => {
  it("aria-label と title は同じ文言 (曜日つきの日付)", () => {
    const onSelectDate = vi.fn();
    const onJumpToAbsenceFlow = vi.fn();
    render(
      <DayNumberLink
        d={7}
        ds="2026-12-07"
        onSelectDate={onSelectDate}
        onJumpToAbsenceFlow={onJumpToAbsenceFlow}
      />
    );
    const day = screen.getByRole("button", { name: "2026-12-07 (月) をダッシュボードで見る" });
    expect(day.getAttribute("title")).toBe("2026-12-07 (月) をダッシュボードで見る");
    expect(day.textContent).toBe("7");
    const abs = screen.getByRole("button", { name: "2026-12-07 (月) の欠勤組み換えを開く" });
    expect(abs.getAttribute("title")).toBe("2026-12-07 (月) の欠勤組み換えを開く");
    fireEvent.click(day);
    fireEvent.click(abs);
    expect(onSelectDate).toHaveBeenCalledWith("2026-12-07");
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-12-07");
  });

  it("🚑 は no-print、両方のボタンは inline-activate (モバイル 40px 規則の対象外)、外殻は day-number-link", () => {
    const { container } = render(
      <DayNumberLink d={7} ds="2026-12-07" onSelectDate={() => {}} onJumpToAbsenceFlow={() => {}} />
    );
    expect(container.querySelector(".day-number-link")).not.toBeNull();
    const [day, abs] = container.querySelectorAll("button");
    expect(day.className).toContain("inline-activate");
    expect(abs.className).toContain("inline-activate");
    expect(abs.className).toContain("no-print");
    expect(abs.className).toContain("day-number-absence");
    // 濃さは CSS (hover / focus-within) に任せるのでインラインでは決めない
    expect(abs.style.opacity).toBe("");
  });

  it("導線を渡さなければ数字は素の文字で、🚑 も出ない", () => {
    render(<DayNumberLink d={7} ds="2026-12-07" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("7")).toBeTruthy();
  });
});

describe("DayNumberLegend", () => {
  it("渡された導線ぶんだけ書き、何も無ければ描かない", () => {
    const { rerender, container } = render(
      <DayNumberLegend onSelectDate={() => {}} onJumpToAbsenceFlow={() => {}} />
    );
    expect(screen.getByTestId("day-number-legend").textContent).toBe(
      "日付クリック = その日のダッシュボード / 🚑 = 欠勤組み換え"
    );
    expect(screen.getByTestId("day-number-legend").className).toContain("no-print");
    rerender(<DayNumberLegend onSelectDate={() => {}} />);
    expect(screen.getByTestId("day-number-legend").textContent).toBe(
      "日付クリック = その日のダッシュボード"
    );
    rerender(<DayNumberLegend />);
    expect(container.firstChild).toBeNull();
  });
});
