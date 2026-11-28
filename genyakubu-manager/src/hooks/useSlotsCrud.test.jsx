// @vitest-environment jsdom
// コマの学年を変えたときの引き継ぎ (高3 → 高1-3 の Speaking/Listening、2026-11-28)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSlotsCrud } from "./useSlotsCrud";
import { ConfirmProvider } from "./useConfirm";
import { ToastProvider } from "./useToasts";

afterEach(cleanup);

const SLOT = {
  id: 728,
  day: "土",
  time: "18:30-19:30",
  grade: "高3",
  cls: "",
  room: "亀63",
  subj: "Speaking/Listening",
  teacher: "本澤",
  note: "",
  timetableId: 3,
};
const TIMETABLES = [{ id: 3, name: "2学期", startDate: "2026-08-25", endDate: "2026-12-26", grades: ["高1", "高2", "高3"] }];
const CUTOFF = {
  groups: [
    { label: "高1・2", grades: ["高1", "高2"], startDate: "2026-09-01", date: "2026-12-26", timetableId: 3 },
    { label: "高3", grades: ["高3"], startDate: "2026-09-01", date: "2026-12-26", timetableId: 3 },
  ],
  cohorts: [{ id: "H|高3|Speaking/Listening", date: "2026-12-19", timetableId: 3 }],
};

function Harness({ deps, form }) {
  const crud = useSlotsCrud(deps);
  return (
    <>
      <button type="button" onClick={() => crud.save(SLOT, form, deps.setEditSlot)}>
        保存
      </button>
      <div data-testid="grades">{crud.suggestions.grades.join(",")}</div>
    </>
  );
}

function setup({ holidays = [], form = { ...SLOT, grade: "高1-3" } } = {}) {
  const deps = {
    slots: [SLOT],
    saveSlots: vi.fn(),
    subs: [],
    saveSubs: vi.fn(),
    subjects: [],
    partTimeStaff: [],
    holidays,
    displayCutoff: CUTOFF,
    saveDisplayCutoff: vi.fn(),
    courseMapping: [{ course: "高1・高2|Speaking/Listening", subjects: ["高3|Speaking/Listening"] }],
    saveCourseMapping: vi.fn(),
    sessionBase: { timetables: TIMETABLES, holidays },
    today: "2026-11-28",
    setEditSlot: vi.fn(),
  };
  delete form.id;
  render(
    <ToastProvider render={(toasts) => toasts.map((t) => <p key={t.id}>{t.message}</p>)}>
      <ConfirmProvider>
        <Harness deps={deps} form={form} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return deps;
}

describe("useSlotsCrud: 学年を変えたときの引き継ぎ", () => {
  it("共通学年 (高1-3 など) はどのコマに無くても学年の候補に出る", () => {
    setup();
    expect(screen.getByTestId("grades").textContent.split(",")).toEqual(
      expect.arrayContaining(["中1-3", "附中", "高1高2", "高1-3"])
    );
  });

  it("高3 → 高1-3 で、コース別終講日と予定表チェックの対応を引き継いで知らせる", async () => {
    const deps = setup();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(deps.saveSlots).toHaveBeenCalled());
    expect(deps.saveSlots.mock.calls[0][0][0].grade).toBe("高1-3");
    // 保存値への書き込みは updater (書き込む時点の値から)
    const cutoffUpdater = deps.saveDisplayCutoff.mock.calls[0][0];
    expect(cutoffUpdater(CUTOFF).cohorts).toEqual([
      { id: "H|高1-3|Speaking/Listening", date: "2026-12-19", timetableId: 3 },
    ]);
    const mappingUpdater = deps.saveCourseMapping.mock.calls[0][0];
    expect(mappingUpdater(deps.courseMapping)).toEqual([
      { course: "高1・高2|Speaking/Listening", subjects: ["高1-3|Speaking/Listening"] },
    ]);
    expect(await screen.findByText(/コース別終講日 12\/19 \(土\)・予定表チェックの講座の対応 1 件を「高1-3」に引き継ぎました/)).toBeTruthy();
    // 回数は変わらないので確認ダイアログは出ない
    expect(screen.queryByText("第N回が変わります")).toBeNull();
  });

  it("学年で回数が変わるときは保存の前に確かめ、やめたら何も書かない", async () => {
    const holidays = [{ id: 2, date: "2026-11-14", scope: ["高校部"], targetGrades: ["高3"], subjKeywords: [] }];
    const deps = setup({ holidays });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("第N回が変わります")).toBeTruthy();
    expect(screen.getByText(/11\/28 \(土\): ⑫ → ⑬/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByText("第N回が変わります")).toBeNull());
    expect(deps.saveSlots).not.toHaveBeenCalled();
    expect(deps.saveDisplayCutoff).not.toHaveBeenCalled();
  });

  it("学年以外の編集では引き継がない", async () => {
    const deps = setup({ form: { ...SLOT, teacher: "本澤·川井" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(deps.saveSlots).toHaveBeenCalled());
    expect(deps.saveDisplayCutoff).not.toHaveBeenCalled();
    expect(deps.saveCourseMapping).not.toHaveBeenCalled();
  });
});
