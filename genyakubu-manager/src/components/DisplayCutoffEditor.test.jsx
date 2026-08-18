// @vitest-environment jsdom
// 表示期間設定: 効き目の表示 (対象コマ数・最終授業日) と設定ミスの警告。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DisplayCutoffEditor } from "./DisplayCutoffEditor";

afterEach(cleanup);

const mk = (id, grade, day, extras = {}) => ({
  id,
  grade,
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
  ...extras,
});

// 中1 火曜 / 中2 月曜 / どのグループにも属さない「附中」水曜
const SLOTS = [mk(1, "中1", "火"), mk(2, "中2", "月"), mk(3, "附中", "水")];

const cutoff = (groupPatch = {}) => ({
  groups: [
    {
      label: "中1・2",
      grades: ["中1", "中2"],
      startDate: "2026-04-07",
      date: "2026-07-18",
      ...groupPatch,
    },
  ],
  cohorts: [],
});

function renderEditor(displayCutoff = cutoff(), opts = {}) {
  const onSave = vi.fn();
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
    ...(opts.sessionCtx || {}),
  };
  render(
    <DisplayCutoffEditor
      slots={SLOTS}
      displayCutoff={displayCutoff}
      onSave={onSave}
      isAdmin
      sessionCtx={opts.noCtx ? null : sessionCtx}
    />
  );
  return { onSave };
}

describe("DisplayCutoffEditor", () => {
  it("対象コマ数・授業曜日・開講日を出す", () => {
    renderEditor();
    expect(screen.getByText("2 コマ")).toBeInTheDocument();
    expect(screen.getByText("授業曜日 月火")).toBeInTheDocument();
    expect(screen.getByText("開講 2026-04-07 (火)")).toBeInTheDocument();
  });

  it("終了日から実際の最終授業日を逆算して出す", () => {
    renderEditor();
    // 7/18 は土曜。中1・2 の授業は月火なので最後は 7/14 (火)
    expect(screen.getByText(/最終授業日 2026-07-14 \(火\)/)).toBeInTheDocument();
  });

  it("開始日が終了日より後なら警告する", () => {
    renderEditor(cutoff({ startDate: "2026-09-01", date: "2026-07-18" }));
    expect(screen.getByText(/開始日が終了日より後です/)).toBeInTheDocument();
  });

  it("終了日の直前に授業が無ければ警告する (時間割が先に終わっている等)", () => {
    const dc = cutoff({ date: "2026-09-30" });
    renderEditor(dc, {
      sessionCtx: {
        timetables: [
          {
            id: 1,
            name: "1学期",
            type: "regular",
            startDate: "2026-04-07",
            endDate: "2026-07-18",
            grades: [],
          },
        ],
      },
    });
    expect(
      screen.getByText(/終了日の直前 4 週間にこの学年の授業がありません/)
    ).toBeInTheDocument();
  });

  it("どのグループにも属さない学年を警告する", () => {
    renderEditor();
    expect(
      screen.getByText("⚠ どの学年グループにも属さない学年があります")
    ).toBeInTheDocument();
    expect(screen.getByText("附中 (1 コマ)")).toBeInTheDocument();
  });

  it("コマの無い学年グループはその旨を出す", () => {
    renderEditor({
      groups: [{ label: "高3", grades: ["高3"], startDate: null, date: null }],
      cohorts: [],
    });
    expect(
      screen.getByText(/この学年グループのコマは登録されていません/)
    ).toBeInTheDocument();
  });

  it("日付を変えると displayCutoff ごと保存する", () => {
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText("中1・2 の終了日"), {
      target: { value: "2026-07-20" },
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].groups[0].date).toBe("2026-07-20");
  });

  it("sessionCtx が無くても落ちない (最終授業日は出さない)", () => {
    renderEditor(cutoff(), { noCtx: true });
    expect(screen.queryByText(/最終授業日/)).not.toBeInTheDocument();
    expect(screen.getByText("2 コマ")).toBeInTheDocument();
  });
});
