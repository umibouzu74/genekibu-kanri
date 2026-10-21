import { describe, expect, it } from "vitest";
import {
  buildImportedEvents,
  parseFlexibleDate,
  parseGradeList,
  parseSpecialEventImport,
  parseSpecialEventType,
  specialEventsToTsv,
  splitList,
} from "./specialEventImport";

const HEAD = "開始日\t終了日\t種別\t名称\t対象学年\tタグ\tメモ";

describe("parseFlexibleDate", () => {
  it("年月日のいろいろな書き方", () => {
    expect(parseFlexibleDate("2026-11-01", 2026)).toBe("2026-11-01");
    expect(parseFlexibleDate("2026/11/1", 2026)).toBe("2026-11-01");
    expect(parseFlexibleDate("2027年1月9日", 2026)).toBe("2027-01-09");
    expect(parseFlexibleDate("２０２６／１１／１", 2026)).toBe("2026-11-01");
  });

  it("年の無い日付は年度から補う (1〜3 月は翌年)", () => {
    expect(parseFlexibleDate("11/1", 2026)).toBe("2026-11-01");
    expect(parseFlexibleDate("4/1", 2026)).toBe("2026-04-01");
    expect(parseFlexibleDate("3/31", 2026)).toBe("2027-03-31");
    expect(parseFlexibleDate("1月12日", 2026)).toBe("2027-01-12");
    expect(parseFlexibleDate("11/1 (日)", 2026)).toBe("2026-11-01");
  });

  it("読めないものは null", () => {
    expect(parseFlexibleDate("", 2026)).toBe(null);
    expect(parseFlexibleDate("2026-02-30", 2026)).toBe(null);
    expect(parseFlexibleDate("来週", 2026)).toBe(null);
    expect(parseFlexibleDate("11/1", undefined)).toBe(null);
  });
});

describe("parseGradeList", () => {
  it("空・全学年は []", () => {
    expect(parseGradeList("")).toEqual({ grades: [] });
    expect(parseGradeList("全学年")).toEqual({ grades: [] });
  });

  it("区切りは「,」「、」「・」。並びは学年順", () => {
    expect(parseGradeList("附中3,中3")).toEqual({ grades: ["中3", "附中3"] });
    expect(parseGradeList("中1、中2・附中1")).toEqual({ grades: ["中1", "中2", "附中1"] });
  });

  it("中学部・高校部・範囲", () => {
    expect(parseGradeList("中学部").grades).toEqual(["中1", "中2", "中3", "附中1", "附中2", "附中3"]);
    expect(parseGradeList("高校部").grades).toEqual(["高1", "高2", "高3"]);
    expect(parseGradeList("中1〜3").grades).toEqual(["中1", "中2", "中3"]);
    expect(parseGradeList("中1〜中3・附中1~3").grades).toEqual([
      "中1", "中2", "中3", "附中1", "附中2", "附中3",
    ]);
  });

  it("全部の学年を並べたら全学年 ([])", () => {
    expect(parseGradeList("中学部,高校部")).toEqual({ grades: [] });
  });

  it("知らない学年はエラー", () => {
    expect(parseGradeList("中4").error).toMatch("中4");
    expect(parseGradeList("小6").error).toMatch("小6");
  });
});

describe("parseSpecialEventType", () => {
  it("ラベル・key・アイコン付き・仮置きの呼び方", () => {
    expect(parseSpecialEventType("塾のテスト")).toBe("jukuTest");
    expect(parseSpecialEventType("jukuTest")).toBe("jukuTest");
    expect(parseSpecialEventType("jukutest")).toBe("jukuTest");
    expect(parseSpecialEventType("📚 講習")).toBe("course");
    expect(parseSpecialEventType("公立中")).toBe("school");
    expect(parseSpecialEventType("")).toBe("other");
    expect(parseSpecialEventType("遠足")).toBe(null);
  });
});

describe("splitList", () => {
  it("空と重複を捨てる", () => {
    expect(splitList(" 中学, 高松、中学 ・ ")).toEqual(["中学", "高松"]);
  });
});

