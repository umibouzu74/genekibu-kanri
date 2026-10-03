// @vitest-environment jsdom
// 授業時間の集計 (旧「講師比較」)。期間内に講師ごとに教えた分を一覧する。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TeachingMinutesView } from "./TeachingMinutesView";

const slots = [
  { id: 1, day: "月", time: "19:00-20:20", grade: "中2", cls: "A", subj: "数学", teacher: "奥村", note: "" },
  { id: 2, day: "火", time: "19:00-19:45", grade: "中3", cls: "A", subj: "英語", teacher: "河野", note: "" },
];

function setPeriod(start, end) {
  fireEvent.change(screen.getByLabelText("開始日"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("終了日"), { target: { value: end } });
}

// 表の講師行 (行見出し = 講師名) のセルの文字
function rowCells(name) {
  const header = screen.getByRole("rowheader", { name: new RegExp(name) });
  return within(header.closest("tr"))
    .getAllByRole("cell")
    .map((c) => c.textContent);
}

describe("TeachingMinutesView", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("期間内に授業のあった全員の分を出し、講師ボタンで絞り込める", () => {
    render(<TeachingMinutesView slots={slots} />);
    // 2026-09-07 (月) 〜 2026-09-13: 奥村 80 分 / 河野 45 分
    setPeriod("2026-09-07", "2026-09-13");
    expect(rowCells("奥村")[0]).toBe("80 分");
    expect(rowCells("河野")[0]).toBe("45 分");
    expect(screen.getByRole("rowheader", { name: "合計" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "河野", pressed: false }));
    expect(screen.queryByRole("rowheader", { name: /奥村/ })).toBeNull();
    expect(rowCells("河野")[0]).toBe("45 分");
    // 選んだ講師は覚えておく (次に開いたときも同じ人で見られる)
    expect(JSON.parse(localStorage.getItem("teachingMinutes.selected"))).toEqual(["河野"]);
  });

  it("代行は代行者の時間になる", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
    ];
    render(<TeachingMinutesView slots={slots} subs={subs} />);
    setPeriod("2026-09-07", "2026-09-07");
    expect(rowCells("福江")[0]).toBe("80 分");
    expect(screen.queryByRole("rowheader", { name: /奥村/ })).toBeNull();
    // 種別が 1 つだけなら内訳の列は合計と同じなので出さない
    expect(screen.queryByRole("columnheader", { name: "代行" })).toBeNull();
    // 通常授業 (火曜の河野) が加わると内訳の列が出る
    setPeriod("2026-09-07", "2026-09-08");
    expect(screen.getByRole("columnheader", { name: "代行" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "通常授業" })).toBeTruthy();
  });

  it("前に合計から外したまま保存された種別しか無い期間でも、チェックを戻せる", () => {
    localStorage.setItem("teachingMinutes.includedKinds", JSON.stringify(["koshu"]));
    render(<TeachingMinutesView slots={slots} />);
    setPeriod("2026-09-07", "2026-09-07");
    expect(rowCells("奥村")[0]).toBe("0 分");
    const own = screen.getByRole("checkbox", { name: "通常授業" });
    expect(own.checked).toBe(false);
    fireEvent.click(own);
    expect(rowCells("奥村")[0]).toBe("80 分");
  });

  it("明細は ▶ ボタンで開閉できる (キーボードでも操作できる)", () => {
    render(<TeachingMinutesView slots={slots} />);
    setPeriod("2026-09-07", "2026-09-07");
    const toggle = screen.getByRole("button", { name: "奥村 の明細を開く" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "奥村 の明細を閉じる" }).getAttribute("aria-expanded")
    ).toBe("true");
    expect(screen.getByText("中2A 数学")).toBeTruthy();
  });

  it("合計に含める種別を外すと、合計からその分が抜ける", () => {
    const koshuLessons = [
      { kind: "koshu", date: "2026-09-12", time: "13:00-13:45", teacher: "奥村", grade: "中3", cls: "S", subj: "数学" },
    ];
    render(<TeachingMinutesView slots={slots} koshuLessons={koshuLessons} />);
    setPeriod("2026-09-07", "2026-09-13");
    expect(rowCells("奥村")[0]).toBe("125 分");
    fireEvent.click(screen.getByRole("checkbox", { name: "講習" }));
    expect(rowCells("奥村")[0]).toBe("80 分");
    // 種別の列は残し、合計外と分かるようにする
    expect(screen.getByRole("columnheader", { name: "講習 (合計外)" })).toBeTruthy();
  });

  it("代行未定のままの欠勤は注意書きで知らせる", () => {
    const subs = [
      { id: 1, date: "2026-09-07", slotId: 1, originalTeacher: "奥村", substitute: "", status: "requested" },
    ];
    render(<TeachingMinutesView slots={slots} subs={subs} />);
    setPeriod("2026-09-07", "2026-09-08");
    expect(screen.getByText(/代行未定のままの欠勤が 1 件あります/)).toBeTruthy();
  });

  it("紙面のタイトルは集計の期間 (data-print-title)。操作部は紙面に出さない", () => {
    const { container } = render(<TeachingMinutesView slots={slots} />);
    setPeriod("2026-09-07", "2026-09-13");
    expect(container.querySelector("[data-print-title]").getAttribute("data-print-title")).toBe(
      "授業時間の集計 2026/9/7 〜 2026/9/13"
    );
    expect(screen.getByLabelText("開始日").closest(".no-print")).toBeTruthy();
    expect(screen.getByRole("button", { name: /集計 CSV/ }).closest(".no-print")).toBeTruthy();
  });

  it("← / → で月を送る", () => {
    render(<TeachingMinutesView slots={slots} />);
    const label = () => screen.getByRole("button", { name: /年\d+月分$/ }).textContent;
    const before = label();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(label()).not.toBe(before);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(label()).toBe(before);
  });
});
