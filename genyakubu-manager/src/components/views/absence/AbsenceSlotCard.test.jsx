// @vitest-environment jsdom
// 欠勤組み換えのカードをキーボードだけで操作できること (2026-09-04)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AbsenceSlotCard } from "./AbsenceSlotCard";

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

function renderCard(props = {}) {
  const onClick = vi.fn();
  const onContextMenu = vi.fn();
  render(
    <AbsenceSlotCard
      slot={SLOT}
      date="2026-09-08"
      biweeklyAnchors={[]}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...props}
    />
  );
  return { onClick, onContextMenu };
}

describe("AbsenceSlotCard のキーボード操作", () => {
  it("Tab で到達できる button として、コマの内容と状態を読み上げ名に持つ", () => {
    renderCard({ isAbsent: true, subs: [{ originalTeacher: "堀上", substitute: "", status: "requested" }] });
    const card = screen.getByRole("button", { name: /19:50-20:35 中3 S 数学 堀上/ });
    expect(card).toHaveAttribute("tabindex", "0");
    expect(card.getAttribute("aria-label")).toMatch(/欠勤/);
    expect(card.getAttribute("aria-label")).toMatch(/代行未定/);
  });

  it("Enter / Space でクリック相当", () => {
    const { onClick } = renderCard();
    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("ContextMenu キー / Shift+F10 で右クリック相当 (座標つき)", () => {
    const { onContextMenu } = renderCard();
    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "ContextMenu" });
    fireEvent.keyDown(card, { key: "F10", shiftKey: true });
    expect(onContextMenu).toHaveBeenCalledTimes(2);
    const ev = onContextMenu.mock.calls[0][0];
    expect(typeof ev.clientX).toBe("number");
    expect(typeof ev.clientY).toBe("number");
    expect(typeof ev.preventDefault).toBe("function");
  });

  it("休講のカードは操作系が無いので button にしない", () => {
    renderCard({ cancelLabel: "休講", onClick: undefined, onContextMenu: undefined });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
