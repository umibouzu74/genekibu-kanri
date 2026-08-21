import { describe, expect, it } from "vitest";
import {
  monthlyTally,
  staffMonthlyAbsenceDates,
  staffMonthlyPendingAbsenceDates,
  staffMonthlyRegularDates,
} from "./staffHelpers";

// 2026-07: 7 は火曜。中1 火曜のコマを 1 つだけ持つ講師で数える。
const slot = {
  id: 1,
  day: "火",
  time: "18:55-19:40",
  grade: "中1",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "香川",
  note: "",
  timetableId: 1,
};
const slots = [slot];

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-07-18", grades: [] },
];
const CUTOFF = {
  groups: [{ label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-07-18" }],
  cohorts: [],
};

describe("staffMonthlyRegularDates", () => {
  it("opts 無しは従来どおり曜日 + 休講だけで数える", () => {
    const july = staffMonthlyRegularDates(slots, "香川", [], 2026, 7);
    expect(july).toEqual([
      "2026-07-07",
      "2026-07-14",
      "2026-07-21",
      "2026-07-28",
    ]);
    // 通常授業が終わった 8 月も曜日だけで数えてしまう (これが従来の挙動)
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 8)).toHaveLength(4);
  });

  it("時間割の有効期間と表示期間を渡すと終講後の日は数えない", () => {
    const opts = { timetables: TIMETABLES, displayCutoff: CUTOFF };
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 7, [], opts)).toEqual([
      "2026-07-07",
      "2026-07-14",
    ]);
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 8, [], opts)).toEqual([]);
  });

  it("開講前 (表示期間の開始日より前) の日も数えない", () => {
    const opts = { timetables: TIMETABLES, displayCutoff: CUTOFF };
    // 4/7 開講なので 3 月は 0 日
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 3, [], opts)).toEqual([]);
  });

  it("コース別終講日 (cohorts) も効く", () => {
    const opts = {
      timetables: TIMETABLES,
      displayCutoff: {
        ...CUTOFF,
        cohorts: [{ id: "M|中1|火", label: "中1 火", grade: "中1", date: "2026-07-07" }],
      },
    };
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 7, [], opts)).toEqual([
      "2026-07-07",
    ]);
  });

  it("休講日とテスト期間は従来どおり外す", () => {
    const holidays = [{ id: 1, date: "2026-07-07", label: "休講", scope: ["全部"] }];
    const examPeriods = [
      { id: 1, name: "期末", startDate: "2026-07-14", endDate: "2026-07-14", targetGrades: ["中1"] },
    ];
    const opts = { timetables: TIMETABLES, displayCutoff: CUTOFF };
    expect(
      staffMonthlyRegularDates(slots, "香川", holidays, 2026, 7, examPeriods, opts)
    ).toEqual([]);
  });

  it("特別時程の部分休講 (その日そのコマがカット) も外す", () => {
    const opts = {
      timetables: TIMETABLES,
      displayCutoff: CUTOFF,
      daySchedules: [
        {
          id: 1,
          date: "2026-07-07",
          targetGrades: ["中1"],
          timeMap: [],
          cancelTimes: ["18:55-19:40"],
          memo: "",
        },
      ],
    };
    expect(staffMonthlyRegularDates(slots, "香川", [], 2026, 7, [], opts)).toEqual([
      "2026-07-14",
    ]);
  });
});

describe("staffMonthlyPendingAbsenceDates", () => {
  const subs = [
    // 代行未定のまま登録した欠勤
    { id: 1, date: "2026-07-07", slotId: 1, originalTeacher: "香川", substitute: "", status: "requested" },
    // 代行が確定した欠勤
    { id: 2, date: "2026-07-14", slotId: 1, originalTeacher: "香川", substitute: "福江", status: "confirmed" },
    // 別の講師
    { id: 3, date: "2026-07-21", slotId: 2, originalTeacher: "堀上", substitute: "", status: "requested" },
    // 別の月
    { id: 4, date: "2026-08-04", slotId: 1, originalTeacher: "香川", substitute: "", status: "requested" },
  ];

  it("代行者が未定の日だけを返す", () => {
    expect(staffMonthlyPendingAbsenceDates(subs, "香川", 2026, 7)).toEqual([
      "2026-07-07",
    ]);
  });

  it("代行が確定した日は「代行された日」の方に出る (二重に数えない)", () => {
    expect(staffMonthlyAbsenceDates(subs, "香川", 2026, 7)).toEqual([
      "2026-07-14",
    ]);
  });
});

describe("代行なしで確定した欠勤の扱い", () => {
  // 3 人担当のプレップで 1 人休み、代行は立てず残りで回す = 代行なしで確定。
  const nosub = {
    id: 9,
    date: "2026-07-11",
    slotId: 5,
    originalTeacher: "香川",
    substitute: "",
    status: "confirmed",
  };

  it("「代行された日」には数えない (代行者が付いていないため)", () => {
    expect(staffMonthlyAbsenceDates([nosub], "香川", 2026, 7)).toEqual([]);
  });

  it("欠勤の日としては出す", () => {
    expect(staffMonthlyPendingAbsenceDates([nosub], "香川", 2026, 7)).toEqual([
      "2026-07-11",
    ]);
  });

  it("月次の「代行した / された」件数にも入れない", () => {
    expect(monthlyTally([nosub], 2026, 7)).toEqual({ covered: {}, coveredFor: {} });
    // 代行者が付いて確定したものだけ数える
    expect(
      monthlyTally([{ ...nosub, substitute: "杉原" }], 2026, 7)
    ).toEqual({ covered: { 杉原: 1 }, coveredFor: { 香川: 1 } });
  });
});
