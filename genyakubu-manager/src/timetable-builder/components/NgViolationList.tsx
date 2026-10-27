import { useState } from 'react';
import { describeNgViolation, type NgViolationItem } from '../utils/ngViolations';

// NG に当たっている割当の一覧 (2026-10-27)。⚠ の内訳 (Toolbar) と ⚙ 講師不在・NG
// の両方で使う。行の「→」でそのセルへ (別のタブなら切り替えて) 飛ぶ。
// 理由 (他学年セッションのメモと時刻・手動NG・出勤可能調査) を行に書く
// (tooltip だけにしない — 一覧を眺めて直す道具なので)。
export default function NgViolationList({
  items,
  onJump,
  activeTabId = null,
  initialLimit = 5,
}: {
  items: NgViolationItem[];
  onJump: (item: NgViolationItem) => void;
  /** 今のタブ。このタブの行はタブ名を省く */
  activeTabId?: number | null;
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initialLimit);
  return (
    <ul className="space-y-1">
      {shown.map(item => {
        const text = describeNgViolation(item, { withTab: item.tabId !== activeTabId });
        return (
          <li key={`${item.tabId}:${item.key}`} className="flex items-start justify-between gap-2">
            <span className="flex-1 min-w-0">
              <span className="font-bold text-builder-ink">{text}</span>
              {item.reasons.length > 0 && (
                <span className="block text-builder-red">NG: {item.reasons.join(' / ')}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onJump(item)}
              aria-label={`${text} のセルへ移動`}
              className="shrink-0 px-1.5 py-0.5 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
              title={item.tabId !== activeTabId ? `「${item.tabName}」のタブに切り替えてセルへ移動` : 'このセルへ移動'}
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
            className="italic underline text-builder-blue hover:text-builder-blue-hover"
          >
            {expanded ? '▲ 折りたたむ' : `▼ 他 ${items.length - initialLimit} 件を表示`}
          </button>
        </li>
      )}
    </ul>
  );
}
