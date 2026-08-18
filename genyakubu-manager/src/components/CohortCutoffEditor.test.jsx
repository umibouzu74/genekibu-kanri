// @vitest-environment jsdom
// コース別 終講日: 効き目 (最終授業日・第N回) と設定ミスの警告。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CohortCutoffEditor } from "./CohortCutoffEditor";

afterEach(cleanup);

const mk = (id, day) => ({
  id,
  grade: "中1",
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
});

// 中1 火金コース (deriveCohortsFromSlots が M|中1|火金 を作る)
const SLOTS = [mk(1, "火"), mk(2, "金")];
const COHORT_ID = "M|中1|火金";

function renderEditor(cohortDate, groupPatch = {}) {
  const displayCutoff = {
    groups: [
      {
        label: "中1・2",
        grades: ["中1", "中2"],
        startDate: "2026-04-07",
        date: "2026-07-31",
        ...groupPatch,
      },
    ],
    cohorts: cohortDate
      ? [{ id: COHORT_ID, label: "中1 火金", grade: "中1", date: cohortDate }]
      : [],
  };
  const sessionCtx = {
    classSets: [],
    allSlots: SLOTS,
    displayCutoff,
    timetables: [],
    isOffForGrade: () => false,
    biweeklyAnchors: [],
    holidays: [],
    examPeriods: [],
    sessionOverrides: [],
    daySchedules: [],
    orientationOnFirstDay: true,
  };
  render(
    <CohortCutoffEditor
      slots={SLOTS}
      displayCutoff={displayCutoff}
      onSave={vi.fn()}
      isAdmin
      sessionCtx={sessionCtx}
    />
  );
}

describe("CohortCutoffEditor", () => {
  it("終講日を入れたコースは実際の最終授業日と第N回を出す", () => {
    // 2026-07-18 は土曜 → 火金コースの最後は 7/17 (金)
    renderEditor("2026-07-18");
    expect(screen.getByText(/最終授業日 2026-07-17 \(金\)/)).toBeInTheDocument();
    expect(screen.getByText(/第\d+回/)).toBeInTheDocument();
  });

  it("終講日が未設定なら最終授業日は出さない", () => {
    renderEditor(null);
    expect(screen.queryByText(/最終授業日/)).not.toBeInTheDocument();
  });

  it("グループ終了日より後なら従来どおり警告する", () => {
    renderEditor("2026-08-10");
    expect(screen.getByText(/グループ終了日 \(2026-07-31\) より後です/)).toBeInTheDocument();
  });

  it("グループ開始日より前なら警告する", () => {
    renderEditor("2026-04-01");
    expect(screen.getByText(/グループ開始日 \(2026-04-07\) より前です/)).toBeInTheDocument();
  });
});
