// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CourseSetView } from "./CourseSetView";
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
    activeSet: sets[0] || null,
    onSelectSet: noop,
    gridProps: {
      onCellChange: noop,
      onClearCell: noop,
      onSwapCells: noop,
      conflictsByRef: new Map(),
    },
    ...over,
  };
  return { sets, ...render(<CourseSetView {...props} />) };
}

describe("CourseSetView", () => {
  it("セットの曜日が横並びの見出しで表示され、セットのクラス列だけに絞られる", () => {
    renderView(twoSetProject());
    // 火木セットが選択中: 火・木の 2 グリッド
    expect(screen.getByText("火曜日")).toBeDefined();
    expect(screen.getByText("木曜日")).toBeDefined();
    expect(screen.queryByText("水曜日")).toBeNull();
    // クラス列は S / A のみ (水金組の B は出ない)。列見出しは曜日ごとに 1 回
    expect(screen.getAllByRole("columnheader", { name: /^S/ })).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: /^B/ })).toBeNull();
  });

  it("チップにセットが列挙され、クリックで onSelectSet が呼ばれる", () => {
    const onSelectSet = vi.fn();
    const { sets } = renderView(twoSetProject(), { onSelectSet });
    expect(sets.map((s) => s.label)).toEqual(["中3（火・木）", "中3（水・金）"]);
    const chip = screen.getByRole("button", { name: /中3（水・金）/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(onSelectSet).toHaveBeenCalledWith(sets[1].key);
  });

  it("セットが無ければ案内文を出す", () => {
    const p = { ...makeProject({ tabs: [] }), id: 1 };
    renderView(p);
    expect(
      screen.getByText(/表示できるセットがありません/)
    ).toBeDefined();
  });
});
