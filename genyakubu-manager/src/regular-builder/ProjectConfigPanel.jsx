import { useState } from "react";
import { splitTeacherField } from "../utils/biweekly";
import { isWellFormedTimeRange } from "../utils/timeBulkEdit";
import { nextNumericId } from "../utils/schema";
import { UI } from "./ui";

// ─── プロジェクト設定 (時限プール / 科目 / 講師マスタ) ──────────────
// 講習ビルダーの「⚙️ 設定 > 基本設定」に相当。時限は時刻付きで登録し、
// 各タブは periodIds でこのプールから使う時限を選ぶ。

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

  const chipDeleteBtn =
    "border-0 bg-transparent cursor-pointer text-[10px] text-builder-ink-subtle hover:text-builder-red p-0";

  return (
    <div className="no-print flex flex-col gap-3">
      {/* 時限プール */}
      <div className={UI.panel}>
        <div className={UI.panelHead}>時限（全タブ共通）</div>
        <div className={UI.hint}>
          時刻は「HH:MM-HH:MM」形式。
          学年で時刻が違う場合は「中3 1限」「中12 1限」のように別の時限として登録し、各タブの設定で使う時限を選びます。
        </div>
        {project.periods.map((per, idx) => {
          const bad = per.time.trim() && !isWellFormedTimeRange(per.time);
          return (
            <div key={per.id} className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                value={per.label}
                onChange={(e) => updatePeriod(per.id, { label: e.target.value })}
                placeholder="1限"
                className={`${UI.input} w-28`}
              />
              <input
                type="text"
                value={per.time}
                onChange={(e) => updatePeriod(per.id, { time: e.target.value })}
                placeholder="18:00-18:45"
                className={`${UI.input} w-32 ${bad ? "border-builder-red" : ""}`}
              />
              {bad && <span className="text-[10px] text-builder-red">形式が不正です</span>}
              <button
                type="button"
                className={UI.btn}
                onClick={() => saveProject((p) => ({ ...p, periods: move(p.periods, idx, -1) }))}
              >
                ↑
              </button>
              <button
                type="button"
                className={UI.btn}
                onClick={() => saveProject((p) => ({ ...p, periods: move(p.periods, idx, 1) }))}
              >
                ↓
              </button>
              <button type="button" className={UI.btnDanger} onClick={() => removePeriod(per.id)}>
                削除
              </button>
            </div>
          );
        })}
        <div>
          <button type="button" className={UI.btn} onClick={addPeriod}>
            + 時限を追加
          </button>
        </div>
      </div>

      {/* 科目マスタ */}
      <div className={UI.panel}>
        <div className={UI.panelHead}>科目</div>
        <div className={UI.hint}>
          セルの教科プルダウンの選択肢になります。マスタ外の単発教科はセル側の「✎ 直接入力」でも入力できます。
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {project.subjects.map((s) => (
            <span
              key={s}
              className="text-[11px] bg-builder-info-soft border border-builder-info-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            >
              {s}
              <button
                type="button"
                onClick={() =>
                  saveProject((p) => ({ ...p, subjects: p.subjects.filter((x) => x !== s) }))
                }
                className={chipDeleteBtn}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") addSubject();
            }}
            placeholder="科目を追加"
            className={`${UI.input} w-32`}
          />
          <button type="button" className={UI.btn} onClick={addSubject}>
            追加
          </button>
        </div>
      </div>

      {/* 講師マスタ */}
      <div className={UI.panel}>
        <div className={UI.panelHead}>講師</div>
        <div className={UI.hint}>
          セルの講師プルダウンの選択肢になります。複数講師は「✎ 直接入力」で「·」区切り（全角中点でも可）。
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {project.teachers.map((t) => (
            <span
              key={t.name}
              className="text-[11px] bg-builder-bg border border-builder-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            >
              {t.name}
              <button
                type="button"
                onClick={() =>
                  saveProject((p) => ({ ...p, teachers: p.teachers.filter((x) => x.name !== t.name) }))
                }
                className={chipDeleteBtn}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") addTeacher();
            }}
            placeholder="講師を追加"
            className={`${UI.input} w-32`}
          />
          <button type="button" className={UI.btn} onClick={addTeacher}>
            追加
          </button>
          <button type="button" className={UI.btnBlue} onClick={importTeachers}>
            🔗 本体のコマから取込
          </button>
        </div>
      </div>
    </div>
  );
}
