import { describe, expect, it } from "vitest";
import {
  availableScope,
  countUntouchedSlots,
  describeScope,
  filterConflictsByScope,
  isScopeLimited,
  normalizeScope,
  scopeMatcher,
} from "./reflectScope";
import { makeProject } from "./testUtils";

// 中3 (月・火) に加えて 中2 (火・土) のタブを足したプロジェクト
function makeTwoGradeProject() {
  const p = makeProject();
  p.tabs.push({
    id: 2,
    name: "中2",
    grade: "中2",
    classes: [{ id: 1, label: "S", room: "601" }],
    days: ["火", "土"],
    periodIds: [1, 2],
    schedule: {},
  });
  return p;
}

describe("isScopeLimited", () => {
  it("どちらの軸も空なら絞っていない", () => {
    expect(isScopeLimited(undefined)).toBe(false);
    expect(isScopeLimited({})).toBe(false);
    expect(isScopeLimited({ days: [], grades: [] })).toBe(false);
    expect(isScopeLimited({ days: ["  "] })).toBe(false);
  });

  it("どちらかに値があれば絞っている", () => {
    expect(isScopeLimited({ days: ["土"] })).toBe(true);
    expect(isScopeLimited({ grades: ["中3"] })).toBe(true);
  });
});

describe("availableScope", () => {
  it("曜日は月火水…順、学年はタブ定義順で返す", () => {
    expect(availableScope(makeTwoGradeProject())).toEqual({
      days: ["月", "火", "土"], // 検出順 (月火 → 火土) ではなく曜日順
      grades: ["中3", "中2"],
    });
  });

  it("タブが無くても壊れない", () => {
    expect(availableScope({})).toEqual({ days: [], grades: [] });
    expect(availableScope(null)).toEqual({ days: [], grades: [] });
  });
});

describe("normalizeScope", () => {
  const p = makeTwoGradeProject();

  it("プロジェクトに無い曜日・学年は落とす", () => {
    expect(normalizeScope({ days: ["土", "日"], grades: ["中2", "高1"] }, p)).toEqual({
      days: ["土"],
      grades: ["中2"],
    });
  });

  it("全部選んだ状態は「絞らない」にたたむ", () => {
    expect(
      normalizeScope({ days: ["月", "火", "土"], grades: ["中3", "中2"] }, p)
    ).toEqual({ days: [], grades: [] });
  });

  it("片方だけ全選択なら、その軸だけたたむ", () => {
    expect(normalizeScope({ days: ["月", "火", "土"], grades: ["中3"] }, p)).toEqual({
      days: [],
      grades: ["中3"],
    });
  });

  it("未指定は空", () => {
    expect(normalizeScope(undefined, p)).toEqual({ days: [], grades: [] });
  });
});

describe("scopeMatcher", () => {
  it("絞っていなければ全部通す", () => {
    const m = scopeMatcher({});
    expect(m({ day: "月", grade: "中3" })).toBe(true);
    expect(m({})).toBe(true);
  });

  it("曜日で絞る", () => {
    const m = scopeMatcher({ days: ["土"] });
    expect(m({ day: "土", grade: "中3" })).toBe(true);
    expect(m({ day: "月", grade: "中3" })).toBe(false);
  });

  it("学年で絞る", () => {
    const m = scopeMatcher({ grades: ["中3"] });
    expect(m({ day: "月", grade: "中3" })).toBe(true);
    expect(m({ day: "月", grade: "中2" })).toBe(false);
  });

  it("学年と曜日は AND (両方満たすものだけ)", () => {
    const m = scopeMatcher({ days: ["土"], grades: ["中3"] });
    expect(m({ day: "土", grade: "中3" })).toBe(true);
    expect(m({ day: "土", grade: "中2" })).toBe(false); // 曜日は合うが学年が違う
    expect(m({ day: "月", grade: "中3" })).toBe(false); // 学年は合うが曜日が違う
  });

  it("学年は前後の空白を無視して比べる", () => {
    expect(scopeMatcher({ grades: ["中3"] })({ day: "月", grade: " 中3 " })).toBe(true);
  });

  it("学年が未設定のコマは学年で絞ると外れる", () => {
    expect(scopeMatcher({ grades: ["中3"] })({ day: "月" })).toBe(false);
  });
});

