import { describe, expect, it } from "vitest";
import {
  buildAdjustmentIndex,
  buildIncomingCards,
  collectIncomingReschedules,
  collectOutgoingReschedules,
  incomingCombineNote,
  resolveIncomingCombines,
  describeRescheduleTarget,
  describeSlot,
  isDayEmptiedByReschedule,
  outgoingDayLabel,
  rescheduleTargetTeachers,
  rescheduleTeacherLabel,
} from "./adjustmentDisplay";

describe("buildAdjustmentIndex", () => {
  const base = "2026-04-20";

  const EMPTY_INDEX = {
    combineAbsorbedBySlot: new Map(),
    combineHostBySlot: new Map(),
    moveBySlot: new Map(),
    rescheduleOutBySlot: new Map(),
    rescheduleIn: [],
    dayScheduleMoveBySlot: new Map(),
  };

  it("returns empty maps when adjustments is empty/null", () => {
    expect(buildAdjustmentIndex(null, base)).toEqual(EMPTY_INDEX);
    expect(buildAdjustmentIndex([], base)).toEqual(EMPTY_INDEX);
  });

  it("returns empty maps when date is falsy", () => {
    const adjustments = [{ id: 1, date: base, type: "move", slotId: 10, targetTime: "20:00-21:00" }];
    expect(buildAdjustmentIndex(adjustments, "")).toEqual(EMPTY_INDEX);
  });

  // ─── 特別時程 (daySchedules) の合流 ───────────────────────────────
  describe("daySchedules merge", () => {
    // 2026-10-07 は水曜日
    const wed = "2026-10-07";
    const slots = [
      { id: 1, day: "水", time: "16:25-17:25", grade: "附中1", teacher: "武下" },
      { id: 2, day: "水", time: "21:00-21:30", grade: "附中", teacher: "松川" },
      { id: 3, day: "水", time: "16:25-17:25", grade: "中1", teacher: "他" },
      { id: 4, day: "金", time: "16:25-17:25", grade: "附中1", teacher: "武下" },
    ];
    const daySchedules = [
      {
        id: 1,
        date: wed,
        label: "附属 50分授業",
        targetGrades: ["附中1", "附中2", "附中3", "附中"],
        timeMap: [{ from: "16:25-17:25", to: "17:00-17:50" }],
        cancelTimes: [],
        memo: "",
      },
    ];

    it("対象学年・当日曜日のコマだけ moveBySlot に読み替えが載る", () => {
      const r = buildAdjustmentIndex([], wed, { slots, daySchedules });
      expect(r.moveBySlot.get(1)).toBe("17:00-17:50");
      expect(r.dayScheduleMoveBySlot.get(1)?.label).toBe("附属 50分授業");
      expect(r.moveBySlot.has(2)).toBe(false); // timeMap 外は据え置き
      expect(r.moveBySlot.has(3)).toBe(false); // 対象外学年
      expect(r.moveBySlot.has(4)).toBe(false); // 曜日不一致 (金)
    });

    it("個別の move 調整が同じコマにあればそちらが優先", () => {
      const adjustments = [
        { id: 9, date: wed, type: "move", slotId: 1, targetTime: "19:00-19:50" },
      ];
      const r = buildAdjustmentIndex(adjustments, wed, { slots, daySchedules });
      expect(r.moveBySlot.get(1)).toBe("19:00-19:50");
      expect(r.dayScheduleMoveBySlot.has(1)).toBe(false);
    });

    it("cancelTimes のコマには読み替えを作らない", () => {
      const cut = [
        { ...daySchedules[0], timeMap: [], cancelTimes: ["16:25-17:25"] },
      ];
      const r = buildAdjustmentIndex([], wed, { slots, daySchedules: cut });
      expect(r.moveBySlot.has(1)).toBe(false);
    });

    it("別日には効かない", () => {
      const r = buildAdjustmentIndex([], "2026-10-14", { slots, daySchedules });
      expect(r.moveBySlot.size).toBe(0);
    });
  });

  it("filters out adjustments of other dates", () => {
    const adjustments = [
      { id: 1, date: "2026-04-19", type: "move", slotId: 10, targetTime: "20:00-21:00" },
      { id: 2, date: base, type: "move", slotId: 11, targetTime: "21:00-22:00" },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.moveBySlot.get(10)).toBeUndefined();
    expect(r.moveBySlot.get(11)).toBe("21:00-22:00");
  });

  it("indexes combine adjustments as both host and absorbed maps", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [6, 7] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.get(5)).toEqual([6, 7]);
    expect(r.combineAbsorbedBySlot.get(6)).toBe(5);
    expect(r.combineAbsorbedBySlot.get(7)).toBe(5);
  });

  it("ignores combine adjustments with empty combineSlotIds", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.size).toBe(0);
    expect(r.combineAbsorbedBySlot.size).toBe(0);
  });

  // 同じコマの 9/7 と 9/14 を同じ 9/19 へまとめて振り替える。コマ id で
  // Map にすると後の 1 件で上書きされ、タイムテーブルの「振替で入るコマ」から
  // 1 コマ消えていた (2026-10-03)
  it("keeps every incoming reschedule even when the same slot comes in twice", () => {
    const adjustments = [
      { id: 1, date: "2026-09-07", type: "reschedule", slotId: 5, targetDate: "2026-09-19", targetTime: "10:00-11:20" },
      { id: 2, date: "2026-09-14", type: "reschedule", slotId: 5, targetDate: "2026-09-19", targetTime: "13:00-14:20" },
    ];
    const r = buildAdjustmentIndex(adjustments, "2026-09-19");
    expect(r.rescheduleIn.map((a) => a.id)).toEqual([1, 2]);
  });

  it("ignores move adjustments without targetTime", () => {
    const adjustments = [{ id: 1, date: base, type: "move", slotId: 10 }];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.moveBySlot.size).toBe(0);
  });

  it("indexes reschedule adjustments by source (out) and target (in) dates", () => {
    const adjustments = [
      { id: 1, date: base, type: "reschedule", slotId: 20, targetDate: "2026-04-27", targetTime: "19:00-20:20" },
      { id: 2, date: "2026-04-13", type: "reschedule", slotId: 21, targetDate: base, targetTime: "20:30-21:50", targetTeacher: "本多" },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    // source date view: slot 20 is going out
    expect(r.rescheduleOutBySlot.get(20)?.targetDate).toBe("2026-04-27");
    // source date view: slot 21 is coming in from 2026-04-13
    const incoming = r.rescheduleIn.find((a) => a.slotId === 21);
    expect(incoming?.targetDate).toBe(base);
    expect(incoming?.targetTeacher).toBe("本多");
    // reschedule entries should not affect move/combine indices
    expect(r.moveBySlot.size).toBe(0);
    expect(r.combineHostBySlot.size).toBe(0);
  });

  it("handles a mix of combine and move entries on the same date", () => {
    const adjustments = [
      { id: 1, date: base, type: "combine", slotId: 5, combineSlotIds: [6] },
      { id: 2, date: base, type: "move", slotId: 7, targetTime: "21:00-22:00" },
      { id: 3, date: base, type: "combine", slotId: 8, combineSlotIds: [9, 10] },
    ];
    const r = buildAdjustmentIndex(adjustments, base);
    expect(r.combineHostBySlot.get(5)).toEqual([6]);
    expect(r.combineHostBySlot.get(8)).toEqual([9, 10]);
    expect(r.combineAbsorbedBySlot.get(6)).toBe(5);
    expect(r.combineAbsorbedBySlot.get(9)).toBe(8);
    expect(r.moveBySlot.get(7)).toBe("21:00-22:00");
  });
});

