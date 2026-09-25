// @vitest-environment jsdom
// 本体側の useFocusTrap。親の再描画で onClose の identity が変わっても
// trap を作り直さない (作り直すとフォーカスが ✕ へ飛び、モーダル内の
// スクロールが先頭へ戻る = 特訓シフトで講師を 1 人チェックするたびに戻された)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

afterEach(cleanup);

function TrapDialog({ onClose, enabled = true }) {
  const ref = useRef(null);
  useFocusTrap(ref, { onClose, enabled });
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

describe("useFocusTrap (本体)", () => {
  it("マウント時に最初の focusable へフォーカスする", () => {
    const { getByText } = render(<TrapDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(getByText("first"));
  });

  it("onClose の identity が変わっても trap は作り直さずフォーカスを奪わない", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    try {
      const { getByText, rerender } = render(<TrapDialog onClose={vi.fn()} />);
      getByText("middle").focus();
      // 親の再描画でインラインの onClose が作り直される
      rerender(<TrapDialog onClose={vi.fn()} />);
      expect(document.activeElement).toBe(getByText("middle"));
    } finally {
      outside.remove();
    }
  });

  it("onClose が変わった後の Escape は最新の onClose を呼ぶ", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TrapDialog onClose={first} />);
    rerender(<TrapDialog onClose={second} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("閉じたら開く前の要素へフォーカスを戻す", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    try {
      const { unmount } = render(<TrapDialog onClose={vi.fn()} />);
      expect(document.activeElement).not.toBe(opener);
      unmount();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });
});
