import { describe, expect, it } from "vitest";
import { buildCutoffTimeline, datePos, monthTicks } from "./cutoffTimeline";

const mk = (id, grade, day, timetableId = 1) => ({
  id,
  grade,
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
  timetableId,
});

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-31", grades: [] },
];
const SLOTS = [mk(1, "中1", "火"), mk(2, "高3", "月")];
const CUTOFF = {
  groups: [
    { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-07-18" },
    { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: null },
  ],
  cohorts: [{ id: "M|中1|火", label: "中1 火", grade: "中1", date: "2026-07-14" }],
};

const build = (over = {}) =>
  buildCutoffTimeline({
    timetables: TIMETABLES,
    slots: SLOTS,
    displayCutoff: CUTOFF,
    todayStr: "2026-06-01",
    ...over,
  });

describe("datePos", () => {
  it("両端と中間の位置を 0..1 で返す", () => {
    expect(datePos("2026-01-01", "2026-01-01", "2026-01-11")).toBe(0);
    expect(datePos("2026-01-11", "2026-01-01", "2026-01-11")).toBe(1);
    expect(datePos("2026-01-06", "2026-01-01", "2026-01-11")).toBeCloseTo(0.5, 5);
  });

  it("範囲外は丸める / 範囲が壊れていれば 0", () => {
    expect(datePos("2025-01-01", "2026-01-01", "2026-01-11")).toBe(0);
    expect(datePos("2027-01-01", "2026-01-01", "2026-01-11")).toBe(1);
    expect(datePos("2026-01-05", "2026-01-11", "2026-01-01")).toBe(0);
  });
});

describe("monthTicks", () => {
  it("帯に入る月初だけを返す", () => {
    const ticks = monthTicks("2026-04-01", "2026-07-01");
    expect(ticks.map((t) => t.label)).toEqual(["4月", "5月", "6月", "7月"]);
    expect(ticks[0].pos).toBe(0);
    expect(ticks[3].pos).toBe(1);
  });
});

describe("buildCutoffTimeline", () => {
  it("時間割・学年グループ・コースの行を組む", () => {
    const t = build();
    const kinds = t.rows.map((r) => r.kind);
    expect(kinds).toEqual(["timetable", "group", "cohort", "group"]);
    expect(t.rows[0]).toMatchObject({ label: "1学期", startDate: "2026-04-07" });
    expect(t.rows[1]).toMatchObject({ label: "中1・2", sub: "1 コマ" });
    expect(t.rows[2]).toMatchObject({ label: "中1 火", endDate: "2026-07-14" });
  });

  it("帯の両端に余白を取り、今日の位置を返す", () => {
    const t = build();
    expect(t.start < "2026-04-07").toBe(true);
    expect(t.end > "2026-08-31").toBe(true);
    expect(t.todayPos).toBeGreaterThan(0);
    expect(t.todayPos).toBeLessThan(1);
  });

  it("終了日の無いグループは帯の右端まで伸ばして openEnd を立てる", () => {
    const t = build();
    const kou3 = t.rows.find((r) => r.label === "高3");
    expect(kou3.openEnd).toBe(true);
    expect(kou3.left + kou3.width).toBeCloseTo(1, 5);
  });

  it("時間割はまだ有効なのに表示期間が先に終わっている区間を返す", () => {
    const t = build();
    const chu = t.rows.find((r) => r.label === "中1・2");
    // 表示期間 7/18 まで / 時間割 8/31 まで → 7/19〜8/31 が「出ない」区間
    expect(chu.uncovered).toMatchObject({ endDate: "2026-08-31", openEnd: false });
    expect(chu.uncovered.width).toBeGreaterThan(0);
    // 終了日の無い高3 には出ない
    expect(t.rows.find((r) => r.label === "高3").uncovered).toBeNull();
  });

  it("終了日の無い時間割なら uncovered は開いたまま", () => {
    const t = build({
      timetables: [{ ...TIMETABLES[0], endDate: null }],
    });
    expect(t.rows.find((r) => r.label === "中1・2").uncovered).toMatchObject({
      openEnd: true,
      endDate: null,
    });
  });

  it("開始日 > 終了日 のグループに invalid を立てる", () => {
    const t = build({
      displayCutoff: {
        groups: [
          { label: "中1・2", grades: ["中1"], startDate: "2026-09-01", date: "2026-07-18" },
        ],
        cohorts: [],
      },
    });
    expect(t.rows.find((r) => r.kind === "group").invalid).toBe(true);
  });

  it("グループ終了日より後のコース終講日に invalid を立てる", () => {
    const t = build({
      displayCutoff: {
        ...CUTOFF,
        cohorts: [{ id: "M|中1|火", label: "中1 火", grade: "中1", date: "2026-08-20" }],
      },
    });
    expect(t.rows.find((r) => r.kind === "cohort").invalid).toBe(true);
  });

  it("includeCohorts: false ならコース行を出さない", () => {
    const t = build({ includeCohorts: false });
    expect(t.rows.some((r) => r.kind === "cohort")).toBe(false);
  });

  it("日付が 1 つも無くても today を中心に組める", () => {
    const t = buildCutoffTimeline({
      timetables: [],
      slots: [],
      displayCutoff: { groups: [], cohorts: [] },
      todayStr: "2026-06-01",
    });
    expect(t.rows).toEqual([]);
    expect(t.start < "2026-06-01").toBe(true);
    expect(t.end > "2026-06-01").toBe(true);
  });
});

describe("buildCutoffTimeline: 時間割ごとの学年グループ (2026-11-19)", () => {
  const TTS = [
    { id: 1, name: "1学期", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
    { id: 3, name: "2学期", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] },
  ];
  const slots = [mk(1, "中1", "火", 1), mk(2, "中1", "火", 3)];
  const dc = {
    groups: [
      { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-08-25", date: null },
      { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-07-17", timetableId: 1 },
      // どの時間割のコマも従っていない共通のグループ
      { label: "高3", grades: ["高3"], startDate: "2026-08-25", date: null },
    ],
    cohorts: [
      { id: "M|中1|火", label: "中1 火", grade: "中1", date: "2026-07-14", timetableId: 1 },
      { id: "M|中1|火", label: "中1 火", grade: "中1", date: "2026-12-15", timetableId: 3 },
    ],
  };
  const groupRows = () =>
    buildCutoffTimeline({ timetables: TTS, slots, displayCutoff: dc, todayStr: "2026-11-19" }).rows;

  it("同じ名前のグループを期ごとに 1 行ずつ並べ、時間割の名前を添える", () => {
    const rows = groupRows().filter((r) => r.kind === "group");
    expect(rows.map((r) => [r.key, r.sub])).toEqual([
      ["group-中1・2", "共通・1 コマ"],
      ["group-中1・2@1", "1学期・1 コマ"],
    ]);
  });

  it("コース別終講日は、その時間割に効くグループの下に並ぶ", () => {
    const rows = groupRows();
    const idx = (key) => rows.findIndex((r) => r.key === key);
    expect(idx("cohort-3-M|中1|火")).toBe(idx("group-中1・2") + 1);
    expect(idx("cohort-1-M|中1|火")).toBe(idx("group-中1・2@1") + 1);
  });
});
