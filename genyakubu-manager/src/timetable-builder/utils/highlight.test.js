import { describe, expect, it } from 'vitest';
import { cellMatchesHighlight, highlightKeyOf, isHighlightStale, parseHighlightKey } from './highlight';

describe('強調表示のキー (L2g)', () => {
  it('s: は教科、t: は講師', () => {
    expect(parseHighlightKey('s:国語')).toEqual({ kind: 'subject', value: '国語' });
    expect(parseHighlightKey('t:堀上')).toEqual({ kind: 'teacher', value: '堀上' });
  });

  it('空・値なし・知らない接頭辞は強調なし', () => {
    expect(parseHighlightKey('')).toBeNull();
    expect(parseHighlightKey(null)).toBeNull();
    expect(parseHighlightKey(undefined)).toBeNull();
    expect(parseHighlightKey('s:')).toBeNull();
    expect(parseHighlightKey('r:401')).toBeNull();
    // 接頭辞の無い旧形式 (講師名だけ) も強調なし
    expect(parseHighlightKey('堀上')).toBeNull();
  });

  it('値にコロンを含んでも先頭の接頭辞だけを外す', () => {
    expect(parseHighlightKey('s:理科:A')).toEqual({ kind: 'subject', value: '理科:A' });
  });

  it('highlightKeyOf と往復する', () => {
    expect(parseHighlightKey(highlightKeyOf('subject', '数学'))).toEqual({ kind: 'subject', value: '数学' });
    expect(highlightKeyOf('teacher', '田中')).toBe('t:田中');
  });
});

describe('cellMatchesHighlight', () => {
  const entry = { subject: '国語', teacher: '小松' };

  it('教科は科目、講師は講師で比べる', () => {
    expect(cellMatchesHighlight(entry, { kind: 'subject', value: '国語' })).toBe(true);
    expect(cellMatchesHighlight(entry, { kind: 'subject', value: '数学' })).toBe(false);
    expect(cellMatchesHighlight(entry, { kind: 'teacher', value: '小松' })).toBe(true);
    // 講師名と同じ文字の教科は無いが、種類を取り違えない
    expect(cellMatchesHighlight(entry, { kind: 'teacher', value: '国語' })).toBe(false);
  });

  it('空セル・強調なしは一致しない', () => {
    expect(cellMatchesHighlight({}, { kind: 'subject', value: '国語' })).toBe(false);
    expect(cellMatchesHighlight(undefined, { kind: 'subject', value: '国語' })).toBe(false);
    expect(cellMatchesHighlight(entry, null)).toBe(false);
  });
});

describe('isHighlightStale (§M)', () => {
  const project = { subjects: ['英語', '国語'], teachers: [{ name: '堀上' }] };

  it('マスタにある教科・講師なら残す', () => {
    expect(isHighlightStale({ kind: 'subject', value: '国語' }, project)).toBe(false);
    expect(isHighlightStale({ kind: 'teacher', value: '堀上' }, project)).toBe(false);
    expect(isHighlightStale(null, project)).toBe(false);
  });

  it('改名・削除でマスタから消えたら解除する', () => {
    expect(isHighlightStale({ kind: 'subject', value: '理科' }, project)).toBe(true);
    expect(isHighlightStale({ kind: 'teacher', value: '田中' }, project)).toBe(true);
  });
});
