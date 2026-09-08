// @vitest-environment jsdom
// 代行一覧: レコードが「その日に有効でない時間割のコマ」(旧期の同名コマ) を
// 指していたら警告を出す。一覧には載るのにスケジュールのどこにも出ない、
// という食い違いに気付けるようにする (2026-09-10 の中3C 社会)。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
