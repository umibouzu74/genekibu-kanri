// @vitest-environment jsdom
// 附属の授業予定: 月の水曜を並べ、時程の切り替え (特別時程の作成 / 削除)・
// 学校メモ・確認テストの手動指定が保存経路に乗ることを固定する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FuzokuPlanView } from "./FuzokuPlanView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); // 2026-10-01
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const S = (id, time, grade, subj, teacher) => ({
  id,
  day: "水",
  time,
  grade,
  cls: "-",
  room: "401",
  subj,
  teacher,
  note: "",
});
const SLOTS = [
  S(36, "16:25-17:25", "附中1", "理科", "武下"),
  S(37, "16:25-17:25", "附中2", "英語", "石原"),
  S(38, "16:25-17:25", "附中3", "数学", "片岡"),
  S(39, "17:35-18:35", "附中1", "英語", "石原"),
  S(40, "17:35-18:35", "附中2", "数学", "片岡"),
  S(41, "17:35-18:35", "附中3", "理科", "滝澤"),
  S(42, "18:45-19:45", "附中1", "国語", "松川"),
  S(43, "18:45-19:45", "附中2", "理科", "滝澤"),
  S(44, "18:45-19:45", "附中3", "英語", "石原"),
  S(45, "19:55-20:55", "附中1", "数学", "片岡"),
  S(46, "19:55-20:55", "附中2", "国語", "小松"),
  S(47, "19:55-20:55", "附中3", "国語", "松川"),
  S(250, "21:00-21:30", "附中", "確認テスト", "松川"),
];
const COMPRESS = {
  id: 3,
  date: "2026-10-28",
  label: "附属 50分授業 (17:00開始)",
  targetGrades: ["附中", "附中1", "附中2", "附中3"],
  timeMap: [
    { from: "16:25-17:25", to: "17:00-17:50" },
    { from: "17:35-18:35", to: "18:00-18:50" },
    { from: "18:45-19:45", to: "19:00-19:50" },
    { from: "19:55-20:55", to: "20:00-20:50" },
  ],
  cancelTimes: [],
  memo: "",
};

function renderView(props = {}) {
  const onSaveFuzokuPlan = vi.fn();
  const onSaveDaySchedules = vi.fn();
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
        <FuzokuPlanView
          slots={SLOTS}
          timetables={[]}
          isAdmin
          fuzokuPlan={{ notes: {}, tests: {} }}
          onSaveFuzokuPlan={onSaveFuzokuPlan}
          onSaveDaySchedules={onSaveDaySchedules}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSaveFuzokuPlan, onSaveDaySchedules };
}
const weekEl = (label) => screen.getByRole("region", { name: `${label} の予定` });
// 保存関数に渡った updater を前の値に当てて結果を取り出す
const applied = (fn, prev) => {
  const arg = fn.mock.calls[fn.mock.calls.length - 1][0];
  return typeof arg === "function" ? arg(prev) : arg;
};

