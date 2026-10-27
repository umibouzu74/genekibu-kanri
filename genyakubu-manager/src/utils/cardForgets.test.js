// バイトのカード忘れ (utils/cardForgets)。
import { describe, expect, it } from "vitest";
import {
  CARD_MISSING,
  cardForgetsInRange,
  cardForgetTimesText,
  describeCardForget,
  findCardForget,
  migrateCardForgets,
  normalizeClockTime,
  removeCardForget,
  restoreCardForget,
  setCardForget,
} from "./cardForgets";

const NOW = new Date("2026-10-27T09:00:00.000Z");

describe("normalizeClockTime", () => {
  it("全角・区切りなし・「時分」・時だけのゆれを 16:50 の形に", () => {
    expect(normalizeClockTime("16:50")).toEqual({ ok: true, time: "16:50" });
    expect(normalizeClockTime("１６：５０")).toEqual({ ok: true, time: "16:50" });
    expect(normalizeClockTime("1650")).toEqual({ ok: true, time: "16:50" });
    expect(normalizeClockTime("9:05")).toEqual({ ok: true, time: "09:05" });
    expect(normalizeClockTime("16時50分")).toEqual({ ok: true, time: "16:50" });
    expect(normalizeClockTime("17")).toEqual({ ok: true, time: "17:00" });
    expect(normalizeClockTime(" ")).toEqual({ ok: true, time: "" });
  });

  it("読めない・範囲外は理由つきで止める", () => {
    expect(normalizeClockTime("25:00").ok).toBe(false);
    expect(normalizeClockTime("16:70").ok).toBe(false);
    expect(normalizeClockTime("夕方").ok).toBe(false);
  });
});

describe("migrateCardForgets", () => {
  it("形にならないものを捨て、空の値はキーごと持たない", () => {
    const out = migrateCardForgets([
      { id: 1, name: " 山田 ", date: "2026-10-03", missing: "both", inTime: "１６５０", outTime: "", memo: " " },
      { id: 2, name: "", date: "2026-10-03" },
      { id: "x", name: "佐藤", date: "2026-10-03" },
      { id: 3, name: "佐藤", date: "2026-02-31" },
      null,
    ]);
    expect(out).toEqual([{ id: 1, name: "山田", date: "2026-10-03", missing: "both", inTime: "16:50" }]);
  });

  it("知らない種類は出勤・退勤。打刻できた側の時刻は持たない", () => {
    expect(migrateCardForgets([{ id: 1, name: "山田", date: "2026-10-03", missing: "?" }])[0].missing).toBe(
      CARD_MISSING.BOTH
    );
    const [onlyIn] = migrateCardForgets([
      { id: 1, name: "山田", date: "2026-10-03", missing: "in", inTime: "16:50", outTime: "21:00" },
    ]);
    expect(onlyIn).toEqual({ id: 1, name: "山田", date: "2026-10-03", missing: "in", inTime: "16:50" });
  });

  it("RTDB のオブジェクト形も読み、同じ人・同じ日は後の方を残す", () => {
    const out = migrateCardForgets({
      0: { id: 1, name: "山田", date: "2026-10-03", missing: "in" },
      1: { id: 2, name: "山田", date: "2026-10-03", missing: "out" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].missing).toBe("out");
  });
});

describe("setCardForget / removeCardForget / restoreCardForget", () => {
  it("入れ直すと置き換え (id はそのまま)、消すと無くなる", () => {
    let list = setCardForget([], { name: "山田", date: "2026-10-03", missing: "both", inTime: "16:50" }, { now: NOW });
    expect(list).toEqual([
      {
        id: 1,
        name: "山田",
        date: "2026-10-03",
        missing: "both",
        inTime: "16:50",
        recordedAt: "2026-10-27T09:00:00.000Z",
      },
    ]);
    list = setCardForget(list, { name: "佐藤", date: "2026-10-03", missing: "out" }, { now: NOW });
    list = setCardForget(list, { name: "山田", date: "2026-10-03", missing: "in", memo: "責任者確認" }, { now: NOW });
    expect(list).toHaveLength(2);
    expect(findCardForget(list, "山田", "2026-10-03")).toMatchObject({ id: 1, missing: "in", memo: "責任者確認" });
    expect(findCardForget(list, "山田", "2026-10-03").inTime).toBeUndefined();
    list = removeCardForget(list, "山田", "2026-10-03");
    expect(list.map((r) => r.name)).toEqual(["佐藤"]);
  });

  it("元に戻すは控えた (人, 日) だけ。その間の他の記録は消さない", () => {
    const before = setCardForget([], { name: "山田", date: "2026-10-03", missing: "both" }, { now: NOW });
    const prev = findCardForget(before, "山田", "2026-10-03");
    let list = removeCardForget(before, "山田", "2026-10-03");
    // 消した後に別の人の記録が入り、消した id が使い回された
    list = setCardForget(list, { name: "佐藤", date: "2026-10-04", missing: "in" }, { now: NOW });
    expect(list[0].id).toBe(prev.id);
    list = restoreCardForget(list, "山田", "2026-10-03", prev);
    expect(list.map((r) => `${r.name}:${r.id}`)).toEqual(["山田:2", "佐藤:1"]);

    // 新しく入れた記録を元に戻す (控え = null) と、その (人, 日) だけ消える
    const added = setCardForget(list, { name: "鈴木", date: "2026-10-05", missing: "out" }, { now: NOW });
    expect(restoreCardForget(added, "鈴木", "2026-10-05", null)).toEqual(list);
  });
});

describe("読む", () => {
  const list = migrateCardForgets([
    { id: 1, name: "山田", date: "2026-10-03", missing: "both", inTime: "16:50", outTime: "21:05", memo: "確認済み" },
    { id: 2, name: "佐藤", date: "2026-10-03", missing: "out" },
    { id: 3, name: "山田", date: "2026-09-20", missing: "in" },
  ]);

  it("期間の記録を日付 → 名前 (渡した比べ方) の順に", () => {
    const byKana = (a, b) => ({ 佐藤: 0, 山田: 1 })[a] - ({ 佐藤: 0, 山田: 1 })[b];
    expect(cardForgetsInRange(list, "2026-09-21", "2026-10-20", byKana).map((r) => r.id)).toEqual([2, 1]);
    expect(cardForgetsInRange(list, "2026-09-21", "2026-10-20").map((r) => r.id)).toEqual([1, 2]);
  });

  it("説明の文", () => {
    expect(cardForgetTimesText(list.find((r) => r.id === 1))).toBe("出勤 16:50 / 退勤 21:05");
    expect(describeCardForget(list.find((r) => r.id === 1))).toBe(
      "出勤・退勤の打刻なし (出勤 16:50 / 退勤 21:05)。確認済み"
    );
    expect(describeCardForget(list.find((r) => r.id === 2))).toBe("退勤だけの打刻なし");
  });
});
