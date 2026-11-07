// まとめて印刷 (L2h、2026-11-07) の組の並び。1 組 = (タブ, 強調) = 1 枚。
//
// 並びはダイアログに出ている順 (タブはタブの並び、強調は科目マスタの順のあと
// 「強調なし」)。チェックを入れた順ではない。
//   - 'subject' 教科ごとにまとめる (既定): 国語 (中3 → 中1・2 → 直前…) → 数学 (…)。
//     教科の担当者に束で渡せるように
//   - 'tab'     タブごとにまとめる: 中3 (国語 → 数学 …) → 中1・2 (…)
import type { Highlight } from './highlight';

export type BatchPrintOrder = 'subject' | 'tab';

export interface BatchPrintItem {
  tabId: number;
  /** null = 強調なし */
  highlight: Highlight | null;
}

export interface BatchPrintSelection {
  /** プロジェクトのタブ (並び順) */
  tabs: ReadonlyArray<{ id: number }>;
  selectedTabIds: ReadonlySet<number>;
  /** 科目マスタ (並び順) */
  subjects: readonly string[];
  selectedSubjects: ReadonlySet<string>;
  /** 「強調なし」の紙も刷る */
  includeNoHighlight: boolean;
  order: BatchPrintOrder;
}

export function buildBatchPrintItems({
  tabs,
  selectedTabIds,
  subjects,
  selectedSubjects,
  includeNoHighlight,
  order,
}: BatchPrintSelection): BatchPrintItem[] {
  const tabIds = tabs.map(t => t.id).filter(id => selectedTabIds.has(id));
  const highlights: (Highlight | null)[] = [
    ...subjects.filter(s => selectedSubjects.has(s)).map(s => ({ kind: 'subject' as const, value: s })),
    ...(includeNoHighlight ? [null] : []),
  ];
  const items: BatchPrintItem[] = [];
  if (order === 'subject') {
    for (const highlight of highlights) for (const tabId of tabIds) items.push({ tabId, highlight });
  } else {
    for (const tabId of tabIds) for (const highlight of highlights) items.push({ tabId, highlight });
  }
  return items;
}

/** 進捗・確認に出す 1 組の名前 (「中3 × 国語」/「中3 × 強調なし」) */
export function batchItemLabel(tabName: string, highlight: Highlight | null): string {
  return `${tabName} × ${highlight ? highlight.value : '強調なし'}`;
}
