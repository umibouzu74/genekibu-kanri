// 講師の同時刻の重なり (utils/teacherConflicts)。
// 2026-09-09: 福江が 19:50 に 中2C 数学 (奥村の代行) と 中3A 理科 (小見山の
// 代行) で二重になっていても、本体のタイムテーブルはどこにも出さなかった。
import { describe, expect, it } from "vitest";
import {
  collectTeacherAssignments,
  describeBusy,
  describeTeacherConflict,
  findTeacherConflicts,
  teacherBusyAt,
  timesOverlap,
} from "./teacherConflicts";

const DATE = "2026-09-10"; // 木

const mk = (id, o = {}) => ({
  id,
  day: "木",
  time: "19:50-20:35",
  grade: "中2",
  cls: "C",
  room: "603",
  subj: "数学",
  teacher: "奥村",
  note: "",
  ...o,
});

describe("timesOverlap", () => {
  it("半開区間で判定する (終了 = 次の開始は重ならない)", () => {
    expect(timesOverlap("19:50-20:35", "20:00-20:30")).toBe(true);
    expect(timesOverlap("18:55-19:40", "19:40-20:35")).toBe(false);
  });
  it("終了の無い時刻は点として開始の一致だけを見る", () => {
    expect(timesOverlap("19:50", "19:50-20:35")).toBe(true);
    expect(timesOverlap("19:55", "19:50-20:35")).toBe(false);
  });
  it("時刻が読めないコマ (時限表記だけ) は重ならない扱い", () => {
    expect(timesOverlap("3限", "3限")).toBe(false);
    expect(timesOverlap("", "19:50-20:35")).toBe(false);
  });
});

describe("collectTeacherAssignments", () => {
  it("代行レコードのある元講師は外し、代行者を role: sub で足す", () => {
    const slots = [mk(1), mk(2, { grade: "中3", cls: "A", subj: "理科", teacher: "小見山" })];
    const subsBySlot = new Map([
      [1, [{ originalTeacher: "奥村", substitute: "福江" }]],
      [2, [{ originalTeacher: "小見山", substitute: "福江" }]],
    ]);
    const list = collectTeacherAssignments(slots, DATE, { subsBySlot });
    expect(list.map((a) => `${a.teacher}:${a.slot.id}:${a.role}`)).toEqual([
      "福江:1:sub",
      "福江:2:sub",
    ]);
  });

  it("代行者が空の欠勤 (代行未定) は元講師を外すだけ", () => {
    const list = collectTeacherAssignments([mk(1)], DATE, {
      subsBySlot: new Map([[1, [{ originalTeacher: "奥村", substitute: "" }]]]),
    });
    expect(list).toEqual([]);
  });

  it("欠勤組み換えの Map<元講師, rec> 形式も読める", () => {
    const list = collectTeacherAssignments([mk(1)], DATE, {
      subsBySlot: new Map([[1, new Map([["奥村", { originalTeacher: "奥村", substitute: "福江" }]])]]),
    });
    expect(list.map((a) => a.teacher)).toEqual(["福江"]);
  });

  it("多担任コマは休む人だけ外す", () => {
    const list = collectTeacherAssignments(
      [mk(1, { teacher: "香川·福江·川井", subj: "プレップ" })],
      DATE,
      { subsBySlot: new Map([[1, [{ originalTeacher: "福江", substitute: "" }]]]) }
    );
    expect(list.map((a) => a.teacher)).toEqual(["香川", "川井"]);
  });

  it("隔週コマは担当週の人だけ (B 週はパートナー)", () => {
    const slot = mk(1, { teacher: "堀上", note: "隔週(河野)" });
    const anchors = [{ date: "2026-09-03", weekType: "A" }];
    const a = collectTeacherAssignments([slot], "2026-09-03", { biweeklyAnchors: anchors });
    const b = collectTeacherAssignments([slot], "2026-09-10", { biweeklyAnchors: anchors });
    expect(a.map((x) => x.teacher)).toEqual(["堀上"]);
    expect(b.map((x) => x.teacher)).toEqual(["河野"]);
  });

  it("実効時刻 (移動・特別時程) と除外 (休講・振替・合同吸収) を反映する", () => {
    const slots = [mk(1), mk(2, { grade: "中3", cls: "A", subj: "理科", teacher: "奥村" })];
    const list = collectTeacherAssignments(slots, DATE, {
      timeBySlot: new Map([[1, "20:45-21:30"]]),
      excludeSlotIds: new Set([2]),
    });
    expect(list).toHaveLength(1);
    expect(list[0].time).toBe("20:45-21:30");
  });
});

