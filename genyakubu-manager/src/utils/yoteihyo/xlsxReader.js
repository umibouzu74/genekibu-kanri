// ─── .xlsx の読み取り (exceljs) ──────────────────────────────────────
// .xls (xlsReader) と同じ形 { sheets: [{ name, rows, merges }] } に揃える。
// 予定表は .xls で届くのが普通だが、Excel で開いて保存し直すと .xlsx に
// なるので両方読めるようにしておく。exceljs は大きいので、この
// モジュールごと動的 import で読む (workbookFile.js)。

import ExcelJS from "exceljs";
import { DEFAULT_PALETTE, excelSerialToIso } from "./xlsReader";

const FIXED_COLORS = ["000000", "ffffff", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff"];
// Office 既定テーマ (theme 0〜9 = lt1, dk1, lt2, dk2, accent1〜6)
const THEME_COLORS = ["ffffff", "000000", "e7e6e6", "44546a", "4472c4", "ed7d31", "a5a5a5", "ffc000", "5b9bd5", "70ad47"];

function applyTint(hex, tint) {
  if (!tint) return hex;
  const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint));
  return out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

function colorOf(c) {
  if (!c) return null;
  if (typeof c.argb === "string" && c.argb.length >= 6) return c.argb.slice(-6).toLowerCase();
  if (Number.isInteger(c.indexed)) {
    if (c.indexed < 8) return FIXED_COLORS[c.indexed];
    if (c.indexed < 64) return DEFAULT_PALETTE[c.indexed - 8] ?? null;
    return null;
  }
  if (Number.isInteger(c.theme) && THEME_COLORS[c.theme]) return applyTint(THEME_COLORS[c.theme], c.tint);
  return null;
}

function fillOf(cell) {
  const f = cell.fill;
  if (!f || f.type !== "pattern" || !f.pattern || f.pattern === "none") return null;
  const hex = colorOf(f.fgColor);
  return hex ? `#${hex}` : null;
}

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

function cellOf(cell) {
  const fill = fillOf(cell);
  let v = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text || "").join("");
    else if ("result" in v) v = v.result;
    else if ("text" in v) v = v.text;
    else v = null;
  }
  if (v instanceof Date) {
    const serial = (v.getTime() - SERIAL_EPOCH) / 86400000;
    return { t: "n", v: serial, fill, date: excelSerialToIso(serial) };
  }
  if (typeof v === "number") return { t: "n", v, fill };
  if (typeof v === "string") return { t: "s", v, fill };
  if (typeof v === "boolean") return { t: "b", v, fill };
  return fill ? { t: "z", v: null, fill } : null;
}

// "B2:D4" → { r0, c0, r1, c1 } (0 起点)
function parseRange(ref) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(ref).replace(/\$/g, ""));
  if (!m) return null;
  const col = (s) => [...s].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { r0: Number(m[2]) - 1, c0: col(m[1]), r1: Number(m[4]) - 1, c1: col(m[3]) };
}

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<{ sheets: Array<{ name: string, rows: Array<Array<object>>, merges: object[] }> }>}
 */
export async function readXlsx(input) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input instanceof Uint8Array ? input : new Uint8Array(input));
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // 結合の従属セルは値を持たない (.xls と揃える。色だけは残す)
        const isSlave = cell.isMerged && cell.master && cell.master !== cell;
        const c = isSlave
          ? (() => {
              const fill = fillOf(cell);
              return fill ? { t: "z", v: null, fill } : null;
            })()
          : cellOf(cell);
        if (!c) return;
        (rows[rowNumber - 1] || (rows[rowNumber - 1] = []))[colNumber - 1] = c;
      });
    });
    const merges = (ws.model?.merges || []).map(parseRange).filter(Boolean);
    sheets.push({ name: ws.name, rows, merges });
  });
  return { sheets };
}
