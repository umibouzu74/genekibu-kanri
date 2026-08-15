import { describe, expect, it } from "vitest";
import { SHEET_NAME, buildPosterWorkbook, coalesceBlocks } from "./posterExport";
import {
  CLASS_COLS,
  HEAD_BANDS,
  HEAD_ROWS,
  LABEL_COLS,
  PERIOD_ROWS,
} from "./posterLayout";
import { createDefaultProject, makeCellKey } from "./model";

// 元 xls を縮めたフィクスチャ (posterLayout.test.js と同じ骨格)
const period = (id, time) => ({ id, label: "", time });
const cls = (id, label, room) => ({ id, label, room });

const project = () => ({
  ...createDefaultProject(),
  name: "2026 前期",
  periods: [period(1, "18:00-18:45"), period(2, "18:55-19:40")],
  tabs: [
    {
      id: 1,
      name: "中2",
      grade: "中2",
      course: "本　科",
      classes: [cls(1, "S", "602"), cls(2, "A･B", "601")],
      days: ["月"],
      periodIds: [1, 2],
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "社会", teacher: "西岡" },
        [makeCellKey("月", 1, 2)]: {
          subj: "数/英",
          teacher: "本多",
          note: "隔週(堀上)",
        },
        [makeCellKey("月", 2, 1)]: { subj: "国語", teacher: "小松", room: "603" },
      },
    },
  ],
});

const build = (over) => buildPosterWorkbook(over || project());
const ws = (wb) => wb.getWorksheet(SHEET_NAME);
const at = (sheet, row, col) => sheet.getCell(row, col).value;

// 表は方眼 (row0, col0) が 0-based。1-based の左上は +1
const HEAD_ROWS_TOTAL = HEAD_ROWS * HEAD_BANDS;

describe("coalesceBlocks", () => {
  const blk = (idx, lines, colSpan = 1) => ({ kind: "block", idx, colSpan, lines });

  it("中身の同じブロックが隣り合っていれば 1 つにまとめる", () => {
    const out = coalesceBlocks([
      blk(0, ["確認テスト", "担任：石原"]),
      blk(1, ["確認テスト", "担任：石原"]),
      blk(2, ["確認テスト", "担任：石原"]),
    ]);
    expect(out).toEqual([
      { kind: "block", idx: 0, colSpan: 3, lines: ["確認テスト", "担任：石原"] },
    ]);
  });

  it("中身が違えば結合しない", () => {
    const out = coalesceBlocks([
      blk(0, ["確認テスト", "担任：石原"]),
      blk(1, ["確認テスト", "担任：小松"]),
    ]);
    expect(out).toHaveLength(2);
  });

  it("離れていれば結合しない。通常コマは素通し", () => {
    const out = coalesceBlocks([
      blk(0, ["確認テスト"]),
      { kind: "normal", idx: 1, colSpan: 1, subject: "数学", teacher: "半田" },
      blk(2, ["確認テスト"]),
    ]);
    expect(out.map((x) => x.kind)).toEqual(["block", "normal", "block"]);
  });
});

