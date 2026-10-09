// ─── 予定表ファイル (.xls / .xlsx) を開く ────────────────────────────
// 中身の先頭バイトで形式を見分ける (拡張子は信じない — 学校から届く
// ファイルは名前が化けていることがある)。

import { isCompoundFile, readXls } from "./xlsReader";

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<{ sheets: Array<{ name: string, rows: Array<Array<object>>, merges: object[] }> }>}
 */
export async function readWorkbookBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isCompoundFile(bytes)) return readXls(bytes);
  if (ZIP_SIGNATURE.every((b, i) => bytes[i] === b)) {
    const { readXlsx } = await import("./xlsxReader");
    return readXlsx(bytes);
  }
  throw new Error("Excel のファイル (.xls / .xlsx) ではありません");
}

/** File (input[type=file] / ドロップ) から読む。 */
export async function readWorkbookFile(file) {
  const buf = await file.arrayBuffer();
  return readWorkbookBytes(buf);
}
