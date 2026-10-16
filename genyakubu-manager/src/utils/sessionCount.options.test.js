import { describe, expect, it } from "vitest";
import { buildSessionCountMap, computeSessionNumber } from "./sessionCount";

// 2026-10-03 / 10-10 / 10-17 は土曜、10-05 / 10-12 は月曜
const CUTOFF = {
  groups: [
    { label: "中学", grades: ["中1", "中2", "中3"], startDate: "2026-10-01", date: null },
    { label: "高3", grades: ["高3"], startDate: "2026-10-01", date: null },
  ],
};

function slot(id, day, time, grade, subj, extras = {}) {
  return { id, day, time, grade, cls: "", room: "", subj, teacher: "T", note: "", ...extras };
}

function ctxOf(allSlots, classSets = [], extras = {}) {
  return { allSlots, classSets, displayCutoff: CUTOFF, isOffForGrade: () => false, ...extras };
}

describe("授業セットの日数カウント (countByDay)", () => {
  const prep1 = slot(1, "土", "15:00-16:20", "中1-3", "プレップ");
  const prep2 = slot(2, "土", "16:30-17:50", "中1-3", "プレップ");
  const units = [{ grade: "中1-3", day: "土" }];

  it("既定は 1 日に 2 コマあると 2 回進む (従来どおり)", () => {
    const ctx = ctxOf([prep1, prep2], [{ id: 1, label: "土プレップ", units }]);
    expect(computeSessionNumber(prep2, "2026-10-17", ctx)).toBe(6);
  });

  it("同じ日の同じ教科・クラスは 1 回と数える", () => {
    const ctx = ctxOf([prep1, prep2], [{ id: 1, label: "土プレップ", units, countByDay: true }]);
    expect(computeSessionNumber(prep1, "2026-10-17", ctx)).toBe(3);
    expect(computeSessionNumber(prep2, "2026-10-17", ctx)).toBe(3);
    const map = buildSessionCountMap([prep1, prep2], "2026-10-10", ctx);
    expect([map.get(1), map.get(2)]).toEqual([2, 2]);
  });

  it("クラスが違えば日数カウントでも別に数える", () => {
    const special = slot(3, "土", "15:00-16:20", "中1-3", "プレップ", { cls: "特進" });
    const ctx = ctxOf([prep1, prep2, special], [{ id: 1, label: "土プレップ", units, countByDay: true }]);
    expect(computeSessionNumber(special, "2026-10-17", ctx)).toBe(3);
    expect(computeSessionNumber(prep2, "2026-10-17", ctx)).toBe(3);
  });

  it("回数補正の set はその日のコマ全部に効き、片方だけ skip なら残りで 1 回", () => {
    const sessionOverrides = [
      { id: 1, slotId: 2, date: "2026-10-10", mode: "set", value: 10 },
      { id: 2, slotId: 1, date: "2026-10-17", mode: "skip" },
    ];
    const ctx = ctxOf([prep1, prep2], [{ id: 1, label: "土プレップ", units, countByDay: true }], {
      sessionOverrides,
    });
    expect(computeSessionNumber(prep1, "2026-10-10", ctx)).toBe(10);
    expect(computeSessionNumber(prep2, "2026-10-17", ctx)).toBe(11);
    expect(computeSessionNumber(prep1, "2026-10-17", ctx)).toBe(0);
  });
});

describe("曜日ごとに数えるコマ (separateWeekdayCount)", () => {
  // 高3 のマークテスト (月 本校 / 土 亀井町、同じ内容) — コースの束ねでは 1 本になる
  const mon = slot(11, "月", "17:00-18:00", "高3", "マークテスト", { room: "601" });
  const sat = slot(12, "土", "13:00-14:00", "高3", "マークテスト", { room: "亀21" });

  it("既定はコースで通算する (月と土で 1 本の番号)", () => {
    const ctx = ctxOf([mon, sat]);
    // 10/3 土 → 1, 10/5 月 → 2, 10/10 土 → 3
    expect(computeSessionNumber(sat, "2026-10-10", ctx)).toBe(3);
  });

  it("両方に付けると曜日ごとの番号になる", () => {
    const m = { ...mon, separateWeekdayCount: true };
    const s = { ...sat, separateWeekdayCount: true };
    const ctx = ctxOf([m, s]);
    expect(computeSessionNumber(s, "2026-10-10", ctx)).toBe(2);
    expect(computeSessionNumber(m, "2026-10-12", ctx)).toBe(2);
  });

  it("片方にだけ付けても、もう片方の通算からも外れる", () => {
    const m = { ...mon, separateWeekdayCount: true };
    const ctx = ctxOf([m, sat]);
    expect(computeSessionNumber(sat, "2026-10-10", ctx)).toBe(2);
    expect(computeSessionNumber(m, "2026-10-12", ctx)).toBe(2);
  });
});

describe("数え始め (sessionStartNumber)", () => {
  it("その期の最初の回を第N回から数える", () => {
    const s = slot(21, "土", "13:00-14:00", "高3", "マークテスト", { sessionStartNumber: 9 });
    const ctx = ctxOf([s]);
    expect(computeSessionNumber(s, "2026-10-03", ctx)).toBe(9);
    expect(computeSessionNumber(s, "2026-10-17", ctx)).toBe(11);
  });

  it("不定期のコマ + 数え始め = 実施日だけ ⑨⑩… と進む", () => {
    const s = slot(22, "土", "13:00-14:00", "高3", "マークテスト", {
      sessionStartNumber: 9,
      irregular: true,
      onlyDates: ["2026-10-03", "2026-10-17"],
    });
    const ctx = ctxOf([s]);
    expect(computeSessionNumber(s, "2026-10-10", ctx)).toBe(0);
    expect(computeSessionNumber(s, "2026-10-17", ctx)).toBe(10);
  });

  it("1 以下・小数は無視する (第1回から)", () => {
    const s = slot(23, "土", "13:00-14:00", "高3", "マークテスト", { sessionStartNumber: 0.5 });
    expect(computeSessionNumber(s, "2026-10-03", ctxOf([s]))).toBe(1);
  });
});
