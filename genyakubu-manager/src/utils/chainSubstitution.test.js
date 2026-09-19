import { describe, expect, it } from "vitest";
import {
  IDLE_TEACHER_REASON,
  classifySlotForTeacher,
  collectAllTeacherNames,
  computeAvailableTeachers,
  resolveTeacherSubjectIds,
  scoreSubstituteCandidate,
  sortAvailableTeachers,
  suggestChainSubstitutions,
  timeOverlaps,
  validateSubstituteChange,
} from "./chainSubstitution";

// ─── Shared fixtures ──────────────────────────────────────────────
// Integration tests focus on behaviour visible through the 3 public
// functions. All dependencies (biweekly, subjectMatch, timetable,
// dashboardHelpers) are exercised with realistic data — no mocks.

const subjects = [
  { id: 1, name: "英語", categoryId: 1 },
  { id: 2, name: "数学", categoryId: 2 },
  { id: 3, name: "国語", categoryId: 1 }, // 同カテゴリ = 英語
];

const subjectCategories = [
  { id: 1, name: "文系" },
  { id: 2, name: "理系" },
];

const partTimeStaff = [
  { id: 1, name: "バイト英語", subjectIds: [1] }, // 英語のみ
  { id: 2, name: "バイト数学", subjectIds: [2] }, // 数学のみ
  { id: 3, name: "バイト文系", subjectIds: [1, 3] }, // 英語・国語
];

const makeSlot = (overrides = {}) => ({
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "高1",
  cls: "S",
  room: "601",
  subj: "英語",
  teacher: "山田",
  note: "",
  ...overrides,
});

// 2026-04-13 is a Monday; 2026-04-06 is also Monday (anchor A → "B" week on the 13th).
const MONDAY = "2026-04-13";
const ANCHORS = [{ date: "2026-04-06", weekType: "A" }];

// ─── Unit tests for extracted helpers ─────────────────────────────

describe("timeOverlaps", () => {
  it("完全一致は重複", () => {
    expect(timeOverlaps("19:00-20:20", "19:00-20:20")).toBe(true);
  });
  it("部分的にかぶれば重複", () => {
    expect(timeOverlaps("19:00-20:20", "20:00-21:00")).toBe(true);
  });
  it("境界が接するだけ (a.end === b.start) は重複しない (半開区間)", () => {
    expect(timeOverlaps("19:00-20:20", "20:20-21:40")).toBe(false);
  });
  it("前後に離れていれば重複しない", () => {
    expect(timeOverlaps("19:00-20:20", "21:00-22:00")).toBe(false);
  });
  it("一方が他方を完全に含む", () => {
    expect(timeOverlaps("19:00-22:00", "20:00-21:00")).toBe(true);
  });
});

describe("scoreSubstituteCandidate", () => {
  const subs = [
    { id: 1, name: "英語", categoryId: 1 },
    { id: 2, name: "数学", categoryId: 2 },
    { id: 3, name: "国語", categoryId: 1 },
  ];
  const baseTeacher = {
    isFreeAllDay: false,
    isPartTime: true,
    subjectIds: [],
  };

  it("完全一致で +10", () => {
    const s = scoreSubstituteCandidate({ ...baseTeacher, subjectIds: [1] }, 1, subs);
    expect(s).toBe(10);
  });
  it("カテゴリ一致で +5", () => {
    const s = scoreSubstituteCandidate({ ...baseTeacher, subjectIds: [3] }, 1, subs);
    expect(s).toBe(5);
  });
  it("マッチしないなら 0", () => {
    const s = scoreSubstituteCandidate({ ...baseTeacher, subjectIds: [2] }, 1, subs);
    expect(s).toBe(0);
  });
  it("isFreeAllDay で +3 加算", () => {
    const s = scoreSubstituteCandidate(
      { ...baseTeacher, subjectIds: [1], isFreeAllDay: true },
      1,
      subs
    );
    expect(s).toBe(13);
  });
  it("正社員 (isPartTime=false) で +2 加算", () => {
    const s = scoreSubstituteCandidate(
      { ...baseTeacher, subjectIds: [1], isPartTime: false },
      1,
      subs
    );
    expect(s).toBe(12);
  });
  it("slotSubjectId=null なら教科点は 0", () => {
    const s = scoreSubstituteCandidate(
      { ...baseTeacher, subjectIds: [1], isFreeAllDay: true },
      null,
      subs
    );
    expect(s).toBe(3); // isFreeAllDay のみ
  });
  it("完全一致・isFreeAllDay・正社員が全部揃えば 15", () => {
    const s = scoreSubstituteCandidate(
      {
        subjectIds: [1],
        isFreeAllDay: true,
        isPartTime: false,
      },
      1,
      subs
    );
    expect(s).toBe(15);
  });
});

