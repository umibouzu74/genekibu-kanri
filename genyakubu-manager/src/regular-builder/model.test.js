import { describe, expect, it } from "vitest";
import {
  createDefaultProject,
  effectiveRoom,
  makeCellKey,
  parseCellKey,
  resolveAllEntries,
  resolveTabEntries,
  sanitizeProject,
  tabPeriods,
} from "./model";

export function makeProject(over = {}) {
  return {
    ...createDefaultProject(),
    name: "2026 後期",
    periods: [
      { id: 1, label: "1限", time: "18:00-18:45" },
      { id: 2, label: "2限", time: "18:55-19:40" },
      { id: 3, label: "確認テスト", time: "20:40-20:55" },
    ],
    teachers: [{ name: "堀上" }, { name: "半田" }],
    tabs: [
      {
        id: 1,
        name: "中3",
        grade: "中3",
        classes: [
          { id: 1, label: "S", room: "501" },
          { id: 2, label: "A", room: "502" },
        ],
        days: ["月", "火"],
        periodIds: [1, 2],
        schedule: {
          [makeCellKey("月", 1, 1)]: { subj: "数学", teacher: "半田" },
          [makeCellKey("月", 2, 2)]: { subj: "英語", teacher: "堀上", room: "601", note: "合同" },
        },
      },
    ],
    ...over,
  };
}

describe("makeCellKey / parseCellKey", () => {
  it("round-trip する", () => {
    const key = makeCellKey("月", 3, 12);
    expect(key).toBe("月|3|12");
    expect(parseCellKey(key)).toEqual({ day: "月", periodId: 3, classId: 12 });
  });
});

describe("sanitizeProject", () => {
  it("正常なプロジェクトはそのまま通る", () => {
    const p = sanitizeProject(makeProject());
    expect(p.name).toBe("2026 後期");
    expect(p.periods).toHaveLength(3);
    expect(p.tabs[0].classes).toHaveLength(2);
    expect(p.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
  });

  it("オブジェクトでない入力は null", () => {
    expect(sanitizeProject(null)).toBe(null);
    expect(sanitizeProject("x")).toBe(null);
    expect(sanitizeProject(42)).toBe(null);
  });

  it("欠けた配列・不正な要素は既定値に整える", () => {
    const p = sanitizeProject({ name: "x", tabs: [{ name: 5, days: ["月", "?"], schedule: { a: { subj: 1 } } }] });
    expect(p.periods).toEqual([]);
    expect(p.subjects.length).toBeGreaterThan(0);
    expect(p.tabs[0].name).toBe("タブ1");
    expect(p.tabs[0].days).toEqual(["月"]); // 不正曜日は除外
    expect(p.tabs[0].schedule).toEqual({}); // 空セルは落とす
  });
});

describe("tabPeriods", () => {
  it("プール順で、タブが使う時限のみ返す", () => {
    const p = makeProject();
    p.tabs[0].periodIds = [2, 1]; // 順序はプール順が正
    expect(tabPeriods(p, p.tabs[0]).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("resolveTabEntries / resolveAllEntries", () => {
  it("セルを day/period/cls に解決する", () => {
    const p = makeProject();
    const entries = resolveTabEntries(p, p.tabs[0]);
    expect(entries).toHaveLength(2);
    const e = entries.find((x) => x.cls.label === "S");
    expect(e.day).toBe("月");
    expect(e.period.time).toBe("18:00-18:45");
    expect(e.cell.subj).toBe("数学");
  });

  it("設定変更で無効になったセル (曜日外・時限外・クラス消滅) は落とす", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("水", 1, 1)] = { subj: "国語" }; // 水は days 外
    p.tabs[0].schedule[makeCellKey("月", 3, 1)] = { subj: "国語" }; // 時限 3 は periodIds 外
    p.tabs[0].schedule[makeCellKey("月", 1, 99)] = { subj: "国語" }; // クラス 99 は無い
    expect(resolveTabEntries(p, p.tabs[0])).toHaveLength(2);
    expect(resolveAllEntries(p)).toHaveLength(2);
  });
});

describe("effectiveRoom", () => {
  it("セルの教室があれば優先、無ければクラス既定", () => {
    const p = makeProject();
    const entries = resolveTabEntries(p, p.tabs[0]);
    const s = entries.find((x) => x.cls.label === "S");
    const a = entries.find((x) => x.cls.label === "A");
    expect(effectiveRoom(s)).toBe("501"); // クラス既定
    expect(effectiveRoom(a)).toBe("601"); // セル上書き
  });
});
