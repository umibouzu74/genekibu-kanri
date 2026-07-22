import { describe, expect, it } from 'vitest';
import { computePresetRenameSyncIds, presetSessionLabel } from './presetRenameSync';

const session = (overrides = {}) => ({
  id: 1,
  date: '7/24(金)',
  teacherName: '堀上',
  label: '',
  memo: '予備校1限',
  startTime: '09:00',
  endTime: '10:10',
  ...overrides,
});

const PRESET = { id: 1, name: '予備校1限', startTime: '09:00', endTime: '10:10' };

describe('presetSessionLabel', () => {
  it('memo 優先、無ければ name (applyPreset と同じ優先順位)', () => {
    expect(presetSessionLabel({ name: '予備校1限' })).toBe('予備校1限');
    expect(presetSessionLabel({ name: '予備校1限', memo: '予備校 / 高2' })).toBe('予備校 / 高2');
    expect(presetSessionLabel({ name: '' })).toBe('');
  });
});

describe('computePresetRenameSyncIds', () => {
  it('旧ラベル + 時刻が一致するセッションの id を返す', () => {
    const sessions = [
      session({ id: 1 }),
      session({ id: 2, date: '7/25(土)', teacherName: '田中' }),
    ];
    expect(computePresetRenameSyncIds(sessions, PRESET)).toEqual([1, 2]);
  });

  it('メモが旧ラベルと違うセッションは対象外 (手書きメモを壊さない)', () => {
    const sessions = [
      session({ id: 1, memo: '予備校1限 (振替)' }),
      session({ id: 2, memo: '' }),
      session({ id: 3 }),
    ];
    expect(computePresetRenameSyncIds(sessions, PRESET)).toEqual([3]);
  });

  it('時刻が違うセッションは同名メモでも対象外 (連鎖リネームの巻き込み防止)', () => {
    // 「予備校1限→2限, 2限→3限」と順に直すとき、先のリネームで
    // 「予備校2限」になったばかりの 1限時刻セッションを、次の
    // 「予備校2限→3限」が巻き込まないことの検証
    const preset2 = { id: 2, name: '予備校2限', startTime: '10:20', endTime: '11:30' };
    const sessions = [
      session({ id: 1, memo: '予備校2限' }), // 1限時刻のままリネーム済み
      session({ id: 2, memo: '予備校2限', startTime: '10:20', endTime: '11:30' }),
    ];
    expect(computePresetRenameSyncIds(sessions, preset2)).toEqual([2]);
  });

  it('endTime の欠落と "" は同値として比較する', () => {
    const preset = { id: 1, name: '朝練', startTime: '07:30', endTime: '' };
    const sessions = [
      session({ id: 1, memo: '朝練', startTime: '07:30', endTime: undefined }),
      session({ id: 2, memo: '朝練', startTime: '07:30', endTime: '08:30' }),
    ];
    expect(computePresetRenameSyncIds(sessions, preset)).toEqual([1]);
  });

  it('時刻なしプリセットは時刻なしセッションのみ対象', () => {
    const preset = { id: 1, name: '会議' };
    const sessions = [
      session({ id: 1, memo: '会議', startTime: undefined, endTime: undefined }),
      session({ id: 2, memo: '会議' }),
    ];
    expect(computePresetRenameSyncIds(sessions, preset)).toEqual([1]);
  });

  it('旧ラベルが空 / sessions が null なら空配列', () => {
    expect(computePresetRenameSyncIds([session()], { name: '' })).toEqual([]);
    expect(computePresetRenameSyncIds(null, PRESET)).toEqual([]);
  });
});
