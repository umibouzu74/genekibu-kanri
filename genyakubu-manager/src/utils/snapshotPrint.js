// 「対象を差し替えながら DOM をスナップショットして 1 ジョブに連結する」
// 印刷の共通ドライバ (CLAUDE.md「印刷システムの二系統」の popup 派生)。
// 月次の 📋 まとめて印刷 (hooks/usePrintJobs) とタイムテーブルの 🖨 全曜日
// (views/ExcelGridView) が使う。**新しくこの形の印刷を足すときは、ループを
// 書き起こさずにこれを呼ぶこと** — 準備中画面・進捗・中断 (popup を閉じる /
// AbortController)・最終書き込みの決まりを 1 か所に置くため。
//
// 流れ (1 枚ごと):
//   進捗 (popup + 呼び出し側の onProgress) → render (flushSync で描画を確定)
//   → yieldToBrowser (1 タスク譲る。rAF は使わない) → 中断チェック
//   → capture (DOM を読んで紙面の断片を返す。null は飛ばす)
// 全部終わったら buildBody で連結して writePrintDocument。
//
// 戻り値の status:
//   "printed" = 紙面を書き込んだ (印刷ダイアログが開く)
//   "closed"  = 途中で popup を閉じられた (書き込み先が無いので何もしない)
//   "aborted" = isAborted が真になった (popup は閉じる)
//   "empty"   = 1 枚も撮れなかった (popup は閉じる)
// toast の文言は呼び出し側 (経路ごとに違う) が status を見て出す。
import {
  updatePendingProgress,
  writePendingDocument,
  writePrintDocument,
  yieldToBrowser,
} from "./printWindow";

export async function runSnapshotPrint(
  w,
  {
    title = "",
    styles = "",
    items = [],
    progressName = () => "",
    onProgress,
    isAborted = () => false,
    render,
    capture,
    buildBody,
    docTitle,
  }
) {
  const total = items.length;
  const cancelled = () => w.closed || isAborted();
  const results = [];
  // ユーザーが見ているのは popup のタブなので、進捗はそちらに出す
  writePendingDocument(w, { title, total });
  for (let i = 0; i < total; i++) {
    if (cancelled()) break;
    const item = items[i];
    const progress = { current: i + 1, total, name: progressName(item, i) };
    onProgress?.(progress);
    updatePendingProgress(w, progress);
    render(item, i);
    await yieldToBrowser();
    if (cancelled()) break;
    const r = capture(item, i);
    if (r != null) results.push(r);
  }
  if (w.closed) return { status: "closed", results };
  if (isAborted()) {
    w.close();
    return { status: "aborted", results };
  }
  if (results.length === 0) {
    w.close();
    return { status: "empty", results };
  }
  writePrintDocument(w, {
    title: docTitle ? docTitle(results) : title,
    styles,
    bodyHtml: buildBody(results),
  });
  return { status: "printed", results };
}
