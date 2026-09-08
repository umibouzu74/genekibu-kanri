// @vitest-environment jsdom
// 授業管理 → 代行登録フォームのコマ一覧は「その日に有効な時間割のコマ」だけ。
// 曜日だけで絞っていると、期切替で残してある旧期の同名コマが並び、そちらに
// 登録した代行はスケジュールのどこにも出ない (2026-09-10 の中3C 社会)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubstituteForm } from "./SubstituteForm";

afterEach(cleanup);

// 2026-09-10 は木曜。1学期は 8/31 で終了、2学期は 9/1 から。
const THU = "2026-09-10";
const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", grades: [], startDate: "2026-04-07", endDate: "2026-08-31" },
  { id: 2, name: "2学期", type: "regular", grades: [], startDate: "2026-09-01", endDate: null },
];
const base = {
  day: "木",
  time: "19:50-20:35",
  grade: "中3",
  cls: "C",
  room: "504",
  subj: "社会",
  teacher: "野口",
  note: "",
};
// 同じコマが 1学期 / 2学期 の両方に存在する (期切替でコマは消さない仕様)。
const SLOTS = [
  { ...base, id: 1, timetableId: 1 },
  { ...base, id: 2, timetableId: 2 },
];

function renderForm(props = {}) {
  const onSave = vi.fn();
  render(
    <SubstituteForm
      sub={null}
      slots={SLOTS}
      subs={[]}
      partTimeStaff={[]}
      subjects={[]}
      timetables={TIMETABLES}
      displayCutoff={{ groups: [], cohorts: [] }}
      onSave={onSave}
      onCancel={() => {}}
      {...props}
    />
  );
  return { onSave };
}

function slotOptions() {
  const select = screen.getByRole("combobox", { name: /コマ/ });
  return [...select.querySelectorAll("option")].filter((o) => o.value !== "");
}

describe("SubstituteForm のコマ一覧と時間割の有効期間", () => {
  it("単一コマ: その日に有効な時間割のコマだけを並べる", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/日付/), { target: { value: THU } });
    const opts = slotOptions();
    expect(opts.map((o) => o.value)).toEqual(["2"]);
  });

  it("単一コマ: 旧期の期間内の日付なら旧期のコマだけ", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/日付/), { target: { value: "2026-07-09" } }); // 木
    expect(slotOptions().map((o) => o.value)).toEqual(["1"]);
  });

  it("単一コマ: timetables が無ければ従来どおり曜日だけで絞る", () => {
    renderForm({ timetables: [] });
    fireEvent.change(screen.getByLabelText(/日付/), { target: { value: THU } });
    expect(slotOptions().map((o) => o.value)).toEqual(["1", "2"]);
  });

  it("編集中のレコードが期間外のコマを指していても、その 1 件は残して警告を出す", () => {
    const sub = {
      id: 10,
      date: THU,
      slotId: 1,
      originalTeacher: "野口",
      substitute: "西岡",
      status: "confirmed",
      memo: "",
    };
    const { onSave } = renderForm({ sub });
    const opts = slotOptions();
    expect(opts.map((o) => o.value)).toEqual(["2", "1"]);
    expect(opts.find((o) => o.value === "1").textContent).toMatch(/有効期間外/);
    expect(screen.getByText(/スケジュールには出ません/)).toBeTruthy();
    // 有効なコマへ付け替えると警告は消え、保存レコードもそのコマを指す
    fireEvent.change(screen.getByRole("combobox", { name: /コマ/ }), { target: { value: "2" } });
    expect(screen.queryByText(/スケジュールには出ません/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^(登録|保存)/ }));
    expect(onSave.mock.calls.at(-1)[0]).toMatchObject({ slotId: 2, date: THU, substitute: "西岡" });
  });

  it("1日分まとめて: その日に有効な時間割のコマだけを行にする", () => {
    const { container } = render(
      <SubstituteForm
        sub={null}
        slots={SLOTS}
        subs={[]}
        partTimeStaff={[]}
        subjects={[]}
        timetables={TIMETABLES}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/日付/), { target: { value: THU } });
    fireEvent.click(screen.getByRole("button", { name: "1日分まとめて" }));
    const rows = [...container.querySelectorAll('[id^="sub-row-label-"]')];
    expect(rows.map((r) => r.id)).toEqual(["sub-row-label-2"]);
  });
});
