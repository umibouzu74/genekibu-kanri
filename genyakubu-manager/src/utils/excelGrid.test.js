import { describe, it, expect } from "vitest";
import { findSlotForCell } from "./excelGrid";

const baseSlot = (overrides) => ({
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "高2",
  cls: "-",
  room: "701",
  subj: "数学",
  teacher: "田中",
  note: "",
  ...overrides,
});

describe("findSlotForCell", () => {
  it("returns the slot matching day, time, grade, cls, and room", () => {
    const slots = [
      baseSlot({ id: 1, room: "701" }),
      baseSlot({ id: 2, room: "702" }),
    ];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "-", "702");
    expect(result).toBe(slots[1]);
  });

  it("returns null when room does not match", () => {
    const slots = [baseSlot({ room: "701" })];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "-", "999");
    expect(result).toBeNull();
  });

  it("skips combined cls slots", () => {
    const slots = [baseSlot({ cls: "S/AB", room: "701" })];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "S", "701");
    expect(result).toBeNull();
  });

  it("matches via classMatchesColumn for non-combined cls", () => {
    const slots = [baseSlot({ cls: "S", room: "701" })];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "S", "701");
    expect(result).toBe(slots[0]);
  });

  it("returns null when no slots exist", () => {
    const result = findSlotForCell([], "月", "19:00-20:20", "高2", "-", "701");
    expect(result).toBeNull();
  });

  it("does not match when grade differs", () => {
    const slots = [baseSlot({ grade: "高3", room: "701" })];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "-", "701");
    expect(result).toBeNull();
  });

  it("does not match when day differs", () => {
    const slots = [baseSlot({ day: "火", room: "701" })];
    const result = findSlotForCell(slots, "月", "19:00-20:20", "高2", "-", "701");
    expect(result).toBeNull();
  });
});
