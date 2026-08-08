// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MultiDayView } from "./MultiDayView";
import { computeCourseSets } from "./courseSets";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

afterEach(cleanup);

const noop = () => {};

// 中3: S/A が火木、B が水金 の 2 セット構成
function twoSetProject() {
  return {
    ...makeProject({
      tabs: [
        {
          id: 1,
          name: "中3",
          grade: "中3",
          classes: [
            { id: 1, label: "S", room: "501" },
            { id: 2, label: "A", room: "502" },
            { id: 3, label: "B", room: "503" },
          ],
          days: ["火", "水", "木", "金"],
          periodIds: [1, 2],
          schedule: {
            [makeCellKey("火", 1, 1)]: { subj: "数学", teacher: "半田" },
            [makeCellKey("木", 1, 1)]: { subj: "英語", teacher: "堀上" },
            [makeCellKey("火", 1, 2)]: { subj: "英語" },
            [makeCellKey("木", 1, 2)]: { subj: "数学" },
            [makeCellKey("水", 1, 3)]: { subj: "数学" },
            [makeCellKey("金", 1, 3)]: { subj: "英語" },
          },
        },
      ],
    }),
    id: 1,
  };
}

function renderView(project, over = {}) {
  const sets = computeCourseSets(project);
  const props = {
    project,
    sets,
    days: ["火", "木"],
    onSelectDays: noop,
    gridProps: {
      onCellChange: noop,
      onClearCell: noop,
      onSwapCells: noop,
      conflictsByRef: new Map(),
    },
    ...over,
  };
  return { sets, ...render(<MultiDayView {...props} />) };
}

describe("MultiDayView", () => {
  it("選んだ曜日が横並びの見出しで表示され、各曜日は全クラスのフル表示になる", () => {
    renderView(twoSetProject());
    expect(screen.getByText("火曜日")).toBeDefined();
    expect(screen.getByText("木曜日")).toBeDefined();
    expect(screen.queryByText("水曜日")).toBeNull();
    // クラスは絞らない: 水金組の B 列も両曜日の表に出る (兼ね合い確認用)
    expect(screen.getAllByRole("columnheader", { name: /^B/ })).toHaveLength(2);
  });

  it("セットチップのクリックで onSelectDays にその組の曜日が渡る", () => {
    const onSelectDays = vi.fn();
    renderView(twoSetProject(), { onSelectDays });
    fireEvent.click(screen.getByRole("button", { name: /中3（水・金）/ }));
    expect(onSelectDays).toHaveBeenCalledWith(["水", "金"]);
  });

  it("表示中の曜日と一致するセットチップだけが押下状態になる", () => {
    renderView(twoSetProject());
    expect(
      screen
        .getByRole("button", { name: /中3（火・木）/ })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /中3（水・金）/ })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("曜日カラムは折り返さない等幅 (編集で表が広がっても縦一列に崩れない)", () => {
    const { container } = renderView(twoSetProject());
    const block = container.querySelector(".regb-print-day");
    expect(block.parentElement.className).toContain("flex-nowrap");
    expect(block.className).toContain("flex-1");
    expect(block.className).toContain("min-w-[320px]");
  });

  it("セットが無くても曜日の表は表示される", () => {
    const p = { ...makeProject({ tabs: [] }), id: 1 };
    renderView(p, { days: ["月"] });
    expect(screen.queryByText("セット:")).toBeNull();
    expect(screen.getByText("月曜日")).toBeDefined();
  });
});
