// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BatchPrintDialog } from "./BatchPrintDialog";

afterEach(cleanup);

const baseProps = {
  partTimeStaff: [
    { name: "奥村", subjectIds: [] },
    { name: "杉原", subjectIds: [] },
  ],
  subjects: [],
  year: 2026,
  month: 10,
  onClose: () => {},
  onPrint: () => {},
};

describe("BatchPrintDialog の 🖼 画像にする", () => {
  it("選んだ講師・月・タグの扱いを印刷と同じ形で onExportImages に渡す (並びはダイアログ順)", () => {
    const onExportImages = vi.fn();
    const onPrint = vi.fn();
    render(<BatchPrintDialog {...baseProps} onPrint={onPrint} onExportImages={onExportImages} />);
    fireEvent.click(screen.getByLabelText("杉原"));
    fireEvent.click(screen.getByLabelText("奥村"));
    fireEvent.click(screen.getByRole("button", { name: "2 名分を画像にする" }));
    expect(onExportImages).toHaveBeenCalledWith(["奥村", "杉原"], [{ year: 2026, month: 10 }], {
      tagMode: "perTeacher",
    });
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("誰も選んでいないと押せない。onExportImages が無ければボタンを出さない", () => {
    const { rerender } = render(<BatchPrintDialog {...baseProps} onExportImages={() => {}} />);
    expect(screen.getByRole("button", { name: "0 名分を画像にする" })).toBeDisabled();
    rerender(<BatchPrintDialog {...baseProps} />);
    expect(screen.queryByRole("button", { name: /画像にする/ })).toBeNull();
  });

  it("画像ができたら一覧に切り替わり、選び直すと選択が残った選択画面に戻る", () => {
    const images = [
      {
        key: "奥村:2026-10",
        teacher: "奥村",
        year: 2026,
        month: 10,
        file: new File(["x"], "奥村_2026年10月_月次予定.png", { type: "image/png" }),
        url: "blob:x",
      },
    ];
    const onBack = vi.fn();
    const { rerender } = render(
      <BatchPrintDialog {...baseProps} onExportImages={() => {}} onBackFromImages={onBack} />
    );
    fireEvent.click(screen.getByLabelText("奥村"));
    rerender(
      <BatchPrintDialog
        {...baseProps}
        onExportImages={() => {}}
        onBackFromImages={onBack}
        images={images}
      />
    );
    expect(screen.getByRole("dialog", { name: "月次予定の画像" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "奥村 2026年10月の月次予定" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← 選び直す" }));
    expect(onBack).toHaveBeenCalled();
    rerender(
      <BatchPrintDialog {...baseProps} onExportImages={() => {}} onBackFromImages={onBack} />
    );
    expect(screen.getByLabelText("奥村")).toBeChecked();
  });
});
