// @vitest-environment jsdom
// 表示期間設定の「初回1限はオリエン（回数に数えない）」チェックボックス。
// 未設定 (従来データ) の既定表示と、切り替えたときの保存形を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimetableManagerView } from "./TimetableManagerView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: null, endDate: null, grades: [] },
];

const CUTOFF = {
  groups: [
    { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: null },
    { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: null },
  ],
  cohorts: [],
};

function renderView(displayCutoff = CUTOFF) {
  const onSaveDisplayCutoff = vi.fn();
  const ttCrud = { add: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn() };
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <TimetableManagerView
          timetables={TIMETABLES}
          displayCutoff={displayCutoff}
          slots={[]}
          classSets={[]}
          onSaveClassSets={vi.fn()}
          ttCrud={ttCrud}
          onSaveDisplayCutoff={onSaveDisplayCutoff}
          isAdmin
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSaveDisplayCutoff, ttCrud };
}

const orientationBoxes = () =>
  screen
    .getAllByLabelText("初回1限はオリエン（回数に数えない）")
    .filter((el) => el.type === "checkbox");

describe("TimetableManagerView 表示期間設定のオリエン設定", () => {
  it("未設定なら中学部グループだけチェック済みで出る (従来既定)", () => {
    renderView();
    const [chu3, kou3] = orientationBoxes();
    expect(chu3.checked).toBe(true);
    expect(kou3.checked).toBe(false);
  });

  it("外すと該当グループに orientationFirstDay: false が保存される", () => {
    const { onSaveDisplayCutoff } = renderView();
    fireEvent.click(orientationBoxes()[0]);
    expect(onSaveDisplayCutoff).toHaveBeenCalledTimes(1);
    const saved = onSaveDisplayCutoff.mock.calls[0][0];
    expect(saved.groups[0]).toMatchObject({
      label: "中3",
      startDate: "2026-04-07",
      orientationFirstDay: false,
    });
    // 他のグループは触らない
    expect(saved.groups[1].orientationFirstDay).toBeUndefined();
  });

  it("明示設定があればその値を表示する (高校部でも有効にできる)", () => {
    renderView({
      groups: [
        { label: "中3", grades: ["中3"], startDate: null, date: null, orientationFirstDay: false },
        { label: "高3", grades: ["高3"], startDate: null, date: null, orientationFirstDay: true },
      ],
      cohorts: [],
    });
    const [chu3, kou3] = orientationBoxes();
    expect(chu3.checked).toBe(false);
    expect(kou3.checked).toBe(true);
  });
});

describe("TimetableManagerView 時間割フォームの期間", () => {
  it("終了日が開始日より前なら保存できず、理由を出す", () => {
    const { ttCrud } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "2学期" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2026-08-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("終了日は開始日以降にしてください");
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(ttCrud.add).not.toHaveBeenCalled();
  });

  it("終了日を直せば保存できる", () => {
    const { ttCrud } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "2学期" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2026-12-20" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(ttCrud.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "2学期", startDate: "2026-09-01", endDate: "2026-12-20" })
    );
  });
});
