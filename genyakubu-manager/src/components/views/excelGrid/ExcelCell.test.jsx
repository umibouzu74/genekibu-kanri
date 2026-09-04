// @vitest-environment jsdom
// タイムテーブルのセルをキーボードだけで操作できること (2026-09-04)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExcelCell } from "./ExcelCell";

afterEach(cleanup);

const SLOT = {
  id: 1,
  day: "火",
  time: "19:50-20:35",
  grade: "中3",
  cls: "S",
  subj: "数学",
  teacher: "堀上",
  note: "",
};

function renderCell(props = {}) {
  render(
    <table>
      <tbody>
        <tr>
          <ExcelCell slot={SLOT} biweeklyAnchors={[]} holidays={[]} examPeriods={[]} {...props} />
        </tr>
      </tbody>
    </table>
  );
}

describe("ExcelCell のキーボード操作", () => {
  it("管理者の通常モードでは Enter で編集 (ダブルクリック相当) を開く", () => {
    const onEdit = vi.fn();
    renderCell({ isAdmin: true, onEdit, sessionNumber: 3 });
    const cell = screen.getByRole("button", { name: /中3 S 数学 堀上 第3回 を編集/ });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledWith(SLOT);
  });

  it("代行モードでは Enter でクリック相当 (セルの矩形と要素を渡す)", () => {
    const onCellClick = vi.fn();
    renderCell({ isAdmin: true, isSubMode: true, onCellClick });
    const cell = screen.getByRole("button");
    fireEvent.keyDown(cell, { key: " " });
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const [slot, rect, el] = onCellClick.mock.calls[0];
    expect(slot).toBe(SLOT);
    expect(rect).toBeTruthy();
    expect(el).toBe(cell);
  });

  it("閲覧者の通常モードでは操作が無いので button にしない", () => {
    renderCell({ isAdmin: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("欠勤・休講の状態を読み上げ名に含める", () => {
    renderCell({
      isAdmin: true,
      onEdit: vi.fn(),
      existingSubs: [{ originalTeacher: "堀上", substitute: "", status: "requested" }],
    });
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/代行未定/);
  });
});
