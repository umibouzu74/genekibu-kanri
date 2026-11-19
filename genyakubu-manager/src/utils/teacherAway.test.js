// 講師の不在期間 (P2-6)。形の正規化・入力・期間の判定
import { describe, expect, it } from "vitest";
import {
  addTeacherAways,
  awayDayCount,
  awayForTeacherOn,
  awayStatus,
  awaysInRange,
  awaysOnDate,
  describeAway,
  formatAwayPeriod,
  migrateTeacherAways,
  updateTeacherAway,
  validateAwayDraft,
} from "./teacherAway";
import { isTeacherAway, validateExportBundle } from "./schema";

const FUKU = { id: 1, teacher: "福武", startDate: "2027-01-04", endDate: "2027-01-22", memo: "研修" };

describe("migrateTeacherAways", () => {
  it("RTDB のオブジェクト形を配列に直し、形にならないものを落とす", () => {
    const out = migrateTeacherAways({
      0: FUKU,
      1: { id: 2, teacher: "", startDate: "2027-01-04", endDate: "2027-01-05" },
      2: { id: 3, teacher: "川井", startDate: "2027/01/04" },
      3: { id: 4, teacher: " 川井 ", startDate: "2027-02-10", endDate: "2027-02-01", memo: " " },
    });
    expect(out).toEqual([
      FUKU,
      { id: 4, teacher: "川井", startDate: "2027-02-01", endDate: "2027-02-10" },
    ]);
  });

  it("終了日が無ければ開始日と同じ (1 日だけ)。同じ id は先のものだけ", () => {
    const out = migrateTeacherAways([
      { id: 1, teacher: "福武", startDate: "2027-01-04" },
      { id: 1, teacher: "川井", startDate: "2027-01-05" },
    ]);
    expect(out).toEqual([{ id: 1, teacher: "福武", startDate: "2027-01-04", endDate: "2027-01-04" }]);
  });
});

describe("validateAwayDraft / addTeacherAways / updateTeacherAway", () => {
  it("講師は「・」で何人でも書け、1 人 1 件で作る。id は idFloor より後", () => {
    const r = addTeacherAways([FUKU], { teacher: "川井・南條", startDate: "2027-01-08", endDate: "", memo: "" }, 5);
    expect(r.added.map((a) => [a.id, a.teacher, a.endDate])).toEqual([
      [6, "川井", "2027-01-08"],
      [7, "南條", "2027-01-08"],
    ]);
    expect(r.next).toHaveLength(3);
  });

  it("終了日が開始日より前・講師なし・開始日なしは止める", () => {
    expect(validateAwayDraft({ teacher: "福武", startDate: "2027-01-10", endDate: "2027-01-01" }).error).toMatch(
      /前/
    );
    expect(validateAwayDraft({ teacher: "", startDate: "2027-01-10" }).error).toMatch(/講師/);
    expect(validateAwayDraft({ teacher: "福武", startDate: "" }).error).toMatch(/開始日/);
  });

  it("直すときは講師 1 人だけ", () => {
    expect(updateTeacherAway([FUKU], 1, { teacher: "福武・川井", startDate: "2027-01-04" }).error).toBeTruthy();
    const r = updateTeacherAway([FUKU], 1, { teacher: "福武", startDate: "2027-01-05", endDate: "2027-01-20", memo: "" });
    expect(r.updated).toEqual({ id: 1, teacher: "福武", startDate: "2027-01-05", endDate: "2027-01-20" });
  });
});

describe("期間の判定", () => {
  const list = [FUKU, { id: 2, teacher: "川井", startDate: "2027-01-22", endDate: "2027-01-22" }];

  it("その日に不在の記録 / その講師の記録 (完全一致)", () => {
    expect(awaysOnDate(list, "2027-01-22").map((r) => r.id)).toEqual([1, 2]);
    expect(awaysOnDate(list, "2027-01-23")).toEqual([]);
    expect(awayForTeacherOn(list, "福武", "2027-01-04")).toBe(FUKU);
    expect(awayForTeacherOn(list, "福武", "2027-01-03")).toBeNull();
    expect(awayForTeacherOn(list, "福", "2027-01-04")).toBeNull();
  });

  it("期間に掛かる記録", () => {
    expect(awaysInRange(list, "2027-01-01", "2027-01-04").map((r) => r.id)).toEqual([1]);
    expect(awaysInRange(list, "2027-01-20", "2027-01-31", "川井").map((r) => r.id)).toEqual([2]);
    expect(awaysInRange(list, "2026-12-01", "2026-12-31")).toEqual([]);
  });

  it("状態・表記・日数", () => {
    expect(awayStatus(FUKU, "2027-01-04")).toBe("active");
    expect(awayStatus(FUKU, "2026-12-31")).toBe("upcoming");
    expect(awayStatus(FUKU, "2027-01-23")).toBe("ended");
    expect(formatAwayPeriod(FUKU)).toBe("1/4〜1/22");
    expect(formatAwayPeriod({ ...FUKU, startDate: "2026-12-28" })).toBe("2026/12/28〜2027/1/22");
    expect(formatAwayPeriod(list[1])).toBe("1/22");
    expect(describeAway(FUKU)).toBe("福武 不在 1/4〜1/22 (研修)");
    expect(awayDayCount(FUKU)).toBe(19);
  });
});

describe("バックアップの検証", () => {
  it("形だけを見る", () => {
    expect(isTeacherAway(FUKU)).toBe(true);
    expect(isTeacherAway({ id: 1, teacher: "福武", startDate: "2027-01-04" })).toBe(true);
    expect(isTeacherAway({ id: 1, teacher: "", startDate: "2027-01-04" })).toBe(false);
    const bad = validateExportBundle({ slots: [], teacherAways: [{ id: "x" }] });
    expect(bad.ok).toBe(false);
    expect(bad.path).toBe("teacherAways[0]");
  });
});
