import { describe, it, expect } from "vitest";
import { groupParallelSlots, slotGroupKey } from "./parallelSlots.js";

describe("slotGroupKey", () => {
  it("同一 (day, time, grade, cls, subj) のスロットは同じキーを返す", () => {
    const a = { id: 97, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" };
    const b = { id: 98, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷" };
    expect(slotGroupKey(a)).toBe(slotGroupKey(b));
  });

  it("day が異なれば別キー", () => {
    const a = { day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト" };
    const b = { day: "木", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト" };
    expect(slotGroupKey(a)).not.toBe(slotGroupKey(b));
  });

  it("cls が異なれば別キー", () => {
    const a = { day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト" };
    const b = { day: "火", time: "21:35-21:50", grade: "中3", cls: "S〜B", subj: "確認テスト" };
    expect(slotGroupKey(a)).not.toBe(slotGroupKey(b));
  });
});

describe("groupParallelSlots", () => {
  it("空配列を許容する", () => {
    const r = groupParallelSlots([]);
    expect(r.representativeSlots).toEqual([]);
    expect(r.groupTeacherMap.size).toBe(0);
    expect(r.suppressedIds.size).toBe(0);
  });

  it("null/undefined を許容する", () => {
    const r = groupParallelSlots(null);
    expect(r.representativeSlots).toEqual([]);
    expect(r.suppressedIds.size).toBe(0);
  });

  it("並列スロットなしならそのまま返し teacherMap は空", () => {
    const slots = [
      { id: 1, day: "月", time: "18:55-19:40", grade: "中2", cls: "S", subj: "英語", teacher: "堀上" },
      { id: 2, day: "月", time: "19:50-20:35", grade: "中2", cls: "S", subj: "数学", teacher: "片岡" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.representativeSlots).toHaveLength(2);
    expect(r.groupTeacherMap.size).toBe(0);
    expect(r.suppressedIds.size).toBe(0);
  });

  it("中3 火曜の確認テスト (藤田 + 大屋敷) を 1 コマに集約", () => {
    const slots = [
      { id: 97, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田", room: "501" },
      { id: 98, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷", room: "503" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.representativeSlots).toHaveLength(1);
    expect(r.representativeSlots[0].id).toBe(97);
    expect(r.groupTeacherMap.get(97)).toBe("藤田・大屋敷");
    expect(r.suppressedIds.has(98)).toBe(true);
    expect(r.suppressedIds.has(97)).toBe(false);
  });

  it("3 人以上の並列担任を・連結で返す", () => {
    const slots = [
      { id: 10, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" },
      { id: 11, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷" },
      { id: 12, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "松川" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.representativeSlots).toHaveLength(1);
    expect(r.groupTeacherMap.get(10)).toBe("藤田・大屋敷・松川");
  });

  it("同名教師の重複は統合", () => {
    const slots = [
      { id: 1, day: "火", time: "21:35", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" },
      { id: 2, day: "火", time: "21:35", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.groupTeacherMap.get(1)).toBe("藤田");
  });

  it("元の入力順序を保持する", () => {
    const slots = [
      { id: 1, day: "月", time: "18:55-19:40", grade: "中2", cls: "S", subj: "英語", teacher: "A" },
      { id: 97, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" },
      { id: 2, day: "水", time: "18:55-19:40", grade: "中3", cls: "S", subj: "数学", teacher: "B" },
      { id: 98, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.representativeSlots.map((s) => s.id)).toEqual([1, 97, 2]);
  });

  it("同じ曜日・時間でも cls が異なれば別グループ", () => {
    const slots = [
      { id: 97, day: "火", time: "21:35-21:50", grade: "中3", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" },
      { id: 99, day: "水", time: "21:35-21:50", grade: "中3", cls: "S〜B", subj: "確認テスト", teacher: "藤田" },
    ];
    const r = groupParallelSlots(slots);
    expect(r.representativeSlots).toHaveLength(2);
    expect(r.suppressedIds.size).toBe(0);
  });
});
