// @vitest-environment jsdom
// 特訓シフトの校時テーブル: 後から足した校時に早い時刻を入れても、テーブルから
// フォーカスが外れた時点で開始時刻順に並び直す (連番と出勤チェックも追従)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExamPrepScheduleEditor } from "./ExamPrepScheduleEditor";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

const EXAM_PERIOD = {
  id: 1,
  name: "2学期中間特訓",
  startDate: "2026-09-19",
  endDate: "2026-09-20",
  targetGrades: [],
};

function makeDay() {
  return {
    date: "2026-09-19",
    periods: [
      { no: 1, start: "19:00", end: "19:50" },
      { no: 2, start: "20:00", end: "20:50" },
      { no: 3, start: "17:30", end: "18:30" },
    ],
    assignments: { 伊藤: [3], 奥村: [1, 2] },
  };
}

function renderEditor(day = makeDay()) {
  const crud = { upsertDay: vi.fn(), deleteDay: vi.fn(), copyDay: vi.fn() };
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>{t.message}</div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>
        <ExamPrepScheduleEditor
          examPeriod={EXAM_PERIOD}
          schedule={{ examPeriodId: 1, days: [day] }}
          partTimeStaff={[{ id: 1, name: "伊藤", subjectIds: [] }]}
          crud={crud}
          onClose={() => {}}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { crud };
}

function periodTable() {
  return screen.getByRole("columnheader", { name: "校時" }).closest("table");
}

function timeInputs() {
  // 開始 / 終了の time 入力を行順に返す
  return within(periodTable()).getAllByDisplayValue(/^\d{2}:\d{2}$/);
}

describe("ExamPrepScheduleEditor の校時の自動並べ替え", () => {
  it("テーブルからフォーカスが外れると開始時刻順に並べ替えて保存する", () => {
    const { crud } = renderEditor();
    const inputs = timeInputs();
    // 3 校時 (17:30) の開始欄で編集を終えて、テーブル外へフォーカスを移す
    fireEvent.focus(inputs[4]);
    fireEvent.blur(inputs[4], { relatedTarget: document.body });

    expect(crud.upsertDay).toHaveBeenCalledTimes(1);
    const [examPeriodId, saved, opts] = crud.upsertDay.mock.calls[0];
    expect(examPeriodId).toBe(1);
    expect(opts).toEqual({ successMsg: null });
    expect(saved.periods).toEqual([
      { no: 1, start: "17:30", end: "18:30" },
      { no: 2, start: "19:00", end: "19:50" },
      { no: 3, start: "20:00", end: "20:50" },
    ]);
    // 出勤チェックは校時に付いて動く (伊藤 = 17:30 の校時)
    expect(saved.assignments).toEqual({ 伊藤: [1], 奥村: [2, 3] });
    expect(screen.getByTestId("toasts")).toHaveTextContent("校時を開始時刻順に並べ替えました");
  });

  it("テーブル内の別の入力へ移るだけでは並べ替えない (編集中に行が飛ばない)", () => {
    const { crud } = renderEditor();
    const inputs = timeInputs();
    fireEvent.blur(inputs[4], { relatedTarget: inputs[5] });
    expect(crud.upsertDay).not.toHaveBeenCalled();
  });

  it("すでに時刻順なら保存もトーストも出さない", () => {
    const day = makeDay();
    day.periods = [
      { no: 1, start: "17:30", end: "18:30" },
      { no: 2, start: "19:00", end: "19:50" },
    ];
    day.assignments = {};
    const { crud } = renderEditor(day);
    fireEvent.blur(timeInputs()[0], { relatedTarget: null });
    expect(crud.upsertDay).not.toHaveBeenCalled();
    expect(screen.getByTestId("toasts")).toHaveTextContent("");
  });

  it("✕ は並べ替え前の番号のまま元の校時を消す", () => {
    const { crud } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "3 校時を削除" }));
    expect(crud.upsertDay).toHaveBeenCalledTimes(1);
    const saved = crud.upsertDay.mock.calls[0][1];
    expect(saved.periods.map((p) => p.start)).toEqual(["19:00", "20:00"]);
    expect(saved.assignments).toEqual({ 奥村: [1, 2] });
  });
});
