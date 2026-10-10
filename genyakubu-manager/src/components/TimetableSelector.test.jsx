// @vitest-environment jsdom
// ヘッダの時間割セレクタ。選択は端末ごと (localStorage) なので、期切替の
// あと旧期を表示したままの端末が出る。選択肢に「今日有効 / 終了 / 開始前」を
// 出し、表示中の時間割が今日有効でないときは切り替えを促す (勝手には
// 切り替えない)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimetableSelector } from "./TimetableSelector";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0)); // 2026-09-26 (土)
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TERM1 = { id: 1, name: "1学期", type: "regular", startDate: "2026-04-01", endDate: "2026-08-31", grades: [] };
const TERM2 = { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] };
const TERM3 = { id: 3, name: "3学期", type: "regular", startDate: "2027-01-08", endDate: "2027-03-20", grades: [] };

function renderSelector(props = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TimetableSelector
      timetables={[TERM1, TERM2, TERM3]}
      activeTimetableId={2}
      onChange={onChange}
      {...props}
    />
  );
  return { ...utils, onChange };
}

function optionTexts() {
  return screen.getAllByRole("option").map((o) => o.textContent);
}

describe("TimetableSelector の状態表示", () => {
  it("選択肢の名前の後ろに今日から見た状態を付ける", () => {
    renderSelector();
    expect(optionTexts()).toEqual([
      "1学期 (2026-04-01〜2026-08-31) (終了)",
      "2学期 (今日有効)",
      "3学期 (2027-01-08〜2027-03-20) (開始前 1/8〜)",
    ]);
  });

  it("学年を絞った時間割も自分の対象学年にとって有効なら「今日有効」", () => {
    const chu3 = { id: 4, name: "中3 2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: ["中3"] };
    renderSelector({ timetables: [TERM1, chu3], activeTimetableId: 4 });
    expect(optionTexts()).toContain("中3 2学期 (今日有効)");
  });

  it("時間割が 1 つ以下なら何も出さない (従来どおり)", () => {
    const { container } = renderSelector({ timetables: [TERM1], activeTimetableId: 1 });
    expect(container.innerHTML).toBe("");
  });
});

describe("TimetableSelector の切り替えの注意書き", () => {
  it("表示中が今日有効なら注意書きを出さない", () => {
    renderSelector({ activeTimetableId: 2 });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("表示中が終了していれば終了日と切り替えボタンを出す。押すまで切り替えない", () => {
    const { onChange } = renderSelector({ activeTimetableId: 1 });
    expect(screen.getByRole("combobox").value).toBe("1");
    const note = screen.getByRole("status");
    expect(note.textContent).toContain("表示中の「1学期」は 8/31 で終了しています");
    expect(note.classList.contains("no-print")).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "2学期 (今日有効) に切り替える" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("開始前の時間割を表示中でも出す", () => {
    const { onChange } = renderSelector({ activeTimetableId: 3 });
    expect(screen.getByRole("status").textContent).toContain(
      "表示中の「3学期」はまだ開始前です (1/8〜)"
    );
    fireEvent.click(screen.getByRole("button", { name: "2学期 (今日有効) に切り替える" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("他に今日有効な時間割が無ければ出さない (切り替え先が無い)", () => {
    renderSelector({ timetables: [TERM1, TERM3], activeTimetableId: 1 });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("今日有効な時間割が複数あれば並び順の先頭を出し、残りの件数を添える", () => {
    const chu3 = { id: 4, name: "中3 2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: ["中3"] };
    renderSelector({ timetables: [TERM1, chu3, TERM2], activeTimetableId: 1 });
    expect(screen.getByRole("button", { name: "中3 2学期 (今日有効) に切り替える" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("ほか 1 件はプルダウンから");
  });

  it("プルダウンで選べば onChange に数値の id を渡す", () => {
    const { onChange } = renderSelector({ activeTimetableId: 1 });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
