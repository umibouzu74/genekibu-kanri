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
      <div role="radiogroup">
        <button role="radio" aria-checked="true" aria-label="radio-a">
          a
        </button>
      </div>
      <div role="listbox">
        <span>
          <button aria-label="in-listbox">x</button>
        </span>
      </div>
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

  it("矢印キーを自前で使う role (radio / listbox の中) にフォーカスがある間は ← / → を握らない (t は効く)", () => {
    const { onPrev, onNext, onToday, getByLabelText } = mount();
    const radio = getByLabelText("radio-a");
    radio.focus();
    fireEvent.keyDown(radio, { key: "ArrowLeft" });
    fireEvent.keyDown(radio, { key: "ArrowRight" });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.keyDown(radio, { key: "t" });
    expect(onToday).toHaveBeenCalledTimes(1);
    // 祖先が listbox でも同じ
    const inList = getByLabelText("in-listbox");
    inList.focus();
    fireEvent.keyDown(inList, { key: "ArrowRight" });
    expect(onNext).not.toHaveBeenCalled();
    // 素のボタンに戻れば効く
    inList.blur();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
