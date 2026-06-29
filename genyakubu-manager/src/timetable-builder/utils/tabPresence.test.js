import { describe, expect, it } from 'vitest';
import { TAB_PRESENCE_CHANNEL, interpretPresenceMessage } from './tabPresence';

describe('interpretPresenceMessage', () => {
  const self = 'self-1';

  it('自分自身の hello は無視', () => {
    expect(interpretPresenceMessage({ type: 'hello', id: self }, self)).toEqual({
      conflict: false,
      shouldAck: false,
    });
  });

  it('他タブの hello は conflict + shouldAck', () => {
    expect(interpretPresenceMessage({ type: 'hello', id: 'other' }, self)).toEqual({
      conflict: true,
      shouldAck: true,
    });
  });

  it('他タブの ack は conflict のみ (ack 返信不要)', () => {
    expect(interpretPresenceMessage({ type: 'ack', id: 'other' }, self)).toEqual({
      conflict: true,
      shouldAck: false,
    });
  });

  it('自分の ack は無視', () => {
    expect(interpretPresenceMessage({ type: 'ack', id: self }, self)).toEqual({
      conflict: false,
      shouldAck: false,
    });
  });

  it('id 欠落 / 不正なメッセージは無視', () => {
    expect(interpretPresenceMessage({ type: 'hello' }, self).conflict).toBe(false);
    expect(interpretPresenceMessage(null, self).conflict).toBe(false);
    expect(interpretPresenceMessage('x', self).conflict).toBe(false);
    expect(interpretPresenceMessage({ id: 'other' }, self).conflict).toBe(false);
  });

  it('未知の type は無視', () => {
    expect(interpretPresenceMessage({ type: 'bye', id: 'other' }, self).conflict).toBe(false);
  });

  it('チャネル名は固定', () => {
    expect(TAB_PRESENCE_CHANNEL).toBe('builder.tab_presence');
  });
});
