import { describe, expect, it } from "vitest";
import {
  HOLIDAY_NO_DEPT_LABEL,
  describeExamTargetGrades,
  describeHolidayScope,
} from "./eventTargets";

describe("describeHolidayScope", () => {
  it("既定は「部門 学年・学年 キーワード」(群は空白、群の中は「・」)", () => {
    expect(describeHolidayScope({ scope: ["全部"] })).toBe("全部");
    expect(describeHolidayScope({ scope: ["中学部"], targetGrades: ["中3"] })).toBe("中学部 中3");
    expect(
      describeHolidayScope({
        scope: ["高校部"],
        targetGrades: ["高1", "高2"],
        subjKeywords: ["共テ", "数学"],
      })
    ).toBe("高校部 高1・高2 共テ・数学");
  });

  it("scope が無い旧データは「全部」", () => {
    expect(describeHolidayScope({})).toBe("全部");
    expect(describeHolidayScope({}, { short: true })).toBe("");
  });

  it("scope が空配列はどの部門にも効かないので「全部」と書かない", () => {
    expect(describeHolidayScope({ scope: [] })).toBe(HOLIDAY_NO_DEPT_LABEL);
    expect(describeHolidayScope({ scope: [] }, { short: true })).toBe(HOLIDAY_NO_DEPT_LABEL);
  });

  it("short: 学校全体は空、学年を指定していれば部門を省く", () => {
    const short = (h) => describeHolidayScope(h, { short: true });
    expect(short({ scope: ["全部"], targetGrades: [], subjKeywords: [] })).toBe("");
    expect(short({ scope: ["高校部"] })).toBe("高校部");
    expect(short({ scope: ["中学部", "高校部"] })).toBe("中学部・高校部");
    expect(short({ scope: ["中学部"], targetGrades: ["中3"] })).toBe("中3");
    expect(
      short({ scope: ["高校部"], targetGrades: ["高1", "高2"], subjKeywords: ["英語"] })
    ).toBe("高1・高2 英語");
    // 学年は全学年のまま科目だけで絞った形 (取込データなど) も部門 + 科目で言う
    expect(short({ scope: ["高校部"], subjKeywords: ["英語"] })).toBe("高校部 英語");
  });
});

describe("describeExamTargetGrades", () => {
  it("対象学年を「・」で並べ、空は全学年", () => {
    expect(describeExamTargetGrades({ targetGrades: ["中1", "中2", "中3"] })).toBe("中1・中2・中3");
    expect(describeExamTargetGrades({ targetGrades: [] })).toBe("全学年");
    expect(describeExamTargetGrades({})).toBe("全学年");
  });

  it("short: 全学年は空 (チップにラベルを出さない)", () => {
    expect(describeExamTargetGrades({ targetGrades: [] }, { short: true })).toBe("");
    expect(describeExamTargetGrades({ targetGrades: ["中3"] }, { short: true })).toBe("中3");
  });
});
