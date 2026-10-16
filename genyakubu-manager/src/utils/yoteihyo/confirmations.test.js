import { describe, expect, it } from "vitest";
import {
  confirmationFor,
  confirmedEntriesFor,
  courseIdentity,
  findingFingerprint,
  migrateYoteihyoConfirmed,
  restoreConfirmed,
  splitByConfirmation,
  withConfirmed,
} from "./confirmations";
import { mergeHighSchoolSheets, parseHighSchoolSheet } from "./highSchoolSheet";
import { smallH12Sheet } from "./testUtils";

const slotA = { id: 1, grade: "高1", subj: "高松西 数学" };
const slotB = { id: 2, grade: "高1", subj: "高松西 英語" };

function finding(over = {}) {
  return {
    date: "2026-10-15",
    courseKey: "高1|高松西高校",
    kind: "needOff",
    yt: { status: "cancelled", label: "休講 (灰色)" },
    sys: { held: [{ slot: slotB, status: { held: true, kind: "held" } }], off: [] },
    ...over,
  };
}

describe("courseIdentity", () => {
  it("行・列の位置ではなく学年の組と講座名で決まる (改訂版を読み直しても同じ)", () => {
    const a = mergeHighSchoolSheets([{ name: "a", parsed: parseHighSchoolSheet(smallH12Sheet()) }]);
    const b = mergeHighSchoolSheets([
      { name: "b", parsed: parseHighSchoolSheet(smallH12Sheet({ name: "2026 H1H2【10-11月】教員用 (改訂)" })) },
    ]);
    const ka = courseIdentity(a.courses.get("高1|高松西高校"));
    expect(ka).toBe("高1|高松西");
    expect(courseIdentity(b.courses.get("高1|高松西高校"))).toBe(ka);
    // 空白・言い換えの違いも同じ講座
    expect(courseIdentity({ grades: ["高1"], name: "高松西 高校", mode: "column" })).toBe(ka);
    expect(courseIdentity({ grades: ["高3"], name: "共通テスト英語", symbol: "★", mode: "symbol" })).toBe(
      "高3|sym:★:共テ英語"
    );
    expect(courseIdentity({ grades: ["高3"], key: "高3|mark:土", mode: "mark" })).toBe("高3|mark:土");
    expect(courseIdentity({ grades: ["高3"], key: "高3|列5", name: "", mode: "column" })).toBe("高3|列5");
  });
});

describe("findingFingerprint", () => {
  it("食い違いの種類・システムのコマとその状態が変われば変わる。理由の文言では変わらない", () => {
    const fp = findingFingerprint(finding());
    expect(findingFingerprint(finding())).toBe(fp);
    expect(findingFingerprint(finding({ kind: "partial" }))).not.toBe(fp);
    expect(
      findingFingerprint(finding({ sys: { held: [{ slot: slotA, status: { held: true, kind: "held" } }], off: [] } }))
    ).not.toBe(fp);
    const off = (target, label) =>
      finding({
        kind: "needOn",
        yt: { status: "held" },
        sys: { held: [], off: [{ slot: slotA, status: { kind: "rescheduled", label, adj: { targetDate: target } } }] },
      });
    expect(findingFingerprint(off("2026-10-09", "振替で 10/9 へ"))).toBe(findingFingerprint(off("2026-10-09", "別の書き方")));
    expect(findingFingerprint(off("2026-10-09", "x"))).not.toBe(findingFingerprint(off("2026-10-16", "x")));
  });
});

describe("splitByConfirmation", () => {
  const courses = new Map([["高1|高松西高校", { key: "高1|高松西高校", grades: ["高1"], name: "高松西高校", mode: "column" }]]);

  it("確認済みは分け、中身が変わったものはまた出す (前の確認を添える)", () => {
    const f = finding();
    const entry = confirmationFor(f, courses, "2026-10-16");
    expect(entry).toEqual({ date: "2026-10-15", course: "高1|高松西", fp: findingFingerprint(f), at: "2026-10-16" });
    const same = splitByConfirmation([f], courses, [entry]);
    expect(same.open).toEqual([]);
    expect(same.confirmed).toEqual([{ finding: f, entry }]);
    const changed = finding({ kind: "partial" });
    const r = splitByConfirmation([changed], courses, [entry]);
    expect(r.open).toEqual([changed]);
    expect(r.stale.get(changed)).toEqual(entry);
    // 別の日は関係ない
    expect(splitByConfirmation([finding({ date: "2026-10-22" })], courses, [entry]).open).toHaveLength(1);
  });
});

describe("保存形の操作", () => {
  const e1 = { date: "2026-10-15", course: "高1|高松西", fp: "a", at: "2026-10-16" };
  const e2 = { date: "2026-11-06", course: "高1|高松西", fp: "b" };

  it("形の崩れたものを捨て、同じ (日, 講座) は後の方を使う", () => {
    expect(migrateYoteihyoConfirmed([e1, { date: "10/15", course: "x", fp: "c" }, { ...e1, fp: "z" }, null])).toEqual([
      { ...e1, fp: "z" },
    ]);
    expect(migrateYoteihyoConfirmed({ 0: e1, 3: e2 })).toEqual([e1, e2]);
    expect(migrateYoteihyoConfirmed(null)).toEqual([]);
  });

  it("足す・取り消す・元に戻す", () => {
    const list = withConfirmed([e1], [e2]);
    expect(list).toEqual([e1, e2]);
    // 確認し直しは置き換え。元に戻すと前の確認に戻る
    const again = { ...e1, fp: "new", at: "2026-10-20" };
    const prev = confirmedEntriesFor(list, [again]);
    const replaced = withConfirmed(list, [again]);
    expect(replaced).toEqual([e2, again]);
    expect(restoreConfirmed(replaced, [again], prev)).toEqual([e2, e1]);
    // 取り消し
    expect(restoreConfirmed(list, [e2])).toEqual([e1]);
  });
});
