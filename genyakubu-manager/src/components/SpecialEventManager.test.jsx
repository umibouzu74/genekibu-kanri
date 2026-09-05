// @vitest-environment jsdom
// 特別イベント管理のスモーク: 追加 / 編集 / 一覧の表示と削除 (Undo 付き) が
// 期待どおりの保存結果になることを固定する (一覧の切り出し時の回帰防止)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpecialEventManager } from "./SpecialEventManager";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

const EVENTS = [
  {
    id: 1,
    name: "修学旅行",
    type: "trip",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    memo: "中3 のみ",
    targetGrades: ["中3"],
    tags: ["附属"],
  },
  {
    id: 2,
    name: "文化祭",
    type: "school",
    startDate: "2026-09-12",
    endDate: "",
    memo: "",
    targetGrades: [],
    tags: [],
  },
];

function renderManager(specialEvents = EVENTS, props = {}) {
  const onSave = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <SpecialEventManager specialEvents={specialEvents} onSave={onSave} isAdmin {...props} />
    </ToastProvider>
  );
  return { onSave };
}

describe("SpecialEventManager", () => {
  it("一覧は開始日順に並び、全学年 / 学年バッジ・タグを出す", () => {
    renderManager();
    const names = screen.getAllByText(/修学旅行|文化祭/).map((el) => el.textContent);
    expect(names.indexOf("文化祭")).toBeLessThan(names.indexOf("修学旅行"));
    // 「全学年」「中3」はフォームの学年選択にも出るので件数で見る
    expect(screen.getAllByText("全学年").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("中3").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("附属")).toBeInTheDocument();
  });

  it("名称と開始日を入れて追加すると新しい id で保存される (終了日空欄は単日)", () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByPlaceholderText(/名称/), { target: { value: "体育祭" } });
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-11-02" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(3);
    expect(saved[2]).toMatchObject({ id: 3, name: "体育祭", startDate: "2026-11-02", endDate: "2026-11-02", targetGrades: [] });
  });

  it("名称が空なら理由を出して保存しない", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(screen.getByRole("alert")).toHaveTextContent("名称を入力してください");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("✏️ でフォームに読み込み、更新で同じ id を書き換える", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText("修学旅行 を編集"));
    const nameInput = screen.getByPlaceholderText(/名称/);
    expect(nameInput.value).toBe("修学旅行");
    fireEvent.change(nameInput, { target: { value: "修学旅行 (関西)" } });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.find((e) => e.id === 1)).toMatchObject({ name: "修学旅行 (関西)", targetGrades: ["中3"] });
    expect(saved).toHaveLength(2);
  });

  it("✕ で削除すると即保存される (Undo は toast 側)", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText("文化祭 を削除"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].map((e) => e.id)).toEqual([1]);
  });

  it("閲覧者には編集 / 削除ボタンもフォームも出ない", () => {
    renderManager(EVENTS, { isAdmin: false });
    expect(screen.queryByLabelText("修学旅行 を編集")).toBeNull();
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
    expect(screen.getByText("修学旅行")).toBeInTheDocument();
  });
});
