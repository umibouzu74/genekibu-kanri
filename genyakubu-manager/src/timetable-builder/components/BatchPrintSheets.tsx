import { memo, useMemo } from 'react';
import { ProjectContext, useProjectContext } from '../contexts/projectContextValue';
import { buildTabViewContext, globalUsageOf } from '../utils/tabViewContext';
import PrintSheetHeading from './PrintSheetHeading';
import ScheduleTable from './ScheduleTable';
import type { ReactNode } from 'react';
import type { GlobalUsage } from '../utils/analysisHelpers';
import type { BatchPrintItem } from '../utils/batchPrint';

// まとめて印刷 (L2h) の紙面。印刷専用の欄 (画面では隠れる) に、組ごとに見出し +
// 時間割を並べる。タブは切り替えず、TabViewScope でそのタブの値に差し替えて同じ
// ScheduleTable を描く (utils/tabViewContext)。各組は新しいページから
// (builderPrintStyle の .builder-batch-sheet)。描く組は 1 つずつ増える (useBatchPrint)
// ので、描き終えた組は memo で描き直さない。

const NOOP = () => {};

function TabViewScope({ tabId, globalUsage, children }: { tabId: number; globalUsage: GlobalUsage; children: ReactNode }) {
  const base = useProjectContext();
  const value = useMemo(() => buildTabViewContext(base, tabId, globalUsage), [base, tabId, globalUsage]);
  if (!value) return null;
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

const BatchSheet = memo(function BatchSheet({
  item,
  projectName,
  isCompact,
  globalUsage,
}: {
  item: BatchPrintItem;
  projectName: string;
  isCompact: boolean;
  globalUsage: GlobalUsage;
}) {
  return (
    <section
      className="builder-batch-sheet"
      data-tab-id={item.tabId}
      data-highlight-value={item.highlight?.value ?? ''}
    >
      <TabViewScope tabId={item.tabId} globalUsage={globalUsage}>
        <PrintSheetHeading projectName={projectName} highlight={item.highlight} className="mb-2" />
        <ScheduleTable isCompact={isCompact} onContextMenu={NOOP} highlight={item.highlight} printOnly />
      </TabViewScope>
    </section>
  );
});

export default function BatchPrintSheets({
  items,
  projectName,
  isCompact,
}: {
  items: BatchPrintItem[];
  projectName: string;
  isCompact: boolean;
}) {
  const { project } = useProjectContext();
  const globalUsage = useMemo(() => globalUsageOf(project), [project]);
  return (
    <div className="hidden print:block builder-batch-print" aria-hidden="true">
      {items.map((item, i) => (
        <BatchSheet
          // 組は先頭から足すだけ (途中を入れ替えない) ので順番で識別する
          key={i}
          item={item}
          projectName={projectName}
          isCompact={isCompact}
          globalUsage={globalUsage}
        />
      ))}
    </div>
  );
}
