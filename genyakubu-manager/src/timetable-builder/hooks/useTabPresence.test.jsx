// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useTabPresence } from './useTabPresence';

// 同一プロセス内で複数タブを模す簡易 BroadcastChannel。同名チャネルの
// インスタンス同士に postMessage を配送する (自分自身には配送しない)。
const registry = new Map();

class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    const list = registry.get(name) || [];
    list.push(this);
    registry.set(name, list);
  }

  postMessage(data) {
    if (this.closed) return;
    const list = registry.get(this.name) || [];
    for (const ch of list) {
      if (ch !== this && !ch.closed && ch.onmessage) {
        ch.onmessage({ data });
      }
    }
  }

  close() {
    this.closed = true;
    const list = registry.get(this.name) || [];
    registry.set(this.name, list.filter((c) => c !== this));
  }
}

function Tab({ onConflict }) {
  useTabPresence(onConflict);
  return null;
}

describe('useTabPresence', () => {
  beforeEach(() => {
    registry.clear();
    window.BroadcastChannel = FakeBroadcastChannel;
  });

  afterEach(() => {
    cleanup();
    delete window.BroadcastChannel;
  });

  it('単一タブだけなら onConflict は呼ばれない', () => {
    const onConflict = vi.fn();
    render(<Tab onConflict={onConflict} />);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('2 タブ目が開くと両タブで onConflict が一度ずつ発火する', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = render(<Tab onConflict={first} />);
    // 2 つ目のタブを別 root にマウント
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<Tab onConflict={second} />, { container });

    // 2 つ目の hello を受けて 1 つ目が警告 + ack、ack を受けて 2 つ目も警告
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    a.unmount();
    document.body.removeChild(container);
  });

  it('onConflict はセッション中 1 回だけ (3 タブ目でも 1 回)', () => {
    const first = vi.fn();
    render(<Tab onConflict={first} />);
    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    render(<Tab onConflict={vi.fn()} />, { container: c2 });
    const c3 = document.createElement('div');
    document.body.appendChild(c3);
    render(<Tab onConflict={vi.fn()} />, { container: c3 });
    // 1 つ目は 2 つ目・3 つ目の hello を両方受けるが警告は 1 回のみ
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('BroadcastChannel 非対応環境では何もしない (クラッシュしない)', () => {
    delete window.BroadcastChannel;
    const onConflict = vi.fn();
    expect(() => render(<Tab onConflict={onConflict} />)).not.toThrow();
    expect(onConflict).not.toHaveBeenCalled();
  });
});
