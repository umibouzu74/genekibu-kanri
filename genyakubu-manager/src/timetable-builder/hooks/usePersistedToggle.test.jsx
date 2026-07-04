// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePersistedToggle } from './usePersistedToggle';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('usePersistedToggle (N2h)', () => {
  it('保存値が無ければ初期値で始まり、変更が localStorage に保存される', () => {
    const { result } = renderHook(() => usePersistedToggle('builder.test_toggle', false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('builder.test_toggle')).toBe('1');
  });

  it('保存値 ("1"/"0") があれば初期値より優先する', () => {
    localStorage.setItem('builder.test_toggle', '1');
    const { result } = renderHook(() => usePersistedToggle('builder.test_toggle', false));
    expect(result.current[0]).toBe(true);

    localStorage.setItem('builder.test_toggle2', '0');
    const { result: r2 } = renderHook(() => usePersistedToggle('builder.test_toggle2', true));
    expect(r2.current[0]).toBe(false);
  });

  it('不正な保存値は無視して初期値を使う', () => {
    localStorage.setItem('builder.test_toggle', 'garbage');
    const { result } = renderHook(() => usePersistedToggle('builder.test_toggle', true));
    expect(result.current[0]).toBe(true);
  });
});
