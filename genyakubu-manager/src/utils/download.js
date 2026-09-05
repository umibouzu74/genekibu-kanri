// ─── ブラウザにファイルを保存させる (Blob → <a download> → click) ─────
// JSON バックアップ・CSV・ICS・Excel の 9 か所が同じ手順を書いていたので
// 1 か所に寄せた (2026-09-05)。
//
// - <a> は一度 body に付けてからクリックする (Firefox は DOM に無い
//   anchor の click で保存が始まらないことがある)
// - object URL の解放は少し遅らせる (即 revoke すると Safari で保存が
//   始まる前に無効になることがある)

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * テキストを保存させる。BOM が要る CSV は呼び出し側で先頭に付ける。
 * @param {string} text
 * @param {string} filename
 * @param {string} mime 例 "application/json" / "text/csv;charset=utf-8"
 */
export function downloadText(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
