import { describe, expect, it } from "vitest";
import { upgradeSpecialEventType, upgradeSpecialEventTypes } from "./specialEventTypes";
import { migrateSpecialEvents } from "./migrate";
import { migrateExportBundle, validateExportBundle } from "./schema";
import { parseSpecialEventType } from "./specialEventImport";

const M3 = ["中3", "附中3"];
const M123 = ["中1", "中2", "中3"];
const M123F = ["中1", "中2", "中3", "附中1", "附中2", "附中3"];
const M12F = ["中1", "中2", "附中1", "附中2"];

// 2026-10-20 に 2026中学予定表.xls から登録した 28 件 (種別はタグで仮置き)。
// [開始, 終了, 名称, 現在の eventType, 対象学年, 仮置きタグ, 期待する種別]
const REGISTERED = [
  ["2026-11-01", "2026-11-01", "第4回 公立高校チャレンジテスト", "other", M3, "塾テスト", "jukuTest"],
  ["2026-11-10", "2026-11-10", "学習の診断④", "festival", ["中3"], "公立中", "school"],
  ["2026-11-25", "2026-11-27", "公立中 2学期期末テスト（標準日）", "festival", M123, "公立中", "school"],
  ["2026-11-28", "2026-12-06", "第2回 保護者会", "other", M123F, "保護者会", "parents"],
  ["2026-12-06", "2026-12-06", "私立プレテスト", "other", M3, "塾テスト", "jukuTest"],
  ["2026-12-20", "2026-12-20", "公立プレテスト①", "other", M3, "塾テスト", "jukuTest"],
  ["2026-12-24", "2026-12-24", "公立中 終業式", "ceremony", M123, "公立中", "school"],
  ["2026-12-25", "2026-12-28", "冬期講習（前半）", "other", M123F, "講習", "course"],
  ["2026-12-27", "2026-12-27", "公立プレテスト②", "other", M3, "塾テスト", "jukuTest"],
  ["2027-01-03", "2027-01-03", "公立プレテスト③", "other", M3, "塾テスト", "jukuTest"],
  ["2027-01-04", "2027-01-07", "冬期講習（後半）", "other", M123F, "講習", "course"],
  ["2027-01-06", "2027-01-06", "学習の診断⑤", "festival", ["中3"], "公立中", "school"],
  ["2027-01-08", "2027-01-08", "公立中 始業式", "ceremony", M123, "公立中", "school"],
  ["2027-01-09", "2027-03-06", "中3 弱点補強 (土曜)", "other", M3, "講習", "course"],
  ["2027-01-12", "2027-03-04", "中3 直前ポイント (火木・水金)", "other", M3, "講習", "course"],
  ["2027-01-25", "2027-01-25", "総合テスト①", "festival", ["中3"], "公立中", "school"],
  ["2027-01-31", "2027-01-31", "公開実力テスト", "other", M12F, "塾テスト", "jukuTest"],
  ["2027-01-31", "2027-01-31", "直前確認テスト", "other", M3, "塾テスト", "jukuTest"],
  ["2027-02-02", "2027-02-02", "公立高校 自己推薦選抜", "announcement", M3, "入試", "entrance"],
  ["2027-02-08", "2027-02-08", "学習の診断（中1・中2）", "festival", ["中1", "中2"], "公立中", "school"],
  ["2027-02-08", "2027-02-08", "総合テスト②", "festival", ["中3"], "公立中", "school"],
  ["2027-02-09", "2027-02-09", "推薦 合格発表", "announcement", M3, "入試", "entrance"],
  ["2027-02-17", "2027-02-18", "公立中 学年末テスト（標準日）", "festival", ["中1", "中2"], "公立中", "school"],
  ["2027-03-09", "2027-03-09", "公立高校 学力検査", "announcement", M3, "入試", "entrance"],
  ["2027-03-10", "2027-03-10", "公立高校 面接・適性検査", "announcement", M3, "入試", "entrance"],
  ["2027-03-18", "2027-03-18", "公立高校 合格発表", "announcement", M3, "入試", "entrance"],
  ["2027-03-21", "2027-03-21", "公開実力テスト", "other", M12F, "塾テスト", "jukuTest"],
  ["2027-03-24", "2027-03-24", "公立中 終業式", "ceremony", ["中1", "中2"], "公立中", "school"],
];

// 既存の 4 件 (修学旅行、festival、学校名タグ)
const TRIPS = ["桜井", "第一", "高松", "西"].map((school, i) => ({
  id: 100 + i,
  name: `修学旅行 (${school})`,
  startDate: "2026-11-04",
  endDate: "2026-11-06",
  eventType: "festival",
  targetGrades: ["高2"],
  memo: "",
  tags: [school],
}));

const fixture = () => [
  ...REGISTERED.map(([startDate, endDate, name, eventType, targetGrades, tag], i) => ({
    id: i + 1,
    name,
    startDate,
    endDate,
    eventType,
    targetGrades,
    memo: "",
    // 学校・部のタグ (「中学」) と仮置きの種別タグが混ざっている
    tags: ["中学", tag],
  })),
  ...TRIPS,
];

