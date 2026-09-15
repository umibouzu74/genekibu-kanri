import { describe, expect, it } from "vitest";
import {
  COMPRESS_TARGET_TIMES,
  buildCompressTimeMap,
  buildCutFirstCancelTimes,
  collectTargetTimes,
  findNewConflicts,
  findSameDayDaySchedules,
  findShadowedDaySchedules,
  getDaySchedulesForDate,
  isSlotCancelledByDaySchedule,
  resolveSlotDaySchedule,
} from "./daySchedules";

// 附属の水曜時程 (前期): ①16:25 ②17:35 ③18:45 ④19:55 + テ21:00
const FUZOKU_TIMES = [
  "16:25-17:25",
  "17:35-18:35",
  "18:45-19:45",
  "19:55-20:55",
  "21:00-21:30",
];

const FUZOKU_GRADES = ["附中1", "附中2", "附中3", "附中"];

const slot = (over = {}) => ({
  id: 1,
  day: "水",
  time: "16:25-17:25",
  grade: "附中1",
  cls: "-",
  room: "401",
  subj: "理科",
  teacher: "武下",
  note: "",
  ...over,
});

// プリセット① 50 分授業のサンプル DaySchedule
const compressSchedule = (over = {}) => ({
  id: 1,
  date: "2026-10-07",
  label: "附属 50分授業 (17:00開始)",
  targetGrades: FUZOKU_GRADES,
  timeMap: buildCompressTimeMap(FUZOKU_TIMES),
  cancelTimes: [],
  memo: "",
  ...over,
});

describe("collectTargetTimes", () => {
  it("対象学年のコマから distinct な時間帯を開始時刻順に集める", () => {
    const slots = [
      slot({ id: 1, time: "17:35-18:35", grade: "附中2" }),
      slot({ id: 2, time: "16:25-17:25", grade: "附中1" }),
      slot({ id: 3, time: "16:25-17:25", grade: "附中3" }),
      slot({ id: 4, time: "21:00-21:30", grade: "附中" }),
      slot({ id: 5, time: "18:55-19:40", grade: "中3" }), // 対象外学年
    ];
    expect(collectTargetTimes(slots, FUZOKU_GRADES)).toEqual([
      "16:25-17:25",
      "17:35-18:35",
      "21:00-21:30",
    ]);
  });
});

describe("buildCompressTimeMap", () => {
  it("先頭 4 コマを 50 分授業へ写像し、テストは据え置く", () => {
    expect(buildCompressTimeMap(FUZOKU_TIMES)).toEqual([
      { from: "16:25-17:25", to: "17:00-17:50" },
      { from: "17:35-18:35", to: "18:00-18:50" },
      { from: "18:45-19:45", to: "19:00-19:50" },
      { from: "19:55-20:55", to: "20:00-20:50" },
    ]);
  });

  it("読み替え先と同じ時刻はエントリを作らない", () => {
    expect(buildCompressTimeMap(["17:00-17:50", "18:10-19:00"])).toEqual([
      { from: "18:10-19:00", to: "18:00-18:50" },
    ]);
  });

  it("コマ数が 4 未満でも先頭から順に写像する", () => {
    expect(buildCompressTimeMap(["16:25-17:25"])).toEqual([
      { from: "16:25-17:25", to: COMPRESS_TARGET_TIMES[0] },
    ]);
  });
});

describe("buildCutFirstCancelTimes", () => {
  it("最初の時間帯だけを休講にする", () => {
    expect(buildCutFirstCancelTimes(FUZOKU_TIMES)).toEqual(["16:25-17:25"]);
    expect(buildCutFirstCancelTimes([])).toEqual([]);
  });
});

