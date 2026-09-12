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

  it("欠勤組み換えへのジャンプは渡したときだけ出て、表示日を渡す", () => {
    const onJumpToAbsenceFlow = vi.fn();
    renderNav({ onJumpToAbsenceFlow });
    fireEvent.click(screen.getByRole("button", { name: /この日の欠勤組み換え/ }));
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-09-12");
    cleanup();
    renderNav();
    expect(screen.queryByRole("button", { name: /欠勤組み換え/ })).toBeNull();
  });
});
