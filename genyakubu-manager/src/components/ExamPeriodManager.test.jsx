// @vitest-environment jsdom
// テスト期間の「例外的に授業を行う日」(classExceptions) の入力と保存形。
// 特訓は始まっているが授業は休みにしない日 (例: 9/19 土の中3) を登録できる。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPeriodManager } from "./ExamPeriodManager";
import { ConfirmProvider } from "../hooks/useConfirm";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

const EXAM = {
  id: 1,
  name: "2学期中間テスト期間",
  startDate: "2026-09-14",
  endDate: "2026-09-25",
  targetGrades: ["中1", "中2", "中3"],
  stopsClasses: true,
  tags: [],
};

function renderManager(examPeriods = [EXAM]) {
  const onSave = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ExamPeriodManager examPeriods={examPeriods} onSave={onSave} isAdmin />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

const exDateInput = () => screen.getByLabelText("例外的に授業を行う日");

describe("ExamPeriodManager の例外的に授業を行う日", () => {
  it("日付と学年を指定して追加し、更新で classExceptions が保存される", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));

    fireEvent.change(exDateInput(), { target: { value: "2026-09-19" } });
    fireEvent.click(screen.getByLabelText("中3 は授業を行う"));
    fireEvent.change(screen.getByLabelText("例外日のメモ"), {
      target: { value: "土曜のみ実施" },
    });
    fireEvent.click(screen.getByText("＋ 追加"));

    expect(screen.getByText(/中3 は授業あり/)).toBeTruthy();

    fireEvent.click(screen.getByText("更新"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0][0].classExceptions).toEqual([
      { date: "2026-09-19", grades: ["中3"], memo: "土曜のみ実施" },
    ]);
  });

  it("期間外の日付は追加できない", () => {
    renderManager();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    fireEvent.change(exDateInput(), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByText("＋ 追加"));
    expect(screen.getByRole("alert").textContent).toContain("テスト期間");
    expect(screen.queryByText(/授業あり/)).toBeNull();
  });

  it("学年を選ばなければ対象学年すべて (grades 空) で保存される", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    fireEvent.change(exDateInput(), { target: { value: "2026-09-19" } });
    fireEvent.click(screen.getByText("＋ 追加"));
    expect(screen.getByText(/対象学年すべて は授業あり/)).toBeTruthy();
    fireEvent.click(screen.getByText("更新"));
    expect(onSave.mock.calls[0][0][0].classExceptions).toEqual([
      { date: "2026-09-19", grades: [], memo: "" },
    ]);
  });

  it("既存の例外は一覧にバッジで出て、編集フォームに読み込まれる", () => {
    renderManager([
      {
        ...EXAM,
        classExceptions: [{ date: "2026-09-19", grades: ["中3"], memo: "" }],
      },
    ]);
    expect(screen.getByText("📖 09/19 授業あり (中3)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    expect(screen.getByText(/中3 は授業あり/)).toBeTruthy();
  });

  it("「授業を休止する」が OFF のときは入力欄を出さない", () => {
    renderManager();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    fireEvent.click(
      screen.getByText("授業を休止する (対象学年の通常コマを停止)")
    );
    expect(screen.queryByLabelText("例外的に授業を行う日")).toBeNull();
  });

  it("打ちかけの例外日は、更新で保存したあと・別の期間を開いたときに消える", () => {
    renderManager();
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    fireEvent.change(exDateInput(), { target: { value: "2026-09-19" } });
    fireEvent.change(screen.getByLabelText("例外日のメモ"), {
      target: { value: "未追加のメモ" },
    });
    // 「＋ 追加」せずに更新 → 下書きは保存されず、入力欄も空に戻る
    fireEvent.click(screen.getByText("更新"));
    expect(exDateInput().value).toBe("");
    expect(screen.getByLabelText("例外日のメモ").value).toBe("");

    // もう一度編集を開いても下書きは空のまま
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    fireEvent.change(exDateInput(), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByLabelText("2学期中間テスト期間 を編集"));
    expect(exDateInput().value).toBe("");
  });
});