describe("describeSlot", () => {
  it("returns fallback when slot is null/undefined", () => {
    expect(describeSlot(null)).toBe("(不明コマ)");
    expect(describeSlot(undefined, "なし")).toBe("なし");
  });

  it("formats grade + cls + subj", () => {
    expect(describeSlot({ grade: "高1", cls: "A", subj: "数学" })).toBe("高1A 数学");
  });

  it("omits cls when it is '-' or empty", () => {
    expect(describeSlot({ grade: "中2", cls: "-", subj: "英語" })).toBe("中2 英語");
    expect(describeSlot({ grade: "中2", cls: "", subj: "英語" })).toBe("中2 英語");
  });
});

// ─── 振替元 (他日へ出ていくコマ) の表示 ─────────────────────────────
describe("振替元の表示ヘルパ", () => {
  const MON = "2026-12-07";
  const FRI = "2026-12-04";
  const mk = (id, time) => ({
    id,
    day: "月",
    time,
    grade: "中3",
    cls: "S",
    subj: "数学",
    teacher: "堀上",
  });
  const slots = [mk(1, "19:00-20:20"), mk(2, "17:30-18:50"), mk(3, "20:30-21:50")];
  const adj = (id, slotId, extra = {}) => ({
    id,
    date: MON,
    type: "reschedule",
    slotId,
    targetDate: FRI,
    ...extra,
  });

  const indexOf = (adjustments) =>
    buildAdjustmentIndex(adjustments, MON).rescheduleOutBySlot;

  it("出ていくコマを時刻順に集める", () => {
    const out = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2)])
    );
    expect(out.map((o) => o.slot.id)).toEqual([2, 1]);
  });

  it("振替が無ければ空", () => {
    expect(collectOutgoingReschedules(slots, indexOf([]))).toEqual([]);
    expect(collectOutgoingReschedules([], indexOf([adj(11, 1)]))).toEqual([]);
  });

  it("全部出ていったら「振替で休み」の日", () => {
    const all = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2), adj(13, 3)])
    );
    expect(isDayEmptiedByReschedule(slots, all)).toBe(true);
  });

  it("一部だけ残るなら休みではない", () => {
    const some = collectOutgoingReschedules(slots, indexOf([adj(11, 1)]));
    expect(isDayEmptiedByReschedule(slots, some)).toBe(false);
  });

  it("その日にやる他のコマ (振替で入る / 追加授業) が 1 つでもあれば休みではない", () => {
    const all = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2), adj(13, 3)])
    );
    expect(isDayEmptiedByReschedule(slots, all, 1)).toBe(false);
  });

  it("元々コマの無い日は休みと言わない", () => {
    expect(isDayEmptiedByReschedule([], [])).toBe(false);
  });

  it("振替先の表記は日付 → 時刻 → 担当の順、short は月日だけ", () => {
    const a = adj(11, 1, { targetTime: "19:40-21:00", targetTeacher: "福江" });
    expect(describeRescheduleTarget(a)).toBe("2026-12-04 (金) 19:40-21:00 (福江)");
    expect(describeRescheduleTarget(a, { short: true })).toBe("12/4 19:40 (福江)");
    expect(describeRescheduleTarget(adj(12, 2))).toBe("2026-12-04 (金)");
    expect(describeRescheduleTarget({})).toBe("");
  });

  it("担当が変わらない振替では振替先の担当を出さない", () => {
    const a = adj(11, 1, { targetTime: "19:40-21:00", targetTeacher: "福江" });
    expect(describeRescheduleTarget(a, { originalTeacher: "福江" })).toBe(
      "2026-12-04 (金) 19:40-21:00"
    );
    expect(describeRescheduleTarget(a, { originalTeacher: "堀上" })).toBe(
      "2026-12-04 (金) 19:40-21:00 (福江)"
    );
  });

  it("見出しは行き先が 1 つならその日付、複数なら「他 N 日」", () => {
    const one = collectOutgoingReschedules(slots, indexOf([adj(11, 1), adj(12, 2)]));
    expect(outgoingDayLabel(one)).toBe(
      "この日の授業は 2 コマとも 2026-12-04 (金) へ振替済み"
    );
    const two = collectOutgoingReschedules(
      slots,
      indexOf([adj(11, 1), adj(12, 2, { targetDate: "2026-12-05" })])
    );
    expect(outgoingDayLabel(two)).toContain("他 1 日");
    expect(outgoingDayLabel([])).toBe("");
  });
});

