// @vitest-environment jsdom
// ヘッダの「今の時間割」の表示 (読むだけ)。今日の日付で決まる時間割の名前と、
// 期と期の間なら次の期 (開始前) / 最後の期 (終了) を出す。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CurrentTimetableBadge } from "./CurrentTimetableBadge";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TERM1 = {
  id: 1,
  name: "1学期",
  type: "regular",
  startDate: "2026-04-01",
  endDate: "2026-07-20",
  grades: [],
};
const TERM2 = {
  id: 2,
  name: "2学期",
  type: "regular",
  startDate: "2026-09-01",
  endDate: "2027-03-20",
  grades: [],
};
const SLOTS = [
  {
    id: 1,
    day: "月",
    time: "19:00-20:20",
    grade: "中1",
    cls: "S",
    room: "",
    subj: "英語",
    teacher: "A",
    note: "",
    timetableId: 1,
  },
  {
    id: 2,
    day: "月",
    time: "19:00-20:20",
    grade: "中1",
    cls: "S",
    room: "",
    subj: "英語",
    teacher: "B",
    note: "",
    timetableId: 2,
  },
];

describe("CurrentTimetableBadge", () => {
  it("期の途中は今日有効な時間割の名前だけ", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
    render(<CurrentTimetableBadge slots={SLOTS} timetables={[TERM1, TERM2]} />);
    expect(screen.getByRole("status")).toHaveAccessibleName("今の時間割: 2学期");
  });

  it("期と期の間は次の期を開始日つきで、次が無ければ最後の期を終了日つきで出す", () => {
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); // 夏休み (8/10)
    const { unmount } = render(<CurrentTimetableBadge slots={SLOTS} timetables={[TERM1, TERM2]} />);
    expect(screen.getByRole("status")).toHaveAccessibleName("今の時間割: 2学期（9/1〜）");
    unmount();
    vi.setSystemTime(new Date(2027, 2, 30, 12, 0, 0)); // 年度末 (次の年度は未作成)
    render(<CurrentTimetableBadge slots={SLOTS} timetables={[TERM1, TERM2]} />);
    expect(screen.getByRole("status")).toHaveAccessibleName("今の時間割: 2学期（〜3/20 終了）");
  });

  it("押すと時間割管理を開く。時間割が 1 つなら何も出さない", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
    const onOpen = vi.fn();
    const { unmount } = render(
      <CurrentTimetableBadge slots={SLOTS} timetables={[TERM1, TERM2]} onOpenTimetables={onOpen} />
    );
    fireEvent.click(screen.getByRole("button", { name: "今の時間割: 2学期" }));
    expect(onOpen).toHaveBeenCalled();
    unmount();
    const { container } = render(<CurrentTimetableBadge slots={SLOTS} timetables={[TERM2]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
