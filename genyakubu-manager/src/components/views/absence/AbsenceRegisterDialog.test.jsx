// @vitest-environment jsdom
// 欠勤組み換えの「❗ 欠勤にする」: 現役部 常勤の人がいれば「有給・半休にも
// 記録する」を出し、選んだ種類を onSubmit の 4 番目で返す。コマを全部外した
// (来られる) 人には付けない。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AbsenceRegisterDialog } from "./AbsenceRegisterDialog";

afterEach(cleanup);

const mk = (id, teacher) => ({
  slotId: id,
  teacher,
  slot: { id, time: "19:00-20:20", grade: "中3", cls: "S", subj: "数学", teacher, room: "601" },
});
const targets = [mk(1, "堀上"), mk(2, "河野")];

describe("AbsenceRegisterDialog の有給・半休", () => {
  it("現役部 常勤の人の分を選んだ種類で返す (既定は記録しない)", () => {
    const onSubmit = vi.fn();
    render(
      <AbsenceRegisterDialog
        date="2026-10-21"
        targets={targets}
        leaveNames={["堀上"]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "2 件を欠勤にする" }));
    expect(onSubmit.mock.lastCall[3]).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "午前半休" }));
    fireEvent.click(screen.getByRole("button", { name: "2 件を欠勤にする" }));
    expect(onSubmit.mock.lastCall[3]).toEqual({ kind: "am", names: ["堀上"] });
  });

  it("コマを全部外した人には記録しない / 現役部 常勤がいなければ出さない", () => {
    const onSubmit = vi.fn();
    const { unmount } = render(
      <AbsenceRegisterDialog
        date="2026-10-21"
        targets={targets}
        leaveNames={["堀上"]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "有給" }));
    // 堀上 の行の「全部外す」(堀上 が先頭)
    fireEvent.click(screen.getAllByRole("button", { name: "全部外す" })[0]);
    expect(screen.getByText(/コマに全部チェックが無い人には記録しません/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 件を欠勤にする" }));
    expect(onSubmit.mock.lastCall[3]).toBeNull();
    unmount();
    render(
      <AbsenceRegisterDialog
        date="2026-10-21"
        targets={targets}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("group", { name: /有給・半休にも記録する/ })).toBeNull();
  });
});
