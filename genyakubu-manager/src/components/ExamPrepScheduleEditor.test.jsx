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

function editorTree({ day, crud, teacherKana, partTimeStaff }) {
  return (
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
          schedule={{ examPeriodId: 1, days: day ? [day] : [] }}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          crud={crud}
          // 呼び出し側 (ExamPeriodManager) と同じくインライン関数で渡す
          onClose={() => {}}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

const DEFAULT_STAFF = [{ id: 1, name: "伊藤", subjectIds: [] }];

function renderEditor(day = makeDay(), { teacherKana = {}, partTimeStaff = DEFAULT_STAFF } = {}) {
  const crud = { upsertDay: vi.fn(), deleteDay: vi.fn(), copyDay: vi.fn() };
  const view = render(editorTree({ day, crud, teacherKana, partTimeStaff }));
  const rerenderWith = (nextDay) =>
    view.rerender(editorTree({ day: nextDay, crud, teacherKana, partTimeStaff }));
  return { crud, rerenderWith };
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

function staffTable() {
  return screen.getByRole("columnheader", { name: "講師" }).closest("table");
}

function staffNames() {
  return within(staffTable())
    .getAllByRole("row")
    .slice(1)
    .map((tr) => tr.cells[1].textContent);
}

describe("ExamPrepScheduleEditor の出勤表", () => {
  it("チェックして保存 → 再描画されてもフォーカスはチェックボックスに残る (先頭へ戻らない)", () => {
    const { crud, rerenderWith } = renderEditor();
    const box = screen.getByRole("checkbox", { name: "伊藤 1 校時" });
    box.focus();
    fireEvent.click(box);
    expect(crud.upsertDay).toHaveBeenCalledTimes(1);
    // 保存された内容で親が再描画する (onClose もインラインで作り直される)
    rerenderWith(crud.upsertDay.mock.calls[0][1]);
    const after = screen.getByRole("checkbox", { name: "伊藤 1 校時" });
    expect(after).toBeChecked();
    expect(document.activeElement).toBe(after);
  });

  it("見出しに校時の時刻と人数、日付リストに出勤人数を出す", () => {
    renderEditor();
    const headers = within(staffTable()).getAllByRole("columnheader");
    // 教科 / 講師 / 1〜3 校時 / 全て
    expect(headers[2]).toHaveTextContent("119:00-19:501人");
    expect(headers[4]).toHaveTextContent("317:30-18:301人");
    expect(screen.getByRole("button", { name: /2026-09-19/ })).toHaveTextContent("2人");
  });

  it("時間割にもバイトにも居ない講師の出勤は「候補外」の行で出し、外せる", () => {
    const { crud } = renderEditor();
    expect(staffNames()).toEqual(["伊藤", "奥村候補外"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "奥村 1 校時" }));
    const saved = crud.upsertDay.mock.calls[0][1];
    expect(saved.assignments).toEqual({ 伊藤: [3], 奥村: [2] });
  });

  it("よみでも絞り込める", () => {
    renderEditor(makeDay(), {
      teacherKana: { 伊藤: "いとう", 香川: "かがわ" },
      partTimeStaff: [
        { id: 1, name: "伊藤", subjectIds: [] },
        { id: 2, name: "香川", subjectIds: [] },
      ],
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "講師名・よみで絞り込み" }), {
      target: { value: "カガ" },
    });
    expect(staffNames()).toEqual(["香川"]);
  });

  it("「出勤者のみ」で出勤の入っている講師だけにする", () => {
    renderEditor(makeDay(), {
      partTimeStaff: [
        { id: 1, name: "伊藤", subjectIds: [] },
        { id: 2, name: "香川", subjectIds: [] },
      ],
    });
    expect(staffNames()).toContain("香川");
    fireEvent.click(screen.getByRole("checkbox", { name: "出勤者のみ" }));
    expect(staffNames()).toEqual(["伊藤", "奥村候補外"]);
  });

  it("全校時ボタンは状態に応じて「全選択」「全解除」を出す", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "伊藤 の全校時を選択" })).toHaveTextContent("全選択");
    expect(screen.getByRole("button", { name: "奥村 の全校時を選択" })).toHaveTextContent("全選択");
    const day = makeDay();
    day.assignments = { 伊藤: [1, 2, 3] };
    cleanup();
    renderEditor(day);
    expect(screen.getByRole("button", { name: "伊藤 の全校時を解除" })).toHaveTextContent("全解除");
  });

  it("コピー先に選んでいた日へ切り替えたら、その日はコピー先から外れる", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "2026-09-20 (日)" }));
    expect(screen.getByRole("button", { name: "1 日にコピー" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /2026-09-20/ }));
    // 9/20 にはシフトが無いので作成ボタンが出る。9/19 へ戻ってコピー欄を見る
    fireEvent.click(screen.getByRole("button", { name: /2026-09-19/ }));
    expect(screen.getByRole("button", { name: "0 日にコピー" })).toBeDisabled();
  });
});
