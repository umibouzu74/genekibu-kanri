// @vitest-environment jsdom
// 授業管理 (SubstituteView):
//  - ＋ 新規代行 で来月の日付を登録すると、当月の月フィルタで一覧から消えて
//    「登録できなかった」ように見えていた (2026-09-15)。登録後は月フィルタを
//    その月へ動かす (「すべて」は動かさない)
//  - 時間割表タブ (代行モード) に特別時程を渡す
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubstituteView } from "./SubstituteView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

// 月フィルタの既定はシステム時刻の当月なので、相対で組む
function ym(offsetMonths) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const THIS_MONTH = ym(0);
const NEXT_MONTH = ym(1);

const SLOT = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "-",
  room: "301",
  subj: "数学",
  teacher: "田中",
  note: "",
};
const sub = (over) => ({
  id: 1,
  date: `${THIS_MONTH}-05`,
  slotId: 1,
  originalTeacher: "田中",
  substitute: "西岡",
  status: "confirmed",
  memo: "",
  ...over,
});

function renderView(props = {}) {
  const onNew = vi.fn();
  const utils = render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <SubstituteView
          subs={[]}
          slots={[SLOT]}
          holidays={[]}
          partTimeStaff={[]}
          onNew={onNew}
          onEdit={() => {}}
          onDel={() => {}}
          onQuickUpdate={() => {}}
          onGoToStaffView={() => {}}
          isAdmin
          saveSubs={() => {}}
          examPeriods={[]}
          subjects={[]}
          subjectCategories={[]}
          timetables={[]}
          biweeklyAnchors={[]}
          teacherSubjects={{}}
          classSets={[]}
          displayCutoff={null}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  const rerenderWith = (next) =>
    utils.rerender(
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <SubstituteView
            subs={[]}
            slots={[SLOT]}
            holidays={[]}
            partTimeStaff={[]}
            onNew={onNew}
            onEdit={() => {}}
            onDel={() => {}}
            onQuickUpdate={() => {}}
            onGoToStaffView={() => {}}
            isAdmin
            saveSubs={() => {}}
            examPeriods={[]}
            subjects={[]}
            subjectCategories={[]}
            timetables={[]}
            biweeklyAnchors={[]}
            teacherSubjects={{}}
            classSets={[]}
            displayCutoff={null}
            {...props}
            {...next}
          />
        </ConfirmProvider>
      </ToastProvider>
    );
  return { ...utils, onNew, rerenderWith };
}

const monthInput = () => screen.getByLabelText("月");

describe("SubstituteView の新規代行と月フィルタ", () => {
  it("＋ 新規代行 で来月の代行を登録したら、月フィルタをその月へ動かして一覧に出す", () => {
    const { onNew, rerenderWith } = renderView();
    expect(monthInput().value).toBe(THIS_MONTH);
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規代行" }));
    expect(onNew).toHaveBeenCalledTimes(1);
    // App 側のフォームが保存して subs が増える
    rerenderWith({ subs: [sub({ id: 9, date: `${NEXT_MONTH}-03` })] });
    expect(monthInput().value).toBe(NEXT_MONTH);
    expect(screen.getByText("西岡")).toBeInTheDocument();
  });

  it("当月の代行なら月フィルタは動かさない", () => {
    const { rerenderWith } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規代行" }));
    rerenderWith({ subs: [sub({ id: 9, date: `${THIS_MONTH}-20` })] });
    expect(monthInput().value).toBe(THIS_MONTH);
    expect(screen.getByText("西岡")).toBeInTheDocument();
  });

  it("この画面のフォームを開いていない (他端末の同期など) なら動かさない", () => {
    const { rerenderWith } = renderView();
    rerenderWith({ subs: [sub({ id: 9, date: `${NEXT_MONTH}-03` })] });
    expect(monthInput().value).toBe(THIS_MONTH);
  });

  it("「すべて」(月フィルタ空) はそのまま", () => {
    const { rerenderWith } = renderView({ subs: [sub({ id: 1 })] });
    fireEvent.change(monthInput(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規代行" }));
    rerenderWith({ subs: [sub({ id: 1 }), sub({ id: 9, date: `${NEXT_MONTH}-03` })] });
    expect(monthInput().value).toBe("");
  });

  it("一覧の空表示にある「＋ 代行を登録」からでも同じ", () => {
    const { onNew, rerenderWith } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "＋ 代行を登録" }));
    expect(onNew).toHaveBeenCalledTimes(1);
    rerenderWith({ subs: [sub({ id: 9, date: `${NEXT_MONTH}-03` })] });
    expect(monthInput().value).toBe(NEXT_MONTH);
  });
});

describe("SubstituteView の時間割表タブ (代行モード)", () => {
  it("特別時程を渡し、代行日を入れると 移/休 とバナーが出る", () => {
    // 2026-07-13 は月曜
    const MON = "2026-07-13";
    const { container } = renderView({
      slots: [SLOT, { ...SLOT, id: 2, time: "20:30-21:50", room: "302", teacher: "佐藤" }],
      daySchedules: [
        {
          id: 1,
          date: MON,
          targetGrades: ["中3"],
          label: "行事",
          cancelTimes: ["19:00-20:20"],
          timeMap: [{ from: "20:30-21:50", to: "20:00-20:50" }],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "時間割表" }));
    fireEvent.change(container.querySelector('input[type="date"]'), {
      target: { value: MON },
    });
    expect(screen.getByText("⏰ 特別時程")).toBeInTheDocument();
    expect(screen.getByText("休")).toBeInTheDocument();
    expect(screen.getByText("移")).toBeInTheDocument();
  });
});
