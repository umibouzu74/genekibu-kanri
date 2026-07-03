// 同一ブラウザの複数タブで Builder を同時に開いた時の競合検出 (E6d)。
//
// Builder は localStorage 単独運用なので、同じツールを 2 つのブラウザタブで
// 開くと autosave が相互に上書きし、片方の編集が失われる危険がある。
// BroadcastChannel で「他タブが開いている」ことを検出し、一度だけ警告する。
//
// ここではメッセージ解釈だけを純粋関数に切り出してテスト可能にし、
// チャネル操作は useTabPresence フック側で行う。

export const TAB_PRESENCE_CHANNEL = 'builder.tab_presence';

export interface PresenceMessage {
  type?: string;
  id?: string;
}

// 受信メッセージを解釈し、競合警告すべきか / ack を返すべきかを判定する。
//   conflict: 他タブの存在を検出 (= 警告対象)
//   shouldAck: 新規タブの hello に対して「既に開いている」と返答すべき
export function interpretPresenceMessage(
  msg: PresenceMessage | null | undefined,
  selfId: string,
): { conflict: boolean; shouldAck: boolean } {
  const none = { conflict: false, shouldAck: false };
  if (!msg || typeof msg !== 'object') return none;
  if (!msg.id || msg.id === selfId) return none;
  if (msg.type === 'hello') {
    // 他タブが新規に開いた → こちらの存在を ack で知らせつつ警告する
    return { conflict: true, shouldAck: true };
  }
  if (msg.type === 'ack') {
    // 自分の hello に既存タブが応答 → 既に開いているタブがある
    return { conflict: true, shouldAck: false };
  }
  return none;
}
