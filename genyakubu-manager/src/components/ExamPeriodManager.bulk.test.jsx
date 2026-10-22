// @vitest-environment jsdom
// テスト期間の「📋 まとめて登録」: 付録 B の表 (学校の行事予定表から読み取った
// 考査日程) をそのまま貼って登録でき、元に戻すは足した id だけを消す。出典ごとの
// まとめて削除は特訓シフトへの cascade があるので確認ダイアログを挟む。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExamPeriodManager } from "./ExamPeriodManager";
import { ConfirmProvider } from "../hooks/useConfirm";
import { ToastProvider } from "../hooks/useToasts";
import { SCHOOL_EXAM_TSV } from "../utils/testdata/schoolSchedule2026";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 3, 1, 12, 0, 0)); // 2026-04-01 (年度の初め)
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CHUGAKU = {
  id: 1,
  name: "中学 1学期中間",
  startDate: "2026-05-18",
  endDate: "2026-05-20",
  targetGrades: ["中1", "中2", "中3"],
  stopsClasses: true,
  tags: [],
};

function Harness({ initial, onList, examPrepSchedules = [], examPrepCrud = null }) {
  const [list, setList] = useState(initial);
  onList(list);
  return (
    <ExamPeriodManager
      examPeriods={list}
      onSave={(next) => setList((prev) => (typeof next === "function" ? next(prev) : next))}
      isAdmin
      examPrepSchedules={examPrepSchedules}
      examPrepCrud={examPrepCrud}
    />
  );
}

function renderManager(initial = [CHUGAKU], extra = {}) {
  let current = initial;
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
        <Harness initial={initial} onList={(l) => (current = l)} {...extra} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { list: () => current };
}

const paste = (dialog, text) => {
  fireEvent.change(within(dialog).getByLabelText("貼り付ける表 (TSV)"), { target: { value: text } });
  fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
};

describe("テスト期間のまとめて登録", () => {
  it("付録 B の表をそのまま貼って 12 件登録。元に戻すは足した分だけ消す", () => {
    const { list } = renderManager();
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog", { name: "📋 テスト期間をまとめて登録" });
    paste(dialog, SCHOOL_EXAM_TSV);
    expect(within(dialog).getByRole("status").textContent).toMatch("OK 12 件 / 重複 0 件 / エラー 0 件");
    fireEvent.click(within(dialog).getByRole("button", { name: "12 件を登録" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(list()).toHaveLength(13);
    const kimatsu = list().find((e) => e.name === "桜井2学期期末");
    expect(kimatsu).toMatchObject({
      id: 6, // 中学 1学期中間 (id 1) の次から、表の順に振る
      startDate: "2026-11-19",
      endDate: "2026-12-02",
      stopsClasses: false,
      tags: ["桜井"],
      examDates: ["2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02"],
      source: "2026桜井年間行事計画",
    });
    // 一覧には「発表 → 考査」(桜井・第一の 1学期中間。期間は今月以降 = 全件)
    expect(screen.getAllByText("発表 5/12 → 考査 5/19〜22（4日）")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(list()).toEqual([CHUGAKU]);
  });

  it("同じ学校・名称・発表日は重複として既定で飛ばす", () => {
    renderManager([
      CHUGAKU,
      { id: 2, name: "桜井2学期中間", startDate: "2026-10-06", endDate: "2026-10-16", targetGrades: [], stopsClasses: false, tags: ["桜井"] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog");
    paste(dialog, SCHOOL_EXAM_TSV);
    expect(within(dialog).getByRole("status").textContent).toMatch("OK 11 件 / 重複 1 件 / エラー 0 件");
    expect(within(dialog).getByRole("button", { name: "11 件を登録" })).toBeTruthy();
  });
});

describe("出典ごとのまとめて削除", () => {
  const withSource = [
    CHUGAKU,
    { id: 2, name: "桜井2学期中間", startDate: "2026-10-06", endDate: "2026-10-16", targetGrades: [], stopsClasses: false, tags: ["桜井"], source: "桜井2026" },
    { id: 3, name: "桜井2学期期末", startDate: "2026-11-19", endDate: "2026-12-02", targetGrades: [], stopsClasses: false, tags: ["桜井"], source: "桜井2026" },
  ];

  it("出典で絞り、確認のうえで消す。特訓シフトのある期間は 1 回の保存でまとめて cascade", async () => {
    const cascadeDeletePeriod = vi.fn();
    const { list } = renderManager(withSource, {
      examPrepSchedules: [{ examPeriodId: 3, days: [{ date: "2026-11-25", periods: [], assignments: {} }] }],
      examPrepCrud: { cascadeDeletePeriod },
    });
    const sources = screen.getByRole("group", { name: "出典で絞り込む" });
    fireEvent.click(within(sources).getByRole("button", { name: "📄 桜井2026 2" }));
    expect(screen.queryByText("中学 1学期中間")).toBeNull();
    fireEvent.click(within(sources).getByRole("button", { name: "この出典の 2 件をまとめて削除" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "出典ごとに削除" });
    expect(confirmDialog.textContent).toContain("特訓シフト設定のある 1 件 (桜井2学期期末)");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "削除" }));
    await screen.findByText("中学 1学期中間");
    expect(cascadeDeletePeriod).toHaveBeenCalledWith([3]);
    expect(list()).toEqual([CHUGAKU]);
  });
});
