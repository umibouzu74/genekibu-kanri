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

// 一括印刷の「準備中」画面を popup に書き込む。popup はクリック直下で先に
// 開くため、ブラウザは即座にそのタブへ切り替わる — 元のタブに残る
// ダイアログの進捗バーや中断ボタンは、ユーザーが実際に見ている画面には
// 出ない (2026-09-12 の「白紙のまま」の指摘)。進捗はこの画面に出し、中断は
// 「このタブを閉じる」で行う (呼び出し側が `w.closed` を毎周期見る)。
// 準備が終わったら writePrintDocument が丸ごと書き換える (document.close
// 済みのドキュメントへの document.write は暗黙に open し直して空にする)。
export function writePendingDocument(w, { title = "", total = 0 } = {}) {
  if (!w || w.closed) return;
  const label = `${escapeHtml(title)} — 準備中`;
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${label}</title><style>` +
      `body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:40px 32px;color:#333;font-size:14px}` +
      `h1{font-size:18px;margin:0 0 12px}` +
      `.print-pending-status{margin:0 0 8px;font-size:15px}` +
      `progress{width:min(420px,100%);height:12px}` +
      `.print-pending-note{color:#666;font-size:12px;margin-top:16px}` +
      `</style></head><body>` +
      `<h1>${escapeHtml(title)} の紙面を準備しています…</h1>` +
      `<p class="print-pending-status" id="print-pending-status" aria-live="polite">0 / ${total} 枚</p>` +
      `<progress id="print-pending-bar" value="0" max="${total}"></progress>` +
      `<p class="print-pending-note">準備が終わると印刷ダイアログが開きます。中断するにはこのタブを閉じてください。</p>` +
      `</body></html>`
  );
  w.document.close();
}

// 準備中画面の進捗を更新する。popup が閉じられていれば何もしない。
export function updatePendingProgress(w, { current = 0, total = 0, name = "" } = {}) {
  if (!w || w.closed) return;
  const doc = w.document;
  const status = doc.getElementById("print-pending-status");
  if (status) status.textContent = `${current} / ${total} 枚${name ? `（${name}）` : ""}`;
  const bar = doc.getElementById("print-pending-bar");
  if (bar) {
    bar.max = total;
    bar.value = current;
  }
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

// 「対象を差し替えながら DOM をスナップショットして 1 ジョブに連結する」
// 一括印刷 (月次の 📋 まとめて印刷 / タイムテーブルの 🖨 全曜日) で、
// 1 枚描くごとにブラウザへ制御を返す待ち。進捗バーを描かせ、中断ボタンを
// 押せるようにするためのもの (DOM 自体は flushSync で既に確定している)。
//
// **requestAnimationFrame を使ってはいけない** (2026-09-12)。popup は
// クリック直下で先に開くため、開いた瞬間に新しいタブへフォーカスが移って
// 元のタブが background になる。background のタブでは rAF が一切呼ばれない
// ので、rAF 待ちにすると最初の 1 枚で永久に止まり、popup は白紙のまま
// 印刷ダイアログも出ない (「まとめて印刷が効かない」の正体)。
// setTimeout も background では 1 秒に 1 回へ絞られる (44 名 × 数か月で
// 数分)。MessageChannel の postMessage は絞られないので、これで 1 タスク
// だけ譲る。
export function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof MessageChannel === "function") {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}
