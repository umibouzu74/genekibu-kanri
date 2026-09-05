import { describe, expect, it } from "vitest";
import {
  classifyDayHolidays,
  describeHolidayTargets,
  examClassExceptionsOnDate,
  examPeriodStopsClassesOn,
  formatHolidayRange,
  holidayAppliesTo,
  isBroadHoliday,
  isExamClassExceptionFor,
  isSlotCancelledForBiweeklyShift,
  isSlotOffOnDate,
} from "./scheduleHelpers";

const baseSlot = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "高1",
  cls: "S",
  room: "601",
  subj: "数学",
  teacher: "山田",
};

describe("isSlotOffOnDate", () => {
  describe("holiday.scope", () => {
    it("scope=['全部'] は中高両学年を off にする", () => {
      const holidays = [{ date: "2026-05-04", scope: ["全部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中1" }, "2026-05-04", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高3" }, "2026-05-04", holidays, [])
      ).toBe(true);
    });

    it("scope=['中学部'] は高校部スロットには効かない", () => {
      const holidays = [{ date: "2026-06-01", scope: ["中学部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中2" }, "2026-06-01", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-01", holidays, [])
      ).toBe(false);
    });

    it("scope=['高校部'] は附中(中学部)には効かない", () => {
      const holidays = [{ date: "2026-06-02", scope: ["高校部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "附中1" }, "2026-06-02", holidays, [])
      ).toBe(false);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-02", holidays, [])
      ).toBe(true);
    });

    it("scope が未指定のときはデフォルト ['全部']", () => {
      const holidays = [{ date: "2026-05-04" }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中1" }, "2026-05-04", holidays, [])
      ).toBe(true);
    });
  });

  describe("targetGrades", () => {
    it("targetGrades=[] なら scope 合致の全学年が off", () => {
      const holidays = [{ date: "2026-06-03", scope: ["全部"], targetGrades: [] }];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-03", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "中3" }, "2026-06-03", holidays, [])
      ).toBe(true);
    });

    it("targetGrades=['高1'] は高2には効かない", () => {
      const holidays = [
        { date: "2026-06-03", scope: ["全部"], targetGrades: ["高1"] },
      ];
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-06-03", holidays, [])
      ).toBe(true);
      expect(
        isSlotOffOnDate({ ...baseSlot, grade: "高2" }, "2026-06-03", holidays, [])
      ).toBe(false);
    });
  });

  describe("subjKeywords", () => {
    it('subjKeywords=["高松西"] + subj="高松西対策" → off', () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "高松西対策" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(true);
    });

    it('subjKeywords=["高松西"] + subj="英語" → マッチせず', () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "英語" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(false);
    });

    it("slot.subj が falsy なら subjKeywords 指定時に off でない", () => {
      const holidays = [
        { date: "2026-06-04", scope: ["高校部"], subjKeywords: ["高松西"] },
      ];
      expect(
        isSlotOffOnDate(
          { ...baseSlot, grade: "高1", subj: "" },
          "2026-06-04",
          holidays,
          []
        )
      ).toBe(false);
    });
  });

  describe("日付不一致", () => {
    it("holiday.date が dateStr と違えば影響しない", () => {
      const holidays = [{ date: "2026-05-04", scope: ["全部"] }];
      expect(
        isSlotOffOnDate({ ...baseSlot }, "2026-05-05", holidays, [])
      ).toBe(false);
    });
  });

  describe("examPeriods", () => {
    it("区間内 + targetGrades=[] → 全学年 off", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: [] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        true
      );
      expect(isSlotOffOnDate({ ...baseSlot, grade: "中2" }, "2026-07-03", [], ep)).toBe(
        true
      );
    });

    it("区間内 + targetGrades に該当学年 → off", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: ["高1"] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        true
      );
    });

    it("区間内 + targetGrades に該当しない → off でない", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: ["高3"] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot, grade: "高1" }, "2026-07-03", [], ep)).toBe(
        false
      );
    });

    it("区間外 → off でない", () => {
      const ep = [
        { startDate: "2026-07-01", endDate: "2026-07-05", targetGrades: [] },
      ];
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-06-30", [], ep)).toBe(false);
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-07-06", [], ep)).toBe(false);
    });
  });

  describe("引数 undefined 耐性", () => {
    it("holidays / examPeriods が undefined でも false を返す", () => {
      expect(isSlotOffOnDate({ ...baseSlot }, "2026-05-04", undefined, undefined)).toBe(
        false
      );
    });
  });
});

