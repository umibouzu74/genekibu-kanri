// @vitest-environment jsdom
// 授業時間の集計の「バイト出勤表」タブ (PartTimeAttendanceSheet)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TeachingMinutesView } from "./TeachingMinutesView";
import { ToastProvider } from "../../hooks/useToasts";
import { LS, SS } from "../../constants/storageKeys";
import { MINUTES_TAB } from "../../constants/minutesTabs";

// Excel の書き出し (dynamic import) は呼ばれた引数だけ見る
const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn(async () => "x.xlsx") }));
vi.mock("../../utils/partTimeAttendanceExport", () => ({
  downloadPartTimeAttendanceExcel: (...args) => downloadMock(...args),
}));

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

// 行 (行見出し = 講師名) の右端 = 日数 (金額の列は画面に無い)
function daysOf(name) {
  const header = screen.getByRole("rowheader", { name: new RegExp(`^${name}`) });
  const cells = within(header.closest("tr")).getAllByRole("cell");
  return cells.at(-1).textContent;
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

  it("行 = バイト (登録の並び順)、日数 = 時間の離れたかたまりの数", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    const names = screen
      .getAllByRole("rowheader")
      .map((h) => h.textContent)
      .filter((t) => t !== "合計");
    expect(names.map((n) => n.replace(/（.*）$/, ""))).toEqual(["奥村", "川井", "杉原"]);
    // 9/21〜10/20 の土曜は 4 回。川井は毎回 2 (14:00〜16:30 と 18:30〜21:50)、奥村は 1
    expect(daysOf("川井")).toBe("8");
    expect(daysOf("奥村")).toBe("4");
    expect(daysOf("杉原")).toBe("0");
    expect(daysOf("合計")).toBe("12");
    expect(screen.queryByRole("rowheader", { name: /堀上/ })).toBeNull();
    // 担当の目安
    expect(screen.getByRole("rowheader", { name: /^川井/ }).textContent).toContain("（土T3.P）");
  });

  it("退職・非表示のバイトは期間内に授業が無ければ行に出さない (授業があれば出す)", () => {
    renderView({
      tab: MINUTES_TAB.ATTENDANCE,
      affiliations: [
        { name: "杉原", fromYear: 2026, category: "retired" },
        { name: "奥村", fromYear: 2026, category: "retired" },
      ],
    });
    const names = screen
      .getAllByRole("rowheader")
      .map((h) => h.textContent.replace(/（.*）$/, ""))
      .filter((t) => t !== "合計");
    expect(names).toEqual(["奥村", "川井"]);
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
    expect(daysOf("川井")).toBe("7");
    expect(within(dialog).getByRole("button", { name: "1" }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceOverrides))).toEqual({
      "2026-09-21_2026-10-20": { 川井: { "2026-10-03": 1 } },
    });
    // 自動に戻す
    fireEvent.click(within(dialog).getByRole("button", { name: "自動 (2)" }));
    expect(daysOf("川井")).toBe("8");
  });

  describe("カード忘れ (打刻なし)", () => {
    const cardForgets = [
      { id: 1, name: "川井", date: "2026-10-03", missing: "both", inTime: "13:45", outTime: "22:00", memo: "責任者確認" },
      // 授業の無い日の記録 (出勤 0) は一覧で注意する
      { id: 2, name: "杉原", date: "2026-10-01", missing: "out" },
      // 期間の外は出さない
      { id: 3, name: "川井", date: "2026-10-24", missing: "in" },
    ];

    it("セルに 💳 と枠、表の下に一覧 (閲覧者も見える。日数は変えない)", () => {
      renderView({ tab: MINUTES_TAB.ATTENDANCE, cardForgets });
      const cell = screen.getByRole("button", { name: /^川井 10\/3 \(土\): 出勤 2、カード忘れ: 出勤・退勤の打刻なし/ });
      expect(cell.textContent).toContain("💳");
      expect(cell.closest("td").style.outline).toMatch(/2px solid/);
      expect(daysOf("川井")).toBe("8");

      const list = screen.getByRole("region", { name: "💳 カード忘れ (打刻なし) の記録 — 2 件" });
      const rows = within(list).getAllByRole("row").slice(1);
      expect(rows.map((r) => r.textContent)).toEqual([
        "10/1 (木)杉原退勤だけ—⚠ 出勤表ではこの日の出勤 0",
        "10/3 (土)川井出勤・退勤出勤 13:45 / 退勤 22:00責任者確認",
      ]);
      // 閲覧者には記録・直すボタンを出さない
      expect(screen.queryByRole("button", { name: "💳 カード忘れを記録" })).toBeNull();
      expect(within(list).queryByRole("button")).toBeNull();
    });

    it("記録の無い期間も「ありません」と出す", () => {
      renderView({ tab: MINUTES_TAB.ATTENDANCE });
      const list = screen.getByRole("region", { name: "💳 カード忘れ (打刻なし) の記録" });
      expect(list.textContent).toContain("この期間の記録はありません");
    });

    it("管理者はツールバー・一覧・セルから記録のダイアログを開ける", () => {
      const onEditCardForget = vi.fn();
      renderView({ tab: MINUTES_TAB.ATTENDANCE, cardForgets, onEditCardForget });
      fireEvent.click(screen.getByRole("button", { name: "💳 カード忘れを記録" }));
      expect(onEditCardForget).toHaveBeenLastCalledWith({});
      fireEvent.click(screen.getByRole("button", { name: "10/3 川井 のカード忘れを直す" }));
      expect(onEditCardForget).toHaveBeenLastCalledWith({ name: "川井", date: "2026-10-03" });

      // 記録のある日のセル: 内容と「直す」
      fireEvent.click(screen.getByRole("button", { name: /^川井 10\/3 \(土\): 出勤 2/ }));
      let dialog = screen.getByRole("dialog", { name: /川井 先生 — 10\/3 \(土\)/ });
      expect(within(dialog).getByText(/💳 カード忘れ: 出勤・退勤の打刻なし \(出勤 13:45 \/ 退勤 22:00\)。責任者確認/)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "直す" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      // 記録の無い日のセル: 「この日のカード忘れを記録」
      fireEvent.click(screen.getByRole("button", { name: /^奥村 10\/3 \(土\): 出勤 1/ }));
      dialog = screen.getByRole("dialog", { name: /奥村 先生 — 10\/3 \(土\)/ });
      fireEvent.click(within(dialog).getByRole("button", { name: "💳 この日のカード忘れを記録" }));
      expect(onEditCardForget).toHaveBeenLastCalledWith({ name: "奥村", date: "2026-10-03" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("画面には金額・単価を出さない (Excel の書き出しで金額入りを選んだときだけ単価が見える)", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE, attendanceSettings: { excelPassword: "12345" } });
    const sheet = document.querySelector(".pt-attendance-sheet");
    expect(sheet.textContent).not.toMatch(/円|金額|単価/);
    expect(screen.queryByRole("columnheader", { name: "金額" })).toBeNull();
    expect(screen.queryByLabelText(/単価/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" }));
    const dialog = screen.getByRole("dialog", { name: "バイト出勤表を Excel に書き出す" });
    // 既定は金額なし。単価の欄は出ない
    expect(within(dialog).getByRole("radio", { name: /金額なし/ }).checked).toBe(true);
    expect(within(dialog).queryByLabelText("単価 (円)")).toBeNull();
    fireEvent.click(within(dialog).getByRole("radio", { name: /金額入り/ }));
    expect(within(dialog).getByLabelText("単価 (円)").value).toBe("5500");
  });

  it("金額なしはそのまま書き出す (単価・パスワードを渡さない)", async () => {
    downloadMock.mockClear();
    renderView({ tab: MINUTES_TAB.ATTENDANCE, attendanceSettings: { excelPassword: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" }));
    const dialog = screen.getByRole("dialog", { name: "バイト出勤表を Excel に書き出す" });
    fireEvent.click(within(dialog).getByRole("button", { name: "⬇ 書き出す" }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock.mock.calls[0][0]).toMatchObject({
      startDate: "2026-09-21",
      endDate: "2026-10-20",
      unitPrice: null,
      password: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("金額入りは管理者が決めたパスワードで書き出す (書き出す人は入れない・閲覧者には見せない)", async () => {
    downloadMock.mockClear();
    // 閲覧者 (onSaveAttendanceSettings なし)
    renderView({ tab: MINUTES_TAB.ATTENDANCE, attendanceSettings: { excelPassword: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" }));
    const dialog = screen.getByRole("dialog", { name: "バイト出勤表を Excel に書き出す" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /金額入り/ }));
    // パスワードを入れる欄・決める欄は出ない (単価の数値欄だけ)
    expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    expect(dialog.textContent).not.toContain("12345");

    fireEvent.change(within(dialog).getByLabelText("単価 (円)"), { target: { value: "6000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "⬇ 書き出す" }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock.mock.calls[0][0]).toMatchObject({ unitPrice: 6000, password: "12345" });
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceUnitPrice))).toBe(6000);
    expect(JSON.parse(localStorage.getItem(LS.partTimeAttendanceExportMode))).toBe("amounts");
    // 画面に戻っても金額は出ない
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector(".pt-attendance-sheet").textContent).not.toMatch(/円|金額|単価/);
  });

  it("パスワードが決まるまで金額入りは選べない (前に金額入りを選んでいても金額なしで書き出す)", async () => {
    downloadMock.mockClear();
    localStorage.setItem(LS.partTimeAttendanceExportMode, JSON.stringify("amounts"));
    renderView({ tab: MINUTES_TAB.ATTENDANCE, attendanceSettings: { excelPassword: "" } });
    fireEvent.click(screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" }));
    const dialog = screen.getByRole("dialog", { name: "バイト出勤表を Excel に書き出す" });
    const amounts = within(dialog).getByRole("radio", { name: /金額入り/ });
    expect(amounts.disabled).toBe(true);
    expect(amounts.checked).toBe(false);
    expect(dialog.textContent).toContain("管理者がパスワードを決めると選べます");
    fireEvent.click(within(dialog).getByRole("button", { name: "⬇ 書き出す" }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock.mock.calls[0][0]).toMatchObject({ unitPrice: null, password: null });
  });

  it("管理者はダイアログの欄でパスワードを決めて保存でき、すぐ金額入りを選べる", async () => {
    const saved = [];
    function Harness() {
      const [settings, setSettings] = useState({ excelPassword: "" });
      return (
        <ToastProvider>
          <TeachingMinutesView
            slots={slots}
            partTimeStaff={partTimeStaff}
            tab={MINUTES_TAB.ATTENDANCE}
            attendanceSettings={settings}
            onSaveAttendanceSettings={(next) => {
              saved.push(next);
              setSettings(next);
            }}
          />
        </ToastProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "⬇ バイト出勤表 (Excel)" }));
    const dialog = screen.getByRole("dialog", { name: "バイト出勤表を Excel に書き出す" });
    expect(within(dialog).getByRole("radio", { name: /金額入り/ }).disabled).toBe(true);
    const field = within(dialog).getByRole("textbox", { name: /金額入りのパスワード/ });
    const save = within(dialog).getByRole("button", { name: "保存" });
    expect(save.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "12345" } });
    fireEvent.click(save);
    expect(saved).toEqual([{ excelPassword: "12345" }]);
    expect(within(dialog).getByRole("radio", { name: /金額入り/ }).disabled).toBe(false);
    expect(field.value).toBe("12345");
    // 空にして保存 = パスワードを外す (空のオブジェクト)
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(saved.at(-1)).toEqual({});
    expect(within(dialog).getByRole("radio", { name: /金額入り/ }).disabled).toBe(true);
  });

  it("空き時間のしきい値を広げると、離れたかたまりがつながる", () => {
    renderView({ tab: MINUTES_TAB.ATTENDANCE });
    // 16:30 → 18:30 は 120 分。120 分以上で別の出勤 → まだ 2
    fireEvent.change(screen.getByLabelText("別の出勤として数える空き時間"), { target: { value: "120" } });
    expect(daysOf("川井")).toBe("8");
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
    expect(daysOf("杉原")).toBe("1");
    fireEvent.click(screen.getByRole("checkbox", { name: "特訓" }));
    expect(daysOf("杉原")).toBe("0");
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
