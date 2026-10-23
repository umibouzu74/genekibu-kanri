// @vitest-environment jsdom
// 授業時間の集計の「バイト出勤表」タブ (PartTimeAttendanceSheet)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TeachingMinutesView } from "./TeachingMinutesView";
import { ToastProvider } from "../../hooks/useToasts";
import { LS, SS } from "../../constants/storageKeys";
import { MINUTES_TAB } from "../../constants/minutesTabs";

const slot = (id, o) => ({ id, cls: "", room: "", note: "", ...o });
// 土曜の川井: 中3 理科B 14:00〜16:30 (2 コマ) とプレップ 18:30〜21:50 (2 コマ)
const slots = [
  slot(1, { day: "土", time: "14:00-15:00", grade: "中3", cls: "クラス", subj: "理科B", teacher: "川井" }),
  slot(2, { day: "土", time: "15:30-16:30", grade: "中3", cls: "クラス", subj: "理科B", teacher: "川井" }),
  slot(3, {
    day: "土",
    time: "18:30-20:00",
    grade: "中1-3",
    cls: "-",
    subj: "英語·数学·理科",
    teacher: "奥村·川井",
    note: "プレップ個別指導",
  }),
  slot(4, {
    day: "土",
    time: "20:20-21:50",
    grade: "中1-3",
    cls: "-",
    subj: "英語·数学·理科",
    teacher: "奥村·川井",
    note: "プレップ個別指導",
  }),
  // 常勤 (バイトでない) は表に出さない
  slot(5, { day: "月", time: "19:00-20:00", grade: "中2", subj: "数学", teacher: "堀上" }),
];
const partTimeStaff = [{ name: "奥村" }, { name: "川井" }, { name: "杉原" }];

function renderView(props = {}) {
  return render(
    <ToastProvider>
      <TeachingMinutesView slots={slots} partTimeStaff={partTimeStaff} {...props} />
    </ToastProvider>
  );
}

// 行 (行見出し = 講師名) の右端 2 列 (日数・金額)
function totalsOf(name) {
  const header = screen.getByRole("rowheader", { name: new RegExp(`^${name}`) });
  const cells = within(header.closest("tr")).getAllByRole("cell");
  return cells.slice(-2).map((c) => c.textContent);
}

