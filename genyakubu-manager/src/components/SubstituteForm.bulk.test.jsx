// @vitest-environment jsdom
// 授業管理 → 代行登録フォーム「1日分まとめて」。
//   - 代行レコードはコマ × 講師の単位。多担任コマは 1 人に記録が付いても
//     残りの担当者の穴が空いたままなので、行は消さず元講師の選択肢だけ絞る
//     (getSubForSlot の先頭 1 件で絞っていて行ごと消えていた)
//   - 「明日は全部休み、代行はこれから探す」= 代行未定 (代行者空 + 依頼中)
//     を行ごとに登録できる。メモは日の全件に共通
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SubstituteForm } from "./SubstituteForm";

afterEach(cleanup);

// 2026-09-14 は月曜
const MON = "2026-09-14";
const PREP = {
  id: 1, day: "月", time: "19:00-20:20", grade: "中3", cls: "-", room: "501",
  subj: "プレップ", teacher: "香川·福江·川井", note: "",
};
const SINGLE = {
  id: 2, day: "月", time: "20:30-21:50", grade: "中3", cls: "A", room: "502",
  subj: "英語", teacher: "野口", note: "",
};

function renderBulk({ subs = [], slots = [PREP, SINGLE], ...rest } = {}) {
  const onSave = vi.fn();
  render(
    <SubstituteForm
      sub={null}
      slots={slots}
      subs={subs}
      partTimeStaff={[{ name: "江本", subjectIds: [] }]}
      subjects={[]}
      onSave={onSave}
      onCancel={() => {}}
      {...rest}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "1日分まとめて" }));
  fireEvent.change(screen.getByLabelText(/日付/), { target: { value: MON } });
  return { onSave };
}

function rowOf(text) {
  const label = screen.getByText(text, { exact: false });
  // 行のカード = ラベル div の親
  return label.closest("div[id^='sub-row-label-']").parentElement;
}

describe("SubstituteForm (1日分まとめて) — 多担任コマ", () => {
  it("1 人に記録が付いても行は残り、元講師の選択肢は未登録の人だけ", () => {
    renderBulk({
      subs: [
        { id: 10, date: MON, slotId: 1, originalTeacher: "香川", substitute: "江本", status: "confirmed", memo: "" },
      ],
    });
    const row = rowOf("プレップ");
    const select = within(row).getByRole("combobox", { name: "元講師" });
    expect([...select.options].map((o) => o.value)).toEqual(["福江", "川井"]);
    expect(within(row).getByText(/他 1 名は登録済/)).toBeTruthy();
  });

  it("残り 1 人になれば選択肢ではなくその人が元講師として出る", () => {
    renderBulk({
      subs: [
        { id: 10, date: MON, slotId: 1, originalTeacher: "香川", substitute: "江本", status: "confirmed", memo: "" },
        { id: 11, date: MON, slotId: 1, originalTeacher: "福江", substitute: "", status: "requested", memo: "" },
      ],
    });
    const row = rowOf("プレップ");
    expect(within(row).queryByRole("combobox", { name: "元講師" })).toBeNull();
    expect(within(row).getByText("川井")).toBeTruthy();
  });

  it("全員に記録が付いたコマだけが一覧から消える", () => {
    renderBulk({
      subs: [
        { id: 10, date: MON, slotId: 1, originalTeacher: "香川", substitute: "江本", status: "confirmed", memo: "" },
        { id: 11, date: MON, slotId: 1, originalTeacher: "福江", substitute: "", status: "requested", memo: "" },
        { id: 12, date: MON, slotId: 1, originalTeacher: "川井", substitute: "", status: "confirmed", memo: "" },
      ],
    });
    expect(screen.queryByText("プレップ", { exact: false })).toBeNull();
    expect(screen.getByText("英語", { exact: false })).toBeTruthy();
  });

  it("単独担当のコマは記録が 1 件あれば消える (従来どおり)", () => {
    renderBulk({
      subs: [
        { id: 10, date: MON, slotId: 2, originalTeacher: "野口", substitute: "", status: "requested", memo: "" },
      ],
    });
    expect(screen.queryByText("英語", { exact: false })).toBeNull();
    expect(screen.getByText("プレップ", { exact: false })).toBeTruthy();
  });

  it("選んだ元講師で保存される", () => {
    const { onSave } = renderBulk();
    const row = rowOf("プレップ");
    fireEvent.change(within(row).getByRole("combobox", { name: "元講師" }), {
      target: { value: "川井" },
    });
    fireEvent.change(within(row).getByLabelText("代行者"), { target: { value: "江本" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ slotId: 1, originalTeacher: "川井", substitute: "江本", status: "requested" }),
    ]);
  });
});

describe("SubstituteForm (1日分まとめて) — 代行未定と共通メモ", () => {
  it("何も入れずに保存すると「1 件以上入力するか代行未定に」のエラー", () => {
    const { onSave } = renderBulk();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/代行未定にしてください/);
  });

  it("「代行未定で登録」の行は代行者空 + 依頼中で保存され、メモは全件に付く", () => {
    const { onSave } = renderBulk();
    const prep = rowOf("プレップ");
    const eng = rowOf("英語");
    fireEvent.click(within(prep).getByLabelText("代行未定で登録"));
    fireEvent.change(within(eng).getByLabelText("代行者"), { target: { value: "江本" } });
    fireEvent.change(screen.getByLabelText(/メモ/), { target: { value: "体調不良" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const records = onSave.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.slotId === 1)).toMatchObject({
      originalTeacher: "香川", substitute: "", status: "requested", memo: "体調不良",
    });
    expect(records.find((r) => r.slotId === 2)).toMatchObject({
      originalTeacher: "野口", substitute: "江本", status: "requested", memo: "体調不良",
    });
  });

  it("代行未定にすると入れてあった代行者名は捨てられ、入力欄が無効になる", () => {
    const { onSave } = renderBulk();
    const eng = rowOf("英語");
    const input = within(eng).getByLabelText("代行者");
    fireEvent.change(input, { target: { value: "江本" } });
    // 確定にしてから代行未定へ切り替えると status も依頼中へ戻る
    fireEvent.click(within(eng).getByRole("radio", { name: /確定/ }));
    fireEvent.click(within(eng).getByLabelText("代行未定で登録"));
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("");
    expect(within(eng).queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ slotId: 2, substitute: "", status: "requested" }),
    ]);
  });
});
