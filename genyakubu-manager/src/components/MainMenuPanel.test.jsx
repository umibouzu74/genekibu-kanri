// @vitest-environment jsdom
// メインメニューのボタンに g chord を添える (2026-10-15)。ビューへ移る項目だけで、
// 読み上げ名には入れない (ボタンの名前は機能名のまま)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MainMenuPanel } from "./MainMenuPanel";
import { MAIN_MENU } from "../constants/mainMenu";
import { VIEWS } from "../constants/views";

afterEach(cleanup);

describe("MainMenuPanel のショートカット表示", () => {
  it("full: ビューへ移る項目に「g x」を出し、ボタンの名前には含めない", () => {
    const onNavigate = vi.fn();
    render(<MainMenuPanel categories={MAIN_MENU} onNavigate={onNavigate} variant="full" />);
    const btn = screen.getByRole("button", { name: /^欠勤組み換え/ });
    expect(btn.querySelector(".main-menu-chord")?.textContent).toBe("g a");
    expect(btn).not.toHaveAccessibleName(/g a/);
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "view", view: VIEWS.ABSENCE_FLOW })
    );
    // ダイアログの項目には出さない
    const batch = screen.getByRole("button", { name: /^月間予定の印刷・画像/ });
    expect(batch.querySelector(".main-menu-chord")).toBeNull();
  });

  it("compact: 名前だけのボタンなので、説明とショートカットを title に入れる", () => {
    render(<MainMenuPanel categories={MAIN_MENU} onNavigate={() => {}} variant="compact" />);
    const btn = screen.getByRole("button", { name: /欠勤組み換え/ });
    expect(btn.title).toContain("(キーボード: g → a)");
    expect(btn.querySelector(".main-menu-chord")).toBeNull();
  });
});
