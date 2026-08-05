import { describe, expect, it } from "vitest";
import {
  collectStaffGrid,
  formatSlotLines,
  buildStaffSurveyWorkbook,
} from "./staffSurveyExport";

// 列: A=時間帯ラベル, B〜G = 月〜土
const COL = { 月: 2, 火: 3, 水: 4, 木: 5, 金: 6, 土: 7 };

const SLOTS = [
  { id: 1, day: "月", time: "19:50-20:35", grade: "中2", cls: "AB", room: "601", subj: "数学", teacher: "河野", note: "" },
  { id: 2, day: "月", time: "18:55-19:40", grade: "中2", cls: "S/AB", room: "601", subj: "理科", teacher: "小見山", note: "合同" },
  { id: 3, day: "土", time: "18:30-20:00", grade: "中1-3", cls: "-", room: "亀73", subj: "英語·数学·理科", teacher: "香川·福江·川井", note: "プレップ個別指導" },
  { id: 4, day: "金", time: "19:50-20:35", grade: "中1", cls: "S", room: "602", subj: "英/数", teacher: "堀上", note: "隔週(川井)" },
  { id: 5, day: "金", time: "19:50-20:35", grade: "中1", cls: "AB", room: "601", subj: "数/英", teacher: "川井", note: "隔週(堀上)" },
];

describe("collectStaffGrid", () => {
  it("直接担当・複数講師 (·区切り)・隔週パートナー (note) を拾い、開始時刻順に並べる", () => {
    const grid = collectStaffGrid(SLOTS, "川井");
    // 18:30 (土) → 19:50 (金) の開始時刻順
    expect(grid.map((r) => r.time)).toEqual(["18:30-20:00", "19:50-20:35"]);
    expect(grid[0].byDay.get("土").map((s) => s.id)).toEqual([3]);
    // 隔週ペア (直接担当 + note パートナー) は同じ曜日 × 時間帯の 1 セルにまとまる
    expect(grid[1].byDay.get("金").map((s) => s.id)).toEqual([4, 5]);
  });

  it("担当のないバイトは空のグリッド", () => {
    expect(collectStaffGrid(SLOTS, "新人")).toEqual([]);
  });
});

describe("formatSlotLines", () => {
  it("学年 クラス 教科 + 教室・メモの 2 行にする", () => {
    expect(formatSlotLines(SLOTS[0])).toBe("中2 AB 数学\n601");
    expect(formatSlotLines(SLOTS[3])).toBe("中1 S 英/数\n602 隔週(川井)");
  });

  it('クラス "-" や空文字は表示しない', () => {
    expect(formatSlotLines(SLOTS[2])).toBe("中1-3 英語·数学·理科\n亀73 プレップ個別指導");
    expect(formatSlotLines({ grade: "高2", cls: "", subj: "高松西 英語", room: "", note: "" })).toBe(
      "高2 高松西 英語"
    );
  });
});

describe("buildStaffSurveyWorkbook", () => {
  const build = (staffNames) =>
    buildStaffSurveyWorkbook({
      staffNames,
      slots: SLOTS,
      timetableLabel: "2026年度 1学期",
      dateLabel: "2026-08-05",
    });

  it("バイト 1 人 = 1 シート、渡した順に並ぶ", () => {
    const wb = build(["川井", "河野"]);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["川井", "河野"]);
  });

  it("シート名に使えない文字は除去する", () => {
    const wb = build(["山/田?[1]"]);
    expect(wb.worksheets[0].name).toBe("山田1");
  });

  it("タイトル・凡例・曜日ヘッダが入る", () => {
    const ws = build(["川井"]).worksheets[0];
    expect(ws.getCell(1, 1).value).toBe("出勤可能時間 調査票 ― 川井");
    expect(ws.getCell(2, 1).value).toContain("2026-08-05");
    expect(ws.getCell(2, 1).value).toContain("2026年度 1学期");
    expect(ws.getCell(4, 1).value).toBe("時間帯");
    expect(ws.getCell(4, COL.月).value).toBe("月");
    expect(ws.getCell(4, COL.土).value).toBe("土");
  });

  it("担当コマは該当曜日のセルに網掛けで入り、空きセルは塗らない", () => {
    const ws = build(["川井"]).worksheets[0];
    // 行 5 = 18:30-20:00 (土)、行 6 = 19:50-20:35 (金, 隔週ペア 2 コマ)
    expect(ws.getCell(5, 1).value).toBe("18:30-20:00");
    expect(ws.getCell(5, COL.土).value).toBe("中1-3 英語·数学·理科\n亀73 プレップ個別指導");
    expect(ws.getCell(5, COL.土).fill?.fgColor?.argb).toBe("FFE7E6E6");
    expect(ws.getCell(5, COL.月).value).toBe("");
    expect(ws.getCell(5, COL.月).fill?.fgColor?.argb).toBeUndefined();
    expect(ws.getCell(6, COL.金).value).toBe(
      "中1 S 英/数\n602 隔週(川井)\n中1 AB 数/英\n601 隔週(堀上)"
    );
  });

  it("担当なしのバイトはその旨の行を出す", () => {
    const ws = build(["新人"]).worksheets[0];
    expect(ws.getCell(5, 1).value).toBe("現在の担当コマはありません");
  });

  it("記入欄は黄色塗り、備考は横 1 本の結合セル", () => {
    const ws = build(["川井"]).worksheets[0];
    // 行 7 = セクション見出し、行 8 = 記入欄、行 9 = 備考
    expect(ws.getCell(7, 1).value).toContain("出勤できる時間帯");
    expect(ws.getCell(8, 1).value).toBe("出勤できる\n時間帯");
    for (const col of Object.values(COL)) {
      expect(ws.getCell(8, col).fill?.fgColor?.argb).toBe("FFFFF2CC");
    }
    expect(ws.getCell(9, 1).value).toBe("備考");
    expect(ws.getCell(9, COL.水).master.address).toBe("B9");
  });

  it("A4 縦・1 ページに収める印刷設定", () => {
    const ws = build(["川井"]).worksheets[0];
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.orientation).toBe("portrait");
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(1);
  });
});
