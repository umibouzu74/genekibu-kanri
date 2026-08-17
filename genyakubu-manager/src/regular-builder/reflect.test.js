import { describe, expect, it } from "vitest";
import {
  applyReflection,
  buildReflectionPlan,
  buildSwitchPlan,
  describeDiffChange,
  diffReflection,
  previousDateStr,
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

describe("previousDateStr", () => {
  it("前日を返す (月またぎ・年またぎ・うるう年)", () => {
    expect(previousDateStr("2026-09-01")).toBe("2026-08-31");
    expect(previousDateStr("2026-01-01")).toBe("2025-12-31");
    expect(previousDateStr("2028-03-01")).toBe("2028-02-29");
  });

  it("無効な日付には null", () => {
    expect(previousDateStr("")).toBe(null);
    expect(previousDateStr("2026-09")).toBe(null);
  });
});

describe("buildSwitchPlan", () => {
  const timetables = [
    { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-06", endDate: null, grades: [] },
  ];

  it("切替日の前日を旧時間割の終了日にする", () => {
    const p = buildSwitchPlan({
      timetables,
      slots: EXISTING_SLOTS,
      startDate: "2026-09-01",
      closeTimetableId: 1,
    });
    expect(p.ok).toBe(true);
    expect(p.endDate).toBe("2026-08-31");
    expect(p.target.id).toBe(1);
    expect(p.slotCount).toBe(1);
    expect(p.warnings).toEqual([]);
  });

  it("切替日が無い / 対象が無いときはエラー", () => {
    expect(
      buildSwitchPlan({ timetables, slots: [], startDate: "", closeTimetableId: 1 }).ok
    ).toBe(false);
    expect(
      buildSwitchPlan({ timetables, slots: [], startDate: "2026-09-01", closeTimetableId: 99 }).ok
    ).toBe(false);
  });

  it("旧時間割の開始日より前の切替日はエラー", () => {
    const p = buildSwitchPlan({
      timetables,
      slots: [],
      startDate: "2026-04-01",
      closeTimetableId: 1,
    });
    expect(p.ok).toBe(false);
    expect(p.errors[0]).toContain("開始日");
  });

  it("終了日の上書きと、切替日以降も有効な他の時間割を警告する", () => {
    const p = buildSwitchPlan({
      timetables: [
        { ...timetables[0], endDate: "2026-12-31" },
        { id: 2, name: "附属コース", type: "regular", startDate: null, endDate: null, grades: ["附中3"] },
        { id: 3, name: "2025 後期", type: "regular", startDate: null, endDate: "2026-03-31", grades: [] },
      ],
      slots: [],
      startDate: "2026-09-01",
      closeTimetableId: 1,
    });
    expect(p.ok).toBe(true);
    expect(p.changesEndDate).toBe(true);
    expect(p.warnings[0]).toContain("2026-12-31");
    // 終了済みの「2025 後期」は重ならないので挙げない
    expect(p.warnings[1]).toContain("附属コース");
    expect(p.warnings[1]).not.toContain("2025 後期");
  });

  it("既に切替日より前で終わっている時間割は期間を伸ばさない", () => {
    // 夏期講習で 7/31 に止めてある 1学期を、9/1 の期切替が黙って
    // 8/31 まで伸ばしてしまわないこと
    const closed = [{ ...timetables[0], endDate: "2026-07-31" }];
    const p = buildSwitchPlan({
      timetables: closed,
      slots: [],
      startDate: "2026-09-01",
      closeTimetableId: 1,
    });
    expect(p.ok).toBe(true);
    expect(p.changesEndDate).toBe(false);
    expect(p.warnings[0]).toContain("終了日は変更しません");

    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "2026 2学期" });
    const result = applyReflection(
      plan,
      { mode: "new", name: "2026 2学期", startDate: "2026-09-01", endDate: null, closeTimetableId: 1 },
      { timetables: closed, slots: EXISTING_SLOTS }
    );
    expect(result.timetables[0]).toBe(closed[0]);
    expect(result.closed).toBe(null);
  });

  it("対象学年が交わらない時間割は重なりに挙げない", () => {
    const p = buildSwitchPlan({
      timetables: [
        timetables[0],
        { id: 2, name: "附属コース", type: "regular", startDate: null, endDate: null, grades: ["附中3"] },
      ],
      slots: [],
      startDate: "2026-09-01",
      closeTimetableId: 1,
      grades: ["中1", "中2", "中3"], // 新しい時間割は中学部だけ
    });
    expect(p.warnings).toEqual([]);
  });

  it("表示期間設定の終了日が切替日より前なら警告する (新しい期が画面に出ない)", () => {
    const p = buildSwitchPlan({
      timetables,
      slots: [],
      startDate: "2026-09-01",
      closeTimetableId: 1,
      displayCutoff: {
        groups: [
          { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
          { label: "高校部", grades: ["高3"], startDate: "2026-04-01", date: "2027-03-31" },
        ],
        cohorts: [{ label: "中3 火金", date: "2026-08-20" }],
      },
    });
    expect(p.ok).toBe(true);
    expect(p.warnings[0]).toContain("中学部 〜2026-08-31");
    expect(p.warnings[0]).not.toContain("高校部");
    expect(p.warnings[1]).toContain("コース別終講日");
  });

  it("旧時間割のコマに紐づく授業セットを警告する", () => {
    const p = buildSwitchPlan({
      timetables,
      slots: [
        { id: 10, timetableId: 1, day: "火", grade: "中3" },
        { id: 11, timetableId: 1, day: "金", grade: "中3" },
      ],
      startDate: "2026-09-01",
      closeTimetableId: 1,
      classSets: [
        { id: 1, label: "中3 数学 (火・金)", slotIds: [10, 11] },
        { id: 2, label: "無関係", slotIds: [99] },
      ],
    });
    expect(p.warnings[0]).toContain("授業セット 1 件");
  });
});

describe("applyReflection - 期切替", () => {
  const timetables = [
    { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-06", endDate: null, grades: [] },
  ];

  it("新時間割を作りつつ旧時間割を切替日の前日で終了させる (コマは触らない)", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "2026 2学期" });
    const result = applyReflection(
      plan,
      { mode: "new", name: "2026 2学期", startDate: "2026-09-01", endDate: null, closeTimetableId: 1 },
      { timetables, slots: EXISTING_SLOTS }
    );
    expect(result.error).toBeUndefined();
    expect(result.timetables[0]).toMatchObject({ id: 1, endDate: "2026-08-31" });
    expect(result.timetables[1]).toMatchObject({ id: 2, startDate: "2026-09-01", endDate: null });
    expect(result.closed).toEqual({ id: 1, name: "2026 1学期", endDate: "2026-08-31" });
    // 旧期のコマは残す (代行・調整・回数補正の紐付けを切らない)
    expect(result.slots[0]).toBe(EXISTING_SLOTS[0]);
    expect(result.addedCount).toBe(2);
  });

  it("期切替が成立しないときは反映しない", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "2026 2学期" });
    const result = applyReflection(
      plan,
      { mode: "new", name: "2026 2学期", startDate: null, endDate: null, closeTimetableId: 1 },
      { timetables, slots: EXISTING_SLOTS }
    );
    expect(result.error).toBeTruthy();
    expect(result.timetables).toBeUndefined();
  });

  it("closeTimetableId が無ければ従来どおり旧時間割に触らない", () => {
    const plan = buildReflectionPlan(makeProject(), { mode: "new", name: "2026 2学期" });
    const result = applyReflection(
      plan,
      { mode: "new", name: "2026 2学期", startDate: "2026-09-01", endDate: null },
      { timetables, slots: EXISTING_SLOTS }
    );
    expect(result.timetables[0]).toBe(timetables[0]);
    expect(result.closed).toBe(null);
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

  // 位置 (曜日×時刻×学年×クラス) の一致したコマは slot.id を引き継ぐ。
  // 代行 (sub.slotId) / 調整 / 回数補正 / 授業セット (classSet.slotIds) は
  // すべて slot.id 参照なので、id を振り直すと「変わらず」のコマまで
  // 紐付けが切れてしまう
  describe("id の引き継ぎ", () => {
    // makeProject の下書き = 月1限 中3 S 数学/半田(501) と 月2限 中3 A 英語/堀上(601)
    const draftSlot = (over) => ({
      day: "月", time: "18:00-18:45", grade: "中3", cls: "S", room: "501",
      subj: "数学", teacher: "半田", note: "", timetableId: 2, ...over,
    });

    it("完全一致のコマは id をそのまま保つ", () => {
      const target = [{ id: 20, ...draftSlot() }];
      const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
      const result = applyReflection(
        plan,
        { mode: "replace", targetTimetableId: 2 },
        { timetables, slots: [...EXISTING_SLOTS, ...target] }
      );
      expect(result.keptCount).toBe(1);
      expect(result.changedCount).toBe(0);
      expect(result.removedCount).toBe(0);
      expect(result.addedCount).toBe(1);
      expect(result.slots.find((s) => s.subj === "数学").id).toBe(20);
    });

    it("同じ位置で内容が変わったコマも id を保ち、中身だけ更新する", () => {
      // 講師と備考だけ違う (位置は下書きと同じ)
      const target = [{ id: 20, ...draftSlot({ teacher: "片岡", note: "旧" }) }];
      const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
      const result = applyReflection(
        plan,
        { mode: "replace", targetTimetableId: 2 },
        { timetables, slots: [...EXISTING_SLOTS, ...target] }
      );
      expect(result.keptCount).toBe(1);
      expect(result.changedCount).toBe(1);
      expect(result.removedCount).toBe(0);
      const kept = result.slots.find((s) => s.id === 20);
      expect(kept.teacher).toBe("半田");
      expect(kept.note).toBe("");
    });

    it("下書きに無いコマだけ削除される (差分プレビューと同じ分類)", () => {
      const target = [
        { id: 20, ...draftSlot() },
        { id: 21, ...draftSlot({ day: "水", cls: "B", subj: "国語" }) },
      ];
      const all = [...EXISTING_SLOTS, ...target];
      const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
      const result = applyReflection(
        plan,
        { mode: "replace", targetTimetableId: 2 },
        { timetables, slots: all }
      );
      const diff = diffReflection(plan.drafts, all, 2);
      expect(result.keptCount).toBe(diff.unchanged + diff.changed.length);
      expect(result.removedCount).toBe(diff.removed.length);
      expect(result.addedCount).toBe(diff.added.length);
      expect(result.slots.some((s) => s.id === 21)).toBe(false);
    });

    it("新しいコマの id は削除された id を使い回さない", () => {
      const target = [{ id: 20, ...draftSlot({ day: "水", subj: "国語" }) }];
      const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
      const result = applyReflection(
        plan,
        { mode: "replace", targetTimetableId: 2 },
        { timetables, slots: [...EXISTING_SLOTS, ...target] }
      );
      expect(result.slots.map((s) => s.id).sort((a, b) => a - b)).toEqual([10, 21, 22]);
    });

    it("下書きが知らないフィールドは既存コマのものを残す", () => {
      const target = [{ id: 20, ...draftSlot(), customFlag: true }];
      const plan = buildReflectionPlan(makeProject(), { mode: "replace" });
      const result = applyReflection(
        plan,
        { mode: "replace", targetTimetableId: 2 },
        { timetables, slots: [...EXISTING_SLOTS, ...target] }
      );
      expect(result.slots.find((s) => s.id === 20).customFlag).toBe(true);
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

// ─── 部分反映 (学年・曜日を選んだ範囲だけ反映する) ──────────────────
// 一番の勘所は「**範囲外の既存コマが消えないこと**」。反映の突き合わせは
// 「下書きに無い既存コマは削除」なので、下書きだけ絞ると範囲外まで消える。
describe("部分反映 (scope)", () => {
  // 中3 (月・火) + 中2 (火・土) の 2 学年ぶんの下書き
  function makeScopeProject() {
    const p = makeProject();
    p.tabs[0].days = ["月", "火", "土"];
    p.tabs[0].schedule[makeCellKey("土", 1, 1)] = { subj: "国語", teacher: "堀上" };
    p.tabs.push({
      id: 2,
      name: "中2",
      grade: "中2",
      classes: [{ id: 1, label: "S", room: "601" }],
      days: ["火", "土"],
      periodIds: [1, 2],
      schedule: {
        [makeCellKey("火", 1, 1)]: { subj: "社会", teacher: "半田" },
        [makeCellKey("土", 1, 1)]: { subj: "理科", teacher: "半田" },
      },
    });
    return p;
  }

  it("曜日で絞ると、その曜日の下書きだけが drafts に入る", () => {
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "new",
      name: "土曜のみ",
      scope: { days: ["土"] },
    });
    expect(plan.ok).toBe(true);
    expect(plan.drafts.every((d) => d.day === "土")).toBe(true);
    expect(plan.drafts).toHaveLength(2); // 中3 国語 + 中2 理科
  });

  it("学年で絞ると、その学年の下書きだけが drafts に入る", () => {
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "new",
      name: "中2のみ",
      scope: { grades: ["中2"] },
    });
    expect(plan.drafts.every((d) => d.grade === "中2")).toBe(true);
    expect(plan.drafts).toHaveLength(2);
  });

  it("学年 × 曜日は AND", () => {
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "new",
      name: "中2の土曜",
      scope: { grades: ["中2"], days: ["土"] },
    });
    expect(plan.drafts).toHaveLength(1);
    expect(plan.drafts[0]).toMatchObject({ day: "土", grade: "中2", subj: "理科" });
  });

  it("範囲に該当するセルが無ければ、範囲を書いたエラーで止める", () => {
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "new",
      name: "x",
      scope: { days: ["水"] },
    });
    expect(plan.ok).toBe(false);
    expect(plan.errors.join()).toContain("水曜");
  });

  it("scope 未指定なら従来どおりプロジェクト全体", () => {
    const p = makeScopeProject();
    const all = buildReflectionPlan(p, { mode: "new", name: "x" });
    const empty = buildReflectionPlan(p, { mode: "new", name: "x", scope: {} });
    expect(empty.drafts).toEqual(all.drafts);
    expect(all.drafts).toHaveLength(5);
  });

  // ── 置き換えモードの安全性 ────────────────────────────────────────
  const TT = [{ id: 1, name: "現行", type: "regular", startDate: null, endDate: null, grades: [] }];
  // 置き換え先には「範囲外」の月曜コマと、範囲内の土曜コマが入っている
  const SLOTS = [
    { id: 10, day: "月", time: "18:00-18:45", grade: "中3", cls: "S", room: "501", subj: "数学", teacher: "半田", note: "", timetableId: 1 },
    { id: 11, day: "土", time: "18:00-18:45", grade: "中3", cls: "S", room: "501", subj: "古い科目", teacher: "誰か", note: "", timetableId: 1 },
    { id: 12, day: "土", time: "18:55-19:40", grade: "中3", cls: "A", room: "502", subj: "消える", teacher: "誰か", note: "", timetableId: 1 },
    // 下書きに無い月曜のコマ。範囲を絞れば残り、絞らなければ消える
    { id: 13, day: "月", time: "20:40-20:55", grade: "中3", cls: "S", room: "501", subj: "補習", teacher: "誰か", note: "", timetableId: 1 },
  ];

  it("置き換えで範囲外の既存コマを消さない (最重要)", () => {
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "replace",
      name: "現行",
      scope: { days: ["土"], grades: ["中3"] },
    });
    const out = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 1, scope: { days: ["土"], grades: ["中3"] } },
      { timetables: TT, slots: SLOTS }
    );
    // 月曜のコマは範囲外なので手つかずで残る — 下書きに無い id 13 も含めて
    const monday = out.slots.find((s) => s.id === 10);
    expect(monday).toBeDefined();
    expect(monday.subj).toBe("数学");
    const notInDraft = out.slots.find((s) => s.id === 13);
    expect(notInDraft).toBeDefined();
    expect(notInDraft.subj).toBe("補習");
    expect(out.untouchedCount).toBe(2);
  });

  it("範囲内の既存コマは従来どおり id を保って上書き / 不要分は削除される", () => {
    const scope = { days: ["土"], grades: ["中3"] };
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "replace",
      name: "現行",
      scope,
    });
    const out = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 1, scope },
      { timetables: TT, slots: SLOTS }
    );
    // 土曜 1限 S は位置が一致するので id 11 を引き継いで中身が入れ替わる
    const kept = out.slots.find((s) => s.id === 11);
    expect(kept).toMatchObject({ day: "土", subj: "国語", teacher: "堀上" });
    // 下書きに無い土曜 2限 A (id 12) は削除される
    expect(out.slots.some((s) => s.id === 12)).toBe(false);
    expect(out.removedCount).toBe(1);
  });

  it("絞らない置き換えは従来どおり (範囲外という概念が無い)", () => {
    const p = makeScopeProject();
    const plan = buildReflectionPlan(p, { mode: "replace", name: "現行" });
    const out = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 1 },
      { timetables: TT, slots: SLOTS }
    );
    expect(out.untouchedCount).toBe(0);
    // 下書きに無い月曜のコマ (id 13) は、絞らなければ従来どおり消える
    expect(out.slots.some((s) => s.id === 13)).toBe(false);
    // 下書きと一致する月曜のコマ (id 10) は id を保って残る
    expect(out.slots.some((s) => s.id === 10)).toBe(true);
  });

  it("差分プレビューも同じ範囲で絞る (触らないコマを削除として見せない)", () => {
    const scope = { days: ["土"], grades: ["中3"] };
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "replace",
      name: "現行",
      scope,
    });
    const diff = diffReflection(plan.drafts, SLOTS, 1, scope);
    // 月曜の id 10 は削除に出てはいけない
    expect(diff.removed.some((r) => r.day === "月")).toBe(false);
    expect(diff.removed).toHaveLength(1); // 土曜 2限 A だけ

    // 範囲を渡し忘れると月曜まで削除として出る (= 渡す必要がある証明)
    const wrong = diffReflection(plan.drafts, SLOTS, 1);
    expect(wrong.removed.some((r) => r.day === "月")).toBe(true);
  });

  it("プレビューの削除件数と実際の削除件数が一致する", () => {
    const scope = { days: ["土"], grades: ["中3"] };
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "replace",
      name: "現行",
      scope,
    });
    const diff = diffReflection(plan.drafts, SLOTS, 1, scope);
    const out = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 1, scope },
      { timetables: TT, slots: SLOTS }
    );
    expect(diff.removed.length).toBe(out.removedCount);
    expect(diff.added.length).toBe(out.addedCount);
  });

  it("コマの総数が保存される (範囲外 + 残り + 追加)", () => {
    const scope = { days: ["土"], grades: ["中3"] };
    const plan = buildReflectionPlan(makeScopeProject(), {
      mode: "replace",
      name: "現行",
      scope,
    });
    const out = applyReflection(
      plan,
      { mode: "replace", targetTimetableId: 1, scope },
      { timetables: TT, slots: SLOTS }
    );
    expect(out.slots).toHaveLength(
      SLOTS.length - out.removedCount + out.addedCount
    );
  });

  it("範囲外だけで起きている未承認の重なりは警告しない", () => {
    const p = makeScopeProject();
    // 月曜 1限に同じ講師をもう 1 コマ置いて、月曜だけで重なりを作る
    p.tabs[0].schedule[makeCellKey("月", 1, 2)] = { subj: "数学", teacher: "半田" };
    const conflicts = computeConflicts(p).list;
    expect(conflicts.some((c) => c.day === "月")).toBe(true);

    // 土曜だけ反映するなら、月曜の重なりは持ち込まれない
    const scoped = buildReflectionPlan(p, {
      mode: "new",
      name: "x",
      scope: { days: ["土"] },
    });
    expect(scoped.warnings.join()).not.toContain("未承認の問題");

    // 絞らなければ従来どおり警告する
    const all = buildReflectionPlan(p, { mode: "new", name: "x" });
    expect(all.warnings.join()).toContain("未承認の問題");
  });
});