describe("バイト出勤表", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 23, 14, 0));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("初めて開くと 20 日締めの締め終わった月 (10/23 → 10 月分 = 9/21〜10/20) を出す", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    expect(screen.getByLabelText("開始日").value).toBe("2026-09-21");
    expect(screen.getByLabelText("終了日").value).toBe("2026-10-20");
    expect(screen.getByRole("heading", { name: /2026年10月分 .* のバイト出勤表/ })).toBeTruthy();
  });

  it("行 = バイト (登録の並び順)、日数 = 時間の離れたかたまりの数、金額 = 日数 × 単価", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    const names = screen
      .getAllByRole("rowheader")
      .map((h) => h.textContent)
      .filter((t) => t !== "合計");
    expect(names.map((n) => n.replace(/（.*）$/, ""))).toEqual(["奥村", "川井", "杉原"]);
    // 9/21〜10/20 の土曜は 4 回。川井は毎回 2 (14:00〜16:30 と 18:30〜21:50)、奥村は 1
    expect(totalsOf("川井")).toEqual(["8", "44,000 円"]);
    expect(totalsOf("奥村")).toEqual(["4", "22,000 円"]);
    expect(totalsOf("杉原")).toEqual(["0", "0 円"]);
    expect(totalsOf("合計")).toEqual(["12", "66,000 円"]);
    expect(screen.queryByRole("rowheader", { name: /堀上/ })).toBeNull();
    // 担当の目安
    expect(screen.getByRole("rowheader", { name: /^川井/ }).textContent).toContain("（土T3.P）");
  });

  it("管理者でなくても (権限を渡さなくても) 表・Excel ボタンが使える", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    const btn = screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" });
    expect(btn.disabled).toBe(false);
  });

  it("セルを押すとその日の授業が見え、手で上書きできる (この端末だけ)", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    fireEvent.click(screen.getByRole("button", { name: /^川井 10\/3 \(土\): 出勤 2/ }));
    const dialog = screen.getByRole("dialog", { name: /川井 先生 — 10\/3 \(土\)/ });
    expect(within(dialog).getByText("1 つ目のかたまり 14:00〜16:30")).toBeTruthy();
    expect(within(dialog).getByText("2 つ目のかたまり 18:30〜21:50")).toBeTruthy();
    expect(within(dialog).getAllByText("中3クラス 理科B")).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "1" }));
    expect(totalsOf("川井")).toEqual(["7", "38,500 円"]);
    expect(within(dialog).getByRole("button", { name: "1" }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceOverrides))).toEqual({
      "2026-09-21_2026-10-20": { 川井: { "2026-10-03": 1 } },
    });
    // 自動に戻す
    fireEvent.click(within(dialog).getByRole("button", { name: "自動 (2)" }));
    expect(totalsOf("川井")).toEqual(["8", "44,000 円"]);
  });

  it("単価を変えると金額が変わり、端末に覚える", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    fireEvent.change(screen.getByLabelText("単価 (円)"), { target: { value: "6000" } });
    expect(totalsOf("川井")).toEqual(["8", "48,000 円"]);
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceUnitPrice))).toBe(6000);
  });

  it("空き時間のしきい値を広げると、離れたかたまりがつながる", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    // 16:30 → 18:30 は 120 分。120 分以上で別の出勤 → まだ 2
    fireEvent.change(screen.getByLabelText("別の出勤として数える空き時間"), { target: { value: "120" } });
    expect(totalsOf("川井")).toEqual(["8", "44,000 円"]);
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceGapMinutes))).toBe(120);
  });

  it("合計に含めない種別は数えない (授業時間のタブと同じ選択)", () => {
    const examPeriods = [
      { id: 1, name: "2学期中間", startDate: "2026-10-05", endDate: "2026-10-09", stopsClasses: false },
    ];
    const examPrepSchedules = [
      {
        examPeriodId: 1,
        days: [
          {
            date: "2026-10-06",
            periods: [{ no: 1, start: "19:00", end: "20:00" }],
            assignments: { 杉原: [1] },
          },
        ],
      },
    ];
    renderView({ tab: MINUTES_TAB.ATTENDANCE, examPeriods, examPrepSchedules });
    expect(totalsOf("杉原")).toEqual(["1", "5,500 円"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "特訓" }));
    expect(totalsOf("杉原")).toEqual(["0", "0 円"]);
    expect(JSON.parse(localStorage.getItem(LS.teachingMinutesIncluded))).not.toContain("prep");
  });

  it("授業時間のタブ (末日締め) から切り替えると、同じ月をバイトの締め日で作り直す", () => {
    function Harness() {
      const [tab, setTab] = useState(MINUTES_TAB.SUMMARY);
      return (
        <ToastProvider>
          <TeachingMinutesView slots={slots} partTimeStaff={partTimeStaff} tab={tab} onTabChange={setTab} />
        </ToastProvider>
      );
    }
    render(<Harness />);
    // 授業時間は今日を含む月 (末日締め) = 10/1〜10/31
    expect(screen.getByLabelText("開始日").value).toBe("2026-10-01");
    fireEvent.click(screen.getByRole("tab", { name: /バイト出勤表/ }));
    expect(screen.getByLabelText("開始日").value).toBe("2026-09-21");
    expect(screen.getByLabelText("終了日").value).toBe("2026-10-20");
    // 締め日はタブごとに覚える
    expect(screen.getByLabelText("締め日").value).toBe("20");
    fireEvent.click(screen.getByRole("tab", { name: /授業時間/ }));
    expect(screen.getByLabelText("開始日").value).toBe("2026-10-01");
  });

  it("授業時間を見て画面を離れ、バイト出勤表を開き直しても、バイトの締め日の期間で出す", () => {
    const first = renderView({ tab: MINUTES_TAB.SUMMARY });
    expect(screen.getByLabelText("開始日").value).toBe("2026-10-01");
    first.unmount();
    // サイドバー / メインメニューからバイト出勤表を開く (画面を作り直す)
    const second = renderView({ tab: MINUTES_TAB.ATTENDANCE });
    expect(screen.getByLabelText("開始日").value).toBe("2026-09-21");
    expect(screen.getByLabelText("終了日").value).toBe("2026-10-20");
    second.unmount();
    // 逆向きも同じ (バイト出勤表の 10 月分 → 授業時間の 10 月分)
    renderView({ tab: MINUTES_TAB.SUMMARY });
    expect(screen.getByLabelText("開始日").value).toBe("2026-10-01");
    expect(screen.getByLabelText("終了日").value).toBe("2026-10-31");
  });

  it("日付を直接入れた期間は、開き直したタブでもそのまま", () => {
    sessionStorage.setItem(
      SS.teachingMinutesPeriod,
      JSON.stringify({
        y: 2026,
        m: 10,
        startDate: "2026-10-05",
        endDate: "2026-10-10",
        tab: MINUTES_TAB.SUMMARY,
      })
    );
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    expect(screen.getByLabelText("開始日").value).toBe("2026-10-05");
    expect(screen.getByLabelText("終了日").value).toBe("2026-10-10");
  });

  it("バイトが登録されていなければ案内を出す", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE, partTimeStaff: [] });
    expect(screen.getByText(/バイトが登録されていません/)).toBeTruthy();
  });
});
