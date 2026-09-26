import { describe, expect, it } from "vitest";
import {
  buildSubContactMessage,
  contactGroupKey,
  effectiveSlotTime,
} from "./subContactMessage";

const SLOT_A = { id: 1, day: "金", time: "19:50-20:35", grade: "中3", cls: "A", room: "502", subj: "英語", teacher: "堀上" };
const SLOT_B = { id: 2, day: "金", time: "20:45-21:30", grade: "中3", cls: "B", room: "503", subj: "数学", teacher: "堀上" };
const SLOT_NOCLS = { id: 3, day: "金", time: "18:55-19:40", grade: "高1", cls: "-", room: "", subj: "古文", teacher: "堀上" };
const SLOT_MAP = { 1: SLOT_A, 2: SLOT_B, 3: SLOT_NOCLS };

const sub = (over) => ({
  id: 1,
  date: "2026-09-18",
  slotId: 1,
  originalTeacher: "堀上",
  substitute: "",
  status: "requested",
  ...over,
});

describe("buildSubContactMessage", () => {
  it("代行未定: 代わりに入れる人を探す文面", () => {
    expect(buildSubContactMessage([sub()], SLOT_MAP)).toBe(
      [
        "【代行のお願い】",
        "9/18 (金) 19:50-20:35 中3A 英語 (502)",
        "堀上先生の代わりに入っていただける方を探しています。",
      ].join("\n")
    );
  });

  it("依頼中: 宛先の先生の名前入りで頼む文面", () => {
    expect(buildSubContactMessage([sub({ substitute: "福江" })], SLOT_MAP)).toBe(
      [
        "【代行のお願い】福江先生",
        "9/18 (金) 19:50-20:35 中3A 英語 (502)",
        "堀上先生の代わりに入っていただけますか？",
      ].join("\n")
    );
  });

  it("代行確定 / 代行なしで確定", () => {
    expect(
      buildSubContactMessage([sub({ substitute: "福江", status: "confirmed" })], SLOT_MAP)
    ).toBe(
      ["【代行確定】", "9/18 (金) 19:50-20:35 中3A 英語 (502)", "堀上先生 → 福江先生"].join("\n")
    );
    expect(buildSubContactMessage([sub({ status: "confirmed" })], SLOT_MAP)).toBe(
      ["【欠勤連絡】", "9/18 (金) 19:50-20:35 中3A 英語 (502)", "堀上先生はお休みです (代行なし)"].join(
        "\n"
      )
    );
  });

  it("複数コマは時刻順の箇条書きで 1 通に。クラス '-' と空の教室は出さない", () => {
    const text = buildSubContactMessage(
      [sub({ id: 2, slotId: 2 }), sub({ id: 3, slotId: 3 }), sub({ id: 1, slotId: 1 })],
      SLOT_MAP
    );
    expect(text).toBe(
      [
        "【代行のお願い】",
        "9/18 (金)",
        "・18:55-19:40 高1 古文",
        "・19:50-20:35 中3A 英語 (502)",
        "・20:45-21:30 中3B 数学 (503)",
        "堀上先生の代わりに入っていただける方を探しています。",
      ].join("\n")
    );
  });

  it("時刻はその日の実際の時刻 (コマ移動 > 特別時程 > 元の時刻)", () => {
    const daySchedules = [
      {
        id: 1,
        date: "2026-09-18",
        targetGrades: ["中3"],
        timeMap: [{ from: "19:50-20:35", to: "17:50-18:40" }],
        cancelTimes: [],
      },
    ];
    expect(effectiveSlotTime(SLOT_A, "2026-09-18", { daySchedules })).toBe("17:50-18:40");
    const adjustments = [
      { id: 9, type: "move", date: "2026-09-18", slotId: 1, targetTime: "17:00-17:45" },
    ];
    expect(effectiveSlotTime(SLOT_A, "2026-09-18", { daySchedules, adjustments })).toBe(
      "17:00-17:45"
    );
    // 別の日には効かない
    expect(effectiveSlotTime(SLOT_A, "2026-09-25", { daySchedules, adjustments })).toBe(
      "19:50-20:35"
    );
    expect(buildSubContactMessage([sub()], SLOT_MAP, { adjustments })).toContain(
      "9/18 (金) 17:00-17:45 中3A 英語 (502)"
    );
  });

  it("コマが引けなければ空文字", () => {
    expect(buildSubContactMessage([sub({ slotId: 999 })], SLOT_MAP)).toBe("");
    expect(buildSubContactMessage([], SLOT_MAP)).toBe("");
  });
});

describe("contactGroupKey", () => {
  it("日付・元講師・代行者・状態が同じものだけ同じキー", () => {
    const a = sub();
    expect(contactGroupKey(sub({ id: 2, slotId: 2 }))).toBe(contactGroupKey(a));
    expect(contactGroupKey(sub({ date: "2026-09-19" }))).not.toBe(contactGroupKey(a));
    expect(contactGroupKey(sub({ originalTeacher: "河野" }))).not.toBe(contactGroupKey(a));
    expect(contactGroupKey(sub({ substitute: "福江" }))).not.toBe(contactGroupKey(a));
    expect(contactGroupKey(sub({ status: "confirmed" }))).not.toBe(contactGroupKey(a));
  });
});
