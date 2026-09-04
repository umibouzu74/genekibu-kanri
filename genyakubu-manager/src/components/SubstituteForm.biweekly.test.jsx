// @vitest-environment jsdom
// 授業管理 → 代行登録フォームの元講師は、隔週の A/B を解いたその日の担当
// (2026-09-04)。講師欄のままだと B 週に A 週の主担当で登録されていた。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubstituteForm } from "./SubstituteForm";

afterEach(cleanup);

const SLOT = {
  id: 1,
  day: "金",
  time: "19:50-20:35",
  grade: "中3",
  cls: "S",
  room: "501",
  subj: "英/数",
  teacher: "堀上",
  note: "隔週(河野)",
  timetableId: 1,
};
const ANCHORS = [{ date: "2026-10-02", weekType: "A" }]; // 10/9 は B 週

function renderForm() {
  const onSave = vi.fn();
  render(
    <SubstituteForm
      sub={null}
      slots={[SLOT]}
      subs={[]}
      partTimeStaff={[{ name: "江本", subjectIds: [] }]}
      subjects={[]}
      biweeklyAnchors={ANCHORS}
      onSave={onSave}
      onCancel={() => {}}
    />
  );
  return { onSave };
}

describe("SubstituteForm (単一コマ) と隔週の担当週", () => {
  it("B 週の日付でコマを選ぶと元講師は note のパートナー、保存レコードもその人", () => {
    const { onSave } = renderForm();
    const dateInput = screen.getByLabelText(/日付/);
    fireEvent.change(dateInput, { target: { value: "2026-10-09" } });
    const slotSelect = screen.getByRole("combobox", { name: /コマ/ });
    fireEvent.change(slotSelect, { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/代行者/), { target: { value: "江本" } });
    fireEvent.click(screen.getByRole("button", { name: /^(登録|保存)/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      slotId: 1,
      date: "2026-10-09",
      originalTeacher: "河野",
      substitute: "江本",
    });
  });

  it("A 週の日付なら講師欄の主担当", () => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText(/日付/), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByRole("combobox", { name: /コマ/ }), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/代行者/), { target: { value: "江本" } });
    fireEvent.click(screen.getByRole("button", { name: /^(登録|保存)/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ originalTeacher: "堀上" });
  });
});
