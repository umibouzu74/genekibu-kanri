import { ALL_GRADES } from "../constants/schools";
import { REGULAR_DAYS } from "./model";
import { nextNumericId } from "../utils/schema";
import { UI } from "./ui";

// ─── タブ設定 (名前 / 学年 / 曜日 / 使う時限 / クラス) ──────────────
// grade は反映時に slot.grade へそのまま入る。クラスの label は slot.cls、
// room はそのクラスの既定教室 (セル側で上書き可)。

function move(list, idx, delta) {
  const next = [...list];
  const to = idx + delta;
  if (to < 0 || to >= next.length) return list;
  [next[idx], next[to]] = [next[to], next[idx]];
  return next;
}

export function TabConfigPanel({ project, tab, updateTab, onRemoveTab }) {
  const toggleDay = (d) =>
    updateTab(tab.id, (t) => ({
      ...t,
      days: t.days.includes(d)
        ? t.days.filter((x) => x !== d)
        : REGULAR_DAYS.filter((x) => t.days.includes(x) || x === d), // 表示順を維持
    }));

  const togglePeriod = (pid) =>
    updateTab(tab.id, (t) => ({
      ...t,
      periodIds: t.periodIds.includes(pid)
        ? t.periodIds.filter((x) => x !== pid)
        : [...t.periodIds, pid],
    }));

  const updateClass = (cid, patch) =>
    updateTab(tab.id, (t) => ({
      ...t,
      classes: t.classes.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
    }));

  return (
    <div className="bg-builder-surface border border-builder-info-border rounded-lg p-3.5 flex flex-col gap-2.5">
      <div className="flex gap-3 flex-wrap">
        <label className="text-xs font-bold text-builder-ink">
          タブ名
          <input
            type="text"
            value={tab.name}
            onChange={(e) => updateTab(tab.id, (t) => ({ ...t, name: e.target.value }))}
            className={`${UI.input} mt-0.5 block w-36 font-normal`}
          />
        </label>
        <label className="text-xs font-bold text-builder-ink">
          学年（反映先コマの学年になります）
          <input
            type="text"
            value={tab.grade}
            onChange={(e) => updateTab(tab.id, (t) => ({ ...t, grade: e.target.value }))}
            placeholder="例: 中3"
            list="regb-grades"
            className={`${UI.input} mt-0.5 block w-36 font-normal`}
          />
        </label>
        <datalist id="regb-grades">
          {ALL_GRADES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs font-bold text-builder-ink mr-1">曜日</span>
        {REGULAR_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            className={UI.btnToggle(tab.days.includes(d))}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs font-bold text-builder-ink mr-1">使う時限</span>
        {project.periods.length === 0 && (
          <span className="text-[11px] text-builder-ink-subtle">
            先に「⚙ 全体設定」で時限を登録してください
          </span>
        )}
        {project.periods.map((per) => (
          <button
            key={per.id}
            type="button"
            onClick={() => togglePeriod(per.id)}
            title={per.time}
            className={UI.btnToggle(tab.periodIds.includes(per.id))}
          >
            {per.label}
            {per.time ? ` ${per.time}` : ""}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-builder-ink">クラス（列）と既定教室</span>
        {tab.classes.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <input
              type="text"
              value={c.label}
              onChange={(e) => updateClass(c.id, { label: e.target.value })}
              placeholder="クラス名 (例: S, S/AB, 一般)"
              className={`${UI.input} w-40`}
            />
            <input
              type="text"
              value={c.room}
              onChange={(e) => updateClass(c.id, { room: e.target.value })}
              placeholder="教室 (例: 501)"
              className={`${UI.input} w-28`}
            />
            <button
              type="button"
              className={UI.btn}
              onClick={() => updateTab(tab.id, (t) => ({ ...t, classes: move(t.classes, idx, -1) }))}
            >
              ↑
            </button>
            <button
              type="button"
              className={UI.btn}
              onClick={() => updateTab(tab.id, (t) => ({ ...t, classes: move(t.classes, idx, 1) }))}
            >
              ↓
            </button>
            <button
              type="button"
              className={UI.btnDanger}
              onClick={() =>
                updateTab(tab.id, (t) => ({ ...t, classes: t.classes.filter((x) => x.id !== c.id) }))
              }
            >
              削除
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={UI.btn}
            onClick={() =>
              updateTab(tab.id, (t) => ({
                ...t,
                classes: [...t.classes, { id: nextNumericId(t.classes), label: "", room: "" }],
              }))
            }
          >
            + クラスを追加
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className={UI.btnDanger} onClick={onRemoveTab}>
          このタブを削除
        </button>
      </div>
    </div>
  );
}
