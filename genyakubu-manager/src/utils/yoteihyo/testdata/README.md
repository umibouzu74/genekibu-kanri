# 予定表チェックのテスト用データ

`sample.xls` は合成データ (学校の予定表そのものではない)。exceljs で
.xlsx を作り、LibreOffice で Excel 97-2003 形式 (BIFF8) に変換した。
LibreOffice の書き出しは共有文字列 (SST) を CONTINUE レコードに分けるので、
文字列がレコードの途中で切れる場合の読み取りを確かめられる。

作り直すとき (genyakubu-manager で):

```js
// make-sample.mjs — node make-sample.mjs sample.xlsx
import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("予定表テスト");
ws.getCell("A1").value = "2026年度　【高1・高2ゼミ】　10月～12月予定表";
ws.getCell("A2").value = 20;
ws.getCell("B2").value = 3.5;
ws.getCell("C2").value = -7;
ws.getCell("D2").value = 123456789;
ws.getCell("E2").value = new Date(Date.UTC(2026, 7, 24));
ws.getCell("E2").numFmt = "yyyy/m/d";
ws.getCell("F2").value = { formula: "1+2", result: 3 };
ws.getCell("G2").value = { formula: "\"あ\"&\"い\"", result: "あい" };
ws.getCell("H2").value = true;
ws.mergeCells("A3:D3");
ws.getCell("A3").value = "休校";
ws.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF8080" } };
ws.getCell("A4").value = "〇";
ws.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF969696" } };
ws.getCell("B4").value = "●";
ws.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
ws.getCell("C4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF969696" } };
for (let i = 0; i < 400; i++) {
  ws.getCell(10 + i, 1).value =
    i % 2 === 0
      ? `ascii string number ${i} padded ${"x".repeat(i % 37)}`
      : `日本語の文字列その${i}番目です${"漢".repeat(i % 23)}`;
}
const ws2 = wb.addWorksheet("二枚目");
ws2.getCell("B2").value = "二枚目の文字";
ws2.getCell("C3").value = 42;
await wb.xlsx.writeFile(process.argv[2]);
```

```sh
node make-sample.mjs sample.xlsx
soffice --headless --convert-to xls sample.xlsx
```
