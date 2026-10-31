import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { usePlanning } from '../../contexts/planningContextValue';
import type { DayStreakRule } from '../../types';

// 連続出勤日数の上限 (B2 2026-10-31)。「予備校部の先生は中1・2 の夜 (18:30〜) に
// 3 日以上続けて入れない」を 1 行のルールで書く。暦日で数える (日曜をはさむと
// 途切れる)。違反は ⚠ の一覧に出し、自動作成でも制約として扱う
const CATEGORY_LABEL: Record<string, string> = {
  'genyaku-fulltime': '現役部 常勤',
  'genyaku-parttime': '現役部 非常勤',
  yobiko: '予備校部',
};

export default function DayStreakRulesEditor() {
  const { project, setDayStreakRules } = useProjectContext();
  const { streakViolations } = usePlanning();
  const rules = project.dayStreakRules || [];
  const [open, setOpen] = useState(rules.length > 0);
  const save = (next: DayStreakRule[]) => setDayStreakRules(next);
  const update = (id: number, patch: Partial<DayStreakRule>) =>
    save(rules.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const id = rules.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    save([...rules, { id, categories: ['yobiko'], tabIds: null, fromTime: '18:30', maxDays: 2 }]);
    setOpen(true);
  };
  const inputCls = 'border border-builder-border rounded px-1 py-0.5 text-xs bg-builder-surface';
  return (
    <section aria-label="連続出勤日数の上限" className="text-xs border border-builder-border rounded p-2 mb-2 space-y-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="font-bold">
          {open ? '▼' : '▶'} 📅 連続出勤日数の上限 ({rules.length})
        </button>
        <button type="button" onClick={add} className="px-2 py-0.5 border border-builder-border rounded hover:bg-builder-info-soft">
          ＋ ルールを足す
        </button>
        {streakViolations.length > 0 && (
          <span className="text-builder-red font-bold">⚠ 違反 {streakViolations.length} 件</span>
        )}
      </div>
      {open && (
        <>
          <p className="text-builder-ink-muted">
            対象の講師が、選んだタブ・時間帯に暦日で何日続けて入れるか。日曜など授業の無い日をはさむと途切れます。
          </p>
          {rules.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-1 border-t border-builder-border pt-1">
              <span>対象</span>
              {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={(r.categories || []).includes(key)}
                    onChange={(e) =>
                      update(r.id, {
                        categories: e.target.checked
                          ? [...(r.categories || []), key]
                          : (r.categories || []).filter(c => c !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              <input
                aria-label="対象の講師 (名前を「・」で)"
                placeholder="講師名 (・区切り)"
                defaultValue={(r.teachers || []).join('・')}
                onBlur={(e) =>
                  update(r.id, { teachers: e.target.value.split(/[・,、\s]+/).map(x => x.trim()).filter(Boolean) })
                }
                className={`${inputCls} w-28`}
              />
              <span>タブ</span>
              <select
                aria-label="数えるタブ"
                value={r.tabIds && r.tabIds.length === 1 ? String(r.tabIds[0]) : ''}
                onChange={(e) => update(r.id, { tabIds: e.target.value ? [Number(e.target.value)] : null })}
                className={inputCls}
              >
                <option value="">全部</option>
                {project.tabs.map(t => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
              <span>時間帯</span>
              <input
                aria-label="この時刻から"
                defaultValue={r.fromTime || ''}
                placeholder="18:30"
                onBlur={(e) => update(r.id, { fromTime: e.target.value.trim() })}
                className={`${inputCls} w-14`}
              />
              〜
              <input
                aria-label="この時刻まで"
                defaultValue={r.toTime || ''}
                placeholder="(終わりまで)"
                onBlur={(e) => update(r.id, { toTime: e.target.value.trim() })}
                className={`${inputCls} w-16`}
              />
              <span>に</span>
              <input
                type="number"
                min={1}
                aria-label="続けて入れる日数の上限"
                value={r.maxDays}
                onChange={(e) => update(r.id, { maxDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                className={`${inputCls} w-12 text-right`}
              />
              <span>日まで続けて入れる</span>
              <button
                type="button"
                onClick={() => save(rules.filter(x => x.id !== r.id))}
                aria-label="このルールを消す"
                className="ml-auto text-builder-ink-muted hover:text-builder-red"
              >×</button>
            </div>
          ))}
          {streakViolations.length > 0 && (
            <ul className="text-builder-red space-y-0.5">
              {streakViolations.map(v => (
                <li key={`${v.ruleId}-${v.teacher}-${v.dateLabels[0]}`}>
                  {v.teacher}: {v.dateLabels.join('・')} の {v.dateLabels.length} 日続けて (上限 {v.maxDays} 日)
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
