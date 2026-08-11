import { describe, expect, it } from "vitest";
import {
  applyReflection,
  buildReflectionPlan,
  describeDiffChange,
  diffReflection,
} from "./reflect";
import { computeConflicts, conflictKey } from "./conflicts";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

const EXISTING_TIMETABLES = [
  { id: 1, name: "デフォルト", type: "regular", startDate: null, endDate: null, grades: [] },
];
const EXISTING_SLOTS = [
  { id: 10, day: "月", time: "18:55-19:40", grade: "中2", cls: "S", room: "602", subj: "社会", teacher: "西岡", note: "", timetableId: 1 },
];

describe("buildReflectionPlan", () => {
  it("教科入りセルをコマ下書きに変換する (講師正規化・教室解決込み)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "英語",
      teacher: "香川・福江", // IME 全角中点 → "·" に正規化される
      note: "隔週(堀上)",
    };
    const plan = buildReflectionPlan(p, { mode: "new", name: "2026 後期" });
    expect(plan.ok).toBe(true);
    expect(plan.drafts).toHaveLength(3);
    const e = plan.drafts.find((d) => d.day === "火");
    expect(e).toEqual({
      day: "火",
      time: "18:00-18:45",
      grade: "中3",
      cls: "S",
      room: "501",
      subj: "英語",
      teacher: "香川·福江",
      note: "隔週(堀上)",
    });
    expect(plan.perTab).toEqual([{ tabName: "中3", count: 3 }]);
  });

  it("新規モードで名前が空ならエラー", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: " " });
    expect(plan.ok).toBe(false);
    expect(plan.errors.join()).toContain("名前");
  });

  it("学年未設定のタブはエラー (1 回だけ報告)", () => {
    const p = makeProject();
    p.tabs[0].grade = "";
    const plan = buildReflectionPlan(p, { mode: "new", name: "x" });
    expect(plan.ok).toBe(false);
    expect(plan.errors.filter((e) => e.includes("学年"))).toHaveLength(1);
  });

  it("時刻が不正な時限はエラーとして報告する", () => {
    const p = makeProject();
    p.periods[0].time = "18時";
    const plan = buildReflectionPlan(p, { mode: "new", name: "x" });
    expect(plan.ok).toBe(false);
    expect(plan.errors.join()).toContain("1限");
  });

  it("教科なし講師ありセルは警告してスキップ、教科入りセルが無ければエラー", () => {
    const p = makeProject();
    p.tabs[0].schedule = {
      [makeCellKey("月", 1, 1)]: { teacher: "堀上" },
    };
    const plan = buildReflectionPlan(p, { mode: "new", name: "x" });
    expect(plan.ok).toBe(false);
    expect(plan.warnings.join()).toContain("教科が未入力");
    expect(plan.errors.join()).toContain("反映できるコマがありません");
  });
});

describe("applyReflection - 新規作成", () => {
  it("時間割 + コマを追加する", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "2026 後期" });
    const result = applyReflection(
      plan,
      { mode: "new", name: "2026 後期", startDate: "2026-08-24", endDate: "" },
      { timetables: EXISTING_TIMETABLES, slots: EXISTING_SLOTS }
    );
    expect(result.error).toBeUndefined();
    expect(result.timetables).toHaveLength(2);
    const tt = result.timetables[1];
    expect(tt).toMatchObject({
      id: 2,
      name: "2026 後期",
      type: "regular",
      startDate: "2026-08-24",
      endDate: null,
      grades: [],
    });
    expect(result.addedCount).toBe(2);
    expect(result.removedCount).toBe(0);
    // 既存コマは無傷、新コマは新 id + 新時間割
    expect(result.slots[0]).toBe(EXISTING_SLOTS[0]);
    const added = result.slots.slice(1);
    expect(added.map((s) => s.id)).toEqual([11, 12]);
    expect(added.every((s) => s.timetableId === 2)).toBe(true);
  });
});

describe("applyReflection - 置き換え", () => {
  const timetables = [
    ...EXISTING_TIMETABLES,
    { id: 2, name: "2026 後期(旧)", type: "regular", startDate: "2026-08-24", endDate: null, grades: [] },
  ];
  const slots = [
    ...EXISTING_SLOTS,
    { id: 20, day: "水", time: "18:00-18:45", grade: "中3", cls: "S", room: "501", subj: "数学", teacher: "片岡", note: "", timetableId: 2 },
  ];

  it("対象時間割のコマだけ差し替え、id は削除分を再利用しない", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
    const result = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 2, name: "", startDate: undefined, endDate: undefined },
      { timetables, slots }
    );
    expect(result.error).toBeUndefined();
    expect(result.removedCount).toBe(1);
    expect(result.addedCount).toBe(2);
    // 旧 id 20 は消え、新 id は全体最大 (20) の続きから
    expect(result.slots.map((s) => s.id)).toEqual([10, 21, 22]);
    // 名前・期間は空指定なら据え置き
    expect(result.timetables[1].name).toBe("2026 後期(旧)");
    expect(result.timetables[1].startDate).toBe("2026-08-24");
  });

  it("名前・期間の指定があれば更新する", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
    const result = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 2, name: "2026 後期", startDate: "2026-08-31", endDate: "2027-02-28" },
      { timetables, slots }
    );
    expect(result.timetables[1]).toMatchObject({
      name: "2026 後期",
      startDate: "2026-08-31",
      endDate: "2027-02-28",
    });
  });

  it("差し替え先が見つからなければエラー", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
    const result = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 99 },
      { timetables, slots }
    );
    expect(result.error).toContain("見つかりません");
  });
});

