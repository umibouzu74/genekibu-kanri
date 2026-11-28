import { describe, expect, it } from "vitest";
import {
  applyCohortCarryOver,
  applyMappingCarryOver,
  buildSessionCtxFor,
  isGradeOnlyChange,
  planCohortCarryOver,
  planMappingCarryOver,
  sessionNumberChanges,
} from "./slotGradeChange";
import { computeSessionNumber } from "./sessionCount";
import { isSlotBeyondCutoff } from "./timetable";
import { findCohortCutoff } from "./cohorts";

// 2026 年度の土曜の Speaking/Listening の形 (1学期のコマ 222、2学期のコマ 728)
const TIMETABLES = [
  { id: 1, name: "1学期", startDate: "2026-04-06", endDate: "2026-08-24", grades: [] },
  { id: 3, name: "2学期", startDate: "2026-08-25", endDate: "2026-12-26", grades: ["高1", "高2", "高3"] },
];
const SL = { day: "土", time: "18:30-19:30", cls: "", room: "亀63", subj: "Speaking/Listening", teacher: "本澤", note: "" };
const SLOT_222 = { ...SL, id: 222, grade: "高3" };
const SLOT_728 = { ...SL, id: 728, grade: "高3", timetableId: 3 };
const OTHER = { id: 800, day: "土", time: "18:30-19:30", grade: "高3", cls: "", room: "亀21", subj: "共テ化学", teacher: "X", timetableId: 3 };
const SLOTS = [SLOT_222, SLOT_728, OTHER];
const AFTER = { ...SLOT_728, grade: "高1-3" };

// 2学期の授業は 9/1 から (最初の土曜 = 9/5)
const GROUPS = [
  { label: "高1・2", grades: ["高1", "高2"], startDate: "2026-09-01", date: "2026-12-26", timetableId: 3 },
  { label: "高3", grades: ["高3"], startDate: "2026-09-01", date: "2026-12-26", timetableId: 3 },
];
const CUTOFF = {
  groups: GROUPS,
  cohorts: [{ id: "H|高3|Speaking/Listening", date: "2026-12-19", timetableId: 3 }],
};

describe("isGradeOnlyChange", () => {
  it("学年だけを変えた編集だけを引き継ぎの対象にする", () => {
    expect(isGradeOnlyChange(SLOT_728, AFTER)).toBe(true);
    expect(isGradeOnlyChange(SLOT_728, { ...AFTER, subj: "Speaking" })).toBe(false);
    expect(isGradeOnlyChange(SLOT_728, { ...AFTER, day: "金" })).toBe(false);
    expect(isGradeOnlyChange(SLOT_728, { ...AFTER, timetableId: 1 })).toBe(false);
    expect(isGradeOnlyChange(SLOT_728, { ...SLOT_728, teacher: "Y" })).toBe(false);
  });
});

describe("コース別終講日の引き継ぎ", () => {
  it("高3 → 高1-3 で H|高3|Speaking/Listening の 12/19 を H|高1-3|Speaking/Listening へ付け替える", () => {
    const plan = planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: CUTOFF.cohorts });
    expect(plan).toEqual({
      mode: "rename",
      from: CUTOFF.cohorts[0],
      to: { id: "H|高1-3|Speaking/Listening", date: "2026-12-19", timetableId: 3 },
    });
    const next = applyCohortCarryOver(CUTOFF, plan);
    expect(next.cohorts).toEqual([{ id: "H|高1-3|Speaking/Listening", date: "2026-12-19", timetableId: 3 }]);
    expect(next.groups).toBe(GROUPS);
    // 変更後のコマに 12/19 が効き、12/26 は出ない
    expect(findCohortCutoff(AFTER, next.cohorts)?.date).toBe("2026-12-19");
    expect(isSlotBeyondCutoff("2026-12-19", AFTER, next)).toBe(false);
    expect(isSlotBeyondCutoff("2026-12-26", AFTER, next)).toBe(true);
  });

  it("保存値が時間割の付いていない旧データでも付け替える (補った時間割を付けて書く)", () => {
    const plan = planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: CUTOFF.cohorts });
    const stored = { groups: GROUPS, cohorts: [{ id: "H|高3|Speaking/Listening", date: "2026-12-19" }] };
    expect(applyCohortCarryOver(stored, plan).cohorts).toEqual([
      { id: "H|高1-3|Speaking/Listening", date: "2026-12-19", timetableId: 3 },
    ]);
  });

  it("同じ時間割に前のコースのコマが残るなら写す (前の終講日も残す)", () => {
    const twin = { ...SLOT_728, id: 729, time: "19:40-20:40" };
    const plan = planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: [...SLOTS, twin], cohorts: CUTOFF.cohorts });
    expect(plan.mode).toBe("copy");
    expect(applyCohortCarryOver(CUTOFF, plan).cohorts.map((c) => c.id)).toEqual([
      "H|高3|Speaking/Listening",
      "H|高1-3|Speaking/Listening",
    ]);
  });

  it("変更後のコースに終講日が既にあれば何もしない / 2 回当てても増えない", () => {
    const has = [...CUTOFF.cohorts, { id: "H|高1-3|Speaking/Listening", date: "2026-12-12", timetableId: 3 }];
    expect(planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: has })).toBeNull();
    const plan = planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: CUTOFF.cohorts });
    const once = applyCohortCarryOver(CUTOFF, plan);
    expect(applyCohortCarryOver(once, plan)).toBe(once);
  });

  it("終講日の無いコマ・学年以外も変えた編集は引き継がない", () => {
    expect(planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: [] })).toBeNull();
    expect(
      planCohortCarryOver({ before: SLOT_728, after: { ...AFTER, subj: "英会話" }, slots: SLOTS, cohorts: CUTOFF.cohorts })
    ).toBeNull();
  });

  it("新しい学年でどのコースにも入らないときは引き継げないと返す (高1 の英数以外)", () => {
    const before = { ...SLOT_728, subj: "高松西 物理" };
    const cohorts = [{ id: "H|高3|高松西", date: "2026-12-19", timetableId: 3 }];
    const plan = planCohortCarryOver({ before, after: { ...before, grade: "高1" }, slots: [before], cohorts });
    expect(plan).toEqual({ mode: "none", from: cohorts[0] });
    expect(applyCohortCarryOver({ cohorts }, plan)).toEqual({ cohorts });
  });
});

