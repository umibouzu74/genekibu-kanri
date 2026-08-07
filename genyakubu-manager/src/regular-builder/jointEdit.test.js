import { describe, expect, it } from "vitest";
import { changeJoint, columnCells, jointMembersOf } from "./jointEdit";
import { makeCellKey } from "./model";

// mergedColumns.test.js と同じ構図のフィクスチャ: 通常 5 クラス + 合同列
const cls = (id, label, room = "") => ({ id, label, room });
const baseTab = (over = {}) => ({
  id: 1,
  classes: [
    cls(1, "SS", "505"),
    cls(2, "S", "501"),
    cls(3, "A", "502"),
    cls(4, "B", "503"),
    cls(5, "C", "504"),
    cls(6, "SS〜A", "501"),
  ],
  days: ["火", "木"],
  periodIds: [1, 2],
  schedule: {},
  ...over,
});
const periods = [
  { id: 1, label: "1限", time: "19:00-19:45" },
  { id: 2, label: "確認テスト", time: "20:40-20:55" },
];

const labels = (tab) => tab.classes.map((c) => c.label);

describe("jointMembersOf", () => {
  it("合同列は構成クラスの id を表示順で返す", () => {
    expect(jointMembersOf(baseTab(), 6)).toEqual({
      isJoint: true,
      memberIds: [1, 2, 3],
    });
  });

  it("通常列は自分だけ", () => {
    expect(jointMembersOf(baseTab(), 4)).toEqual({
      isJoint: false,
      memberIds: [4],
    });
  });
});

describe("columnCells", () => {
  it("列の有効セルを曜日 → 時限順で返し、残骸セルは含めない", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("木", 2, 6)]: { subj: "確テ" },
        [makeCellKey("火", 2, 6)]: { subj: "確テ" },
        [makeCellKey("月", 2, 6)]: { subj: "確テ" }, // 使わない曜日
        [makeCellKey("火", 9, 6)]: { subj: "確テ" }, // 使わない時限
        [makeCellKey("火", 1, 1)]: { subj: "英語" }, // 別の列
      },
    });
    expect(columnCells(tab, 6).map((x) => x.key)).toEqual([
      makeCellKey("火", 2, 6),
      makeCellKey("木", 2, 6),
    ]);
  });
});

describe("changeJoint: 合同の範囲変更 (SS〜A → SS〜S)", () => {
  const tab = baseTab({
    schedule: {
      [makeCellKey("火", 2, 6)]: { subj: "確テ", teacher: "藤田" },
      [makeCellKey("木", 2, 6)]: { subj: "確テ", teacher: "藤田" },
    },
  });

  it("新しい合同列を作成してセルを移し、区切りは既存ラベルに合わせる", () => {
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2], { periods });
    expect(res.ok).toBe(true);
    expect(res.created).toEqual(["SS〜S"]);
    expect(res.toLabel).toBe("SS〜S");
    expect(res.fromLabel).toBe("SS〜A");
    expect(res.toPlain).toBe(false);
    // 新しい列は構成クラス (SS・S) の直後に入る
    expect(labels(res.tab)).toEqual(["SS", "S", "SS〜S", "A", "B", "C", "SS〜A"]);
    const newId = res.tab.classes[2].id;
    expect(res.tab.schedule[makeCellKey("火", 2, newId)]).toMatchObject({
      subj: "確テ",
    });
    expect(res.tab.schedule[makeCellKey("火", 2, 6)]).toBeUndefined();
    // 木曜のセルが残っているので SS〜A 列は削除されない
    expect(res.removedSource).toBeNull();
    expect(res.tab.schedule[makeCellKey("木", 2, 6)]).toBeDefined();
  });

  it("複数コマの一括変更は 1 つの新設列に収まり、空になった元列は削除される", () => {
    const res = changeJoint(
      tab,
      [makeCellKey("火", 2, 6), makeCellKey("木", 2, 6)],
      [1, 2]
    );
    expect(res.ok).toBe(true);
    expect(res.created).toEqual(["SS〜S"]);
    expect(res.moves).toHaveLength(2);
    expect(res.removedSource).toBe("SS〜A");
    expect(labels(res.tab)).toEqual(["SS", "S", "SS〜S", "A", "B", "C"]);
  });

  it("既存の全角チルダの範囲ラベルがあれば区切りを踏襲する", () => {
    const t = baseTab({
      classes: [cls(1, "SS"), cls(2, "S"), cls(3, "A"), cls(6, "SS～A")],
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ" } },
    });
    const res = changeJoint(t, [makeCellKey("火", 2, 6)], [1, 2]);
    expect(res.ok).toBe(true);
    expect(res.created).toEqual(["SS～S"]);
  });

  it("同スパンの空き合同列があれば新設せず再利用する", () => {
    const t = baseTab({
      classes: [...baseTab().classes, cls(7, "SS〜S", "501")],
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ" } },
    });
    const res = changeJoint(t, [makeCellKey("火", 2, 6)], [1, 2]);
    expect(res.ok).toBe(true);
    expect(res.created).toEqual([]);
    expect(res.tab.schedule[makeCellKey("火", 2, 7)]).toBeDefined();
  });
});

