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

  it('number 入力の変更で updateGenerationParams を呼ぶ', () => {
    const { updateGenerationParams } = renderPanel({});
    fireEvent.change(screen.getByLabelText('生成する案の数'), { target: { value: '4' } });
    expect(updateGenerationParams).toHaveBeenCalledWith({ numPatterns: 4 });
  });

  it('連続コマ数上限の入力 (E2c) で updateGenerationParams を呼ぶ', () => {
    const { updateGenerationParams } = renderPanel({ maxConsecutivePeriods: 0 });
    expect(screen.getByLabelText('講師の連続コマ数上限')).toHaveValue(0);
    fireEvent.change(screen.getByLabelText('講師の連続コマ数上限'), { target: { value: '3' } });
    expect(updateGenerationParams).toHaveBeenCalledWith({ maxConsecutivePeriods: 3 });
  });

  it('スライダーの変更でも updateGenerationParams を呼ぶ', () => {
    const { updateGenerationParams } = renderPanel({});
    fireEvent.change(screen.getByLabelText('講師 1 人の 1 日コマ数上限 (スライダー)'), {
      target: { value: '10' },
    });
    expect(updateGenerationParams).toHaveBeenCalledWith({ maxDailyHours: 10 });
  });

  it('空入力は無視する (clamp は blur まで待つ)', () => {
    const { updateGenerationParams } = renderPanel({});
    fireEvent.change(screen.getByLabelText('探索回数の上限'), { target: { value: '' } });
    expect(updateGenerationParams).not.toHaveBeenCalled();
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
