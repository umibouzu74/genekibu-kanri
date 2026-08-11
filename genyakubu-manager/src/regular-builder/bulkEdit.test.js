import { describe, expect, it } from "vitest";
import { bulkEditCells, describeBulkEdit, fillCells } from "./bulkEdit";
import { makeCellKey, makeCellRef } from "./model";
import { makeProject } from "./testUtils";

// makeProject: 中3 タブ (id 1)。月1限 S = 数学/半田、月2限 A = 英語/堀上(601, 合同)
const REF_S = makeCellRef(1, makeCellKey("月", 1, 1));
const REF_A = makeCellRef(1, makeCellKey("月", 2, 2));
const cellAt = (tabs, ref, tabIdx = 0) =>
  tabs[tabIdx].schedule[ref.slice(ref.indexOf(":") + 1)];

describe("bulkEditCells", () => {
  it("指定したフィールドだけを全対象セルに設定する", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_S, REF_A], { teacher: "松川" });
    expect(res.changed).toBe(2);
    expect(cellAt(res.tabs, REF_S).teacher).toBe("松川");
    expect(cellAt(res.tabs, REF_A).teacher).toBe("松川");
    // 他のフィールドは触らない
    expect(cellAt(res.tabs, REF_S).subj).toBe("数学");
    expect(cellAt(res.tabs, REF_A).room).toBe("601");
    expect(cellAt(res.tabs, REF_A).note).toBe("合同");
  });

  it("元の tabs は不変 (純関数)", () => {
    const p = makeProject();
    const before = JSON.stringify(p.tabs);
    bulkEditCells(p.tabs, [REF_S], { teacher: "松川" });
    expect(JSON.stringify(p.tabs)).toBe(before);
  });

  it("空文字はそのフィールドのクリア", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_A], { room: "", note: "" });
    expect(res.changed).toBe(1);
    expect(cellAt(res.tabs, REF_A).room).toBeUndefined();
    expect(cellAt(res.tabs, REF_A).note).toBeUndefined();
    expect(cellAt(res.tabs, REF_A).subj).toBe("英語");
  });

  it("全フィールドが空になったセルは削除する", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_S], { subj: "", teacher: "" });
    expect(res.changed).toBe(1);
    expect(res.cleared).toBe(1);
    expect(cellAt(res.tabs, REF_S)).toBeUndefined();
  });

  it("講師は「·」区切りに正規化する (IME の全角中点も受ける)", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_S], { teacher: "香川・福江" });
    expect(cellAt(res.tabs, REF_S).teacher).toBe("香川·福江");
  });

  it("ロック中のセルは触らない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)].locked = true;
    const res = bulkEditCells(p.tabs, [REF_S, REF_A], { teacher: "松川" });
    expect(res.changed).toBe(1);
    expect(res.skippedLocked).toBe(1);
    expect(cellAt(res.tabs, REF_S).teacher).toBe("半田");
  });

  it("空マスは対象外 (講師だけのセルを作らない)", () => {
    const p = makeProject();
    const empty = makeCellRef(1, makeCellKey("火", 1, 1));
    const res = bulkEditCells(p.tabs, [empty], { teacher: "松川" });
    expect(res.changed).toBe(0);
    expect(res.skippedEmpty).toBe(1);
    expect(res.tabs).toBe(p.tabs);
  });

  it("既に同じ値のセルは変更に数えない", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_S], { teacher: "半田" });
    expect(res.changed).toBe(0);
    expect(res.tabs).toBe(p.tabs);
  });

  it("タブをまたいだ選択も扱える", () => {
    const p = makeProject();
    p.tabs.push({
      ...p.tabs[0],
      id: 2,
      name: "中1",
      schedule: { [makeCellKey("月", 1, 1)]: { subj: "国語", teacher: "松川" } },
    });
    const other = makeCellRef(2, makeCellKey("月", 1, 1));
    const res = bulkEditCells(p.tabs, [REF_S, other], { room: "701" });
    expect(res.changed).toBe(2);
    expect(cellAt(res.tabs, REF_S).room).toBe("701");
    expect(cellAt(res.tabs, other, 1).room).toBe("701");
  });

  it("patch が空なら no-op", () => {
    const p = makeProject();
    const res = bulkEditCells(p.tabs, [REF_S], {});
    expect(res.changed).toBe(0);
    expect(res.tabs).toBe(p.tabs);
  });
});

describe("describeBulkEdit", () => {
  const run = (p, refs, patch) => describeBulkEdit(bulkEditCells(p.tabs, refs, patch), patch);

  it("件数と設定した項目を伝える", () => {
    const text = run(makeProject(), [REF_S, REF_A], { teacher: "松川" });
    expect(text).toContain("2 コマを変更しました");
    expect(text).toContain("講師: 松川");
  });

  it("クリアは「（クリア）」と出す", () => {
    expect(run(makeProject(), [REF_A], { room: "" })).toContain("教室: （クリア）");
  });

  it("0 件のときは理由を出す", () => {
    const locked = makeProject();
    locked.tabs[0].schedule[makeCellKey("月", 1, 1)].locked = true;
    expect(run(locked, [REF_S], { teacher: "松川" })).toContain("すべてロック中");

    const p = makeProject();
    const empty = makeCellRef(1, makeCellKey("火", 1, 1));
    expect(run(p, [empty], { teacher: "松川" })).toContain("すべて空");
    expect(run(p, [REF_S], { teacher: "半田" })).toContain("既に同じ");
  });
});

describe("fillCells", () => {
  const content = { subj: "理科", teacher: "松川", room: "701" };

  it("選択したセルを丸ごと同じ内容にする (空マスにも置く)", () => {
    const p = makeProject();
    const empty = makeCellRef(1, makeCellKey("火", 1, 1));
    const res = fillCells(p.tabs, [REF_S, empty], content);
    expect(res.changed).toBe(2);
    expect(cellAt(res.tabs, REF_S)).toEqual(content);
    expect(cellAt(res.tabs, empty)).toEqual(content);
  });

  it("元の tabs は不変・コピー元の locked は引き継がない", () => {
    const p = makeProject();
    const before = JSON.stringify(p.tabs);
    const res = fillCells(p.tabs, [REF_S], { ...content, locked: true });
    expect(JSON.stringify(p.tabs)).toBe(before);
    expect(cellAt(res.tabs, REF_S).locked).toBeUndefined();
  });

  it("ロック中のセルは触らない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)].locked = true;
    const res = fillCells(p.tabs, [REF_S, REF_A], content);
    expect(res.changed).toBe(1);
    expect(res.skippedLocked).toBe(1);
    expect(cellAt(res.tabs, REF_S).subj).toBe("数学");
  });

  it("既に同じ内容のセルは変更に数えない", () => {
    const p = makeProject();
    const res = fillCells(p.tabs, [REF_S], { subj: "数学", teacher: "半田" });
    expect(res.changed).toBe(0);
    expect(res.tabs).toBe(p.tabs);
  });

  it("空の内容では何もしない", () => {
    const p = makeProject();
    expect(fillCells(p.tabs, [REF_S], {}).tabs).toBe(p.tabs);
    expect(fillCells(p.tabs, [REF_S], null).changed).toBe(0);
  });
});
