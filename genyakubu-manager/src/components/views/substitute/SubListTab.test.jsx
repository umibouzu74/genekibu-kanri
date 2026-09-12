// @vitest-environment jsdom
// 代行一覧: レコードが「その日に有効でない時間割のコマ」(旧期の同名コマ) を
// 指していたら警告を出す。一覧には載るのにスケジュールのどこにも出ない、
// という食い違いに気付けるようにする (2026-09-10 の中3C 社会)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SubListTab } from "./SubListTab";

afterEach(cleanup);

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", grades: [], startDate: "2026-04-07", endDate: "2026-08-31" },
  { id: 2, name: "2学期", type: "regular", grades: [], startDate: "2026-09-01", endDate: null },
];
const base = { day: "木", time: "19:50-20:35", grade: "中3", cls: "C", room: "504", subj: "社会", teacher: "野口" };
const SLOTS = [
  { ...base, id: 1, timetableId: 1 },
  { ...base, id: 2, timetableId: 2 },
];
const SUBS = [
  { id: 10, date: "2026-09-10", slotId: 1, originalTeacher: "野口", substitute: "西岡", status: "confirmed" },
  { id: 11, date: "2026-09-09", slotId: 2, originalTeacher: "野口", substitute: "杉原", status: "confirmed" },
];

function renderTab(props = {}) {
  const slotMap = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
  return render(
    <SubListTab
      filtered={SUBS}
      subs={SUBS}
      slotMap={slotMap}
      allTeachers={["野口", "西岡", "杉原"]}
      fMonth=""
      setFMonth={() => {}}
      fStaff=""
      setFStaff={() => {}}
      fStatus=""
      setFStatus={() => {}}
      isAdmin={false}
      slots={SLOTS}
      timetables={TIMETABLES}
      displayCutoff={{ groups: [], cohorts: [] }}
      {...props}
    />
  );
}

