// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ShortcutsHelp } from "./ShortcutsHelp";

afterEach(cleanup);

describe("ShortcutsHelp", () => {
  const noop = () => {};

  it("renders nothing when closed", () => {
    const { container } = render(<ShortcutsHelp open={false} onClose={noop} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with a title when open", () => {
    render(<ShortcutsHelp open onClose={noop} />);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getAllByText("キーボードショートカット").length).toBeGreaterThan(0);
  });

  it("lists general, chord, mouse and browser sections", () => {
    render(<ShortcutsHelp open onClose={noop} />);
    expect(screen.getByText("全般")).toBeDefined();
    expect(screen.getByText(/ビュー移動/)).toBeDefined();
    expect(screen.getByText("マウス操作")).toBeDefined();
    expect(screen.getByText("ブラウザ")).toBeDefined();
  });

  it("renders g-chord entries for each view key", () => {
    render(<ShortcutsHelp open onClose={noop} />);
    expect(screen.getByText("ダッシュボード")).toBeDefined();
    expect(screen.getByText("コースマスター管理")).toBeDefined();
    expect(screen.getByText("授業管理")).toBeDefined();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
