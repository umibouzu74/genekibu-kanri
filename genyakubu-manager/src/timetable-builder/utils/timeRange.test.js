import { describe, expect, it } from 'vitest';
import {
  parseHHmm,
  parseTimeRange,
  getPeriodTimeRange,
  getSessionTimeRange,
  timeRangesOverlap,
  formatHHmm,
} from './timeRange';

describe('parseHHmm', () => {
  it('HH:mm 文字列を分に変換', () => {
    expect(parseHHmm('13:00')).toBe(13 * 60);
    expect(parseHHmm('09:45')).toBe(9 * 60 + 45);
    expect(parseHHmm('0:00')).toBe(0);
    expect(parseHHmm('23:59')).toBe(23 * 60 + 59);
  });

  it('全角コロンも許容', () => {
    expect(parseHHmm('13：00')).toBe(13 * 60);
  });

  it('前後空白を許容', () => {
    expect(parseHHmm('  13:00 ')).toBe(13 * 60);
  });

  it('無効値は null', () => {
    expect(parseHHmm('')).toBeNull();
    expect(parseHHmm(null)).toBeNull();
    expect(parseHHmm(undefined)).toBeNull();
    expect(parseHHmm('13:60')).toBeNull();
    expect(parseHHmm('25:00')).toBe(25 * 60); // 25 時は許容 (深夜表記)
    expect(parseHHmm('99:00')).toBeNull();
    expect(parseHHmm('abc')).toBeNull();
    expect(parseHHmm('13')).toBeNull();
  });
});

describe('parseTimeRange', () => {
  it('「HH:mm~HH:mm」を範囲としてパース', () => {
    expect(parseTimeRange('13:00~13:45')).toEqual({ startMin: 13 * 60, endMin: 13 * 60 + 45 });
    expect(parseTimeRange('12:25-13:35')).toEqual({ startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 });
    expect(parseTimeRange('13:00～13:45')).toEqual({ startMin: 13 * 60, endMin: 13 * 60 + 45 });
  });

  it('「1限 (13:00~13:45)」のような装飾付きでも抽出できる', () => {
    expect(parseTimeRange('1限 (13:00~13:45)')).toEqual({ startMin: 13 * 60, endMin: 13 * 60 + 45 });
    expect(parseTimeRange('予備校 13:00-14:30')).toEqual({ startMin: 13 * 60, endMin: 14 * 60 + 30 });
  });

  it('「HH:mm~」で開始のみは endMin=null', () => {
    expect(parseTimeRange('13:00~')).toEqual({ startMin: 13 * 60, endMin: null });
    expect(parseTimeRange('1限 (13:00~)')).toEqual({ startMin: 13 * 60, endMin: null });
  });

  it('単独 HH:mm は開始のみ扱い', () => {
    expect(parseTimeRange('13:00')).toEqual({ startMin: 13 * 60, endMin: null });
  });

  it('時刻が見つからなければ null', () => {
    expect(parseTimeRange('')).toBeNull();
    expect(parseTimeRange(null)).toBeNull();
    expect(parseTimeRange('1限')).toBeNull();
    expect(parseTimeRange('予備校')).toBeNull();
  });

  it('「区切り→HH:mm」(終了のみ表記) は ambiguous として null', () => {
    // '~14:00' / '-14:00' / '~ 14:00' などは『終了 14:00』の意味で
    // 書かれる可能性が高い。これを開始扱いすると自動NGが反転する。
    expect(parseTimeRange('~14:00')).toBeNull();
    expect(parseTimeRange('-14:00')).toBeNull();
    expect(parseTimeRange('1限 (~14:00)')).toBeNull();
    expect(parseTimeRange('～ 14:00')).toBeNull();
  });
});