// テスト期間中でも例外的に授業を行う日 (特訓は始まっているが休講にしない日)。
describe("classExceptions (例外的に授業を行う日)", () => {
  const ep = {
    id: 1,
    name: "2学期中間テスト期間",
    startDate: "2026-09-14",
    endDate: "2026-09-25",
    targetGrades: ["中1", "中2", "中3"],
    stopsClasses: true,
    classExceptions: [{ date: "2026-09-19", grades: ["中3"], memo: "土曜のみ実施" }],
  };

  it("例外日 + 該当学年は授業停止にしない", () => {
    expect(examPeriodStopsClassesOn(ep, "2026-09-19", "中3")).toBe(false);
    expect(
      isSlotOffOnDate({ ...baseSlot, grade: "中3" }, "2026-09-19", [], [ep])
    ).toBe(false);
  });

  it("例外日でも grades に無い学年は従来どおり休止", () => {
    expect(examPeriodStopsClassesOn(ep, "2026-09-19", "中1")).toBe(true);
    expect(
      isSlotOffOnDate({ ...baseSlot, grade: "中1" }, "2026-09-19", [], [ep])
    ).toBe(true);
  });

  it("例外日以外は該当学年でも休止", () => {
    expect(examPeriodStopsClassesOn(ep, "2026-09-18", "中3")).toBe(true);
    expect(
      isSlotOffOnDate({ ...baseSlot, grade: "中3" }, "2026-09-18", [], [ep])
    ).toBe(true);
  });

  it("grades 未指定 / 空 は対象学年すべてで授業あり", () => {
    const all = {
      ...ep,
      classExceptions: [{ date: "2026-09-19" }],
    };
    expect(examPeriodStopsClassesOn(all, "2026-09-19", "中1")).toBe(false);
    expect(examPeriodStopsClassesOn(all, "2026-09-19", "中3")).toBe(false);
    expect(isExamClassExceptionFor(all, "2026-09-19", "中2")).toBe(true);
  });

  it("休講 (holiday) は例外日でも休講のまま", () => {
    const holidays = [{ date: "2026-09-19", scope: ["全部"] }];
    expect(
      isSlotOffOnDate({ ...baseSlot, grade: "中3" }, "2026-09-19", holidays, [ep])
    ).toBe(true);
  });

  it("例外日は隔週ローテーションを送らない (授業を行う週なので)", () => {
    const slot = { ...baseSlot, grade: "中3" };
    expect(isSlotCancelledForBiweeklyShift(slot, "2026-09-19", [], [ep])).toBe(false);
    expect(isSlotCancelledForBiweeklyShift(slot, "2026-09-18", [], [ep])).toBe(true);
  });

  it("classExceptions 未設定のテスト期間は従来どおり", () => {
    const plain = { ...ep, classExceptions: undefined };
    expect(examPeriodStopsClassesOn(plain, "2026-09-19", "中3")).toBe(true);
    expect(isExamClassExceptionFor(plain, "2026-09-19", "中3")).toBe(false);
  });

  it("stopsClasses=false のテスト期間では例外日の有無に関わらず授業継続", () => {
    const display = { ...ep, stopsClasses: false };
    expect(examPeriodStopsClassesOn(display, "2026-09-18", "中3")).toBe(false);
    expect(examClassExceptionsOnDate([display], "2026-09-19")).toEqual([]);
  });
});

describe("examClassExceptionsOnDate", () => {
  const ep = {
    id: 1,
    name: "2学期中間テスト期間",
    startDate: "2026-09-14",
    endDate: "2026-09-25",
    targetGrades: ["中1", "中2", "中3"],
    classExceptions: [{ date: "2026-09-19", grades: ["中3"] }],
  };

  it("該当日の例外を返す", () => {
    const got = examClassExceptionsOnDate([ep], "2026-09-19");
    expect(got).toHaveLength(1);
    expect(got[0].grades).toEqual(["中3"]);
    expect(got[0].ep.id).toBe(1);
  });

  it("grades 空の例外はテスト期間の対象学年に展開する", () => {
    const all = { ...ep, classExceptions: [{ date: "2026-09-19" }] };
    expect(examClassExceptionsOnDate([all], "2026-09-19")[0].grades).toEqual([
      "中1",
      "中2",
      "中3",
    ]);
  });

  it("該当しない日 / 期間外 / 空入力は空配列", () => {
    expect(examClassExceptionsOnDate([ep], "2026-09-18")).toEqual([]);
    expect(examClassExceptionsOnDate([ep], "2026-10-01")).toEqual([]);
    expect(examClassExceptionsOnDate(undefined, "2026-09-19")).toEqual([]);
  });
});

const hol = (over = {}) => ({
  id: 1,
  date: "2026-05-01",
  label: "休",
  scope: ["全部"],
  targetGrades: [],
  subjKeywords: [],
  ...over,
});

