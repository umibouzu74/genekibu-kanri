// L1f: 印刷紙面の見出し用の日付フォーマッタ。
//
// Header (プロジェクト名) と TabBar (学年) は no-print のため、印刷紙面には
// 「どの学年の・いつ時点の・何の時間割か」が載らず無記名になっていた。
// BuilderApp が印刷専用 (hidden print:block) の見出し行を出すのに使う。
// 形式は親アプリの printStyles.formatPrintDate と同じ和式
// 「YYYY年MM月DD日（曜）」。実装もそちらを使う (2026-09-05 に統合)。
import { formatPrintDate } from '../../utils/printStyles';
import { fmtDate } from '../../utils/dateHelpers';
import { WEEKDAYS } from '../../constants/schools';

export function formatPrintDateJa(d: Date): string {
  return formatPrintDate(fmtDate(d), WEEKDAYS[d.getDay()]);
}
