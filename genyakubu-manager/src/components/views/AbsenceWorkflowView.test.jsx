// @vitest-environment jsdom
// 欠勤登録の時間割グリッドは「その日に有効な時間割のコマ」だけを出す。
// 曜日だけで絞っていた頃は、期切替で残してある旧期の時間割のコマが重なり、
// 同じクラスが 2 重・3 重に並んでいた (2026-08-20)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AbsenceWorkflowView } from "./AbsenceWorkflowView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

// 2026-09-21 は月曜。
const MON = "2026-09-21";

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", grades: [], startDate: "2026-04-07", endDate: "2026-09-14" },
  { id: 2, name: "2学期", type: "regular", grades: [], startDate: "2026-09-15", endDate: null },
];

const base = {
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "S",
  room: "501",
  subj: "理科",
  teacher: "滝澤",
  note: "",
};

// 同じコマが 1学期 / 2学期 の両方に存在する (期切替でコマは消さない仕様)。
const SLOTS = [
  { ...base, id: 1, timetableId: 1 },
  { ...base, id: 2, timetableId: 2 },
];

function renderView(props = {}) {
  return render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <AbsenceWorkflowView
          slots={SLOTS}
          subs={[]}
          adjustments={[]}
          sessionOverrides={[]}
          holidays={[]}
          examPeriods={[]}
          biweeklyAnchors={[]}
          classSets={[]}
          displayCutoff={{ groups: [], cohorts: [] }}
          partTimeStaff={[]}
          subjects={[]}
          timetables={TIMETABLES}
          saveSubs={vi.fn()}
          saveAdjustments={vi.fn()}
          saveSessionOverrides={vi.fn()}
          isAdmin
          initDate={MON}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe("AbsenceWorkflowView のコマ絞り込み", () => {
  it("旧期 (期間外) の時間割のコマを重ねて出さない", () => {
    renderView();
    // 教科名のカードは 2学期のコマ 1 枚だけ
    expect(screen.getAllByText("理科")).toHaveLength(1);
    // セクション見出しのコマ数も 1
    expect(screen.getByText("1コマ")).toBeTruthy();
  });

  it("旧期の期間内の日付なら旧期のコマだけを出す", () => {
    renderView({ initDate: "2026-09-07" }); // 月曜、1学期の期間内
    expect(screen.getAllByText("理科")).toHaveLength(1);
  });

  it("表示期間 (学年グループ) の開始日より前ならコマを出さず開講前と伝える", () => {
    renderView({
      displayCutoff: {
        groups: [{ label: "中学部", grades: ["中3"], startDate: "2026-10-01", date: null }],
        cohorts: [],
      },
    });
    expect(screen.getByText(/開講前/)).toBeTruthy();
    expect(screen.queryByText("理科")).toBeNull();
  });
});
