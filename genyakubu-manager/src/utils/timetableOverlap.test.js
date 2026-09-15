import { describe, expect, it } from "vitest";
import {
  describeOverlap,
  findDuplicateNameTimetable,
  findOverlappingTimetables,
  formatOverlapRange,
  parseGradesInput,
  validateTimetableName,
  validateTimetablePeriod,
} from "./timetableOverlap";

const TT = [
  { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-31", grades: [] },
  { id: 2, name: "2学期 中学", type: "regular", startDate: "2026-09-01", endDate: null, grades: ["中1", "中2", "中3"] },
  { id: 3, name: "2学期 高校", type: "regular", startDate: "2026-09-01", endDate: null, grades: ["高1", "高2", "高3"] },
];

describe("validateTimetablePeriod", () => {
  it("開始日 > 終了日 だけをエラーにする (片方空は無制限で OK)", () => {
    expect(validateTimetablePeriod({ startDate: "2026-04-10", endDate: "2026-04-01" })).toMatch(/終了日は開始日以降/);
    expect(validateTimetablePeriod({ startDate: "2026-04-01", endDate: "2026-04-01" })).toBeNull();
    expect(validateTimetablePeriod({ startDate: "2026-04-01", endDate: "" })).toBeNull();
    expect(validateTimetablePeriod({ startDate: null, endDate: "2026-04-01" })).toBeNull();
    expect(validateTimetablePeriod({})).toBeNull();
  });
});

describe("validateTimetableName / parseGradesInput", () => {
  it("空白だけの名前はエラー", () => {
    expect(validateTimetableName({ name: "  " })).toMatch(/名前/);
    expect(validateTimetableName({ name: " 2学期 " })).toBeNull();
  });
  it("カンマ・読点・空白で区切る (配列はそのまま)", () => {
    expect(parseGradesInput("中1, 中2、中3 高1")).toEqual(["中1", "中2", "中3", "高1"]);
    expect(parseGradesInput("")).toEqual([]);
    expect(parseGradesInput(["中1", " 中2 "])).toEqual(["中1", "中2"]);
  });
});

describe("findDuplicateNameTimetable", () => {
  it("trim 後の完全一致で、自分自身は除く", () => {
    expect(findDuplicateNameTimetable(" 1学期 ", TT)?.id).toBe(1);
    expect(findDuplicateNameTimetable("1学期", TT, { excludeId: 1 })).toBeNull();
    expect(findDuplicateNameTimetable("", TT)).toBeNull();
    expect(findDuplicateNameTimetable("3学期", TT)).toBeNull();
  });
});

describe("findOverlappingTimetables", () => {
  it("前の期に終了日が無いと、切替日以降が全学年で重なる (典型の事故)", () => {
    const tts = [{ ...TT[0], endDate: null }];
    const r = findOverlappingTimetables(
      { startDate: "2026-09-01", endDate: null, grades: "" },
      tts
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      overlapStart: "2026-09-01",
      overlapEnd: null,
      sharedGrades: [],
    });
    expect(r[0].timetable.id).toBe(1);
    expect(describeOverlap(r[0])).toBe("1学期 と 9/1〜 が重なります (全学年)");
  });

  it("前の期に終了日が入っていれば重ならない (期切替の正しい形)", () => {
    expect(
      findOverlappingTimetables({ startDate: "2026-09-01", endDate: null, grades: "" }, TT.slice(0, 1))
    ).toEqual([]);
    // 境界: 終了日 = 開始日 は 1 日重なる
    const r = findOverlappingTimetables(
      { startDate: "2026-08-31", endDate: null, grades: "" },
      TT.slice(0, 1)
    );
    expect(r).toHaveLength(1);
    expect(formatOverlapRange(r[0])).toBe("8/31");
  });

  it("学年が交わらなければ期間が重なっても報告しない", () => {
    // 2学期 中学 (中1-3) と 中3 だけの候補 → 中3 で重なる。高校 (id 3) とは重ならない
    const r = findOverlappingTimetables(
      { startDate: "2026-10-01", endDate: "2026-10-10", grades: "中3" },
      TT
    );
    expect(r.map((o) => o.timetable.id)).toEqual([2]);
    expect(r[0].sharedGrades).toEqual(["中3"]);
    expect(describeOverlap(r[0])).toBe("2学期 中学 と 10/1〜10/10 が重なります (中3)");
  });

  it("候補が全学年なら学年指定の時間割とはその学年すべてで重なる", () => {
    const r = findOverlappingTimetables(
      { startDate: "2026-10-01", endDate: "2026-10-10", grades: [] },
      TT
    );
    expect(r.map((o) => o.timetable.id)).toEqual([2, 3]);
    expect(r[0].sharedGrades).toEqual(["中1", "中2", "中3"]);
  });

  it("複合学年「中1-3」は展開して照合する", () => {
    const r = findOverlappingTimetables(
      { startDate: "2026-10-01", endDate: null, grades: "中1-3" },
      TT
    );
    expect(r.map((o) => o.timetable.id)).toEqual([2]);
    // 展開は gradeMatchesTimetable と同じ片方向 (照合する側だけ展開する)
    expect(r[0].sharedGrades).toEqual(["中1-3"]);
  });

  it("excludeId で編集中の自分自身を除く。両方無制限なら「全期間」", () => {
    const tts = [
      { id: 5, name: "A", grades: [], startDate: null, endDate: null },
      { id: 6, name: "B", grades: [], startDate: null, endDate: null },
    ];
    const r = findOverlappingTimetables({ grades: "" }, tts, { excludeId: 5 });
    expect(r.map((o) => o.timetable.id)).toEqual([6]);
    expect(formatOverlapRange(r[0])).toBe("全期間");
    expect(findOverlappingTimetables(null, tts)).toEqual([]);
  });
});
