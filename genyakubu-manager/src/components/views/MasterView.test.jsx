// @vitest-environment jsdom
// コースマスター管理の時間割の選択。既定は「今の時間割」(今日の日付で決まる
// 時間割。ほかの画面と同じ)。前の期のコマを直す・次の期を先に見るときだけ
// この画面の中で時間割を選ぶ (端末にもほかの画面にも持ち越さない)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MasterView } from "./MasterView";
import { ToastProvider } from "../../hooks/useToasts";
import { MASTER_TAB } from "../../constants/masterTabs";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0)); // 2026-10-21
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TIMETABLES = [
  {
    id: 1,
    name: "1学期",
    type: "regular",
    startDate: "2026-04-01",
    endDate: "2026-08-31",
    grades: [],
  },
  { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] },
];
const slot = (id, subj, timetableId) => ({
  id,
  day: "月",
  time: "19:00-20:20",
  grade: "中1",
  cls: "S",
  room: "601",
  subj,
  teacher: "堀上",
  note: "",
  timetableId,
});
const SLOTS = [slot(1, "1学期の英語", 1), slot(2, "2学期の数学", 2)];

function renderMaster(props = {}) {
  const onNew = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <MasterView
        slots={SLOTS}
        onEdit={() => {}}
        onDel={() => {}}
        onNew={onNew}
        biweeklyAnchors={[]}
        onSetBiweeklyAnchors={() => {}}
        isAdmin
        timetables={TIMETABLES}
        saveSlots={() => {}}
        partTimeStaff={[]}
        subjects={[]}
        holidays={[]}
        examPeriods={[]}
        classSets={[]}
        displayCutoff={null}
        tab={MASTER_TAB.LIST}
        onTabChange={() => {}}
        {...props}
      />
    </ToastProvider>
  );
  return { onNew };
}

const picker = () => screen.getByRole("combobox", { name: /時間割/ });

describe("MasterView の時間割の選択", () => {
  it("既定は今の時間割 (今日有効な 2学期) のコマだけ", () => {
    const { onNew } = renderMaster();
    expect(picker().value).toBe("current");
    expect(screen.getByRole("option", { name: "今の時間割（2学期）" })).toBeInTheDocument();
    expect(screen.getByText("2学期の数学")).toBeInTheDocument();
    expect(screen.queryByText("1学期の英語")).toBeNull();
    expect(screen.getByText("1 / 1 件表示")).toBeInTheDocument();
    // 新規追加の既定の時間割は今の時間割 (App が決める) = null
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規追加" }));
    expect(onNew).toHaveBeenCalledWith(null);
  });

  it("前の期を選ぶとその時間割のコマ。新規追加もその時間割に入れる", () => {
    const { onNew } = renderMaster();
    expect(screen.getByRole("option", { name: "1学期（4/1〜8/31・終了）" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2学期（9/1〜・今日有効）" })).toBeInTheDocument();
    fireEvent.change(picker(), { target: { value: "1" } });
    expect(screen.getByText("1学期の英語")).toBeInTheDocument();
    expect(screen.queryByText("2学期の数学")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規追加" }));
    expect(onNew).toHaveBeenCalledWith(1);
  });

  it("開始前の時間割は開始日を 1 回だけ出す", () => {
    const term3 = { id: 3, name: "3学期", type: "regular", startDate: "2027-01-08", endDate: null, grades: [] };
    renderMaster({ timetables: [...TIMETABLES, term3] });
    expect(screen.getByRole("option", { name: "3学期（1/8〜・開始前）" })).toBeInTheDocument();
  });

  it("時間割が 1 つだけなら選択を出さず、絞らない", () => {
    renderMaster({ timetables: [TIMETABLES[0]] });
    expect(screen.queryByRole("combobox", { name: /時間割/ })).toBeNull();
    expect(screen.getByText("1学期の英語")).toBeInTheDocument();
    expect(screen.getByText("2学期の数学")).toBeInTheDocument();
  });
});
