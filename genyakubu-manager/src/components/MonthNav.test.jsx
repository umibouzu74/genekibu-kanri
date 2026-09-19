// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonthNav } from "./MonthNav";

afterEach(cleanup);

function renderNav(props = {}) {
  const fns = { onPrev: vi.fn(), onNext: vi.fn(), onToday: vi.fn(), onPick: vi.fn() };
  const utils = render(<MonthNav year={2026} month={9} {...fns} {...props} />);
  return { ...utils, ...fns };
}

describe("MonthNav", () => {
  it("◀ ▶ 今月 とピッカーがそれぞれの callback を呼び、年月を aria-live で出す", () => {
    const { onPrev, onNext, onToday, onPick } = renderNav();
    const label = screen.getByText("2026年9月");
    expect(label.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    fireEvent.click(screen.getByRole("button", { name: "今月" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
    const picker = screen.getByLabelText("表示する月");
    expect(picker.value).toBe("2026-09");
    fireEvent.change(picker, { target: { value: "2027-02" } });
    expect(onPick).toHaveBeenCalledWith("2027-02");
  });

  it("title はショートカットを添えた文言。操作だけ no-print で年月は紙面に残す", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "前の月" }).getAttribute("title")).toBe("前の月 (←)");
    expect(screen.getByRole("button", { name: "次の月" }).getAttribute("title")).toBe("次の月 (→)");
    expect(screen.getByRole("button", { name: "今月" }).getAttribute("title")).toBe("今月 (t)");
    expect(screen.getByLabelText("表示する月").getAttribute("title")).toBe(
      "表示する月を選ぶ (← / → で前後の月、t で今月)"
    );
    for (const el of [
      ...screen.getAllByRole("button"),
      screen.getByLabelText("表示する月"),
    ]) {
      expect(el.className).toContain("no-print");
    }
    expect(screen.getByText("2026年9月").className).not.toContain("no-print");
  });

  it("isCurrent で「今月」が強調され、label で年月の表示を差し替えられる", () => {
    const { rerender } = renderNav({ isCurrent: false });
    const plain = screen.getByRole("button", { name: "今月" }).style.background;
    rerender(<MonthNav year={2026} month={9} isCurrent label="2026年9月 (堀上)" />);
    expect(screen.getByRole("button", { name: "今月" }).style.background).not.toBe(plain);
    expect(screen.getByText("2026年9月 (堀上)")).toBeTruthy();
  });
});