describe("予定表チェックの講座の対応の引き継ぎ", () => {
  const MAPPING = [
    { course: "高1・高2|Speaking/Listening", subjects: ["高3|Speaking/Listening"] },
    { course: "高3|共テ化学", subjects: ["高3|共テ化学"] },
  ];

  it("前の期のコマ (高3 のまま) が残るので、高1-3 を足して両方残す", () => {
    const plan = planMappingCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, mapping: MAPPING });
    expect(plan).toEqual({
      oldKey: "高3|Speaking/Listening",
      newKey: "高1-3|Speaking/Listening",
      keepOld: true,
      courses: ["高1・高2|Speaking/Listening"],
    });
    expect(applyMappingCarryOver(MAPPING, plan)).toEqual([
      { course: "高1・高2|Speaking/Listening", subjects: ["高1-3|Speaking/Listening", "高3|Speaking/Listening"] },
      { course: "高3|共テ化学", subjects: ["高3|共テ化学"] },
    ]);
  });

  it("旧学年のコマが他に無ければ置き換える", () => {
    const plan = planMappingCarryOver({ before: SLOT_728, after: AFTER, slots: [SLOT_728], mapping: MAPPING });
    expect(applyMappingCarryOver(MAPPING, plan)[0]).toEqual({
      course: "高1・高2|Speaking/Listening",
      subjects: ["高1-3|Speaking/Listening"],
    });
  });

  it("その科目名を選んでいる講座が無ければ何もしない", () => {
    expect(planMappingCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, mapping: [] })).toBeNull();
  });
});

describe("学年を変えても第N回が続く (11/28 = ⑫ → 12/5 = ⑬)", () => {
  // 9/5〜11/28 の 13 回の土曜のうち、10/10 は高校部の休講 → 11/28 が ⑫
  const HOLIDAYS = [{ id: 1, date: "2026-10-10", scope: ["高校部"], targetGrades: [], subjKeywords: [] }];
  const base = { timetables: TIMETABLES, holidays: HOLIDAYS, displayCutoff: CUTOFF };
  const afterCutoff = applyCohortCarryOver(
    CUTOFF,
    planCohortCarryOver({ before: SLOT_728, after: AFTER, slots: SLOTS, cohorts: CUTOFF.cohorts })
  );
  const afterSlots = SLOTS.map((s) => (s.id === 728 ? AFTER : s));

  it("前後で回数が同じ (警告を出さない)", () => {
    const ctxAfter = buildSessionCtxFor(afterSlots, { ...base, displayCutoff: afterCutoff });
    expect(computeSessionNumber(AFTER, "2026-11-28", ctxAfter)).toBe(12);
    expect(computeSessionNumber(AFTER, "2026-12-05", ctxAfter)).toBe(13);
    expect(computeSessionNumber(AFTER, "2026-12-12", ctxAfter)).toBe(14);
    expect(computeSessionNumber(AFTER, "2026-12-19", ctxAfter)).toBe(15);
    expect(
      sessionNumberChanges({
        before: SLOT_728,
        after: AFTER,
        slots: SLOTS,
        base,
        afterDisplayCutoff: afterCutoff,
        today: "2026-11-28",
      })
    ).toEqual([]);
  });

  it("高3 だけの休講があった日は変更後は止まらないので、その後の回数が変わると知らせる", () => {
    const only3 = [...HOLIDAYS, { id: 2, date: "2026-11-14", scope: ["高校部"], targetGrades: ["高3"], subjKeywords: [] }];
    const changes = sessionNumberChanges({
      before: SLOT_728,
      after: AFTER,
      slots: SLOTS,
      base: { ...base, holidays: only3 },
      afterDisplayCutoff: afterCutoff,
      today: "2026-11-28",
    });
    expect(changes[0]).toEqual({ date: "2026-11-14", before: 0, after: 10 });
    expect(changes.find((c) => c.date === "2026-11-28")).toEqual({ date: "2026-11-28", before: 11, after: 12 });
  });
});
