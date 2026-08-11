import { describe, expect, it } from "vitest";
import { copyDay, describeDayCopy } from "./dayCopy";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// makeProject: 中3 タブ (月・火, 時限 1/2, クラス S(1)/A(2))。
// schedule: 月1限 S = 数学/半田、月2限 A = 英語/堀上 (601, 合同)

const cells = (tabs, day, tabIdx = 0) =>
  Object.keys(tabs[tabIdx].schedule).filter((k) => k.startsWith(`${day}|`));

describe("copyDay", () => {
  it("曜日のコマをそのまま複製する (コピー元は残る)", () => {
    const p = makeProject();
    const res = copyDay(p.tabs, "月", "火");
    expect(res.copied).toBe(2);
    expect(res.overwritten).toBe(0);
    expect(cells(res.tabs, "月")).toHaveLength(2);
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    expect(res.tabs[0].schedule[makeCellKey("火", 2, 2)]).toEqual({
      subj: "英語",
      teacher: "堀上",
      room: "601",
      note: "合同",
    });
  });

  it("元の tabs は不変 (純関数)", () => {
    const p = makeProject();
    const before = JSON.stringify(p.tabs);
    copyDay(p.tabs, "月", "火");
    expect(JSON.stringify(p.tabs)).toBe(before);
  });

  it("overwrite はコピー先の既存コマを置き換える", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "国語", teacher: "松川" };
    const res = copyDay(p.tabs, "月", "火", { mode: "overwrite" });
    expect(res.copied).toBe(2);
    expect(res.overwritten).toBe(1);
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 1)].subj).toBe("数学");
  });

  it("fill は空きマスだけ埋める", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "国語", teacher: "松川" };
    const res = copyDay(p.tabs, "月", "火", { mode: "fill" });
    expect(res.copied).toBe(1);
    expect(res.skippedFilled).toBe(1);
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 1)].subj).toBe("国語");
    expect(res.tabs[0].schedule[makeCellKey("火", 2, 2)].subj).toBe("英語");
  });

  it("コピー先がロック中のコマは上書きしない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "国語",
      teacher: "松川",
      locked: true,
    };
    const res = copyDay(p.tabs, "月", "火");
    expect(res.copied).toBe(1);
    expect(res.skippedLocked).toBe(1);
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 1)].subj).toBe("国語");
  });

  it("ロックは複製しない (コピー先は編集できる状態で置く)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)].locked = true;
    const res = copyDay(p.tabs, "月", "火");
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 1)].locked).toBeUndefined();
    // コピー元のロックはそのまま
    expect(res.tabs[0].schedule[makeCellKey("月", 1, 1)].locked).toBe(true);
  });

  it("残骸セル (使わない時限・消えたクラス) はコピーしない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 3, 1)] = { subj: "残骸" }; // 時限 3 は periodIds 外
    p.tabs[0].schedule[makeCellKey("月", 1, 99)] = { subj: "残骸" }; // クラス 99 は無い
    const res = copyDay(p.tabs, "月", "火");
    expect(res.copied).toBe(2);
    expect(res.tabs[0].schedule[makeCellKey("火", 3, 1)]).toBeUndefined();
    expect(res.tabs[0].schedule[makeCellKey("火", 1, 99)]).toBeUndefined();
  });

  it("コピー先の曜日を使わない学年は既定でスキップし、名前を返す", () => {
    const p = makeProject();
    const res = copyDay(p.tabs, "月", "水");
    expect(res.copied).toBe(0);
    expect(res.skippedTabs).toEqual(["中3"]);
    expect(res.tabs).toBe(p.tabs); // 変更なし
  });

  it("addDay で曜日ごと追加してコピーできる (曜日の並びは表示順)", () => {
    const p = makeProject();
    const res = copyDay(p.tabs, "月", "水", { addDay: true });
    expect(res.copied).toBe(2);
    expect(res.addedDayTabs).toEqual(["中3"]);
    expect(res.tabs[0].days).toEqual(["月", "火", "水"]);
    expect(res.skippedTabs).toEqual([]);
  });

  it("コピー元の曜日を使わない学年は対象外 (スキップにも数えない)", () => {
    const p = makeProject();
    p.tabs.push({
      ...p.tabs[0],
      id: 2,
      name: "中1",
      days: ["水"],
      schedule: { [makeCellKey("水", 1, 1)]: { subj: "国語" } },
    });
    const res = copyDay(p.tabs, "月", "火");
    expect(res.copied).toBe(2);
    expect(res.skippedTabs).toEqual([]);
    expect(res.tabs[1]).toBe(p.tabs[1]);
  });

  it("複数学年をまとめてコピーする", () => {
    const p = makeProject();
    p.tabs.push({
      ...p.tabs[0],
      id: 2,
      name: "中1",
      schedule: { [makeCellKey("月", 1, 1)]: { subj: "国語", teacher: "松川" } },
    });
    const res = copyDay(p.tabs, "月", "火");
    expect(res.copied).toBe(3);
    expect(res.tabs[1].schedule[makeCellKey("火", 1, 1)].subj).toBe("国語");
  });

  it("同じ曜日・不正な曜日は no-op", () => {
    const p = makeProject();
    for (const args of [["月", "月"], ["", "火"], ["月", "X"]]) {
      const res = copyDay(p.tabs, args[0], args[1]);
      expect(res.copied).toBe(0);
      expect(res.tabs).toBe(p.tabs);
    }
  });
});

describe("describeDayCopy", () => {
  const run = (p, from, to, opts) => {
    const res = copyDay(p.tabs, from, to, opts);
    return describeDayCopy(res, from, to);
  };

  it("コピー件数と上書き件数を伝える", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "国語" };
    const text = run(p, "月", "火");
    expect(text).toContain("月曜の 2 コマを火曜へコピー");
    expect(text).toContain("1 コマは上書き");
  });

  it("0 件のときは理由を出す", () => {
    const p = makeProject();
    expect(run(p, "月", "水")).toContain("中3 は水曜を使わない設定です");
    expect(run(p, "火", "月")).toContain("火曜にコピーできるコマがありません");
  });

  it("追加した曜日・対象外の学年も添える", () => {
    const p = makeProject();
    p.tabs.push({ ...p.tabs[0], id: 2, name: "中1", schedule: {} });
    const text = run(p, "月", "水", { addDay: true });
    expect(text).toContain("中3・中1 に水曜を追加");
  });
});
