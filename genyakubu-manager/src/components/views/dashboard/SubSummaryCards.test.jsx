// @vitest-environment jsdom
// ダッシュボードの要対応カード: 代行未定 / 依頼中 (今日以降) と過去の未処理を
// 分けて出し、クリックで代行一覧をその絞り込みで開く。今日・明日のカードは
// その日の欠勤組み換えへ飛ぶ (管理者だけ onJumpToAbsenceFlow を渡す)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubSummaryCards } from "./SubSummaryCards";

afterEach(cleanup);

const TODAY = "2026-09-16"; // 水
const SLOTS = [{ id: 1, time: "19:00-20:20", subj: "理科", grade: "中3", cls: "S" }];
const mk = (id, date, substitute, status) => ({
  id,
  date,
  slotId: 1,
  originalTeacher: "滝澤",
  substitute,
  status,
});

describe("SubSummaryCards", () => {
  it("代行未定 / 依頼中 / 過去の未処理を分けて数え、クリックで絞り込みを渡す", () => {
    const onJumpToSubs = vi.fn();
    render(
      <SubSummaryCards
        subs={[
          mk(1, "2026-09-20", "", "requested"),
          mk(2, "2026-09-21", "", "requested"),
          mk(3, "2026-09-22", "杉原", "requested"),
          mk(4, "2026-09-01", "", "requested"),
          mk(5, "2026-09-22", "", "confirmed"),
        ]}
        slots={SLOTS}
        todayStr={TODAY}
        onJumpToSubs={onJumpToSubs}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /代行未定 \(探し中/ }));
    expect(onJumpToSubs).toHaveBeenLastCalledWith("pending");
    fireEvent.click(screen.getByRole("button", { name: /依頼中 \(未確定/ }));
    expect(onJumpToSubs).toHaveBeenLastCalledWith("requested");
    fireEvent.click(screen.getByRole("button", { name: /過去の未処理/ }));
    expect(onJumpToSubs).toHaveBeenLastCalledWith("open");
    // 件数: 未定 2 / 依頼中 1 / 過去 1
    expect(screen.getByRole("button", { name: /代行未定 \(探し中/ }).textContent).toMatch(/2\s*件/);
    expect(screen.getByRole("button", { name: /依頼中 \(未確定/ }).textContent).toMatch(/1\s*件/);
    expect(screen.getByRole("button", { name: /過去の未処理/ }).textContent).toMatch(/1\s*件/);
  });

  it("今日 / 明日のカードは欠勤組み換えへ飛ぶ (渡したときだけ)", () => {
    const onJumpToAbsenceFlow = vi.fn();
    const { rerender } = render(
      <SubSummaryCards
        subs={[mk(1, TODAY, "杉原", "confirmed")]}
        slots={SLOTS}
        todayStr={TODAY}
        onJumpToAbsenceFlow={onJumpToAbsenceFlow}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /今日 \(水\) の代行/ }));
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith(TODAY);
    fireEvent.click(screen.getByRole("button", { name: /明日 \(木\) の代行/ }));
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-09-17");

    rerender(
      <SubSummaryCards subs={[mk(1, TODAY, "杉原", "confirmed")]} slots={SLOTS} todayStr={TODAY} />
    );
    expect(screen.queryByRole("button", { name: /今日 \(水\) の代行/ })).toBeNull();
    expect(screen.getByText(/今日 \(水\) の代行/)).toBeTruthy();
  });

  it("何も無ければ描かない", () => {
    const { container } = render(
      <SubSummaryCards subs={[mk(1, "2026-09-01", "杉原", "confirmed")]} slots={SLOTS} todayStr={TODAY} />
    );
    expect(container.textContent).toBe("");
  });
});
