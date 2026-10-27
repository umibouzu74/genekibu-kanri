// @vitest-environment jsdom
// 講師の所属: 区分ごとに並ぶ・名前を押して選び移す先を押すと年度から変わる・
// 次の年度へ引き継がれる・この年度の変更を取り消せる・閲覧者は見るだけ、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AffiliationView } from "./AffiliationView";
import { ToastProvider } from "../../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0)); // 2026-10-16 = 2026年度
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const timetables = [{ id: 1, name: "2026", startDate: "2026-04-01" }];
const slots = [
  { id: 1, day: "火", time: "19:50-20:35", grade: "中1", cls: "S", subj: "英語", teacher: "堀上", note: "" },
  { id: 2, day: "水", time: "16:25-17:25", grade: "附中2", cls: "-", subj: "英語", teacher: "石原", note: "" },
  { id: 3, day: "月", time: "18:55-19:40", grade: "中2", cls: "S", subj: "社会", teacher: "西岡", note: "" },
  { id: 4, day: "火", time: "18:55-19:40", grade: "中3", cls: "C", subj: "数学", teacher: "香川", note: "" },
];
const partTimeStaff = [{ name: "香川", subjectIds: [] }];

function Harness({ initial = [], isAdmin = true, onSaveSpy }) {
  const [aff, setAff] = useState(initial);
  return (
    <AffiliationView
      affiliations={aff}
      onSave={(next) => {
        onSaveSpy?.(next);
        setAff(next);
      }}
      slots={slots}
      timetables={timetables}
      partTimeStaff={partTimeStaff}
      isAdmin={isAdmin}
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

const section = (label) => screen.getByRole("region", { name: new RegExp(`^${label} \\d+ 人`) });

describe("AffiliationView", () => {
  it("登録なしは予備校部、バイトは現役部 非常勤に並ぶ", () => {
    renderView();
    expect(within(section("予備校部")).getByRole("button", { name: /^堀上/ })).toBeInTheDocument();
    expect(within(section("予備校部")).getByRole("button", { name: /^西岡/ })).toBeInTheDocument();
    expect(within(section("現役部 非常勤")).getByRole("button", { name: /^香川/ })).toBeInTheDocument();
    expect(within(section("現役部 常勤")).getByText("まだいません")).toBeInTheDocument();
  });

  it("名前を押して選び、移す先を押すとその年度から変わり、次の年度へ引き継がれる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(screen.getByRole("button", { name: /^堀上/ }));
    fireEvent.click(screen.getByRole("button", { name: /^石原/ }));
    const bar = screen.getByRole("region", { name: "選んだ講師を移す" });
    fireEvent.click(within(bar).getByRole("button", { name: "現役部 常勤" }));
    expect(spy).toHaveBeenLastCalledWith([
      { name: "堀上", fromYear: 2026, category: "genyaku-fulltime" },
      { name: "石原", fromYear: 2026, category: "genyaku-fulltime" },
    ]);
    expect(within(section("現役部 常勤")).getAllByRole("button", { name: /^(堀上|石原)/ })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "2026年度の変更" })).toHaveTextContent(
      "予備校部 → 現役部 常勤: 石原・堀上"
    );
    // 次の年度は何もしなくても同じ
    fireEvent.click(screen.getByRole("button", { name: /2027年度 ▶/ }));
    expect(within(section("現役部 常勤")).getAllByRole("button", { name: /^(堀上|石原)/ })).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "2027年度の変更" })).toBeNull();
    // 前の年度は変わらない (2025 年度にはまだ現役部 常勤がいない)
    fireEvent.change(screen.getByLabelText("年度"), { target: { value: "2025" } });
    expect(within(section("現役部 常勤")).getByText("まだいません")).toBeInTheDocument();
  });

  it("この年度の変更を取り消すと前の年度の区分に戻る / 元に戻すで戻せる", () => {
    const spy = vi.fn();
    renderView({
      initial: [{ name: "堀上", fromYear: 2026, category: "genyaku-fulltime" }],
      onSaveSpy: spy,
    });
    fireEvent.click(within(section("現役部 常勤")).getByRole("button", { name: /^堀上/ }));
    fireEvent.click(screen.getByRole("button", { name: /この年度の変更を取り消す/ }));
    expect(spy).toHaveBeenLastCalledWith([]);
    expect(within(section("予備校部")).getByRole("button", { name: /^堀上/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(within(section("現役部 常勤")).getByRole("button", { name: /^堀上/ })).toBeInTheDocument();
  });

  it("時間割にいない人を現役部に加えられる", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("加える講師名"), { target: { value: "新任" } });
    fireEvent.click(screen.getByRole("button", { name: "加える" }));
    expect(within(section("現役部 常勤")).getByRole("button", { name: /^新任/ })).toBeInTheDocument();
  });

  it("時間割にいない人を退職・非表示にすると、その年度だけ並び、次の年度からは並ばない", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("加える講師名"), { target: { value: "高松" } });
    fireEvent.change(screen.getByLabelText("加える区分"), { target: { value: "retired" } });
    fireEvent.click(screen.getByRole("button", { name: "加える" }));
    expect(within(section("退職・非表示")).getByRole("button", { name: /^高松/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2027年度 ▶/ }));
    expect(screen.queryByRole("button", { name: /^高松/ })).toBeNull();
  });

  it("閲覧者は見るだけ (選べない・加えられない)", () => {
    renderView({ isAdmin: false, initial: [{ name: "堀上", fromYear: 2026, category: "genyaku-fulltime" }] });
    expect(within(section("現役部 常勤")).getByText("堀上")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^堀上/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "選んだ講師を移す" })).toBeNull();
    expect(screen.queryByLabelText("加える講師名")).toBeNull();
  });
});
