// @vitest-environment jsdom
// ダッシュボードの「今後7日の休暇 (有給・半休)」: 1 行ずつ押すとその人・その日を
// 直す欄へ、「＋ 入れる」で人と日を選ぶ欄へ飛ぶ (onOpenLeave に渡す)、を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EventSummaryCards } from "./EventSummaryCards";

afterEach(cleanup);

const leaveSoon = [
  { date: "2026-10-19", records: [{ id: 1, name: "石原", date: "2026-10-19", kind: "full", memo: "通院" }] },
  { date: "2026-10-20", records: [{ id: 2, name: "堀上", date: "2026-10-20", kind: "am" }] },
];

describe("EventSummaryCards — 今後7日の休暇", () => {
  it("休暇の 1 行・「＋ 入れる」から有給・半休の画面へ", () => {
    const onOpenLeave = vi.fn();
    render(<EventSummaryCards todayStr="2026-10-16" leaveSoon={leaveSoon} onOpenLeave={onOpenLeave} />);
    expect(screen.getByText("今後7日の休暇 (有給・半休)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /10\/19 \(月\) 石原 有給 \(通院\)/ }));
    expect(onOpenLeave).toHaveBeenLastCalledWith({ name: "石原", date: "2026-10-19" });
    fireEvent.click(screen.getByRole("button", { name: "＋ 入れる" }));
    expect(onOpenLeave).toHaveBeenLastCalledWith({});
  });

  it("導線が無ければ (閲覧者) 文字だけ", () => {
    render(<EventSummaryCards todayStr="2026-10-16" leaveSoon={leaveSoon} />);
    expect(screen.getByText(/10\/19 \(月\) 石原 有給/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EventSummaryCards — 今後7日の不在 (講師の不在期間、P2-6)", () => {
  const awaySoon = [
    { id: 1, teacher: "福武", startDate: "2026-10-12", endDate: "2026-10-22", memo: "研修" },
    { id: 2, teacher: "川井", startDate: "2026-10-20", endDate: "2026-10-20" },
  ];

  it("不在期間の 1 行から不在期間の画面のその 1 件へ (紙には出さない)", () => {
    const onOpenTeacherAway = vi.fn();
    const { container } = render(
      <EventSummaryCards todayStr="2026-10-16" awaySoon={awaySoon} onOpenTeacherAway={onOpenTeacherAway} />
    );
    expect(screen.getByText("🧳 今後7日の不在")).toBeInTheDocument();
    expect(container.firstChild.className).toMatch(/no-print/);
    fireEvent.click(screen.getByRole("button", { name: "福武 不在 10/12〜10/22 (研修)" }));
    expect(onOpenTeacherAway).toHaveBeenCalledWith({ id: 1 });
    expect(screen.getByRole("button", { name: "川井 不在 10/20 (これから)" })).toBeInTheDocument();
  });

  it("導線が無くても文字で出す (閲覧者も見られる)", () => {
    render(<EventSummaryCards todayStr="2026-10-16" awaySoon={awaySoon} />);
    expect(screen.getByText("福武 不在 10/12〜10/22 (研修)")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
