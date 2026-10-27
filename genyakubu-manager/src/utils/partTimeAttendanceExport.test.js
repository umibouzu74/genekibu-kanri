// バイト出勤表 Excel (utils/partTimeAttendanceExport)。
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  ARGB_CARD_FORGET_FILL,
  ATTENDANCE_SHEET_TITLE,
  FIRST_STAFF_ROW,
  buildPartTimeAttendanceFile,
  buildPartTimeAttendanceWorkbook,
  layoutAttendanceColumns,
} from "./partTimeAttendanceExport";
import { decryptOfficeFileForTest } from "./officeEncryptionTestUtils";
import { isCompoundFile } from "./yoteihyo/xlsReader";
import { buildPartTimeAttendanceSheet } from "./partTimeAttendance";
import { datesInRange } from "./teachingMinutes";

const { dates } = datesInRange("2026-09-21", "2026-10-20");

describe("layoutAttendanceColumns", () => {
  it("B 列から日付を並べ、月の切れ目に空の列を 1 つ挟む", () => {
    const { columns, lastCol } = layoutAttendanceColumns(dates);
    const sep30 = columns.find((c) => c.date === "2026-09-30");
    const oct1 = columns.find((c) => c.date === "2026-10-01");
    expect(columns[0]).toMatchObject({ kind: "date", date: "2026-09-21", col: 2, newMonth: true });
    expect(sep30.col).toBe(11);
    expect(columns.find((c) => c.col === 12)).toEqual({ kind: "gap", col: 12 });
    expect(oct1).toMatchObject({ col: 13, newMonth: true });
    // 30 日 + 空の列 1
    expect(lastCol).toBe(2 + 30 + 1 - 1);
  });
  it("年をまたぐ期間は新しい年の最初の日の列にも年を置く", () => {
    const d = datesInRange("2026-12-21", "2027-01-20").dates;
    const s = buildPartTimeAttendanceSheet({ rows: new Map(), staff: [{ name: "福武" }], dates: d });
    const w = buildPartTimeAttendanceWorkbook({ sheet: s, startDate: d[0], endDate: d.at(-1) });
    const ws1 = w.getWorksheet("バイト出勤表");
    const cols = layoutAttendanceColumns(d).columns;
    expect(ws1.getCell(1, cols.find((c) => c.date === "2026-12-28").col).value).toBe("2026年");
    expect(ws1.getCell(1, cols.find((c) => c.date === "2027-01-01").col).value).toBe("2027年");
    expect(ws1.getCell(2, cols.find((c) => c.date === "2027-01-01").col).value).toBe("1月");
  });
  it("月が変わらなければ空の列を入れない", () => {
    const { columns } = layoutAttendanceColumns(["2026-10-01", "2026-10-02"]);
    expect(columns.map((c) => c.kind)).toEqual(["date", "date"]);
  });
});