describe("diffReflection (置き換えの差分プレビュー)", () => {
  const base = { day: "火", time: "18:55-19:40", grade: "中3", cls: "S", room: "501", subj: "数学", teacher: "半田", note: "", timetableId: 2 };
  const D = (over) => ({ day: base.day, time: base.time, grade: base.grade, cls: base.cls, room: base.room, subj: base.subj, teacher: base.teacher, note: base.note, ...over });

  it("完全一致は変わらず、同位置の内容違いは変更", () => {
    const slots = [ { id: 1, ...base }, { id: 2, ...base, cls: "A", room: "502", subj: "国語", teacher: "松川" } ];
    const drafts = [ D({}), D({ cls: "A", room: "502", subj: "国語", teacher: "河野" }) ];
    const diff = diffReflection(drafts, slots, 2);
    expect(diff.unchanged).toBe(1);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].before.teacher).toBe("松川");
    expect(diff.changed[0].after.teacher).toBe("河野");
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("位置ごと違えば追加と削除に分かれる", () => {
    const slots = [{ id: 1, ...base, time: "20:45-21:30" }];
    const drafts = [D({ time: "18:00-18:45" })];
    const diff = diffReflection(drafts, slots, 2);
    expect(diff.unchanged).toBe(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.added.map((r) => r.time)).toEqual(["18:00-18:45"]);
    expect(diff.removed.map((r) => r.time)).toEqual(["20:45-21:30"]);
  });

  it("講師表記の中点ゆれは正規化して比較する (全角中点でも変わらず扱い)", () => {
    const slots = [{ id: 1, ...base, teacher: "香川・福江" }];
    const drafts = [D({ teacher: "香川·福江" })];
    const diff = diffReflection(drafts, slots, 2);
    expect(diff.unchanged).toBe(1);
  });

  it("対象時間割のコマだけ比較する", () => {
    const slots = [ { id: 1, ...base }, { id: 2, ...base, timetableId: 1, subj: "別物" } ];
    const diff = diffReflection([D({})], slots, 2);
    expect(diff.unchanged).toBe(1);
    expect(diff.removed).toHaveLength(0);
  });

  it("describeDiffChange は変わったフィールドだけ並べる", () => {
    const before = { subj: "数学", teacher: "半田", room: "501", note: "" };
    const after = { subj: "数学", teacher: "河野", room: "502", note: "" };
    const text = describeDiffChange(before, after);
    expect(text).toContain("講師 半田 → 河野");
    expect(text).toContain("教室 501 → 502");
    expect(text).not.toContain("数学 →");
  });
});

// ─── 未承認の重なり・NG の警告 ──────────────────────────────────────
// ⚠ 問題バッジを見ないまま反映すると、本体側にも重複がそのまま載る。
// 反映はブロックしない (意図した重なりもある) が必ず警告する。

describe("buildReflectionPlan: 未承認の問題の警告", () => {
  // 月2限 A に、同じ時間帯・同じ講師のコマを足して講師重複を作る
  const withConflict = () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "国語", teacher: "堀上" };
    return p;
  };

  it("未承認の問題があれば warnings に件数と内訳を出す (反映はブロックしない)", () => {
    const plan = buildReflectionPlan(withConflict(), { mode: "new", name: "後期" });
    const warn = plan.warnings.find((w) => w.includes("未承認の問題"));
    expect(warn).toBeTruthy();
    expect(warn).toContain("1 件");
    expect(warn).toContain("講師の重複 1");
    expect(plan.ok).toBe(true);
  });

  it("承認済みの重なりは警告に数えない", () => {
    const p = withConflict();
    const c = computeConflicts(p).list.find((x) => x.type === "teacher");
    p.approvedConflicts = [conflictKey(c)];
    const plan = buildReflectionPlan(p, { mode: "new", name: "後期" });
    expect(plan.warnings.some((w) => w.includes("未承認の問題"))).toBe(false);
  });

  it("問題が無ければ警告も出ない", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "後期" });
    expect(plan.warnings.some((w) => w.includes("未承認の問題"))).toBe(false);
  });
});
