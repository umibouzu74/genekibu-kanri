// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// popup まわりの副作用は丸ごと差し替える (jsdom に window.open は無い)。
// yieldToBrowser だけは本物 (MessageChannel) を使い、ループが実際に
// 1 タスク譲ることを含めて回す。
const pw = vi.hoisted(() => ({
  openPrintWindow: vi.fn(),
  writePendingDocument: vi.fn(),
  updatePendingProgress: vi.fn(),
  writePrintDocument: vi.fn(),
}));
vi.mock("../utils/printWindow", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ...pw };
});

import { usePrintJobs } from "./usePrintJobs";
import { VIEWS } from "../constants/views";

const makeWindow = () => ({ closed: false, close: vi.fn() });
const toasts = { error: vi.fn(), info: vi.fn(), success: vi.fn() };

// selected / view / monthOff を持つ最小の App 代わり。月間ビューの代わりに
// .month-print-root を 1 つ描き、講師名と渡された visibility を埋め込む
function Harness({ onReady, visibilityForBatchTeacher, eventVisibility }) {
  const [selected, setSelected] = useState("奥村");
  const [view, setView] = useState(VIEWS.MONTH);
  const [monthOff, setMonthOff] = useState(0);
  const jobs = usePrintJobs({
    view,
    selected,
    monthOff,
    vy: 2026,
    vm: 9,
    eventVisibility,
    visibilityForBatchTeacher,
    setSelected,
    setView,
    setMonthOff,
    toasts,
  });
  onReady(jobs, { selected, view, monthOff });
  const vis = jobs.batchVisibility ?? eventVisibility;
  return (
    <div>
      <span data-testid="selected">{selected}</span>
      <div className="month-print-root" data-teacher={selected} data-off={monthOff}>
        {selected}:{JSON.stringify(vis?.tagFilters || {})}
      </div>
    </div>
  );
}

function mount(props = {}) {
  let latest = null;
  let state = null;
  const eventVisibility = props.eventVisibility ?? { exam: true, tagFilters: { 西: false } };
  render(
    <Harness
      eventVisibility={eventVisibility}
      visibilityForBatchTeacher={props.visibilityForBatchTeacher}
      onReady={(jobs, st) => {
        latest = jobs;
        state = st;
      }}
    />
  );
  return { jobs: () => latest, state: () => state };
}

// 講師ごとの表示設定: 名前をキーにしたタグフィルタを返す (中身は問わない)
const perTeacher = (t) => ({ exam: true, tagFilters: { [`${t}のタグ`]: false } });

describe("usePrintJobs.handleBatchPrint", () => {
  let w;
  beforeEach(() => {
    w = makeWindow();
    pw.openPrintWindow.mockReturnValue(w);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("popup に準備中画面を書き、1 枚ごとに進捗を更新してから紙面を書き込む", async () => {
    const h = mount({ visibilityForBatchTeacher: perTeacher });
    await act(async () => {
      await h.jobs().handleBatchPrint(["奥村", "杉原"], [{ year: 2026, month: 9 }]);
    });
    expect(pw.writePendingDocument).toHaveBeenCalledWith(
      w,
      expect.objectContaining({ total: 2 })
    );
    expect(pw.updatePendingProgress.mock.calls.map((c) => c[1])).toEqual([
      { current: 1, total: 2, name: "奥村" },
      { current: 2, total: 2, name: "杉原" },
    ]);
    expect(pw.writePrintDocument).toHaveBeenCalledTimes(1);
    const { bodyHtml } = pw.writePrintDocument.mock.calls[0][1];
    // 講師ごとに導出した表示設定で描かれている (最初の講師のタグに固定されない)
    expect(bodyHtml).toContain('奥村:{"奥村のタグ":false}');
    expect(bodyHtml).toContain('杉原:{"杉原のタグ":false}');
    expect(bodyHtml.indexOf("奥村:")).toBeLessThan(bodyHtml.indexOf("杉原:"));
    // 終わったら元の講師に戻り、講師ごとの表示設定も解除される
    expect(screen.getByTestId("selected").textContent).toBe("奥村");
    expect(h.jobs().batchVisibility).toBeNull();
    expect(h.jobs().batchPrintBusy).toBe(false);
  });

  it('tagMode "current" は今の表示設定をそのまま全員に使う', async () => {
    const h = mount({ visibilityForBatchTeacher: perTeacher });
    await act(async () => {
      await h
        .jobs()
        .handleBatchPrint(["奥村", "杉原"], [{ year: 2026, month: 9 }], { tagMode: "current" });
    });
    const { bodyHtml } = pw.writePrintDocument.mock.calls[0][1];
    expect(bodyHtml).toContain('奥村:{"西":false}');
    expect(bodyHtml).toContain('杉原:{"西":false}');
    expect(bodyHtml).not.toContain("のタグ");
  });

  it("popup を閉じられたら中断し、紙面は書き込まない", async () => {
    const h = mount({ visibilityForBatchTeacher: perTeacher });
    // 1 枚目の進捗を出した直後にタブが閉じられた状況
    pw.updatePendingProgress.mockImplementationOnce(() => {
      w.closed = true;
    });
    await act(async () => {
      await h.jobs().handleBatchPrint(["奥村", "杉原", "河野"], [{ year: 2026, month: 9 }]);
    });
    expect(pw.writePrintDocument).not.toHaveBeenCalled();
    expect(pw.updatePendingProgress).toHaveBeenCalledTimes(1);
    expect(toasts.info).toHaveBeenCalledWith(expect.stringContaining("中断"));
    // 閉じられた window を閉じ直さない
    expect(w.close).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected").textContent).toBe("奥村");
    expect(h.jobs().batchPrintBusy).toBe(false);
  });

  it("中断ボタン (AbortController) でも同様に止まり、popup は閉じる", async () => {
    const h = mount({ visibilityForBatchTeacher: perTeacher });
    pw.updatePendingProgress.mockImplementationOnce(() => {
      h.jobs().handleBatchPrintAbort();
    });
    await act(async () => {
      await h.jobs().handleBatchPrint(["奥村", "杉原"], [{ year: 2026, month: 9 }]);
    });
    expect(pw.writePrintDocument).not.toHaveBeenCalled();
    expect(w.close).toHaveBeenCalled();
    expect(toasts.info).toHaveBeenCalledWith("一括印刷を中断しました");
  });

  it("ポップアップがブロックされたらエラー toast だけ出して何もしない", async () => {
    pw.openPrintWindow.mockReturnValue(null);
    const h = mount({ visibilityForBatchTeacher: perTeacher });
    await act(async () => {
      await h.jobs().handleBatchPrint(["奥村"], [{ year: 2026, month: 9 }]);
    });
    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("ポップアップ"));
    expect(pw.writePendingDocument).not.toHaveBeenCalled();
  });
});
