// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu } from "./ContextMenu";

afterEach(cleanup);

function renderMenu(overrides = {}) {
  const onClose = vi.fn();
  const a = vi.fn();
  const b = vi.fn();
  const c = vi.fn();
  render(
    <ContextMenu
      x={10}
      y={10}
      items={[
        { label: "代行を登録", onClick: a },
        { label: "無効", onClick: b, disabled: true },
        { label: "削除", onClick: c, danger: true },
      ]}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onClose, a, b, c };
}

describe("ContextMenu のキーボード操作", () => {
  it("role=menu / menuitem を持ち、開いたら先頭の有効な項目にフォーカスする", () => {
    renderMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
  });

  it("↓↑ で無効な項目を飛ばして移動し、末尾から先頭へ回る", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    const [first, , third] = screen.getAllByRole("menuitem");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(third);
  });

  it("Esc で閉じる", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("項目を実行すると onClick → onClose の順に呼ばれ、無効な項目は何もしない", () => {
    const { onClose, a, b } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "代行を登録" }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "無効" }));
    expect(b).not.toHaveBeenCalled();
  });

  it("閉じると開く前にフォーカスしていた要素へ戻す", () => {
    const opener = document.createElement("button");
    opener.textContent = "カード";
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <ContextMenu x={0} y={0} items={[{ label: "A", onClick: () => {} }]} onClose={onClose} />
    );
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("メニューの外を mousedown すると閉じる", () => {
    const { onClose } = renderMenu();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
