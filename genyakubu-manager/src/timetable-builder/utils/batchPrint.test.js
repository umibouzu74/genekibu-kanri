import { describe, expect, it } from 'vitest';
import { batchItemLabel, buildBatchPrintItems } from './batchPrint';

const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
const subjects = ['英語', '数学', '国語'];
const S = (value) => ({ kind: 'subject', value });
const pairs = (items) => items.map(it => `${it.tabId}:${it.highlight ? it.highlight.value : '-'}`);

describe('buildBatchPrintItems (L2h)', () => {
  it('教科ごと: 教科 (科目マスタ順) の中でタブを並べる', () => {
    const items = buildBatchPrintItems({
      tabs,
      selectedTabIds: new Set([1, 2]),
      subjects,
      selectedSubjects: new Set(['英語', '国語']),
      includeNoHighlight: false,
      order: 'subject',
    });
    expect(pairs(items)).toEqual(['1:英語', '2:英語', '1:国語', '2:国語']);
    expect(items[0]).toEqual({ tabId: 1, highlight: S('英語') });
  });

  it('タブごと: タブの中で教科を並べる', () => {
    const items = buildBatchPrintItems({
      tabs,
      selectedTabIds: new Set([1, 2]),
      subjects,
      selectedSubjects: new Set(['英語', '国語']),
      includeNoHighlight: false,
      order: 'tab',
    });
    expect(pairs(items)).toEqual(['1:英語', '1:国語', '2:英語', '2:国語']);
  });

  it('並びはダイアログの順 (タブの並び・科目マスタの順)。選んだ順ではない', () => {
    const items = buildBatchPrintItems({
      tabs,
      selectedTabIds: new Set([3, 1]),
      subjects,
      selectedSubjects: new Set(['国語', '英語']),
      includeNoHighlight: false,
      order: 'subject',
    });
    expect(pairs(items)).toEqual(['1:英語', '3:英語', '1:国語', '3:国語']);
  });

  it('「強調なし」は教科のあと (教科ごとなら最後の束、タブごとならタブの最後)', () => {
    const sel = { tabs, selectedTabIds: new Set([1, 2]), subjects, selectedSubjects: new Set(['数学']), includeNoHighlight: true };
    expect(pairs(buildBatchPrintItems({ ...sel, order: 'subject' }))).toEqual(['1:数学', '2:数学', '1:-', '2:-']);
    expect(pairs(buildBatchPrintItems({ ...sel, order: 'tab' }))).toEqual(['1:数学', '1:-', '2:数学', '2:-']);
  });

  it('枚数はタブ数 × 強調数。どちらかが 0 なら空', () => {
    const all = buildBatchPrintItems({
      tabs, selectedTabIds: new Set([1, 2, 3]), subjects, selectedSubjects: new Set(subjects), includeNoHighlight: true, order: 'subject',
    });
    expect(all).toHaveLength(3 * 4);
    expect(buildBatchPrintItems({
      tabs, selectedTabIds: new Set(), subjects, selectedSubjects: new Set(subjects), includeNoHighlight: false, order: 'subject',
    })).toEqual([]);
    expect(buildBatchPrintItems({
      tabs, selectedTabIds: new Set([1]), subjects, selectedSubjects: new Set(), includeNoHighlight: false, order: 'tab',
    })).toEqual([]);
  });

  it('マスタに無い教科・タブは選ばれていても入れない', () => {
    const items = buildBatchPrintItems({
      tabs, selectedTabIds: new Set([1, 9]), subjects, selectedSubjects: new Set(['英語', '理科']), includeNoHighlight: false, order: 'subject',
    });
    expect(pairs(items)).toEqual(['1:英語']);
  });
});

describe('batchItemLabel', () => {
  it('「タブ × 教科」/「タブ × 強調なし」', () => {
    expect(batchItemLabel('中3', S('国語'))).toBe('中3 × 国語');
    expect(batchItemLabel('中3', null)).toBe('中3 × 強調なし');
  });
});
