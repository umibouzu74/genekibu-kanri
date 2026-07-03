import { useState, useEffect } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import {
  GENERATION_PARAM_BOUNDS,
  clampGenerationParam,
  resolveGenerationParams,
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_CONSECUTIVE_PERIODS,
  DEFAULT_GENERATION_SEED,
} from '../../utils/constants';

// 1 パラメータの行 (number 入力 + スライダー + 説明)。
// number 入力はローカル draft を持ち、入力中は自由に編集できる。確定 (blur /
// Enter) で clamp して commit する。こうしないと controlled value が毎キー
// 入力で clamp されてしまい、特に maxIterations (min 50000) のような大きい
// 下限の値を打ち直せない (review F1)。スライダーは即時 commit で問題ない。
function ParamRow({ row, bounds, value, onCommit }) {
  const [draft, setDraft] = useState(String(value));

  // 外部要因 (リセットボタン等) で value が変わったら draft を同期する。
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    if (draft.trim() === '') { setDraft(String(value)); return; }
    const clamped = clampGenerationParam(row.key, Number(draft));
    setDraft(String(clamped));
    onCommit(row.key, clamped);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`gen-${row.key}`} className="text-sm font-bold text-builder-ink">
          {row.label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={`gen-${row.key}`}
            type="number"
            min={bounds.min}
            max={bounds.max}
            step={row.step}
            value={draft}
            aria-label={row.label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-28 border border-builder-border rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-builder-blue"
          />
          <span className="text-xs text-builder-ink-muted w-8">{row.unit}</span>
        </div>
      </div>
      {/* seed のような広レンジ値はスライダーで操作できないので省く (L1e) */}
      {!row.noSlider && (
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={row.step}
          value={value}
          aria-label={`${row.label} (スライダー)`}
          onChange={(e) => onCommit(row.key, Number(e.target.value))}
          className="w-full accent-builder-blue"
        />
      )}
      <p className="text-xs text-builder-ink-muted leading-snug">{row.help}</p>
    </div>
  );
}

// E2e: 自動生成 (MRV + バックトラック) のパラメータを UI から調整する。
// project レベルに保存し、未設定時はデフォルト値を表示する。
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
      key: 'maxConsecutivePeriods',
      label: '講師の連続コマ数上限',
      unit: 'コマ',
      help: '同じ講師が連続して担当できる時限数の上限。0 にすると制限なし（連続を許可）。',
      step: 1,
    },
    {
      key: 'maxIterations',
      label: '探索回数の上限',
      unit: '回',
      help: 'solver が諦めるまでの試行回数の合計。内部では複数回の仕切り直し (リスタート) に分割して使い、上限を大きくすると 1 回あたりの探索も深くなります。難しい条件で解けやすくなる代わりに生成が長くなります。',
      step: 50000,
    },
    {
      key: 'generationSeed',
      label: '乱数 seed (0 = 毎回ランダム)',
      unit: '',
      help: '同じ seed と同じ設定なら同じ案を再現できます。結果パネルに表示される「seed」の値をここに入力すると、その時の生成をやり直せます。',
      step: 1,
      noSlider: true,
    },
  ];

  const handleCommit = (key, num) => {
    updateGenerationParams({ [key]: num });
  };

  const handleReset = () => {
    updateGenerationParams({
      numPatterns: DEFAULT_NUM_PATTERNS,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      maxConsecutivePeriods: DEFAULT_MAX_CONSECUTIVE_PERIODS,
      generationSeed: DEFAULT_GENERATION_SEED,
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

      {rows.map((row) => (
        <ParamRow
          key={row.key}
          row={row}
          bounds={GENERATION_PARAM_BOUNDS[row.key]}
          value={params[row.key]}
          onCommit={handleCommit}
        />
      ))}

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
