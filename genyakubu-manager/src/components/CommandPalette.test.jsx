// @vitest-environment jsdom
// Cmd+K: 空のときは主要なビュー・操作の固定一覧、日付を打てばその日への
// ジャンプ、複数講師のコマは講師ごとに 1 件 (2026-09-12)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { VIEWS } from "../constants/views";

afterEach(cleanup);

const SLOTS = [
  { id: 1, day: "月", time: "18:30-20:00", grade: "中1-3", cls: "", room: "亀73", subj: "プレップ", teacher: "香川·福江", note: "" },
];

function renderPalette(props = {}) {
  const fns = {
    onClose: vi.fn(),
    onSelectTeacher: vi.fn(),
    onSelectView: vi.fn(),
    onSelectDate: vi.fn(),
    onJumpToAbsenceFlow: vi.fn(),
  };
  render(
    <CommandPalette
      open
      slots={SLOTS}
      subs={[]}
      views={VIEWS}
      {...fns}
      {...props}
    />
  );
  return fns;
}

describe("CommandPalette", () => {
  it("空のときは今日・明日の日付ジャンプと主要なビューを固定で出す", () => {
    renderPalette();
    expect(screen.getByRole("option", { name: /今日 .* のダッシュボード/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /明日 .* の欠勤組み換え/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /ダッシュボード.*ビューに移動/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /授業管理/ })).toBeTruthy();
  });

  it("「9/24」でその日のダッシュボード / 欠勤組み換えへ飛べる", () => {
    const { onSelectDate, onJumpToAbsenceFlow } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9/24" } });
    const dash = screen.getByRole("option", { name: /-09-24 \(木\) のダッシュボード/ });
    fireEvent.click(dash);
    expect(onSelectDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-09-24$/));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("option", { name: /の欠勤組み換え/ }));
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-09-24");
  });

  it("欠勤組み換えへのジャンプは渡したときだけ (閲覧者には出ない)", () => {
    renderPalette({ onJumpToAbsenceFlow: undefined });
    expect(screen.queryByRole("option", { name: /の欠勤組み換え/ })).toBeNull();
  });

  it("複数講師のコマは講師ごとに 1 件出し、選ぶとその講師を開く", () => {
    const { onSelectTeacher } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "プレップ" } });
    const opts = screen.getAllByRole("option", { name: /プレップ/ });
    expect(opts).toHaveLength(2);
    fireEvent.click(opts[1]);
    expect(onSelectTeacher).toHaveBeenCalledWith("福江");
  });
});
