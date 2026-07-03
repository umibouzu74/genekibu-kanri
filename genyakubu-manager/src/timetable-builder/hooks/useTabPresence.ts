import { useEffect, useRef } from 'react';
import { TAB_PRESENCE_CHANNEL, interpretPresenceMessage } from '../utils/tabPresence';

/**
 * 同一ブラウザで Builder を複数タブ開いた時に一度だけ onConflict を呼ぶ (E6d)。
 *
 * - BroadcastChannel 非対応環境 (古いブラウザ / 一部 jsdom) では完全に no-op。
 * - マウント時に 'hello' を broadcast。既存タブはそれを受けて 'ack' を返しつつ
 *   onConflict を発火する。新規タブは 'ack' を受けて onConflict を発火する。
 * - onConflict はセッション中 1 回だけ (連打/相互通知でトーストが氾濫しないよう)。
 *
 * @param {() => void} onConflict 競合検出時に一度だけ呼ばれる
 */
export function useTabPresence(onConflict: () => void) {
  // onConflict を ref に逃がし、再生成されても effect を貼り直さない
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
      return undefined;
    }
    // 一意なタブ ID。app runtime では Date.now / Math.random が使える。
    const selfId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let warned = false;
    let channel: BroadcastChannel;
    try {
      channel = new window.BroadcastChannel(TAB_PRESENCE_CHANNEL);
    } catch {
      return undefined;
    }

    const post = (type: string) => {
      try {
        channel.postMessage({ type, id: selfId });
      } catch {
        // チャネルが既に閉じている等は無視
      }
    };

    channel.onmessage = (e) => {
      const { conflict, shouldAck } = interpretPresenceMessage(e?.data, selfId);
      if (shouldAck) post('ack');
      if (conflict && !warned) {
        warned = true;
        onConflictRef.current?.();
      }
    };

    post('hello');

    return () => {
      try {
        channel.close();
      } catch {
        // 閉じる際の例外は無視
      }
    };
  }, []);
}
