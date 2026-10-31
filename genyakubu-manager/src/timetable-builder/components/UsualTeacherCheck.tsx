import { useMemo, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUsualTeachers } from '../contexts/planningContextValue';
import { useJumpToCell } from '../hooks/useJumpToCell';
import { computeUsualMismatches } from '../utils/usualTeachersIndex';

// 普段の担当と違うセルの一覧 (B1)。前の講習の時間割を写した後の点検に使う
// (去年の中1 の担当が今年は中2 の担当、のように 1 学年ずれるため)。
// 「→」でそのセルへ (別のタブなら切り替えて) 飛ぶ
export function UsualTeacherCheck({ initialLimit = 8 }: { initialLimit?: number }) {
  const { project } = useProjectContext();
  const index = useUsualTeachers();
  const jump = useJumpToCell();
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => computeUsualMismatches(project, index), [project, index]);
  if (!index.hasLinks) return null;
  const shown = expanded ? items : items.slice(0, initialLimit);
  return (
    <section aria-label="普段の担当と違うセル" className="text-xs space-y-1 mt-2">
      <div className="font-bold text-builder-ink-muted">
        👥 普段の担当と違うセル: {items.length === 0 ? 'ありません' : `${items.length} 件`}
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {shown.map(it => {
            const text = `${it.tabId !== project.activeTabId ? `「${it.tabName}」` : ''}${it.dateLabel} ${it.periodLabel} ${it.classLabel} ${it.subject} ${it.teacher}`;
            return (
              <li key={`${it.tabId}:${it.key}`} className="flex items-start justify-between gap-2">
                <span className="flex-1 min-w-0">
                  <span className="font-bold text-builder-ink">{text}</span>
                  <span className="block text-builder-ink-muted">普段: {it.usual.join('・')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => jump(it.tabId, it.key)}
                  aria-label={`${text} のセルへ移動`}
                  className="shrink-0 px-1.5 py-0.5 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
                >→</button>
              </li>
            );
          })}
          {items.length > initialLimit && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className="italic underline text-builder-blue"
              >
                {expanded ? '▲ 折りたたむ' : `▼ 他 ${items.length - initialLimit} 件を表示`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
