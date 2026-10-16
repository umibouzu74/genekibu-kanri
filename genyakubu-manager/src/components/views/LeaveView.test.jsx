// @vitest-environment jsdom
// 有給・半休: 現役部 常勤の人が月の表に並ぶ・マスを押して種類を押すと入る・
// 期間でまとめて入る・元に戻せる・授業があって代行・欠勤の登録が無ければ
// 知らせて欠勤登録へつなぐ・閲覧者には中身を出さない、を固定する。
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

function Harness({ initial = { records: [], grants: [] }, enabled = true, onSaveSpy, subs = [], onRegisterAbsence }) {
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