describe("resolveSlotDaySchedule", () => {
  const schedules = [compressSchedule()];

  it("日付・学年・時間帯が一致すれば読み替え結果を返す", () => {
    const r = resolveSlotDaySchedule(slot(), "2026-10-07", schedules);
    expect(r?.time).toBe("17:00-17:50");
    expect(r?.schedule.id).toBe(1);
  });

  it("timeMap に無い時間帯 (テ 21:00-21:30) は据え置き (null)", () => {
    const r = resolveSlotDaySchedule(
      slot({ time: "21:00-21:30", grade: "附中" }),
      "2026-10-07",
      schedules
    );
    expect(r).toBeNull();
  });

  it("別日・対象外学年には効かない", () => {
    expect(resolveSlotDaySchedule(slot(), "2026-10-14", schedules)).toBeNull();
    expect(
      resolveSlotDaySchedule(slot({ grade: "中3" }), "2026-10-07", schedules)
    ).toBeNull();
  });

  it("cancelTimes は timeMap より優先される", () => {
    const s = compressSchedule({ cancelTimes: ["16:25-17:25"] });
    const r = resolveSlotDaySchedule(slot(), "2026-10-07", [s]);
    expect(r?.cancelled).toBe(true);
    expect(isSlotCancelledByDaySchedule(slot(), "2026-10-07", [s])).toBe(true);
  });

  it("複数件は登録順の先勝ち", () => {
    const a = compressSchedule({ id: 1, timeMap: [{ from: "16:25-17:25", to: "17:00-17:50" }] });
    const b = compressSchedule({ id: 2, timeMap: [{ from: "16:25-17:25", to: "18:00-18:50" }] });
    const r = resolveSlotDaySchedule(slot(), "2026-10-07", [a, b]);
    expect(r?.time).toBe("17:00-17:50");
  });
});

describe("getDaySchedulesForDate", () => {
  it("日付一致のみ返す", () => {
    const list = [compressSchedule(), compressSchedule({ id: 2, date: "2026-10-14" })];
    expect(getDaySchedulesForDate(list, "2026-10-07").map((d) => d.id)).toEqual([1]);
    expect(getDaySchedulesForDate(null, "2026-10-07")).toEqual([]);
  });
});

describe("findNewConflicts", () => {
  const schedules = [compressSchedule()];
  const resolve = (s) => resolveSlotDaySchedule(s, "2026-10-07", schedules);

  it("読み替えで新たに生じる講師の重なりを報告する", () => {
    // 武下: 附中1 ①16:25-17:25 → 17:00-17:50。元は重ならなかった
    // 17:30 開始の授業と読み替え後に重なる
    const slots = [
      slot({ id: 1, grade: "附中1", time: "16:25-17:25", subj: "理科", teacher: "武下" }),
      slot({ id: 2, grade: "中1", time: "17:30-18:20", subj: "理科", teacher: "武下", room: "502" }),
    ];
    const out = findNewConflicts(slots, resolve);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("teacher");
    expect(out[0].value).toBe("武下");
    expect(out[0].a.id).toBe(1); // a = 読み替えられた側
    expect(out[0].aTime).toBe("16:25-17:25→17:00-17:50");
  });

  it("教室の重なりも報告する", () => {
    const slots = [
      slot({ id: 1, grade: "附中1", time: "16:25-17:25", room: "401", teacher: "武下" }),
      slot({ id: 2, grade: "中1", time: "17:30-18:20", room: "401", teacher: "別人" }),
    ];
    const out = findNewConflicts(slots, resolve);
    expect(out.map((c) => c.kind)).toEqual(["room"]);
  });

  it("元の時程でも重なっていた組 (並列コマ等) は報告しない", () => {
    const slots = [
      slot({ id: 1, grade: "附中1", time: "16:25-17:25", teacher: "武下", room: "401" }),
      slot({ id: 2, grade: "附中2", time: "16:25-17:25", teacher: "武下", room: "402" }),
    ];
    // 両方 17:00-17:50 に写るが、元から同時刻なので既存状態として除外
    expect(findNewConflicts(slots, resolve)).toEqual([]);
  });

  it("休講 (cancelTimes) にしたコマは衝突しない", () => {
    const cut = compressSchedule({ timeMap: [], cancelTimes: ["16:25-17:25"] });
    const resolveCut = (s) => resolveSlotDaySchedule(s, "2026-10-07", [cut]);
    const slots = [
      slot({ id: 1, grade: "附中1", time: "16:25-17:25", teacher: "武下" }),
      slot({ id: 2, grade: "中1", time: "16:30-17:30", teacher: "武下" }),
    ];
    expect(findNewConflicts(slots, resolveCut)).toEqual([]);
  });

  it("読み替えと無関係な既存の重なりは報告しない", () => {
    const slots = [
      slot({ id: 1, grade: "中1", time: "18:55-19:40", teacher: "武下" }),
      slot({ id: 2, grade: "中2", time: "18:55-19:40", teacher: "武下" }),
    ];
    expect(findNewConflicts(slots, resolve)).toEqual([]);
  });

  it("複数講師フィールド ('·' 区切り) も照合する", () => {
    const slots = [
      slot({ id: 1, grade: "附中1", time: "16:25-17:25", teacher: "石原" }),
      slot({ id: 2, grade: "中1", time: "17:30-18:20", teacher: "高松·石原", room: "502" }),
    ];
    const out = findNewConflicts(slots, resolve);
    expect(out.map((c) => c.value)).toEqual(["石原"]);
  });
});

