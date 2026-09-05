// ─── exceljs 出力で共有するスタイル部品 (2026-09-05 に集約) ───────────
// 通常時間割作成 (regular-builder/excelExport.js)・講習作成
// (timetable-builder/utils/excelExport.ts)・出勤可能時間調査
// (utils/staffSurveyExport.js) が同じ罫線・配色・ダウンロード手順を
// それぞれ持っていた。値は 3 者で同じだったものだけを置く (シート名の
// 一意化は接尾辞の流儀が違うので各ファイルに残している)。
//
// exceljs の色は ARGB ("FF" + RRGGBB)。
import type ExcelJS from "exceljs";
import { downloadBlob, XLSX_MIME } from "./download";

export const ARGB = {
  WHITE: "FFFFFFFF",
  GRAY_BORDER: "FFAAAAAA",
  HEADER_BLUE: "FF4472C4",
  HEAD_GRAY: "FFF2F2F2",
  SECTION_GREEN: "FFE2EFDA",
  ACCENT_GREEN: "FF548235",
} as const;

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: ARGB.GRAY_BORDER } },
  bottom: { style: "thin", color: { argb: ARGB.GRAY_BORDER } },
  left: { style: "thin", color: { argb: ARGB.GRAY_BORDER } },
  right: { style: "thin", color: { argb: ARGB.GRAY_BORDER } },
};

/** 単色の塗り */
export const solidFill = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

/** "#RRGGBB" → ARGB。不正・空は undefined */
export const hexToArgb = (hex: string | null | undefined): string | undefined =>
  /^#[0-9a-fA-F]{6}$/.test(hex || "") ? `FF${(hex as string).slice(1).toUpperCase()}` : undefined;

/**
 * ブラウザでワークブックを保存させる。exceljs は Node API を持つので、
 * ブラウザでは writeBuffer() → Blob → <a download> の手順を踏む。
 */
export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as unknown as BlobPart], { type: XLSX_MIME }), filename);
}