// 振替で入ってくるコマの担当。講師欄は複数担当や隔週のパートナーを持つので
// 文字列の完全一致で比べると、講師別の月間で振替先のカードが消える (2026-10-03)
describe("rescheduleTargetTeachers", () => {
  // 2026-12-07 (月) → 2026-12-04 (金)
  const slot = { id: 1, day: "月", time: "19:00-20:20", grade: "中3", subj: "数学", teacher: "堀上", note: "" };
  const adj = { id: 9, type: "reschedule", date: "2026-12-07", slotId: 1, targetDate: "2026-12-04" };

  it("振替先の担当があればその人 (複数は区切りで分ける)", () => {
    expect(rescheduleTargetTeachers({ ...adj, targetTeacher: "香川・福江" }, slot)).toEqual([
      "香川",
      "福江",
    ]);
  });

  it("無ければ元のコマの担当 (複数担当も分ける)", () => {
    expect(rescheduleTargetTeachers(adj, { ...slot, teacher: "堀上·河野" })).toEqual([
      "堀上",
      "河野",
    ]);
  });

  it("隔週は振替元の日の A/B で解決する", () => {
    const bi = { ...slot, teacher: "河野", note: "隔週(堀上)" };
    // 11/30 が A 週 → 12/7 は B 週 = パートナー
    const ctx = { biweeklyAnchors: [{ date: "2026-11-30" }] };
    expect(rescheduleTargetTeachers(adj, bi, ctx)).toEqual(["堀上"]);
    // 振替先 (12/4) が A 週でも、来るのは振替元の週の担当
    expect(rescheduleTargetTeachers({ ...adj, date: "2026-11-30" }, bi, ctx)).toEqual(["河野"]);
    // ctx が無ければ主担当のまま (従来の表示)
    expect(rescheduleTargetTeachers(adj, bi)).toEqual(["河野"]);
  });

  it("表示用は「·」でつなぐ。コマが無ければ空", () => {
    expect(rescheduleTeacherLabel(adj, { ...slot, teacher: "堀上・河野" })).toBe("堀上·河野");
    expect(rescheduleTargetTeachers(adj, null)).toEqual([]);
  });
});

