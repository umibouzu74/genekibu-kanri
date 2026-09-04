// @vitest-environment jsdom
// タイムテーブル代行モードの「代行が要るコマ」は、隔週の A/B を解いた
// その日の担当で決める (2026-09-04)。講師欄 (A 週の主担当) で見ていたため、
// B 週のコマに A 週の人で代行が登録されていた。
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSubstitutionMode } from "./useSubstitutionMode";

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

function setup(unavailable) {
  return renderHook(() =>
    useSubstitutionMode({
      slots: [SLOT],
      subs: [],
      saveSubs: () => {},
      holidays: [],
      examPeriods: [],
      partTimeStaff: [],
      subjects: [],
      subjectCategories: [],
      timetables: [],
      biweeklyAnchors: ANCHORS,
      teacherSubjects: {},
      unavailableTeachers: new Set(unavailable),
    })
  );
}

describe("useSubstitutionMode と隔週の担当週", () => {
  it("B 週に欠勤するのがパートナー (河野) なら、そのコマが代行対象になり元講師も河野", () => {
    const { result } = setup(["河野"]);
    act(() => result.current.setSubDate("2026-10-09"));
    expect(result.current.uncoveredSlots).toEqual([
      { slotId: 1, originalTeacher: "河野", date: "2026-10-09" },
    ]);
  });

  it("B 週に A 週の主担当 (堀上) を欠勤にしても、そのコマは対象にならない", () => {
    const { result } = setup(["堀上"]);
    act(() => result.current.setSubDate("2026-10-09"));
    expect(result.current.uncoveredSlots).toEqual([]);
  });

  it("A 週は従来どおり講師欄の主担当", () => {
    const { result } = setup(["堀上"]);
    act(() => result.current.setSubDate("2026-10-02"));
    expect(result.current.uncoveredSlots).toEqual([
      { slotId: 1, originalTeacher: "堀上", date: "2026-10-02" },
    ]);
  });

  it("その日の講師一覧 (全員表示) も担当週で数える", () => {
    const { result } = setup([]);
    act(() => result.current.setSubDate("2026-10-09"));
    expect(result.current.allTeachersForDay.map((t) => t.name)).toEqual(["河野"]);
  });
});
