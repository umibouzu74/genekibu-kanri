// @vitest-environment jsdom
// 振替ピッカーの「同担当の同時間帯重複」警告。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReschedulePickerPopover } from "./ReschedulePickerPopover";

afterEach(cleanup);

// 2026-09-07 は月曜、2026-09-11 は金曜
const slot = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中2",
  cls: "A",
  subj: "数学",
  teacher: "香川·福江",
  note: "",
};
const fridaySlot = {
  id: 2,
  day: "金",
  time: "19:00-20:20",
  grade: "中3",
  cls: "",
  subj: "英語",
  teacher: "福江",
  note: "",
};

function renderPicker() {
  const utils = render(
    <ReschedulePickerPopover
      anchorRect={{ top: 0, left: 0, bottom: 0, right: 0 }}
      slot={slot}
      sourceDate="2026-09-07"
      allSlots={[slot, fridaySlot]}
      allTeachers={["香川", "福江"]}
      timetables={[]}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );
  fireEvent.change(utils.container.querySelector('input[type="date"]'), {
    target: { value: "2026-09-11" },
  });
  return utils;
}

describe("ReschedulePickerPopover の重複警告", () => {
  // 講師欄「香川·福江」を文字列のまま比べると誰の講師欄とも一致せず、
  // 福江の金曜 19:00 と重なるのを見逃していた (2026-10-03)
  it("複数担当のコマは担当ごとに同時刻の重なりを見る", () => {
    renderPicker();
    expect(
      screen.getByText("担当 福江 は同時刻 (19:00-20:20) に既に 中3 英語 を担当しています")
    ).toBeTruthy();
    expect(screen.queryByText(/担当 香川 は同時刻/)).toBeNull();
  });
});

describe("ReschedulePickerPopover の振替先の日付", () => {
  // 10/16 の授業を、休講で空いた 10/9 (前倒し・今日より前) へ振り替える
  it("振替元より前・今日より前の日付も選べる (注意書きを出して保存できる)", () => {
    const onSave = vi.fn();
    const fri = { ...fridaySlot, grade: "高1", subj: "数学", teacher: "香川" };
    const { container } = render(
      <ReschedulePickerPopover
        anchorRect={{ top: 0, left: 0, bottom: 0, right: 0 }}
        slot={fri}
        sourceDate="2099-10-16"
        allSlots={[fri]}
        allTeachers={["香川"]}
        timetables={[]}
        isOffForGrade={(d) => d === "2026-10-09"}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    const input = container.querySelector('input[type="date"]');
    expect(input.getAttribute("min")).toBeNull();
    fireEvent.change(input, { target: { value: "2026-10-09" } });
    expect(screen.getByText(/振替元より前の日付/)).toBeTruthy();
    expect(screen.getByText(/今日より前の日付/)).toBeTruthy();
    expect(screen.getByText(/休講日 \/ テスト期間です/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: "2026-10-09" })
    );
  });
});