describe("buildPosterWorkbook", () => {
  it("シートは 1 枚・A3 横 1 ページ収め", () => {
    const { workbook } = build();
    expect(workbook.worksheets.map((s) => s.name)).toEqual([SHEET_NAME]);
    const setup = ws(workbook).pageSetup;
    expect(setup.paperSize).toBe(8);
    expect(setup.orientation).toBe("landscape");
    expect(setup.fitToPage).toBe(true);
    expect(setup.fitToWidth).toBe(1);
    expect(setup.fitToHeight).toBe(1);
  });

  it("タイトルと隔週の注記を載せる", () => {
    const { workbook } = build();
    const sheet = ws(workbook);
    expect(at(sheet, 1, 1)).toBe("2026 前期　中学生コース時間割");
    expect(at(sheet, 3, 1)).toContain("隔週授業");
  });

  it("ヘッダは曜日 / 学年 / コース / クラス / 教室の 5 段", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const labels = [0, 1, 2, 3, 4].map((band) =>
      at(sheet, r0 + band * HEAD_ROWS, c0)
    );
    expect(labels).toEqual(["曜  日", "学  年", "コース", "クラス", "教  室"]);
    // 1 列目 (S) の見出し
    const cc = c0 + LABEL_COLS;
    expect(at(sheet, r0, cc)).toBe("月曜日");
    expect(at(sheet, r0 + HEAD_ROWS, cc)).toBe("中2");
    expect(at(sheet, r0 + HEAD_ROWS * 2, cc)).toBe("本　科");
    expect(at(sheet, r0 + HEAD_ROWS * 3, cc)).toBe("S");
    expect(at(sheet, r0 + HEAD_ROWS * 4, cc)).toBe("602");
  });

  it("曜日と学年は掛かるクラス列ぶんを結合する", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const model = sheet.getCell(r0, c0 + LABEL_COLS).master.address;
    // 2 クラス × 2 列 = 4 列ぶんの結合
    expect(sheet.getCell(r0, c0 + LABEL_COLS + 3).master.address).toBe(model);
    // 1 段ぶん (2 行) の高さ
    expect(sheet.getCell(r0 + 1, c0 + LABEL_COLS).master.address).toBe(model);
    expect(sheet.getCell(r0 + HEAD_ROWS, c0 + LABEL_COLS).master.address).not.toBe(
      model
    );
  });

  it("時刻は 3 行表記で 4 行ぶんを結合する", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const pr = r0 + HEAD_ROWS_TOTAL;
    expect(at(sheet, pr, c0)).toBe("18：00\n〜\n18：45");
    expect(sheet.getCell(pr, c0).alignment.wrapText).toBe(true);
    expect(sheet.getCell(pr + PERIOD_ROWS - 1, c0).master.address).toBe(
      sheet.getCell(pr, c0).address
    );
  });

  it("通常コマは科目 (上 2 行) と講師 (下 2 行)。講師だけ明朝", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const pr = r0 + HEAD_ROWS_TOTAL;
    const cc = c0 + LABEL_COLS;
    expect(at(sheet, pr, cc)).toBe("社会");
    expect(at(sheet, pr + HEAD_ROWS, cc)).toBe("西岡");
    expect(sheet.getCell(pr, cc).font.name).toBe("ＭＳ Ｐゴシック");
    expect(sheet.getCell(pr + HEAD_ROWS, cc).font.name).toBe("ＭＳ Ｐ明朝");
  });

  it("セルで上書きした教室は科目に添える (既定の教室は出さない)", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const pr = r0 + HEAD_ROWS_TOTAL + PERIOD_ROWS;
    expect(at(sheet, pr, c0 + LABEL_COLS)).toBe("国語（603教室）");
  });

  it("隔週コマは結合せず、左上 A 週 / 右下 B 週 + 対角罫", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const r0 = layout.tables[0].row0 + 1;
    const c0 = layout.tables[0].col0 + 1;
    const pr = r0 + HEAD_ROWS_TOTAL;
    const cc = c0 + LABEL_COLS + CLASS_COLS; // 2 列目 (A･B)
    // 科目: 左上 = A 週、右下 = B 週
    expect(at(sheet, pr, cc)).toBe("数");
    expect(at(sheet, pr + 1, cc + 1)).toBe("英");
    // 講師も同じ向き
    expect(at(sheet, pr + HEAD_ROWS, cc)).toBe("本多");
    expect(at(sheet, pr + HEAD_ROWS + 1, cc + 1)).toBe("堀上");
    // 結合していない
    expect(sheet.getCell(pr, cc).isMerged).toBe(false);
    // 右上と左下に右上がりの対角罫
    expect(sheet.getCell(pr, cc + 1).border.diagonal).toMatchObject({ up: true });
    expect(sheet.getCell(pr + 1, cc).border.diagonal).toMatchObject({ up: true });
  });

  it("表の外周は medium、クラスの境は hair", () => {
    const { workbook, layout } = build();
    const sheet = ws(workbook);
    const t = layout.tables[0];
    const r0 = t.row0 + 1;
    const c0 = t.col0 + 1;
    expect(sheet.getCell(r0, c0).border.top.style).toBe("medium");
    expect(sheet.getCell(r0, c0).border.left.style).toBe("medium");
    expect(sheet.getCell(r0 + t.rows - 1, c0).border.bottom.style).toBe("medium");
    expect(sheet.getCell(r0, c0 + t.cols - 1).border.right.style).toBe("medium");
    // 同じ学年の 2 列目の左辺 = クラスの境 (クラス段は列ごとなので結合に
    // 潰されない。曜日段は曜日ぶん結合されるので medium になる)
    expect(
      sheet.getCell(r0 + HEAD_ROWS * 3, c0 + LABEL_COLS + CLASS_COLS).border.left.style
    ).toBe("hair");
    // 見出し列と本体の境・ヘッダと本体の境は medium
    expect(sheet.getCell(r0, c0 + LABEL_COLS).border.left.style).toBe("medium");
    expect(
      sheet.getCell(r0 + HEAD_ROWS * HEAD_BANDS, c0 + LABEL_COLS).border.top.style
    ).toBe("medium");
  });

  it("確認テストの合同コマは 4 行ぶんを 1 セルにまとめる", () => {
    const p = project();
    p.tabs[0].classes.push(cls(3, "S〜A･B", "601"));
    // 合同列の解釈には構成クラスのラベルが必要なので範囲ラベルで置く
    p.tabs[0].classes[1] = cls(2, "A･B", "601");
    p.tabs[0].classes[2] = cls(3, "S〜A･B", "601");
    delete p.tabs[0].schedule[makeCellKey("月", 2, 1)];
    p.tabs[0].schedule[makeCellKey("月", 2, 3)] = {
      subj: "確認テスト",
      teacher: "堀上",
      room: "601",
    };
    const { workbook, layout } = build(p);
    const sheet = ws(workbook);
    const t = layout.tables[0];
    const pr = t.row0 + 1 + HEAD_ROWS_TOTAL + PERIOD_ROWS;
    const cc = t.col0 + 1 + LABEL_COLS;
    expect(at(sheet, pr, cc)).toBe("確認テスト\n担任：堀上\n（601教室）");
    // 2 クラス × 2 列 × 4 行の結合
    const model = sheet.getCell(pr, cc).address;
    expect(sheet.getCell(pr + PERIOD_ROWS - 1, cc + 3).master.address).toBe(model);
  });

  it("クラス名の無い表は「教室」段を 4 行に畳む", () => {
    const p = project();
    p.tabs[0].classes = [cls(1, "", "401")];
    p.tabs[0].schedule = { [makeCellKey("月", 1, 1)]: { subj: "数学", teacher: "本多" } };
    const { workbook, layout } = build(p);
    const sheet = ws(workbook);
    const t = layout.tables[0];
    const r0 = t.row0 + 1;
    const c0 = t.col0 + 1;
    expect(t.showClassRow).toBe(false);
    expect(at(sheet, r0 + HEAD_ROWS * 3, c0)).toBe("教  室");
    expect(at(sheet, r0 + HEAD_ROWS * 3, c0 + LABEL_COLS)).toBe("401");
    // 「クラス」段の位置まで結合が伸びている
    expect(sheet.getCell(r0 + HEAD_ROWS * 4, c0).master.address).toBe(
      sheet.getCell(r0 + HEAD_ROWS * 3, c0).address
    );
  });

  it("中学のコマが無ければ表は出ない", () => {
    const p = project();
    p.tabs[0].grade = "高2";
    const { layout } = build(p);
    expect(layout.tables).toEqual([]);
  });
});
