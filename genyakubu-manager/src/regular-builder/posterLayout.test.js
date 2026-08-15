import { describe, expect, it } from "vitest";
import {
  BAND_GAP_ROWS,
  HEAD_BANDS,
  HEAD_ROWS,
  LABEL_COLS,
  PERIOD_ROWS,
  TABLE_TOP_ROW,
  buildPosterLayout,
  clusterByPeriodOverlap,
  courseLabel,
  isJuniorTab,
  periodTimeText,
  posterRowCells,
  roomText,
  splitWideTable,
} from "./posterLayout";
import { createDefaultProject, makeCellKey } from "./model";

// 元 xls (中学生コース時間割) を縮めたフィクスチャ。
// 本科 = 18:00〜 の 3 時限、附中 = 16:25〜 の 2 時限。
const period = (id, time) => ({ id, label: "", time });
const cls = (id, label, room) => ({ id, label, room });

function poster(over = {}) {
  return {
    ...createDefaultProject(),
    name: "2026 前期",
    periods: [
      period(1, "18:00-18:45"),
      period(2, "18:55-19:40"),
      period(3, "21:35-21:50"),
      period(4, "16:25-17:25"),
      period(5, "17:35-18:35"),
    ],
    tabs: [
      {
        id: 1,
        name: "中2 本科",
        grade: "中2",
        course: "本　科",
        classes: [cls(1, "S", "602"), cls(2, "A･B", "601"), cls(3, "C", "603")],
        days: ["月", "木"],
        periodIds: [1, 2, 3],
        schedule: {
          [makeCellKey("月", 2, 1)]: { subj: "社会", teacher: "西岡" },
          [makeCellKey("木", 2, 1)]: { subj: "理科", teacher: "三宮" },
        },
      },
      {
        id: 2,
        name: "中3 本科（火・木）",
        grade: "中3",
        classes: [
          cls(4, "SS", "505"),
          cls(5, "S", "501"),
          cls(6, "A", "502"),
          cls(7, "SS〜A", "501"),
        ],
        days: ["火"],
        periodIds: [1, 2],
        schedule: {
          // 隔週コマ (A 週 = 数/本多、B 週 = 英/堀上)
          [makeCellKey("火", 1, 4)]: {
            subj: "数/英",
            teacher: "本多",
            note: "隔週(堀上)",
          },
          [makeCellKey("火", 1, 5)]: { subj: "国語", teacher: "小松" },
          // 合同 (確認テスト) は SS〜A の 3 列に被せる
          [makeCellKey("火", 2, 7)]: {
            subj: "確認テスト",
            teacher: "藤田",
            room: "501",
          },
        },
      },
      {
        id: 3,
        name: "中1 附中",
        grade: "中1",
        course: "附中",
        classes: [cls(8, "", "401")],
        days: ["水"],
        periodIds: [4, 5],
        schedule: {
          [makeCellKey("水", 4, 8)]: { subj: "数学", teacher: "本多" },
          [makeCellKey("水", 5, 8)]: { subj: "英語", teacher: "石原" },
        },
      },
      {
        id: 9,
        name: "高2",
        grade: "高2",
        classes: [cls(9, "S", "701")],
        days: ["月"],
        periodIds: [1],
        schedule: { [makeCellKey("月", 1, 9)]: { subj: "数学", teacher: "香川" } },
      },
    ],
    ...over,
  };
}

describe("isJuniorTab / courseLabel", () => {
  it("学年に「高」を含むタブは紙面に載せない", () => {
    expect(isJuniorTab({ grade: "中3" })).toBe(true);
    expect(isJuniorTab({ grade: "附中" })).toBe(true);
    expect(isJuniorTab({ grade: "高2" })).toBe(false);
    // 学年が空ならタブ名で判定する
    expect(isJuniorTab({ grade: "", name: "高1 選択" })).toBe(false);
  });

  it("コース欄が空ならタブ名から学年の接頭辞を落とす", () => {
    expect(courseLabel({ course: "本　科", name: "中2", grade: "中2" })).toBe("本　科");
    expect(courseLabel({ name: "中3 本科（火・木）", grade: "中3" })).toBe(
      "本科（火・木）"
    );
    // 落とすと空になる場合はタブ名のまま
    expect(courseLabel({ name: "中3", grade: "中3" })).toBe("中3");
    expect(courseLabel({ name: "内申対策", grade: "中3" })).toBe("内申対策");
  });
});

