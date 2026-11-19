// @vitest-environment jsdom
// 時間割の削除: コマも一緒に削除するか、デフォルト時間割へ移すかを選ぶ (P1-2)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTimetablesCrud } from "./useTimetablesCrud";
import { ConfirmProvider } from "./useConfirm";
import { ToastProvider } from "./useToasts";

afterEach(cleanup);

const mk = (id, o = {}) => ({
  id,
  day: "水",
  time: "19:50-20:35",
  grade: "中3",
  cls: "B",
  room: "502",
  subj: "数学",
  teacher: "福武",
  note: "",
  ...o,
});

const TIMETABLES = [
  { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
  { id: 2, name: "1学期のコピー", type: "regular", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
];
// 複製で作った時間割 2 は、1 と同じコマ (#1 ↔ #10) と 1 にないコマ (#11)
const SLOTS = [mk(1), mk(10, { timetableId: 2 }), mk(11, { timetableId: 2, day: "金" })];

function Harness({ deps }) {
  const crud = useTimetablesCrud(deps);
  return (
    <button type="button" onClick={() => crud.remove(2)}>
      消す
    </button>
  );
}

function setup() {
  const deps = {
    timetables: TIMETABLES,
    saveTimetables: vi.fn(),
    slots: SLOTS,
    saveSlots: vi.fn(),
    saveDisplayCutoff: vi.fn(),
    detectSlotRemoval: vi.fn(() => ({ total: 0 })),
    onSlotsRemoved: vi.fn(() => ({ total: 0 })),
  };
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <Harness deps={deps} />
      </ConfirmProvider>
    </ToastProvider>
  );
  fireEvent.click(screen.getByText("消す"));
  return deps;
}

describe("useTimetablesCrud.remove", () => {
  it("どちらにするか選ぶまで削除できない。移す先の同じ内容のコマの数を知らせる", async () => {
    setup();
    const ok = await screen.findByRole("button", { name: "削除する" });
    expect(ok).toBeDisabled();
    expect(screen.getByText(/同じ内容のコマが「2026 1学期」に 1 件あります/)).toBeInTheDocument();
  });

  it("「コマも一緒に削除」: コマを消し、孤立データを片付ける (デフォルト時間割のコマは増えない)", async () => {
    const deps = setup();
    fireEvent.click(await screen.findByRole("radio", { name: /コマも一緒に削除する（2 コマ）/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(deps.saveSlots).toHaveBeenCalledTimes(1));
    expect(deps.saveSlots.mock.calls[0][0]).toEqual([SLOTS[0]]);
    expect(deps.onSlotsRemoved).toHaveBeenCalledWith([SLOTS[0]]);
    expect(deps.saveTimetables.mock.calls[0][0].map((t) => t.id)).toEqual([1]);
    // この時間割だけの表示期間設定も外す
    const drop = deps.saveDisplayCutoff.mock.calls[0][0];
    expect(drop({ groups: [{ label: "中3", grades: ["中3"], timetableId: 2 }], cohorts: [] }).groups).toEqual([]);
  });

  it("「デフォルト時間割へ移す」: 従来どおりコマをデフォルト時間割へ移す", async () => {
    const deps = setup();
    fireEvent.click(await screen.findByRole("radio", { name: /コマを「2026 1学期」へ移す/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(deps.saveSlots).toHaveBeenCalledTimes(1));
    expect(deps.saveSlots.mock.calls[0][0].map((s) => s.timetableId ?? 1)).toEqual([1, 1, 1]);
    expect(deps.onSlotsRemoved).not.toHaveBeenCalled();
  });

  it("キャンセルなら何も変えない", async () => {
    const deps = setup();
    fireEvent.click(await screen.findByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "削除する" })).toBeNull());
    expect(deps.saveSlots).not.toHaveBeenCalled();
    expect(deps.saveTimetables).not.toHaveBeenCalled();
  });
});