// 10/16 (金) の高1 文系数学・理系数学を 10/9 (金) へ振り替え、10/9 では合同。
describe("振替先での合同 (combineWith)", () => {
  const bun = { id: 1, day: "金", time: "19:00-20:20", grade: "高1", cls: "文系", subj: "数学", teacher: "香川" };
  const ri = { id: 2, day: "金", time: "19:00-20:20", grade: "高1", cls: "理系", subj: "数学", teacher: "福江" };
  const eng = { id: 3, day: "金", time: "20:30-21:50", grade: "高1", cls: "文系", subj: "英語", teacher: "河野" };
  const slots = [bun, ri, eng];
  const host = { id: 10, type: "reschedule", date: "2026-10-16", slotId: 1, targetDate: "2026-10-09" };
  // 相手は振替元の日とコマで指す (adjustment の id は再利用されるため)
  const absorbed = {
    id: 11,
    type: "reschedule",
    date: "2026-10-16",
    slotId: 2,
    targetDate: "2026-10-09",
    combineWith: { date: "2026-10-16", slotId: 1 },
  };
  const other = { id: 12, type: "reschedule", date: "2026-10-16", slotId: 3, targetDate: "2026-10-09" };

  it("吸収された側を外し、受け入れる側に相手を付ける", () => {
    const items = collectIncomingReschedules([host, absorbed, other], "2026-10-09", slots);
    expect(items.map((x) => x.adj.id)).toEqual([10, 12]);
    expect(items[0].combined.map((p) => p.slot.id)).toEqual([2]);
    expect(items[1].combined).toBeUndefined();
  });

  it("includeAbsorbed なら吸収された側も combinedInto 付きで返す", () => {
    const items = collectIncomingReschedules([host, absorbed], "2026-10-09", slots, {
      includeAbsorbed: true,
    });
    expect(items.map((x) => x.adj.id)).toEqual([10, 11]);
    expect(items[1].combinedInto.adj.id).toBe(10);
  });

  it("相手の振替が無い・別の日なら合同は無かったことにして 1 コマとして出す", () => {
    expect(
      collectIncomingReschedules([absorbed], "2026-10-09", slots).map((x) => x.adj.id)
    ).toEqual([11]);
    const moved = { ...host, targetDate: "2026-10-10" };
    expect(resolveIncomingCombines([moved, absorbed]).hostOf.size).toBe(0);
  });

  it("連鎖 (受け入れる側がさらに合同されている) は無効", () => {
    const chained = { ...host, combineWith: { date: "2026-10-16", slotId: 3 } };
    const { hostOf } = resolveIncomingCombines([chained, absorbed, other]);
    expect(hostOf.has(11)).toBe(false);
    expect(hostOf.get(10).id).toBe(12);
  });

  it("受け入れる側の振替を登録し直しても (id が変わっても) 合同は残る", () => {
    const reRegistered = { ...host, id: 20 };
    const items = collectIncomingReschedules([reRegistered, absorbed], "2026-10-09", slots);
    expect(items.map((x) => x.adj.id)).toEqual([20]);
    expect(items[0].combined.map((p) => p.adj.id)).toEqual([11]);
  });

  // 受け入れる側の振替 (id 10) を消した後、別のコマの振替が同じ id で作られても
  // そちらへ合同しない (id で指していたら黙って英語へ合同されていた)
  it("id が再利用された別のコマの振替には合同しない", () => {
    const reusedId = { ...other, id: 10 };
    const items = collectIncomingReschedules([absorbed, reusedId], "2026-10-09", slots);
    expect(items.map((x) => x.adj.id)).toEqual([11, 10]);
    expect(items.every((x) => !x.combined)).toBe(true);
  });

  it("振替先の日のコマ合同 (combine) とは混ざらない", () => {
    const idx = buildAdjustmentIndex([host, absorbed], "2026-10-09");
    expect(idx.combineAbsorbedBySlot.size).toBe(0);
    expect(idx.rescheduleIn).toHaveLength(2);
  });

  it("一覧用の注記", () => {
    const all = [host, absorbed, other];
    const slotOf = (id) => slots.find((s) => s.id === id);
    expect(incomingCombineNote(absorbed, all, slotOf)).toBe("→ 高1文系 数学 に合同");
    expect(incomingCombineNote(host, all, slotOf)).toBe("+ 高1理系 数学 合同");
    expect(incomingCombineNote(other, all, slotOf)).toBe("");
  });
});

