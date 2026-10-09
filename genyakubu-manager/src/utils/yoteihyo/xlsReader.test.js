import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  excelSerialToIso,
  isCompoundFile,
  isDateFormatString,
  isWeekdayFormatString,
  openCompoundFile,
  readXls,
} from "./xlsReader";
import { PASSWORD_MESSAGE } from "./errors";

const sample = new Uint8Array(readFileSync(new URL("./testdata/sample.xls", import.meta.url)));

// testdata/README.md の生成手順と同じ文字列
const longString = (i) =>
  i % 2 === 0
    ? `ascii string number ${i} padded ${"x".repeat(i % 37)}`
    : `日本語の文字列その${i}番目です${"漢".repeat(i % 23)}`;

describe("isCompoundFile", () => {
  it("OLE2 の署名を見分ける", () => {
    expect(isCompoundFile(sample)).toBe(true);
    expect(isCompoundFile(new Uint8Array(600))).toBe(false);
    expect(isCompoundFile(new TextEncoder().encode("PK\u0003\u0004 not ole"))).toBe(false);
  });
});

describe("openCompoundFile", () => {
  it("Workbook ストリームを取り出せる", () => {
    const cfb = openCompoundFile(sample);
    expect(cfb.names).toContain("Workbook");
    const wb = cfb.get("Workbook");
    // BIFF8 の BOF (0x0809) で始まる
    expect(wb[0] | (wb[1] << 8)).toBe(0x0809);
    expect(cfb.get("無いストリーム")).toBeNull();
  });

  it(".xls でなければ分かる言葉で止まる", () => {
    expect(() => openCompoundFile(new Uint8Array(1024))).toThrow(/\.xls/);
  });
});

describe("readXls", () => {
  const wb = readXls(sample);
  const sheet = wb.sheets[0];
  const cell = (r, c) => sheet.rows[r]?.[c];

  it("シート名を順に返す", () => {
    expect(wb.sheets.map((s) => s.name)).toEqual(["予定表テスト", "二枚目"]);
  });

  it("文字列・数値・日付・数式の結果・真偽値を読む", () => {
    expect(cell(0, 0)).toMatchObject({ t: "s", v: "2026年度　【高1・高2ゼミ】　10月～12月予定表" });
    expect(cell(1, 0)).toMatchObject({ t: "n", v: 20 });
    expect(cell(1, 0).date).toBeUndefined();
    expect(cell(1, 1)).toMatchObject({ t: "n", v: 3.5 });
    expect(cell(1, 2)).toMatchObject({ t: "n", v: -7 });
    expect(cell(1, 3)).toMatchObject({ t: "n", v: 123456789 });
    expect(cell(1, 3).date).toBeUndefined();
    expect(cell(1, 4)).toMatchObject({ t: "n", date: "2026-08-24" });
    expect(cell(1, 5)).toMatchObject({ t: "n", v: 3 });
    // G2 (文字列を返す数式) は LibreOffice が結果を数値 0 で保存している。
    // STRING レコードの読み取りは下の「組み立てた .xls」で確かめる
    expect(cell(1, 7)).toMatchObject({ t: "b", v: true });
  });

  it("結合範囲と塗りつぶしの色を読む (色だけの空欄も残す)", () => {
    expect(sheet.merges).toContainEqual({ r0: 2, c0: 0, r1: 2, c1: 3 });
    expect(cell(2, 0)).toMatchObject({ v: "休校", fill: "#ff8080" });
    expect(cell(3, 0)).toMatchObject({ v: "〇", fill: "#969696" });
    expect(cell(3, 1)).toMatchObject({ v: "●", fill: "#ffff00" });
    expect(cell(3, 2)).toMatchObject({ t: "z", v: null, fill: "#969696" });
    // 色の無い文字のセルは fill: null
    expect(cell(0, 0).fill).toBeNull();
  });

  it("CONTINUE レコードをまたぐ共有文字列 (英数・日本語) を崩さない", () => {
    for (let i = 0; i < 400; i++) {
      expect(cell(9 + i, 0)?.v).toBe(longString(i));
    }
  });

  it("2 枚目のシートも読む", () => {
    const s2 = wb.sheets[1];
    expect(s2.rows[1][1]).toMatchObject({ t: "s", v: "二枚目の文字" });
    expect(s2.rows[2][2]).toMatchObject({ t: "n", v: 42 });
  });

  it("途中で切れたファイルは例外にする (黙って空にしない)", () => {
    expect(() => readXls(sample.subarray(0, 4096))).toThrow();
  });
});

