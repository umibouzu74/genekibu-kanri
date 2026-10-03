// @vitest-environment jsdom
// 授業時間の集計 (旧「講師比較」)。期間内に講師ごとに教えた分を一覧する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TeachingMinutesView } from "./TeachingMinutesView";
import { LS, SS } from "../../constants/storageKeys";

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
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
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
    expect(JSON.parse(localStorage.getItem(LS.teachingMinutesSelected))).toEqual(["河野"]);
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
    localStorage.setItem(LS.teachingMinutesIncluded, JSON.stringify(["koshu"]));
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
    // ラベルは固定で、開閉は aria-expanded だけで伝える (読み上げが二重にならない)
    const toggle = screen.getByRole("button", { name: "奥村 の明細" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
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

  // 別の単価で払う列 (合計から外した種別) を見る人にこそ、終了時刻なしを知らせる
  it("合計から外した種別の終了時刻なしも、列と注意書きに出す", () => {
    const extraLessons = [
      { id: 1, date: "2026-09-12", time: "10:00", grade: "中3", subj: "補講", teacher: "奥村" },
    ];
    localStorage.setItem(LS.teachingMinutesIncluded, JSON.stringify(["own"]));
    render(<TeachingMinutesView slots={slots} extraLessons={extraLessons} />);
    setPeriod("2026-09-07", "2026-09-13");
    // 合計 / 時間換算 / 通常授業 / 追加授業 (合計外) / …
    expect(rowCells("奥村")[0]).toBe("80 分");
    expect(rowCells("奥村")[3]).toBe("— (⚠終了時刻なし 1)");
    expect(screen.getByText(/終了時刻なしのコマが 1 件あります/)).toBeTruthy();
  });

  it("講師名からその月の月間を開き、戻ってきたときは同じ期間のまま", () => {
    const onSelectTeacher = vi.fn();
    render(<TeachingMinutesView slots={slots} onSelectTeacher={onSelectTeacher} />);
    // 終了日を変えると「◯月分」も終了日の月に合う
    setPeriod("2026-09-01", "2026-09-30");
    const monthBtn = () => screen.getByRole("button", { name: /年\d+月分$/ });
    expect(monthBtn().textContent).toBe("2026年9月分");
    const header = screen.getByRole("rowheader", { name: /奥村/ });
    fireEvent.click(within(header).getByRole("button", { name: "奥村" }));
    expect(onSelectTeacher).toHaveBeenCalledWith("奥村", { month: "2026-09" });

    // 同じタブで開き直すと (月間から戻ってきたとき)、前に見ていた期間のまま
    cleanup();
    render(<TeachingMinutesView slots={slots} />);
    expect(monthBtn().textContent).toBe("2026年9月分");
    expect(screen.getByLabelText("開始日").value).toBe("2026-09-01");
    expect(sessionStorage.getItem(SS.teachingMinutesPeriod)).toContain("2026-09-30");
  });

  it("選んだバイトは授業の無い月でも選択に残る (表に 0 で出す)", () => {
    localStorage.setItem(LS.teachingMinutesSelected, JSON.stringify(["新人"]));
    render(<TeachingMinutesView slots={slots} partTimeStaff={[{ name: "新人" }]} />);
    setPeriod("2026-09-07", "2026-09-13");
    expect(screen.getByText("1 名を選択中")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: /新人/ })).toBeTruthy();
    expect(rowCells("新人")[0]).toBe("—");
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
