import { describe, expect, it } from "vitest";
import {
  PATTERN,
  TEST_ROTATION,
  classifyDayPattern,
  clusterBusTimes,
  collectLessonTimes,
  formatTestSubjects,
  isFuzokuLessonSlot,
  isFuzokuTestSlot,
  nextRotationIndex,
  parseBusTimes,
  planPatternChange,
  resolveTestChain,
  rotationSubjects,
  setFuzokuNote,
  setFuzokuTestEntry,
  shortFuzokuGrade,
  sortByRotation,
  suggestPatternFromBus,
  testSlotAppliesToGrade,
} from "./fuzokuPlan";

// 附属の水曜 (2026 年度): ①16:25 ②17:35 ③18:45 ④19:55 + テ 21:00 (学年共通)
const LESSON_TIMES = ["16:25-17:25", "17:35-18:35", "18:45-19:45", "19:55-20:55"];
const GRADES = ["附中", "附中1", "附中2", "附中3"];
const LESSON_GRADES = ["附中1", "附中2", "附中3"];
const slot = (over = {}) => ({
  id: 1,
  day: "水",
  time: "16:25-17:25",
  grade: "附中1",
  cls: "-",
  room: "401",
  subj: "理科",
  teacher: "武下",
  note: "",
  ...over,
});

describe("対象のコマ", () => {
  it("確認テストと授業を見分ける", () => {
    const test = slot({ grade: "附中", time: "21:00-21:30", subj: "確認テスト" });
    expect(isFuzokuTestSlot(test)).toBe(true);
    expect(isFuzokuLessonSlot(test)).toBe(false);
    expect(isFuzokuLessonSlot(slot())).toBe(true);
    expect(isFuzokuLessonSlot(slot({ grade: "中1" }))).toBe(false);
    expect(isFuzokuTestSlot(slot({ grade: "中1", subj: "確認テスト" }))).toBe(false);
  });

  it("学年共通のテストは全学年に、学年別のテストはその学年だけに当たる", () => {
    expect(testSlotAppliesToGrade({ grade: "附中" }, "附中2")).toBe(true);
    expect(testSlotAppliesToGrade({ grade: "附中1" }, "附中1")).toBe(true);
    expect(testSlotAppliesToGrade({ grade: "附中1" }, "附中2")).toBe(false);
  });

  it("見出しの学年名", () => {
    expect(shortFuzokuGrade("附中1")).toBe("中1");
    expect(shortFuzokuGrade("附中")).toBe("附中");
  });

  it("授業の時間帯にテストの時間帯を混ぜない (授業 3 コマの日にテストを読み替えない)", () => {
    const daySlots = [
      slot({ time: "16:25-17:25" }),
      slot({ id: 2, time: "17:35-18:35" }),
      slot({ id: 3, time: "18:45-19:45" }),
      slot({ id: 4, grade: "附中", time: "21:00-21:30", subj: "確認テスト" }),
      slot({ id: 5, grade: "中3", time: "15:00-16:00" }),
    ];
    expect(collectLessonTimes(daySlots)).toEqual(["16:25-17:25", "17:35-18:35", "18:45-19:45"]);
  });
});