describe("excelSerialToIso", () => {
  it("1900 年基準 / 1904 年基準", () => {
    expect(excelSerialToIso(46258)).toBe("2026-08-24");
    expect(excelSerialToIso(46258 - 1462, true)).toBe("2026-08-24");
  });
  it("範囲外は null", () => {
    expect(excelSerialToIso(0)).toBeNull();
    expect(excelSerialToIso(123456789)).toBeNull();
    expect(excelSerialToIso(NaN)).toBeNull();
  });
});

describe("isDateFormatString", () => {
  it("年・日を含む書式は日付", () => {
    expect(isDateFormatString("yyyy/m/d")).toBe(true);
    expect(isDateFormatString('[$-411]ggge"年"m"月"d"日"')).toBe(true);
    expect(isDateFormatString("m/d")).toBe(true);
  });
  it("標準・数値・時刻だけの書式は日付でない", () => {
    expect(isDateFormatString("General")).toBe(false);
    expect(isDateFormatString("0.00")).toBe(false);
    expect(isDateFormatString("#,##0")).toBe(false);
    expect(isDateFormatString("h:mm")).toBe(false);
    expect(isDateFormatString('_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)')).toBe(false);
  });
});

// ─── 最小の .xls を組み立てて、境目の読み取りを狙って確かめる ─────────
// CFB (512 バイトセクタ・FAT 1 枚) に Workbook ストリームを 1 本だけ置く。
// ストリームは 4096 バイト以上にして通常のセクタに載せる。
function u16le(n) {
  return [n & 0xff, (n >> 8) & 0xff];
}
function u32le(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}
function rec(type, bytes) {
  return [...u16le(type), ...u16le(bytes.length), ...bytes];
}
function utf16(s) {
  return [...s].flatMap((ch) => u16le(ch.charCodeAt(0)));
}
function buildCfb(stream, name = "Workbook") {
  const sector = 512;
  const nStream = Math.ceil(stream.length / sector);
  const out = new Uint8Array(sector * (3 + nStream));
  const header = [
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ...new Array(16).fill(0),
    ...u16le(0x3e), ...u16le(3), ...u16le(0xfffe), ...u16le(9), ...u16le(6),
    ...new Array(6).fill(0),
    ...u32le(0), ...u32le(1), ...u32le(1), ...u32le(0), ...u32le(4096),
    ...u32le(0xfffffffe), ...u32le(0), ...u32le(0xfffffffe), ...u32le(0),
  ];
  out.set(header, 0);
  for (let i = 0; i < 109; i++) out.set(u32le(i === 0 ? 0 : 0xffffffff), 0x4c + i * 4);
  // FAT (sid 0): 0 = FAT, 1 = ディレクトリ, 2.. = ストリーム
  const fat = new Array(128).fill(0xffffffff);
  fat[0] = 0xfffffffd;
  fat[1] = 0xfffffffe;
  for (let i = 0; i < nStream; i++) fat[2 + i] = i === nStream - 1 ? 0xfffffffe : 3 + i;
  out.set(fat.flatMap(u32le), sector * 1);
  // ディレクトリ (sid 1)
  const entry = (name, type, start, size, child) => {
    const e = new Array(128).fill(0);
    const nm = utf16(name);
    e.splice(0, nm.length, ...nm);
    e.splice(0x40, 2, ...u16le(nm.length + 2));
    e[0x42] = type;
    e.splice(0x44, 4, ...u32le(0xffffffff));
    e.splice(0x48, 4, ...u32le(0xffffffff));
    e.splice(0x4c, 4, ...u32le(child));
    e.splice(0x74, 4, ...u32le(start));
    e.splice(0x78, 4, ...u32le(size));
    return e;
  };
  out.set(
    [
      ...entry("Root Entry", 5, 0xfffffffe, 0, 1),
      ...entry(name, 2, 2, stream.length, 0xffffffff),
      ...new Array(256).fill(0),
    ],
    sector * 2
  );
  out.set(stream, sector * 3);
  return out;
}
function bof(dt) {
  return rec(0x0809, [...u16le(0x0600), ...u16le(dt), ...new Array(12).fill(0)]);
}
// XF: fls (塗りの種類) と icvFore (色番号) だけ意味を持たせる
function xf(fill, color) {
  const d = new Array(20).fill(0);
  d.splice(14, 4, ...u32le((fill & 0x3f) << 26));
  d.splice(18, 2, ...u16le(color & 0x7f));
  return rec(0x00e0, d);
}
function buildWorkbook({ sstSegments, sheetRecords, palette, globals = [], streamName }) {
  const globalsHead = [
    ...bof(0x0005),
    ...xf(0, 64), // 0: 塗りなし
    ...xf(1, 55), // 1: 灰色 (既定パレット 55 = 969696)
    ...xf(1, 8), // 2: 色番号 8 (PALETTE で上書きする)
    ...globals,
  ];
  const paletteRec = palette
    ? rec(0x0092, [...u16le(palette.length), ...palette.flatMap(([r, g, b]) => [r, g, b, 0])])
    : [];
  const sst = sstSegments.flatMap((seg, i) => rec(i === 0 ? 0x00fc : 0x003c, seg));
  const boundSheetOf = (offset) =>
    rec(0x0085, [...u32le(offset), 0, 0, 2, 0, ..."S1".split("").map((c) => c.charCodeAt(0))]);
  const globalsTailLen = 4; // EOF
  const sheetOffset =
    globalsHead.length + paletteRec.length + sst.length + boundSheetOf(0).length + globalsTailLen;
  const boundSheet = boundSheetOf(sheetOffset);
  const sheet = [...bof(0x0010), ...sheetRecords, ...rec(0x000a, [])];
  let stream = [...globalsHead, ...paletteRec, ...sst, ...boundSheet, ...rec(0x000a, []), ...sheet];
  // 4096 バイト以上にする (末尾の未知レコードは読み飛ばされる)
  while (stream.length < 4200) stream = [...stream, ...rec(0x7fff, new Array(200).fill(0))];
  return buildCfb(new Uint8Array(stream), streamName);
}

