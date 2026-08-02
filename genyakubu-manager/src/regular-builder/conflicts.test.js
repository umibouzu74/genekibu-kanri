import { describe, expect, it } from "vitest";
import {
  buildConflictView,
  computeConflicts,
  conflictKey,
  entryRef,
} from "./conflicts";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// 2 タブ構成: 中3 (18:00 開始) と 中1・中2 (18:55 開始) で時限 id は別だが
// 時間帯が重なるケースを再現する。
function twoTabProject() {
  const p = makeProject();
  p.periods = [
    { id: 1, label: "中3 1限", time: "18:00-18:45" },
    { id: 2, label: "中3 2限", time: "18:55-19:40" },
    { id: 11, label: "中12 1限", time: "18:55-19:40" },
  ];
  p.tabs = [
    {
      id: 1,
      name: "中3",
      grade: "中3",
      classes: [{ id: 1, label: "S", room: "501" }],
      days: ["月"],
      periodIds: [1, 2],
      schedule: {},
    },
    {
      id: 2,
      name: "中2",
      grade: "中2",
      classes: [{ id: 1, label: "S", room: "602" }],
      days: ["月"],
      periodIds: [11],
      schedule: {},
    },
  ];
  return p;
}

describe("computeConflicts - 講師重複", () => {
  it("タブをまたぐ同時間帯の同一講師を検出する", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("teacher");
    const { byRef } = buildConflictView(list, []);
    expect(byRef.size).toBe(2);
    expect([...byRef.values()][0][0]).toContain("堀上");
  });

  it("時間帯が重ならなければ衝突なし (中3 1限 18:00 と 中12 1限 18:55)", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = { subj: "数学", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("曜日が違えば衝突なし", () => {
    const p = twoTabProject();
    p.tabs[1].days = ["火"];
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("火", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("複数講師セルは分解して照合し、IME の全角中点も拾う", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "個別", teacher: "香川・福江" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "理科", teacher: "福江" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].label).toContain("福江");
  });

  it("同一セル内の複数講師 (並列監督) は衝突にならない", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "確認テスト", teacher: "藤田·大屋敷" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("computeConflicts - 教室重複", () => {
  it("同時間帯の同一教室 (クラス既定 vs セル上書き) を検出する", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "A" }; // 教室 501 (既定)
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "数学", teacher: "B", room: "501" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("room");
    expect(list[0].label).toContain("501");
  });

  it("教室が未設定 (空) 同士は衝突にしない", () => {
    const p = twoTabProject();
    p.tabs[0].classes[0].room = "";
    p.tabs[1].classes[0].room = "";
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "A" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "数学", teacher: "B" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("computeConflicts - 時刻未設定", () => {
  it("時刻の無い時限のセルは判定対象外 (落ちない)", () => {
    const p = twoTabProject();
    p.periods[1].time = "";
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("entryRef", () => {
  it("タブ id とセルキーで一意になる", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = { subj: "数学" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(0);
    expect(
      entryRef({ tab: p.tabs[0], key: makeCellKey("月", 1, 1) })
    ).toBe("1:月|1|1");
  });
});

describe("conflictKey / buildConflictView (承認)", () => {
  function conflictedProject() {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    return p;
  }

  it("conflictKey は refs の順序に依存しない", () => {
    const { list } = computeConflicts(conflictedProject());
    const c = list[0];
    const swapped = { ...c, refs: [c.refs[1], c.refs[0]] };
    expect(conflictKey(swapped)).toBe(conflictKey(c));
  });

  it("承認済みの衝突はバッジ (active) と赤枠 (byRef) から外れる", () => {
    const { list } = computeConflicts(conflictedProject());
    const key = conflictKey(list[0]);
    const view = buildConflictView(list, [key]);
    expect(view.active).toHaveLength(0);
    expect(view.approved).toHaveLength(1);
    expect(view.byRef.size).toBe(0);
  });

  it("承認リストに無い衝突は active のまま", () => {
    const { list } = computeConflicts(conflictedProject());
    const view = buildConflictView(list, ["別のキー"]);
    expect(view.active).toHaveLength(1);
    expect(view.approved).toHaveLength(0);
    expect(view.byRef.size).toBe(2);
  });

  it("セルが動くと承認は無効になる (キー不一致で active に戻る)", () => {
    const p = conflictedProject();
    const key = conflictKey(computeConflicts(p).list[0]);
    // 衝突セルを別クラス列 (id 2) に移すと refs が変わる
    p.tabs[1].classes.push({ id: 2, label: "S2", room: "603" });
    const cell = p.tabs[1].schedule[makeCellKey("月", 11, 1)];
    delete p.tabs[1].schedule[makeCellKey("月", 11, 1)];
    p.tabs[1].schedule[makeCellKey("月", 11, 2)] = cell;
    const view = buildConflictView(computeConflicts(p).list, [key]);
    expect(view.active).toHaveLength(1);
  });
});