describe("findTeacherConflicts", () => {
  it("同じ人が同時刻に 2 コマ (代行 × 代行) → 両方のコマに出る", () => {
    const slots = [mk(1), mk(2, { grade: "中3", cls: "A", subj: "理科", teacher: "小見山" })];
    const subsBySlot = new Map([
      [1, [{ originalTeacher: "奥村", substitute: "福江" }]],
      [2, [{ originalTeacher: "小見山", substitute: "福江" }]],
    ]);
    const m = findTeacherConflicts(collectTeacherAssignments(slots, DATE, { subsBySlot }));
    expect([...m.keys()].sort()).toEqual([1, 2]);
    const c = m.get(1)[0];
    expect(c.teacher).toBe("福江");
    expect(c.other.id).toBe(2);
    expect(describeTeacherConflict(c)).toBe("福江: 中3A 理科 (代行) と重複");
    expect(describeTeacherConflict(c, { withTime: true })).toBe(
      "福江: 中3A 理科 (代行) 19:50-20:35 と重複"
    );
  });

  it("通常コマと代行の重なり (代行者が自分のコマを持っている時間) も出る", () => {
    const slots = [
      mk(1),
      mk(2, { grade: "中3", cls: "SS", subj: "理科", teacher: "滝澤", time: "19:50-20:35" }),
    ];
    const subsBySlot = new Map([[1, [{ originalTeacher: "奥村", substitute: "滝澤" }]]]);
    const m = findTeacherConflicts(collectTeacherAssignments(slots, DATE, { subsBySlot }));
    expect(m.get(2)[0].otherRole).toBe("sub");
    expect(describeTeacherConflict(m.get(2)[0])).toBe("滝澤: 中2C 数学 (代行) と重複");
    expect(describeTeacherConflict(m.get(1)[0])).toBe("滝澤: 中3SS 理科 と重複");
  });

  it("時間帯が重ならなければ何も出ない", () => {
    const slots = [mk(1), mk(2, { time: "20:45-21:30", cls: "AB" })];
    expect(findTeacherConflicts(collectTeacherAssignments(slots, DATE)).size).toBe(0);
  });

  it("欠勤で手を離れたコマは元講師の重なりに数えない", () => {
    // 奥村が 19:50 に 2 コマ持っている (元の時間割がそうなっている) が、
    // 片方を欠勤にしたら残り 1 つなので重ならない
    const slots = [mk(1), mk(2, { cls: "AB" })];
    const subsBySlot = new Map([[2, [{ originalTeacher: "奥村", substitute: "" }]]]);
    expect(
      findTeacherConflicts(collectTeacherAssignments(slots, DATE, { subsBySlot })).size
    ).toBe(0);
  });

  it("同じ位置の重複登録 (曜日・時刻・学年・クラス・科目が同じ) は重なりにしない", () => {
    const slots = [mk(1), mk(2)];
    expect(findTeacherConflicts(collectTeacherAssignments(slots, DATE)).size).toBe(0);
  });
});

describe("teacherBusyAt", () => {
  it("その時間に持っている仕事を返す (今入れようとしているコマは除く)", () => {
    const slots = [mk(1), mk(2, { grade: "中3", cls: "A", subj: "理科", teacher: "小見山" })];
    const subsBySlot = new Map([[1, [{ originalTeacher: "奥村", substitute: "福江" }]]]);
    const list = collectTeacherAssignments(slots, DATE, { subsBySlot });
    const busy = teacherBusyAt(list, "福江", "19:50-20:35", { excludeSlotId: 2 });
    expect(busy).toHaveLength(1);
    expect(describeBusy(busy[0])).toBe("代行中: 中2C 数学");
    expect(teacherBusyAt(list, "小見山", "19:50-20:35", { excludeSlotId: 2 })).toEqual([]);
    expect(describeBusy(teacherBusyAt(list, "小見山", "19:50-20:35")[0])).toBe(
      "授業中: 中3A 理科"
    );
  });
});
