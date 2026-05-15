// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BiweeklyTab } from "./BiweeklyTab";

afterEach(cleanup);

describe("BiweeklyTab — 個別 anchor 解除ボタン", () => {
  const noop = () => {};
  const biweeklyAnchors = [{ date: "2026-04-06", weekType: "A" }];

  function renderTab({ groups, isAdmin = true, onClearSlotAnchors = noop }) {
    return render(
      <BiweeklyTab
        biweeklyAnchors={biweeklyAnchors}
        sortedAnchors={biweeklyAnchors}
        currentWeekType="A"
        newAnchorDate=""
        setNewAnchorDate={noop}
        addAnchor={noop}
        removeAnchor={noop}
        biweeklyGroups={groups}
        holidays={[]}
        examPeriods={[]}
        isAdmin={isAdmin}
        onEdit={noop}
        onClearSlotAnchors={onClearSlotAnchors}
      />
    );
  }

  const baseSlot = {
    id: 74,
    day: "金",
    time: "18:55-19:40",
    grade: "中3",
    cls: "S",
    room: "501",
    subj: "英/数",
    teacher: "堀上",
    note: "隔週(川井)",
  };
  const customAnchors = [{ date: "2026-04-24", weekType: "A" }];

  it("個別 anchor がある slot には ✕ ボタンが表示される", () => {
    const slot = { ...baseSlot, biweeklyAnchors: customAnchors };
    const groups = [{ day: "金", time: "18:55-19:40", slots: [slot] }];
    renderTab({ groups });
    expect(screen.getByText("個別")).toBeDefined();
    expect(screen.getByLabelText(/英\/数 の個別基準日を削除/)).toBeDefined();
  });

  it("個別 anchor が無い slot には ✕ ボタンが表示されない", () => {
    const slot = { ...baseSlot }; // no biweeklyAnchors
    const groups = [{ day: "金", time: "18:55-19:40", slots: [slot] }];
    renderTab({ groups });
    expect(screen.getByText("共通")).toBeDefined();
    expect(screen.queryByLabelText(/個別基準日を削除/)).toBeNull();
  });

  it("admin=false のときは ✕ ボタンが表示されない", () => {
    const slot = { ...baseSlot, biweeklyAnchors: customAnchors };
    const groups = [{ day: "金", time: "18:55-19:40", slots: [slot] }];
    renderTab({ groups, isAdmin: false });
    expect(screen.getByText("個別")).toBeDefined();
    expect(screen.queryByLabelText(/個別基準日を削除/)).toBeNull();
  });

  it("✕ ボタンクリックで onClearSlotAnchors が slot.id 付きで呼ばれる", () => {
    const onClearSlotAnchors = vi.fn();
    const slot = { ...baseSlot, biweeklyAnchors: customAnchors };
    const groups = [{ day: "金", time: "18:55-19:40", slots: [slot] }];
    renderTab({ groups, onClearSlotAnchors });
    const btn = screen.getByLabelText(/英\/数 の個別基準日を削除/);
    fireEvent.click(btn);
    expect(onClearSlotAnchors).toHaveBeenCalledTimes(1);
    expect(onClearSlotAnchors).toHaveBeenCalledWith(74);
  });

  it("onClearSlotAnchors prop が未指定なら ✕ ボタンは表示されない (後方互換)", () => {
    const slot = { ...baseSlot, biweeklyAnchors: customAnchors };
    const groups = [{ day: "金", time: "18:55-19:40", slots: [slot] }];
    render(
      <BiweeklyTab
        biweeklyAnchors={biweeklyAnchors}
        sortedAnchors={biweeklyAnchors}
        currentWeekType="A"
        newAnchorDate=""
        setNewAnchorDate={noop}
        addAnchor={noop}
        removeAnchor={noop}
        biweeklyGroups={groups}
        holidays={[]}
        examPeriods={[]}
        isAdmin={true}
        onEdit={noop}
      />
    );
    expect(screen.getByText("個別")).toBeDefined();
    expect(screen.queryByLabelText(/個別基準日を削除/)).toBeNull();
  });
});
