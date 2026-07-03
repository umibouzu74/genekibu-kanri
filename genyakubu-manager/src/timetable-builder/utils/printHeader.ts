// L1f: 印刷紙面の見出し用の日付フォーマッタ。
//
// Header (プロジェクト名) と TabBar (学年) は no-print のため、印刷紙面には
// 「どの学年の・いつ時点の・何の時間割か」が載らず無記名になっていた。
// BuilderApp が印刷専用 (hidden print:block) の見出し行を出すのに使う。
// 形式は親アプリの printStyles.formatPrintDate と同じ和式
// 「YYYY年MM月DD日（曜）」だが、builder は自己完結の慣習 (useFocusTrap と
// 同型) のためローカルに持つ。
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatPrintDateJa(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}年${m}月${day}日（${WEEKDAYS_JA[d.getDay()]}）`;
}
