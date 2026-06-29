// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import GenerationSettings from './GenerationSettings';
import { ProjectContext } from '../../contexts/projectContextValue';
import {
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_CONSECUTIVE_PERIODS,
} from '../../utils/constants';

afterEach(cleanup);

function renderPanel(project = {}) {
  const updateGenerationParams = vi.fn();
  render(
    <ProjectContext.Provider value={{ project, updateGenerationParams }}>
      <GenerationSettings />
    </ProjectContext.Provider>,
  );
  return { updateGenerationParams };
}

describe('GenerationSettings', () => {
  it('未設定時はデフォルト値を表示する', () => {
    renderPanel({});
    expect(screen.getByLabelText('生成する案の数')).toHaveValue(DEFAULT_NUM_PATTERNS);
    expect(screen.getByLabelText('講師 1 人の 1 日コマ数上限')).toHaveValue(DEFAULT_MAX_DAILY_HOURS);
    expect(screen.getByLabelText('探索回数の上限')).toHaveValue(DEFAULT_MAX_ITERATIONS);
  });

  it('保存済みの値を表示する', () => {
    renderPanel({ numPatterns: 5, maxDailyHours: 8, maxIterations: 100000 });
    expect(screen.getByLabelText('生成する案の数')).toHaveValue(5);
    expect(screen.getByLabelText('講師 1 人の 1 日コマ数上限')).toHaveValue(8);
  });

  it('number 入力は blur で確定して updateGenerationParams を呼ぶ', () => {
    const { updateGenerationParams } = renderPanel({});
    const input = screen.getByLabelText('生成する案の数');
    fireEvent.change(input, { target: { value: '4' } });
    // 入力途中 (change だけ) では commit しない
    expect(updateGenerationParams).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(updateGenerationParams).toHaveBeenCalledWith({ numPatterns: 4 });
  });

  it('number 入力は blur 時に clamp して確定する (maxIterations を打ち直せる)', () => {
    const { updateGenerationParams } = renderPanel({ maxIterations: 500000 });
    const input = screen.getByLabelText('探索回数の上限');
    // 打ち直し中は draft をそのまま表示 (毎キー clamp されない)
    fireEvent.change(input, { target: { value: '1000000' } });
    expect(input).toHaveValue(1000000);
    fireEvent.blur(input);
    expect(updateGenerationParams).toHaveBeenCalledWith({ maxIterations: 1000000 });
  });

  it('連続コマ数上限の入力 (E2c) は blur で確定する', () => {
    const { updateGenerationParams } = renderPanel({ maxConsecutivePeriods: 0 });
    const input = screen.getByLabelText('講師の連続コマ数上限');
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(updateGenerationParams).toHaveBeenCalledWith({ maxConsecutivePeriods: 3 });
  });

  it('スライダーの変更は即時 updateGenerationParams を呼ぶ', () => {
    const { updateGenerationParams } = renderPanel({});
    fireEvent.change(screen.getByLabelText('講師 1 人の 1 日コマ数上限 (スライダー)'), {
      target: { value: '10' },
    });
    expect(updateGenerationParams).toHaveBeenCalledWith({ maxDailyHours: 10 });
  });

  it('空入力で blur すると commit せず元の値に戻す', () => {
    const { updateGenerationParams } = renderPanel({ maxIterations: 500000 });
    const input = screen.getByLabelText('探索回数の上限');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(updateGenerationParams).not.toHaveBeenCalled();
    expect(input).toHaveValue(500000);
  });

  it('「既定値に戻す」で 3 パラメータをデフォルトへ', () => {
    const { updateGenerationParams } = renderPanel({ numPatterns: 6, maxDailyHours: 12 });
    fireEvent.click(screen.getByText('↺ 既定値に戻す'));
    expect(updateGenerationParams).toHaveBeenCalledWith({
      numPatterns: DEFAULT_NUM_PATTERNS,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      maxConsecutivePeriods: DEFAULT_MAX_CONSECUTIVE_PERIODS,
    });
  });
});
