// @vitest-environment jsdom
// 反映ダイアログの期切替 (1学期 → 2学期)。表示が切り替わるには
//   ① 新時間割の開始日 + 旧時間割の終了日 (日付ベースのビュー)
//   ② ヘッダの時間割セレクタ (集計ベースのビュー)
// の両方が要るので、その配線が外れていないことを画面から固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReflectDialog } from "./ReflectDialog";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";
import { makeProject } from "./testUtils";

afterEach(cleanup);

const TIMETABLES = [
  { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-06", endDate: null, grades: [] },
];

function renderDialog(props = {}) {
  const saveTimetables = vi.fn();
  const saveSlots = vi.fn();
  const onActivateTimetable = vi.fn();
  const { container } = render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ReflectDialog
          project={makeProject({ name: "2026 2学期" })}
          timetables={TIMETABLES}
          slots={[]}
          saveTimetables={saveTimetables}
          saveSlots={saveSlots}
          saveProject={() => {}}
          activeTimetableId={1}
          onActivateTimetable={onActivateTimetable}
          onClose={() => {}}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  const dates = () => [...container.querySelectorAll('input[type="date"]')];
  return { saveTimetables, saveSlots, onActivateTimetable, dates };
}

const switchCheckbox = () =>
  screen.getByRole("checkbox", { name: /期切替として反映する/ });
const activateCheckbox = () =>
  screen.getByRole("checkbox", { name: /表示中の時間割を/ });

describe("ReflectDialog (期切替)", () => {
  it("切替日を入れると旧時間割の終了日 (前日) を予告する", () => {
    const { dates } = renderDialog();
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    expect(
      screen.getByText(/終了日を 2026-08-31 に設定します/)
    ).toBeInTheDocument();
    // 期切替では表示の追従も既定でオン
    expect(activateCheckbox()).toBeChecked();
  });

  it("実行すると新時間割の追加・旧時間割の終了・表示の切替が揃って起きる", async () => {
    const { saveTimetables, saveSlots, onActivateTimetable, dates } = renderDialog();
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "切り替える" }));

    fireEvent.click(await screen.findByRole("button", { name: "期切替を実行" }));

    await waitFor(() => expect(saveTimetables).toHaveBeenCalled());
    const saved = saveTimetables.mock.calls[0][0];
    expect(saved[0]).toMatchObject({ id: 1, endDate: "2026-08-31" });
    expect(saved[1]).toMatchObject({ name: "2026 2学期", startDate: "2026-09-01" });
    // 旧時間割のコマは消さない
    expect(saveSlots.mock.calls[0][0]).toHaveLength(2);
    expect(onActivateTimetable).toHaveBeenCalledWith(2);
  });

  it("切替日が無いと実行できない", () => {
    renderDialog();
    fireEvent.click(switchCheckbox());
    expect(
      screen.getByText(/期切替には切替日 \(新しい時間割の開始日\) が必要です/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切り替える" })).toBeDisabled();
  });

  it("表示期間設定が切替日より前に終わっていると警告する", () => {
    const { dates } = renderDialog({
      displayCutoff: {
        groups: [
          { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
        ],
      },
    });
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    expect(
      screen.getByText(/表示期間設定の終了日が切替日より前の学年グループがあります/)
    ).toBeInTheDocument();
  });

  it("期切替を使わなければ旧時間割に触らない", async () => {
    const { saveTimetables, onActivateTimetable, dates } = renderDialog();
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "反映する" }));

    await waitFor(() => expect(saveTimetables).toHaveBeenCalled());
    expect(saveTimetables.mock.calls[0][0][0]).toEqual(TIMETABLES[0]);
    // 表示の追従は既定オフ (明示的に選んだときだけ切り替える)
    expect(onActivateTimetable).not.toHaveBeenCalled();
  });
});