describe("holidayAppliesTo (休講 1 件の適用判定)", () => {
  it("scope=全部 で学年・教科の絞りが無ければ何にでも当たる", () => {
    expect(holidayAppliesTo(hol(), "高1", "数学")).toBe(true);
    expect(holidayAppliesTo(hol(), "中2", undefined)).toBe(true);
  });
  it("部で絞ると他の部には当たらない (附中は中学部)", () => {
    const h = hol({ scope: ["中学部"] });
    expect(holidayAppliesTo(h, "中2", "数学")).toBe(true);
    expect(holidayAppliesTo(h, "附中", "数学")).toBe(true);
    expect(holidayAppliesTo(h, "高1", "数学")).toBe(false);
  });
  it("学年で絞ると完全一致だけ (複合学年 中1-3 には当てない)", () => {
    const h = hol({ targetGrades: ["中3"] });
    expect(holidayAppliesTo(h, "中3", "数学")).toBe(true);
    expect(holidayAppliesTo(h, "中1-3", "数学")).toBe(false);
  });
  it("教科キーワードは部分一致。subj 未指定のコマには当てない", () => {
    const h = hol({ subjKeywords: ["高松西"] });
    expect(holidayAppliesTo(h, "高1", "英語(高松西)")).toBe(true);
    expect(holidayAppliesTo(h, "高1", "数学")).toBe(false);
    expect(holidayAppliesTo(h, "高1", undefined)).toBe(false);
  });
  it("scope / targetGrades / subjKeywords が欠けた旧データも読める", () => {
    expect(holidayAppliesTo({ id: 9, date: "2026-05-01", label: "x" }, "高1", "数学")).toBe(true);
    expect(holidayAppliesTo(null, "高1", "数学")).toBe(false);
  });
});

describe("classifyDayHolidays (全日 / 部 / 学年・教科限定)", () => {
  it("何も無ければ休みなし", () => {
    expect(classifyDayHolidays([])).toEqual({
      fullOff: false,
      offDepts: [],
      granularHols: [],
      hasPartial: false,
    });
    expect(classifyDayHolidays(undefined).fullOff).toBe(false);
  });
  it("scope=全部 かつ絞りなしが 1 件でもあれば全日休講", () => {
    const r = classifyDayHolidays([hol({ scope: ["中学部"] }), hol({ id: 2 })]);
    expect(r.fullOff).toBe(true);
    expect(r.hasPartial).toBe(false);
  });
  it("部単位の休みは offDepts に部名で出る (全部は除く・重複は畳む)", () => {
    const r = classifyDayHolidays([
      hol({ scope: ["中学部"] }),
      hol({ id: 2, scope: ["中学部", "高校部"] }),
    ]);
    expect(r.fullOff).toBe(false);
    expect(r.offDepts).toEqual(["中学部", "高校部"]);
    expect(r.granularHols).toEqual([]);
    expect(r.hasPartial).toBe(true);
  });
  it("学年か教科で絞られた休講は granularHols (scope=全部 でも全日にしない)", () => {
    const g = hol({ targetGrades: ["中3"] });
    const k = hol({ id: 2, subjKeywords: ["高松西"] });
    const r = classifyDayHolidays([g, k]);
    expect(r.fullOff).toBe(false);
    expect(r.offDepts).toEqual([]);
    expect(r.granularHols).toEqual([g, k]);
    expect(r.hasPartial).toBe(true);
  });
  it("isBroadHoliday は学年・教科の絞りが無いものだけ true", () => {
    expect(isBroadHoliday(hol({ scope: ["高校部"] }))).toBe(true);
    expect(isBroadHoliday(hol({ targetGrades: ["中3"] }))).toBe(false);
    expect(isBroadHoliday({ id: 1 })).toBe(true);
  });
});

describe("休講の範囲表示", () => {
  it("describeHolidayTargets は学年と教科を中黒で並べる", () => {
    expect(describeHolidayTargets(hol({ targetGrades: ["中3"], subjKeywords: ["高松西"] }))).toBe(
      "中3・高松西"
    );
    expect(describeHolidayTargets(hol())).toBe("");
  });
  it("formatHolidayRange は 部 / 学年 / 教科 を並べ、既定で「全部」を省く", () => {
    expect(formatHolidayRange(hol())).toBe("");
    expect(formatHolidayRange(hol(), { includeAll: true })).toBe("全部");
    expect(
      formatHolidayRange(hol({ scope: ["中学部"], targetGrades: ["中3"], subjKeywords: ["高松西"] }))
    ).toBe("中学部 / 中3 / 高松西");
    expect(formatHolidayRange(hol({ scope: ["中学部", ""] }))).toBe("中学部");
  });
});