// 同日の二重登録の検出 (2026-09-15)。resolveSlotDaySchedule が先勝ちなので、
// 後から登録した同じ (学年, 時間帯) は黙って効かない
describe("findSameDayDaySchedules / findShadowedDaySchedules", () => {
  const cut = (over = {}) => ({
    id: 1,
    date: "2026-10-07",
    label: "1限カット",
    targetGrades: ["附中1", "附中2"],
    timeMap: [],
    cancelTimes: ["16:25-17:25"],
    ...over,
  });

  it("同じ日・学年が交わる相手を、時間帯の衝突つきで返す", () => {
    const existing = [cut(), cut({ id: 2, targetGrades: ["中1"] })];
    const r = findSameDayDaySchedules(
      { date: "2026-10-07", targetGrades: ["附中2", "附中3"], timeMap: [{ from: "16:25-17:25", to: "17:00-17:50" }], cancelTimes: [] },
      existing
    );
    expect(r).toHaveLength(1);
    expect(r[0].schedule.id).toBe(1);
    expect(r[0].sharedGrades).toEqual(["附中2"]);
    expect(r[0].sharedTimes).toEqual(["16:25-17:25"]);
  });

  it("時間帯が別なら sharedTimes は空 (共存できる)。別の日・excludeId は出ない", () => {
    const r = findSameDayDaySchedules(
      { date: "2026-10-07", targetGrades: ["附中1"], timeMap: [{ from: "17:35-18:35", to: "18:00-18:50" }] },
      [cut(), cut({ id: 3, date: "2026-10-08" })]
    );
    expect(r.map((x) => x.schedule.id)).toEqual([1]);
    expect(r[0].sharedTimes).toEqual([]);
    expect(findSameDayDaySchedules({ date: "2026-10-07", targetGrades: ["附中1"] }, [cut()], { excludeId: 1 })).toEqual([]);
  });

  it("対象学年が空なら全学年として交わる (検出は広め)", () => {
    const r = findSameDayDaySchedules({ date: "2026-10-07", targetGrades: [], cancelTimes: ["16:25-17:25"] }, [cut()]);
    expect(r[0].sharedGrades).toEqual(["附中1", "附中2"]);
    expect(r[0].sharedTimes).toEqual(["16:25-17:25"]);
  });

  it("後から登録した同じ (学年, 時間帯) の id を返す。先の方・別時間帯は返さない", () => {
    const list = [
      cut(),
      cut({ id: 2, label: "重複", targetGrades: ["附中2"] }),
      cut({ id: 3, label: "別時間帯", cancelTimes: [], timeMap: [{ from: "17:35-18:35", to: "18:00-18:50" }] }),
      cut({ id: 4, label: "別学年", targetGrades: ["中1"] }),
    ];
    expect(findShadowedDaySchedules(list)).toEqual([
      { id: 2, byId: 1, grades: ["附中2"], times: ["16:25-17:25"] },
    ]);
    expect(findShadowedDaySchedules([])).toEqual([]);
    expect(findShadowedDaySchedules(null)).toEqual([]);
  });
});
