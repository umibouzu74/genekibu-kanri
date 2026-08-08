import { describe, expect, it } from "vitest";
import {
  buildRegularTeacherWorkbook,
  buildRegularWorkbook,
  collectDaySheet,
  teacherEntryNote,
} from "./excelExport";
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

  it("セルの無いクラス列・時限行・曜日は出力しない", () => {
    const p = makeProject();
    p.tabs[0].classes.push({ id: 3, label: "C", room: "503" }); // 月にセル無し
    p.tabs[0].periodIds.push(3); // 確認テスト: どの列にもセル無し
    const sheets = collectDaySheet(p, "月");
    expect(sheets[0].cols.map((c) => c.cls.label)).toEqual(["S", "A"]);
    expect(sheets[0].periods.map((per) => per.id)).toEqual([1, 2]);
    // 使う曜日でもセルが 1 つも無ければセクションなし (シートも作らない)
    expect(collectDaySheet(p, "火")).toHaveLength(0);
  });
});

describe("buildRegularWorkbook", () => {
  it("セルのある曜日だけシートを作り、見出しとセル内容を載せる", () => {
    const wb = buildRegularWorkbook(makeProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    // 火はセルが無いのでシート自体を作らない
    expect(wb.worksheets.map((w) => w.name)).toEqual(["月曜"]);
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

describe("buildRegularTeacherWorkbook", () => {
  it("集計シート + 担当コマのある講師のシートをマスタ順に作る", () => {
    const wb = buildRegularTeacherWorkbook(makeProject(), {
      dateLabel: "2026-08-08",
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["集計", "堀上", "半田"]);
    const sum = wb.getWorksheet("集計");
    expect(sum.getCell(1, 1).value).toContain("講師別コマ数・稼働時間");
    // 見出し 2 段: 講師 | 月 (コマ/時間) | 火 (コマ/時間) | 週計 (コマ/時間)
    expect(sum.getCell(3, 1).value).toBe("講師");
    expect(sum.getCell(3, 2).value).toBe("月");
    expect(sum.getCell(4, 2).value).toBe("コマ");
    expect(sum.getCell(4, 3).value).toBe("時間");
    expect(sum.getCell(3, 6).value).toBe("週計");
    // 堀上 (1 行目): 月 1 コマ 0:45 (2限 18:55-19:40)、週計も同じ
    expect(sum.getCell(5, 1).value).toBe("堀上");
    expect(sum.getCell(5, 2).value).toBe(1);
    expect(sum.getCell(5, 3).value).toBe("0:45");
    expect(sum.getCell(5, 6).value).toBe(1);
    expect(sum.getCell(5, 7).value).toBe("0:45");
  });

  it("講師シートに担当コマ一覧 (曜日 → 時刻順) と曜日別集計を載せる", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 2)] = {
      subj: "理科",
      teacher: "半田",
      room: "601",
    };
    const wb = buildRegularTeacherWorkbook(p, { dateLabel: "2026-08-08" });
    const ws = wb.getWorksheet("半田");
    expect(ws.getCell(1, 1).value).toContain("半田");
    expect(ws.getCell(2, 1).value).toBe("曜日");
    // 月1限 S 数学 (教室はクラス既定 501)
    expect(ws.getCell(3, 1).value).toBe("月");
    expect(ws.getCell(3, 2).value).toBe("1限");
    expect(ws.getCell(3, 3).value).toBe("18:00-18:45");
    expect(ws.getCell(3, 4).value).toBe("中3");
    expect(ws.getCell(3, 5).value).toBe("S");
    expect(ws.getCell(3, 6).value).toBe("数学");
    expect(ws.getCell(3, 7).value).toBe("501");
    // 火1限 A 理科 (セル上書き教室 601)
    expect(ws.getCell(4, 1).value).toBe("火");
    expect(ws.getCell(4, 6).value).toBe("理科");
    expect(ws.getCell(4, 7).value).toBe("601");
    // 集計ブロック: 空行を挟んで 曜日|コマ|時間 → 月・火 → 週計
    expect(ws.getCell(6, 1).value).toBe("曜日");
    expect(ws.getCell(7, 1).value).toBe("月");
    expect(ws.getCell(7, 2).value).toBe(1);
    expect(ws.getCell(7, 3).value).toBe("0:45");
    expect(ws.getCell(9, 1).value).toBe("週計");
    expect(ws.getCell(9, 2).value).toBe(2);
    expect(ws.getCell(9, 3).value).toBe("1:30");
    // 印刷: A4 縦 + タイトル/ヘッダ行の繰り返し
    expect(ws.pageSetup).toMatchObject({
      paperSize: 9,
      orientation: "portrait",
      printTitlesRow: "1:2",
    });
  });

  it("隔週コマはパートナーのシートにも載り、備考と集計は A/B・0.5 週分になる", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = {
      subj: "英語",
      teacher: "堀上",
      note: "隔週(河野)",
    };
    const wb = buildRegularTeacherWorkbook(p, { dateLabel: "2026-08-08" });
    // 河野はマスタ外だが担当コマ (0.5) があるのでシートが出来る
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "集計",
      "堀上",
      "半田",
      "河野",
    ]);
    // 主担当 (A) 側: 月2限 A (既存) の次の行に隔週コマ
    const main = wb.getWorksheet("堀上");
    expect(main.getCell(4, 8).value).toBe("隔週A（河野 と交互）");
    // パートナー (B) 側: 相手は講師欄の主担当。集計は 0.5 コマ / 22.5 分
    const partner = wb.getWorksheet("河野");
    expect(partner.getCell(3, 8).value).toBe("隔週B（堀上 と交互）");
    expect(partner.getCell(6, 2).value).toBe(0.5);
    expect(partner.getCell(6, 3).value).toBe("0:23");
  });

  it("担当コマのある講師がいなければシート 0 (呼び出し側でエラー)", () => {
    const p = makeProject();
    p.tabs[0].schedule = {};
    const wb = buildRegularTeacherWorkbook(p, { dateLabel: "2026-08-08" });
    expect(wb.worksheets).toHaveLength(0);
  });
});

describe("teacherEntryNote", () => {
  it("隔週以外は note の原文、隔週は A/B と相手の表記", () => {
    expect(teacherEntryNote({ note: "合同" })).toBe("合同");
    expect(
      teacherEntryNote({ biweekly: "A", note: "隔週(河野)", teacher: "堀上" })
    ).toBe("隔週A（河野 と交互）");
    expect(
      teacherEntryNote({ biweekly: "B", note: "隔週(河野)", teacher: "堀上" })
    ).toBe("隔週B（堀上 と交互）");
  });
});
