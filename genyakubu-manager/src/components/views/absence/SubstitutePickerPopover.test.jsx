// @vitest-environment jsdom
// 欠勤組み換えの代行ピッカー: 「全員表示」は時間割に出てくる全講師 (曜日を
// 問わない) を含み、一覧に無い名前も直接入力できる。その日のコマの講師だけ
// だと、木曜にコマの無い常勤 (2026-09-10 の西岡) がどこにも出なかった。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubstitutePickerPopover } from "./SubstitutePickerPopover";

afterEach(cleanup);

const SLOT = {
  id: 2,
  day: "木",
  time: "19:50-20:35",
  grade: "中3",
  cls: "C",
  room: "504",
  subj: "社会",
  teacher: "野口",
  note: "",
};

function renderPicker(props = {}) {
  const onAssign = vi.fn();
  const onClose = vi.fn();
  render(
    <SubstitutePickerPopover
      anchorRect={{ top: 0, left: 0, bottom: 0, right: 0 }}
      slot={SLOT}
      date="2026-09-10"
      biweeklyAnchors={[]}
      holidays={[]}
      examPeriods={[]}
      partTimeStaff={[{ name: "江本", subjectIds: [1] }]}
      subjects={[{ id: 1, name: "社会", aliases: [] }]}
      daySlots={[SLOT]}
      allTeachers={["江本", "西岡", "野口"]}
      teachers={["野口"]}
      subsByTeacher={{}}
      onAssign={onAssign}
      onClear={() => {}}
      onClose={onClose}
      {...props}
    />
  );
  return { onAssign, onClose };
}

describe("SubstitutePickerPopover の候補", () => {
  it("全員表示で、その日にコマの無い常勤も候補に出る (元講師は出さない)", () => {
    const { onAssign, onClose } = renderPicker();
    // 既定は教科を担当できるバイトだけ
    expect(screen.getByRole("option", { name: /江本/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /西岡/ })).toBeNull();

    fireEvent.click(screen.getByLabelText("全員表示"));
    expect(screen.getByRole("option", { name: /西岡/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /野口/ })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /西岡/ }));
    expect(onAssign).toHaveBeenCalledWith("野口", "西岡", "confirmed");
    expect(onClose).toHaveBeenCalled();
  });

  it("一覧に無い名前を直接入力して割り当てられる", () => {
    const { onAssign } = renderPicker();
    const input = screen.getByLabelText("代行者名を直接入力");
    const btn = screen.getByRole("button", { name: "割り当て" });
    expect(btn.disabled).toBe(true);
    fireEvent.change(input, { target: { value: " 山田 " } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAssign).toHaveBeenCalledWith("野口", "山田", "confirmed");
  });

  it("直接入力欄で Enter しても割り当てる (ステータスは選択中のもの)", () => {
    const { onAssign } = renderPicker();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "requested" } });
    const input = screen.getByLabelText("代行者名を直接入力");
    fireEvent.change(input, { target: { value: "山田" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAssign).toHaveBeenCalledWith("野口", "山田", "requested");
  });
});

describe("SubstitutePickerPopover の「授業中 / 代行中」", () => {
  // 候補がこのコマの時間に既に持っている仕事を候補行に出す。
  // 選べなくはしない (警告であって禁止ではない)。
  const OTHER = { id: 5, day: "木", time: "19:50-20:35", grade: "中2", cls: "C", subj: "数学", teacher: "奥村" };
  const assignments = [
    { teacher: "江本", slot: OTHER, time: OTHER.time, role: "sub", originalTeacher: "奥村" },
    { teacher: "西岡", slot: { ...OTHER, id: 6, grade: "中1", cls: "S", subj: "社会", teacher: "西岡" }, time: OTHER.time, role: "own" },
  ];
  it("代行中 / 授業中 の候補にラベルを出し、それでも選べる", () => {
    const { onAssign } = renderPicker({ assignments });
    const ebisu = screen.getByRole("option", { name: /江本/ });
    expect(ebisu.textContent).toContain("代行中: 中2C 数学");
    fireEvent.click(screen.getByLabelText("全員表示"));
    expect(screen.getByRole("option", { name: /西岡/ }).textContent).toContain("授業中: 中1S 社会");
    fireEvent.click(ebisu);
    expect(onAssign).toHaveBeenCalledWith("野口", "江本", "confirmed");
  });
  it("今入れようとしているコマ自体は「授業中」に数えない", () => {
    renderPicker({
      assignments: [{ teacher: "江本", slot: SLOT, time: SLOT.time, role: "own" }],
    });
    expect(screen.getByRole("option", { name: /江本/ }).textContent).not.toContain("授業中");
  });
});
