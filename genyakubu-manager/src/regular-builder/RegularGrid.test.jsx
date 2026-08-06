// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RegularGrid } from "./RegularGrid";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

afterEach(cleanup);

const noop = () => {};

// 高校の講座タブ (クラス名なし・教室が列見出し) を模したプロジェクト
function kozaProject() {
  return {
    ...makeProject(),
    id: 1,
    tabs: [
      {
        id: 1,
        name: "高2",
        grade: "高2",
        classes: [
          { id: 1, label: "", room: "404" },
          { id: 2, label: "", room: "405" },
        ],
        days: ["月"],
        periodIds: [1, 2],
        schedule: {
          [makeCellKey("月", 1, 1)]: { subj: "文系数学", teacher: "半田" },
        },
      },
    ],
  };
}

function renderGrid(project, over = {}) {
  return render(
    <RegularGrid
      project={project}
      day="月"
      onCellChange={noop}
      onClearCell={noop}
      onSwapCells={noop}
      conflictsByRef={new Map()}
      {...over}
    />
  );
}

describe("RegularGrid - 列見出しの教室編集", () => {
  it("教室クリックで入力に切り替わり、Enter 確定で onSetClassRoom が呼ばれる", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "404" }));
    const input = screen.getByLabelText("高2 404 の既定教室");
    fireEvent.change(input, { target: { value: "407" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 1, "407");
    expect(screen.queryByLabelText("高2 404 の既定教室")).toBeNull();
  });

  it("フォーカスが外れても確定する (display-first のセル編集と同じ)", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "405" }));
    const input = screen.getByLabelText("高2 405 の既定教室");
    fireEvent.change(input, { target: { value: "406" } });
    fireEvent.blur(input);
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 2, "406");
  });

  it("Escape は編集を取り消して何も呼ばない", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "404" }));
    const input = screen.getByLabelText("高2 404 の既定教室");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSetClassRoom).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("高2 404 の既定教室")).toBeNull();
    expect(screen.getByRole("button", { name: "404" })).toBeDefined();
  });

  it("クラス名のある列は教室部分だけがクリック対象になる", () => {
    const onSetClassRoom = vi.fn();
    renderGrid({ ...makeProject(), id: 1 }, { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "501" }));
    const input = screen.getByLabelText("中3 S の既定教室");
    fireEvent.change(input, { target: { value: "503" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 1, "503");
  });

  it("onSetClassRoom が無い (印刷用など) 場合はただのテキスト表示", () => {
    renderGrid(kozaProject());
    expect(screen.queryByRole("button", { name: "404" })).toBeNull();
    expect(screen.getByText("404")).toBeDefined();
  });
});