describe("classifySlotForTeacher", () => {
  const baseSlot = {
    id: 1,
    day: "月",
    time: "19:00-20:20",
    grade: "高1",
    cls: "S",
    room: "601",
    subj: "英語",
    teacher: "A太郎",
    note: "",
  };
  const anchors = [{ date: "2026-04-06", weekType: "A" }];
  const MON_B = "2026-04-13"; // 1 週後 → B週
  const MON_A = "2026-04-06"; // A週

  it("通常スロット・休講なし → active", () => {
    const r = classifySlotForTeacher(baseSlot, "A太郎", MON_B, anchors, false);
    expect(r.status).toBe("active");
    expect(r.reason).toBeNull();
  });

  it("B 週の隔週メイン教師 → cancelled(隔週(B週))", () => {
    const slot = { ...baseSlot, note: "隔週(B子)" };
    const r = classifySlotForTeacher(slot, "A太郎", MON_B, anchors, false);
    expect(r.status).toBe("cancelled");
    expect(r.reason).toBe("隔週(B週)");
  });

  it("A 週の隔週パートナー → cancelled(隔週(A週))", () => {
    const slot = { ...baseSlot, note: "隔週(B子)" };
    const r = classifySlotForTeacher(slot, "B子", MON_A, anchors, false);
    expect(r.status).toBe("cancelled");
    expect(r.reason).toBe("隔週(A週)");
  });

  it("A 週のメイン教師は active (隔週でもその週は担当)", () => {
    const slot = { ...baseSlot, note: "隔週(B子)" };
    const r = classifySlotForTeacher(slot, "A太郎", MON_A, anchors, false);
    expect(r.status).toBe("active");
  });

  it("cancelledByHoliday=true + grade=高 → cancelled(高校部休講)", () => {
    const r = classifySlotForTeacher(baseSlot, "A太郎", MON_B, anchors, true);
    expect(r.status).toBe("cancelled");
    expect(r.reason).toBe("高校部休講");
  });

  it("cancelledByHoliday=true + grade=中 → cancelled(中学部休講)", () => {
    const slot = { ...baseSlot, grade: "中2" };
    const r = classifySlotForTeacher(slot, "A太郎", MON_B, anchors, true);
    expect(r.status).toBe("cancelled");
    expect(r.reason).toBe("中学部休講");
  });

  it("隔週の条件が優先され、休講でも隔週理由が優先される", () => {
    const slot = { ...baseSlot, note: "隔週(B子)" };
    const r = classifySlotForTeacher(slot, "A太郎", MON_B, anchors, true);
    expect(r.reason).toBe("隔週(B週)");
  });

  it("holidays を渡すと隔週の A/B も休講シフトを反映する", () => {
    // 月曜 anchor (4/6=A) で 4/13 が本来 B 週。途中の月曜 4/13 を休講にする
    // と、4/20 は本来 A 週だが補正で B 週へ反転する。
    // すると 4/20 で「A太郎 (メイン)」は cancelled (隔週(B週)) になる。
    const slot = { ...baseSlot, note: "隔週(B子)" };
    const holidays = [
      { id: 1, date: "2026-04-13", label: "X", scope: ["全部"], targetGrades: [], subjKeywords: [] },
    ];
    // 補正なしなら 4/20 は A 週で active になる
    const baseline = classifySlotForTeacher(slot, "A太郎", "2026-04-20", anchors, false);
    expect(baseline.status).toBe("active");
    // 補正ありなら B 週へ反転 → メイン教師は cancelled
    const shifted = classifySlotForTeacher(
      slot, "A太郎", "2026-04-20", anchors, false, holidays
    );
    expect(shifted.status).toBe("cancelled");
    expect(shifted.reason).toBe("隔週(B週)");
  });
});