describe("バス時刻 → 時程の提案 (附属の予定表の実例)", () => {
  it("時刻を拾う (×本数・全角・注記に耐える)", () => {
    expect(parseBusTimes("15:20×2 15:30×1")).toEqual([920, 930]);
    expect(parseBusTimes("１６：１５×１（正門）\n１７：２０×２")).toEqual([975, 1040]);
    expect(parseBusTimes("行7:44×1 帰16:05×1")).toEqual([464, 965]);
    expect(parseBusTimes("")).toEqual([]);
    expect(parseBusTimes("－")).toEqual([]);
    expect(parseBusTimes("25:00 12:75")).toEqual([]);
  });

  it("近い便はまとめ、離れた便は別にする", () => {
    expect(clusterBusTimes([920, 930, 1040])).toEqual([[920, 930], [1040]]);
    expect(clusterBusTimes([965, 1040])).toEqual([[965], [1040]]);
  });

  it("30 分おきの便を数珠つなぎに 1 本にしない (最初の便から数える)", () => {
    // 15:30 / 16:00 / 16:30 → 16:30 は 15:30 の 1 時間後なので別の便
    expect(clusterBusTimes([930, 960, 990])).toEqual([[930, 960], [990]]);
    expect(suggestPatternFromBus("15:30×2 16:00×1 16:30×1")).toEqual({
      kind: "compress",
      ref: "16:00",
      others: ["16:30"],
    });
  });

  it.each([
    ["15:20×2 15:30×1", "normal", "15:30", []],
    ["12:25×2 12:35×1", "normal", "12:35", []],
    ["15:05×1 17:20×2", "normal", "15:05", ["17:20"]],
    ["16:05×1 17:20×2", "compress", "16:05", ["17:20"]],
    ["16:15×1", "compress", "16:15", []],
    ["16:05×1 16:15×1", "compress", "16:15", []],
    ["16:30×1", "unknown", "16:30", []],
  ])("%s → %s (基準 %s)", (text, kind, ref, others) => {
    expect(suggestPatternFromBus(text)).toEqual({ kind, ref, others });
  });

  it("時刻が無ければ提案しない", () => {
    expect(suggestPatternFromBus("")).toBe(null);
    expect(suggestPatternFromBus("なし")).toBe(null);
  });
});

describe("時程 (特別時程のレコードとの対応)", () => {
  const compress = (over = {}) => ({
    id: 7,
    date: "2026-09-30",
    label: "附属 50分授業 (17:00開始)",
    targetGrades: GRADES,
    timeMap: [
      { from: "16:25-17:25", to: "17:00-17:50" },
      { from: "17:35-18:35", to: "18:00-18:50" },
      { from: "18:45-19:45", to: "19:00-19:50" },
      { from: "19:55-20:55", to: "20:00-20:50" },
    ],
    cancelTimes: [],
    memo: "",
    ...over,
  });
  const classify = (daySchedules, over = {}) =>
    classifyDayPattern({
      date: "2026-09-30",
      daySchedules,
      grades: GRADES,
      lessonGrades: LESSON_GRADES,
      lessonTimes: LESSON_TIMES,
      ...over,
    });

  it("特別時程が無ければ通常", () => {
    expect(classify([]).kind).toBe(PATTERN.NORMAL);
    // 別の日・附属以外の学年のものは見ない
    expect(classify([compress({ date: "2026-10-07" })]).kind).toBe(PATTERN.NORMAL);
    expect(classify([compress({ targetGrades: ["中3"] })]).kind).toBe(PATTERN.NORMAL);
  });

  it("中身がプリセットと同じなら 50分 / 1限カット (ラベルは見ない)", () => {
    expect(classify([compress()]).kind).toBe(PATTERN.COMPRESS);
    expect(classify([compress({ label: "文化祭のため" })]).kind).toBe(PATTERN.COMPRESS);
    expect(
      classify([compress({ timeMap: [], cancelTimes: ["16:25-17:25"], label: "x" })]).kind
    ).toBe(PATTERN.CUT_FIRST);
  });

  it("プリセットと違う中身・学年の欠け・2 件以上は個別の特別時程", () => {
    expect(classify([compress({ timeMap: compress().timeMap.slice(0, 2) })]).kind).toBe(
      PATTERN.CUSTOM
    );
    expect(classify([compress({ targetGrades: ["附中1", "附中2"] })]).kind).toBe(PATTERN.CUSTOM);
    expect(classify([compress(), compress({ id: 8, timeMap: [], cancelTimes: ["x"] })]).kind).toBe(
      PATTERN.CUSTOM
    );
  });

  it("通常 → 50分: 附属の学年ぜんぶを対象に 50分授業のレコードを足す", () => {
    const plan = planPatternChange({
      current: classify([]),
      target: PATTERN.COMPRESS,
      grades: GRADES,
      lessonTimes: LESSON_TIMES,
    });
    expect(plan.action).toBe("add");
    expect(plan.entry).toEqual({
      label: "附属 50分授業 (17:00開始)",
      timeMap: compress().timeMap,
      cancelTimes: [],
      targetGrades: GRADES,
      memo: "",
    });
  });

  it("50分 → 通常は削除、50分 → 1限カットは書き換え", () => {
    const current = classify([compress()]);
    expect(
      planPatternChange({ current, target: PATTERN.NORMAL, grades: GRADES, lessonTimes: LESSON_TIMES })
    ).toEqual({ action: "remove", id: 7 });
    expect(
      planPatternChange({ current, target: PATTERN.CUT_FIRST, grades: GRADES, lessonTimes: LESSON_TIMES })
    ).toEqual({
      action: "update",
      id: 7,
      patch: { label: "附属 1限カット", timeMap: [], cancelTimes: ["16:25-17:25"] },
    });
    expect(
      planPatternChange({ current, target: PATTERN.COMPRESS, grades: GRADES, lessonTimes: LESSON_TIMES })
    ).toEqual({ action: "none" });
  });

  it("個別の特別時程の日は切り替えない", () => {
    const current = classify([compress({ targetGrades: ["附中1"] })]);
    expect(current.kind).toBe(PATTERN.CUSTOM);
    const plan = planPatternChange({
      current,
      target: PATTERN.NORMAL,
      grades: GRADES,
      lessonTimes: LESSON_TIMES,
    });
    expect(plan.action).toBe("blocked");
  });

  it("読み替える時間帯が無ければ足さない", () => {
    const plan = planPatternChange({
      current: classify([], { lessonTimes: [] }),
      target: PATTERN.COMPRESS,
      grades: GRADES,
      lessonTimes: [],
    });
    expect(plan.action).toBe("blocked");
  });
});

