// @vitest-environment jsdom
// 追加授業バナー (Dashboard 日別 / 時間割グリッドで共有) の骨格を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExtraLessonBanner } from "./ExtraLessonBanner";

afterEach(cleanup);

const LESSON = {
  id: 1,
  date: "2026-07-25",
  time: "18:30-20:00",
  grade: "中3",
  cls: "A",
  room: "亀73",
  subj: "プレップ個別指導",
  teacher: "香川·福江",
  label: "夏期講習",
  note: "テキスト持参",
};

describe("ExtraLessonBanner", () => {
  it("種別ラベル・時間・対象・担当・教室を表示する", () => {
    render(<ExtraLessonBanner lessons={[LESSON]} />);
    expect(screen.getByText("追加授業 夏期講習")).toBeInTheDocument();
    expect(screen.getByText("18:30-20:00")).toBeInTheDocument();
    expect(screen.getByText(/中3A プレップ個別指導/)).toBeInTheDocument();
    expect(screen.getByText("香川·福江")).toBeInTheDocument();
    expect(screen.getByText("@亀73")).toBeInTheDocument();
    // メモは title (ツールチップ) に出る
    expect(screen.getByTitle("テキスト持参")).toBeInTheDocument();
  });

  it("label 無しは「追加授業」のみ、任意項目は省略される", () => {
    render(
      <ExtraLessonBanner
        lessons={[{ id: 2, time: "17:00-18:00", grade: "中1", cls: "", subj: "英語補講", teacher: "", label: "", note: "" }]}
      />
    );
    expect(screen.getByText("追加授業")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it("onEditExtraLesson を渡すと行がボタンになり、クリック / Enter / Space で id を渡す", () => {
    const onEditExtraLesson = vi.fn();
    render(<ExtraLessonBanner lessons={[LESSON]} onEditExtraLesson={onEditExtraLesson} />);
    const row = screen.getByRole("button", { name: /プレップ個別指導/ });
    expect(row.getAttribute("tabindex")).toBe("0");
    // 行内の道具なのでモバイルの 40px 規則から外す
    expect(row.className).toContain("inline-activate");
    // メモは残しつつ、クリックで編集できることも title で伝える
    expect(row.getAttribute("title")).toContain("テキスト持参");
    expect(row.getAttribute("title")).toContain("編集");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "a" });
    expect(onEditExtraLesson).toHaveBeenCalledTimes(3);
    expect(onEditExtraLesson).toHaveBeenCalledWith(1);
  });

  it("onEditExtraLesson が無ければ従来どおり素の行 (role / tabindex 無し)", () => {
    render(<ExtraLessonBanner lessons={[LESSON]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTitle("テキスト持参").getAttribute("tabindex")).toBeNull();
  });

  it("0 件なら何も描画しない", () => {
    const { container } = render(<ExtraLessonBanner lessons={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
