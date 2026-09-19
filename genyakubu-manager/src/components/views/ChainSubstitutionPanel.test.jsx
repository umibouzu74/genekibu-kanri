// @vitest-environment jsdom
// 玉突き代行の「空き講師」は「その日のコマの講師」で閉じない — 常勤は
// その曜日にコマが無くても代行に入る (2026-09-10 の西岡)。その日に担当の
// 無い講師も「この日は担当なし」で候補に出し、並びは関連度 → よみ順。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChainSubstitutionPanel } from "./ChainSubstitutionPanel";

afterEach(cleanup);

// 2026-04-13 は月曜
const MONDAY = "2026-04-13";
const SUBJECTS = [
  { id: 1, name: "英語", categoryId: 1 },
  { id: 2, name: "数学", categoryId: 2 },
];
const SLOTS = [
  { id: 1, day: "月", time: "19:00-20:20", grade: "高1", cls: "S", subj: "英語", teacher: "山田", note: "", room: "601" },
  // 月曜にはコマが無い常勤 2 人 (よみは いしはら < ほりかみ、文字列順は逆)
  { id: 2, day: "火", time: "19:00-20:20", grade: "高1", cls: "S", subj: "英語", teacher: "堀上", note: "" },
  { id: 3, day: "火", time: "20:30-21:50", grade: "高1", cls: "S", subj: "英語", teacher: "石原", note: "" },
];
const PART_TIME = [{ name: "バイト数学", subjectIds: [2] }];
const KANA = { 堀上: "ほりかみ", 石原: "いしはら", バイト数学: "ばいとすうがく", 山田: "やまだ" };

function renderPanel(props = {}) {
  const saveSubs = vi.fn();
  render(
    <ChainSubstitutionPanel
      initDate={MONDAY}
      slots={SLOTS}
      subs={[
        // 山田 が欠勤・代行未定
        { id: 1, date: MONDAY, slotId: 1, originalTeacher: "山田", substitute: "", status: "requested", memo: "" },
      ]}
      holidays={[]}
      examPeriods={[]}
      partTimeStaff={PART_TIME}
      subjects={SUBJECTS}
      subjectCategories={[]}
      timetables={[]}
      biweeklyAnchors={[]}
      teacherSubjects={{}}
      teacherKana={KANA}
      saveSubs={saveSubs}
      isAdmin
      {...props}
    />
  );
  return { saveSubs };
}

function availableSection() {
  const heading = screen.getByText(/^空き講師/);
  return heading.parentElement;
}

describe("ChainSubstitutionPanel — その日に担当の無い講師", () => {
  it("提案を作成すると、その日にコマの無い講師が「この日は担当なし」で空き講師に並ぶ", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "提案を作成" }));
    const sec = availableSection();
    expect(within(sec).getByText(/空き講師 \(3名\)/)).toBeTruthy();
    expect(within(sec).getAllByText("この日は担当なし")).toHaveLength(3);
    // 欠勤している 山田 本人は空き講師ではない
    expect(within(sec).queryByText("山田")).toBeNull();
  });

  it("空き講師の並びはよみのあいうえお順 (石原 → 堀上)", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "提案を作成" }));
    const sec = availableSection();
    const names = within(sec)
      .getAllByText(/^(堀上|石原|バイト数学)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(["石原", "バイト数学", "堀上"]);
  });

  it("担当なしの講師が代行の提案に使われる (英語のコマには英語の 石原 が入る)", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "提案を作成" }));
    const select = screen.getByRole("combobox", { name: /の代行者$/ });
    expect(select.value).toBe("石原");
  });

  it("手動追加は一覧に無い名前も直接入力できる", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "提案を作成" }));
    const input = screen.getByLabelText("手動追加する講師");
    fireEvent.change(input, { target: { value: "新任" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    const sec = availableSection();
    expect(within(sec).getByText("新任")).toBeTruthy();
    expect(within(sec).getByText("手動追加")).toBeTruthy();
    expect(within(sec).getByText(/空き講師 \(4名\)/)).toBeTruthy();
  });

  it("既に空き講師に居る名前は手動追加できない", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "提案を作成" }));
    fireEvent.change(screen.getByLabelText("手動追加する講師"), { target: { value: "石原" } });
    expect(screen.getByRole("button", { name: "追加" }).disabled).toBe(true);
    expect(screen.getByText(/既に空き講師に入っています/)).toBeTruthy();
  });
});