describe("保存データの書き換え", () => {
  it("学校メモ: 片方だけ書き換え、両方空で消す", () => {
    let plan = setFuzokuNote(undefined, "2026-10-07", { bus: "12:30×2 12:40×1" });
    expect(plan.notes["2026-10-07"]).toEqual({ bus: "12:30×2 12:40×1" });
    plan = setFuzokuNote(plan, "2026-10-07", { memo: "3時間授業" });
    expect(plan.notes["2026-10-07"]).toEqual({ bus: "12:30×2 12:40×1", memo: "3時間授業" });
    plan = setFuzokuNote(plan, "2026-10-07", { bus: "  " });
    expect(plan.notes["2026-10-07"]).toEqual({ memo: "3時間授業" });
    plan = setFuzokuNote(plan, "2026-10-07", { memo: "" });
    expect(plan.notes).toEqual({});
  });

  it("確認テスト: 科目 / なし / 自動に戻す", () => {
    let plan = setFuzokuTestEntry(undefined, "2026-10-07", "附中1", { subjects: ["英", "数"] });
    plan = setFuzokuTestEntry(plan, "2026-10-07", "附中2", { none: true });
    expect(plan.tests["2026-10-07"]).toEqual({
      附中1: { subjects: ["英", "数"] },
      附中2: { none: true },
    });
    plan = setFuzokuTestEntry(plan, "2026-10-07", "附中1", null);
    plan = setFuzokuTestEntry(plan, "2026-10-07", "附中2", { subjects: [] });
    expect(plan.tests).toEqual({});
  });
});

