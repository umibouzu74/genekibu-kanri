// @vitest-environment jsdom
// 授業時間の集計 (旧「講師比較」)。期間内に講師ごとに教えた分を一覧する。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TeachingMinutesView } from "./TeachingMinutesView";

const slots = [
  { id: 1, day: "月", time: "19:00-20:20", grade: "中2", cls: "A", subj: "数学", teacher: "奥村", note: "" },
  { id: 2, day: "火", time: "19:00-19:45", grade: "中3", cls: "A", subj: "英語", teacher: "河野", note: "" },
];

function setPeriod(start, end) {
  fireEvent.change(screen.getByLabelText("開始日"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("終了日"), { target: { value: end } });
}

describe("TeachingMinutesView", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("期間内に授業のあった全員の分を出し、講師ボタンで絞り込める", () => {
    render(<TeachingMinutesView slots={slots} />);
    // 2026-09-07 (月) 〜 2026-09-13: 奥村 80 分 / 河野 45 分
    setPeriod("2026-09-07", "2026-09-13");
    const table = screen.getByRole("table");
    expect(within(table).getByText("奥村")).toBeTruthy();
    expect(within(table).getAllByText("80 分").length).toBeGreaterThan(0);
    // 合計行
    expect(within(table).getAllByText("125 分").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "河野", pressed: false }));
    const t2 = screen.getByRole("table");
    expect(within(t2).queryByText("奥村")).toBeNull();
    expect(within(t2).getAllByText("45 分").length).toBeGreaterThan(0);
  });

  it("代行は代行者の時間になる", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
    ];
    render(<TeachingMinutesView slots={slots} subs={subs} />);
    setPeriod("2026-09-07", "2026-09-07");
    const table = screen.getByRole("table");
    expect(within(table).getByText("福江")).toBeTruthy();
    expect(within(table).queryByText("奥村")).toBeNull();
    expect(within(table).getByRole("columnheader", { name: "代行" })).toBeTruthy();
  });
});
