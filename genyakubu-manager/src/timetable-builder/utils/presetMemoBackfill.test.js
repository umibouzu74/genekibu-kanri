import { describe, expect, it } from 'vitest';
import { computePresetMemoBackfill } from './presetMemoBackfill';

// カレンダー順のプール (期間判定用)
const POOL = [
  { id: 1, label: '7/24(金)' },
  { id: 2, label: '7/25(土)' },
  { id: 3, label: '7/26(日)' },
];

const session = (overrides = {}) => ({
  id: 1,
  date: '7/24(金)',
  teacherName: '堀上',
  label: '12:25-13:35',
  memo: '',
  startTime: '12:25',
  endTime: '13:35',
  ...overrides,
});

describe('computePresetMemoBackfill', () => {
  it('時刻が一致する唯一のプリセットに割り当て、メモはプリセット名 (memo 優先)', () => {
    const presets = [
      { id: 1, name: '予備校（昼）', startTime: '12:25', endTime: '13:35' },
      { id: 2, name: '高校', startTime: '18:00', endTime: '19:00' },
    ];
    const r = computePresetMemoBackfill([session()], presets, POOL);
    expect(r.assignments).toEqual([{ sessionId: 1, memo: '予備校（昼）', presetName: '予備校（昼）' }]);
    expect(r.ambiguousCount).toBe(0);
    expect(r.noMatchCount).toBe(0);
    // memo 付きプリセットは applyPreset と同じく memo を優先
    const withMemo = computePresetMemoBackfill(
      [session()],
      [{ id: 1, name: '予備校（昼）', startTime: '12:25', endTime: '13:35', memo: '予備校 / 高2' }],
      POOL,
    );
    expect(withMemo.assignments[0].memo).toBe('予備校 / 高2');
  });

  it('endTime の不一致・欠落の食い違いはマッチしない (欠落と "" は同値)', () => {
    const r = computePresetMemoBackfill(
      [session({ endTime: undefined })],
      [{ id: 1, name: 'A', startTime: '12:25', endTime: '13:35' }],
      POOL,
    );
    expect(r.assignments).toEqual([]);
    expect(r.noMatchCount).toBe(1);
    // 双方 endTime なしはマッチする
    const both = computePresetMemoBackfill(
      [session({ endTime: undefined })],
      [{ id: 1, name: 'A', startTime: '12:25', endTime: '' }],
      POOL,
    );
    expect(both.assignments).toHaveLength(1);
  });

  it('メモ済みセッションと時刻なしセッションは対象外', () => {
    const presets = [{ id: 1, name: 'A', startTime: '12:25', endTime: '13:35' }];
    const withMemo = computePresetMemoBackfill([session({ memo: '手入力' })], presets, POOL);
    expect(withMemo.assignments).toEqual([]);
    expect(withMemo.noMatchCount).toBe(0); // メモ済みはカウントもしない
    const noTime = computePresetMemoBackfill(
      [session({ startTime: undefined, endTime: undefined, label: '' })], presets, POOL,
    );
    expect(noTime.assignments).toEqual([]);
    expect(noTime.noMatchCount).toBe(1);
  });

  it('同時刻のプリセットが複数あると判別不能 (ambiguous) としてスキップ', () => {
    const presets = [
      { id: 1, name: '予備校', startTime: '12:25', endTime: '13:35' },
      { id: 2, name: '高校', startTime: '12:25', endTime: '13:35' },
    ];
    const r = computePresetMemoBackfill([session()], presets, POOL);
    expect(r.assignments).toEqual([]);
    expect(r.ambiguousCount).toBe(1);
  });

  it('同時刻でも対象講師リストで 1 つに絞れれば割り当てる (N4c の講師付きプリセット)', () => {
    const presets = [
      { id: 1, name: '予備校', startTime: '12:25', endTime: '13:35', teachers: ['堀上'] },
      { id: 2, name: '高校', startTime: '12:25', endTime: '13:35', teachers: ['田中'] },
    ];
    const r = computePresetMemoBackfill([session()], presets, POOL);
    expect(r.assignments).toEqual([{ sessionId: 1, memo: '予備校', presetName: '予備校' }]);
  });

  it('プリセットの期間がセッション日付を明確に除外する場合は候補から外れる', () => {
    const presets = [
      { id: 1, name: '1期', startTime: '12:25', endTime: '13:35', startDateLabel: '7/24(金)', endDateLabel: '7/25(土)' },
      { id: 2, name: '2期', startTime: '12:25', endTime: '13:35', startDateLabel: '7/26(日)' }, // 単日
    ];
    // 7/26 のセッション → 1期は期間外、2期 (単日一致) が採用される
    const r = computePresetMemoBackfill([session({ date: '7/26(日)' })], presets, POOL);
    expect(r.assignments).toEqual([{ sessionId: 1, memo: '2期', presetName: '2期' }]);
    // 7/24 のセッション → 2期 (単日 7/26) は除外、1期が採用される
    const r2 = computePresetMemoBackfill([session({ date: '7/24(金)' })], presets, POOL);
    expect(r2.assignments[0].presetName).toBe('1期');
  });

  it('期間ラベルがプールで解決できない場合は除外しない (時刻一致を優先)', () => {
    const presets = [
      { id: 1, name: '旧期間', startTime: '12:25', endTime: '13:35', startDateLabel: '6/1(月)', endDateLabel: '6/5(金)' },
    ];
    const r = computePresetMemoBackfill([session()], presets, POOL);
    expect(r.assignments[0].presetName).toBe('旧期間');
  });

  it('プリセット 0 件のときはメモ未設定 (時刻あり) を noMatch として数えるだけ', () => {
    const r = computePresetMemoBackfill([session(), session({ id: 2, memo: 'x' })], [], POOL);
    expect(r.assignments).toEqual([]);
    expect(r.noMatchCount).toBe(1);
  });
});
