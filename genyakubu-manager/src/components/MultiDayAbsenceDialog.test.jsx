// @vitest-environment jsdom
// 複数日の欠勤登録ダイアログ: 期間 × 先生 → 日ごとの対象コマ → 一括登録。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MultiDayAbsenceDialog } from "./MultiDayAbsenceDialog";

afterEach(cleanup);

const mk = (id, day, teacher, extra = {}) => ({
  id, day, time: "19:00-20:20", grade: "中3", cls: "S", room: "601", subj: "数学", teacher, note: "", ...extra,
});
const SLOTS = [mk(1, "月", "堀上"), mk(2, "火", "堀上", { time: "20:30-21:50" }), mk(3, "水", "河野")];
const CTX = {
  allSlots: SLOTS,
  classSets: [],
  timetables: [],
  displayCutoff: { groups: [] },
  daySchedules: [],
  biweeklyAnchors: [],
  holidays: [],
  examPeriods: [],
  isOffForGrade: () => false,
};

function renderDialog(props = {}) {
  const saveSubs = vi.fn();
  const onSaved = vi.fn();
  render(
    <MultiDayAbsenceDialog
      slots={SLOTS}
      subs={[]}
      sessionCtx={CTX}
      isAdmin
      saveSubs={saveSubs}
      onSaved={onSaved}
      onClose={vi.fn()}
      {...props}
    />
  );
  return { saveSubs, onSaved };
}

describe("MultiDayAbsenceDialog", () => {
  it("先生と期間を選ぶと日ごとの対象コマが並び、外した分を除いて登録する", () => {
    const { saveSubs, onSaved } = renderDialog({ initial: { teachers: ["堀上"], date: "2026-09-14" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2026-09-16" } });
    // 月 1 コマ / 火 1 コマ / 水 は担当なし
    expect(screen.getByText("2026-09-14 (月)")).toBeTruthy();
    expect(screen.getByText("2026-09-16 (水)").parentElement.textContent).toMatch(/担当コマなし/);
    expect(screen.getByRole("button", { name: "2 件を欠勤にする" })).toBeTruthy();
    // 火曜を外す (日ごとのボタンは月・火の 2 つ)
    fireEvent.click(screen.getAllByRole("button", { name: "この日を全部外す" })[1]);
    expect(screen.getByRole("button", { name: "1 件を欠勤にする" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/理由メモ/), { target: { value: "インフル" } });
    fireEvent.click(screen.getByRole("button", { name: /件を欠勤にする/ }));
    expect(saveSubs).toHaveBeenCalledTimes(1);
    const saved = saveSubs.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ date: "2026-09-14", slotId: 1, originalTeacher: "堀上", substitute: "", status: "requested", memo: "インフル" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ count: saved.length, teachers: ["堀上"] }));
  });

  it("先生を選ぶまでは登録できない", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /件を欠勤にする/ }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("河野"));
    expect(screen.getByRole("button", { name: /件を欠勤にする/ }).disabled).toBe(true);
  });

  it("「1 週間」で終了日を開始日 + 6 日にし、日曜は飛ばすと伝える", () => {
    renderDialog({ initial: { teachers: ["河野"], date: "2026-09-14" } });
    fireEvent.click(screen.getByRole("button", { name: "1 週間" }));
    expect(screen.getByLabelText("終了日").value).toBe("2026-09-20");
    expect(screen.getByText(/日曜 1 日は時間割が無いので飛ばします/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 件を欠勤にする" })).toBeTruthy();
  });
});