describe("buildPartTimeAttendanceWorkbook (金額入り = 単価を渡したとき)", () => {
  const rows = new Map([
    [
      "福武",
      {
        entries: [
          { date: "2026-10-10", time: "14:00-15:00", kind: "own", label: "a" },
          { date: "2026-10-10", time: "15:30-16:30", kind: "own", label: "b" },
          { date: "2026-10-10", time: "18:25-19:25", kind: "own", label: "c" },
          { date: "2026-10-10", time: "19:35-20:35", kind: "own", label: "d" },
          { date: "2026-09-22", time: "19:00-20:20", kind: "own", label: "e" },
        ],
      },
    ],
    ["奥村", { entries: [{ date: "2026-10-03", time: "18:30-20:00", kind: "own", label: "f" }] }],
  ]);
  const sheet = buildPartTimeAttendanceSheet({
    rows,
    staff: [{ name: "福武" }, { name: "奥村" }, { name: "杉原" }],
    dates,
  });
  const hints = new Map([["福武", "（火H2・水T3・木T3・金H2）"]]);
  const wb = buildPartTimeAttendanceWorkbook({
    sheet,
    hints,
    startDate: "2026-09-21",
    endDate: "2026-10-20",
    unitPrice: 5500,
  });
  const ws = wb.getWorksheet("バイト出勤表");
  const { columns, lastCol } = layoutAttendanceColumns(dates);
  const colOf = (date) => columns.find((c) => c.date === date).col;
  const daysCol = lastCol + 1;
  const amountCol = lastCol + 2;
  const L = (c) => ws.getColumn(c).letter;

  it("1〜4 行目: 表題・年・単価 / 月 / 日 / 曜日", () => {
    expect(ws.getCell(1, 1).value).toBe(ATTENDANCE_SHEET_TITLE);
    // 年は表題がはみ出す分を空けて、日付の 8 列目 (9/28) に
    expect(ws.getCell(1, colOf("2026-09-28")).value).toBe("2026年");
    expect(ws.getCell(1, 2).value).toBeNull();
    expect(ws.getCell(1, daysCol).value).toBe("単価");
    expect(ws.getCell(1, amountCol).value).toBe(5500);
    expect(ws.getCell(2, colOf("2026-09-21")).value).toBe("9月");
    expect(ws.getCell(2, colOf("2026-10-01")).value).toBe("10月");
    expect(ws.getCell(2, colOf("2026-09-22")).value).toBeNull();
    expect(ws.getCell(3, colOf("2026-10-10")).value).toBe(10);
    expect(ws.getCell(4, colOf("2026-10-10")).value).toBe("土");
    expect(ws.getCell(4, colOf("2026-10-11")).value).toBe("日");
    // 月の切れ目の空の列
    expect(ws.getCell(3, 12).value).toBeNull();
    expect(ws.getCell(3, daysCol).value).toBe("日数");
    expect(ws.getCell(3, amountCol).value).toBe("金額");
  });

  it("各行: 先生の名前と担当の目安・日ごとの数 (0 は空欄)", () => {
    const r = FIRST_STAFF_ROW;
    expect(ws.getCell(r, 1).value.richText.map((t) => t.text)).toEqual([
      "福武 先生",
      "\n（火H2・水T3・木T3・金H2）",
    ]);
    expect(ws.getCell(r + 1, 1).value).toBe("奥村 先生");
    expect(ws.getCell(r, colOf("2026-10-10")).value).toBe(2);
    expect(ws.getCell(r, colOf("2026-09-22")).value).toBe(1);
    expect(ws.getCell(r, colOf("2026-09-23")).value).toBeNull();
    expect(ws.getCell(r + 2, 1).value).toBe("杉原 先生");
  });

  it("日数・金額・合計は式 (単価は 1 つのセルを参照)", () => {
    const r = FIRST_STAFF_ROW;
    expect(ws.getCell(r, daysCol).value).toEqual({
      formula: `SUM(B${r}:${L(lastCol)}${r})`,
      result: 3,
    });
    expect(ws.getCell(r, amountCol).value).toEqual({
      formula: `${L(daysCol)}${r}*$${L(amountCol)}$1`,
      result: 16500,
    });
    const total = FIRST_STAFF_ROW + 3;
    expect(ws.getCell(total, 1).value).toBe("合計");
    expect(ws.getCell(total, amountCol).value).toEqual({
      formula: `SUM(${L(amountCol)}${r}:${L(amountCol)}${r + 2})`,
      result: 22000,
    });
    expect(ws.getCell(total, daysCol).value.result).toBe(4);
  });

  it("A4 横・幅 1 ページ・見出し行の繰り返し", () => {
    expect(ws.pageSetup).toMatchObject({
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:4",
    });
  });

  it("xlsx に書き出して読み直せる", async () => {
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    const ws2 = back.getWorksheet("バイト出勤表");
    expect(ws2.getCell(FIRST_STAFF_ROW, daysCol).value.formula).toBe(
      `SUM(B${FIRST_STAFF_ROW}:${L(lastCol)}${FIRST_STAFF_ROW})`
    );
  });

  it("バイトが 0 人でも作れる", () => {
    const empty = buildPartTimeAttendanceSheet({ rows: new Map(), staff: [], dates });
    const w = buildPartTimeAttendanceWorkbook({ sheet: empty, startDate: dates[0], endDate: dates.at(-1) });
    expect(w.getWorksheet("バイト出勤表").getCell(FIRST_STAFF_ROW, 1).value).toBe("合計");
  });
});

