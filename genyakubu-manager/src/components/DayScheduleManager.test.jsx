// @vitest-environment jsdom
// 特別時程管理: プリセットからの登録 / 衝突プレビュー / Undo 付き削除の
// 骨格を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DayScheduleManager } from "./DayScheduleManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

// 附属の水曜時程 (前期構成) + 中1 の夕方コマ (衝突プレビュー用)
const SLOTS = [
  { id: 1, day: "水", time: "16:25-17:25", grade: "附中1", cls: "-", room: "401", subj: "理科", teacher: "武下", note: "" },
  { id: 2, day: "水", time: "17:35-18:35", grade: "附中2", cls: "-", room: "402", subj: "英語", teacher: "石原", note: "" },
  { id: 3, day: "水", time: "18:45-19:45", grade: "附中3", cls: "-", room: "403", subj: "英語", teacher: "石原", note: "" },
  { id: 4, day: "水", time: "19:55-20:55", grade: "附中1", cls: "-", room: "401", subj: "数学", teacher: "片岡", note: "" },
  { id: 5, day: "水", time: "21:00-21:30", grade: "附中", cls: "-", room: "402", subj: "確認テスト", teacher: "松川", note: "" },
  // 17:30 開始 — ①16:25→17:00-17:50 の読み替えで武下が新たに重なる
  { id: 6, day: "水", time: "17:30-18:20", grade: "中1", cls: "A", room: "501", subj: "理科", teacher: "武下", note: "" },
];

const SAVED = {
  id: 1,
  date: "2026-10-07",
  label: "附属 1限カット",
  targetGrades: ["附中1", "附中2", "附中3", "附中"],
  timeMap: [],
  cancelTimes: ["16:25-17:25"],
  memo: "",
};

function renderManager({ daySchedules = [], isAdmin = true, ...rest } = {}) {
  const onSave = vi.fn();
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && (
                <button onClick={t.action.onClick}>{t.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>
        <DayScheduleManager
          daySchedules={daySchedules}
          onSave={onSave}
          slots={SLOTS}
          timetables={[]}
          isAdmin={isAdmin}
          {...rest}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

// 2026-10-07 は水曜日
const setDate = (value) => {
  const input = document.querySelector('input[type="date"]');
  fireEvent.change(input, { target: { value } });
};

describe("DayScheduleManager", () => {
  it("登録済みの特別時程を一覧表示する", () => {
    renderManager({ daySchedules: [SAVED] });
    expect(screen.getByText("2026-10-07 (水)")).toBeInTheDocument();
    expect(screen.getByText("附属 1限カット")).toBeInTheDocument();
    expect(screen.getByText("16:25-17:25 休講")).toBeInTheDocument();
  });

  it("プリセット① 50分授業: 読み替え表が自動生成され保存できる", () => {
    const { onSave } = renderManager();
    setDate("2026-10-07");
    fireEvent.click(screen.getByText("① 50分授業 (17:00開始)"));

    // 読み替え表: 4 コマ分の from が並び、テ 21:00-21:30 は据え置き (入力空)
    expect(screen.getByText("16:25-17:25")).toBeInTheDocument();
    expect(screen.getByDisplayValue("17:00-17:50")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20:00-20:50")).toBeInTheDocument();

    fireEvent.click(screen.getByText("登録"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe("附属 50分授業 (17:00開始)");
    expect(saved[0].targetGrades).toEqual(["附中1", "附中2", "附中3", "附中"]);
    expect(saved[0].timeMap).toEqual([
      { from: "16:25-17:25", to: "17:00-17:50" },
      { from: "17:35-18:35", to: "18:00-18:50" },
      { from: "18:45-19:45", to: "19:00-19:50" },
      { from: "19:55-20:55", to: "20:00-20:50" },
    ]);
    expect(saved[0].cancelTimes).toEqual([]);
  });

  it("プリセット② 1限カット: 最初の時間帯が休講になる", () => {
    const { onSave } = renderManager();
    setDate("2026-10-07");
    fireEvent.click(screen.getByText("② 1限カット"));
    fireEvent.click(screen.getByText("登録"));
    const saved = onSave.mock.calls[0][0];
    expect(saved[0].label).toBe("附属 1限カット");
    expect(saved[0].timeMap).toEqual([]);
    expect(saved[0].cancelTimes).toEqual(["16:25-17:25"]);
  });

  it("衝突プレビュー: 読み替えで新たに生じる講師の重なりを警告する", () => {
    renderManager();
    setDate("2026-10-07");
    fireEvent.click(screen.getByText("① 50分授業 (17:00開始)"));
    // 武下: 附中1 ①→17:00-17:50 が 中1 17:30-18:20 と新たに重なる
    expect(screen.getByText(/新たに生じる重なり/)).toBeInTheDocument();
    expect(screen.getByText(/講師 武下/)).toBeInTheDocument();
  });

  it("読み替えも休講も無い場合はエラーで保存しない", () => {
    const { onSave } = renderManager();
    setDate("2026-10-07");
    fireEvent.click(screen.getByText("附属一括"));
    fireEvent.click(screen.getByText("登録"));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText("時刻の読み替えか休講を 1 つ以上指定してください")
    ).toBeInTheDocument();
  });

  it("削除は即時 + Undo トースト (removeWithUndo)", () => {
    const { onSave } = renderManager({ daySchedules: [SAVED] });
    fireEvent.click(
      screen.getByLabelText("2026-10-07 の特別時程を削除")
    );
    expect(onSave).toHaveBeenCalledWith([]);
    expect(screen.getByText("元に戻す")).toBeInTheDocument();
  });

  it("閲覧モード (isAdmin=false) ではフォームを出さない", () => {
    renderManager({ daySchedules: [SAVED], isAdmin: false });
    expect(screen.queryByText("特別時程を登録")).not.toBeInTheDocument();
    expect(screen.getByText("附属 1限カット")).toBeInTheDocument();
  });
});
