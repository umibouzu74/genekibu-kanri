import { describe, expect, it } from "vitest";
import { INIT_SLOTS } from "../data";
import { splitTeacherField } from "../utils/biweekly";
import { applyChu3SecondTermShift, buildProjectFromSlots } from "./importTimetable";
import { buildReflectionPlan } from "./reflect";
import { makeCellKey, parseCellKey, resolveAllEntries } from "./model";

const S = (over) => ({
  id: 0,
  day: "月",
  time: "18:55-19:40",
  grade: "中3",
  cls: "S",
  room: "501",
  subj: "数学",
  teacher: "半田",
  note: "",
  timetableId: 1,
  ...over,
});

describe("buildProjectFromSlots", () => {
  it("時限プールを開始時刻順に作り、学年ごとのタブに分ける", () => {
    const slots = [
      S({ id: 1, time: "19:50-20:35" }),
      S({ id: 2, time: "18:55-19:40" }),
      S({ id: 3, grade: "中2", cls: "AB", room: "601", time: "18:55-19:40" }),
    ];
    const { project, stats } = buildProjectFromSlots("2026 1学期", slots, 1);
    expect(project.name).toBe("2026 1学期");
    expect(project.periods.map((p) => p.time)).toEqual(["18:55-19:40", "19:50-20:35"]);
    // タブは ALL_GRADES 順 (中2 → 中3)
    expect(project.tabs.map((t) => t.grade)).toEqual(["中2", "中3"]);
    expect(stats.slotCount).toBe(3);
    expect(stats.tabCount).toBe(2);
  });

  it("対象の時間割のコマだけ取り込む (timetableId 未設定はデフォルト id=1)", () => {
    const slots = [
      S({ id: 1, timetableId: undefined }),
      S({ id: 2, timetableId: 2 }),
    ];
    const { stats } = buildProjectFromSlots("x", slots, 1);
    expect(stats.slotCount).toBe(1);
  });

  it("列の既定教室は最頻値になり、既定と違うセルだけ教室を持つ", () => {
    const slots = [
      S({ id: 1, day: "月", room: "501" }),
      S({ id: 2, day: "火", room: "501" }),
      S({ id: 3, day: "水", room: "601" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1);
    const tab = project.tabs[0];
    expect(tab.classes[0].room).toBe("501");
    const entries = resolveAllEntries(project);
    const wed = entries.find((e) => e.day === "水");
    const mon = entries.find((e) => e.day === "月");
    expect(wed.cell.room).toBe("601");
    expect(mon.cell.room).toBeUndefined();
  });

  it("同一 (曜日×時限×cls) の並列コマは同ラベルの列を増やして保持する", () => {
    const slots = [
      S({ id: 1, cls: "SS〜C", subj: "確認テスト", teacher: "藤田", room: "501", time: "21:35-21:50" }),
      S({ id: 2, cls: "SS〜C", subj: "確認テスト", teacher: "大屋敷", room: "503", time: "21:35-21:50" }),
    ];
    const { project, stats } = buildProjectFromSlots("x", slots, 1);
    const tab = project.tabs[0];
    expect(tab.classes.map((c) => c.label)).toEqual(["SS〜C", "SS〜C"]);
    expect(stats.parallelColumns).toBe(1);
    const teachers = resolveAllEntries(project).map((e) => e.cell.teacher).sort();
    expect(teachers).toEqual(["大屋敷", "藤田"]);
  });

  it("講師マスタは分解して収集し、科目マスタは出現順", () => {
    const slots = [
      S({ id: 1, teacher: "香川·福江", subj: "英語" }),
      S({ id: 2, day: "火", teacher: "香川", subj: "数学" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1);
    expect(project.teachers.map((t) => t.name)).toEqual(["福江", "香川"]);
    expect(project.subjects).toEqual(["英語", "数学"]);
  });
});

describe("INIT_SLOTS 取込 → 反映の round-trip", () => {
  const normalize = (s) => ({
    day: s.day,
    time: s.time.trim(),
    grade: s.grade,
    cls: (s.cls || "").trim(),
    room: (s.room || "").trim(),
    subj: (s.subj || "").trim(),
    teacher: splitTeacherField(s.teacher).join("·"),
    note: (s.note || "").trim(),
  });
  const sortKey = (s) => JSON.stringify(s);

  it("シード全コマ (216 件) が欠落・変質なく往復する", () => {
    const { project, stats } = buildProjectFromSlots("2026 1学期", INIT_SLOTS, 1);
    expect(stats.slotCount).toBe(INIT_SLOTS.length);
    const plan = buildReflectionPlan(project, { mode: "new", name: "2026 1学期" });
    expect(plan.ok).toBe(true);
    expect(plan.drafts).toHaveLength(INIT_SLOTS.length);

    const expected = INIT_SLOTS.map(normalize).sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b))
    );
    const actual = plan.drafts
      .map(normalize)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    expect(actual).toEqual(expected);
  });
});

describe("applyChu3SecondTermShift", () => {
  function firstTermProject() {
    // 中3 平日 (月): 1限 18:55 / 2限 19:50 / 3限 20:45 / 確認テスト 21:35
    // 中3 土: 内申対策 PM (15:30) / 中2 月 3限 20:45 (中3 以外は不変の確認用)
    const slots = [
      S({ id: 1, time: "18:55-19:40", subj: "理科", teacher: "滝澤" }),
      S({ id: 2, time: "19:50-20:35", subj: "英語", teacher: "堀上" }),
      S({ id: 3, time: "20:45-21:30", subj: "国語", teacher: "松川" }),
      S({ id: 4, time: "21:35-21:50", cls: "SS〜C", subj: "確認テスト", teacher: "藤田" }),
      S({ id: 5, day: "土", time: "15:30-16:30", cls: "一般", room: "401", subj: "理科A", teacher: "滝澤", note: "内申対策" }),
      S({ id: 6, grade: "中2", cls: "S", room: "602", time: "20:45-21:30", subj: "数学", teacher: "半田" }),
    ];
    return buildProjectFromSlots("2026 1学期", slots, 1).project;
  }

  it("中3 平日の最終コマと確認テストを前倒しし、旧 1・2 限は残す", () => {
    const src = firstTermProject();
    const { project, moved } = applyChu3SecondTermShift(src);
    expect(moved).toBe(2); // 20:45 の国語 + 確認テスト

    const chu3 = project.tabs.find((t) => t.grade === "中3");
    const timeOf = (pid) => project.periods.find((p) => p.id === pid).time;
    const cells = Object.entries(chu3.schedule).map(([k, cell]) => ({
      ...parseCellKey(k),
      time: timeOf(parseCellKey(k).periodId),
      cell,
    }));
    const at = (day, time) => cells.filter((c) => c.day === day && c.time === time);

    expect(at("月", "18:00-18:45")[0].cell.subj).toBe("国語"); // 旧最終コマが新 1 限へ
    expect(at("月", "18:55-19:40")[0].cell.subj).toBe("理科");
    expect(at("月", "19:50-20:35")[0].cell.subj).toBe("英語");
    expect(at("月", "20:40-20:55")[0].cell.subj).toBe("確認テスト");
    expect(at("月", "20:45-21:30")).toHaveLength(0);
    expect(at("月", "21:35-21:50")).toHaveLength(0);
    // 土曜の内申対策 PM は動かない
    expect(at("土", "15:30-16:30")[0].cell.subj).toBe("理科A");
  });

  it("土曜の内申対策 午前枠 (10:00〜15:00 の 4 コマ) を時限として追加する", () => {
    const { project } = applyChu3SecondTermShift(firstTermProject());
    const chu3 = project.tabs.find((t) => t.grade === "中3");
    const tabTimes = chu3.periodIds.map(
      (id) => project.periods.find((p) => p.id === id).time
    );
    for (const t of ["10:00-11:00", "11:10-12:10", "12:50-13:50", "14:00-15:00"]) {
      expect(tabTimes).toContain(t);
    }
    expect(chu3.days).toContain("土");
    // プールは開始時刻順に整列している
    const pool = project.periods.map((p) => p.time);
    expect(pool.indexOf("10:00-11:00")).toBeLessThan(pool.indexOf("18:00-18:45"));
    expect(pool.indexOf("18:00-18:45")).toBeLessThan(pool.indexOf("18:55-19:40"));
  });

  it("中3 以外のタブと元プロジェクトは変更しない", () => {
    const src = firstTermProject();
    const before = JSON.stringify(src);
    const { project } = applyChu3SecondTermShift(src);
    expect(JSON.stringify(src)).toBe(before); // source 不変

    const chu2 = project.tabs.find((t) => t.grade === "中2");
    const times = Object.keys(chu2.schedule).map(
      (k) => project.periods.find((p) => p.id === parseCellKey(k).periodId).time
    );
    expect(times).toEqual(["20:45-21:30"]); // 中2 の最終コマはそのまま
  });

  it("使われなくなった時限はタブの使う時限から外れる", () => {
    const { project } = applyChu3SecondTermShift(firstTermProject());
    const chu3 = project.tabs.find((t) => t.grade === "中3");
    const tabTimes = chu3.periodIds.map(
      (id) => project.periods.find((p) => p.id === id).time
    );
    expect(tabTimes).not.toContain("20:45-21:30");
    expect(tabTimes).not.toContain("21:35-21:50");
  });

  it("2 回適用しても壊れない (冪等)", () => {
    const once = applyChu3SecondTermShift(firstTermProject()).project;
    const twice = applyChu3SecondTermShift(once);
    expect(twice.moved).toBe(0);
    expect(JSON.stringify(twice.project.tabs)).toBe(JSON.stringify(once.tabs));
  });

  it("中3 タブが無ければ何もしない", () => {
    const slots = [S({ id: 1, grade: "中2", cls: "S", room: "602" })];
    const src = buildProjectFromSlots("x", slots, 1).project;
    const { moved, morningAdded } = applyChu3SecondTermShift(src);
    expect(moved).toBe(0);
    expect(morningAdded).toBe(false);
  });

  it("INIT_SLOTS 全体に適用: 中3 平日 19 コマ (3限×5日 + 確認テスト月〜金)…が移動し総数は不変", () => {
    const { project: p1 } = buildProjectFromSlots("2026 1学期", INIT_SLOTS, 1);
    const beforeCount = resolveAllEntries(p1).length;
    const { project: p2, moved } = applyChu3SecondTermShift(p1);
    expect(moved).toBeGreaterThan(0);
    expect(resolveAllEntries(p2).length).toBe(beforeCount);
    // 反映プランも全コマ分生成できる
    const plan = buildReflectionPlan(p2, { mode: "new", name: "2026 2学期" });
    expect(plan.ok).toBe(true);
    expect(plan.drafts).toHaveLength(INIT_SLOTS.length);
    // 中3 平日に 20:45-21:30 / 21:35-21:50 は残っていない
    const chu3Weekday = plan.drafts.filter(
      (d) => d.grade === "中3" && ["月", "火", "水", "木", "金"].includes(d.day)
    );
    expect(chu3Weekday.some((d) => d.time === "20:45-21:30")).toBe(false);
    expect(chu3Weekday.some((d) => d.time === "21:35-21:50")).toBe(false);
    expect(chu3Weekday.some((d) => d.time === "18:00-18:45")).toBe(true);
    expect(chu3Weekday.some((d) => d.time === "20:40-20:55")).toBe(true);
  });
});

describe("makeCellKey / resolveAllEntries と取込の整合", () => {
  it("取込直後のプロジェクトは全セルが解決可能 (残骸ゼロ)", () => {
    const { project } = buildProjectFromSlots("x", INIT_SLOTS, 1);
    let cellCount = 0;
    for (const tab of project.tabs) cellCount += Object.keys(tab.schedule).length;
    expect(resolveAllEntries(project)).toHaveLength(cellCount);
    // キー形式も往復する
    const anyKey = Object.keys(project.tabs[0].schedule)[0];
    const parsed = parseCellKey(anyKey);
    expect(makeCellKey(parsed.day, parsed.periodId, parsed.classId)).toBe(anyKey);
  });
});

describe("buildProjectFromSlots - splitWeekend (平日/土曜のタブ分割)", () => {
  const mix = [
    S({ id: 1, day: "火" }),
    S({ id: 2, day: "土", time: "15:30-16:30", cls: "一般", room: "401", subj: "理科A", teacher: "滝澤", note: "内申対策" }),
    S({ id: 3, grade: "中2", cls: "S", room: "602" }), // 平日のみの学年
  ];

  it("平日と土日の両方がある学年だけ 2 タブに分かれる", () => {
    const { project } = buildProjectFromSlots("x", mix, 1, { splitWeekend: true });
    expect(project.tabs.map((t) => t.name)).toEqual(["中2", "中3", "中3 (土)"]);
    const chu3 = project.tabs.find((t) => t.name === "中3");
    const chu3Sat = project.tabs.find((t) => t.name === "中3 (土)");
    expect(chu3.grade).toBe("中3");
    expect(chu3Sat.grade).toBe("中3"); // 反映時の学年は同じ
    expect(chu3.days).toEqual(["火"]);
    expect(chu3Sat.days).toEqual(["土"]);
  });

  it("オプション無しでは従来通り 1 学年 1 タブ", () => {
    const { project } = buildProjectFromSlots("x", mix, 1);
    expect(project.tabs.map((t) => t.name)).toEqual(["中2", "中3"]);
  });

  it("分割取込 + 中3 変換: 午前枠は土タブだけに入り、平日タブには入らない", () => {
    const slots = [
      S({ id: 1, day: "月", time: "20:45-21:30", subj: "国語", teacher: "松川" }),
      S({ id: 2, day: "土", time: "15:30-16:30", cls: "一般", room: "401", subj: "理科A", teacher: "滝澤" }),
    ];
    const src = buildProjectFromSlots("x", slots, 1, { splitWeekend: true }).project;
    const { project, moved } = applyChu3SecondTermShift(src);
    expect(moved).toBe(1);
    const weekday = project.tabs.find((t) => t.name === "中3");
    const sat = project.tabs.find((t) => t.name === "中3 (土)");
    const timesOf = (tab) =>
      tab.periodIds.map((id) => project.periods.find((p) => p.id === id).time);
    expect(timesOf(weekday)).toContain("18:00-18:45");
    expect(timesOf(weekday)).not.toContain("10:00-11:00");
    expect(weekday.days).not.toContain("土");
    expect(timesOf(sat)).toContain("10:00-11:00");
    expect(timesOf(sat)).toContain("14:00-15:00");
  });

  it("分割取込でも INIT_SLOTS の round-trip は欠落・変質ゼロ", () => {
    const { project, stats } = buildProjectFromSlots("x", INIT_SLOTS, 1, { splitWeekend: true });
    expect(stats.slotCount).toBe(INIT_SLOTS.length);
    const plan = buildReflectionPlan(project, { mode: "new", name: "x" });
    expect(plan.ok).toBe(true);
    expect(plan.drafts).toHaveLength(INIT_SLOTS.length);
  });
});

describe("buildProjectFromSlots - splitBuilding (本校/亀井町のタブ分割)", () => {
  const mixed = [
    S({ id: 1, grade: "高2", cls: "", room: "404", time: "18:30-19:30", subj: "英語", teacher: "今津" }),
    S({ id: 2, grade: "高2", cls: "", room: "亀62", time: "19:00-20:20", subj: "数学", teacher: "福武" }),
    S({ id: 3, grade: "高1", cls: "", room: "401", time: "18:30-19:30", subj: "数学", teacher: "石原" }),
  ];

  it("亀◯◯教室のコマとそれ以外がある学年を「高2」「高2 (亀)」に分ける", () => {
    const { project } = buildProjectFromSlots("x", mixed, 1, { splitBuilding: true });
    expect(project.tabs.map((t) => t.name)).toEqual(["高1", "高2", "高2 (亀)"]);
    // 両タブとも grade は反映用に「高2」のまま
    expect(project.tabs.filter((t) => t.grade === "高2")).toHaveLength(2);
    const annex = project.tabs.find((t) => t.name === "高2 (亀)");
    expect(annex.classes.map((c) => c.room)).toEqual(["亀62"]);
    expect(annex.periodIds).toHaveLength(1);
  });

  it("片方の建物しか無い学年は分割しない", () => {
    const { project } = buildProjectFromSlots("x", mixed, 1, { splitBuilding: true });
    expect(project.tabs.filter((t) => t.grade === "高1")).toHaveLength(1);
  });

  it("オプション無しでは従来どおり 1 学年 1 タブ", () => {
    const { project } = buildProjectFromSlots("x", mixed, 1);
    expect(project.tabs.map((t) => t.name)).toEqual(["高1", "高2"]);
  });

  it("splitWeekend と併用すると「高2 (亀・土)」のように連結される", () => {
    const slots = [
      ...mixed,
      S({ id: 4, grade: "高2", cls: "", room: "亀62", time: "19:00-20:20", day: "土" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1, {
      splitBuilding: true,
      splitWeekend: true,
    });
    expect(project.tabs.map((t) => t.name)).toEqual([
      "高1",
      "高2",
      "高2 (亀)",
      "高2 (亀・土)",
    ]);
  });

  it("分割しても取込コマの総数は変わらない (round-trip 保証の前提)", () => {
    const { project } = buildProjectFromSlots("x", mixed, 1, { splitBuilding: true });
    expect(resolveAllEntries(project)).toHaveLength(mixed.length);
  });
});

describe("buildProjectFromSlots - グループ名の自動設定", () => {
  it("中学部 / 附属 / 高校部・本校 / 高校部・亀井町 を自動設定する", () => {
    const slots = [
      S({ id: 1, grade: "中3" }),
      S({ id: 2, grade: "附中1", room: "402", time: "16:25-17:25" }),
      S({ id: 3, grade: "高2", cls: "", room: "404", time: "18:30-19:30" }),
      S({ id: 4, grade: "高2", cls: "", room: "亀62", time: "19:00-20:20" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1, { splitBuilding: true });
    const byName = Object.fromEntries(project.tabs.map((t) => [t.name, t.group]));
    expect(byName["中3"]).toBe("中学部");
    expect(byName["附中1"]).toBe("附属");
    expect(byName["高2"]).toBe("高校部・本校");
    expect(byName["高2 (亀)"]).toBe("高校部・亀井町");
  });

  it("単一学年でない特設タブ (中1-3 / 高1高2) はグループを付けない", () => {
    const slots = [
      S({ id: 1, grade: "中1-3", time: "17:50-18:50" }),
      S({ id: 2, grade: "高1高2", time: "19:00-20:00" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1, { splitBuilding: true });
    expect(project.tabs.map((t) => t.group)).toEqual(["", ""]);
  });

  it("平日/土曜分割でも同じグループ名を引き継ぐ", () => {
    const slots = [
      S({ id: 1, grade: "中3", day: "月" }),
      S({ id: 2, grade: "中3", day: "土", time: "10:00-11:00" }),
    ];
    const { project } = buildProjectFromSlots("x", slots, 1, { splitWeekend: true });
    expect(project.tabs.map((t) => [t.name, t.group])).toEqual([
      ["中3", "中学部"],
      ["中3 (土)", "中学部"],
    ]);
  });
});