describe("changeJoint: 通常コマ ⇄ 合同", () => {
  it("通常コマを合同にできる (合同を作る)", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("火", 1, 3)]: { subj: "数学", teacher: "半田" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 1, 3)], [3, 4, 5]);
    expect(res.ok).toBe(true);
    expect(res.created).toEqual(["A〜C"]);
    expect(res.fromLabel).toBe("A");
    // 通常クラス列 A は削除されない
    expect(labels(res.tab)).toContain("A");
  });

  it("1 クラスだけ選ぶと通常コマに戻る", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [2]);
    expect(res.ok).toBe(true);
    expect(res.toPlain).toBe(true);
    expect(res.toLabel).toBe("S");
    expect(res.tab.schedule[makeCellKey("火", 2, 2)]).toBeDefined();
    expect(res.removedSource).toBe("SS〜A");
  });

  it("戻し先の通常クラスに既にコマがあるとエラー", () => {
    const tab = baseTab({
      schedule: {
        [makeCellKey("火", 2, 6)]: { subj: "確テ" },
        [makeCellKey("火", 2, 2)]: { subj: "国語" },
      },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [2], { periods });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("既にコマがあります");
    expect(res.errors[0]).toContain("火曜 確認テスト");
  });
});

describe("changeJoint: 教室の引き継ぎ", () => {
  it("教室上書きの無いセルは移動元列の既定教室を引き継ぐ", () => {
    // SS〜A 列の既定は 501。新設列の既定も移動元の 501 になるので
    // セル側は省略のまま
    const tab = baseTab({
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2]);
    const newCol = res.tab.classes.find((c) => c.label === "SS〜S");
    expect(newCol.room).toBe("501");
    expect(res.tab.schedule[makeCellKey("火", 2, newCol.id)].room).toBeUndefined();
  });

  it("既定教室の違う列へ移すと実効教室をセルに書き残す", () => {
    // 合同 → 通常 S (既定 501)。SS〜A の既定も 501 だが、セル上書き 601 は残る
    const tab = baseTab({
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ", room: "601" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [2]);
    expect(res.tab.schedule[makeCellKey("火", 2, 2)].room).toBe("601");
  });

  it("移動先の既定と同じになる教室上書きは省略に正規化される", () => {
    const tab = baseTab({
      schedule: { [makeCellKey("火", 2, 6)]: { subj: "確テ", room: "501" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [2]);
    // S 列の既定 501 と同じなので room は省略
    expect(res.tab.schedule[makeCellKey("火", 2, 2)].room).toBeUndefined();
  });
});

describe("changeJoint: 検証とエラー", () => {
  const withCell = (schedule) => baseTab({ schedule });

  it("連続しない選択はエラー", () => {
    const tab = withCell({ [makeCellKey("火", 2, 6)]: { subj: "確テ" } });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 3]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("連続");
  });

  it("現在と同じ構成はエラー (変更なし)", () => {
    const tab = withCell({ [makeCellKey("火", 2, 6)]: { subj: "確テ" } });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2, 3]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("変更がありません");
  });

  it("空セル・ロック中のセルはエラー", () => {
    const empty = changeJoint(baseTab(), [makeCellKey("火", 2, 6)], [1, 2]);
    expect(empty.ok).toBe(false);
    const locked = changeJoint(
      withCell({ [makeCellKey("火", 2, 6)]: { subj: "確テ", locked: true } }),
      [makeCellKey("火", 2, 6)],
      [1, 2]
    );
    expect(locked.ok).toBe(false);
    expect(locked.errors[0]).toContain("ロック中");
  });

  it("スパン内の構成クラスに個別コマがあるとエラー", () => {
    const tab = withCell({
      [makeCellKey("火", 2, 6)]: { subj: "確テ" },
      [makeCellKey("火", 2, 2)]: { subj: "国語" }, // S に個別コマ
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2], { periods });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("個別のコマ");
  });

  it("範囲の重なる別の合同コマがあるとエラー", () => {
    // S〜B (2..4) のコマがある行へ SS〜S (1..2) は交差
    const tab = baseTab({
      classes: [...baseTab().classes, cls(7, "S〜B")],
      schedule: {
        [makeCellKey("火", 2, 6)]: { subj: "確テ" },
        [makeCellKey("火", 2, 7)]: { subj: "英語" },
      },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("範囲が重なる");
  });

  it("並列数がスパン幅を超えるとエラー", () => {
    // SS〜S (幅 2) に既に並列 2 コマ → 3 つ目は入らない
    const tab = baseTab({
      classes: [...baseTab().classes, cls(7, "SS〜S"), cls(8, "SS〜S")],
      schedule: {
        [makeCellKey("火", 2, 6)]: { subj: "確テ" },
        [makeCellKey("火", 2, 7)]: { subj: "確テ" },
        [makeCellKey("火", 2, 8)]: { subj: "確テ" },
      },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("並列");
  });

  it("ラベルを解釈できない構成はエラー (クラス名の重複)", () => {
    // 「A」が 2 列あり、後ろの A を含むスパンは範囲・列挙とも解釈不能
    const tab = baseTab({
      classes: [cls(1, "A"), cls(2, "B"), cls(3, "A")],
      days: ["火"],
      schedule: { [makeCellKey("火", 1, 2)]: { subj: "数学" } },
    });
    const res = changeJoint(tab, [makeCellKey("火", 1, 2)], [2, 3]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("ラベル");
  });

  it("並列の片方だけを狭いスパンへ移すのは交差になりエラー", () => {
    // 同スパン並列 (SS〜A ×2、監督 2 人) の片方だけを SS〜S にすると、
    // 残った SS〜A と同じ行で範囲が交差して結合表示できない
    const tab = baseTab({
      classes: [...baseTab().classes, cls(7, "SS〜A")],
      schedule: {
        [makeCellKey("火", 2, 6)]: { subj: "確テ", teacher: "藤田" },
        [makeCellKey("火", 2, 7)]: { subj: "確テ", teacher: "大屋敷" },
      },
    });
    const res = changeJoint(tab, [makeCellKey("火", 2, 6)], [1, 2]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("範囲が重なる");
  });

  it("同スパン列が一部の行で埋まっていれば、その行だけ列を新設する", () => {
    // 既存の SS〜S 列は火曜が埋まっている → 火曜は新設、木曜は再利用
    const tab = baseTab({
      classes: [...baseTab().classes, cls(7, "SS〜S", "501")],
      schedule: {
        [makeCellKey("火", 2, 6)]: { subj: "確テ" },
        [makeCellKey("木", 2, 6)]: { subj: "確テ" },
        [makeCellKey("火", 2, 7)]: { subj: "英語" },
      },
    });
    const res = changeJoint(
      tab,
      [makeCellKey("火", 2, 6), makeCellKey("木", 2, 6)],
      [1, 2]
    );
    expect(res.ok).toBe(true);
    expect(res.created).toEqual(["SS〜S"]);
    const newId = res.tab.classes.find(
      (c) => c.label === "SS〜S" && c.id !== 7
    ).id;
    expect(res.tab.schedule[makeCellKey("火", 2, newId)]).toBeDefined();
    expect(res.tab.schedule[makeCellKey("木", 2, 7)]).toBeDefined();
    expect(res.removedSource).toBe("SS〜A");
  });

  it("別の列のキーが混ざるとエラー", () => {
    const tab = withCell({
      [makeCellKey("火", 2, 6)]: { subj: "確テ" },
      [makeCellKey("火", 1, 1)]: { subj: "英語" },
    });
    const res = changeJoint(
      tab,
      [makeCellKey("火", 2, 6), makeCellKey("火", 1, 1)],
      [1, 2]
    );
    expect(res.ok).toBe(false);
  });
});
