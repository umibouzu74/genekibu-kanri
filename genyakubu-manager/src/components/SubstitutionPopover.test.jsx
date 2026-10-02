// @vitest-environment jsdom
// タイムテーブル代行モードのポップオーバー: 多担任コマで欠勤者が 2 人以上の
// ときの「担当」切替。幅は min(280px, …) しかないので、チップは折り返し、
// 4 人以上なら select にする (2026-09-19)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SubstitutionPopover } from "./SubstitutionPopover";

afterEach(cleanup);

const SLOT = {
  id: 1,
  day: "土",
  time: "14:00-16:00",
  grade: "中1-3",
  cls: "-",
  room: "301",
  subj: "プレップ",
  teacher: "香川·福江·川井·西岡",
  note: "",
};

function renderPopover(props = {}) {
  return render(
    <SubstitutionPopover
      anchorEl={null}
      anchorRect={{ top: 10, bottom: 30, left: 10 }}
      slot={SLOT}
      originalTeacher="香川"
      availableTeachers={[]}
      allTeachersForDay={[]}
      suggestion={null}
      subjects={[]}
      pendingSub={null}
      onAssign={() => {}}
      onRemoveAssignment={() => {}}
      onClose={() => {}}
      slots={[SLOT]}
      pendingSubs={[]}
      partTimeStaff={[]}
      {...props}
    />
  );
}

describe("SubstitutionPopover の担当切替", () => {
  it("欠勤者が 2〜3 人ならチップ (折り返しあり) で、押すと onSwitchTeacher", () => {
    const onSwitchTeacher = vi.fn();
    renderPopover({ absentTeachers: ["香川", "福江", "川井"], onSwitchTeacher });
    const group = screen.getByRole("group", { name: "他の欠勤者へ切替" });
    expect(group.style.flexWrap).toBe("wrap");
    // 自分 (香川) は出ない
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "→ 福江",
      "→ 川井",
    ]);
    expect(screen.queryByRole("combobox", { name: "代行を入れる欠勤者" })).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "→ 川井" }));
    expect(onSwitchTeacher).toHaveBeenCalledWith("川井");
  });

  it("欠勤者が 4 人以上なら select にし、選ぶと onSwitchTeacher", () => {
    const onSwitchTeacher = vi.fn();
    renderPopover({ absentTeachers: ["香川", "福江", "川井", "西岡"], onSwitchTeacher });
    expect(screen.queryByRole("group", { name: "他の欠勤者へ切替" })).toBeNull();
    const select = screen.getByRole("combobox", { name: "代行を入れる欠勤者" });
    expect(select.value).toBe("香川");
    expect([...select.options].map((o) => o.value)).toEqual(["香川", "福江", "川井", "西岡"]);
    fireEvent.change(select, { target: { value: "西岡" } });
    expect(onSwitchTeacher).toHaveBeenCalledWith("西岡");
    // 同じ人を選び直しても呼ばない
    onSwitchTeacher.mockClear();
    fireEvent.change(select, { target: { value: "香川" } });
    expect(onSwitchTeacher).not.toHaveBeenCalled();
  });

  it("欠勤者が 1 人 / 切替の配線が無いときは何も出さない", () => {
    renderPopover({ absentTeachers: ["香川"], onSwitchTeacher: vi.fn() });
    expect(screen.queryByRole("group", { name: "他の欠勤者へ切替" })).toBeNull();
    cleanup();
    renderPopover({ absentTeachers: ["香川", "福江", "川井", "西岡"] });
    expect(screen.queryByRole("combobox", { name: "代行を入れる欠勤者" })).toBeNull();
    expect(screen.queryByRole("group", { name: "他の欠勤者へ切替" })).toBeNull();
  });
});

describe("SubstitutionPopover の他校舎の授業", () => {
  const WED = { ...SLOT, day: "水", time: "15:00-16:00", teacher: "香川" };
  const free = (name) => ({
    name,
    isFreeAllDay: true,
    freeTimeSlots: [],
    cancelledSlots: [],
    reason: "中学部休講",
    subjectIds: [],
    isPartTime: false,
  });

  it("全日空きでも、その時間に他校舎にいる人は空きに出さず、全員表示で「他校舎」と出す", () => {
    const offsiteByTeacher = new Map([
      ["石原", [{ id: 1, teacher: "石原", place: "村上高松", time: "14:50-15:40" }]],
      ["堀上", [{ id: 2, teacher: "堀上", place: "大手前丸亀", time: "13:30" }]],
    ]);
    renderPopover({
      slot: WED,
      slots: [WED],
      availableTeachers: [free("石原"), free("堀上"), free("片岡")],
      allTeachersForDay: [
        { name: "石原", subjectIds: [], isPartTime: false },
        { name: "堀上", subjectIds: [], isPartTime: false },
        { name: "片岡", subjectIds: [], isPartTime: false },
      ],
      offsiteByTeacher,
    });
    const names = () => screen.getAllByRole("option").map((o) => o.textContent);
    expect(names().some((t) => t.startsWith("石原"))).toBe(false);
    // 終了未定の後は空きのまま (注意書きつき)
    const horikami = screen.getByRole("option", { name: /堀上/ });
    expect(horikami.textContent).toContain("他校舎?");
    fireEvent.click(screen.getByLabelText("全員表示"));
    const ishihara = screen.getByRole("option", { name: /石原/ });
    expect(ishihara.textContent).toContain("他校舎");
    expect(ishihara.textContent).not.toContain("授業中");
  });
});
