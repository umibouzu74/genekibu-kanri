import { useProjectContext } from '../contexts/projectContextValue';
import { buildPrintLegend, buildPrintTitle, formatPrintDateJa, hasUsualLinks } from '../utils/printHeader';
import type { Highlight } from '../utils/highlight';

// 紙面の見出し (L1f + L2g): 「プロジェクト名 — タブ名【強調: 国語】」・印刷日・凡例。
// 個別印刷 (BuilderApp) とまとめて印刷 (BatchPrintSheets) が同じものを出す。タブは
// コンテキストの activeTab (まとめて印刷では TabViewScope が差し替えたタブ)。
// ★ の説明は、そのタブに普段のクラスの対応 (ClassEntity.regular) があるときだけ
export default function PrintSheetHeading({
  projectName,
  highlight,
  className = '',
}: {
  projectName: string;
  highlight: Highlight | null;
  className?: string;
}) {
  const { activeTab, currentConfig } = useProjectContext();
  const legend = buildPrintLegend(highlight, { showUsual: hasUsualLinks(currentConfig.classes) });
  return (
    <div className={`builder-print-heading ${className}`} aria-hidden="true">
      <div className="text-lg font-bold text-builder-ink">
        {buildPrintTitle(projectName, activeTab?.name, highlight)}
      </div>
      <div className="text-xs text-builder-ink-muted">印刷日: {formatPrintDateJa(new Date())}</div>
      {legend.length > 0 && (
        <div className="text-xs text-builder-ink builder-print-legend">{legend.join('　')}</div>
      )}
    </div>
  );
}