describe("resolveTeacherSubjectIds", () => {
  const subjects = [
    { id: 1, name: "英語", categoryId: 1 },
    { id: 2, name: "数学", categoryId: 2 },
  ];
  const partTimeStaff = [
    { id: 1, name: "バイトA", subjectIds: [1, 2] },
  ];
  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));

  it("teacherSubjects が最優先", () => {
    const r = resolveTeacherSubjectIds("バイトA", {
      teacherSubjects: { バイトA: [1] },
      partTimeStaff,
      staffNameSet,
      slots: [],
      subjects,
    });
    expect(r).toEqual([1]);
  });

  it("teacherSubjects が空配列なら partTimeStaff.subjectIds", () => {
    const r = resolveTeacherSubjectIds("バイトA", {
      teacherSubjects: { バイトA: [] },
      partTimeStaff,
      staffNameSet,
      slots: [],
      subjects,
    });
    expect(r).toEqual([1, 2]);
  });

  it("staff にいて teacherSubjects 指定なし → partTimeStaff.subjectIds", () => {
    const r = resolveTeacherSubjectIds("バイトA", {
      teacherSubjects: {},
      partTimeStaff,
      staffNameSet,
      slots: [],
      subjects,
    });
    expect(r).toEqual([1, 2]);
  });

  it("非 staff はスロット由来で推定", () => {
    const slots = [
      { id: 1, subj: "英語", teacher: "山田", note: "" },
    ];
    const r = resolveTeacherSubjectIds("山田", {
      teacherSubjects: {},
      partTimeStaff,
      staffNameSet,
      slots,
      subjects,
    });
    expect(r).toEqual([1]);
  });

  it("staff だが partTimeStaff に見つからないなら []", () => {
    const r = resolveTeacherSubjectIds("バイトMissing", {
      teacherSubjects: {},
      partTimeStaff,
      staffNameSet: new Set(["バイトMissing"]),
      slots: [],
      subjects,
    });
    expect(r).toEqual([]);
  });
});

// ─── Integration tests (以下は安全網として 3 公開関数を end-to-end で検証) ─

