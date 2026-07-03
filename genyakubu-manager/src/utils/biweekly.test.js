import { describe, expect, it } from "vitest";
import {
  biweeklyActiveTeacher,
  biweeklyDisplaySubject,
  formatBiweeklyNote,
  formatBiweeklyTeacher,
  formatCount,
  getSlotWeekType,
  getWeekType,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
  getSlotTeachers,
  slotWeight,
  weightedSlotCount,
} from "./biweekly";

describe("formatBiweeklyTeacher", () => {
  it("returns the teacher alone when no biweekly note is present", () => {
    expect(formatBiweeklyTeacher("堀上", "")).toBe("堀上");
    expect(formatBiweeklyTeacher("堀上", undefined)).toBe("堀上");
    expect(formatBiweeklyTeacher("堀上", "合同")).toBe("堀上");
  });

  it("appends the biweekly partner extracted from the note", () => {
    expect(formatBiweeklyTeacher("堀上", "隔週(河野)")).toBe("堀上 / 河野");
  });

  it("handles biweekly markers surrounded by other note text", () => {
    expect(formatBiweeklyTeacher("山田", "補習, 隔週(佐藤), 要調整")).toBe(
      "山田 / 佐藤"
    );
  });
});

describe("formatBiweeklyNote", () => {
  it("returns note as-is when no biweekly marker is present", () => {
    expect(formatBiweeklyNote("堀上", "合同")).toBe("合同");
    expect(formatBiweeklyNote("堀上", "")).toBe("");
    expect(formatBiweeklyNote("堀上", null)).toBe(null);
    expect(formatBiweeklyNote("堀上", undefined)).toBe(undefined);
  });

  it("expands biweekly marker to show both teachers", () => {
    expect(formatBiweeklyNote("堀上", "隔週(河野)")).toBe("隔週 : 堀上 / 河野");
  });

  it("preserves surrounding note text", () => {
    expect(formatBiweeklyNote("山田", "補習, 隔週(佐藤), 要調整")).toBe(
      "補習, 隔週 : 山田 / 佐藤, 要調整"
    );
  });
});

