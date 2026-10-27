// @vitest-environment jsdom
// 💳 バイトのカード忘れを記録するダイアログ: その日に授業がある人を先に出す・
// 記録して閉じる (6 秒の「元に戻す」)・記録のある (人, 日) は読み込んで直す / 消す・
// 時刻は任意で読めない時刻は止める。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CardForgetDialog } from "./CardForgetDialog";
import { ToastProvider } from "../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 2026-10-27 (火)
  vi.setSystemTime(new Date(2026, 9, 27, 18, 0, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const slot = (id, o) => ({ id, cls: "", room: "", note: "", ...o });
// 火曜に授業があるのは川井だけ
const lessonData = {
  slots: [
    slot(1, { day: "火", time: "17:00-18:20", grade: "中3", subj: "理科", teacher: "川井" }),
    slot(2, { day: "水", time: "19:00-20:00", grade: "中2", subj: "数学", teacher: "奥村" }),
  ],
};
const staffNames = ["奥村", "川井", "杉原"];

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
      <CardForgetDialog staffNames={staffNames} lessonData={lessonData} {...props} />
    </ToastProvider>
  );
}

// onSave に渡った updater を順に当てた結果
const applySaves = (onSave, start = []) => onSave.mock.calls.reduce((cur, [u]) => (typeof u === "function" ? u(cur) : u), start);

describe("CardForgetDialog", () => {
  it("その日に授業がある人を先に (時間帯つき) 出し、記録して閉じる。元に戻せる", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderDialog({ records: [], onSave, onClose });
    const working = screen.getByText("この日に授業がある人").parentElement;
    expect(within(working).getAllByRole("button").map((b) => b.textContent)).toEqual(["川井17:00〜18:20"]);
    expect(screen.getByText("その他のバイト")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^川井/ }));
    expect(screen.getByText("川井 のこの日の授業: 17:00〜18:20")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("出勤"), { target: { value: "１６５０" } });
    fireEvent.change(screen.getByLabelText("メモ (任意)"), { target: { value: "責任者が確認" } });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));

    expect(applySaves(onSave)).toEqual([
      {
        id: 1,
        name: "川井",
        date: "2026-10-27",
        missing: "both",
        inTime: "16:50",
        memo: "責任者が確認",
        recordedAt: new Date(2026, 9, 27, 18, 0, 0).toISOString(),
      },
    ]);
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("川井 10/27 (火) のカード忘れを記録しました")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(applySaves(onSave)).toEqual([]);
  });

  it("記録のある (人, 日) は読み込んで直す / 消す", () => {
    const records = [
      { id: 4, name: "奥村", date: "2026-10-21", missing: "out", outTime: "21:10", memo: "鍵当番" },
    ];
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderDialog({ records, onSave, onClose, initial: { name: "奥村", date: "2026-10-21" } });
    expect(screen.getByText(/この日の記録があります/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "退勤だけ" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("退勤").value).toBe("21:10");
    expect(screen.queryByLabelText("出勤")).toBeNull();
    expect(screen.getByRole("button", { name: "直して保存" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "この記録を消す" }));
    expect(applySaves(onSave, records)).toEqual([]);
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(applySaves(onSave, records)).toEqual(records);
  });

  it("人を選んでいない・読めない時刻・退勤が出勤より前は保存しない", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderDialog({ records: [], onSave, onClose });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(screen.getByText("バイトを選んでください")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^杉原/ }));
    fireEvent.change(screen.getByLabelText("出勤"), { target: { value: "25:00" } });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(screen.getByText("時刻は 0:00〜23:59 で入れてください")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("出勤"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("退勤"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(screen.getByText("退勤は出勤より後の時刻にしてください")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("日付を変えても入れかけの内容は残し、記録のある日なら読み込む", () => {
    const records = [{ id: 1, name: "杉原", date: "2026-10-20", missing: "in", inTime: "17:55" }];
    renderDialog({ records, onSave: vi.fn(), onClose: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /^杉原/ }));
    fireEvent.change(screen.getByLabelText("メモ (任意)"), { target: { value: "あとで確認" } });
    fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2026-10-26" } });
    expect(screen.getByLabelText("メモ (任意)").value).toBe("あとで確認");
    fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2026-10-20" } });
    expect(screen.getByLabelText("出勤").value).toBe("17:55");
    expect(screen.getByLabelText("メモ (任意)").value).toBe("");
  });
});