describe("金額なし (単価を渡さない)", () => {
  const rows = new Map([
    ["福武", { entries: [{ date: "2026-10-10", time: "14:00-15:00", kind: "own", label: "a" }] }],
  ]);
  const sheet = buildPartTimeAttendanceSheet({ rows, staff: [{ name: "福武" }, { name: "奥村" }], dates });
  const ws = buildPartTimeAttendanceWorkbook({ sheet, startDate: dates[0], endDate: dates.at(-1) }).getWorksheet(
    "バイト出勤表"
  );
  const { lastCol } = layoutAttendanceColumns(dates);
  const daysCol = lastCol + 1;

  it("単価・金額の列を作らない (日数と合計の日数だけ)", () => {
    expect(ws.getCell(1, daysCol).value).toBeNull();
    expect(ws.getCell(3, daysCol).value).toBe("日数");
    expect(ws.getCell(3, daysCol + 1).value).toBeNull();
    expect(ws.getCell(FIRST_STAFF_ROW, daysCol).value.result).toBe(1);
    expect(ws.getCell(FIRST_STAFF_ROW, daysCol + 1).value).toBeNull();
    const total = FIRST_STAFF_ROW + 2;
    expect(ws.getCell(total, daysCol).value.result).toBe(1);
    expect(ws.getCell(total, daysCol + 1).value).toBeNull();
    const texts = [];
    ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value))));
    expect(texts.join(" ")).not.toMatch(/単価|金額/);
  });
});

describe("カード忘れ (打刻なし)", () => {
  const rows = new Map([
    ["福武", { entries: [{ date: "2026-10-10", time: "14:00-15:00", kind: "own", label: "a" }] }],
  ]);
  const cardForgets = [
    { id: 1, name: "福武", date: "2026-10-10", missing: "both", inTime: "13:45", outTime: "15:10", memo: "責任者確認" },
    { id: 2, name: "奥村", date: "2026-10-03", missing: "out" },
  ];
  const sheet = buildPartTimeAttendanceSheet({
    rows,
    staff: [{ name: "福武" }, { name: "奥村" }],
    dates,
    cardForgets,
  });
  const { columns, lastCol } = layoutAttendanceColumns(dates);
  const colOf = (date) => columns.find((c) => c.date === date).col;

  it("記録のある日のセルは塗りとメモ (数・式はそのまま)", async () => {
    const wb = buildPartTimeAttendanceWorkbook({ sheet, startDate: dates[0], endDate: dates.at(-1) });
    // 書き出して読み直してもメモと塗りが残る
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    const ws = back.getWorksheet("バイト出勤表");
    const cell = ws.getCell(FIRST_STAFF_ROW, colOf("2026-10-10"));
    expect(cell.value).toBe(1);
    expect(cell.fill.fgColor.argb).toBe(ARGB_CARD_FORGET_FILL);
    expect(JSON.stringify(cell.note)).toContain("カード忘れ: 出勤・退勤の打刻なし (出勤 13:45 / 退勤 15:10)。責任者確認");
    // 授業の無い日の記録も印を付ける (空欄のまま)
    const empty = ws.getCell(FIRST_STAFF_ROW + 1, colOf("2026-10-03"));
    expect(empty.value).toBeNull();
    expect(empty.fill.fgColor.argb).toBe(ARGB_CARD_FORGET_FILL);
    expect(ws.getCell(FIRST_STAFF_ROW, lastCol + 1).value.result).toBe(1);
  });

  it("合計の下に一覧 (出勤 0 の日は注意を添える)", () => {
    const ws = buildPartTimeAttendanceWorkbook({ sheet, startDate: dates[0], endDate: dates.at(-1) }).getWorksheet(
      "バイト出勤表"
    );
    const total = FIRST_STAFF_ROW + 2;
    expect(ws.getCell(total, 1).value).toBe("合計");
    expect(ws.getCell(total + 1, 1).value).toBeNull();
    expect(ws.getCell(total + 2, 1).value).toMatch(/^カード忘れ \(打刻なし\) の記録 2 件/);
    expect(ws.getCell(total + 3, 1).value).toBe("10/3 (土)　奥村 先生　退勤だけの打刻なし　※ 出勤表ではこの日の出勤 0");
    expect(ws.getCell(total + 4, 1).value).toBe(
      "10/10 (土)　福武 先生　出勤・退勤の打刻なし (出勤 13:45 / 退勤 15:10)。責任者確認"
    );
    // 一覧の行は表の幅いっぱいに結合 (印刷で切れない)
    expect(ws.getCell(total + 3, lastCol + 1).isMerged).toBe(true);
  });

  it("記録の無い期間も「ありません」と書く", () => {
    const plain = buildPartTimeAttendanceSheet({ rows, staff: [{ name: "福武" }], dates });
    const ws = buildPartTimeAttendanceWorkbook({ sheet: plain, startDate: dates[0], endDate: dates.at(-1) }).getWorksheet(
      "バイト出勤表"
    );
    expect(ws.getCell(FIRST_STAFF_ROW + 3, 1).value).toBe("カード忘れ (打刻なし) の記録: この期間はありません");
  });
});

