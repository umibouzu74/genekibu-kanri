import { describe, expect, it } from "vitest";
import {
  describeExtraLesson,
  extraLessonsOnDate,
  extraLessonsForTeacherOnDate,
  indexExtraLessonsByDate,
  upcomingExtraLessons,
} from "./extraLessons";

const L = (id, date, time, teacher, over = {}) => ({
  id,
  date,
  time,
  grade: "中3",
  subj: "英語",
  teacher,
  ...over,
});

const lessons = [
  L(1, "2026-07-25", "19:00-20:00", "堀上"),
  L(2, "2026-07-25", "17:00-18:00", "香川·福江·川井", { subj: "プレップ", label: "夏期講習" }),
  L(3, "2026-07-28", "19:00-20:00", "堀上"),
  L(4, "2026-08-01", "10:00-11:00", "田中", { grade: "中1" }),
  // IME の全角中点で手入力された複数講師 (プレップの実例)。正規化前の
  // 既存データでも講師スケジュールに出ることを固定する。
  L(5, "2026-07-28", "17:00-18:00", "香川・福江", { subj: "プレップ", label: "夏期講習" }),
];

describe("extraLessonsOnDate", () => {
  it("指定日の追加授業を開始時刻順で返す", () => {
    const out = extraLessonsOnDate(lessons, "2026-07-25");
    expect(out.map((l) => l.id)).toEqual([2, 1]);
  });

  it("該当なし / 引数不正は空配列", () => {
    expect(extraLessonsOnDate(lessons, "2026-01-01")).toEqual([]);
    expect(extraLessonsOnDate(null, "2026-07-25")).toEqual([]);
    expect(extraLessonsOnDate(lessons, "")).toEqual([]);
  });
});

describe("extraLessonsForTeacherOnDate", () => {
  it("全角中点 (・) 区切りの複数講師も各講師のスケジュールに出る", () => {
    expect(extraLessonsForTeacherOnDate(lessons, "香川", "2026-07-28").map((l) => l.id)).toEqual([5]);
    expect(extraLessonsForTeacherOnDate(lessons, "福江", "2026-07-28").map((l) => l.id)).toEqual([5]);
    expect(indexExtraLessonsByDate(lessons, "福江").get("2026-07-28").map((l) => l.id)).toEqual([5]);
  });

  it("担当講師の分だけ返す (完全一致)", () => {
    const out = extraLessonsForTeacherOnDate(lessons, "堀上", "2026-07-25");
    expect(out.map((l) => l.id)).toEqual([1]);
  });

  it('"·" 区切りの複数講師でもマッチする (Slot と同じ規則)', () => {
    const out = extraLessonsForTeacherOnDate(lessons, "福江", "2026-07-25");
    expect(out.map((l) => l.id)).toEqual([2]);
  });
});

describe("indexExtraLessonsByDate", () => {
  it("日付 → 時刻順リストの Map を返す (teacher 指定で絞り込み)", () => {
    const all = indexExtraLessonsByDate(lessons);
    expect([...all.keys()].sort()).toEqual(["2026-07-25", "2026-07-28", "2026-08-01"]);
    expect(all.get("2026-07-25").map((l) => l.id)).toEqual([2, 1]);

    const forTeacher = indexExtraLessonsByDate(lessons, "堀上");
    expect(forTeacher.get("2026-07-25").map((l) => l.id)).toEqual([1]);
    expect(forTeacher.has("2026-08-01")).toBe(false);
  });

  it("入力不正は空 Map", () => {
    expect(indexExtraLessonsByDate(null).size).toBe(0);
  });
});

describe("teacher フィールド欠落への防御 (校正レビュー 2026-07-03)", () => {
  // isSlotForTeacher は slot.teacher.includes を無ガードで呼ぶため、
  // Firebase 別クライアント書込等で teacher 欠落レコードが state に届いても
  // ヘルパ側の正規化で throw しないことを固定する。
  const broken = [{ id: 1, date: "2026-07-25", time: "19:00-20:00", grade: "中3", subj: "英語" }];
  it("teacher が undefined のレコードでも throw せず単に非マッチになる", () => {
    expect(() => extraLessonsForTeacherOnDate(broken, "堀上", "2026-07-25")).not.toThrow();
    expect(extraLessonsForTeacherOnDate(broken, "堀上", "2026-07-25")).toEqual([]);
    expect(() =>
      upcomingExtraLessons(broken, { teacher: "堀上", winStartStr: "2026-07-01", winEndStr: "2026-07-31" })
    ).not.toThrow();
    expect(indexExtraLessonsByDate(broken, "堀上").size).toBe(0);
  });
});

describe("upcomingExtraLessons", () => {
  it("期間内を日付順 → 時刻順で返す", () => {
    const out = upcomingExtraLessons(lessons, {
      winStartStr: "2026-07-25",
      winEndStr: "2026-07-31",
    });
    expect(out.map((l) => l.id)).toEqual([2, 1, 5, 3]);
  });

  it("teacher 指定でその講師の分に絞る", () => {
    const out = upcomingExtraLessons(lessons, {
      teacher: "堀上",
      winStartStr: "2026-07-01",
      winEndStr: "2026-08-31",
    });
    expect(out.map((l) => l.id)).toEqual([1, 3]);
  });

  it("期間未指定は空配列", () => {
    expect(upcomingExtraLessons(lessons, {})).toEqual([]);
  });
});

describe("describeExtraLesson", () => {
  it('grade + cls + subj の短いラベルを返す ("-" cls は省く)', () => {
    expect(describeExtraLesson({ grade: "中3", cls: "A", subj: "英語" })).toBe("中3A 英語");
    expect(describeExtraLesson({ grade: "中3", cls: "-", subj: "英語" })).toBe("中3 英語");
    expect(describeExtraLesson({ grade: "高1", subj: "数学" })).toBe("高1 数学");
    expect(describeExtraLesson(null)).toBe("");
  });
});