describe("parseSpecialEventImport", () => {
  it("見出し付きの表を読む", () => {
    const text = [
      HEAD,
      "11/1\t\t塾のテスト\t第4回 公立高校チャレンジテスト\t中3,附中3\t中学\t",
      "12/25\t12/28\t講習\t冬期講習（前半）\t中学部\t\t前半",
      "1/12\t3/4\tcourse\t中3 直前ポイント\t中3・附中3\t\t火木・水金",
    ].join("\n");
    const { rows, header } = parseSpecialEventImport(text, { fiscalYear: 2026, source: "2026中学予定表" });
    expect(header).toBe(true);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(rows[0].event).toEqual({
      name: "第4回 公立高校チャレンジテスト",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      eventType: "jukuTest",
      targetGrades: ["中3", "附中3"],
      memo: "",
      tags: ["中学"],
      source: "2026中学予定表",
    });
    expect(rows[2].event).toMatchObject({
      startDate: "2027-01-12",
      endDate: "2027-03-04",
      eventType: "course",
      memo: "火木・水金",
    });
  });

  it("列の並べ替え・省略 (見出しで対応づける)", () => {
    const text = ["名称\t開始日\t種別", "公立中 終業式\t2026/12/24\t学校の予定"].join("\n");
    const { rows } = parseSpecialEventImport(text, { fiscalYear: 2026 });
    expect(rows[0]).toMatchObject({
      status: "ok",
      event: { name: "公立中 終業式", startDate: "2026-12-24", eventType: "school", targetGrades: [] },
    });
    expect(rows[0].event).not.toHaveProperty("source");
  });

  it("行ごとのエラー理由", () => {
    const text = [
      HEAD,
      "11/1\t\t塾のテスト\t\t\t\t",
      "11/31\t\t塾のテスト\tx\t\t\t",
      "11/5\t11/3\t塾のテスト\tx\t\t\t",
      "11/5\t\t遠足\tx\t\t\t",
      "11/5\t\t塾のテスト\tx\t中4\t\t",
    ].join("\n");
    const { rows } = parseSpecialEventImport(text, { fiscalYear: 2026 });
    expect(rows.map((r) => r.status)).toEqual(["error", "error", "error", "error", "error"]);
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6]);
    expect(rows[0].error).toMatch("名称");
    expect(rows[1].error).toMatch("開始日");
    expect(rows[2].error).toMatch("終了日");
    expect(rows[3].error).toMatch("種別");
    expect(rows[4].error).toMatch("中4");
  });

  it("同じ名称・開始日・終了日は重複 (登録済み・表の中)", () => {
    const existing = [
      { id: 1, name: "私立プレテスト", startDate: "2026-12-06", endDate: "2026-12-06" },
    ];
    const text = [
      HEAD,
      "12/6\t\t塾のテスト\t私立プレテスト\t中3\t\t",
      "12/20\t\t塾のテスト\t公立プレテスト①\t中3\t\t",
      "12/20\t\t塾のテスト\t公立プレテスト①\t中3\t\t",
    ].join("\n");
    const { rows } = parseSpecialEventImport(text, { existing, fiscalYear: 2026 });
    expect(rows.map((r) => r.status)).toEqual(["duplicate", "ok", "duplicate"]);
  });

  it("見出しが無ければ既定の列順で 1 行目から読む", () => {
    const { rows, header } = parseSpecialEventImport("2026-11-10\t\t公立中\t学習の診断④\t中3\t\t", {
      fiscalYear: 2026,
    });
    expect(header).toBe(false);
    expect(rows[0]).toMatchObject({ status: "ok", event: { eventType: "school", name: "学習の診断④" } });
  });

  it("Excel の囲み (セル内のタブ・改行は「\"」で囲まれる)", () => {
    const text = [HEAD, '11/1\t\t塾のテスト\t"チャレンジ ""第4回"""\t\t\t'].join("\n");
    const { rows } = parseSpecialEventImport(text, { fiscalYear: 2026 });
    expect(rows[0].event.name).toBe('チャレンジ "第4回"');
  });
});

describe("buildImportedEvents", () => {
  const rows = [
    { status: "ok", event: { name: "a" } },
    { status: "error", error: "x" },
    { status: "duplicate", event: { name: "b" } },
    { status: "ok", event: { name: "c" } },
  ];
  it("OK の行に id を振る。重複は既定で飛ばす", () => {
    expect(buildImportedEvents(rows, { startId: 10 })).toEqual([
      { id: 10, name: "a" },
      { id: 11, name: "c" },
    ]);
  });
  it("includeDuplicates で重複も入れる", () => {
    expect(buildImportedEvents(rows, { startId: 1, includeDuplicates: true }).map((e) => e.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("specialEventsToTsv", () => {
  const events = [
    {
      id: 2,
      name: "冬期講習（前半）",
      startDate: "2026-12-25",
      endDate: "2026-12-28",
      eventType: "course",
      targetGrades: ["中1", "中2", "中3"],
      memo: "",
      tags: [],
      source: "2026中学予定表",
    },
    {
      id: 1,
      name: "第4回 公立高校チャレンジテスト",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      eventType: "jukuTest",
      targetGrades: [],
      memo: "会場: 本校",
      tags: ["中学"],
    },
  ];

  it("開始日順・単日は終了日を空・全学年は「全学年」・出典の列", () => {
    const lines = specialEventsToTsv(events).split("\n");
    expect(lines[0]).toBe("開始日\t終了日\t種別\t名称\t対象学年\tタグ\tメモ\t出典");
    expect(lines[1]).toBe("2026-11-01\t\t塾のテスト\t第4回 公立高校チャレンジテスト\t全学年\t中学\t会場: 本校\t");
    expect(lines[2]).toBe("2026-12-25\t2026-12-28\t講習\t冬期講習（前半）\t中1,中2,中3\t\t\t2026中学予定表");
  });

  it("書き出したものを貼り戻すと同じ内容で読める", () => {
    const { rows } = parseSpecialEventImport(specialEventsToTsv(events), { fiscalYear: 2026 });
    expect(rows.every((r) => r.status === "ok")).toBe(true);
    const back = buildImportedEvents(rows, { startId: 1 });
    expect(back[0]).toMatchObject({ ...events[1], id: 1 });
    expect(back[1]).toMatchObject({ ...events[0], id: 2 });
  });
});
