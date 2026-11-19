// @vitest-environment jsdom
// 講師の不在期間 (P2-6): 登録すると、期間にまだその講師の担当になっている授業
// (代行・時間割の期間を反映した後) を並べ、担当変更 (期間限定) / 欠勤登録へ
// そのまま進める。閲覧者は見るだけ。削除は Undo 付き。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeacherAwayView } from "./TeacherAwayView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 11, 20, 12, 0, 0)); // 2026-12-20
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mk = (id, o = {}) => ({
  id,
  timetableId: 4,
  day: "火",
  time: "19:00-20:20",
  grade: "高2",
  cls: "",
  room: "亀62",
  subj: "高松 文系数学",
  teacher: "福武",
  note: "",
  ...o,
});

const LESSON_DATA = {
  slots: [mk(1), mk(2, { day: "金" })],
  // 1/12 (火) は川井が代行に入る = 福武の担当から外れる
  subs: [{ id: 1, date: "2027-01-12", slotId: 1, originalTeacher: "福武", substitute: "川井", status: "confirmed" }],
  adjustments: [],
  daySchedules: [],
  // 3学期は 1/8 から (1/5 の火曜は時間割の期間の外)
  timetables: [{ id: 4, name: "3学期", type: "regular", startDate: "2027-01-08", endDate: null, grades: [] }],
  displayCutoff: { groups: [] },
  holidays: [],
  examPeriods: [],
  specialEvents: [],
  biweeklyAnchors: [],
  extraLessons: [],
  koshuLessons: [],
  examPrepSchedules: [],
};

function Harness({ initial = [], isAdmin = true, onSaveSpy, ...rest }) {
  const [list, setList] = useState(initial);
  return (
    <TeacherAwayView
      teacherAways={list}
      onSave={(next) => {
        onSaveSpy?.(next);
        setList(next);
      }}
      isAdmin={isAdmin}
      teacherNames={["福武", "川井"]}
      teacherKana={{ 福武: "ふくたけ", 川井: "かわい" }}
      lessonData={LESSON_DATA}
      {...rest}
    />
  );
}

const renderView = (props) =>
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
            </div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>
        <Harness {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );

const FUKU = { id: 1, teacher: "福武", startDate: "2027-01-04", endDate: "2027-01-22", memo: "研修" };

describe("TeacherAwayView", () => {
  it("登録すると期間中に残っている授業を並べ、担当変更・欠勤登録へ値を渡して進める", () => {
    const onSaveSpy = vi.fn();
    const onOpenTeacherChange = vi.fn();
    const onOpenAbsence = vi.fn();
    renderView({ onSaveSpy, onOpenTeacherChange, onOpenAbsence });
    fireEvent.change(screen.getByLabelText("講師"), { target: { value: "福武" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2027-01-04" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2027-01-22" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "研修" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    expect(onSaveSpy).toHaveBeenCalledWith([FUKU]);

    // 1/5 (時間割の期間の外)・1/12 (代行) は外れ、1/8・1/15・1/19・1/22 が残る
    expect(screen.getByText(/まだ 福武 先生の担当になっている授業 4 件/)).toBeInTheDocument();
    expect(screen.queryByText(/1\/12 \(火\)/)).toBeNull();
    expect(screen.getByText(/1\/19 \(火\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /担当変更（期間限定）にする/ }));
    expect(onOpenTeacherChange).toHaveBeenCalledWith({
      oldTeacher: "福武",
      from: "2027-01-04",
      until: "2027-01-22",
      memo: "研修",
    });
    fireEvent.click(screen.getByRole("button", { name: /欠勤として登録する/ }));
    expect(onOpenAbsence).toHaveBeenCalledWith({
      teachers: ["福武"],
      fromDate: "2027-01-04",
      toDate: "2027-01-22",
      memo: "研修",
    });
  });

  it("「・」で何人でも登録でき、終了日が開始日より前なら止める", () => {
    const onSaveSpy = vi.fn();
    renderView({ onSaveSpy });
    fireEvent.change(screen.getByLabelText("講師"), { target: { value: "福武・川井" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2027-01-10" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2027-01-04" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    expect(onSaveSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("終了日が開始日より前です");

    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    expect(onSaveSpy.mock.calls[0][0].map((r) => [r.teacher, r.startDate, r.endDate])).toEqual([
      ["福武", "2027-01-10", "2027-01-10"],
      ["川井", "2027-01-10", "2027-01-10"],
    ]);
  });

  it("担当の授業が残っていなければそう出し、ボタンは出さない", () => {
    renderView({
      initial: [{ id: 3, teacher: "南條", startDate: "2027-01-04", endDate: "2027-01-22" }],
      onOpenTeacherChange: vi.fn(),
    });
    expect(screen.getByText(/期間中に 南條 先生の担当になっている授業はありません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /担当変更/ })).toBeNull();
  });

  it("不在の人が代行に入っている授業も出す (担当変更では外れないので、ボタンは自分の授業があるときだけ)", () => {
    renderView({
      initial: [{ id: 3, teacher: "川井", startDate: "2027-01-04", endDate: "2027-01-22" }],
      onOpenTeacherChange: vi.fn(),
    });
    expect(screen.getByText(/まだ 川井 先生の担当になっている授業 1 件/)).toBeInTheDocument();
    expect(screen.getByText(/1\/12 \(火\)/)).toBeInTheDocument();
    expect(screen.getByText("代行")).toBeInTheDocument();
    expect(screen.getByText(/担当変更では外れません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /担当変更/ })).toBeNull();
  });

  it("閲覧者には登録・直す・削除・進むボタンを出さない (一覧は見られる)", () => {
    renderView({ initial: [FUKU], isAdmin: false, onOpenTeacherChange: vi.fn(), onOpenAbsence: vi.fn() });
    expect(screen.queryByLabelText("講師")).toBeNull();
    expect(screen.getByText("福武")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /直す/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /担当変更/ })).toBeNull();
    expect(screen.getByText(/担当になっている授業 4 件/)).toBeInTheDocument();
  });

  it("削除は 6 秒の「元に戻す」付き", () => {
    const onSaveSpy = vi.fn();
    renderView({ initial: [FUKU], onSaveSpy });
    fireEvent.click(screen.getByRole("button", { name: "福武 の不在期間を削除" }));
    expect(onSaveSpy).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(onSaveSpy).toHaveBeenLastCalledWith([FUKU]);
  });

  it("終わった期間は「終了」に分け、授業の一覧は押したときだけ開く", () => {
    renderView({ initial: [FUKU, { id: 2, teacher: "川井", startDate: "2026-11-01", endDate: "2026-11-03" }] });
    expect(screen.queryByText("川井")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /終了 \(1\)/ }));
    expect(screen.getByText("川井")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /期間中の授業/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