describe("buildPartTimeAttendanceFile", () => {
  const rows = new Map([
    [
      "福武",
      {
        entries: [
          { date: "2026-10-10", time: "14:00-15:00", kind: "own", label: "a" },
          { date: "2026-10-10", time: "18:25-19:25", kind: "own", label: "b" },
        ],
      },
    ],
  ]);
  const sheet = buildPartTimeAttendanceSheet({ rows, staff: [{ name: "福武" }], dates });
  const base = { sheet, startDate: "2026-09-21", endDate: "2026-10-20" };

  it("金額なしは鍵なしの .xlsx (zip)、名前に「日数のみ」", async () => {
    const file = await buildPartTimeAttendanceFile(base);
    expect(file.encrypted).toBe(false);
    expect(file.fileName).toBe("アルバイトコマ数2026.9.21-10.20_日数のみ.xlsx");
    expect([...file.bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]); // "PK"
  });

  it("金額入りはパスワードが無いと作らない", async () => {
    await expect(buildPartTimeAttendanceFile({ ...base, unitPrice: 5500 })).rejects.toThrow("パスワード");
    await expect(buildPartTimeAttendanceFile({ ...base, unitPrice: 5500, password: "" })).rejects.toThrow(
      "パスワード"
    );
  });

  it("金額入りは開くのにパスワードが要り、開くと単価・金額が入っている", async () => {
    const file = await buildPartTimeAttendanceFile({ ...base, unitPrice: 6000, password: "ishihara" });
    expect(file.encrypted).toBe(true);
    expect(file.fileName).toBe("アルバイトコマ数2026.9.21-10.20.xlsx");
    // 暗号化したファイル (OLE2) で、そのままでは .xlsx (zip) として読めない
    expect(isCompoundFile(file.bytes)).toBe(true);
    expect(decryptOfficeFileForTest(file.bytes, "wrong")).toBeNull();

    const plain = decryptOfficeFileForTest(file.bytes, "ishihara");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(plain);
    const ws = wb.getWorksheet("バイト出勤表");
    const { lastCol } = layoutAttendanceColumns(dates);
    expect(ws.getCell(1, lastCol + 1).value).toBe("単価");
    expect(ws.getCell(1, lastCol + 2).value).toBe(6000);
    expect(ws.getCell(FIRST_STAFF_ROW, lastCol + 2).value.result).toBe(12000);
  });
});