describe("periodTimeText / roomText", () => {
  it("時刻は紙面の 3 行表記になる", () => {
    expect(periodTimeText({ time: "18:00-18:45" })).toBe("18：00\n〜\n18：45");
    expect(periodTimeText({ time: "18:00〜18:45" })).toBe("18：00\n〜\n18：45");
  });

  it("時刻が無ければラベルを使う", () => {
    expect(periodTimeText({ time: "", label: "確認テスト" })).toBe("確認テスト");
  });

  it("数字だけの教室は「教室」を付ける", () => {
    expect(roomText("601")).toBe("（601教室）");
    expect(roomText("亀63")).toBe("（亀63）");
    expect(roomText("")).toBe("");
  });
});

describe("clusterByPeriodOverlap", () => {
  it("時限が交わるブロックだけを 1 つの表に束ねる", () => {
    const blocks = [
      { day: "月", periodIds: [2, 3] },
      { day: "火", periodIds: [1, 2] }, // 月と 2 で交わる
      { day: "水", periodIds: [4, 5] }, // 交わらない = 別の表
    ];
    const clusters = clusterByPeriodOverlap(blocks);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((b) => b.day)).toEqual(["月", "火"]);
    expect(clusters[1].map((b) => b.day)).toEqual(["水"]);
  });

  it("後から来たブロックが 2 つの束を橋渡しすると 1 つに併合する", () => {
    const clusters = clusterByPeriodOverlap([
      { day: "月", periodIds: [1] },
      { day: "火", periodIds: [2] },
      { day: "水", periodIds: [1, 2] },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});

describe("splitWideTable", () => {
  const g = (day, classCount) => ({ day, classCount });

  it("上限を超える手前の曜日で切る", () => {
    const chunks = splitWideTable(
      [g("月", 3), g("火", 7), g("水", 3), g("木", 8), g("金", 5)],
      13
    );
    expect(chunks.map((c) => c.map((x) => x.day))).toEqual([
      ["月", "火", "水"],
      ["木", "金"],
    ]);
  });

  it("1 曜日だけで上限を超える場合はその曜日で 1 表にする", () => {
    const chunks = splitWideTable([g("土", 20), g("日", 2)], 13);
    expect(chunks.map((c) => c.map((x) => x.day))).toEqual([["土"], ["日"]]);
  });
});

describe("posterRowCells", () => {
  const layoutOf = (project) => buildPosterLayout(project);

  it("隔週コマは A 週 / B 週に分けて返す", () => {
    const { tables } = layoutOf(poster());
    const main = tables.find((t) => t.days.some((d) => d.day === "火"));
    const block = main.days
      .find((d) => d.day === "火")
      .blocks.find((b) => b.tab.id === 2);
    const cells = posterRowCells(block, 1);
    const bi = cells.find((c) => c.kind === "biweekly");
    expect(bi).toMatchObject({
      subjectA: "数",
      teacherA: "本多",
      subjectB: "英",
      teacherB: "堀上",
      colSpan: 1,
      startIdx: 0,
    });
  });

  it("確認テストの合同コマは 4 行ぶんの 1 ブロックにまとめる", () => {
    const { tables } = layoutOf(poster());
    const block = tables
      .flatMap((t) => t.days)
      .find((d) => d.day === "火")
      .blocks.find((b) => b.tab.id === 2);
    const cells = posterRowCells(block, 2);
    expect(cells).toEqual([
      {
        kind: "block",
        startIdx: 0,
        colSpan: 3,
        lines: ["確認テスト", "担任：藤田", "（501教室）"],
      },
    ]);
  });

  it("合同列でないテストのコマもブロックになる (附中のように 1 クラスの学年)", () => {
    const p = poster();
    p.tabs[2].schedule[makeCellKey("水", 5, 8)] = {
      subj: "確認テスト",
      teacher: "石原",
      room: "404",
    };
    const { tables } = layoutOf(p);
    const block = tables
      .flatMap((t) => t.days)
      .find((d) => d.day === "水")
      .blocks[0];
    expect(posterRowCells(block, 5)).toEqual([
      {
        kind: "block",
        startIdx: 0,
        colSpan: 1,
        lines: ["確認テスト", "担任：石原", "（404教室）"],
      },
    ]);
  });

  it("通常コマは科目 + 講師。既定の教室はセルに出さない", () => {
    const { tables } = layoutOf(poster());
    const block = tables
      .flatMap((t) => t.days)
      .find((d) => d.day === "月")
      .blocks[0];
    expect(posterRowCells(block, 2)).toEqual([
      { kind: "normal", startIdx: 0, colSpan: 1, subject: "社会", teacher: "西岡" },
    ]);
  });
});

describe("buildPosterLayout", () => {
  it("高校のタブは紙面に載せない", () => {
    const { tables } = buildPosterLayout(poster());
    const tabIds = tables.flatMap((t) =>
      t.days.flatMap((d) => d.blocks.map((b) => b.tab.id))
    );
    expect(tabIds).not.toContain(9);
  });

  it("時間軸の違う附中は別の表になり、右へ並ぶ", () => {
    const { tables } = buildPosterLayout(poster());
    // 本科 (月火木) と 附中 (水) の 2 表
    expect(tables).toHaveLength(2);
    const [main, fuchu] = tables;
    expect(main.days.map((d) => d.day)).toEqual(["月", "火", "木"]);
    expect(fuchu.days.map((d) => d.day)).toEqual(["水"]);
    // 同じ段の右隣に置かれる
    expect(fuchu.row0).toBe(main.row0);
    expect(fuchu.col0).toBeGreaterThan(main.col0 + main.cols - 1);
  });

  it("表の方眼サイズはクラス列数と時限数から決まる", () => {
    const { tables } = buildPosterLayout(poster());
    const main = tables[0];
    // 空のクラス列は紙面に出さない: 月 1 (S のみ) + 火 3 (SS・S・A。
    // 合同列 SS〜A は表示列に出ない) + 木 1 = 5 クラス列
    expect(main.classCount).toBe(5);
    expect(main.cols).toBe(LABEL_COLS + 2 * 5);
    expect(main.rows).toBe(HEAD_ROWS * HEAD_BANDS + PERIOD_ROWS * main.periods.length);
    expect(main.row0).toBe(TABLE_TOP_ROW);
    expect(main.col0).toBe(0);
  });

  it("クラス名の無い表 (附中) はクラス段を畳む", () => {
    const { tables } = buildPosterLayout(poster());
    expect(tables[0].showClassRow).toBe(true);
    expect(tables[1].showClassRow).toBe(false);
  });

  it("横に入らない表は次の段へ送る", () => {
    const { tables } = buildPosterLayout(poster(), { maxGridCols: 14 });
    const [main, fuchu] = tables;
    expect(fuchu.col0).toBe(0);
    expect(fuchu.row0).toBe(main.row0 + main.rows + BAND_GAP_ROWS);
  });

  it("隔週コマがあるときだけ注記を出す", () => {
    expect(buildPosterLayout(poster()).note).toContain("隔週授業");
    const noBi = poster();
    delete noBi.tabs[1].schedule[makeCellKey("火", 1, 4)];
    expect(buildPosterLayout(noBi).note).toBe("");
  });

  it("タイトルはプロジェクト名から作る (上書き可)", () => {
    expect(buildPosterLayout(poster()).title).toBe("2026 前期　中学生コース時間割");
    expect(buildPosterLayout(poster(), { title: "2026年度 中学生" }).title).toBe(
      "2026年度 中学生"
    );
  });

  it("中学のコマが 1 つも無ければ表は空", () => {
    const empty = { ...createDefaultProject(), tabs: [] };
    const layout = buildPosterLayout(empty);
    expect(layout.tables).toEqual([]);
    expect(layout.gridRows).toBe(TABLE_TOP_ROW);
  });
});
