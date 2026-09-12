import { describe, expect, it, vi } from "vitest";
import { applyAbsenceRange, buildAbsenceRangePlan } from "./absenceRange";

// 2026-09-14 (月) 〜 2026-09-20 (日)
const mk = (id, day, teacher, extra = {}) => ({
  id,
  day,
  time: "19:00-20:20",
  grade: "中3",
  cls: "S",
  room: "601",
  subj: "数学",
  teacher,
  note: "",
  ...extra,
});
const SLOTS = [
  mk(1, "月", "堀上"),
  mk(2, "火", "堀上", { time: "20:30-21:50" }),
  mk(3, "水", "河野"),
  mk(4, "土", "香川·堀上", { grade: "中1-3", subj: "プレップ" }),
];
const ctx = {
  timetables: [],
  displayCutoff: { groups: [] },
  daySchedules: [],
  biweeklyAnchors: [],
  holidays: [],
  examPeriods: [],
  isOffForGrade: () => false,
};

describe("buildAbsenceRangePlan", () => {
  it("期間内の各日について、その先生が担当するコマだけを対象にする (日曜は空)", () => {
    const plan = buildAbsenceRangePlan({
      slots: SLOTS,
      fromDate: "2026-09-14",
      toDate: "2026-09-20",
      teachers: ["堀上"],
      ctx,
    });
    expect(plan.errors).toEqual([]);
    expect(plan.total).toBe(3); // 月 / 火 / 土 (プレップは堀上の分だけ)
    const byDate = Object.fromEntries(plan.days.map((d) => [d.date, d.targets.map((t) => t.slotId)]));
    expect(byDate["2026-09-14"]).toEqual([1]);
    expect(byDate["2026-09-15"]).toEqual([2]);
    expect(byDate["2026-09-16"]).toEqual([]);
    expect(byDate["2026-09-19"]).toEqual([4]);
    expect(plan.days.find((d) => d.date === "2026-09-20").day).toBe(null);
    expect(plan.days.find((d) => d.date === "2026-09-19").targets[0].teacher).toBe("堀上");
  });

  it("休講の日と登録済みの組は理由つきで外す", () => {
    const plan = buildAbsenceRangePlan({
      slots: SLOTS,
      subs: [{ id: 9, date: "2026-09-15", slotId: 2, originalTeacher: "堀上", substitute: "", status: "requested" }],
      fromDate: "2026-09-14",
      toDate: "2026-09-15",
      teachers: ["堀上"],
      ctx: { ...ctx, isOffForGrade: (d) => d === "2026-09-14" },
    });
    expect(plan.total).toBe(0);
    expect(plan.days[0].skipped[0].reason).toBe("休講・テスト期間");
    expect(plan.days[1].skipped[0].reason).toBe("登録済み");
  });

  it("入力の不備はエラーで返す", () => {
    expect(buildAbsenceRangePlan({ slots: SLOTS, fromDate: "2026-09-14", toDate: "2026-09-10", teachers: ["堀上"], ctx }).errors).toContain(
      "終了日は開始日以降にしてください"
    );
    expect(buildAbsenceRangePlan({ slots: SLOTS, fromDate: "2026-09-14", toDate: "2026-09-14", teachers: [], ctx }).errors).toContain(
      "欠勤する先生を選んでください"
    );
    expect(buildAbsenceRangePlan({ slots: SLOTS, fromDate: "2026-01-01", toDate: "2026-12-31", teachers: ["堀上"], ctx }).errors[0]).toMatch(/31 日まで/);
  });
});

describe("applyAbsenceRange", () => {
  it("除外した組を除き、代行者が空のレコードを日数ぶん保存する", () => {
    const plan = buildAbsenceRangePlan({
      slots: SLOTS,
      fromDate: "2026-09-14",
      toDate: "2026-09-19",
      teachers: ["堀上"],
      ctx,
    });
    const saveSubs = vi.fn();
    const existing = [{ id: 5, date: "2026-01-01", slotId: 1, originalTeacher: "x", substitute: "", status: "confirmed" }];
    const n = applyAbsenceRange({
      subs: existing,
      plan,
      excludedKeys: new Set(["2026-09-15|2|堀上"]),
      mode: "nosub",
      memo: "インフル",
      saveSubs,
    });
    expect(n).toBe(2);
    const saved = saveSubs.mock.calls[0][0];
    expect(saved).toHaveLength(3);
    expect(saved.slice(1)).toMatchObject([
      { id: 6, date: "2026-09-14", slotId: 1, originalTeacher: "堀上", substitute: "", status: "confirmed", memo: "インフル" },
      { id: 7, date: "2026-09-19", slotId: 4, originalTeacher: "堀上", substitute: "", status: "confirmed", memo: "インフル" },
    ]);
  });

  it("対象が無ければ保存しない", () => {
    const saveSubs = vi.fn();
    expect(applyAbsenceRange({ subs: [], plan: { days: [] }, mode: "pending", saveSubs })).toBe(0);
    expect(saveSubs).not.toHaveBeenCalled();
  });
});