describe("describeScope", () => {
  it("絞っていなければ全体", () => {
    expect(describeScope({})).toBe("全体");
    expect(describeScope(undefined)).toBe("全体");
  });

  it("学年 の 曜日 の順で書く", () => {
    expect(describeScope({ grades: ["中3"], days: ["土"] })).toBe("中3 の 土曜");
  });

  it("曜日だけ / 学年だけも書ける", () => {
    expect(describeScope({ days: ["土"] })).toBe("土曜");
    expect(describeScope({ grades: ["中3", "中2"] })).toBe("中3・中2");
  });

  it("曜日は月火水…順に並べ直す", () => {
    expect(describeScope({ days: ["土", "月"] })).toBe("月・土曜");
  });
});

describe("countUntouchedSlots", () => {
  const SLOTS = [
    { id: 1, day: "月", grade: "中3", timetableId: 1 },
    { id: 2, day: "土", grade: "中3", timetableId: 1 },
    { id: 3, day: "土", grade: "中2", timetableId: 1 },
    { id: 4, day: "土", grade: "中3", timetableId: 2 }, // 別の時間割
    { id: 5, day: "月", grade: "中3" }, // timetableId 無し = 1 扱い
  ];

  it("範囲外かつ置き換え先のコマだけ数える", () => {
    // 土曜だけ反映 → 月曜の 2 件 (id 1, 5) が触られない
    expect(countUntouchedSlots(SLOTS, 1, { days: ["土"] })).toBe(2);
  });

  it("学年でも数える", () => {
    // 中3 だけ反映 → 中2 の 1 件 (id 3)
    expect(countUntouchedSlots(SLOTS, 1, { grades: ["中3"] })).toBe(1);
  });

  it("絞っていなければ 0 (従来どおり全部が対象)", () => {
    expect(countUntouchedSlots(SLOTS, 1, {})).toBe(0);
    expect(countUntouchedSlots(SLOTS, 1, undefined)).toBe(0);
  });

  it("他の時間割のコマは数えない", () => {
    expect(countUntouchedSlots(SLOTS, 2, { days: ["月"] })).toBe(1); // id 4 だけ
  });
});

describe("filterConflictsByScope", () => {
  const p = makeTwoGradeProject(); // tab 1 = 中3, tab 2 = 中2
  const CONFLICTS = [
    { type: "teacher", day: "月", refs: ["1:月|1|1", "1:月|1|2"] }, // 中3 のみ
    { type: "teacher", day: "火", refs: ["1:火|1|1", "2:火|1|1"] }, // 中3 × 中2
    { type: "room", day: "土", refs: ["2:土|1|1", "2:土|2|1"] }, // 中2 のみ
  ];

  it("絞っていなければ全部返す", () => {
    expect(filterConflictsByScope(CONFLICTS, p, {})).toHaveLength(3);
  });

  it("曜日で絞る", () => {
    const out = filterConflictsByScope(CONFLICTS, p, { days: ["土"] });
    expect(out.map((c) => c.day)).toEqual(["土"]);
  });

  it("学年で絞る — 片方でも範囲に入っていれば残す", () => {
    // 中3 だけ反映: 中3 のみの重なりと、中3 × 中2 の重なりは持ち込まれる
    const out = filterConflictsByScope(CONFLICTS, p, { grades: ["中3"] });
    expect(out.map((c) => c.day)).toEqual(["月", "火"]);
  });

  it("範囲外だけで起きている重なりは落とす", () => {
    // 中3 だけ反映 → 中2 だけの土曜の教室重複は挙げない
    const out = filterConflictsByScope(CONFLICTS, p, { grades: ["中3"] });
    expect(out.some((c) => c.type === "room")).toBe(false);
  });

  it("学年と曜日の両方で絞る", () => {
    const out = filterConflictsByScope(CONFLICTS, p, {
      grades: ["中3"],
      days: ["火"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].day).toBe("火");
  });

  it("空 / 壊れた入力でも落ちない", () => {
    expect(filterConflictsByScope(undefined, p, { days: ["土"] })).toEqual([]);
    expect(filterConflictsByScope([{ day: "土" }], p, { grades: ["中3"] })).toEqual([]);
  });
});
