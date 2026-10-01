// @vitest-environment jsdom
// どこからでも開ける「✏ 引継ぎメモを書く」: 開いてすぐ打てる・1 行で保存して
// 閉じる・toast から一覧のそのメモへ飛べる。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HandoverQuickAddDialog } from "./HandoverQuickAddDialog";
import { ToastProvider } from "../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDialog(props) {
  return render(
    <ToastProvider
      render={(toasts) => (
        <div>
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
            </div>
          ))}
        </div>
      )}
    >
      <HandoverQuickAddDialog {...props} />
    </ToastProvider>
  );
}

describe("HandoverQuickAddDialog", () => {
  it("1 行で保存して閉じ、toast からそのメモを開ける", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const onOpenNote = vi.fn();
    renderDialog({
      notes: [{ id: 7, date: "2026-09-01", category: "事務", title: "既存" }],
      onSave,
      onClose,
      onOpenNote,
    });
    const input = screen.getByLabelText("メモ");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "事務よりズバリ的中の提出催促" } });
    fireEvent.submit(input.closest("form"));
    expect(onSave.mock.calls[0][0][1]).toMatchObject({
      id: 8,
      date: "2026-10-01",
      title: "事務よりズバリ的中の提出催促",
    });
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "一覧で見る" }));
    expect(onOpenNote).toHaveBeenCalledWith(8);
  });

  it("空なら保存せず閉じない", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderDialog({ notes: [], onSave, onClose });
    fireEvent.click(screen.getByRole("button", { name: "＋ 追加" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
