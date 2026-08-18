// @vitest-environment jsdom
// 期間の全体像: 3 種類の帯が並ぶこと、「コマが出ない期間」の警告が出ること。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CutoffTimeline } from "./CutoffTimeline";

afterEach(cleanup);

const mk = (id, grade, day) => ({
  id,
  grade,
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
  timetableId: 1,
});

const SLOTS = [mk(1, "中1", "火"), mk(2, "中1", "金")];
const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-31", grades: [] },
];

function renderTimeline(over = {}) {
  const displayCutoff = over.displayCutoff || {
    groups: [
      { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-07-18" },
    ],
    cohorts: [{ id: "M|中1|火金", label: "中1 火金", grade: "中1", date: "2026-07-17" }],
  };
  render(
    <CutoffTimeline
      timetables={over.timetables || TIMETABLES}
      slots={over.slots || SLOTS}
      displayCutoff={displayCutoff}
    />
  );
}

describe("CutoffTimeline", () => {
  it("時間割・学年グループ・コースの行を出す", () => {
    renderTimeline();
    expect(screen.getByText("1学期")).toBeInTheDocument();
    expect(screen.getByText("中1・2")).toBeInTheDocument();
    expect(screen.getByText("中1 火金")).toBeInTheDocument();
  });

  it("コース行はトグルで隠せる", () => {
    renderTimeline();
    fireEvent.click(screen.getByLabelText("コース別終講日も出す"));
    expect(screen.queryByText("中1 火金")).not.toBeInTheDocument();
    expect(screen.getByText("中1・2")).toBeInTheDocument();
  });

  it("時間割はまだ有効なのに表示期間が終わっていると警告する", () => {
    renderTimeline();
    expect(
      screen.getByText(/時間割はまだ有効なのに表示期間が/)
    ).toBeInTheDocument();
  });

  it("表示期間が時間割と揃っていれば警告しない", () => {
    renderTimeline({
      displayCutoff: {
        groups: [
          { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-08-31" },
        ],
        cohorts: [],
      },
    });
    expect(screen.queryByText(/時間割はまだ有効なのに表示期間が/)).not.toBeInTheDocument();
  });

  it("矛盾した期間 (開始日 > 終了日) を警告する", () => {
    renderTimeline({
      displayCutoff: {
        groups: [
          { label: "中1・2", grades: ["中1"], startDate: "2026-09-01", date: "2026-07-18" },
        ],
        cohorts: [],
      },
    });
    expect(screen.getByText(/期間の指定が矛盾している行が 1 件/)).toBeInTheDocument();
  });

  it("設定が空なら案内だけ出す", () => {
    renderTimeline({
      timetables: [],
      slots: [],
      displayCutoff: { groups: [], cohorts: [] },
    });
    expect(
      screen.getByText(/時間割と表示期間を設定すると、ここに期間の帯が並びます/)
    ).toBeInTheDocument();
  });
});
