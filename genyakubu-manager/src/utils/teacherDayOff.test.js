import { describe, expect, it } from "vitest";
import {
  summarizeTeacherDayOff,
  teacherAwayReason,
} from "./teacherDayOff";

describe("teacherAwayReason", () => {
  const teacher = "堀上";

  it("自分のコマを別人が代行するなら手を離れている", () => {
    expect(
      teacherAwayReason({
        teacher,
        sub: { originalTeacher: teacher, substitute: "河野" },
      })
    ).toBe("sub");
  });

  it("自分が代行に入る側なら手を離れていない", () => {
    expect(
      teacherAwayReason({
        teacher,
        sub: { originalTeacher: "河野", substitute: teacher },
      })
    ).toBe(null);
  });

  it("合同で吸収されたら手を離れている", () => {
    expect(teacherAwayReason({ teacher, absorbed: true })).toBe("combine");
  });

  it("他日へ振り替えたら手を離れている", () => {
    expect(
      teacherAwayReason({ teacher, rescheduledOut: { targetDate: "2026-12-04" } })
    ).toBe("reschedule");
  });

  it("振替先の担当が自分なら日が変わるだけなので手を離れていない", () => {
    expect(
      teacherAwayReason({
        teacher,
        rescheduledOut: { targetDate: "2026-12-04", targetTeacher: teacher },
      })
    ).toBe(null);
  });

  it("何も無ければ担当のまま", () => {
    expect(teacherAwayReason({ teacher })).toBe(null);
  });
});

describe("summarizeTeacherDayOff", () => {
  it("全部同じ理由なら理由つきの見出しを返す", () => {
    expect(summarizeTeacherDayOff(["sub", "sub"])).toEqual({
      off: true,
      reason: "sub",
      label: "代 代行で休み",
    });
    expect(summarizeTeacherDayOff(["reschedule"]).label).toBe("↻ 振替で休み");
    expect(summarizeTeacherDayOff(["combine"]).label).toBe("合 合同で休み");
  });

  it("理由が混ざったら一括の見出しにする", () => {
    expect(summarizeTeacherDayOff(["sub", "reschedule"])).toEqual({
      off: true,
      reason: "mixed",
      label: "この日は担当なし",
    });
  });

  it("1 コマでも担当が残れば休みではない", () => {
    expect(summarizeTeacherDayOff(["sub", null]).off).toBe(false);
  });

  it("その日に残る仕事 (他人の代行・振替で入るコマなど) があれば休みではない", () => {
    expect(summarizeTeacherDayOff(["sub"], 1).off).toBe(false);
  });

  it("元々コマの無い日は休みと言わない", () => {
    expect(summarizeTeacherDayOff([]).off).toBe(false);
  });
});
