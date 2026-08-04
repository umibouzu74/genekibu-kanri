import { describe, expect, it } from "vitest";
import { computeTeacherLoad } from "./teacherLoad";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// makeProject: teachers [堀上, 半田]、中3 タブ (月・火, 1限/2限, S/A)、
// schedule: 月1限 S=数学/半田, 月2限 A=英語/堀上

describe("computeTeacherLoad", () => {
  it("講師 × 曜日のコマ数と週計をマスタ順に数える", () => {
    const { days, rows } = computeTeacherLoad(makeProject());
    expect(days).toEqual(["月", "火"]);
    expect(rows.map((r) => r.name)).toEqual(["堀上", "半田"]);
    const horigami = rows[0];
    expect(horigami).toMatchObject({
      inMaster: true,
      byDay: { 月: 1 },
      total: 1,
      overDays: [],
      overWeek: false,
    });
  });

  it("複数講師セルは各講師に 1 コマずつ数え、マスタ外は末尾に名前順で載る", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "理科",
      teacher: "半田·臨時B·臨時A",
    };
    const { rows } = computeTeacherLoad(p);
    expect(rows.map((r) => r.name)).toEqual(["堀上", "半田", "臨時A", "臨時B"]);
    expect(rows[1].byDay).toEqual({ 月: 1, 火: 1 });
    expect(rows[1].total).toBe(2);
    expect(rows[2]).toMatchObject({ inMaster: false, total: 1 });
  });

  it("上限超過を注釈する (1日 = overDays / 週 = overWeek)", () => {
    const p = makeProject();
    p.teachers = [
      { name: "半田", maxPerDay: 1, maxPerWeek: 2 },
      { name: "堀上", maxPerWeek: 1 },
    ];
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "国語", teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    const { rows } = computeTeacherLoad(p);
    const handa = rows.find((r) => r.name === "半田");
    expect(handa.byDay).toEqual({ 月: 2, 火: 1 });
    expect(handa.overDays).toEqual(["月"]); // 月 2 > 1日上限 1
    expect(handa.overWeek).toBe(true); // 計 3 > 週上限 2
    const horigami = rows.find((r) => r.name === "堀上");
    expect(horigami.overWeek).toBe(false); // 計 1 = 上限 1 (超過ではない)
  });

  it("残骸セル (使わない曜日など) は数えない・コマゼロのマスタ講師も載る", () => {
    const p = makeProject();
    p.tabs[0].days = ["火"]; // 月のセル 2 つが残骸になる
    const { days, rows } = computeTeacherLoad(p);
    expect(days).toEqual(["火"]);
    expect(rows.map((r) => r.total)).toEqual([0, 0]);
  });
});