// XF (書式番号つき)
function xfFmt(fmt) {
  const d = new Array(20).fill(0);
  d.splice(2, 2, ...u16le(fmt));
  return rec(0x00e0, d);
}
// FORMAT (番号 + 書式の文字列)
function format(id, str) {
  return rec(0x041e, [...u16le(id), ...u16le(str.length), 0x00, ...[...str].map((ch) => ch.charCodeAt(0))]);
}
// XFEXT: XF ixfe の塗りの前景色 (extType 4) を FullColorExt で
function xfext(ixfe, xclrType, value, tint = 0) {
  const full = [...u16le(xclrType), ...u16le(tint & 0xffff), ...u32le(value), ...new Array(8).fill(0)];
  const prop = [...u16le(4), ...u16le(4 + full.length), ...full];
  return rec(0x087d, [...new Array(12).fill(0), ...u16le(0), ...u16le(ixfe), ...u16le(0), ...u16le(1), ...prop]);
}
const SST0 = [[...u32le(0), ...u32le(0)]];
const number = (r, c, ixfe, v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return rec(0x0203, [...u16le(r), ...u16le(c), ...u16le(ixfe), ...b]);
};

describe("readXls (組み立てた .xls)", () => {
  it("文字の途中で CONTINUE に切れた共有文字列を、続きのフラグで読み直す", () => {
    // 1 本目: "ABC" + "日本" を 2 つのレコードに分ける。続きは 2 バイト文字 (フラグ 1)
    // 2 本目: レコードの頭から始まる (区切りのフラグは無い) "xyz"
    const seg1 = [...u32le(2), ...u32le(2), ...u16le(5), 0x00, 0x41, 0x42, 0x43];
    const seg2 = [0x01, ...utf16("日本"), ...u16le(3), 0x00, 0x78, 0x79, 0x7a];
    const bytes = buildWorkbook({
      sstSegments: [seg1, seg2],
      sheetRecords: [
        ...rec(0x00fd, [...u16le(0), ...u16le(0), ...u16le(0), ...u32le(0)]),
        ...rec(0x00fd, [...u16le(0), ...u16le(1), ...u16le(1), ...u32le(1)]),
      ],
    });
    const wb = readXls(bytes);
    expect(wb.sheets[0].name).toBe("S1");
    expect(wb.sheets[0].rows[0][0]).toEqual({ t: "s", v: "ABC日本", fill: null });
    expect(wb.sheets[0].rows[0][1]).toEqual({ t: "s", v: "xyz", fill: "#969696" });
  });

  it("文字列を返す数式は直後の STRING レコードの値", () => {
    const formulaString = [
      ...u16le(1), ...u16le(2), ...u16le(0),
      0x00, 0, 0, 0, 0, 0, 0xff, 0xff, // FormulaValue: 文字列
      ...u16le(0), ...u32le(0), ...u16le(0),
    ];
    const bytes = buildWorkbook({
      sstSegments: [[...u32le(0), ...u32le(0)]],
      sheetRecords: [
        ...rec(0x0006, formulaString),
        ...rec(0x0207, [...u16le(2), 0x01, ...utf16("あい")]),
      ],
    });
    expect(readXls(bytes).sheets[0].rows[1][2]).toEqual({ t: "s", v: "あい", fill: null });
  });

  it("MULRK / MULBLANK / 結合 / PALETTE の上書き", () => {
    // RK: 整数 7 (fInt) と 3.25 (×100 の整数 325)
    const rkInt = (7 << 2) | 2;
    const rk325 = (325 << 2) | 2 | 1;
    const bytes = buildWorkbook({
      sstSegments: [[...u32le(0), ...u32le(0)]],
      palette: [[0x12, 0x34, 0x56]],
      sheetRecords: [
        ...rec(0x00bd, [...u16le(4), ...u16le(1), ...u16le(0), ...u32le(rkInt), ...u16le(2), ...u32le(rk325), ...u16le(2)]),
        ...rec(0x00be, [...u16le(5), ...u16le(0), ...u16le(1), ...u16le(0), ...u16le(2), ...u16le(2)]),
        ...rec(0x00e5, [...u16le(1), ...u16le(6), ...u16le(7), ...u16le(0), ...u16le(3)]),
      ],
    });
    const s = readXls(bytes).sheets[0];
    expect(s.rows[4][1]).toEqual({ t: "n", v: 7, fill: null });
    expect(s.rows[4][2]).toEqual({ t: "n", v: 3.25, fill: "#123456" });
    // MULBLANK: 塗りのある空欄だけ残る
    expect(s.rows[5][0]).toEqual({ t: "z", v: null, fill: "#969696" });
    expect(s.rows[5][1]).toBeUndefined();
    expect(s.rows[5][2]).toEqual({ t: "z", v: null, fill: "#123456" });
    expect(s.merges).toEqual([{ r0: 6, r1: 7, c0: 0, c1: 3 }]);
  });
});

