// @vitest-environment jsdom
// 同じ内容のコマの整理 (P1-2): 自動では消さず、組ごとに残すコマを選んで消す。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DuplicateSlotsDialog } from "./DuplicateSlotsDialog";
import { ConfirmProvider } from "../hooks/useConfirm";
import { ToastProvider } from "../hooks/useToasts";
import { findDuplicateSlotGroups } from "../utils/duplicateSlots";

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

const SLOTS = [mk(1), mk(283, { timetableId: 1 }), mk(2, { day: "金" }), mk(284, { day: "金", timetableId: 1 })];

function setup({ isAdmin = true, refCounts = new Map([["283", 2]]) } = {}) {
  const onRemoveSlots = vi.fn(() => ({ total: 0 }));
  const onClose = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <DuplicateSlotsDialog
          timetable={{ id: 1, name: "2026 1学期" }}
          groups={findDuplicateSlotGroups(SLOTS)}
          refCounts={refCounts}
          allSlots={SLOTS}
          detectSlotRemoval={() => ({ total: 0 })}
          onRemoveSlots={onRemoveSlots}
          isAdmin={isAdmin}
          onClose={onClose}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onRemoveSlots, onClose };
}

describe("DuplicateSlotsDialog", () => {
  it("既定は代行・調整などが付いている方を残す (無ければ番号の小さい方)", () => {
    setup();
    expect(screen.getByRole("radio", { name: "コマ #283 を残す" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "コマ #2 を残す" })).toBeChecked();
    expect(screen.getByRole("button", { name: /2 コマを削除/ })).toBeInTheDocument();
  });

  it("確認してから、選ばなかったコマを消す", async () => {
    const { onRemoveSlots, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /2 コマを削除/ }));
    expect(onRemoveSlots).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));
    await waitFor(() => expect(onRemoveSlots).toHaveBeenCalledWith([1, 284]));
    expect(onClose).toHaveBeenCalled();
  });

  it("決め方を「番号の大きい方」にすると全部の組で入れ替わる。組ごとに選び直せる", async () => {
    const { onRemoveSlots } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "番号の大きい方を残す" }));
    expect(screen.getByRole("radio", { name: "コマ #284 を残す" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "コマ #1 を残す" }));
    fireEvent.click(screen.getByRole("button", { name: /2 コマを削除/ }));
    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));
    await waitFor(() => expect(onRemoveSlots).toHaveBeenCalledWith([283, 2]));
  });

  it("閲覧者には削除の操作を出さない", () => {
    setup({ isAdmin: false });
    expect(screen.queryByRole("button", { name: /コマを削除/ })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getAllByText(/コマ #/).length).toBe(4);
  });
});
