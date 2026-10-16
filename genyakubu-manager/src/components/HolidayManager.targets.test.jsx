// @vitest-environment jsdom
// 休講日の対象の指定: 共通学年 (附中・中1-3) のチップ、全解除、対象クラスの
// 自由入力・その日のコマから選ぶ、カレンダーでの複数日、例外 (この日は授業あり)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HolidayManager } from "./HolidayManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 1, 12, 0, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// 2026-11-18 は水曜、2026-09-09 も水曜
const SLOTS = [
  { id: 1, day: "水", time: "19:00-20:20", grade: "中1", cls: "", room: "", subj: "英語", teacher: "A", note: "" },
  { id: 2, day: "水", time: "21:00-21:30", grade: "附中", cls: "", room: "", subj: "確認テスト", teacher: "B", note: "" },
  { id: 3, day: "土", time: "15:00-16:20", grade: "中1-3", cls: "", room: "", subj: "プレップ", teacher: "C", note: "" },
  { id: 4, day: "水", time: "19:00-20:20", grade: "高2", cls: "", room: "", subj: "高松一 物理", teacher: "D", note: "" },
  { id: 5, day: "水", time: "19:00-20:20", grade: "高2", cls: "", room: "", subj: "高松一 英語", teacher: "E", note: "" },
  { id: 6, day: "水", time: "20:30-21:50", grade: "高3", cls: "", room: "", subj: "共テ英語(Hi)", teacher: "F", note: "" },
  { id: 7, day: "水", time: "20:30-21:50", grade: "高3", cls: "", room: "", subj: "共テ英語(St)", teacher: "G", note: "" },
];

function renderManager({ holidays = [], ...rest } = {}) {
  let current = holidays;
  const onSave = vi.fn((next) => {
    current = typeof next === "function" ? next(current) : next;
  });
  const utils = render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <HolidayManager holidays={holidays} slots={SLOTS} onSave={onSave} isAdmin {...rest} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave, latest: () => current, ...utils };
}

const pickDept = (name) => fireEvent.click(screen.getByLabelText(name));
const setDate = (v) => fireEvent.change(screen.getByLabelText("日付 (開始日)"), { target: { value: v } });

describe("共通学年と全解除", () => {
  it("時間割にある共通学年 (附中・中1-3) がチップに並び、全解除からそれだけを選べる", () => {
    const { onSave } = renderManager();
    setDate("2026-11-18");
    pickDept("中学部");
    expect(screen.getByLabelText("附中")).toBeInTheDocument();
    expect(screen.getByLabelText("中1-3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByLabelText("附中"));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved[0].targetGrades).toEqual(["附中"]);
  });

  it("全解除のまま登録しようとすると止める", () => {
    const { onSave } = renderManager();
    setDate("2026-11-18");
    pickDept("中学部");
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("対象学年を選んでください");
  });

  it("全学年から 1 つ外すと共通学年は残る (全学年 = 共通学年も含む)", () => {
    const { onSave } = renderManager();
    setDate("2026-11-18");
    pickDept("中学部");
    fireEvent.click(screen.getByLabelText("中1"));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    const tg = onSave.mock.calls[0][0][0].targetGrades;
    expect(tg).toContain("附中");
    expect(tg).toContain("中1-3");
    expect(tg).not.toContain("中1");
  });
});

describe("対象クラスの指定", () => {
  it("欄は学年を切り替えても出たまま (ボタンが上下しない)", () => {
    renderManager();
    setDate("2026-11-18");
    pickDept("高校部");
    expect(screen.getByTestId("holiday-class-section")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    expect(screen.getByTestId("holiday-class-section")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("高3"));
    expect(screen.getByTestId("holiday-class-section")).toBeInTheDocument();
  });

  it("チップに無い科目 (共テ英語(Hi)) を文字で指定できる", () => {
    const { onSave } = renderManager();
    setDate("2026-11-18");
    pickDept("高校部");
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByLabelText("高3"));
    fireEvent.change(screen.getByLabelText("対象クラスを文字で指定"), { target: { value: "共テ英語(Hi)" } });
    fireEvent.click(screen.getByRole("button", { name: "＋ 追加" }));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave.mock.calls[0][0][0].subjKeywords).toEqual(["共テ英語(Hi)"]);
  });

  it("その日のコマから選ぶ", () => {
    const { onSave } = renderManager();
    setDate("2026-11-18");
    pickDept("高校部");
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByLabelText("高3"));
    fireEvent.click(screen.getByRole("button", { name: "その日のコマから選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: "高3 共テ英語(St)" }));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave.mock.calls[0][0][0].subjKeywords).toEqual(["共テ英語(St)"]);
  });
});

describe("カレンダーで複数日", () => {
  it("押した日がチップに入り、もう一度押すと外れる", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByRole("button", { name: "📅 カレンダーで選ぶ" }));
    const cal = screen.getByRole("group", { name: "休講日をカレンダーで選ぶ" });
    fireEvent.click(within(cal).getByRole("button", { name: "2026-09-09 (水)" }));
    fireEvent.click(within(cal).getByRole("button", { name: "2026-09-16 (水)" }));
    fireEvent.click(within(cal).getByRole("button", { name: "2026-09-23 (水)" }));
    fireEvent.click(within(cal).getByRole("button", { name: "2026-09-16 (水)" }));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave.mock.calls[0][0].map((h) => h.date)).toEqual(["2026-09-09", "2026-09-23"]);
  });
});

describe("例外 (この日は授業あり)", () => {
  it("その日に止まるコマから例外を選んで保存する", () => {
    const { onSave } = renderManager();
    setDate("2026-09-09");
    pickDept("高校部");
    fireEvent.click(screen.getByRole("button", { name: "全解除" }));
    fireEvent.click(screen.getByLabelText("高1"));
    fireEvent.click(screen.getByLabelText("高2"));
    fireEvent.click(screen.getByRole("button", { name: /例外 \(この日は授業あり\)/ }));
    fireEvent.click(screen.getByLabelText("19:00 高2 高松一 物理"));
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    const saved = onSave.mock.calls[0][0][0];
    expect(saved.targetGrades).toEqual(["高1", "高2"]);
    expect(saved.excludeSlotIds).toEqual([4]);
  });

  it("例外の無い休講日は excludeSlotIds を持たない", () => {
    const { onSave } = renderManager();
    setDate("2026-09-09");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave.mock.calls[0][0][0]).not.toHaveProperty("excludeSlotIds");
  });

  it("一覧の例外を × で外し、元に戻せる", () => {
    const hol = {
      id: 1, date: "2026-09-09", label: "休講", scope: ["高校部"],
      targetGrades: ["高1", "高2"], subjKeywords: [], excludeSlotIds: [4],
    };
    let toast = null;
    const onSave = vi.fn();
    let current = [hol];
    onSave.mockImplementation((next) => {
      current = typeof next === "function" ? next(current) : next;
    });
    render(
      <ToastProvider render={(toasts) => { toast = toasts[toasts.length - 1] || null; return null; }}>
        <ConfirmProvider>
          <HolidayManager holidays={[hol]} slots={SLOTS} onSave={onSave} isAdmin />
        </ConfirmProvider>
      </ToastProvider>
    );
    expect(screen.getByText(/授業あり: 19:00 高2 高松一 物理/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-09-09 の例外 19:00 高2 高松一 物理 を外す" }));
    expect(current[0]).not.toHaveProperty("excludeSlotIds");
    expect(toast?.action?.label).toBe("元に戻す");
    act(() => toast.action.onClick());
    expect(current[0].excludeSlotIds).toEqual([4]);
  });
});
