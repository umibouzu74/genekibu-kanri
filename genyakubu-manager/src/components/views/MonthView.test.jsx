// @vitest-environment jsdom
// 月次カレンダーの講習コマ反映 (講習時間割作成からの読み取り専用表示) を固定する。
// 変換ロジック自体は utils/builderLessons.test.js が担うので、ここでは
// 「本人の分だけ載る」「カットオフ日の未確定より講習カードが優先」を見る。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MonthView } from "./MonthView";

afterEach(cleanup);

const KOSHU_LESSON = {
  key: "1:1:1:堀上:英語",
  date: "2026-07-24",
  dateLabel: "7/24(金)",
  time: "13:00-13:45",
  periodLabel: "1限",
  teacher: "堀上",
  subj: "英語",
  grade: "中3",
  cls: "３S/３A",
  tabName: "中3",
  projectName: "2026夏期",
};

const baseProps = {
  teacher: "堀上",
  slots: [],
  holidays: [],
  subs: [],
  adjustments: [],
  year: 2026,
  month: 7,
  isAdmin: false,
  timetables: [],
  displayCutoff: null,
  examPeriods: [],
  examPrepSchedules: [],
  specialEvents: [],
  extraLessons: [],
  classSets: [],
  biweeklyAnchors: [],
  sessionOverrides: [],
};

describe("MonthView 講習コマ", () => {
  it("担当講師のセルに「講」バッジ付きカードを表示する", () => {
    render(<MonthView {...baseProps} koshuLessons={[KOSHU_LESSON]} />);
    expect(screen.getByText("講")).toBeInTheDocument();
    expect(screen.getByText("３S/３A")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    expect(screen.getByText(/英語/)).toBeInTheDocument();
  });

  it("他講師の講習コマは表示しない", () => {
    render(
      <MonthView
        {...baseProps}
        koshuLessons={[{ ...KOSHU_LESSON, teacher: "半田" }]}
      />
    );
    expect(screen.queryByText("講")).not.toBeInTheDocument();
  });

  it("カットオフ超過日でも講習コマは表示し、その日は「未確定」を出さない", () => {
    // 全学年グループの表示終了が 6/30 → 7 月の全セルがカットオフ超過
    const displayCutoff = {
      groups: [{ label: "全", grades: [], startDate: null, date: "2026-06-30" }],
    };
    render(
      <MonthView
        {...baseProps}
        displayCutoff={displayCutoff}
        koshuLessons={[KOSHU_LESSON]}
      />
    );
    expect(screen.getByText("講")).toBeInTheDocument();
    expect(screen.getByText(/英語/)).toBeInTheDocument();
    // 2026-07 は 31 日。講習コマのある 7/24 だけ「未確定」を出さない
    expect(screen.getAllByText("未確定")).toHaveLength(30);
  });
});
