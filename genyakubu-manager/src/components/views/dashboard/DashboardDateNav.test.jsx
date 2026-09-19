// @vitest-environment jsdom
// 時間割モードの「← 前 / 次 →」は日曜を飛ばす (月〜土の表なので日曜は
// 表せない。土曜から進めると表示日と曜日タブが別の週にずれていた)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardDateNav } from "./DashboardDateNav";

afterEach(cleanup);

function renderNav(props = {}) {
  const setStartDate = vi.fn();
  render(
    <DashboardDateNav
      startDate="2026-09-12" // 土
      setStartDate={setStartDate}
      daysInRange={7}
      changeDayCount={vi.fn()}
      todayStr="2026-09-12"
      isToday
      days={[{ dateStr: "2026-09-12", dow: "土" }]}
      viewMode="timetable"
      {...props}
    />
  );
  return setStartDate;
}

describe("DashboardDateNav", () => {
  it("時間割モードで土曜から「次 →」は月曜へ、月曜から「← 前」は土曜へ", () => {
    const set = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "次 →" }));
    expect(set).toHaveBeenLastCalledWith("2026-09-14");
    cleanup();
    const set2 = renderNav({ startDate: "2026-09-14" });
    fireEvent.click(screen.getByRole("button", { name: "← 前" }));
    expect(set2).toHaveBeenLastCalledWith("2026-09-12");
  });

  it("日別モードは日数ぶんそのまま送る (日曜も含む)", () => {
    const set = renderNav({ viewMode: "list", daysInRange: 1 });
    fireEvent.click(screen.getByRole("button", { name: "次 →" }));
    expect(set).toHaveBeenLastCalledWith("2026-09-13");
  });

  it("← / → / t キーでも「← 前」「次 →」「今日」と同じ日付へ動く", () => {
    const set = renderNav({ viewMode: "list", daysInRange: 7, startDate: "2026-09-14" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(set).toHaveBeenLastCalledWith("2026-09-21");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(set).toHaveBeenLastCalledWith("2026-09-07");
    fireEvent.keyDown(window, { key: "t" });
    expect(set).toHaveBeenLastCalledWith("2026-09-12");
    // 時間割モードは 1 日ずつ、日曜は飛ばす (ボタンと同じ)
    cleanup();
    const set2 = renderNav(); // 土曜、時間割モード
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(set2).toHaveBeenLastCalledWith("2026-09-14");
  });

  it("日付入力にフォーカスがある間は矢印キーで日付を送らない (入力の操作を妨げない)", () => {
    const set = renderNav();
    const input = document.querySelector('input[type="date"]');
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(set).not.toHaveBeenCalled();
  });

  it("欠勤組み換えへのジャンプは渡したときだけ出て、表示日を渡す (読み上げ名 = title)", () => {
    const onJumpToAbsenceFlow = vi.fn();
    renderNav({ onJumpToAbsenceFlow });
    const btn = screen.getByRole("button", { name: "2026-09-12 (土) の欠勤組み換えを開く" });
    expect(btn.getAttribute("title")).toBe("2026-09-12 (土) の欠勤組み換えを開く");
    expect(btn.textContent).toContain("この日の欠勤組み換え");
    fireEvent.click(btn);
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-09-12");
    cleanup();
    renderNav();
    expect(screen.queryByRole("button", { name: /欠勤組み換え/ })).toBeNull();
  });

  it("日付入力は見えている見出し (表示日 / 表示開始日) が label で、日付表示は aria-live", () => {
    renderNav();
    const input = screen.getByLabelText("表示日");
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-09-12");
    cleanup();
    renderNav({ viewMode: "list", daysInRange: 7 });
    expect(screen.getByLabelText("表示開始日").type).toBe("date");
    expect(document.querySelector('[aria-live="polite"]').textContent).toContain("2026-09-12");
  });
});
