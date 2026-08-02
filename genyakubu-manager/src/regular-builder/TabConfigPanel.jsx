import { S } from "../styles/common";
import { ALL_GRADES } from "../constants/schools";
import { REGULAR_DAYS } from "./model";
import { nextNumericId } from "../utils/schema";

// ─── タブ設定 (名前 / 学年 / 曜日 / 使う時限 / クラス) ──────────────
// grade は反映時に slot.grade へそのまま入る。クラスの label は slot.cls、
// room はそのクラスの既定教室 (セル側で上書き可)。

const smallBtn = { ...S.btn(false), fontSize: 11, padding: "3px 8px" };

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
    <div
      style={{
        background: "#f8fafe",
        border: "1px solid #d8e0f0",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          タブ名
          <input
            type="text"
            value={tab.name}
            onChange={(e) => updateTab(tab.id, (t) => ({ ...t, name: e.target.value }))}
            style={{ ...S.input, marginTop: 2, display: "block", width: 140 }}
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          学年（反映先コマの学年になります）
          <input
            type="text"
            value={tab.grade}
            onChange={(e) => updateTab(tab.id, (t) => ({ ...t, grade: e.target.value }))}
            placeholder="例: 中3"
            list="regb-grades"
            style={{ ...S.input, marginTop: 2, display: "block", width: 140 }}
          />
        </label>
        <datalist id="regb-grades">
          {ALL_GRADES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>曜日</span>
        {REGULAR_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            style={{ ...S.btn(tab.days.includes(d)), fontSize: 11, padding: "4px 9px" }}
          >
            {d}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>使う時限</span>
        {project.periods.length === 0 && (
          <span style={{ fontSize: 11, color: "#888" }}>
            先に「⚙ 全体設定」で時限を登録してください
          </span>
        )}
        {project.periods.map((per) => (
          <button
            key={per.id}
            type="button"
            onClick={() => togglePeriod(per.id)}
            title={per.time}
            style={{ ...S.btn(tab.periodIds.includes(per.id)), fontSize: 11, padding: "4px 9px" }}
          >
            {per.label}
            {per.time ? ` ${per.time}` : ""}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>クラス（列）と既定教室</span>
        {tab.classes.map((c, idx) => (
          <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              value={c.label}
              onChange={(e) => updateClass(c.id, { label: e.target.value })}
              placeholder="クラス名 (例: S, S/AB, 一般)"
              style={{ ...S.input, width: 150 }}
            />
            <input
              type="text"
              value={c.room}
              onChange={(e) => updateClass(c.id, { room: e.target.value })}
              placeholder="教室 (例: 501)"
              style={{ ...S.input, width: 110 }}
            />
            <button type="button" style={smallBtn} onClick={() => updateTab(tab.id, (t) => ({ ...t, classes: move(t.classes, idx, -1) }))}>↑</button>
            <button type="button" style={smallBtn} onClick={() => updateTab(tab.id, (t) => ({ ...t, classes: move(t.classes, idx, 1) }))}>↓</button>
            <button
              type="button"
              style={{ ...smallBtn, background: "#fde8e8", color: "#c03030" }}
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
            style={smallBtn}
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

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          style={{ ...smallBtn, background: "#fde8e8", color: "#c03030" }}
          onClick={onRemoveTab}
        >
          このタブを削除
        </button>
      </div>
    </div>
  );
}
