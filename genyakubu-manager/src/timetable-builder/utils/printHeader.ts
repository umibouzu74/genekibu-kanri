// L1f: 印刷紙面の見出し (タイトル・印刷日・凡例)。
//
// Header (プロジェクト名) と TabBar (学年) は no-print のため、印刷紙面には
// 「どの学年の・いつ時点の・何の時間割か」が載らず無記名になっていた。
// BuilderApp が印刷専用 (hidden print:block) の見出し行を出すのに使う。
// 日付の形式は親アプリの printStyles.formatPrintDate と同じ和式
// 「YYYY年MM月DD日（曜）」だが、builder は自己完結の慣習 (useFocusTrap と
// 同型) のためローカルに持つ。
//
// L2g (2026-11-07): 強調表示 (教科 / 講師) を紙面の見出しと凡例に出す。
// 個別印刷 (🖨 印刷) とまとめて印刷で同じ文言にするため、文字列はここで作る。
import type { Highlight } from './highlight';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatPrintDateJa(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}年${m}月${day}日（${WEEKDAYS_JA[d.getDay()]}）`;
}

/** 紙面の見出し: 「2026 冬期講習 中123 — 中3【強調: 国語】」。強調なしなら【】を付けない */
export function buildPrintTitle(projectName: string, tabName: string | null | undefined, highlight: Highlight | null): string {
  const tab = tabName ? ` — ${tabName}` : '';
  const hl = highlight ? `【強調: ${highlight.value}】` : '';
  return `${projectName}${tab}${hl}`;
}

/** ★ (普段の担当) の説明。紙面の講師欄の ★ と同じ判定 (planning.usual.forClass) */
export const USUAL_TEACHER_LEGEND = '★ = 普段 (通常授業) このクラスのこの科目を担当している講師';

/**
 * 見出しの下の凡例。強調があれば「太枠 = 国語のコマ / 薄い表示 = それ以外」、
 * 普段の担当の対応 (ClassEntity.regular) があれば ★ の説明。どちらも無ければ空
 * (紙面に ★ が 1 つも出ないのに ★ の説明を載せない)。
 */
export function buildPrintLegend(highlight: Highlight | null, { showUsual }: { showUsual: boolean }): string[] {
  const items: string[] = [];
  if (highlight) items.push(`太枠 = ${highlight.value}のコマ / 薄い表示 = それ以外`);
  if (showUsual) items.push(USUAL_TEACHER_LEGEND);
  return items;
}

/** そのタブに普段の担当の対応 (ClassEntity.regular) のあるクラスがあるか (★ が出うるか) */
export function hasUsualLinks(classes: ReadonlyArray<{ regular?: { grade?: string } | null }> | undefined): boolean {
  return (classes || []).some(c => !!c.regular?.grade);
}

/**
 * 紙面の講師欄の文字: 「★ + 講師名」だけ (プルダウンの「(その日2/6)」「(NG)」などの
 * 付記は出さない)。★ はプルダウンと同じ普段の担当 (planning.usual.forClass の結果)。
 * 講師が入っていなければ画面の select と同じ「-」
 */
export function printTeacherText(teacher: string | undefined, usualNames: readonly string[]): string {
  if (!teacher) return '-';
  return usualNames.includes(teacher) ? `★${teacher}` : teacher;
}
