import { afterEach, describe, expect, it, vi } from "vitest";

const pw = vi.hoisted(() => ({
  writePendingDocument: vi.fn(),
  updatePendingProgress: vi.fn(),
  writePrintDocument: vi.fn(),
  yieldToBrowser: vi.fn(() => Promise.resolve()),
}));
vi.mock("./printWindow", () => pw);

import { runSnapshotPrint } from "./snapshotPrint";

const makeWindow = () => ({ closed: false, close: vi.fn() });

function opts(over = {}) {
  const calls = [];
  return {
    calls,
    title: "テスト印刷",
    styles: "body{}",
    items: ["a", "b", "c"],
    progressName: (x) => `名前:${x}`,
    render: (x) => calls.push(`render:${x}`),
    capture: (x) => {
      calls.push(`capture:${x}`);
      return `<p>${x}</p>`;
    },
    buildBody: (rs) => rs.join(""),
    ...over,
  };
}

describe("runSnapshotPrint", () => {
  afterEach(() => vi.clearAllMocks());

  it("準備中画面 → 1 枚ごとの進捗 → render → yield → capture の順で回し、最後に紙面を書く", async () => {
    const w = makeWindow();
    const o = opts();
    const progress = [];
    const res = await runSnapshotPrint(w, { ...o, onProgress: (p) => progress.push(p) });
    expect(pw.writePendingDocument).toHaveBeenCalledWith(w, { title: "テスト印刷", total: 3 });
    expect(progress).toEqual([
      { current: 1, total: 3, name: "名前:a" },
      { current: 2, total: 3, name: "名前:b" },
      { current: 3, total: 3, name: "名前:c" },
    ]);
    expect(pw.updatePendingProgress.mock.calls.map((c) => c[1])).toEqual(progress);
    // render の後に yield、その後に capture (yield 回数 = 枚数)
    expect(o.calls).toEqual([
      "render:a", "capture:a", "render:b", "capture:b", "render:c", "capture:c",
    ]);
    expect(pw.yieldToBrowser).toHaveBeenCalledTimes(3);
    expect(pw.writePrintDocument).toHaveBeenCalledWith(w, {
      title: "テスト印刷",
      styles: "body{}",
      bodyHtml: "<p>a</p><p>b</p><p>c</p>",
    });
    expect(res.status).toBe("printed");
    expect(w.close).not.toHaveBeenCalled();
  });

  it("capture が null を返した枚は飛ばす。docTitle は撮れた結果から決められる", async () => {
    const w = makeWindow();
    const res = await runSnapshotPrint(w, {
      ...opts({ capture: (x) => (x === "b" ? null : `<p>${x}</p>`) }),
      docTitle: (rs) => `${rs.length} 枚`,
    });
    expect(res.results).toEqual(["<p>a</p>", "<p>c</p>"]);
    expect(pw.writePrintDocument.mock.calls[0][1].title).toBe("2 枚");
  });

  it("popup を閉じられたら止まり、紙面も書かず閉じ直しもしない", async () => {
    const w = makeWindow();
    const o = opts();
    pw.updatePendingProgress.mockImplementationOnce(() => {
      w.closed = true;
    });
    const res = await runSnapshotPrint(w, o);
    expect(res.status).toBe("closed");
    expect(o.calls).toEqual(["render:a"]);
    expect(pw.writePrintDocument).not.toHaveBeenCalled();
    expect(w.close).not.toHaveBeenCalled();
  });

  it("yield の後に閉じられた場合も capture せずに止まる", async () => {
    const w = makeWindow();
    const o = opts();
    pw.yieldToBrowser.mockImplementationOnce(async () => {
      w.closed = true;
    });
    const res = await runSnapshotPrint(w, o);
    expect(res.status).toBe("closed");
    expect(o.calls).toEqual(["render:a"]);
  });

  it("isAborted が真になったら止まり、popup を閉じる", async () => {
    const w = makeWindow();
    let aborted = false;
    const o = opts({ isAborted: () => aborted });
    pw.updatePendingProgress.mockImplementation((_, p) => {
      if (p.current === 2) aborted = true;
    });
    const res = await runSnapshotPrint(w, o);
    expect(res.status).toBe("aborted");
    expect(o.calls).toEqual(["render:a", "capture:a", "render:b"]);
    expect(w.close).toHaveBeenCalled();
    expect(pw.writePrintDocument).not.toHaveBeenCalled();
  });

  it("1 枚も撮れなければ empty で popup を閉じる", async () => {
    const w = makeWindow();
    const res = await runSnapshotPrint(w, opts({ capture: () => null }));
    expect(res.status).toBe("empty");
    expect(w.close).toHaveBeenCalled();
    expect(pw.writePrintDocument).not.toHaveBeenCalled();
  });

  it("items が空でも準備中画面を書いてから empty で閉じる", async () => {
    const w = makeWindow();
    const res = await runSnapshotPrint(w, opts({ items: [] }));
    expect(res.status).toBe("empty");
    expect(pw.writePendingDocument).toHaveBeenCalledWith(w, { title: "テスト印刷", total: 0 });
  });
});