// 欠勤組み換えのグリッドに「振替で入るコマ」を通常のコマと同じカードで並べる
describe("buildIncomingCards", () => {
  // 2026-12-07 (月) → 2026-12-04 (金)
  const slot = {
    id: 1,
    day: "月",
    time: "19:00-20:20",
    grade: "高1",
    cls: "文系",
    room: "301",
    subj: "英/数",
    teacher: "河野",
    note: "隔週(堀上)",
  };
  const other = { ...slot, id: 2, cls: "理系", room: "302", subj: "数学", teacher: "福江", note: "" };
  const adj = { id: 9, type: "reschedule", date: "2026-12-07", slotId: 1, targetDate: "2026-12-04" };
  // 11/30 が A 週 → 12/7 は B 週 = パートナー (堀上) の週・2 つ目の科目
  const ctx = { biweeklyAnchors: [{ date: "2026-11-30" }] };

  it("振替先の曜日・時刻と、振替元の日で解いた担当・科目のコマにする", () => {
    const [card] = buildIncomingCards([adj], "2026-12-04", [slot], ctx);
    expect(card).toMatchObject({
      id: "rs:9",
      day: "金",
      time: "19:00-20:20",
      grade: "高1",
      cls: "文系",
      room: "301",
      teacher: "堀上",
      subj: "数",
      note: "", // 振替先の日で隔週を解き直さない
    });
    expect(card._incoming.adj).toBe(adj);
    expect(card._incoming.slot).toBe(slot);
  });

  it("振替先の時刻・担当が指定されていればそれを使う", () => {
    const [card] = buildIncomingCards(
      [{ ...adj, targetTime: "17:00-18:20", targetTeacher: "香川・福江" }],
      "2026-12-04",
      [slot],
      ctx
    );
    expect(card.time).toBe("17:00-18:20");
    expect(card.teacher).toBe("香川·福江");
  });

  it("その日へ入る振替だけ。振替先で合同にした側は受け入れる側にまとめる", () => {
    const absorbed = {
      id: 10,
      type: "reschedule",
      date: "2026-12-07",
      slotId: 2,
      targetDate: "2026-12-04",
      combineWith: { date: "2026-12-07", slotId: 1 },
    };
    const elsewhere = { ...adj, id: 11, targetDate: "2026-12-05" };
    const move = { id: 12, type: "move", date: "2026-12-04", slotId: 2, targetTime: "20:30-21:50" };
    const cards = buildIncomingCards([adj, absorbed, elsewhere, move], "2026-12-04", [slot, other], ctx);
    expect(cards.map((c) => c.id)).toEqual(["rs:9"]);
    expect(cards[0]._incoming.combined.map((p) => p.adj.id)).toEqual([10]);
  });

  it("元のコマが無い振替・日付なしは出さない", () => {
    expect(buildIncomingCards([adj], "2026-12-04", [], ctx)).toEqual([]);
    expect(buildIncomingCards([adj], "", [slot], ctx)).toEqual([]);
  });
});