describe("確認テストのローテーション", () => {
  it("英→数→国→理→社 を 2 科目ずつ回る", () => {
    expect(TEST_ROTATION).toEqual(["英", "数", "国", "理", "社"]);
    expect(rotationSubjects(0)).toEqual(["英", "数"]);
    expect(rotationSubjects(4)).toEqual(["社", "英"]);
    expect(nextRotationIndex(["社", "英"], 4)).toBe(1);
    expect(nextRotationIndex(["英"], 0)).toBe(1);
    expect(nextRotationIndex(["漢字"], 3)).toBe(3);
  });

  it("手で選んだ科目をローテーションの順に並べる", () => {
    expect(sortByRotation(["英", "社"], 4)).toEqual(["社", "英"]);
    expect(sortByRotation(["数", "英"], 0)).toEqual(["英", "数"]);
    expect(sortByRotation(["理", "国"], null)).toEqual(["国", "理"]);
  });

  it("続いている選び方は並びの頭から (起点の週・pos とずれた週でも)", () => {
    // 期の最初の週 (pos 不明) に 社・英 → 社→英 (次の週は 数 から)
    expect(sortByRotation(["社", "英"], null)).toEqual(["社", "英"]);
    expect(sortByRotation(["英", "社"], null)).toEqual(["社", "英"]);
    // 自動が「国 理」の週を 数・国 に変えた → 数→国 (次の週は 理 から)
    expect(sortByRotation(["国", "数"], 2)).toEqual(["数", "国"]);
    expect(sortByRotation(["英", "社", "理"], 0)).toEqual(["理", "社", "英"]);
    // 飛び飛びは pos から数えた順
    expect(sortByRotation(["理", "英"], 3)).toEqual(["理", "英"]);
    expect(sortByRotation(["理", "英"], null)).toEqual(["英", "理"]);
    // 5 科目ぜんぶは pos から
    expect(sortByRotation([...TEST_ROTATION], 2)).toEqual(["国", "理", "社", "英", "数"]);
  });

  const D = ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"];
  const all = () => true;
  const pick = (m) => D.map((d) => [m.get(d).kind, m.get(d).subjects.join("")]);

  it("起点が無ければ自動にしない (未設定)", () => {
    const m = resolveTestChain({ dates: D, isHeld: (d) => d !== "2026-10-21", entries: {} });
    expect(pick(m)).toEqual([
      ["unset", ""],
      ["unset", ""],
      ["off", ""],
      ["unset", ""],
      ["unset", ""],
    ]);
  });

  it("手で決めた週から回り、休みの週・なしの週は進めない", () => {
    const m = resolveTestChain({
      dates: D,
      isHeld: (d) => d !== "2026-10-21",
      entries: { "2026-10-07": { subjects: ["英", "数"] }, "2026-10-28": { none: true } },
    });
    expect(pick(m)).toEqual([
      ["manual", "英数"],
      ["auto", "国理"],
      ["off", ""],
      ["none", ""],
      ["auto", "社英"],
    ]);
    expect(m.get("2026-10-14").posBefore).toBe(2);
  });

  it("1 科目だけの週の次は、その次の科目から", () => {
    const m = resolveTestChain({
      dates: D,
      isHeld: all,
      entries: { "2026-10-07": { subjects: ["社"] } },
    });
    expect(pick(m).slice(0, 3)).toEqual([
      ["manual", "社"],
      ["auto", "英数"],
      ["auto", "国理"],
    ]);
  });

  it("途中の手動指定は起点を付け替える", () => {
    const m = resolveTestChain({
      dates: D,
      isHeld: all,
      entries: { "2026-10-07": { subjects: ["英", "数"] }, "2026-10-14": { subjects: ["理", "社"] } },
    });
    expect(pick(m).slice(0, 3)).toEqual([
      ["manual", "英数"],
      ["manual", "理社"],
      ["auto", "英数"],
    ]);
  });

  it("期が変わったら自動を止める (新しい期は最初の週を手で決める)", () => {
    const m = resolveTestChain({
      dates: D,
      isHeld: all,
      entries: { "2026-10-07": { subjects: ["英", "数"] } },
      scopeKeyOf: (d) => (d < "2026-10-21" ? "1|2026-04-01" : d === "2026-10-21" ? null : "2|2026-10-28"),
    });
    expect(pick(m)).toEqual([
      ["manual", "英数"],
      ["auto", "国理"],
      ["auto", "社英"], // 期の識別子が無い日は区切りにしない
      ["unset", ""],
      ["unset", ""],
    ]);
  });

  it("休みの判定の日でも手で決めたものは manual (held で見分ける)", () => {
    const m = resolveTestChain({
      dates: D.slice(0, 2),
      isHeld: () => false,
      entries: { "2026-10-07": { subjects: ["英", "数"] } },
    });
    expect(m.get("2026-10-07")).toMatchObject({ kind: "manual", held: false });
    expect(m.get("2026-10-14").kind).toBe("off");
  });

  it("表示", () => {
    expect(formatTestSubjects({ kind: "auto", subjects: ["英", "数"] })).toBe("英 数");
    expect(formatTestSubjects({ kind: "none", subjects: [] })).toBe("なし");
    expect(formatTestSubjects({ kind: "unset", subjects: [] })).toBe("—");
  });
});