describe("FuzokuPlanView", () => {
  it("今月の水曜を並べ、限 × 学年の科目と確認テストを出す", () => {
    renderView();
    for (const d of ["10/7 (水)", "10/14 (水)", "10/21 (水)", "10/28 (水)"]) {
      expect(weekEl(d)).toBeInTheDocument();
    }
    const w = weekEl("10/7 (水)");
    expect(within(w).getByText("通常 16:25〜")).toBeInTheDocument();
    expect(within(w).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "限",
      "時刻",
      "中1",
      "中2",
      "中3",
    ]);
    expect(within(w).getByText("16:25-17:25")).toBeInTheDocument();
    expect(within(w).getByText("確認テ")).toBeInTheDocument();
    // 起点が無いので未設定
    expect(within(w).getAllByText("未設定")).toHaveLength(3);
  });

  it("「50分授業」で附属の学年ぜんぶに効く特別時程を足す", () => {
    const { onSaveDaySchedules } = renderView();
    const w = weekEl("10/7 (水)");
    fireEvent.click(within(w).getByRole("button", { name: "50分授業" }));
    const next = applied(onSaveDaySchedules, []);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 1,
      date: "2026-10-07",
      label: "附属 50分授業 (17:00開始)",
      targetGrades: ["附中", "附中1", "附中2", "附中3"],
      timeMap: COMPRESS.timeMap,
      cancelTimes: [],
    });
    expect(screen.getByText("10/7 (水) を50分授業にしました")).toBeInTheDocument();
  });

  it("50分授業の日は 17:00 からの時刻で出し、「通常」で Undo 付きに消す", () => {
    const { onSaveDaySchedules } = renderView({ daySchedules: [COMPRESS] });
    const w = weekEl("10/28 (水)");
    expect(within(w).getByText("50分授業 17:00〜")).toBeInTheDocument();
    expect(within(w).getByText("17:00-17:50")).toBeInTheDocument();
    expect(within(w).getByText("21:00-21:30")).toBeInTheDocument();
    fireEvent.click(within(w).getByRole("button", { name: "通常" }));
    expect(onSaveDaySchedules).toHaveBeenCalledWith([]);
    expect(screen.getByText("10/28 (水) を通常の時程に戻しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeInTheDocument();
  });

  it("個別の特別時程の日は切り替えずに特別時程の画面へ案内する", () => {
    const onEditDaySchedule = vi.fn();
    renderView({
      daySchedules: [{ ...COMPRESS, targetGrades: ["附中1"], label: "中1 だけ遅らせる" }],
      onEditDaySchedule,
    });
    const w = weekEl("10/28 (水)");
    expect(within(w).getByRole("button", { name: "通常" })).toBeDisabled();
    fireEvent.click(within(w).getByRole("button", { name: "⏰ 特別時程で編集" }));
    expect(onEditDaySchedule).toHaveBeenCalledWith(3);
  });

  it("バス欄を保存し、バスから時程を提案して食い違いを知らせる", () => {
    const { onSaveFuzokuPlan } = renderView();
    const input = within(weekEl("10/7 (水)")).getByRole("textbox", { name: "10/7 (水) のバス" });
    fireEvent.change(input, { target: { value: " 16:05×1 17:20×2 " } });
    fireEvent.blur(input);
    expect(applied(onSaveFuzokuPlan, { notes: {}, tests: {} })).toEqual({
      notes: { "2026-10-07": { bus: "16:05×1 17:20×2" } },
      tests: {},
    });

    cleanup();
    renderView({ fuzokuPlan: { notes: { "2026-10-07": { bus: "16:05×1 17:20×2" } }, tests: {} } });
    const w = weekEl("10/7 (水)");
    expect(within(w).getByText(/16:05 発を基準 → 50分授業 \(17:00 開始\)/)).toBeInTheDocument();
    expect(within(w).getByText(/17:20 は別の便/)).toBeInTheDocument();
    expect(within(w).getByText(/今の時程 \(通常\) と食い違っています/)).toBeInTheDocument();
  });

  it("確認テストのセルから科目を決めると、次の週から自動で回る", () => {
    const { onSaveFuzokuPlan } = renderView();
    const w = weekEl("10/7 (水)");
    fireEvent.click(within(w).getByRole("button", { name: "10/7 (水) 中1 の確認テスト: 未設定" }));
    const editor = within(w).getByRole("group", { name: "10/7 中1 の確認テスト" });
    fireEvent.click(within(editor).getByRole("button", { name: "英" }));
    expect(applied(onSaveFuzokuPlan, { notes: {}, tests: {} }).tests).toEqual({
      "2026-10-07": { 附中1: { subjects: ["英"] } },
    });

    cleanup();
    renderView({
      fuzokuPlan: { notes: {}, tests: { "2026-10-07": { 附中1: { subjects: ["英", "数"] } } } },
    });
    const next = weekEl("10/14 (水)");
    expect(
      within(next).getByRole("button", { name: "10/14 (水) 中1 の確認テスト: 国 理" })
    ).toBeInTheDocument();
  });

  it("全学年が休み (テスト期間) の週は「授業なし」とまとめる", () => {
    renderView({
      examPeriods: [
        {
          id: 1,
          name: "2学期中間 (特訓)",
          startDate: "2026-10-19",
          endDate: "2026-10-23",
          targetGrades: ["附中1", "附中2", "附中3"],
        },
      ],
    });
    const w = weekEl("10/21 (水)");
    expect(within(w).getByText("授業なし — 2学期中間 (特訓)")).toBeInTheDocument();
    expect(within(w).queryByRole("table")).toBeNull();
  });

  it("閲覧者には操作を出さず、学校メモは文字で出す", () => {
    renderView({
      isAdmin: false,
      fuzokuPlan: { notes: { "2026-10-07": { bus: "12:30×2 12:40×1", memo: "3時間授業" } }, tests: {} },
    });
    const w = weekEl("10/7 (水)");
    expect(within(w).queryByRole("button", { name: "50分授業" })).toBeNull();
    expect(within(w).queryByRole("textbox")).toBeNull();
    expect(within(w).getByText("🚌 12:30×2 12:40×1 / 3時間授業")).toBeInTheDocument();
  });

  it("月を送ると翌月の水曜に切り替わる", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(weekEl("11/4 (水)")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "10/7 (水) の予定" })).toBeNull();
  });
});
