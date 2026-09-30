import { describe, expect, it } from "vitest";
import { buildFuzokuMonth, isPatternAtOddsWithBus, monthRange } from "./fuzokuBoard";
import { PATTERN } from "./fuzokuPlan";
import { makeEventHelpers } from "../components/views/dashboardHelpers";

// 附属の水曜 (data.js の INIT_SLOTS と同じ並び) + 同じ水曜の中3 (石原)
const S = (id, time, grade, subj, teacher, over = {}) => ({
  id,
  day: "水",
  time,
  grade,
  cls: "-",
  room: grade === "附中" ? "402" : `40${grade.slice(-1)}`,
  subj,
  teacher,
  note: "",
  ...over,
});
const FUZOKU = [
  S(36, "16:25-17:25", "附中1", "理科", "武下"),
  S(37, "16:25-17:25", "附中2", "英語", "石原"),
  S(38, "16:25-17:25", "附中3", "数学", "片岡"),
  S(39, "17:35-18:35", "附中1", "英語", "石原"),
  S(40, "17:35-18:35", "附中2", "数学", "片岡"),
  S(41, "17:35-18:35", "附中3", "理科", "滝澤"),
  S(42, "18:45-19:45", "附中1", "国語", "松川"),
  S(43, "18:45-19:45", "附中2", "理科", "滝澤"),
  S(44, "18:45-19:45", "附中3", "英語", "石原"),
  S(45, "19:55-20:55", "附中1", "数学", "片岡"),
  S(46, "19:55-20:55", "附中2", "国語", "小松"),
  S(47, "19:55-20:55", "附中3", "国語", "松川"),
  S(250, "21:00-21:30", "附中", "確認テスト", "松川"),
];
// 16:25 の授業と重ならないが、50分授業 (17:00-17:50) にすると石原が重なる
const CHU3 = S(99, "17:40-18:30", "中3", "英語", "石原", { cls: "S", room: "501" });
const SLOTS = [...FUZOKU, CHU3];

const OCT_WEDS = ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"];

function makeCtx({
  slots = SLOTS,
  holidays = [],
  examPeriods = [],
  daySchedules = [],
  adjustments = [],
  displayCutoff = null,
  timetables = [],
} = {}) {
  const h = makeEventHelpers(holidays, examPeriods, []);
  return {
    classSets: [],
    allSlots: slots,
    displayCutoff,
    timetables,
    isOffForGrade: h.isOffForGrade,
    biweeklyAnchors: [],
    holidays,
    examPeriods,
    sessionOverrides: [],
    daySchedules,
    adjustments,
    orientationOnFirstDay: true,
  };
}

function build({ year = 2026, month = 10, slots = SLOTS, fuzokuPlan, specialEvents, extraLessons, ...ctxOpts } = {}) {
  return buildFuzokuMonth({
    year,
    month,
    slots,
    ctx: makeCtx({ slots, ...ctxOpts }),
    fuzokuPlan,
    specialEvents,
    extraLessons,
  });
}
const week = (m, date) => m.weeks.find((w) => w.date === date);
const cell = (w, row, grade) => w.rows[row].cells[grade][0];

const COMPRESS = {
  id: 1,
  date: "2026-10-28",
  label: "附属 50分授業 (17:00開始)",
  targetGrades: ["附中", "附中1", "附中2", "附中3"],
  timeMap: [
    { from: "16:25-17:25", to: "17:00-17:50" },
    { from: "17:35-18:35", to: "18:00-18:50" },
    { from: "18:45-19:45", to: "19:00-19:50" },
    { from: "19:55-20:55", to: "20:00-20:50" },
  ],
  cancelTimes: [],
  memo: "",
};

