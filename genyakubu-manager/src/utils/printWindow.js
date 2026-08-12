// 印刷ポップアップ (CLAUDE.md「印刷システムの二系統」の handlePrint 系統) の
// window 操作をまとめる。CSS / HTML の組み立ては utils/printStyles.js の純粋
// 関数が担当し、こちらは「popup を開く → 書き込む → print()」という副作用
// だけを持つ。App.jsx の handlePrint / handleBatchPrint と ExcelGridView の
// 全曜日印刷が共通で使う。
import { escapeHtml } from "./escape";

// popup を開く。ブロックされた場合は null を返すので、呼び出し側で
// toasts.error を出すこと。**user gesture (クリック) の直下で呼ぶ**
// (await を挟んだ後だと Safari / Firefox でブロックされやすい)。
export function openPrintWindow() {
  return window.open("", "_blank");
}

// popup に印刷用ドキュメントを書き込んで印刷ダイアログを出す。
// 印刷ダイアログが閉じたら (取り消した場合を含む) popup も閉じる。
export function writePrintDocument(w, { title = "", styles = "", bodyHtml = "" }) {
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${bodyHtml}</body></html>`
  );
  w.document.close();
  w.onafterprint = () => w.close();
  setTimeout(() => w.print(), 300);
}
