import { describe, expect, it } from "vitest";
import { buildOffsiteSessionItems } from "./offsiteBuilderImport";

// 冬期講習 2026: 12/24(木)〜1/7(木)。基準日は講習を組んだ 12/1
const LABELS = ["12/24(木)", "12/25(金)", "12/29(火)", "1/5(火)", "1/7(木)"];
const BASE = "2026-12-01";
const OFFSITE = [
  { id: 1, teacher: "石原", place: "村上高松", days: ["火", "木"], time: "14:50-15:40", startDate: "2026-10-01", travelMinutes: 30, skipDates: ["2026-12-29"] },
  { id: 2, teacher: "堀上", place: "大手前丸亀", days: ["火"], time: "13:30", startDate: "2026-10-14" },
  { id: 3, teacher: "片岡", place: "村上高松", days: ["木"], time: "14:50-15:40", startDate: "2026-10-01", endDate: "2026-12-24" },
];

describe("buildOffsiteSessionItems", () => {
  it("講習の日付に当たる予定を、移動時間を前後に足した講師不在にする", () => {
    const { items, unknownTeachers } = buildOffsiteSessionItems(OFFSITE, {
      dateLabels: LABELS,
      baseYmd: BASE,
      holidays: [{ id: 1, date: "2027-01-05", label: "臨時休講", scope: ["全部"] }],
      teacherNames: ["石原", "堀上", "片岡"],
    });
    expect(unknownTeachers).toEqual([]);
    expect(items).toEqual([
      // 12/24 (木): 石原 (移動 30 分込み) と片岡 (終了日当日)
      { date: "12/24(木)", teacherName: "石原", label: "14:20-16:10", memo: "他校舎 村上高松 (移動30分込み)", startTime: "14:20", endTime: "16:10" },
      { date: "12/24(木)", teacherName: "片岡", label: "14:50-15:40", memo: "他校舎 村上高松", startTime: "14:50", endTime: "15:40" },
      // 12/29 (火): 石原は休み、堀上は終了時刻未定 → 開始だけ
      { date: "12/29(火)", teacherName: "堀上", label: "13:30", memo: "他校舎 大手前丸亀", startTime: "13:30" },
      // 1/5 (火) は塾の全体休講日なので無し (年をまたいだラベルも翌年に解決)
      { date: "1/7(木)", teacherName: "石原", label: "14:20-16:10", memo: "他校舎 村上高松 (移動30分込み)", startTime: "14:20", endTime: "16:10" },
    ]);
  });

  it("講習の講師に居ない名前は取り込まず、名前を返す", () => {
    const { items, unknownTeachers } = buildOffsiteSessionItems(OFFSITE, {
      dateLabels: LABELS,
      baseYmd: BASE,
      teacherNames: ["石原"],
    });
    expect(new Set(items.map((i) => i.teacherName))).toEqual(new Set(["石原"]));
    expect(unknownTeachers.sort()).toEqual(["堀上", "片岡"].sort());
  });

  it("予定・基準日が無ければ空", () => {
    expect(buildOffsiteSessionItems([], { dateLabels: LABELS, baseYmd: BASE }).items).toEqual([]);
    expect(buildOffsiteSessionItems(OFFSITE, { dateLabels: LABELS, baseYmd: "" }).items).toEqual([]);
  });
});