describe('getPeriodTimeRange', () => {
  it('構造化フィールドが優先される', () => {
    const period = { id: 1, label: '1限 (13:00~13:45)', startTime: '14:00', endTime: '14:50' };
    expect(getPeriodTimeRange(period)).toEqual({ startMin: 14 * 60, endMin: 14 * 60 + 50 });
  });

  it('構造化フィールド無し: label から自動解析', () => {
    expect(getPeriodTimeRange({ id: 1, label: '1限 (13:00~13:45)' }))
      .toEqual({ startMin: 13 * 60, endMin: 13 * 60 + 45 });
  });

  it('startTime のみあれば endTime=null', () => {
    const period = { id: 1, label: '1限', startTime: '13:00' };
    expect(getPeriodTimeRange(period)).toEqual({ startMin: 13 * 60, endMin: null });
  });

  it('全て無ければ null', () => {
    expect(getPeriodTimeRange({ id: 1, label: '1限' })).toBeNull();
    expect(getPeriodTimeRange(null)).toBeNull();
  });
});

describe('getSessionTimeRange', () => {
  it('構造化フィールドが優先される', () => {
    const s = { id: 1, date: '7/29', teacherName: '堀上', label: '1限', startTime: '12:25', endTime: '13:35' };
    expect(getSessionTimeRange(s)).toEqual({ startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 });
  });

  it('構造化フィールド無し: label から自動解析', () => {
    const s = { id: 1, date: '7/29', teacherName: '堀上', label: '12:25-13:35' };
    expect(getSessionTimeRange(s)).toEqual({ startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 });
  });

  it('時刻情報が一切なければ null', () => {
    expect(getSessionTimeRange({ id: 1, label: '予備校', memo: '' })).toBeNull();
  });
});

describe('timeRangesOverlap', () => {
  it('完全な範囲同士が重なる', () => {
    // [13:00-13:45] vs [12:25-13:35] → overlap (13:00 < 13:35 かつ 12:25 < 13:45)
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: 13 * 60 + 45 },
      { startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 },
    )).toBe(true);
  });

  it('端点接触は非重複', () => {
    // [13:00-13:45] vs [13:45-14:30] → 接触のみ
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: 13 * 60 + 45 },
      { startMin: 13 * 60 + 45, endMin: 14 * 60 + 30 },
    )).toBe(false);
  });

  it('完全分離は非重複', () => {
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: 13 * 60 + 30 },
      { startMin: 14 * 60, endMin: 14 * 60 + 30 },
    )).toBe(false);
  });

  it('片方が開始のみ: その点が他方範囲内なら重複', () => {
    // 13:00 (開始のみ) が [12:25-13:35] 内 → overlap
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: null },
      { startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 },
    )).toBe(true);
    // 14:00 (開始のみ) が [12:25-13:35] 外 → non-overlap
    expect(timeRangesOverlap(
      { startMin: 14 * 60, endMin: null },
      { startMin: 12 * 60 + 25, endMin: 13 * 60 + 35 },
    )).toBe(false);
  });

  it('片方の終了が他方範囲内: その判定は overlap になる', () => {
    // 13:30 (開始のみ) と [13:00-14:00] → 13:30 ∈ [13:00, 14:00) で overlap
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: 14 * 60 },
      { startMin: 13 * 60 + 30, endMin: null },
    )).toBe(true);
  });

  it('双方終了不明: 開始一致のみ重複扱い', () => {
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: null },
      { startMin: 13 * 60, endMin: null },
    )).toBe(true);
    expect(timeRangesOverlap(
      { startMin: 13 * 60, endMin: null },
      { startMin: 13 * 60 + 30, endMin: null },
    )).toBe(false);
  });

  it('null/未取得は非重複扱い', () => {
    expect(timeRangesOverlap(null, { startMin: 0, endMin: 60 })).toBe(false);
    expect(timeRangesOverlap({ startMin: 0, endMin: 60 }, null)).toBe(false);
    expect(timeRangesOverlap(
      { startMin: null, endMin: null },
      { startMin: 0, endMin: 60 },
    )).toBe(false);
  });
});

describe('formatHHmm', () => {
  it('分を HH:mm 文字列に整形', () => {
    expect(formatHHmm(0)).toBe('00:00');
    expect(formatHHmm(13 * 60 + 45)).toBe('13:45');
    expect(formatHHmm(9 * 60 + 5)).toBe('09:05');
  });

  it('null は null', () => {
    expect(formatHHmm(null)).toBeNull();
    expect(formatHHmm(undefined)).toBeNull();
  });
});
