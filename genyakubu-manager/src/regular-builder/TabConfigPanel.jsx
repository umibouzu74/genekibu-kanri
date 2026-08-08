import { ALL_GRADES } from "../constants/schools";
import { REGULAR_DAYS } from "./model";
import { nextNumericId } from "../utils/schema";
import { UI } from "./ui";

// ─── タブ設定 (名前 / 学年 / 曜日 / 使う時限 / クラス) ──────────────
// grade は反映時に slot.grade へそのまま入る。クラスの label は slot.cls、
// room はそのクラスの既定教室 (曜日別 roomByDay → セル側の順で上書き可)。
// 「曜日別」の入力列が列 × 曜日の教室一覧を兼ねる (点検・修復用)。

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

  // 曜日別の既定教室 (roomByDay)。空欄 = 基本の教室どおり。「木曜だけ
  // 亀63」のような曜日で違う教室をここで管理する (曜日ビューの列見出し
  // からも変更でき、その場合は ＊ 印が付く)
  const setDayRoom = (c, d, value) => {
    const byDay = { ...(c.roomByDay || {}) };
    if (value) byDay[d] = value;
    else delete byDay[d];
    updateClass(c.id, {
      roomByDay: Object.keys(byDay).length ? byDay : undefined,
    });
  };

  return (
    <div className="no-print bg-builder-surface border border-builder-info-border rounded-lg p-3.5 flex flex-col gap-2.5">
      <div className="flex gap-3 flex-wrap">
        <label className="text-xs font-bold text-builder-ink">
          表示名（チップ・表の見出しに出ます）
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
        <label className="text-xs font-bold text-builder-ink">
          グループ（表のまとまり・任意）
          <input
            type="text"
            value={tab.group || ""}
            onChange={(e) => updateTab(tab.id, (t) => ({ ...t, group: e.target.value }))}
            placeholder="例: 高校部・本校"
            list="regb-groups"
            className={`${UI.input} mt-0.5 block w-40 font-normal`}
          />
          <span className="block text-[10px] font-normal text-builder-ink-subtle leading-relaxed mt-0.5">
            同じグループ名の学年が 1 つの表にまとまります。空欄なら「時限が重なる学年」と自動で同居します。
          </span>
        </label>
        <datalist id="regb-grades">
          {ALL_GRADES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <datalist id="regb-groups">
          {[...new Set(project.tabs.map((t) => (t.group || "").trim()).filter(Boolean))].map(
            (g) => (
              <option key={g} value={g} />
            )
          )}
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
        {tab.days.length > 0 && (
          <span className="text-[10px] text-builder-ink-subtle leading-relaxed">
            「曜日別」は曜日で教室が違うときだけ入力します（空欄 =
            基本の教室どおり）。ここで曜日ごとの教室を一覧で点検・修正できます。
          </span>
        )}
        {tab.classes.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
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
              list="regb-rooms"
              className={`${UI.input} w-28`}
            />
            {tab.days.length > 0 && (
              <span className="inline-flex items-center gap-1 flex-wrap text-[10px] text-builder-ink-subtle">
                曜日別:
                {tab.days.map((d) => (
                  <label key={d} className="inline-flex items-center gap-0.5">
                    {d}
                    <input
                      type="text"
                      value={(c.roomByDay || {})[d] || ""}
                      onChange={(e) => setDayRoom(c, d, e.target.value)}
                      placeholder={c.room || "－"}
                      list="regb-rooms"
                      aria-label={`${c.label || c.room || "列"} の${d}曜の教室`}
                      className={`${UI.input} w-16`}
                    />
                  </label>
                ))}
              </span>
            )}
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
          この学年を削除
        </button>
      </div>
    </div>
  );
}
