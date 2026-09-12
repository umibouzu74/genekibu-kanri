// @vitest-environment jsdom
// 休講日管理: 連続日 (年末年始・盆休み) の一括登録と、一覧の期間絞り込み。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HolidayManager } from "./HolidayManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

function renderManager({ holidays = [], isAdmin = true, ...rest } = {}) {
  const onSave = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <HolidayManager holidays={holidays} onSave={onSave} isAdmin={isAdmin} {...rest} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

describe("HolidayManager の複数日登録", () => {
  it("開始日〜終了日を「＋ 日付を追加」でチップに足し、同じ対象設定で一括登録する", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByLabelText("日付 (開始日)"), { target: { value: "2026-12-29" } });
    fireEvent.change(screen.getByLabelText(/終了日/), { target: { value: "2027-01-03" } });
    fireEvent.click(screen.getByText("＋ 日付を追加"));
    // 6 日ぶんのチップ
    expect(screen.getAllByRole("button", { name: /を外す$/ })).toHaveLength(6);
    // 1 日外す
    fireEvent.click(screen.getByRole("button", { name: "日付 2027-01-03 を外す" }));
    fireEvent.change(screen.getByPlaceholderText("名称（任意）"), { target: { value: "年末年始" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.map((h) => h.date)).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(saved.map((h) => h.id)).toEqual([1, 2, 3, 4, 5]);
    expect(saved.every((h) => h.label === "年末年始" && h.scope[0] === "全部")).toBe(true);
  });

  it("日付欄に入れたまま「追加」を押しても登録できる (押し忘れの救済)", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByLabelText("日付 (開始日)"), { target: { value: "2026-08-13" } });
    fireEvent.change(screen.getByLabelText(/終了日/), { target: { value: "2026-08-15" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave.mock.calls[0][0].map((h) => h.date)).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
  });

  it("終了日が開始日より前なら弾く", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByLabelText("日付 (開始日)"), { target: { value: "2026-08-15" } });
    fireEvent.change(screen.getByLabelText(/終了日/), { target: { value: "2026-08-13" } });
    fireEvent.click(screen.getByText("＋ 日付を追加"));
    expect(screen.getByRole("alert").textContent).toMatch(/終了日は開始日以降/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("編集は 1 件だけを更新する", () => {
    const { onSave } = renderManager({
      holidays: [{ id: 7, date: "2999-01-01", label: "旧", scope: ["全部"], targetGrades: [], subjKeywords: [] }],
    });
    fireEvent.click(screen.getByRole("button", { name: "2999-01-01 の休講日を編集" }));
    // 編集中は日付欄が 1 つ出て、日付そのものも直せる
    fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2999-01-02" } });
    fireEvent.change(screen.getByPlaceholderText("名称（任意）"), { target: { value: "新" } });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(onSave.mock.calls[0][0]).toEqual([
      { id: 7, date: "2999-01-02", label: "新", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ]);
  });
});

describe("HolidayManager の期間絞り込み", () => {
  const HOLS = [
    { id: 1, date: "2000-01-01", label: "昔", scope: ["全部"] },
    { id: 2, date: "2999-01-01", label: "先", scope: ["全部"] },
  ];
  it("既定は今月以降。期間外の件数から「すべて」へ切り替えられる", () => {
    renderManager({ holidays: HOLS });
    expect(screen.queryByText("昔")).toBeNull();
    expect(screen.getByText("先")).toBeTruthy();
    expect(screen.getByText(/1 \/ 2 件表示/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /期間外の 1 件も表示/ }));
    expect(screen.getByText("昔")).toBeTruthy();
  });

  it("月を指定で絞れる", () => {
    renderManager({ holidays: HOLS });
    fireEvent.click(screen.getByRole("button", { name: "月を指定" }));
    fireEvent.change(screen.getByLabelText("休講日の表示月"), { target: { value: "2000-01" } });
    expect(screen.getByText("昔")).toBeTruthy();
    expect(screen.queryByText("先")).toBeNull();
  });

  it("絞り込みで 0 件のときは「登録なし」と言わない", () => {
    renderManager({ holidays: [HOLS[0]] });
    expect(screen.getByText(/この期間に該当する休講日はありません/)).toBeTruthy();
  });
});