describe("getWeekType", () => {
  it("returns A for the base date itself", () => {
    expect(getWeekType("2026-04-06", "2026-04-06")).toBe("A");
  });

  it("returns A for dates within the same week as the base", () => {
    // base=Monday 2026-04-06, same week
    expect(getWeekType("2026-04-08", "2026-04-06")).toBe("A");
    expect(getWeekType("2026-04-12", "2026-04-06")).toBe("A");
  });

  it("returns B for the week after the base", () => {
    expect(getWeekType("2026-04-13", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-04-15", "2026-04-06")).toBe("B");
  });

  it("returns A two weeks after the base", () => {
    expect(getWeekType("2026-04-20", "2026-04-06")).toBe("A");
  });

  it("handles dates before the base (negative direction)", () => {
    expect(getWeekType("2026-03-30", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-03-23", "2026-04-06")).toBe("A");
  });

  it("returns null for empty or invalid inputs", () => {
    expect(getWeekType("", "2026-04-06")).toBeNull();
    expect(getWeekType("2026-04-06", "")).toBeNull();
    expect(getWeekType(null, "2026-04-06")).toBeNull();
  });
});

describe("getWeekType with multi-anchor", () => {
  const anchors = [
    { date: "2026-04-06", weekType: "A" },
    { date: "2026-06-08", weekType: "A" },
  ];

  it("returns A for an anchor date itself", () => {
    expect(getWeekType("2026-04-06", anchors)).toBe("A");
    expect(getWeekType("2026-06-08", anchors)).toBe("A");
  });

  it("returns B for one week after an anchor", () => {
    expect(getWeekType("2026-04-13", anchors)).toBe("B");
    expect(getWeekType("2026-06-15", anchors)).toBe("B");
  });

  it("uses the most recent anchor on or before the target date", () => {
    // 2026-06-10 (Wed) is in the same week as anchor 2026-06-08 → A
    expect(getWeekType("2026-06-10", anchors)).toBe("A");
    // 2026-06-22 is 2 weeks after anchor 2026-06-08 → A
    expect(getWeekType("2026-06-22", anchors)).toBe("A");
  });

  it("uses the first anchor for dates between anchor 1 and anchor 2", () => {
    // 2026-05-04 uses anchor 2026-04-06: 4 weeks diff → A
    expect(getWeekType("2026-05-04", anchors)).toBe("A");
    // 2026-05-11 uses anchor 2026-04-06: 5 weeks diff → B
    expect(getWeekType("2026-05-11", anchors)).toBe("B");
  });

  it("handles dates before all anchors (uses earliest anchor backward)", () => {
    // 2026-03-30 is 1 week before 2026-04-06 → B
    expect(getWeekType("2026-03-30", anchors)).toBe("B");
    // 2026-03-23 is 2 weeks before 2026-04-06 → A
    expect(getWeekType("2026-03-23", anchors)).toBe("A");
  });

  it("single anchor matches old single-base behavior", () => {
    const single = [{ date: "2026-04-06", weekType: "A" }];
    expect(getWeekType("2026-04-06", single)).toBe("A");
    expect(getWeekType("2026-04-08", single)).toBe("A");
    expect(getWeekType("2026-04-13", single)).toBe("B");
    expect(getWeekType("2026-04-20", single)).toBe("A");
    expect(getWeekType("2026-03-30", single)).toBe("B");
  });

  it("returns null for empty anchors array", () => {
    expect(getWeekType("2026-04-06", [])).toBeNull();
  });

  it("returns null for null/undefined anchors", () => {
    expect(getWeekType("2026-04-06", null)).toBeNull();
    expect(getWeekType("2026-04-06", undefined)).toBeNull();
  });

  it("backward compat: accepts a string as second argument", () => {
    expect(getWeekType("2026-04-06", "2026-04-06")).toBe("A");
    expect(getWeekType("2026-04-13", "2026-04-06")).toBe("B");
    expect(getWeekType("2026-04-06", "")).toBeNull();
  });

  it("handles Golden Week correction scenario", () => {
    // Without correction: single base 2026-04-06
    // 2026-06-15 is 10 weeks from base → A (even)
    expect(getWeekType("2026-06-15", "2026-04-06")).toBe("A");

    // With correction anchor at 2026-06-08:
    // 2026-06-15 is 1 week from anchor 2026-06-08 → B
    expect(getWeekType("2026-06-15", anchors)).toBe("B");
    // This demonstrates that the second anchor can shift the A/B assignment
  });
});

describe("isBiweekly", () => {
  it("detects notes containing 隔週", () => {
    expect(isBiweekly("隔週(河野)")).toBe(true);
    expect(isBiweekly("合同, 隔週")).toBe(true);
  });

  it("returns false for non-biweekly notes", () => {
    expect(isBiweekly("合同")).toBe(false);
    expect(isBiweekly("")).toBe(false);
    expect(isBiweekly(null)).toBe(false);
    expect(isBiweekly(undefined)).toBe(false);
  });
});

describe("getSlotWeekType", () => {
  const globalAnchors = [{ date: "2026-04-06", weekType: "A" }];

  it("uses global anchors when slot has no per-slot anchors", () => {
    const slot = { note: "隔週(河野)" };
    expect(getSlotWeekType("2026-04-06", slot, globalAnchors)).toBe("A");
    expect(getSlotWeekType("2026-04-13", slot, globalAnchors)).toBe("B");
  });

  it("uses global anchors when slot.biweeklyAnchors is empty", () => {
    const slot = { note: "隔週(河野)", biweeklyAnchors: [] };
    expect(getSlotWeekType("2026-04-06", slot, globalAnchors)).toBe("A");
    expect(getSlotWeekType("2026-04-13", slot, globalAnchors)).toBe("B");
  });

  it("uses per-slot anchors when present", () => {
    const slot = {
      note: "隔週(河野)",
      biweeklyAnchors: [{ date: "2026-04-13", weekType: "A" }],
    };
    // Per-slot anchor says 2026-04-13 is A (differs from global which says B)
    expect(getSlotWeekType("2026-04-13", slot, globalAnchors)).toBe("A");
    expect(getSlotWeekType("2026-04-20", slot, globalAnchors)).toBe("B");
  });

  it("per-slot anchors override global even for same-date queries", () => {
    const slot = {
      note: "隔週(河野)",
      biweeklyAnchors: [{ date: "2026-06-08", weekType: "A" }],
    };
    // 2026-06-15 is 1 week after per-slot anchor → B
    expect(getSlotWeekType("2026-06-15", slot, globalAnchors)).toBe("B");
    // But with global anchor (2026-04-06), 2026-06-15 is 10 weeks → A
    const slotNoAnchors = { note: "隔週(河野)" };
    expect(getSlotWeekType("2026-06-15", slotNoAnchors, globalAnchors)).toBe("A");
  });
});

describe("getSlotWeekType with holiday-aware shift", () => {
  // 2026-04-24 (Fri) を A 週基準にしたうえで Friday 隔週コマを考える。
  // 4/24=A, 5/1=B, 5/8=A, 5/15=B, 5/22=A という素のローテーション。
  const anchors = [{ date: "2026-04-24", weekType: "A" }];
  const fridaySlot = {
    day: "金",
    grade: "中3",
    subj: "英",
    note: "隔週(河野)",
    teacher: "堀上",
  };

  it("休講なしのときは素のローテーションと一致 (regression guard)", () => {
    expect(getSlotWeekType("2026-04-24", fridaySlot, anchors, [])).toBe("A");
    expect(getSlotWeekType("2026-05-01", fridaySlot, anchors, [])).toBe("B");
    expect(getSlotWeekType("2026-05-08", fridaySlot, anchors, [])).toBe("A");
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [])).toBe("B");
  });

  it("holidays 引数を省略しても従来挙動 (undefined / null も安全)", () => {
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors)).toBe("B");
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, null)).toBe("B");
  });

  it("5/1=B → 5/8 休講 → 5/15 は A 週へシフトする (ユーザ報告ケース)", () => {
    const holidays = [
      {
        id: 1,
        date: "2026-05-08",
        label: "特訓",
        scope: ["全部"],
        targetGrades: [],
        subjKeywords: [],
      },
    ];
    // 5/8 を消化していないので、本来 5/15 が消化するはずだった B が 5/8 側へ
    // 戻ったと考え、5/15 はもう片方 (=A) を消化する扱いに反転。
    expect(getSlotWeekType("2026-05-08", fridaySlot, anchors, holidays)).toBe("A");
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, holidays)).toBe("A");
    // 以降は 1 週ずつ後ろにずれる
    expect(getSlotWeekType("2026-05-22", fridaySlot, anchors, holidays)).toBe("B");
    expect(getSlotWeekType("2026-05-29", fridaySlot, anchors, holidays)).toBe("A");
  });

  it("休講 2 回ぶんで偶数になれば反転は打ち消され元のローテに戻る", () => {
    const holidays = [
      { id: 1, date: "2026-05-08", label: "特訓1", scope: ["全部"], targetGrades: [], subjKeywords: [] },
      { id: 2, date: "2026-05-15", label: "特訓2", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 5/8 (A) と 5/15 (B) の両方を休講 → 5/22 は素のローテのまま A
    expect(getSlotWeekType("2026-05-22", fridaySlot, anchors, holidays)).toBe("A");
    expect(getSlotWeekType("2026-05-29", fridaySlot, anchors, holidays)).toBe("B");
  });

  it("anchor 当日の休講はカウントしない (anchor の A は確定)", () => {
    const holidays = [
      { id: 1, date: "2026-04-24", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // anchor 自体は常に A、以後のローテーションも変化しない
    expect(getSlotWeekType("2026-04-24", fridaySlot, anchors, holidays)).toBe("A");
    expect(getSlotWeekType("2026-05-01", fridaySlot, anchors, holidays)).toBe("B");
  });

  it("scope/grade/subj が一致しない休講は補正対象外 (slot 固有)", () => {
    // 高校部のみの休講 → 中3 (中学部) 金曜 slot には影響しない
    const holidays = [
      { id: 1, date: "2026-05-08", label: "高校テスト", scope: ["高校部"], targetGrades: [], subjKeywords: [] },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, holidays)).toBe("B");
  });

  it("subjKeywords が指定された休講は subj が一致するときだけ補正", () => {
    const matchingHoliday = [
      { id: 1, date: "2026-05-08", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: ["英"] },
    ];
    const nonMatchingHoliday = [
      { id: 1, date: "2026-05-08", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: ["数"] },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, matchingHoliday)).toBe("A");
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, nonMatchingHoliday)).toBe("B");
  });

  it("slot.day と違う曜日の休講はカウントしない (金曜の休講だけ見る)", () => {
    const mondayHoliday = [
      { id: 1, date: "2026-05-04", label: "祝日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 5/4 は月曜 → 金曜 slot のローテーションには無関係
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, mondayHoliday)).toBe("B");
  });

  it("anchor より前の日付は補正されない (素のローテに従う)", () => {
    const holidays = [
      { id: 1, date: "2026-05-08", label: "特訓", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 4/17 は anchor 4/24 より前 → 補正なし (4/17 は 1 週前 → B)
    expect(getSlotWeekType("2026-04-17", fridaySlot, anchors, holidays)).toBe("B");
  });

  it("複数 anchor: 直近 anchor が補正の起点になり、それより前の休講は無視", () => {
    const multiAnchors = [
      { date: "2026-04-24", weekType: "A" },
      { date: "2026-05-22", weekType: "A" }, // 手動で打ち直した anchor
    ];
    const holidays = [
      { id: 1, date: "2026-05-08", label: "特訓", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 5/29 は anchor2 (5/22) を基準にしたカレンダー parity がそのまま反映される。
    // anchor1 と anchor2 の間にある 5/8 の休講は無視。
    expect(getSlotWeekType("2026-05-29", fridaySlot, multiAnchors, holidays)).toBe("B");
    // 一方、anchor1 のみが基準になる 5/15 は補正の対象 (5/8 休講で A 週へ反転)。
    expect(getSlotWeekType("2026-05-15", fridaySlot, multiAnchors, holidays)).toBe("A");
  });

  it("slot 固有の anchor が global anchor を完全に置き換える (休講補正含む)", () => {
    const slotWithOwnAnchor = {
      ...fridaySlot,
      biweeklyAnchors: [{ date: "2026-04-10", weekType: "A" }],
    };
    const holidays = [
      { id: 1, date: "2026-04-17", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // slot 固有 anchor 4/10 (A) 基準 → 4/17 は B 週で休講 → 4/24 は素なら A だが
    // 持ち越し分で B 週へ反転。global の anchors (4/24=A) は使われない。
    expect(getSlotWeekType("2026-04-24", slotWithOwnAnchor, anchors, holidays)).toBe("B");
    // 念のため global を見ていたら 4/24 はそのまま A になるので、ここで明確に
    // 「使われていない」ことを確認する。
    const slotWithoutOwnAnchor = { ...fridaySlot };
    expect(getSlotWeekType("2026-04-24", slotWithoutOwnAnchor, anchors, holidays)).toBe("A");
  });

  it("連続する休講: 偶数回ぶんローテーション反転は打ち消される", () => {
    // 5/1 (B) と 5/8 (A) の両方を休講にする
    const holidays = [
      { id: 1, date: "2026-05-01", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
      { id: 2, date: "2026-05-08", label: "Y", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // B と A 両方が消化されなかったので 5/15 は素のローテどおり B
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, holidays)).toBe("B");
    // 5/22 も同様に A
    expect(getSlotWeekType("2026-05-22", fridaySlot, anchors, holidays)).toBe("A");
  });

  it("targetGrades 指定の休講は学年が一致するときだけ補正", () => {
    const onlyChu3 = [
      { id: 1, date: "2026-05-08", label: "X", scope: ["全部"], targetGrades: ["中3"], subjKeywords: [] },
    ];
    const onlyChu2 = [
      { id: 1, date: "2026-05-08", label: "X", scope: ["全部"], targetGrades: ["中2"], subjKeywords: [] },
    ];
    // slot は 中3 なので onlyChu3 では補正 (B→A) されるが onlyChu2 では補正されない
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, onlyChu3)).toBe("A");
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, onlyChu2)).toBe("B");
  });

  it("anchor の曜日と slot.day が違うときも slot.day だけを歩く", () => {
    // anchor は 4/27 (月)、slot は金曜
    const mondayAnchor = [{ date: "2026-04-27", weekType: "A" }];
    // 4/27 (月) は A、5/1 (金) は同週 (diff=4 days, floor=0) で A、
    // 5/8 (金) は diff=11, floor=1 → B、5/15 (金) は diff=18, floor=2 → A
    expect(getSlotWeekType("2026-05-01", fridaySlot, mondayAnchor, [])).toBe("A");
    expect(getSlotWeekType("2026-05-08", fridaySlot, mondayAnchor, [])).toBe("B");
    expect(getSlotWeekType("2026-05-15", fridaySlot, mondayAnchor, [])).toBe("A");
    // 5/1 (金) を休講にすると 5/8 (B) は反転して A、5/15 (A) は反転して B になる
    const holidays = [
      { id: 1, date: "2026-05-01", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    expect(getSlotWeekType("2026-05-08", fridaySlot, mondayAnchor, holidays)).toBe("A");
    expect(getSlotWeekType("2026-05-15", fridaySlot, mondayAnchor, holidays)).toBe("B");
    // anchor 4/27 自体は月曜なので「金曜の休講」候補にはならない (= 月曜の休講は無視)
    const mondayHoliday = [
      { id: 1, date: "2026-04-27", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, mondayAnchor, mondayHoliday)).toBe("A");
  });

  it("テスト期間 (stopsClasses=true) も休講と同じくシフト対象", () => {
    // 5/8 が中3 対象のテスト期間 (授業停止) → 5/15 が A 週へ反転する
    const examPeriods = [
      {
        id: 1,
        name: "1学期中間テスト期間",
        startDate: "2026-05-08",
        endDate: "2026-05-08",
        targetGrades: ["中3"],
        stopsClasses: true,
      },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("A");
  });

  it("stopsClasses=false (高校テスト等) は授業継続扱いなのでシフト対象外", () => {
    // 5/8 が高校テスト (stopsClasses=false) → 5/15 は素のローテどおり B のまま
    const examPeriods = [
      {
        id: 1,
        name: "高校 1 学期中間",
        startDate: "2026-05-08",
        endDate: "2026-05-08",
        targetGrades: ["中3"], // 学年マッチでも stopsClasses=false なので無視
        stopsClasses: false,
      },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("B");
  });

  it("stopsClasses 未指定 (undefined) はデフォルトで授業停止 → シフト対象", () => {
    const examPeriods = [
      {
        id: 1,
        name: "X",
        startDate: "2026-05-08",
        endDate: "2026-05-08",
        targetGrades: ["中3"],
        // stopsClasses 未指定
      },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("A");
  });

  it("targetGrades が空のテスト期間は全学年対象 → シフト対象に含まれる", () => {
    const examPeriods = [
      {
        id: 1,
        name: "X",
        startDate: "2026-05-08",
        endDate: "2026-05-08",
        targetGrades: [],
        stopsClasses: true,
      },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("A");
  });

  it("targetGrades 指定でマッチしないテスト期間はシフト対象外", () => {
    const examPeriods = [
      {
        id: 1,
        name: "X",
        startDate: "2026-05-08",
        endDate: "2026-05-08",
        targetGrades: ["中2"], // 中3 slot にはマッチしない
        stopsClasses: true,
      },
    ];
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("B");
  });

  it("テスト期間の範囲が複数日に渡る場合、slot.day に当たる日だけカウント", () => {
    // 5/7 (木) - 5/11 (月) のテスト期間に 5/8 (金) が含まれる
    const examPeriods = [
      {
        id: 1,
        name: "X",
        startDate: "2026-05-07",
        endDate: "2026-05-11",
        targetGrades: [],
        stopsClasses: true,
      },
    ];
    // 金曜 slot のローテに影響するのは 5/8 (金) の 1 回だけ → 5/15 は A
    expect(getSlotWeekType("2026-05-15", fridaySlot, anchors, [], examPeriods)).toBe("A");
    // 5/22 はその次の金曜なので素ローテの A → B 反転
    expect(getSlotWeekType("2026-05-22", fridaySlot, anchors, [], examPeriods)).toBe("B");
  });

  it("isTeacherActiveOnDate / biweeklyDisplaySubject も同じ休講補正に従う", () => {
    const compositeSubjSlot = {
      ...fridaySlot,
      subj: "英/数",
      teacher: "堀上",
      note: "隔週(河野)",
    };
    const holidays = [
      { id: 1, date: "2026-05-08", label: "特訓", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 補正後の 5/15 は A 週なので主担当 堀上 が active、教科は先頭の "英"
    expect(isTeacherActiveOnDate(compositeSubjSlot, "堀上", "2026-05-15", anchors, holidays)).toBe(true);
    expect(isTeacherActiveOnDate(compositeSubjSlot, "河野", "2026-05-15", anchors, holidays)).toBe(false);
    expect(biweeklyDisplaySubject(compositeSubjSlot, "2026-05-15", anchors, holidays)).toBe("英");
    // holidays を渡さなければ素のローテどおり 5/15 = B、河野が active、教科は "数"
    expect(isTeacherActiveOnDate(compositeSubjSlot, "河野", "2026-05-15", anchors)).toBe(true);
    expect(biweeklyDisplaySubject(compositeSubjSlot, "2026-05-15", anchors)).toBe("数");
  });
});

describe("slotWeight", () => {
  it("returns 0.5 for biweekly notes", () => {
    expect(slotWeight("隔週(河野)")).toBe(0.5);
    expect(slotWeight("合同, 隔週")).toBe(0.5);
  });

  it("returns 1 for regular notes", () => {
    expect(slotWeight("合同")).toBe(1);
    expect(slotWeight("")).toBe(1);
    expect(slotWeight(null)).toBe(1);
    expect(slotWeight(undefined)).toBe(1);
  });
});

describe("weightedSlotCount", () => {
  it("sums weights correctly", () => {
    const slots = [
      { note: "" },
      { note: "隔週(河野)" },
      { note: "" },
      { note: "隔週(佐藤)" },
    ];
    expect(weightedSlotCount(slots)).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(weightedSlotCount([])).toBe(0);
  });

  it("returns integer for all-regular slots", () => {
    const slots = [{ note: "" }, { note: "合同" }, { note: "" }];
    expect(weightedSlotCount(slots)).toBe(3);
  });
});

describe("isSlotForTeacher", () => {
  it("matches direct teacher field", () => {
    expect(isSlotForTeacher({ teacher: "堀上", note: "" }, "堀上")).toBe(true);
  });

  it("matches biweekly partner in note", () => {
    expect(isSlotForTeacher({ teacher: "堀上", note: "隔週(川井)" }, "川井")).toBe(true);
  });

  it("matches individual teacher in multi-teacher field", () => {
    expect(isSlotForTeacher({ teacher: "香川·福江·川井", note: "プレップ" }, "川井")).toBe(true);
    expect(isSlotForTeacher({ teacher: "香川·福江·川井", note: "プレップ" }, "香川")).toBe(true);
    expect(isSlotForTeacher({ teacher: "香川·福江·川井", note: "プレップ" }, "福江")).toBe(true);
  });

  it("does not match unrelated teacher", () => {
    expect(isSlotForTeacher({ teacher: "堀上", note: "隔週(川井)" }, "河野")).toBe(false);
  });

  // IME の素の入力は "・" (U+30FB) / "･" (U+FF65) になる。正史の "·" しか
  // 見ないと、手入力の複数講師 (追加授業の担当など) が講師のスケジュール
  // から silent に欠落する。
  it("matches multi-teacher separated by full-width ・ (IME input)", () => {
    expect(isSlotForTeacher({ teacher: "香川・福江", note: "" }, "香川")).toBe(true);
    expect(isSlotForTeacher({ teacher: "香川・福江", note: "" }, "福江")).toBe(true);
    expect(isSlotForTeacher({ teacher: "香川・福江", note: "" }, "川井")).toBe(false);
  });

  it("matches multi-teacher separated by half-width ･ and trims spaces", () => {
    expect(isSlotForTeacher({ teacher: "香川･福江", note: "" }, "福江")).toBe(true);
    expect(isSlotForTeacher({ teacher: "香川 ・ 福江", note: "" }, "香川")).toBe(true);
  });

  it("does not throw on missing teacher field (Firebase 別クライアント由来)", () => {
    expect(isSlotForTeacher({ note: "" }, "堀上")).toBe(false);
  });

  it("handles null/empty note gracefully", () => {
    expect(isSlotForTeacher({ teacher: "堀上", note: null }, "堀上")).toBe(true);
    expect(isSlotForTeacher({ teacher: "堀上", note: undefined }, "堀上")).toBe(true);
    expect(isSlotForTeacher({ teacher: "堀上" }, "堀上")).toBe(true);
  });
});

describe("getSlotTeachers", () => {
  it("returns single teacher as array", () => {
    expect(getSlotTeachers({ teacher: "堀上" })).toEqual(["堀上"]);
  });

  it("splits multi-teacher field by ·", () => {
    expect(getSlotTeachers({ teacher: "香川·福江·川井" })).toEqual(["香川", "福江", "川井"]);
  });

  it("returns empty array for empty teacher", () => {
    expect(getSlotTeachers({ teacher: "" })).toEqual([]);
  });

  it("splits IME middle dots (・/･) and trims each name", () => {
    expect(getSlotTeachers({ teacher: "香川・福江" })).toEqual(["香川", "福江"]);
    expect(getSlotTeachers({ teacher: "香川 ･ 福江" })).toEqual(["香川", "福江"]);
  });
});

describe("isTeacherActiveOnDate", () => {
  const anchors = [{ date: "2026-04-06", weekType: "A" }];
  // id=3 相当: 堀上 が A 週に 英、河野 が B 週に 数 を担当
  const slot = { teacher: "堀上", note: "隔週(河野)", subj: "英/数" };

  it("non-biweekly slots always return true", () => {
    const plain = { teacher: "堀上", note: "", subj: "英語" };
    expect(isTeacherActiveOnDate(plain, "堀上", "2026-04-13", anchors)).toBe(true);
    expect(isTeacherActiveOnDate(plain, "河野", "2026-04-13", anchors)).toBe(true);
  });

  it("A 週 では slot.teacher が active、partner は inactive", () => {
    expect(isTeacherActiveOnDate(slot, "堀上", "2026-04-06", anchors)).toBe(true);
    expect(isTeacherActiveOnDate(slot, "河野", "2026-04-06", anchors)).toBe(false);
  });

  it("B 週 では partner が active、slot.teacher は inactive", () => {
    expect(isTeacherActiveOnDate(slot, "堀上", "2026-04-13", anchors)).toBe(false);
    expect(isTeacherActiveOnDate(slot, "河野", "2026-04-13", anchors)).toBe(true);
  });

  it("アンカー未設定 (weekType null) は両講師ともに true にフォールバック", () => {
    expect(isTeacherActiveOnDate(slot, "堀上", "2026-04-13", [])).toBe(true);
    expect(isTeacherActiveOnDate(slot, "河野", "2026-04-13", [])).toBe(true);
  });

  it("'·' 区切りの multi-teacher でも先頭集合内にあれば active", () => {
    const multi = { teacher: "香川·福江", note: "隔週(川井)", subj: "英/数" };
    expect(isTeacherActiveOnDate(multi, "香川", "2026-04-06", anchors)).toBe(true);
    expect(isTeacherActiveOnDate(multi, "福江", "2026-04-06", anchors)).toBe(true);
    expect(isTeacherActiveOnDate(multi, "川井", "2026-04-06", anchors)).toBe(false);
    expect(isTeacherActiveOnDate(multi, "川井", "2026-04-13", anchors)).toBe(true);
  });
});

describe("biweeklyDisplaySubject", () => {
  const anchors = [{ date: "2026-04-06", weekType: "A" }];

  it("複合教科 '英/数' の A 週 → 先頭 '英'", () => {
    const slot = { note: "隔週(河野)", subj: "英/数" };
    expect(biweeklyDisplaySubject(slot, "2026-04-06", anchors)).toBe("英");
  });

  it("複合教科 '英/数' の B 週 → 2 つ目 '数'", () => {
    const slot = { note: "隔週(河野)", subj: "英/数" };
    expect(biweeklyDisplaySubject(slot, "2026-04-13", anchors)).toBe("数");
  });

  it("非 biweekly はそのまま返す", () => {
    const slot = { note: "", subj: "英/数" };
    expect(biweeklyDisplaySubject(slot, "2026-04-06", anchors)).toBe("英/数");
  });

  it("単独教科 biweekly は subj をそのまま返す", () => {
    const slot = { note: "隔週(河野)", subj: "英語" };
    expect(biweeklyDisplaySubject(slot, "2026-04-06", anchors)).toBe("英語");
    expect(biweeklyDisplaySubject(slot, "2026-04-13", anchors)).toBe("英語");
  });

  it("アンカー未設定のときは先頭教科にフォールバック", () => {
    const slot = { note: "隔週(河野)", subj: "英/数" };
    expect(biweeklyDisplaySubject(slot, "2026-04-13", [])).toBe("英");
  });

  it("3 パート以上の複合 '英/数/国' は A→先頭, B→2 つ目を返す (3 つ目以降は未使用)", () => {
    const slot = { note: "隔週(河野)", subj: "英/数/国" };
    expect(biweeklyDisplaySubject(slot, "2026-04-06", anchors)).toBe("英");
    expect(biweeklyDisplaySubject(slot, "2026-04-13", anchors)).toBe("数");
  });

  it("subj が空のときは空文字を返す", () => {
    const slot = { note: "隔週(河野)", subj: "" };
    expect(biweeklyDisplaySubject(slot, "2026-04-06", anchors)).toBe("");
  });
});

describe("biweeklyActiveTeacher", () => {
  const anchors = [{ date: "2026-04-06", weekType: "A" }];

  it("非 biweekly は slot.teacher をそのまま返す", () => {
    const slot = { teacher: "堀上", note: "" };
    expect(biweeklyActiveTeacher(slot, "2026-04-13", anchors)).toBe("堀上");
  });

  it("A 週 → slot.teacher", () => {
    const slot = { teacher: "堀上", note: "隔週(川井)" };
    expect(biweeklyActiveTeacher(slot, "2026-04-06", anchors)).toBe("堀上");
  });

  it("B 週 → note の partner (川井)", () => {
    const slot = { teacher: "堀上", note: "隔週(川井)" };
    expect(biweeklyActiveTeacher(slot, "2026-04-13", anchors)).toBe("川井");
  });

  it("アンカー未設定のときは slot.teacher にフォールバック", () => {
    const slot = { teacher: "堀上", note: "隔週(川井)" };
    expect(biweeklyActiveTeacher(slot, "2026-04-13", [])).toBe("堀上");
  });

  it("teacher と partner が逆順のスロットでも A 週は slot.teacher", () => {
    // 中1AB: teacher=川井, partner=堀上 の A 週 → 川井
    const slot = { teacher: "川井", note: "隔週(堀上)" };
    expect(biweeklyActiveTeacher(slot, "2026-04-06", anchors)).toBe("川井");
  });
});

describe("formatCount", () => {
  it("formats integers without decimal", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(0)).toBe("0");
  });

  it("formats fractional values with one decimal", () => {
    expect(formatCount(7.5)).toBe("7.5");
    expect(formatCount(3.0)).toBe("3");
  });
});
