import { useProjectContext } from '../../contexts/projectContextValue';
import {
  GENERATION_PARAM_BOUNDS,
  resolveGenerationParams,
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
} from '../../utils/constants';

// E2e: 自動生成 (MRV + バックトラック) のパラメータを UI から調整する。
// project レベルに保存し、未設定時はデフォルト値を表示する。
//
// - numPatterns:   一度に生成する案の数 (多いほど比較しやすいが時間がかかる)
// - maxDailyHours: 講師 1 人あたり 1 日コマ数の上限
// - maxIterations: solver の探索上限 (大きいほど解けやすいが時間がかかる)
export default function GenerationSettings() {
  const { project, updateGenerationParams } = useProjectContext();
  const params = resolveGenerationParams(project);

  const rows = [
    {
      key: 'numPatterns',
      label: '生成する案の数',
      unit: '案',
      help: '「🧙‍♂️ 自動作成」で一度に作る時間割パターンの数。多いほど比較できますが、生成に時間がかかります。',
      step: 1,
    },
    {
      key: 'maxDailyHours',
      label: '講師 1 人の 1 日コマ数上限',
      unit: 'コマ',
      help: '他学年・他タブの担当コマ数も合算した上限。これを超える講師は候補から外れます。',
      step: 1,
    },
    {
      key: 'maxIterations',
      label: '探索回数の上限',
      unit: '回',
      help: 'solver が諦めるまでの試行回数。大きくすると難しい条件でも解けやすくなりますが、生成が長くなります。',
      step: 50000,
    },
  ];

  const handleChange = (key, raw) => {
    if (raw === '') return; // 入力途中の空欄は無視 (blur で clamp)
    updateGenerationParams({ [key]: Number(raw) });
  };

  const handleReset = () => {
    updateGenerationParams({
      numPatterns: DEFAULT_NUM_PATTERNS,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      maxIterations: DEFAULT_MAX_ITERATIONS,
    });
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <h3 className="font-bold text-builder-ink border-b border-builder-border pb-1">
        ⚡ 自動生成の設定
      </h3>
      <div className="bg-builder-info-soft p-2 text-xs text-builder-ink border border-builder-info-border rounded">
        <strong>便利機能:</strong> 「🧙‍♂️ 自動作成」の挙動を調整できます。
        うまく解けない時は「探索回数の上限」を増やす、生成が重い時は「案の数」を減らすと効果的です。
      </div>

      {rows.map((row) => {
        const bounds = GENERATION_PARAM_BOUNDS[row.key];
        const value = params[row.key];
        return (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor={`gen-${row.key}`}
                className="text-sm font-bold text-builder-ink"
              >
                {row.label}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`gen-${row.key}`}
                  type="number"
                  min={bounds.min}
                  max={bounds.max}
                  step={row.step}
                  value={value}
                  aria-label={row.label}
                  onChange={(e) => handleChange(row.key, e.target.value)}
                  className="w-28 border border-builder-border rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-builder-blue"
                />
                <span className="text-xs text-builder-ink-muted w-8">{row.unit}</span>
              </div>
            </div>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={row.step}
              value={value}
              aria-label={`${row.label} (スライダー)`}
              onChange={(e) => handleChange(row.key, e.target.value)}
              className="w-full accent-builder-blue"
            />
            <p className="text-xs text-builder-ink-muted leading-snug">{row.help}</p>
          </div>
        );
      })}

      <div className="pt-2 text-right">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-builder-ink-muted hover:underline"
        >
          ↺ 既定値に戻す
        </button>
      </div>
    </div>
  );
}