describe("SubListTab の期間外コマの警告", () => {
  it("旧期のコマを指すレコードにだけ警告バッジと件数を出す", () => {
    renderTab();
    expect(screen.getAllByText("⚠ この日は期間外")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/1 件は/);
  });

  it("timetables が無ければ (単一時間割の運用) 警告は出ない", () => {
    renderTab({ timetables: [] });
    expect(screen.queryByText("⚠ この日は期間外")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// 行内の「代行者名 + ✓ 確定」。未処理 (代行未定 / 依頼中) の行だけに出し、
// モーダルを開かずに片付けられる (2026-09-12)。
describe("SubListTab の行内クイック確定", () => {
  const OPEN_SUBS = [
    { id: 20, date: "2026-09-17", slotId: 2, originalTeacher: "野口", substitute: "", status: "requested" },
    { id: 21, date: "2026-09-24", slotId: 2, originalTeacher: "野口", substitute: "西岡", status: "requested" },
    { id: 22, date: "2026-09-10", slotId: 2, originalTeacher: "野口", substitute: "西岡", status: "confirmed" },
  ];

  it("管理者でなければ出ない", () => {
    renderTab({ filtered: OPEN_SUBS, subs: OPEN_SUBS, onQuickUpdate: vi.fn() });
    expect(screen.queryByRole("button", { name: /の代行を確定/ })).toBeNull();
  });

  it("未処理の行だけに入力欄と ✓ 確定 が出る", () => {
    renderTab({ filtered: OPEN_SUBS, subs: OPEN_SUBS, isAdmin: true, onQuickUpdate: vi.fn() });
    expect(screen.getAllByRole("button", { name: /の代行を確定/ })).toHaveLength(2);
    // 確定済みの行は名前だけ
    const rows = screen.getAllByRole("row");
    const confirmedRow = rows.find((r) => r.textContent.includes("2026-09-10"));
    expect(within(confirmedRow).queryByRole("textbox")).toBeNull();
  });

  it("✓ 確定 は入力欄の名前ごと confirmed にする (空なら代行なしで確定)", () => {
    const onQuickUpdate = vi.fn();
    renderTab({ filtered: OPEN_SUBS, subs: OPEN_SUBS, isAdmin: true, onQuickUpdate });
    const input = screen.getByLabelText("2026-09-17 野口 の代行者");
    fireEvent.change(input, { target: { value: "杉原" } });
    fireEvent.click(screen.getByRole("button", { name: "2026-09-17 野口 の代行を確定" }));
    expect(onQuickUpdate).toHaveBeenCalledWith(
      20,
      { status: "confirmed", substitute: "杉原" },
      expect.objectContaining({ successMsg: expect.stringContaining("杉原") })
    );

    // 依頼中の行は名前を変えずに確定 → substitute は patch に含めない
    fireEvent.click(screen.getByRole("button", { name: "2026-09-24 野口 の代行を確定" }));
    expect(onQuickUpdate).toHaveBeenLastCalledWith(
      21,
      { status: "confirmed" },
      expect.anything()
    );

    // 空欄のまま確定 = 代行なしで確定
    onQuickUpdate.mockClear();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "2026-09-17 野口 の代行を確定" }));
    expect(onQuickUpdate).toHaveBeenCalledWith(
      20,
      { status: "confirmed" },
      expect.objectContaining({ successMsg: expect.stringContaining("代行なし") })
    );
  });

  it("入力欄の Enter は代行者名だけを保存する (状態は据え置き)", () => {
    const onQuickUpdate = vi.fn();
    renderTab({ filtered: OPEN_SUBS, subs: OPEN_SUBS, isAdmin: true, onQuickUpdate });
    const input = screen.getByLabelText("2026-09-17 野口 の代行者");
    fireEvent.change(input, { target: { value: "杉原" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onQuickUpdate).toHaveBeenCalledWith(20, { substitute: "杉原" }, expect.anything());
    // 変えていなければ何もしない
    onQuickUpdate.mockClear();
    fireEvent.keyDown(screen.getByLabelText("2026-09-24 野口 の代行者"), { key: "Enter" });
    expect(onQuickUpdate).not.toHaveBeenCalled();
  });

  it("状態フィルタは未処理 + 4 状態、未処理のときは今日以降 / 過去の内訳を出す", () => {
    renderTab({ filtered: OPEN_SUBS, subs: OPEN_SUBS, fStatus: "open", todayStr: "2026-09-12" });
    const select = screen.getByLabelText("ステータス");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "すべて",
      "未処理 (未定 + 依頼中)",
      "代行未定",
      "依頼中",
      "代行確定",
      "代行なし",
    ]);
    expect(screen.getByText(/今日以降 2 件 \/ 過去 1 件/)).toBeTruthy();
  });
});

// 期間外の代行を、同じ位置で有効なコマへ ↪ で付け替える (2026-09-12)
describe("SubListTab の期間外コマの付け替え", () => {
  it("同じ位置の有効なコマが 1 件あれば ↪ で slotId を付け替える", () => {
    const onQuickUpdate = vi.fn();
    renderTab({ isAdmin: true, onQuickUpdate });
    const btn = screen.getByRole("button", { name: "2026-09-10 の代行を有効なコマへ付け替え" });
    fireEvent.click(btn);
    expect(onQuickUpdate).toHaveBeenCalledWith(
      10,
      { slotId: 2 },
      expect.objectContaining({ successMsg: expect.stringContaining("2学期") })
    );
    // 有効なコマを指す行には出ない
    expect(screen.getAllByRole("button", { name: /有効なコマへ付け替え/ })).toHaveLength(1);
  });

  it("閲覧者には出ない", () => {
    renderTab({ isAdmin: false, onQuickUpdate: vi.fn() });
    expect(screen.queryByRole("button", { name: /有効なコマへ付け替え/ })).toBeNull();
  });
});
