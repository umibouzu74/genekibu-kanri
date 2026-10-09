// ─── 予定表ファイル (.xls / .xlsx) を開く ────────────────────────────
// 中身の先頭バイトで形式を見分ける (拡張子は信じない — 学校から届く
// ファイルは名前が化けていることがある)。
// 利用者に見せるエラーは日本語にそろえる (WorkbookError 以外は包む)。

import { WorkbookError } from "./errors";
import { isCompoundFile, readXls } from "./xlsReader";

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

const UNREADABLE =
  "ファイルが壊れているか、Excel の予定表ではありません。" +
  "Excel で開いて保存し直してから、もう一度読み込んでください。";

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<{ sheets: Array<{ name: string, rows: Array<Array<object>>, merges: object[] }> }>}
 */
export async function readWorkbookBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    if (isCompoundFile(bytes)) return readXls(bytes);
    if (ZIP_SIGNATURE.every((b, i) => bytes[i] === b)) {
      const { readXlsx } = await import("./xlsxReader");
      return await readXlsx(bytes);
    }
  } catch (err) {
    if (err instanceof WorkbookError) throw err;
    console.warn("[yoteihyo] 読み取りに失敗", err);
    throw new WorkbookError(UNREADABLE);
  }
  throw new WorkbookError("Excel のファイル (.xls / .xlsx) ではありません。");
}

/** File (input[type=file] / ドロップ) から読む。 */
export async function readWorkbookFile(file) {
  const buf = await file.arrayBuffer();
  return readWorkbookBytes(buf);
}
