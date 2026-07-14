// @vitest-environment jsdom
// ダッシュボード時間割モードの表示期間フィルタ: 終講日後・時間割適用期間外の
// コマを表示しないこと (日別リストと同じ判定) を固定する。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExcelGridView } from "./ExcelGridView";

afterEach(cleanup);

// 2026-07-13 は月曜日。テストは viewDate 固定なのでシステム時刻に依存しない。
const MONDAY = "2026-07-13";

const slot = (overrides) => ({
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "-",
  room: "301",
  subj: "数学",
  teacher: "田中",
  note: "",
  ...overrides,
});

function renderGrid(props = {}) {
  return render(
    <ExcelGridView
      slots={[]}
      saveSlots={() => {}}
      biweeklyAnchors={[]}
      isAdmin={false}
      timetables={[]}
      partTimeStaff={[]}
      subjects={[]}
      subs={[]}
      saveSubs={() => {}}
      holidays={[]}
      examPeriods={[]}
      subjectCategories={[]}
      teacherSubjects={{}}
      classSets={[]}
      displayCutoff={null}
      viewDate={MONDAY}
      dashboardMode
      {...props}
    />
  );
}

describe("ExcelGridView (ダッシュボード表示期間フィルタ)", () => {
  it("終講日を過ぎた学年グループのコマは表示しない (他グループは表示)", () => {
    renderGrid({
      slots: [
        slot({ id: 1, grade: "中3", teacher: "田中" }),
        slot({ id: 2, grade: "高3", subj: "高松西 英語", room: "701", teacher: "佐藤" }),
      ],
      displayCutoff: {
        groups: [
          { grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" },
          { grades: ["高3"], startDate: "2026-04-01", date: "2026-07-31" },
        ],
      },
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(screen.getByText("佐藤")).toBeInTheDocument();
  });

  it("コホート別終講日を過ぎたコースのコマだけ表示しない", () => {
    renderGrid({
      slots: [
        slot({ id: 1, grade: "中3", teacher: "田中" }),
        slot({ id: 2, grade: "中1", teacher: "鈴木" }),
      ],
      displayCutoff: {
        groups: [{ grades: ["中1", "中3"], startDate: "2026-04-01", date: "2026-07-31" }],
        cohorts: [{ id: "M|中3|月木", date: "2026-07-10" }],
      },
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(screen.getByText("鈴木")).toBeInTheDocument();
  });

  it("全グループが期間外の日は未確定バナーを出しコマを表示しない", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" }],
      },
    });
    expect(screen.getByText("この日以降の予定は未確定です")).toBeInTheDocument();
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
  });

  it("時間割の適用期間外のコマは表示せず案内を出す", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      timetables: [
        { id: 1, name: "通常", startDate: "2026-04-01", endDate: "2026-07-10", grades: [] },
      ],
      activeTimetableId: 1,
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(
      screen.getByText("表示期間外のため、この日に表示するコマはありません")
    ).toBeInTheDocument();
  });

  it("表示期間内のコマは通常どおり表示する", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      timetables: [
        { id: 1, name: "通常", startDate: "2026-04-01", endDate: "2026-07-31", grades: [] },
      ],
      activeTimetableId: 1,
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-31" }],
      },
    });
    expect(screen.getByText("田中")).toBeInTheDocument();
  });

  it("非ダッシュボードモード (マスター表示) では終講日後もフィルタしない", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" }],
      },
      dashboardMode: false,
      isAdmin: true,
    });
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(
      screen.queryByText("この日以降の予定は未確定です")
    ).not.toBeInTheDocument();
  });
});