describe("readXls (壊れた・特殊なファイル)", () => {
  it("パスワード付きのブック (FILEPASS) は、分かる言葉で止まる", () => {
    const bytes = buildWorkbook({ sstSegments: SST0, sheetRecords: [], globals: rec(0x002f, [0, 0, 1, 0, 1, 0]) });
    expect(() => readXls(bytes)).toThrow(PASSWORD_MESSAGE);
  });

  it("パスワード付きの .xlsx (EncryptedPackage の OLE2) も同じ", () => {
    const bytes = buildWorkbook({ sstSegments: SST0, sheetRecords: [], streamName: "EncryptedPackage" });
    expect(() => readXls(bytes)).toThrow(PASSWORD_MESSAGE);
  });

  it("ストリーム名の大文字・小文字は区別しない", () => {
    const bytes = buildWorkbook({ sstSegments: SST0, sheetRecords: number(0, 0, 0, 5), streamName: "WORKBOOK" });
    expect(readXls(bytes).sheets[0].rows[0][0]).toEqual({ t: "n", v: 5, fill: null });
  });

  it("文字列の数式: 間に SHRFMLA / ARRAY が入っても STRING を読む。STRING が無くてもセルは残す", () => {
    const formula = (r, c) => [
      ...u16le(r), ...u16le(c), ...u16le(0),
      0x00, 0, 0, 0, 0, 0, 0xff, 0xff,
      ...u16le(0), ...u32le(0), ...u16le(0),
    ];
    const bytes = buildWorkbook({
      sstSegments: SST0,
      sheetRecords: [
        ...rec(0x0006, formula(0, 0)),
        ...rec(0x04bc, new Array(10).fill(0)), // SHRFMLA
        ...rec(0x0207, [...u16le(1), 0x01, ...utf16("月")]),
        ...rec(0x0006, formula(1, 0)),
        ...rec(0x0221, new Array(14).fill(0)), // ARRAY
        ...rec(0x0207, [...u16le(1), 0x01, ...utf16("火")]),
        ...rec(0x0006, formula(2, 0)), // STRING が無い
        ...number(3, 0, 0, 1),
      ],
    });
    const rows = readXls(bytes).sheets[0].rows;
    expect(rows[0][0].v).toBe("月");
    expect(rows[1][0].v).toBe("火");
    expect(rows[2][0]).toEqual({ t: "s", v: "", fill: null });
    expect(rows[3][0].v).toBe(1);
  });

  it("塗りの色は XFEXT (本当の色) を XF の色番号より優先する (RGB / テーマ + 明るさ)", () => {
    const bytes = buildWorkbook({
      sstSegments: SST0,
      // XF 1 (色番号 55 = 969696) を RGB a6a6a6 に、XF 2 をテーマ 0 (白) の -15% に
      globals: [...xfext(1, 2, 0x00a6a6a6), ...xfext(2, 3, 0, -4915)],
      sheetRecords: [...number(0, 0, 1, 1), ...number(0, 1, 2, 1)],
    });
    const row = readXls(bytes).sheets[0].rows[0];
    expect(row[0].fill).toBe("#a6a6a6");
    expect(row[1].fill).toBe("#d9d9d9");
  });

  it("曜日だけの書式 (aaa) は曜日の文字、日の数だけの日付書式 (d) の 1〜31 は日付にしない", () => {
    const bytes = buildWorkbook({
      sstSegments: SST0,
      globals: [...format(164, "aaa"), ...format(165, "d"), ...xfFmt(164), ...xfFmt(165)],
      sheetRecords: [
        ...number(0, 0, 3, 46304), // 2026-10-09 (金) を「aaa」で
        ...number(0, 1, 4, 15), // 「d」で 15 (Excel の画面は「15」)
        ...number(0, 2, 4, 46304), // 「d」でも本当の日付なら日付
      ],
    });
    const row = readXls(bytes).sheets[0].rows[0];
    expect(row[0]).toEqual({ t: "n", v: 46304, fill: null, wd: "金" });
    expect(row[1]).toEqual({ t: "n", v: 15, fill: null });
    expect(row[2].date).toBe("2026-10-09");
  });

  it("途中で切れたファイル・セクタの大きさがおかしいファイルは、壊れていると知らせる", () => {
    const ok = buildWorkbook({ sstSegments: SST0, sheetRecords: [] });
    expect(() => readXls(ok.subarray(0, ok.length - 600))).toThrow(/ファイルが壊れています \(途中で切れています\)/);
    const bad = ok.slice();
    bad[0x1e] = 8; // セクタ 256 バイト
    expect(() => openCompoundFile(bad)).toThrow(/ファイルが壊れています \(セクタサイズ\)/);
  });

  it("Workbook ストリームの中身が Excel 95 (BIFF5) なら、保存し直しを案内する", () => {
    const bytes = buildWorkbook({ sstSegments: SST0, sheetRecords: [] });
    const i = bytes.findIndex((_, k) => bytes[k] === 0x09 && bytes[k + 1] === 0x08);
    bytes[i + 4 + 1] = 0x05; // vers 0x0600 → 0x0500
    expect(() => readXls(bytes)).toThrow(/Excel 5\.0\/95 形式のファイルは読めません/);
  });

  it("ワークシートが 1 枚も無いブックは、空のまま返さず知らせる", () => {
    // BOUNDSHEET の種類をグラフ (2) にする
    const bytes = buildWorkbook({ sstSegments: SST0, sheetRecords: [] });
    const i = bytes.findIndex((_, k) => bytes[k] === 0x85 && bytes[k + 1] === 0x00);
    bytes[i + 4 + 5] = 2;
    expect(() => readXls(bytes)).toThrow("ブックにワークシートがありません。");
  });
});

describe("isWeekdayFormatString", () => {
  it("曜日だけの書式", () => {
    expect(isWeekdayFormatString("aaa")).toBe(true);
    expect(isWeekdayFormatString("[$-411]aaaa")).toBe(true);
    expect(isWeekdayFormatString("ddd")).toBe(true);
    expect(isWeekdayFormatString("m/d(aaa)")).toBe(false);
    expect(isWeekdayFormatString("d")).toBe(false);
    expect(isWeekdayFormatString("General")).toBe(false);
  });
});
