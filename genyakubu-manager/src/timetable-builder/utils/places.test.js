import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRAVEL,
  defaultPlaceForPeriodName,
  isDefaultTravelSettings,
  normalizeTravelSettings,
  resolveTravelSettings,
  sessionPlace,
  travelMinutesBetween,
  withMainKameiMinutes,
} from './places';

describe('場所 (places)', () => {
  it('時限の名前から既定の場所: 高校①〜③ = 亀井町、予備校1〜4限 = 本校', () => {
    expect(['高校①', '高校②', '高校③', '高校1'].map(defaultPlaceForPeriodName)).toEqual(['亀井町', '亀井町', '亀井町', '亀井町']);
    expect(['予備校1限', '予備校２限', '予備校３限', '予備校 4限'].map(defaultPlaceForPeriodName)).toEqual(['本校', '本校', '本校', '本校']);
    expect(['高校④', '予備校5限', '', null].map(defaultPlaceForPeriodName)).toEqual(['', '', '', '']);
  });

  it('セッションの場所: place が先。無ければ取り込んだもの (source) だけメモの時限の名前から', () => {
    expect(sessionPlace({ place: '亀井町', memo: '予備校３限' })).toBe('亀井町');
    expect(sessionPlace({ memo: '高1・高2 Ⅱ期 高校②', source: 'seniorKoshu' })).toBe('亀井町');
    expect(sessionPlace({ memo: '高3 Ⅰ期 予備校３限', source: 'seniorKoshu' })).toBe('本校');
    expect(sessionPlace({ memo: '高校②' })).toBe('');
  });

  it('移動時間の設定: 未設定は本校⇄亀井町 30 分・注意 60 分。組は順不同', () => {
    const t = resolveTravelSettings({});
    expect(t).toBe(DEFAULT_TRAVEL);
    expect(travelMinutesBetween(t, '亀井町', '本校')).toBe(30);
    expect(travelMinutesBetween(t, '本校', '本校')).toBeNull();
    expect(travelMinutesBetween(t, '本校', '村上高松')).toBeNull();
    expect(t.cautionMinutes).toBe(60);
    const changed = withMainKameiMinutes(t, 40);
    expect(travelMinutesBetween(changed, '本校', '亀井町')).toBe(40);
    expect(isDefaultTravelSettings(changed)).toBe(false);
    expect(isDefaultTravelSettings(withMainKameiMinutes(changed, 30))).toBe(true);
  });

  it('形の確認: 崩れた組は落とし、本校⇄亀井町が無ければ既定で補う', () => {
    expect(normalizeTravelSettings(null)).toBeNull();
    expect(normalizeTravelSettings({ routes: [{ a: '本校', b: '本校', minutes: 5 }, { a: '本校', b: '亀井町', minutes: -1 }], cautionMinutes: 'x' }))
      .toEqual({ routes: [{ a: '本校', b: '亀井町', minutes: 30 }], cautionMinutes: 60 });
  });
});