describe("monthRange", () => {
  it("月の初日と末日", () => {
    expect(monthRange(2026, 2)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange(2026, 10)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
});

describe("buildFuzokuMonth: 日付と学年", () => {
  it("附属の授業がある曜日 (水) だけを並べ、学年は附中1〜3", () => {
    const m = build();
    expect(m.dates).toEqual(OCT_WEDS);
    expect(m.grades).toEqual(["附中1", "附中2", "附中3"]);
  });

  it("通常の週: 4 限 + 確認テスト、時刻はコマのまま", () => {
    const w = week(build(), "2026-10-07");
    expect(w.pattern.kind).toBe(PATTERN.NORMAL);
    expect(w.rows.map((r) => [r.label, r.time])).toEqual([
      ["1限", "16:25-17:25"],
      ["2限", "17:35-18:35"],
      ["3限", "18:45-19:45"],
      ["4限", "19:55-20:55"],
    ]);
    expect(cell(w, 0, "附中2")).toMatchObject({ status: "held", slot: { subj: "英語" } });
    expect(w.testRow).toMatchObject({ time: "21:00-21:30", status: "held" });
    expect(w.anyHeld).toBe(true);
    expect(w.conflicts).toEqual([]);
  });

  it("時間割の期間外の日は並べない", () => {
    const slots = SLOTS.map((s) => ({ ...s, timetableId: 2 }));
    const m = build({
      slots,
      timetables: [{ id: 2, name: "2学期", type: "regular", startDate: "2026-10-10", endDate: null, grades: [] }],
    });
    expect(m.dates).toEqual(["2026-10-14", "2026-10-21", "2026-10-28"]);
  });
});

describe("buildFuzokuMonth: 時程", () => {
  it("50分授業の日は読み替え後の時刻で並び、新しい講師の重なりを出す", () => {
    const w = week(build({ daySchedules: [COMPRESS] }), "2026-10-28");
    expect(w.pattern.kind).toBe(PATTERN.COMPRESS);
    expect(w.rows.map((r) => r.time)).toEqual([
      "17:00-17:50",
      "18:00-18:50",
      "19:00-19:50",
      "20:00-20:50",
    ]);
    expect(cell(w, 0, "附中2")).toMatchObject({ status: "held", time: "17:00-17:50", remapped: true });
    // テストは据え置き
    expect(w.testRow.time).toBe("21:00-21:30");
    expect(w.conflicts.map((c) => [c.kind, c.value])).toEqual([["teacher", "石原"]]);
  });

  it("1限カットの日は 1 限が「カット」", () => {
    const cut = { ...COMPRESS, label: "附属 1限カット", timeMap: [], cancelTimes: ["16:25-17:25"] };
    const w = week(build({ daySchedules: [cut] }), "2026-10-28");
    expect(w.pattern.kind).toBe(PATTERN.CUT_FIRST);
    expect(cell(w, 0, "附中1")).toMatchObject({ status: "cancelled", reason: "カット" });
    expect(cell(w, 1, "附中1").status).toBe("held");
  });

  it("コマ移動は特別時程の読み替えより優先", () => {
    const move = { id: 5, type: "move", date: "2026-10-28", slotId: 37, targetTime: "16:00-17:00" };
    const w = week(build({ daySchedules: [COMPRESS], adjustments: [move] }), "2026-10-28");
    expect(cell(w, 0, "附中2").time).toBe("16:00-17:00");
    expect(w.rows[0].time).toBe("17:00-17:50");
  });

  it("バスの提案と時程が食い違えば知らせる", () => {
    const m = build({
      fuzokuPlan: { notes: { "2026-10-07": { bus: "16:05×1 17:20×2" }, "2026-10-14": { bus: "15:20×2 15:30×1" } } },
    });
    expect(week(m, "2026-10-07")).toMatchObject({
      suggestion: { kind: "compress", ref: "16:05", others: ["17:20"] },
      busAtOdds: true,
    });
    expect(week(m, "2026-10-14").busAtOdds).toBe(false);
    expect(m.summary.busAtOdds).toBe(1);
  });

  it("食い違いの判定: 50分の提案に 1限カットは食い違いにしない", () => {
    expect(isPatternAtOddsWithBus("normal", "compress")).toBe(true);
    expect(isPatternAtOddsWithBus("normal", "cutFirst")).toBe(true);
    expect(isPatternAtOddsWithBus("compress", "normal")).toBe(true);
    expect(isPatternAtOddsWithBus("compress", "cutFirst")).toBe(false);
    expect(isPatternAtOddsWithBus("unknown", "normal")).toBe(false);
    expect(isPatternAtOddsWithBus("normal", "custom")).toBe(false);
  });
});

describe("buildFuzokuMonth: 休み", () => {
  it("学年だけの休講 (大山合宿) はその学年の列をまとめて休み", () => {
    const holidays = [
      { id: 1, date: "2026-10-14", label: "大山合宿", scope: ["全部"], targetGrades: ["附中2"], subjKeywords: [] },
    ];
    const w = week(build({ holidays }), "2026-10-14");
    expect(w.gradeOff).toEqual({ 附中2: "大山合宿" });
    expect(w.allOffReason).toBe(null);
    expect(cell(w, 0, "附中2")).toMatchObject({ status: "off", reason: "大山合宿" });
    // 学年別の休講は共通のテストのコマを止めない (中1・中3 は受ける)
    expect(w.testRow.status).toBe("held");
  });

  it("テスト期間 (特訓) で全学年休みなら 1 つの理由にまとめる", () => {
    const examPeriods = [
      {
        id: 1,
        name: "2学期中間 (特訓)",
        startDate: "2026-10-19",
        endDate: "2026-10-23",
        targetGrades: ["附中1", "附中2", "附中3"],
      },
    ];
    const m = build({ examPeriods });
    const w = week(m, "2026-10-21");
    expect(w.allOffReason).toBe("2学期中間 (特訓)");
    expect(w.anyHeld).toBe(false);
    expect(w.exams).toEqual([{ id: 1, name: "2学期中間 (特訓)", stops: true }]);
    expect(m.summary.noClass).toBe(1);
  });

  it("表示期間の終了 (終講) 後は未確定、開始前は開講前", () => {
    const displayCutoff = {
      groups: [
        { label: "中1・2", grades: ["中1", "中2", "附中1", "附中2"], startDate: "2026-10-10", date: null },
        { label: "中3", grades: ["中3", "附中3"], startDate: null, date: "2026-10-20" },
      ],
    };
    const m = build({ displayCutoff });
    expect(cell(week(m, "2026-10-07"), 1, "附中1")).toMatchObject({ status: "off", reason: "開講前" });
    expect(cell(week(m, "2026-10-21"), 0, "附中3")).toMatchObject({ status: "off", reason: "未確定" });
  });

  it("開講日 1 限のオリエンは休みにしない (来ている扱い)", () => {
    const displayCutoff = {
      groups: [{ label: "中1・2", grades: ["附中1", "附中2"], startDate: "2026-10-07", date: null }],
    };
    const w = week(build({ displayCutoff }), "2026-10-07");
    expect(cell(w, 0, "附中1").status).toBe("orientation");
    expect(cell(w, 1, "附中1").status).toBe("held");
    expect(w.gradeOff).toEqual({});
  });

  it("コマ休講と振替は理由つき", () => {
    const adjustments = [
      { id: 1, type: "cancel", date: "2026-10-07", slotId: 36, memo: "講師都合" },
      { id: 2, type: "reschedule", date: "2026-10-07", slotId: 39, targetDate: "2026-10-09" },
    ];
    const w = week(build({ adjustments }), "2026-10-07");
    expect(cell(w, 0, "附中1")).toMatchObject({ status: "cancelled", reason: "休講", detail: "講師都合" });
    expect(cell(w, 1, "附中1")).toMatchObject({ status: "moved" });
    expect(cell(w, 1, "附中1").reason).toContain("10/9");
  });
});

describe("buildFuzokuMonth: 確認テスト", () => {
  const plan = (tests) => ({ notes: {}, tests });
  const testCells = (m, grade) => m.weeks.map((w) => [w.testRow.cells[grade].kind, w.testRow.cells[grade].subjects.join("")]);

  it("起点が無ければ未設定", () => {
    const m = build();
    expect(testCells(m, "附中1").every(([k]) => k === "unset")).toBe(true);
    expect(m.summary.testUnset).toBe(4);
  });

  it("前の月に決めた週から今月へ回ってくる", () => {
    const m = build({ fuzokuPlan: plan({ "2026-09-30": { 附中1: { subjects: ["英", "数"] } } }) });
    expect(testCells(m, "附中1")).toEqual([
      ["auto", "国理"],
      ["auto", "社英"],
      ["auto", "数国"],
      ["auto", "理社"],
    ]);
  });

  it("その学年の休みの週は進めない / 手で決めた週から付け替える", () => {
    const holidays = [
      { id: 1, date: "2026-10-14", label: "大山合宿", scope: ["全部"], targetGrades: ["附中2"], subjKeywords: [] },
    ];
    const m = build({
      holidays,
      fuzokuPlan: plan({
        "2026-10-07": { 附中2: { subjects: ["英", "数"] } },
        "2026-10-28": { 附中2: { subjects: ["英"] } },
      }),
    });
    expect(testCells(m, "附中2")).toEqual([
      ["manual", "英数"],
      ["off", ""],
      ["auto", "国理"],
      ["manual", "英"],
    ]);
  });

  it("テストのコマ自体が休みなら誰も受けない", () => {
    const adjustments = [{ id: 1, type: "cancel", date: "2026-10-14", slotId: 250, memo: "" }];
    const m = build({
      adjustments,
      fuzokuPlan: plan({ "2026-10-07": { 附中1: { subjects: ["英", "数"] } } }),
    });
    expect(testCells(m, "附中1")).toEqual([
      ["manual", "英数"],
      ["off", ""],
      ["auto", "国理"],
      ["auto", "社英"],
    ]);
  });

  it("時間割 (期) が変わったら自動を止める", () => {
    const old = FUZOKU.map((s) => ({ ...s, timetableId: 1 }));
    const next = FUZOKU.map((s) => ({ ...s, id: s.id + 1000, timetableId: 2 }));
    const timetables = [
      { id: 1, name: "1学期", type: "regular", startDate: "2026-04-01", endDate: "2026-10-13", grades: [] },
      { id: 2, name: "2学期", type: "regular", startDate: "2026-10-14", endDate: null, grades: [] },
    ];
    const m = build({
      slots: [...old, ...next],
      timetables,
      fuzokuPlan: plan({ "2026-10-07": { 附中3: { subjects: ["英", "数"] } } }),
    });
    expect(testCells(m, "附中3")).toEqual([
      ["manual", "英数"],
      ["unset", ""],
      ["unset", ""],
      ["unset", ""],
    ]);
  });
});

describe("buildFuzokuMonth: その日の添え書き", () => {
  it("附属に関係するテスト期間・イベント・追加授業を拾う", () => {
    const examPeriods = [
      { id: 1, name: "中学テスト (表示のみ)", startDate: "2026-10-05", endDate: "2026-10-09", targetGrades: [], stopsClasses: false },
      { id: 2, name: "高校テスト", startDate: "2026-10-05", endDate: "2026-10-09", targetGrades: ["高1"] },
    ];
    const specialEvents = [
      { id: 1, name: "テスト発表", startDate: "2026-10-07", endDate: "2026-10-07", eventType: "announcement", targetGrades: ["附中2"], memo: "" },
      { id: 2, name: "高校の文化祭", startDate: "2026-10-07", endDate: "2026-10-07", eventType: "festival", targetGrades: ["高2"], memo: "" },
    ];
    const extraLessons = [
      { id: 1, date: "2026-10-07", time: "15:00-16:00", grade: "附中3", subj: "数学", teacher: "片岡" },
      { id: 2, date: "2026-10-07", time: "15:00-16:00", grade: "中3", subj: "数学", teacher: "片岡" },
    ];
    const w = week(build({ examPeriods, specialEvents, extraLessons }), "2026-10-07");
    expect(w.exams).toEqual([{ id: 1, name: "中学テスト (表示のみ)", stops: false }]);
    expect(w.events).toEqual([{ id: 1, name: "テスト発表" }]);
    expect(w.extras.map((l) => l.id)).toEqual([1]);
    expect(w.anyHeld).toBe(true);
  });
});
