// @vitest-environment jsdom
// 高校・予備校の講習: パンフレットの担当表を貼ってまとめて登録できる (期・時限も作る)・
// 担当しない日を外せる・担当の削除は Undo 付き・期の削除は担当ごと (確認)・閲覧者は
// 見るだけ、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SeniorKoshuView } from "./SeniorKoshuView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { EMPTY_SENIOR_KOSHU } from "../../utils/seniorKoshu";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 0)); // 2026-10-27
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DATA = {
  terms: [{ id: 1, name: "高3 Ⅰ期", dates: ["2026-12-24", "2026-12-25", "2026-12-26"] }],
  periods: [{ id: 1, name: "予備校３限", time: "12:25-13:35" }],
  lessons: [
    { id: 1, teacher: "伊藤", termId: 1, periodId: 1, grade: "高3", course: "共通テスト理科基礎(物理基礎)" },
  ],
};

let latest = null;
function Harness({ initial = EMPTY_SENIOR_KOSHU, isAdmin = true, onSelectTeacher }) {
  const [data, setData] = useState(initial);
  latest = data;
  return (
    <SeniorKoshuView
      data={data}
      onSave={(next) => setData((prev) => (typeof next === "function" ? next(prev) : next))}
      isAdmin={isAdmin}
      teacherNames={["伊藤", "堀上"]}
      teacherKana={{ 伊藤: "いとう", 堀上: "ほりかみ", 藤本: "ふじもと" }}
      onSelectTeacher={onSelectTeacher}
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
      <ConfirmProvider>
        <Harness {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );

describe("SeniorKoshuView", () => {
  it("担当表を貼ってまとめて登録できる (期・時限も作り、講師は「・」で分ける)", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "📋 表でまとめて登録" }));
    const tsv = [
      "講師\t期\t時限\t学年\t講座名\t外す日\t日付\t時刻",
      "伊藤\t高3 Ⅰ期\t予備校３限\t高3\t共通テスト理科基礎(物理基礎)\t12/26\t12/24〜12/26\t12:25-13:35",
      "藤本・本澤\t高3 Ⅰ期\t予備校１限\t高3\t共通テスト英語\t\t\t9:00-10:10",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("高校・予備校の講習の表"), { target: { value: tsv } });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("担当 3 件");
    expect(status.textContent).toContain("新しい期: 高3 Ⅰ期");
    expect(status.textContent).toContain("予備校１限 09:00-10:10");
    // 時間割・講師管理に出てこない名前は注意 (登録はする)
    expect(status.textContent).toContain("藤本・本澤");
    fireEvent.click(screen.getByRole("button", { name: "登録する (3 件)" }));

    expect(latest.terms.map((t) => [t.name, t.dates])).toEqual([
      ["高3 Ⅰ期", ["2026-12-24", "2026-12-25", "2026-12-26"]],
    ]);
    expect(latest.periods.map((p) => [p.name, p.time])).toEqual([
      ["予備校３限", "12:25-13:35"],
      ["予備校１限", "09:00-10:10"],
    ]);
    expect(latest.lessons.map((l) => [l.teacher, l.course, l.skipDates || []])).toEqual([
      ["伊藤", "共通テスト理科基礎(物理基礎)", ["2026-12-26"]],
      ["藤本", "共通テスト英語", []],
      ["本澤", "共通テスト英語", []],
    ]);
    expect(screen.getByTestId("toasts").textContent).toContain("担当を 3 件登録しました。期を 1 つ・時限を 2 つ作りました");
    // 一覧: 時限の早い順 (予備校１限 → ３限)
    const rows = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent);
    expect(rows).toEqual(["共通テスト英語", "共通テスト英語", "共通テスト理科基礎(物理基礎)"]);
  });

  it("担当しない日を 📅 で外せる", () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "伊藤 共通テスト理科基礎(物理基礎) の担当する日を選ぶ" }));
    const group = screen.getByRole("group", { name: "担当する日 (押すと外す)" });
    fireEvent.click(within(group).getByRole("button", { name: "12/26(土)" }));
    expect(latest.lessons[0].skipDates).toEqual(["2026-12-26"]);
    expect(screen.getByText("2/3日")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "12/26(土)" }));
    expect(latest.lessons[0].skipDates).toBeUndefined();
  });

  it("担当の削除は 6 秒の「元に戻す」で戻せる", () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "伊藤 共通テスト理科基礎(物理基礎) を消す" }));
    expect(latest.lessons).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(latest.lessons.map((l) => l.teacher)).toEqual(["伊藤"]);
  });

  it("期の削除は確認してから、その期の担当ごと消す", async () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "期「高3 Ⅰ期」を消す" }));
    expect(screen.getByText(/この期の担当 1 件も消えます/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "消す" }));
    });
    expect(latest.terms).toEqual([]);
    expect(latest.lessons).toEqual([]);
  });

  it("担当を足す: 講師は「・」で何人でも、同じ担当は飛ばす", () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "＋ 担当" }));
    fireEvent.change(screen.getByLabelText("担当の学年"), { target: { value: "高3" } });
    fireEvent.change(screen.getByLabelText("担当の講座名"), { target: { value: "共通テスト理科基礎(物理基礎)" } });
    fireEvent.change(screen.getByLabelText("担当の講師"), { target: { value: "伊藤・堀上" } });
    fireEvent.click(screen.getByRole("button", { name: "足す" }));
    expect(latest.lessons.map((l) => l.teacher)).toEqual(["伊藤", "堀上"]);
    expect(screen.getByTestId("toasts").textContent).toContain("担当を 1 件足しました (堀上: 共通テスト理科基礎(物理基礎))。登録済みの 1 件は飛ばしました");
  });

  it("消した直後に足しても、消した担当は「元に戻す」で戻る (id を使い回さない)", () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "伊藤 共通テスト理科基礎(物理基礎) を消す" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 担当" }));
    fireEvent.change(screen.getByLabelText("担当の講座名"), { target: { value: "共通テスト英語" } });
    fireEvent.change(screen.getByLabelText("担当の講師"), { target: { value: "堀上" } });
    fireEvent.click(screen.getByRole("button", { name: "足す" }));
    expect(latest.lessons.map((l) => [l.id, l.teacher])).toEqual([[2, "堀上"]]);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(latest.lessons.map((l) => l.teacher).sort()).toEqual(["伊藤", "堀上"]);
  });

  it("担当を消した後に期を消したら、担当の「元に戻す」は戻さない (無い期を指す担当を残さない)", async () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "伊藤 共通テスト理科基礎(物理基礎) を消す" }));
    fireEvent.click(screen.getByRole("button", { name: "期「高3 Ⅰ期」を消す" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "消す" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(latest.lessons).toEqual([]);
  });

  it("行の直しで講師を 2 人入れたら止める", () => {
    renderView({ initial: DATA });
    fireEvent.click(screen.getByRole("button", { name: "伊藤 共通テスト理科基礎(物理基礎) を直す" }));
    fireEvent.change(screen.getByLabelText("講師"), { target: { value: "伊藤・藤本" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert").textContent).toContain("講師は 1 人ずつです");
    expect(latest.lessons[0].teacher).toBe("伊藤");
  });

  it("講師名から月間の予定を開ける。閲覧者には書き換えのボタンを出さない", () => {
    const onSelectTeacher = vi.fn();
    renderView({ initial: DATA, isAdmin: false, onSelectTeacher });
    expect(screen.queryByRole("button", { name: "📋 表でまとめて登録" })).toBeNull();
    expect(screen.queryByRole("button", { name: /を消す$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "伊藤" }));
    expect(onSelectTeacher).toHaveBeenCalledWith("伊藤");
  });
});
