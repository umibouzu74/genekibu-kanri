import { describe, expect, it, vi } from "vitest";
import { readWorkbookBytes } from "./workbookFile";

describe("readWorkbookBytes", () => {
  it("Excel でないファイル・壊れた .xlsx は、日本語で理由を出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(readWorkbookBytes(new TextEncoder().encode("hello"))).rejects.toThrow(
      "Excel のファイル (.xls / .xlsx) ではありません。"
    );
    // .xlsx (zip) の頭だけあって中身が壊れている → ライブラリの英語のエラーを出さない
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(64).fill(7)]);
    await expect(readWorkbookBytes(broken)).rejects.toThrow(/^ファイルが壊れているか、Excel の予定表ではありません。/);
    warn.mockRestore();
  });
});