describe("upgradeSpecialEventType", () => {
  it("2026-10-20 登録の 28 件をタグから種別へ移し、移したタグを消す", () => {
    const out = upgradeSpecialEventTypes(fixture());
    REGISTERED.forEach(([, , name, , , , expected], i) => {
      expect({ name, eventType: out[i].eventType }).toEqual({ name, eventType: expected });
      expect(out[i].tags).toEqual(["中学"]);
    });
  });

  it("修学旅行 4 件は school に寄せ、学校名タグは残す", () => {
    const out = upgradeSpecialEventTypes(fixture()).slice(REGISTERED.length);
    expect(out.map((e) => e.eventType)).toEqual(["school", "school", "school", "school"]);
    expect(out.map((e) => e.tags)).toEqual([["桜井"], ["第一"], ["高松"], ["西"]]);
  });

  it("旧種別の行き先 (タグ無し)", () => {
    const up = (eventType) => upgradeSpecialEventType({ id: 1, eventType }).eventType;
    expect(up("trip")).toBe("school");
    expect(up("ceremony")).toBe("school");
    expect(up("festival")).toBe("school");
    expect(up("announcement")).toBe("other");
    expect(up("unknown")).toBe("other");
    expect(up(undefined)).toBe("other");
  });

  it("announcement は「入試」タグ付きなら entrance", () => {
    const ev = upgradeSpecialEventType({ id: 1, eventType: "announcement", tags: ["入試"] });
    expect(ev.eventType).toBe("entrance");
    expect(ev.tags).toEqual([]);
  });

  it("新しい種別 (other 以外) は人が選んだものなので触らない", () => {
    const ev = { id: 1, eventType: "staff", tags: ["塾テスト"] };
    expect(upgradeSpecialEventType(ev)).toBe(ev);
  });

  it("何も変わらないときは同じオブジェクト (冪等)", () => {
    const ev = { id: 1, eventType: "other", tags: ["中学"] };
    expect(upgradeSpecialEventType(ev)).toBe(ev);
    const once = upgradeSpecialEventTypes(fixture());
    const twice = upgradeSpecialEventTypes(once);
    twice.forEach((e, i) => expect(e).toBe(once[i]));
  });

  it("tags の無いイベントに tags を足さない", () => {
    const ev = upgradeSpecialEventType({ id: 1, eventType: "trip" });
    expect(ev).not.toHaveProperty("tags");
  });
});

describe("migrateSpecialEvents (読み込み)", () => {
  it("種別を寄せたうえで欠けた項目を補う", () => {
    const [ev] = migrateSpecialEvents([
      { id: 3, name: "冬期講習", startDate: "2026-12-25", eventType: "other", tags: ["講習"] },
    ]);
    expect(ev).toMatchObject({
      eventType: "course",
      tags: [],
      endDate: "2026-12-25",
      targetGrades: [],
      memo: "",
    });
  });

  it("出典 (source) を保つ", () => {
    const [ev] = migrateSpecialEvents([
      { id: 1, name: "x", startDate: "2026-11-01", endDate: "2026-11-01", eventType: "jukuTest", source: "2026中学予定表" },
    ]);
    expect(ev.source).toBe("2026中学予定表");
  });
});

describe("v23 → v24 (バックアップ)", () => {
  it("旧種別・仮置きタグを寄せ、検証を通る", () => {
    const out = migrateExportBundle({ schemaVersion: 23, specialEvents: fixture() });
    const v = validateExportBundle(out);
    expect(v.ok).toBe(true);
    const types = v.data.specialEvents.map((e) => e.eventType);
    expect(types.filter((t) => t === "school")).toHaveLength(10 + 4);
    expect(types.filter((t) => t === "jukuTest")).toHaveLength(8);
    expect(types.filter((t) => t === "entrance")).toHaveLength(5);
    expect(types.filter((t) => t === "course")).toHaveLength(4);
    expect(types.filter((t) => t === "parents")).toHaveLength(1);
  });

  it("v24 のバックアップに旧種別が混ざっていたら弾く", () => {
    const v = validateExportBundle({
      schemaVersion: 24,
      specialEvents: [
        { id: 1, name: "x", startDate: "2026-11-01", endDate: "2026-11-01", eventType: "festival", targetGrades: [] },
      ],
    });
    expect(v.ok).toBe(false);
  });
});

describe("模試 (mock、v26)", () => {
  const mock = {
    id: 1,
    name: "桜井 3年第8回校外模試(進研マーク)",
    startDate: "2026-10-30",
    endDate: "2026-10-31",
    eventType: "mock",
    targetGrades: ["高3"],
    memo: "",
    tags: ["桜井"],
  };

  it("読み込み・移行で other に落ちない", () => {
    expect(upgradeSpecialEventType(mock)).toBe(mock);
    expect(migrateSpecialEvents([mock])[0].eventType).toBe("mock");
    const v = validateExportBundle(migrateExportBundle({ schemaVersion: 25, specialEvents: [mock] }));
    expect(v.ok).toBe(true);
    expect(v.data.specialEvents[0].eventType).toBe("mock");
  });

  it("まとめて登録の種別「模試」を読む", () => {
    expect(parseSpecialEventType("模試")).toBe("mock");
    expect(parseSpecialEventType("✏️ 模試")).toBe("mock");
    expect(parseSpecialEventType("mock")).toBe("mock");
  });
});
