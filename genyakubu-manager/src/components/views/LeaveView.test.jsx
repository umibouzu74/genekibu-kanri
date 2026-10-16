// @vitest-environment jsdom
// 有給・半休: 現役部 常勤の人が月の表に並ぶ・マスを押して種類を押すと入る・
// 期間でまとめて入る・元に戻せる・授業があって代行・欠勤の登録が無ければ
// 知らせて欠勤登録へつなぐ・閲覧者には中身を出さない・「＋ 有給・半休を入れる」/
// 年度のまとめ / 外からの要求で人と日を選ぶ欄を開く・年間カレンダーの公休を出し
// 期間で入れるときに公休を除く、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LeaveView } from "./LeaveView";
import { ToastProvider } from "../../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0)); // 2026-10-16 (金)
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const affiliations = [
  { name: "石原", fromYear: 2026, category: "genyaku-fulltime" },
  { name: "堀上", fromYear: 2026, category: "genyaku-fulltime" },
];
const timetables = [{ id: 1, name: "2026", startDate: "2026-04-01" }];
// 石原は水曜に 1 コマ (2026-10-21 は水曜)
const slots = [
  { id: 1, day: "水", time: "16:25-17:25", grade: "附中2", cls: "-", room: "402", subj: "英語", teacher: "石原", note: "" },
];

function Harness({
  initial = { records: [], grants: [] },
  enabled = true,
  onSaveSpy,
  subs = [],
  onRegisterAbsence,
  focusRequest = null,
  onConsumeFocus,
}) {
  const [leave, setLeave] = useState(initial);
  return (
    <LeaveView
      staffLeave={leave}
      enabled={enabled}
      onSave={(next) =>
        setLeave((prev) => {
          const v = typeof next === "function" ? next(prev) : next;
          onSaveSpy?.(v);
          return v;
        })
      }
      affiliations={affiliations}
      slots={slots}
      subs={subs}
      timetables={timetables}
      onRegisterAbsence={onRegisterAbsence}
      focusRequest={focusRequest}
      onConsumeFocus={onConsumeFocus}
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
      <Harness {...props} />
    </ToastProvider>
  );

const cellBtn = (label) => screen.getByRole("button", { name: new RegExp(`^${label}`) });

describe("LeaveView", () => {
  it("閲覧者 (管理者のデータを読めない) には中身を出さない", () => {
    renderView({ enabled: false });
    expect(screen.getByText(/管理者だけが見られます/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("現役部 常勤の人が月の表に並び、マスを押して種類を押すと入る", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    const table = screen.getByRole("table", { name: "2026年10月の有給・半休" });
    expect(within(table).getByRole("rowheader", { name: /石原/ })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /堀上/ })).toBeInTheDocument();
    fireEvent.click(cellBtn("10/19 \\(月\\) 堀上"));
    fireEvent.click(screen.getByRole("button", { name: "午後半休" }));
    expect(spy).toHaveBeenLastCalledWith({
      records: [{ id: 1, name: "堀上", date: "2026-10-19", kind: "pm" }],
      grants: [],
    });
    expect(cellBtn("10/19 \\(月\\) 堀上: 午後半休")).toHaveTextContent("後");
  });

  it("期間でまとめて入れ (日曜を除く)、元に戻すで消せる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(cellBtn("10/17 \\(土\\) 堀上"));
    fireEvent.click(screen.getByLabelText("期間でまとめて入れる"));
    fireEvent.change(screen.getByLabelText("期間の終わりの日"), { target: { value: "2026-10-20" } });
    expect(screen.getByText(/3 日に入れます/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "有給" }));
    expect(spy.mock.lastCall[0].records.map((r) => r.date)).toEqual([
      "2026-10-17",
      "2026-10-19",
      "2026-10-20",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(spy.mock.lastCall[0].records).toEqual([]);
  });

  it("授業がある日で代行・欠勤の登録が無ければ知らせ、欠勤登録を開ける", () => {
    const onRegisterAbsence = vi.fn();
    renderView({
      initial: {
        records: [{ id: 1, name: "石原", date: "2026-10-21", kind: "full" }],
        grants: [{ name: "石原", year: 2026, days: 10 }],
      },
      onRegisterAbsence,
    });
    expect(cellBtn("10/21 \\(水\\) 石原: 有給").getAttribute("aria-label")).toMatch(
      /代行・欠勤の登録なし/
    );
    expect(screen.getByText(/授業 1 コマに代行・欠勤の登録なし/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "欠勤を登録…" })[0]);
    expect(onRegisterAbsence).toHaveBeenCalledWith({ teachers: ["石原"], date: "2026-10-21" });
    // 年度のまとめ: 有給 1 / 持ち日数 10 / 残り 9
    const summary = screen.getByRole("spinbutton", { name: "石原 の持ち日数" }).closest("tr");
    expect(summary).toHaveTextContent("9");
  });

  it("欠勤を登録済みなら知らせない", () => {
    renderView({
      initial: { records: [{ id: 1, name: "石原", date: "2026-10-21", kind: "full" }], grants: [] },
      subs: [
        { id: 1, date: "2026-10-21", slotId: 1, originalTeacher: "石原", substitute: "", status: "requested" },
      ],
    });
    expect(cellBtn("10/21 \\(水\\) 石原: 有給").getAttribute("aria-label")).not.toMatch(
      /登録なし/
    );
    expect(screen.queryByText(/コマに代行・欠勤の登録なし/)).toBeNull();
  });
});

describe("LeaveView — 入れる欄への導線", () => {
  it("「＋ 有給・半休を入れる」で人と日を選んで入れられる (日付で月も移る)", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(screen.getByRole("button", { name: "＋ 有給・半休を入れる" }));
    const panel = screen.getByRole("region", { name: "有給・半休を入れる" });
    expect(within(panel).getByText(/誰の休暇かを選ぶと/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "有給" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "堀上" }));
    fireEvent.change(screen.getByLabelText("入れる日"), { target: { value: "2026-11-02" } });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("2026年11月の有給・半休");
    const editor = screen.getByRole("region", { name: "11/2 (月) 堀上 の休暇" });
    fireEvent.click(within(editor).getByRole("button", { name: "有給" }));
    expect(spy.mock.lastCall[0].records).toEqual([{ id: 1, name: "堀上", date: "2026-11-02", kind: "full" }]);
  });

  it("外からの要求 (ダッシュボードの休暇の 1 行など) でその人・その日の欄を開く", () => {
    const onConsumeFocus = vi.fn();
    renderView({ focusRequest: { name: "石原", date: "2026-10-21", token: 1 }, onConsumeFocus });
    expect(screen.getByRole("region", { name: "10/21 (水) 石原 の休暇" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "石原", pressed: true })).toBeInTheDocument();
    expect(onConsumeFocus).toHaveBeenCalledTimes(1);
  });

  it("年度のまとめの「＋ 入れる」でその人の欄を開く (表示中の月なら今日)", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "石原 の有給・半休を入れる" }));
    expect(screen.getByRole("region", { name: "10/16 (金) 石原 の休暇" })).toBeInTheDocument();
  });
});

