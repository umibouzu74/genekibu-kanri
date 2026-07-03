// 自動生成パラメータ (E2e) のデフォルト・許容範囲・clamp。
//
// constants.js から切り出した無依存モジュール (F5d)。migrateProject
// (scheduleKey.js) が保存値の clamp に使うが、constants.js は
// scheduleKey.parseKey を import しているため、constants.js に置いたままだと
// 循環 import になる (scheduleKey は「無 import」を不変条件にしていた)。
// 既存の import 元互換のため constants.ts から再エクスポートしている。
import type { GenerationParams, GenerationParamKey, Project } from '../types';

// 生成する案の数 / 講師 1 人あたり 1 日コマ数上限 / solver の探索上限。
// project レベルに保存し、未設定時はこのデフォルトを使う。
export const DEFAULT_NUM_PATTERNS = 3;
export const DEFAULT_MAX_DAILY_HOURS = 6;
export const DEFAULT_MAX_ITERATIONS = 500000;
// 講師の連続コマ数上限 (E2c)。0 = 制限なし (既定で従来挙動を維持)。
export const DEFAULT_MAX_CONSECUTIVE_PERIODS = 0;
// 乱数 seed (L1e)。0 = 実行ごとにランダム (既定で従来挙動を維持)。
// 固定すると同じ設定で同じ案を再現できる (solver は seed 決定的)。
export const DEFAULT_GENERATION_SEED = 0;

// 各パラメータの許容範囲。UI の input と reducer の両方で clamp に使う。
export const GENERATION_PARAM_BOUNDS: Record<GenerationParamKey, { min: number; max: number }> = {
  numPatterns: { min: 1, max: 6 },
  maxDailyHours: { min: 1, max: 12 },
  maxIterations: { min: 50000, max: 5000000 },
  maxConsecutivePeriods: { min: 0, max: 8 },
  generationSeed: { min: 0, max: 999999999 },
};

// 値を許容範囲内に丸める。NaN / 非数は min にフォールバック。
export const clampGenerationParam = (key: GenerationParamKey, value: unknown): number => {
  const b = GENERATION_PARAM_BOUNDS[key];
  if (!b) return value as number;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return b.min;
  return Math.max(b.min, Math.min(b.max, n));
};

// project から有効な生成パラメータを取り出す (未設定はデフォルト + clamp)。
export const resolveGenerationParams = (project?: Partial<Project> | null): GenerationParams => ({
  numPatterns: clampGenerationParam('numPatterns', project?.numPatterns ?? DEFAULT_NUM_PATTERNS),
  maxDailyHours: clampGenerationParam('maxDailyHours', project?.maxDailyHours ?? DEFAULT_MAX_DAILY_HOURS),
  maxIterations: clampGenerationParam('maxIterations', project?.maxIterations ?? DEFAULT_MAX_ITERATIONS),
  maxConsecutivePeriods: clampGenerationParam('maxConsecutivePeriods', project?.maxConsecutivePeriods ?? DEFAULT_MAX_CONSECUTIVE_PERIODS),
  generationSeed: clampGenerationParam('generationSeed', project?.generationSeed ?? DEFAULT_GENERATION_SEED),
});
