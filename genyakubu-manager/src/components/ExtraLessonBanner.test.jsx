// @vitest-environment jsdom
// 追加授業バナー (Dashboard 日別 / 時間割グリッドで共有) の骨格を固定する。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

  it("0 件なら何も描画しない", () => {
    const { container } = render(<ExtraLessonBanner lessons={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
