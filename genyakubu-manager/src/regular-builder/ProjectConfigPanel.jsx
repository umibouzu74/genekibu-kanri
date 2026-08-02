import { useState } from "react";
import { S } from "../styles/common";
import { splitTeacherField } from "../utils/biweekly";
import { isWellFormedTimeRange } from "../utils/timeBulkEdit";
import { nextNumericId } from "../utils/schema";

// ─── プロジェクト設定 (時限プール / 科目 / 講師マスタ) ──────────────
// 講習ビルダーの「⚙️ 設定 > 基本設定」に相当。時限は時刻付きで登録し、
// 各タブは periodIds でこのプールから使う時限を選ぶ。

const sectionStyle = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const headStyle = { fontWeight: 800, fontSize: 13 };
const hintStyle = { fontSize: 10, color: "#888" };
const smallBtn = { ...S.btn(false), fontSize: 11, padding: "3px 8px" };

function move(list, idx, delta) {
  const next = [...list];
  const to = idx + delta;
  if (to < 0 || to >= next.length) return list;
  [next[idx], next[to]] = [next[to], next[idx]];
  return next;
}

export function ProjectConfigPanel({ project, saveProject, slots }) {
  const [newSubject, setNewSubject] = useState("");
  const [newTeacher, setNewTeacher] = useState("");

  const updatePeriod = (id, patch) =>
    saveProject((p) => ({
      ...p,
      periods: p.periods.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const addPeriod = () =>
    saveProject((p) => ({
      ...p,
      periods: [
        ...p.periods,
        { id: nextNumericId(p.periods), label: `${p.periods.length + 1}限`, time: "" },
      ],
    }));

  const removePeriod = (id) =>
    saveProject((p) => ({
      ...p,
      periods: p.periods.filter((x) => x.id !== id),
      tabs: p.tabs.map((t) => ({
        ...t,
        periodIds: (t.periodIds || []).filter((pid) => pid !== id),
      })),
    }));

  const addSubject = () => {
    const v = newSubject.trim();
    if (!v) return;
    saveProject((p) =>
      p.subjects.includes(v) ? p : { ...p, subjects: [...p.subjects, v] }
    );
    setNewSubject("");
  };

  const addTeacher = () => {
    const v = newTeacher.trim();
    if (!v) return;
    saveProject((p) =>
      p.teachers.some((t) => t.name === v)
        ? p
        : { ...p, teachers: [...p.teachers, { name: v }] }
    );
    setNewTeacher("");
  };

  // 本体のコマから講師名を取り込む (重複はスキップ)
  const importTeachers = () => {
    const names = new Set();
    for (const s of slots || []) {
      for (const n of splitTeacherField(s.teacher)) names.add(n);
    }
    saveProject((p) => {
      const known = new Set(p.teachers.map((t) => t.name));
      const added = [...names].filter((n) => !known.has(n)).sort();
      if (!added.length) return p;
      return { ...p, teachers: [...p.teachers, ...added.map((name) => ({ name }))] };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 時限プール */}
      <div style={sectionStyle}>
        <div style={headStyle}>時限（全タブ共通）</div>
        <div style={hintStyle}>
          時刻は「HH:MM-HH:MM」形式。
          学年で時刻が違う場合は「中3 1限」「中12 1限」のように別の時限として登録し、各タブの設定で使う時限を選びます。
        </div>
        {project.periods.map((per, idx) => {
          const bad = per.time.trim() && !isWellFormedTimeRange(per.time);
          return (
            <div key={per.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={per.label}
                onChange={(e) => updatePeriod(per.id, { label: e.target.value })}
                placeholder="1限"
                style={{ ...S.input, width: 120 }}
              />
              <input
                type="text"
                value={per.time}
                onChange={(e) => updatePeriod(per.id, { time: e.target.value })}
                placeholder="18:00-18:45"
                style={{ ...S.input, width: 130, ...(bad ? { borderColor: "#c03030" } : {}) }}
              />
              {bad && <span style={{ fontSize: 10, color: "#c03030" }}>形式が不正です</span>}
              <button type="button" style={smallBtn} onClick={() => saveProject((p) => ({ ...p, periods: move(p.periods, idx, -1) }))}>↑</button>
              <button type="button" style={smallBtn} onClick={() => saveProject((p) => ({ ...p, periods: move(p.periods, idx, 1) }))}>↓</button>
              <button
                type="button"
                style={{ ...smallBtn, background: "#fde8e8", color: "#c03030" }}
                onClick={() => removePeriod(per.id)}
              >
                削除
              </button>
            </div>
          );
        })}
        <div>
          <button type="button" style={smallBtn} onClick={addPeriod}>+ 時限を追加</button>
        </div>
      </div>

      {/* 科目マスタ */}
      <div style={sectionStyle}>
        <div style={headStyle}>科目</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {project.subjects.map((s) => (
            <span
              key={s}
              style={{ fontSize: 11, background: "#eef2fa", borderRadius: 10, padding: "3px 8px", display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              {s}
              <button
                type="button"
                onClick={() =>
                  saveProject((p) => ({ ...p, subjects: p.subjects.filter((x) => x !== s) }))
                }
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: "#888", padding: 0 }}
                aria-label={`${s} を削除`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSubject(); }}
            placeholder="科目を追加"
            style={{ ...S.input, width: 130 }}
          />
          <button type="button" style={smallBtn} onClick={addSubject}>追加</button>
        </div>
      </div>

      {/* 講師マスタ */}
      <div style={sectionStyle}>
        <div style={headStyle}>講師</div>
        <div style={hintStyle}>
          セルの講師入力の候補になります。複数講師は「·」区切り（全角中点でも可）。
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {project.teachers.map((t) => (
            <span
              key={t.name}
              style={{ fontSize: 11, background: "#f0f0f0", borderRadius: 10, padding: "3px 8px", display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              {t.name}
              <button
                type="button"
                onClick={() =>
                  saveProject((p) => ({ ...p, teachers: p.teachers.filter((x) => x.name !== t.name) }))
                }
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: "#888", padding: 0 }}
                aria-label={`${t.name} を削除`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newTeacher}
            onChange={(e) => setNewTeacher(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTeacher(); }}
            placeholder="講師を追加"
            style={{ ...S.input, width: 130 }}
          />
          <button type="button" style={smallBtn} onClick={addTeacher}>追加</button>
          <button type="button" style={{ ...smallBtn, background: "#e8eef8", color: "#2a4a8e" }} onClick={importTeachers}>
            🔗 本体のコマから取込
          </button>
        </div>
      </div>
    </div>
  );
}