describe("LeaveView — 年間カレンダー (常勤の公休)", () => {
  const calendar = {
    year: 2026,
    source: "予定表.xls / 2026年度カレンダー",
    importedAt: "2026-10-16",
    patterns: [
      { key: "土日", label: "土日 休み", offDates: ["2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25"], total: 105 },
      { key: "日月", label: "日月 休み", offDates: ["2026-10-18", "2026-10-19", "2026-10-25", "2026-10-26"], total: 105 },
    ],
    days: [
      { date: "2026-10-12", holiday: true, event: "スポーツの日" },
      { date: "2026-10-24", kind: "closed" },
      { date: "2026-10-28", event: "期末テスト" },
    ],
    notes: [],
  };
  const initial = {
    records: [],
    grants: [],
    calendars: [calendar],
    workPatterns: [{ name: "石原", fromYear: 2026, pattern: "土日" }],
  };

  it("休みの型を選んだ人の公休を「休」で出し、見出しに祝日・塾の休みを出す", () => {
    renderView({ initial });
    expect(cellBtn("10/17 \\(土\\) 石原: 公休 \\(土日 休み\\)")).toHaveTextContent("休");
    expect(cellBtn("10/17 \\(土\\) 堀上: 記録なし")).toHaveTextContent("");
    const table = screen.getByRole("table", { name: "2026年10月の有給・半休" });
    expect(within(table).getByRole("columnheader", { name: /^12/ }).getAttribute("title")).toMatch(
      /祝日 スポーツの日/
    );
    expect(within(table).getByRole("columnheader", { name: /^24/ }).getAttribute("title")).toMatch(/塾の休み/);
    expect(screen.getByText(/土日 休み/, { selector: "b" })).toBeInTheDocument();
  });

  it("年度のまとめで休みの型を選ぶ・公休の日数が出る", () => {
    const spy = vi.fn();
    renderView({ initial, onSaveSpy: spy });
    const ishihara = screen.getByRole("combobox", { name: "石原 の休みの型" });
    expect(ishihara.value).toBe("土日");
    expect(ishihara.closest("tr")).toHaveTextContent("105");
    fireEvent.change(screen.getByRole("combobox", { name: "堀上 の休みの型" }), { target: { value: "日月" } });
    expect(spy.mock.lastCall[0].workPatterns).toEqual([
      { name: "堀上", fromYear: 2026, pattern: "日月" },
      { name: "石原", fromYear: 2026, pattern: "土日" },
    ]);
    expect(cellBtn("10/19 \\(月\\) 堀上: 公休 \\(日月 休み\\)")).toHaveTextContent("休");
  });

  it("公休の日を開くと知らせ、期間で入れるときは公休を除く", () => {
    const spy = vi.fn();
    renderView({ initial, onSaveSpy: spy });
    fireEvent.click(cellBtn("10/17 \\(土\\) 石原"));
    expect(screen.getByText(/この日は 石原 の公休 \(土日 休み\) です/)).toBeInTheDocument();
    fireEvent.click(cellBtn("10/16 \\(金\\) 石原"));
    fireEvent.click(screen.getByLabelText("期間でまとめて入れる"));
    fireEvent.change(screen.getByLabelText("期間の終わりの日"), { target: { value: "2026-10-20" } });
    expect(screen.getByLabelText("公休を除く (年間カレンダー)")).toBeChecked();
    expect(screen.getByText(/3 日に入れます/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "有給" }));
    expect(spy.mock.lastCall[0].records.map((r) => r.date)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
  });

  it("取り込んだカレンダーの中身を出し、外せる (元に戻せる)", () => {
    const spy = vi.fn();
    renderView({ initial, onSaveSpy: spy });
    expect(screen.getByText(/取り込んだもの: 予定表.xls/)).toBeInTheDocument();
    expect(screen.getByText(/休みの型が未設定の人が 1 人/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "外す" }));
    expect(spy.mock.lastCall[0].calendars).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(spy.mock.lastCall[0].calendars).toHaveLength(1);
  });
});
