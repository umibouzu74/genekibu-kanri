// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const dl = vi.hoisted(() => ({ downloadFiles: vi.fn() }));
vi.mock("../utils/htmlImage", async (importOriginal) => ({
  ...(await importOriginal()),
  downloadFiles: dl.downloadFiles,
}));

import { BatchImageResults } from "./BatchImageResults";

const img = (teacher, month) => ({
  key: `${teacher}:2026-${month}`,
  teacher,
  year: 2026,
  month,
  file: new File(["x"], `${teacher}_2026年${month}月_月次予定.png`, { type: "image/png" }),
  url: `blob:${teacher}-${month}`,
});

const images = [img("奥村", 10), img("奥村", 11), img("杉原", 10), img("杉原", 11)];
const names = (files) => files.map((f) => f.name);

describe("BatchImageResults", () => {
  beforeEach(() => {
    navigator.share = vi.fn(() => Promise.resolve());
    navigator.canShare = vi.fn(() => true);
  });
  afterEach(() => {
    cleanup();
    delete navigator.share;
    delete navigator.canShare;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("講師ごとに 1 行。行の「共有」はその人の月をまとめて共有シートへ渡す", () => {
    render(<BatchImageResults images={images} onBack={() => {}} onClose={() => {}} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("2026年10月・2026年11月");

    fireEvent.click(screen.getByRole("button", { name: "杉原 の画像を共有" }));
    expect(navigator.share).toHaveBeenCalledTimes(1);
    expect(names(navigator.share.mock.calls[0][0].files)).toEqual([
      "杉原_2026年10月_月次予定.png",
      "杉原_2026年11月_月次予定.png",
    ]);
    // テキストは付けない (LINE に余計なメッセージが流れないように)
    expect(Object.keys(navigator.share.mock.calls[0][0])).toEqual(["files"]);
  });

  it("「まとめて共有」は全員分を 1 回で渡す", () => {
    render(<BatchImageResults images={images} onBack={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "4 枚をまとめて共有" }));
    expect(names(navigator.share.mock.calls[0][0].files)).toHaveLength(4);
  });

  it("共有シートを閉じただけ (AbortError) は何も言わず、ほかの失敗は保存を案内する", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    navigator.share = vi.fn(() =>
      Promise.reject(Object.assign(new Error(), { name: "AbortError" }))
    );
    render(<BatchImageResults images={images} onBack={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "奥村 の画像を共有" }));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();

    navigator.share = vi.fn(() =>
      Promise.reject(Object.assign(new Error(), { name: "NotAllowedError" }))
    );
    fireEvent.click(screen.getByRole("button", { name: "奥村 の画像を共有" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("保存"));
  });

  it("共有に対応していないブラウザでは「保存」だけを出す", () => {
    delete navigator.share;
    delete navigator.canShare;
    render(<BatchImageResults images={images} onBack={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /共有/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "奥村 の画像を保存" }));
    expect(names(dl.downloadFiles.mock.calls[0][0])).toEqual([
      "奥村_2026年10月_月次予定.png",
      "奥村_2026年11月_月次予定.png",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "4 枚をまとめて保存" }));
    expect(dl.downloadFiles.mock.calls[1][0]).toHaveLength(4);
  });

  it("「選び直す」「閉じる」", () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(<BatchImageResults images={images} onBack={onBack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "← 選び直す" }));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
