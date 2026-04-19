import { describe, expect, it } from "vitest";
import { findNextSessionMap } from "./nextSessionDate";

// startDate を 2026-04-07 (火) にして中3を対象にしたカットオフ。
const DISPLAY_CUTOFF = {
  groups: [{ label: "中3", grades: ["中3"], startDate: "2026-04-07", date: null }],
};

const NEVER_OFF = () => false;

function makeSlot(id, day, time, grade, extras = {}) {
  return {
    id,
    day,
    time,
    grade,
    cls: "",
    room: "602",
    subj: "数学",
    teacher: "T",
    note: "",
    ...extras,
  };
}

function makeCtx(slots, overrides = {}) {
  return {
    classSets: [],
    allSlots: slots,
    displayCutoff: DISPLAY_CUTOFF,
    isOffForGrade: NEVER_OFF,
    biweeklyAnchors: [],
    sessionOverrides: [],
    ...overrides,
  };
}

describe("findNextSessionMap", () => {
  const tueSlot = makeSlot(1, "火", "19:00-20:20", "中3");

  it("today = 2026-04-07 (火曜日) → その日の回数 1 を返す", () => {
    const today = new Date(2026, 3, 7); // 月は 0-indexed
    const map = findNextSessionMap([tueSlot], 2 /* Tue */, today, makeCtx([tueSlot]), DISPLAY_CUTOFF);
    expect(map.get(1)).toBe(1);
  });

  it("today = 2026-04-08 (水曜日) の 火曜列 → 次週の 4/14 基準の 2 を返す", () => {
    const today = new Date(2026, 3, 8);
    const map = findNextSessionMap([tueSlot], 2, today, makeCtx([tueSlot]), DISPLAY_CUTOFF);
    expect(map.get(1)).toBe(2);
  });

  it("today < startDate (2026-04-01) の火曜列 → 見つかるまで先送り、4/7 基準の 1 を返す", () => {
    const today = new Date(2026, 3, 1);
    const map = findNextSessionMap([tueSlot], 2, today, makeCtx([tueSlot]), DISPLAY_CUTOFF);
    expect(map.get(1)).toBe(1);
  });

  it("daySlots が空なら空 Map", () => {
    const today = new Date(2026, 3, 7);
    const map = findNextSessionMap([], 2, today, makeCtx([tueSlot]), DISPLAY_CUTOFF);
    expect(map.size).toBe(0);
  });

  it("displayCutoff が null なら空 Map (バッジ非表示に倒す)", () => {
    const today = new Date(2026, 3, 7);
    const map = findNextSessionMap([tueSlot], 2, today, makeCtx([tueSlot]), null);
    expect(map.size).toBe(0);
  });

  it("4 週間探しても回数 > 0 が得られない場合は空 Map", () => {
    // 対象曜日が月だが slot は火曜 → どの月曜でもカウントが上がらない。
    const today = new Date(2026, 3, 7);
    const map = findNextSessionMap([tueSlot], 1 /* Mon */, today, makeCtx([tueSlot]), DISPLAY_CUTOFF);
    expect(map.size).toBe(0);
  });

  it("全日カットオフ (group.date < ds) 週はスキップされて次週を採用する", () => {
    // group.date を 2026-04-08 にして「4/9 以降は範囲外」にする。
    // today=2026-04-07, 木曜列 (targetDow=4) → 4/9 は範囲外でスキップ、
    // しかし次週 4/16 も範囲外 → 空 Map。
    const cutoff = {
      groups: [{ label: "中3", grades: ["中3"], startDate: "2026-04-07", date: "2026-04-08" }],
    };
    const thuSlot = makeSlot(2, "木", "19:00-20:20", "中3");
    const today = new Date(2026, 3, 7);
    const map = findNextSessionMap(
      [thuSlot],
      4,
      today,
      makeCtx([thuSlot], { displayCutoff: cutoff }),
      cutoff,
    );
    expect(map.size).toBe(0);
  });
});
