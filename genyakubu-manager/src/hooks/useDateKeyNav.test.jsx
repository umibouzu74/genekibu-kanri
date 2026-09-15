// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useDateKeyNav } from "./useDateKeyNav";

afterEach(cleanup);

function Harness({ enabled = true, onPrev, onNext, onToday }) {
  useDateKeyNav({ enabled, onPrev, onNext, onToday });
  return (
    <div>
      <input aria-label="text" />
      <button>b</button>
    </div>
  );
}

function mount(props = {}) {
  const fns = { onPrev: vi.fn(), onNext: vi.fn(), onToday: vi.fn() };
  const utils = render(<Harness {...fns} {...props} />);
  return { ...utils, ...fns };
}

describe("useDateKeyNav", () => {
  it("← / → / t で onPrev / onNext / onToday を呼ぶ (大文字 T も)", () => {
    const { onPrev, onNext, onToday } = mount();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "T" }); // CapsLock
    fireEvent.keyDown(window, { key: "T", shiftKey: true }); // Shift+T は無視
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(2);
  });

  it("入力要素にフォーカスがあるときは何もしない", () => {
    const { onPrev, getByLabelText } = mount();
    const input = getByLabelText("text");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("修飾キー付きと、モーダルが開いている間は無視する", () => {
    const { onNext, onToday } = mount();
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    expect(onNext).not.toHaveBeenCalled();
    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    document.body.appendChild(dlg);
    fireEvent.keyDown(window, { key: "t" });
    expect(onToday).not.toHaveBeenCalled();
    dlg.remove();
    fireEvent.keyDown(window, { key: "t" });
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("enabled=false ではリスナーを付けない。ハンドラの差し替えは即反映", () => {
    const { onPrev, rerender } = mount({ enabled: false });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onPrev).not.toHaveBeenCalled();
    const later = vi.fn();
    rerender(<Harness enabled onPrev={later} onNext={() => {}} onToday={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(later).toHaveBeenCalledTimes(1);
  });
});
