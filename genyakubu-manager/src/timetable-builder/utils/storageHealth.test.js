import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_LIMIT_BYTES,
  STORAGE_WARN_RATIO,
  estimateStorageBytes,
  checkStorageHealth,
  checkOriginStorageHealth,
  measureLocalStorageBytes,
  formatBytes,
} from './storageHealth';

// node 環境には localStorage が無いので、length/key/getItem を持つ最小の
// フェイクを差し込む (measureLocalStorageBytes が使う API のみ)。
function stubLocalStorage(entries) {
  const keys = Object.keys(entries);
  vi.stubGlobal('localStorage', {
    get length() { return keys.length; },
    key: (i) => keys[i] ?? null,
    getItem: (k) => (k in entries ? entries[k] : null),
  });
}

describe('estimateStorageBytes', () => {
  it('null / undefined は 0', () => {
    expect(estimateStorageBytes(null)).toBe(0);
    expect(estimateStorageBytes(undefined)).toBe(0);
  });

  it('文字列は length * 2', () => {
    expect(estimateStorageBytes('abc')).toBe(6);
  });

  it('オブジェクトは JSON.stringify の length * 2', () => {
    const obj = { a: 1 };
    expect(estimateStorageBytes(obj)).toBe(JSON.stringify(obj).length * 2);
  });

  it('循環参照など直列化不能なら 0', () => {
    const a = {};
    a.self = a;
    expect(estimateStorageBytes(a)).toBe(0);
  });
});

describe('checkStorageHealth', () => {
  it('小さなプロジェクトは warn=false', () => {
    const res = checkStorageHealth({ tabs: [] });
    expect(res.warn).toBe(false);
    expect(res.ratio).toBeLessThan(STORAGE_WARN_RATIO);
  });

  it('しきい値を超えたら warn=true', () => {
    // limitBytes を小さくして閾値超過を再現
    const res = checkStorageHealth('xxxx', { limitBytes: 4, warnRatio: 0.5 });
    // 'xxxx' = 4 文字 * 2 = 8 byte, limit 4 → ratio 2.0
    expect(res.bytes).toBe(8);
    expect(res.ratio).toBe(2);
    expect(res.warn).toBe(true);
  });

  it('ちょうど warnRatio で warn=true (>= 判定)', () => {
    const res = checkStorageHealth('xx', { limitBytes: 8, warnRatio: 0.5 });
    // 2 文字 * 2 = 4 byte, limit 8 → ratio 0.5
    expect(res.ratio).toBe(0.5);
    expect(res.warn).toBe(true);
  });

  it('limitBytes=0 でも 0 除算でクラッシュしない', () => {
    const res = checkStorageHealth('x', { limitBytes: 0 });
    expect(res.ratio).toBe(0);
    expect(res.warn).toBe(false);
  });

  it('デフォルト上限は 5MB', () => {
    expect(STORAGE_LIMIT_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('measureLocalStorageBytes / checkOriginStorageHealth (N1g)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('全キーの key + value を UTF-16 換算で合算する', () => {
    stubLocalStorage({ ab: 'cd', e: 'fgh' });
    // (2+2)*2 + (1+3)*2 = 16
    expect(measureLocalStorageBytes()).toBe(16);
  });

  it('builder 以外のキー (親アプリ等) も計上される', () => {
    stubLocalStorage({ 'builder.project': 'x', 'parent-app-data': 'yy' });
    expect(measureLocalStorageBytes()).toBe((15 + 1) * 2 + (15 + 2) * 2);
  });

  it('localStorage にアクセスできない環境では null', () => {
    vi.stubGlobal('localStorage', {
      get length() { throw new Error('denied'); },
      key: () => null,
      getItem: () => null,
    });
    expect(measureLocalStorageBytes()).toBeNull();
    expect(checkOriginStorageHealth()).toBeNull();
  });

  it('checkOriginStorageHealth は実測合計でしきい値判定する', () => {
    stubLocalStorage({ big: 'x'.repeat(100) });
    const health = checkOriginStorageHealth({ limitBytes: 200, warnRatio: 0.5 });
    expect(health.bytes).toBe((3 + 100) * 2);
    expect(health.warn).toBe(true);
    const ok = checkOriginStorageHealth({ limitBytes: 10000, warnRatio: 0.5 });
    expect(ok.warn).toBe(false);
  });
});

describe('formatBytes', () => {
  it('0 以下は 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('1KB 未満は B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('1KB〜1MB は KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('1MB 以上は MB', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
