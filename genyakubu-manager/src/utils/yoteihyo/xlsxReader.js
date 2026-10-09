// ─── .xlsx の読み取り (exceljs) ──────────────────────────────────────
// .xls (xlsReader) と同じ形 { sheets: [{ name, rows, merges }] } に揃える。
// 予定表は .xls で届くのが普通だが、Excel で開いて保存し直すと .xlsx に
// なるので両方読めるようにしておく。exceljs は大きいので、この
// モジュールごと動的 import で読む (workbookFile.js)。

import ExcelJS from "exceljs";
import { WorkbookError } from "./errors";
import { paletteColor, themeColor, themeFromXml } from "./colors";
import { excelSerialToIso, isWeekdayFormatString } from "./xlsReader";

const WEEKDAYS = "日月火水木金土";
// 予定表の日付として信じる最も古い年 (xlsReader と同じ)
const MIN_DATE_YEAR = 1950;
const MAX_ROW = 1048575;
const MAX_COL = 16383;

function colorOf(c, theme) {
  if (!c) return null;
  if (typeof c.argb === "string" && c.argb.length >= 6) return c.argb.slice(-6).toLowerCase();
  if (Number.isInteger(c.indexed)) return paletteColor(c.indexed);
  if (Number.isInteger(c.theme)) return themeColor(c.theme, c.tint || 0, theme);
  return null;
}

function fillOf(cell, theme) {
  const f = cell.fill;
  if (!f || f.type !== "pattern" || !f.pattern || f.pattern === "none") return null;
  const hex = colorOf(f.fgColor, theme);
  return hex ? `#${hex}` : null;
}

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

function cellOf(cell, theme) {
  const fill = fillOf(cell, theme);
  let v = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text || "").join("");
    else if ("result" in v) v = v.result;
    else if ("text" in v) v = v.text;
    else v = null;
  }
  if (v instanceof Date) {
    const serial = (v.getTime() - SERIAL_EPOCH) / 86400000;
    const out = { t: "n", v: serial, fill };
    // 書式「d」で作った日の列の 1〜31 は 1900 年 1 月の日付になるので、日付にしない
    if (v.getUTCFullYear() >= MIN_DATE_YEAR) {
      if (isWeekdayFormatString(cell.numFmt)) out.wd = WEEKDAYS[v.getUTCDay()];
      else out.date = excelSerialToIso(serial);
    }
    return out;
  }
  if (typeof v === "number") {
    const out = { t: "n", v, fill };
    if (isWeekdayFormatString(cell.numFmt)) {
      const iso = excelSerialToIso(v);
      if (iso && Number(iso.slice(0, 4)) >= MIN_DATE_YEAR) {
        out.wd = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
      }
    }
    return out;
  }
  if (typeof v === "string") return { t: "s", v, fill };
  if (typeof v === "boolean") return { t: "b", v, fill };
  return fill ? { t: "z", v: null, fill } : null;
}

// "B2:D4" → { r0, c0, r1, c1 } (0 起点)。逆向き・上限を超える範囲は壊れているので捨てる
function parseRange(ref) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(ref).replace(/\$/g, ""));
  if (!m) return null;
  const col = (s) => [...s].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  const out = { r0: Number(m[2]) - 1, c0: col(m[1]), r1: Number(m[4]) - 1, c1: col(m[3]) };
  if (out.r0 < 0 || out.c0 < 0 || out.r1 < out.r0 || out.c1 < out.c0) return null;
  if (out.r1 > MAX_ROW || out.c1 > MAX_COL) return null;
  return out;
}

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<{ sheets: Array<{ name: string, rows: Array<Array<object>>, merges: object[] }> }>}
 */
export async function readXlsx(input) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input instanceof Uint8Array ? input : new Uint8Array(input));
  // ブック自身のテーマの配色 (無ければ Office 既定)。exceljs はテーマを
  // 公開の API で出していないので、読み込んだ theme1.xml を直接見る
  const theme = themeFromXml(wb._themes?.theme1);
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // 結合の従属セルは値を持たない (.xls と揃える。色だけは残す)
        const isSlave = cell.isMerged && cell.master && cell.master !== cell;
        const c = isSlave
          ? (() => {
              const fill = fillOf(cell, theme);
              return fill ? { t: "z", v: null, fill } : null;
            })()
          : cellOf(cell, theme);
        if (!c) return;
        (rows[rowNumber - 1] || (rows[rowNumber - 1] = []))[colNumber - 1] = c;
      });
    });
    const merges = (ws.model?.merges || []).map(parseRange).filter(Boolean);
    sheets.push({ name: ws.name, rows, merges });
  });
  if (!sheets.length) throw new WorkbookError("Excel のブック (.xlsx) ではありません。");
  return { sheets };
}
