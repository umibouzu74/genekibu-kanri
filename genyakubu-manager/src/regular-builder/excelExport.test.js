import { describe, expect, it } from "vitest";
import { buildRegularWorkbook, collectDaySheet } from "./excelExport";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// makeProject: 中3 タブ (月・火, 1限/2限, S/A)。
// schedule: 月1限 S=数学/半田, 月2限 A=英語/堀上 (room 601, note 合同)

describe("collectDaySheet", () => {
  it("セクション・時限 (開始時刻順)・列 (クラス) を画面と同じ構造で返す", () => {
    const sheets = collectDaySheet(makeProject(), "月");
    expect(sheets).toHaveLength(1);
    const s = sheets[0];
    expect(s.name).toBe("中3");
    expect(s.periods.map((p) => p.id)).toEqual([1, 2]);
    expect(s.cols.map((c) => c.cls.label)).toEqual(["S", "A"]);
  });

  it("使わない曜日はセクションなし", () => {
    expect(collectDaySheet(makeProject(), "水")).toHaveLength(0);
  });
});

describe("buildRegularWorkbook", () => {
  it("曜日ごとにシートを作り、見出しとセル内容を載せる", () => {
    const wb = buildRegularWorkbook(makeProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["月曜", "火曜"]);
    const ws = wb.getWorksheet("月曜");
    // タイトル行にプロジェクト名と曜日
    expect(ws.getCell(1, 1).value).toContain("2026 後期");
    expect(ws.getCell(1, 1).value).toContain("月曜日");
    // セクション見出し → 学年行 → クラス行 → 時限行の順
    expect(ws.getCell(3, 1).value).toBe("中3");
    expect(ws.getCell(4, 2).value).toBe("中3"); // 学年 colSpan 見出し
    expect(ws.getCell(5, 2).value).toBe("S (501)");
    // 1限 S = 数学/半田 (教室はクラス既定 501)
    expect(ws.getCell(6, 1).value).toContain("1限");
    expect(ws.getCell(6, 2).value).toBe("数学\n半田\n501");
    // 2限 A = 英語/堀上 (セル上書き教室 601 + note)
    expect(ws.getCell(7, 3).value).toBe("英語\n堀上\n601 合同");
    // 印刷設定: A4 横・横 1 ページ収め
    expect(ws.pageSetup).toMatchObject({
      paperSize: 9,
      orientation: "landscape",
      fitToWidth: 1,
    });
  });

  it("隔週コマは講師欄が「主担当 / パートナー」になる", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = {
      subj: "理科",
      teacher: "堀上",
      note: "隔週(河野)",
    };
    const wb = buildRegularWorkbook(p, { days: ["月"], dateLabel: "2026-08-05" });
    const ws = wb.getWorksheet("月曜");
    expect(ws.getCell(7, 2).value).toBe("理科\n堀上 / 河野\n501 隔週(河野)");
  });

  it("学年が使わない時限のマスは値なし (グレー塞ぎ) になる", () => {
    const p = makeProject();
    // 中1 タブ (時限 1 のみ使用) を追加 → 中3 と同居し、中1 の 2限が塞がる
    p.tabs.push({
      id: 2,
      name: "中1",
      grade: "中1",
      classes: [{ id: 1, label: "B", room: "301" }],
      days: ["月"],
      periodIds: [1],
      schedule: { [makeCellKey("月", 1, 1)]: { subj: "国語" } },
    });
    const wb = buildRegularWorkbook(p, { days: ["月"], dateLabel: "2026-08-05" });
    const ws = wb.getWorksheet("月曜");
    // 中1 列 (4 列目) の 2限 (7 行目) は塞ぎセル
    expect(ws.getCell(7, 4).value).toBeNull();
    expect(ws.getCell(7, 4).fill?.fgColor?.argb).toBe("FFE7E6E6");
    // 1限には国語が載る
    expect(ws.getCell(6, 4).value).toContain("国語");
  });

  it("セクションの無い曜日はシートを作らない", () => {
    const wb = buildRegularWorkbook(makeProject(), {
      days: ["水"],
      dateLabel: "2026-08-05",
    });
    expect(wb.worksheets).toHaveLength(0);
  });
});