describe("computeAvailableTeachers", () => {
  it("休講がなければ誰も空きにならない", () => {
    const slots = [makeSlot({ id: 1, teacher: "山田" })];
    const result = computeAvailableTeachers(
      MONDAY,
      slots,
      [],
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    expect(result).toEqual([]);
  });

  it("部全体休講なら全講師が isFreeAllDay:true になる", () => {
    const slots = [
      makeSlot({ id: 1, teacher: "山田", subj: "英語" }),
      makeSlot({ id: 2, teacher: "鈴木", subj: "数学", time: "20:30-21:50" }),
    ];
    const holidays = [{ date: MONDAY, scope: ["全部"] }];
    const result = computeAvailableTeachers(
      MONDAY,
      slots,
      holidays,
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.isFreeAllDay)).toBe(true);
    expect(result.map((t) => t.name).sort()).toEqual(["山田", "鈴木"]);
  });

  it("B週には隔週メイン教師が空きになる", () => {
    const slots = [
      makeSlot({ id: 1, teacher: "A太郎", note: "隔週(B子)" }),
    ];
    const holidays = [];
    const result = computeAvailableTeachers(
      MONDAY, // anchor 2026-04-06 (A) → MONDAY = B週
      slots,
      holidays,
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    const aTaro = result.find((t) => t.name === "A太郎");
    expect(aTaro).toBeTruthy();
    expect(aTaro.reason).toContain("隔週(B週)");
    expect(aTaro.cancelledSlots.map((s) => s.id)).toEqual([1]);
  });

  it("A週には隔週パートナーが空きになる", () => {
    const AWEEK = "2026-04-06";
    const slots = [
      makeSlot({ id: 1, teacher: "A太郎", note: "隔週(B子)" }),
    ];
    const result = computeAvailableTeachers(
      AWEEK,
      slots,
      [],
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    const bKo = result.find((t) => t.name === "B子");
    expect(bKo).toBeTruthy();
    expect(bKo.reason).toContain("隔週(A週)");
  });

  it("既存の代行アサインがあれば freeTimeSlots から除外される", () => {
    const slots = [
      makeSlot({ id: 1, teacher: "山田", time: "19:00-20:20" }),
      makeSlot({ id: 2, teacher: "山田", time: "20:30-21:50" }),
    ];
    const holidays = [{ date: MONDAY, scope: ["全部"] }];
    const subs = [
      { id: 1, date: MONDAY, slotId: 99, substitute: "山田", originalTeacher: "他", status: "confirmed", memo: "" },
    ];
    const allSlotsIncludingSubstituteTarget = [
      ...slots,
      makeSlot({ id: 99, teacher: "他", time: "19:00-20:20", day: "月" }),
    ];
    const result = computeAvailableTeachers(
      MONDAY,
      allSlotsIncludingSubstituteTarget,
      holidays,
      [],
      subs,
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    const yamada = result.find((t) => t.name === "山田");
    expect(yamada).toBeTruthy();
    // isFreeAllDay は false (既存 sub assignment があるため)
    expect(yamada.isFreeAllDay).toBe(false);
    // 19:00-20:20 は既存代行で埋まっているので freeTimeSlots に含まれない
    expect(yamada.freeTimeSlots).not.toContain("19:00-20:20");
    expect(yamada.freeTimeSlots).toContain("20:30-21:50");
  });

  it("teacherSubjects が partTimeStaff.subjectIds より優先される", () => {
    const slots = [
      makeSlot({ id: 1, teacher: "バイト英語", subj: "英語" }),
    ];
    const holidays = [{ date: MONDAY, scope: ["全部"] }];
    const teacherSubjects = { バイト英語: [1, 2] }; // 英語・数学 (上書き)
    const result = computeAvailableTeachers(
      MONDAY,
      slots,
      holidays,
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS,
      teacherSubjects
    );
    const entry = result.find((t) => t.name === "バイト英語");
    expect(entry.subjectIds).toEqual([1, 2]);
    expect(entry.isPartTime).toBe(true);
  });

  it("非講師日 (該当曜日のスロットなし) は空配列を返す", () => {
    const slots = [makeSlot({ id: 1, day: "火", teacher: "山田" })];
    const result = computeAvailableTeachers(
      MONDAY,
      slots,
      [],
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    expect(result).toEqual([]);
  });

  it("dateToDay が null を返す不正日付は空配列", () => {
    const slots = [makeSlot({ id: 1 })];
    const result = computeAvailableTeachers(
      "",
      slots,
      [],
      [],
      [],
      partTimeStaff,
      subjects,
      [],
      ANCHORS
    );
    expect(result).toEqual([]);
  });
});

// ─── その日にコマが無い講師も候補に出す (2026-09-15) ────────────────
// 候補は「その日のコマの講師」で閉じない — 常勤はその曜日にコマが無くても
// 代行に入る (2026-09-10 の西岡)。玉突き代行の画面だけがオプトインする。
describe("computeAvailableTeachers — includeIdleTeachers", () => {
  // 月曜のコマは 山田 だけ。西岡 は火曜にしかコマが無く、バイト数学 は
  // どの曜日にも出てこない
  const slots = [
    makeSlot({ id: 1, teacher: "山田", subj: "英語" }),
    makeSlot({ id: 2, day: "火", teacher: "西岡", subj: "数学" }),
  ];
  const call = (extra = {}, opts) =>
    computeAvailableTeachers(
      MONDAY, slots, extra.holidays || [], [], extra.subs || [],
      partTimeStaff, subjects, [], ANCHORS, {}, opts
    );

  it("既定 (opts なし) では従来どおり、その日にコマの無い講師は出ない", () => {
    expect(call()).toEqual([]);
  });

  it("includeIdleTeachers でその日に担当の無い講師が「この日は担当なし」で出る", () => {
    const result = call({}, { includeIdleTeachers: true });
    const names = result.map((t) => t.name);
    expect(names).toContain("西岡");
    expect(names).toContain("バイト数学");
    // その日にコマがあって休講も無い 山田 は空きではない
    expect(names).not.toContain("山田");
    const nishioka = result.find((t) => t.name === "西岡");
    expect(nishioka).toMatchObject({
      isFreeAllDay: true,
      noSlotsToday: true,
      reason: IDLE_TEACHER_REASON,
      cancelledSlots: [],
      isPartTime: false,
    });
    // 空き時間帯はその日に存在する時間帯 (手動追加の「全日」と同じ形)
    expect(nishioka.freeTimeSlots).toEqual(["19:00-20:20"]);
    // 担当科目は火曜のコマから推定
    expect(nishioka.subjectIds).toEqual([2]);
    const bt = result.find((t) => t.name === "バイト数学");
    expect(bt.isPartTime).toBe(true);
    expect(bt.subjectIds).toEqual([2]);
  });

  it("その日に既に代行を引き受けていれば、その時刻は塞がり全日空きではない", () => {
    const slotsWithTwoTimes = [
      ...slots,
      makeSlot({ id: 3, teacher: "山田", time: "20:30-21:50" }),
    ];
    const subs = [
      { id: 1, date: MONDAY, slotId: 1, originalTeacher: "山田", substitute: "西岡", status: "confirmed", memo: "" },
    ];
    const result = computeAvailableTeachers(
      MONDAY, slotsWithTwoTimes, [], [], subs,
      partTimeStaff, subjects, [], ANCHORS, {}, { includeIdleTeachers: true }
    );
    const nishioka = result.find((t) => t.name === "西岡");
    expect(nishioka.isFreeAllDay).toBe(false);
    expect(nishioka.freeTimeSlots).toEqual(["20:30-21:50"]);
  });

  it("終了日を入れた旧期の時間割だけに居る講師 (辞めた人) は担当なしに出ない", () => {
    // 前期 (〜9/30) だけに居る 旧講師。MONDAY の時点では前期は終わっている
    const ttSlots = [
      ...slots,
      makeSlot({ id: 9, day: "火", teacher: "旧講師", subj: "国語", timetableId: "old" }),
    ];
    // timetableId の無いコマは id 1 の時間割に属する扱い (filterSlotsForDate)
    const timetables = [
      { id: 1, name: "今期", startDate: "2020-04-01" },
      { id: "old", name: "前期", startDate: "2020-04-01", endDate: "2020-09-30" },
    ];
    const result = computeAvailableTeachers(
      MONDAY, ttSlots, [], [], [], partTimeStaff, subjects, timetables, ANCHORS, {},
      { includeIdleTeachers: true }
    );
    const names = result.map((t) => t.name);
    expect(names).toContain("西岡");
    expect(names).not.toContain("旧講師");
  });

  it("休講で空いた講師 (従来の候補) と担当なしの講師は同時に出て、区別できる", () => {
    const holidays = [{ date: MONDAY, scope: ["全部"] }];
    const result = call({ holidays }, { includeIdleTeachers: true });
    const yamada = result.find((t) => t.name === "山田");
    expect(yamada.noSlotsToday).toBe(false);
    expect(yamada.reason).toBe("高校部休講");
    expect(result.find((t) => t.name === "西岡").noSlotsToday).toBe(true);
  });

  it("隔週コマの note のパートナーも母集団に入る", () => {
    const names = collectAllTeacherNames(
      [makeSlot({ id: 1, teacher: "A太郎·C次郎", note: "隔週(B子)" })],
      [{ name: "バイトX", subjectIds: [] }]
    );
    expect([...names].sort()).toEqual(["A太郎", "B子", "C次郎", "バイトX"]);
  });
});

describe("sortAvailableTeachers", () => {
  const kana = { 堀上: "ほりかみ", 石原: "いしはら", 高松: "たかまつ", 西岡: "にしおか" };
  const mk = (name, extra = {}) => ({
    name, isFreeAllDay: true, freeTimeSlots: [], cancelledSlots: [],
    reason: "高校部休講", subjectIds: [], isPartTime: false, noSlotsToday: false,
    ...extra,
  });
  it("休講・隔週で空いた人 → 担当なし → 手動追加 の順、同じ群の中はよみ順", () => {
    const list = [
      mk("堀上", { noSlotsToday: true, reason: IDLE_TEACHER_REASON }),
      mk("高松", { reason: "手動追加" }),
      mk("石原"),
      mk("西岡", { noSlotsToday: true, reason: IDLE_TEACHER_REASON }),
      mk("高松2", { reason: "高校部休講" }),
    ];
    const kana2 = { ...kana, 高松2: "たかまつ" };
    expect(sortAvailableTeachers(list, kana2).map((t) => t.name)).toEqual([
      "石原", "高松2", "西岡", "堀上", "高松",
    ]);
  });
  it("元の配列は変更しない", () => {
    const list = [mk("堀上"), mk("石原")];
    sortAvailableTeachers(list, kana);
    expect(list.map((t) => t.name)).toEqual(["堀上", "石原"]);
  });
});

describe("suggestChainSubstitutions", () => {
  it("スコア同点の候補はよみのあいうえお順で選ぶ (名前の文字列順ではない)", () => {
    const slots = [makeSlot({ id: 10, teacher: "山田", subj: "英語" })];
    const uncoveredSubs = [{ slotId: 10, originalTeacher: "山田", date: MONDAY }];
    const mk = (name) => ({
      name, isFreeAllDay: true, freeTimeSlots: ["19:00-20:20"], cancelledSlots: [],
      reason: "", subjectIds: [1], isPartTime: false,
    });
    // 部首・画数順だと 堀上 < 石原 だが、よみは いしはら < ほりかみ
    const available = [mk("堀上"), mk("石原")];
    const kana = { 堀上: "ほりかみ", 石原: "いしはら" };
    const result = suggestChainSubstitutions(
      uncoveredSubs, available, slots, subjects, subjectCategories, partTimeStaff, kana
    );
    expect(result[0].suggestedSubstitute).toBe("石原");
  });

  it("教科完全一致の候補が最高スコアで選ばれる", () => {
    const slots = [
      makeSlot({ id: 10, teacher: "山田", subj: "英語" }),
    ];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "山田", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト英語",
        isFreeAllDay: true,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [1], // 英語一致
        isPartTime: true,
      },
      {
        name: "バイト数学",
        isFreeAllDay: true,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [2], // 不一致
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result).toHaveLength(1);
    expect(result[0].suggestedSubstitute).toBe("バイト英語");
    expect(result[0].score).toBeGreaterThanOrEqual(10);
  });

  it("同カテゴリ一致は +5、完全一致は +10", () => {
    const slots = [makeSlot({ id: 10, subj: "英語" })];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "山田", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト文系",
        isFreeAllDay: false,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [3], // 国語 → 同カテゴリ
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result[0].score).toBe(5);
  });

  it("元教師は候補から除外される", () => {
    const slots = [makeSlot({ id: 10, subj: "英語" })];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "バイト英語", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト英語",
        isFreeAllDay: true,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [1],
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result).toEqual([]);
  });

  it("候補が 1 人もいなければ skip される", () => {
    const slots = [makeSlot({ id: 10, subj: "英語" })];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "山田", date: MONDAY },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      [],
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result).toEqual([]);
  });

  it("slotMap に無い slotId は skip", () => {
    const slots = [makeSlot({ id: 10 })];
    const uncoveredSubs = [
      { slotId: 99, originalTeacher: "山田", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト英語",
        isFreeAllDay: true,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [1],
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result).toEqual([]);
  });

  it("玉突き: part-time 教師の slot が代行されると次の iteration で新候補になる", () => {
    // シナリオ:
    //   slot 10 (19:00 英語, originalTeacher=バイト英語/part-time) — 代行要
    //   slot 11 (19:00 英語, originalTeacher=山田/full-time) — 代行要
    //   available に同時刻で両方カバーできる候補は バイト文系 のみ (1名)
    //
    //   Step 1: slot 10 を バイト文系 が代行 → バイト英語 が "freed" として push
    //   Step 2: slot 11 を (新規候補) バイト英語 が代行 (chain)
    const slots = [
      makeSlot({ id: 10, teacher: "バイト英語", subj: "英語", time: "19:00-20:20" }),
      makeSlot({ id: 11, teacher: "山田", subj: "英語", time: "19:00-20:20" }),
    ];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "バイト英語", date: MONDAY },
      { slotId: 11, originalTeacher: "山田", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト文系",
        isFreeAllDay: false,
        freeTimeSlots: ["19:00-20:20"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [1, 3],
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    expect(result).toHaveLength(2);
    const chained = result.find((r) => r.suggestedSubstitute === "バイト英語");
    expect(chained).toBeTruthy();
    expect(chained.isChain).toBe(true);
    expect(chained.chainStep).toBeGreaterThanOrEqual(2);
  });

  it("時間割上ビジーの講師は時間重複時に候補外", () => {
    const slots = [
      makeSlot({ id: 10, teacher: "山田", subj: "英語", time: "19:00-20:20" }),
      makeSlot({ id: 11, teacher: "鈴木", subj: "英語", time: "19:30-20:50" }),
    ];
    const uncoveredSubs = [
      { slotId: 10, originalTeacher: "山田", date: MONDAY },
      { slotId: 11, originalTeacher: "鈴木", date: MONDAY },
    ];
    const availableTeachers = [
      {
        name: "バイト英語",
        isFreeAllDay: true,
        freeTimeSlots: ["19:00-20:20", "19:30-20:50"],
        cancelledSlots: [],
        reason: "",
        subjectIds: [1],
        isPartTime: true,
      },
    ];
    const result = suggestChainSubstitutions(
      uncoveredSubs,
      availableTeachers,
      slots,
      subjects,
      subjectCategories,
      partTimeStaff
    );
    // 同一講師は時間重複する 2 スロットに同時アサインできない
    expect(result).toHaveLength(1);
  });
});

describe("validateSubstituteChange", () => {
  const slots = [
    makeSlot({ id: 1, time: "19:00-20:20", subj: "英語" }),
    makeSlot({ id: 2, time: "19:30-20:50", subj: "数学" }),
    makeSlot({ id: 3, time: "20:30-21:50", subj: "国語" }),
  ];

  it("既存アサインと時間重複すれば timeConflict=true", () => {
    const existingAssignments = [
      { slotId: 2, suggestedSubstitute: "バイト英語", score: 10, originalTeacher: "x", isChain: false, chainStep: 1 },
    ];
    const r = validateSubstituteChange(
      "バイト英語",
      1,
      slots,
      existingAssignments,
      subjects,
      partTimeStaff
    );
    expect(r.timeConflict).toBe(true);
  });

  it("時間が重ならなければ timeConflict=false", () => {
    const existingAssignments = [
      { slotId: 3, suggestedSubstitute: "バイト英語", score: 10, originalTeacher: "x", isChain: false, chainStep: 1 },
    ];
    const r = validateSubstituteChange(
      "バイト英語",
      1,
      slots,
      existingAssignments,
      subjects,
      partTimeStaff
    );
    expect(r.timeConflict).toBe(false);
  });

  it("自分自身 (同じ slotId) のアサインは timeConflict にカウントしない", () => {
    const existingAssignments = [
      { slotId: 1, suggestedSubstitute: "バイト英語", score: 10, originalTeacher: "x", isChain: false, chainStep: 1 },
    ];
    const r = validateSubstituteChange(
      "バイト英語",
      1,
      slots,
      existingAssignments,
      subjects,
      partTimeStaff
    );
    expect(r.timeConflict).toBe(false);
  });

  it("バイトで教科が合わなければ subjectMismatch=true", () => {
    const r = validateSubstituteChange(
      "バイト数学",
      1, // 英語スロット
      slots,
      [],
      subjects,
      partTimeStaff
    );
    expect(r.subjectMismatch).toBe(true);
  });

  it("バイトで教科が合えば subjectMismatch=false", () => {
    const r = validateSubstituteChange(
      "バイト英語",
      1,
      slots,
      [],
      subjects,
      partTimeStaff
    );
    expect(r.subjectMismatch).toBe(false);
  });

  it("正社員は担当スロットから教科推定 (slots 由来の教科と一致する講師)", () => {
    const r = validateSubstituteChange(
      "山田", // slots[0].teacher = 山田 で subj=英語
      1,
      slots,
      [],
      subjects,
      partTimeStaff
    );
    expect(r.subjectMismatch).toBe(false);
  });

  it("slot が見つからなければ両フラグ false", () => {
    const r = validateSubstituteChange(
      "バイト英語",
      999,
      slots,
      [],
      subjects,
      partTimeStaff
    );
    expect(r).toEqual({ timeConflict: false, subjectMismatch: false });
  });
});
