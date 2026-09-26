// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StaffAttendanceCalendar } from "./StaffAttendanceCalendar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const props = {
  year: 2026,
  month: 9,
  regularDates: ["2026-09-01", "2026-09-03", "2026-09-08"],
  workDates: ["2026-09-03", "2026-09-05"],
  absenceDates: ["2026-09-08"],
  pendingAbsenceDates: [],
};

const cellOf = (ds) => screen.getByRole("listitem", { name: new RegExp(`^${ds} `) });

describe("StaffAttendanceCalendar", () => {
  it("月の日数ぶんのセルを出し、日ごとの状態を読み上げ名に載せる", () => {
    render(<StaffAttendanceCalendar {...props} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(cellOf("2026-09-01").getAttribute("aria-label")).toBe(
      "2026-09-01 (火): 通常出勤日"
    );
    // 状態が無い日は日付だけ
    expect(cellOf("2026-09-02").getAttribute("aria-label")).toBe("2026-09-02 (水)");
  });

  it("1 日に複数の状態が重なるときは強い方で塗り、全部を読み上げ名に出す", () => {
    render(<StaffAttendanceCalendar {...props} />);
    // 通常出勤 + 代行出勤 → 代行出勤が先 (KINDS の順)
    const d3 = cellOf("2026-09-03");
    expect(d3.dataset.kinds).toBe("work regular");
    expect(d3.getAttribute("aria-label")).toBe("2026-09-03 (木): 代行出勤日・通常出勤日");
    // 代行された日は取消線
    expect(cellOf("2026-09-08").style.textDecoration).toBe("line-through");
  });

  it("件数の凡例を出す。欠勤・代行未定は 0 日なら出さない", () => {
    const { rerender } = render(<StaffAttendanceCalendar {...props} />);
    expect(screen.getByText("通常出勤日").nextSibling.textContent).toBe("3日");
    expect(screen.getByText("代行出勤日").nextSibling.textContent).toBe("2日");
    expect(screen.getByText("代行された日").nextSibling.textContent).toBe("1日");
    expect(screen.queryByText("欠勤・代行未定")).toBeNull();

    rerender(
      <StaffAttendanceCalendar {...props} pendingAbsenceDates={["2026-09-10"]} />
    );
    expect(screen.getByText("欠勤・代行未定").nextSibling.textContent).toBe("1日");
    expect(screen.getByText("※ 代行者を探し中")).toBeInTheDocument();
  });

  it("「日付を一覧で見る」で従来の日付の羅列を開ける", () => {
    render(<StaffAttendanceCalendar {...props} />);
    expect(screen.queryByText(/2026-09-05 \(土\)/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "日付を一覧で見る" }));
    expect(screen.getByText(/2026-09-03 \(木\)、2026-09-05 \(土\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "日付の一覧を閉じる" }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("今日のセルに枠を付ける", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 3, 10, 0, 0));
    render(<StaffAttendanceCalendar {...props} />);
    expect(cellOf("2026-09-03").style.outline).toContain("solid");
    expect(cellOf("2026-09-04").style.outline).toBe("none");
  });
});
