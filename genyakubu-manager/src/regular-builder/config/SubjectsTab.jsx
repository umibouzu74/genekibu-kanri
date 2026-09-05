import { useState } from "react";
import { UI } from "../ui";
import { CHIP_DELETE_BTN, move } from "./shared";

// ⚙ 全体設定 → 📚 科目マスタ
export function SubjectsTab({ project, saveProject }) {
  const [newSubject, setNewSubject] = useState("");

  const addSubject = () => {
    const v = newSubject.trim();
    if (!v) return;
    saveProject((p) =>
      p.subjects.includes(v) ? p : { ...p, subjects: [...p.subjects, v] }
    );
    setNewSubject("");
  };

  return (
    <>
      <div className={UI.hint}>
        セルの教科プルダウンの選択肢になります。マスタ外の単発教科はセル側の「✎ 直接入力」でも入力できます。
        並び順はプルダウンと 📊 集計の列順になります（◂ ▸ で入れ替え）。
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {project.subjects.map((s, idx) => (
          <span
            key={s}
            className="text-[11px] bg-builder-info-soft border border-builder-info-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
          >
            {/* 並べ替え: プルダウンの並び・集計の列順に効く */}
            <button
              type="button"
              disabled={idx === 0}
              onClick={() =>
                saveProject((p) => ({ ...p, subjects: move(p.subjects, idx, -1) }))
              }
              className={`${CHIP_DELETE_BTN} disabled:opacity-25`}
              aria-label={`${s} を前へ`}
              title="前へ"
            >
              ◂
            </button>
            {s}
            <button
              type="button"
              disabled={idx === project.subjects.length - 1}
              onClick={() =>
                saveProject((p) => ({ ...p, subjects: move(p.subjects, idx, 1) }))
              }
              className={`${CHIP_DELETE_BTN} disabled:opacity-25`}
              aria-label={`${s} を後ろへ`}
              title="後ろへ"
            >
              ▸
            </button>
            <button
              type="button"
              onClick={() =>
                saveProject((p) => ({
                  ...p,
                  subjects: p.subjects.filter((x) => x !== s),
                }))
              }
              className={CHIP_DELETE_BTN}
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
    </>
  );
}
