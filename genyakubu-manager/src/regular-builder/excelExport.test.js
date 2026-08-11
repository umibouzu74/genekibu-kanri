import { describe, expect, it } from "vitest";
import {
  buildRegularTeacherWorkbook,
  buildRegularWorkbook,
  collectDaySheet,
  estimatePrintScale,
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
    // 印刷設定: B4 横・1 ページに丸ごと収める
    expect(ws.pageSetup).toMatchObject({
      paperSize: 12,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
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

describe("buildRegularWorkbook: 全曜日まとめシート", () => {
  // 火にもセルを足して 2 曜日分にする (1 曜日ではまとめを作らない)
  const twoDayProject = () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    return p;
  };

  it("曜日別シートの後ろに「全曜日」シートを作る", () => {
    const wb = buildRegularWorkbook(twoDayProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["月曜", "火曜", "全曜日"]);
  });

  it("曜日ごとにタイトルを置き、曜日の切れ目に改ページを入れる", () => {
    const wb = buildRegularWorkbook(twoDayProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    const ws = wb.getWorksheet("全曜日");
    expect(ws.getCell(1, 1).value).toContain("月曜日");
    // 月ブロック (タイトル + 空行 + セクション見出し + 見出し 2 段 + 2 時限
    // + 空行 = 8 行) の直後に改ページ → 9 行目から火曜ブロック
    expect(ws.rowBreaks.map((b) => b.id)).toEqual([8]);
    expect(ws.getCell(9, 1).value).toContain("火曜日");
    // 最後の曜日の後ろには改ページを入れない (空白ページを増やさない)
    expect(ws.rowBreaks).toHaveLength(1);
  });

  it("fitToPage は使わず固定倍率 (手動改ページを潰さないため)", () => {
    const wb = buildRegularWorkbook(twoDayProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    const ws = wb.getWorksheet("全曜日");
    // A3 (8) 横 — 曜日別シート (B4 = 12) と違い固定倍率なので、紙を
    // 大きくした分そのまま字が大きく刷れる
    expect(ws.pageSetup.paperSize).toBe(8);
    expect(wb.getWorksheet("月曜").pageSetup.paperSize).toBe(12);
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.fitToPage).toBe(false);
    expect(ws.pageSetup.scale).toBeGreaterThan(0);
    expect(ws.pageSetup.scale).toBeLessThanOrEqual(100);
  });

  it("1 曜日しか無いプロジェクトではまとめシートを作らない", () => {
    const wb = buildRegularWorkbook(makeProject(), {
      days: ["月", "火"],
      dateLabel: "2026-08-05",
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["月曜"]);
  });
});

describe("estimatePrintScale", () => {
  const paper = { width: 364 / 25.4, height: 257 / 25.4 }; // B4 横
  const margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 };

  it("余裕をもって収まる紙面は等倍 (拡大はしない)", () => {
    expect(
      estimatePrintScale({
        colWidths: [11, 16, 16],
        blockHeightsPt: [200],
        paper,
        margins,
      })
    ).toBe(100);
  });

  it("列が増えると幅に合わせて縮む", () => {
    const wide = estimatePrintScale({
      colWidths: [11, ...Array.from({ length: 20 }, () => 16)],
      blockHeightsPt: [200],
      paper,
      margins,
    });
    expect(wide).toBeLessThan(100);
    expect(wide).toBeGreaterThan(10);
  });

  it("同じ内容なら A3 横の方が B4 横より大きく刷れる", () => {
    // 「全曜日」シートを A3 に上げた理由の固定。固定倍率方式なので紙が
    // 大きいほど字が大きくなる (実データで B4 77% → A3 90%)。
    const args = {
      colWidths: [11, ...Array.from({ length: 11 }, () => 16)],
      blockHeightsPt: [810],
      margins,
    };
    const b4 = estimatePrintScale({ ...args, paper });
    const a3 = estimatePrintScale({
      ...args,
      paper: { width: 420 / 25.4, height: 297 / 25.4 },
    });
    expect(b4).toBeLessThan(a3);
    expect(a3).toBeLessThanOrEqual(100);
  });

  it("最も背の高い曜日ブロックに合わせて縮む", () => {
    const tall = estimatePrintScale({
      colWidths: [11, 16],
      blockHeightsPt: [200, 1600],
      paper,
      margins,
    });
    expect(tall).toBeLessThan(100);
  });

  it("極端な内容でも 10% を下回らない / 空でも 100%", () => {
    expect(
      estimatePrintScale({
        colWidths: [11],
        blockHeightsPt: [100000],
        paper,
        margins,
      })
    ).toBe(10);
    expect(
      estimatePrintScale({ colWidths: [], blockHeightsPt: [], paper, margins })
    ).toBe(100);
  });
});

describe("buildRegularTeacherWorkbook", () => {
  it("集計シート + 担当コマのある講師のシートをマスタ順に作る", () => {
    const wb = buildRegularTeacherWorkbook(makeProject(), {
      dateLabel: "2026-08-08",
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "集計",
      "クラス別科目",
      "堀上",
      "半田",
    ]);
    const sum = wb.getWorksheet("集計");
    expect(sum.getCell(1, 1).value).toContain("講師別コマ数・稼働時間");
    // 見出し 2 段: 講師 | 月 (コマ/時間) | 週計 (コマ/時間)。
    // 火はタブが使う曜日だが担当が誰もいないので列ごと省かれる
    expect(sum.getCell(3, 1).value).toBe("講師");
    expect(sum.getCell(3, 2).value).toBe("月");
    expect(sum.getCell(4, 2).value).toBe("コマ");
    expect(sum.getCell(4, 3).value).toBe("時間");
    expect(sum.getCell(3, 4).value).toBe("週計");
    // 堀上 (1 行目): 月 1 コマ 0:45 (2限 18:55-19:40)、週計も同じ
    expect(sum.getCell(5, 1).value).toBe("堀上");
    expect(sum.getCell(5, 2).value).toBe(1);
    expect(sum.getCell(5, 3).value).toBe("0:45");
    expect(sum.getCell(5, 4).value).toBe(1);
    expect(sum.getCell(5, 5).value).toBe("0:45");
  });

  it("担当のある曜日の列は出る (集計シート)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    const wb = buildRegularTeacherWorkbook(p, { dateLabel: "2026-08-08" });
    const sum = wb.getWorksheet("集計");
    expect(sum.getCell(3, 2).value).toBe("月");
    expect(sum.getCell(3, 4).value).toBe("火");
    expect(sum.getCell(3, 6).value).toBe("週計");
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
      "クラス別科目",
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

describe("buildRegularTeacherWorkbook: クラス別科目シート", () => {
  it("学年ごとに クラス × 科目 の週コマ数を載せる", () => {
    const wb = buildRegularTeacherWorkbook(makeProject(), {
      dateLabel: "2026-08-08",
    });
    const ws = wb.getWorksheet("クラス別科目");
    expect(ws.getCell(1, 1).value).toContain("クラス別 科目コマ数");
    // 学年見出し → 列見出し → クラス行 → 計行
    expect(ws.getCell(3, 1).value).toBe("中3");
    expect(ws.getCell(4, 1).value).toBe("クラス");
    // makeProject: S = 数学 1、A = 英語 1 (科目マスタ順で 英語 → 数学)
    expect(ws.getCell(4, 2).value).toBe("英語");
    expect(ws.getCell(4, 3).value).toBe("数学");
    expect(ws.getCell(5, 1).value).toBe("S");
    expect(ws.getCell(5, 3).value).toBe(1);
    expect(ws.getCell(6, 1).value).toBe("A");
    expect(ws.getCell(6, 2).value).toBe(1);
    expect(ws.getCell(7, 1).value).toBe("計");
    expect(ws.getCell(7, 4).value).toBe(2); // 週計列
  });

  it("教科の入ったセルが無ければシートを作らない", () => {
    const p = makeProject();
    // 講師だけのセルにする (集計シート・講師シートは出るが科目集計は空)
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = { teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("月", 2, 2)] = { teacher: "堀上" };
    const wb = buildRegularTeacherWorkbook(p, { dateLabel: "2026-08-08" });
    expect(wb.worksheets.map((w) => w.name)).not.toContain("クラス別科目");
  });
});
