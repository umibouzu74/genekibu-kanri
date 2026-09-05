import { useMemo, useState } from "react";
import { isWellFormedTimeRange } from "../../utils/timeBulkEdit";
import { useToasts } from "../../hooks/useToasts";
import { REGULAR_DAYS } from "../model";
import { sortTeachersByKana } from "../teacherOrder";
import { UI } from "../ui";
import { CHIP_DELETE_BTN, SECTION_HEAD, updateTeacherIn } from "./shared";

// ⚙ 全体設定 → 🚫 NG (不在)・コマ数上限・校舎間の移動時間
export function LimitsTab({ project, saveProject }) {
  const toasts = useToasts();
  const updateTeacher = updateTeacherIn(saveProject);

  // 講師を選ぶ / 一覧するところはセルのプルダウンと同じアイウエオ順にする
  // (👤 講師マスタのタブだけはマスタ順のまま — よみを打つそばから行が
  // 動くと編集しづらいため)
  const sortedTeachers = useMemo(
    () => sortTeachersByKana(project.teachers),
    [project.teachers]
  );

  // NG (不在) の追加フォーム。曜日は複数選択 (「火・木は不在」を 1 回で)、
  // 時間帯は時限プールから選ぶ (「18:00-18:45」を毎回手打ちしなくてよい)。
  // プールに無い時間帯は FREE_TIME で従来どおり直接入力できる
  const FREE_TIME = "__free__";
  const [ngForm, setNgForm] = useState({
    name: "",
    days: [],
    time: "", // "" = 終日 / 時限の時刻 / FREE_TIME 選択中は customTime を使う
    customTime: "",
  });
  const toggleNgDay = (d) =>
    setNgForm((f) => ({
      ...f,
      days: f.days.includes(d)
        ? f.days.filter((x) => x !== d)
        : REGULAR_DAYS.filter((x) => f.days.includes(x) || x === d),
    }));

  const addNg = () => {
    const { name, days } = ngForm;
    if (!name) return;
    if (days.length === 0) {
      toasts.error("NG にする曜日を選んでください");
      return;
    }
    const time =
      ngForm.time === FREE_TIME ? ngForm.customTime.trim() : ngForm.time;
    if (time && !isWellFormedTimeRange(time)) {
      toasts.error("時刻は「HH:MM-HH:MM」形式で入力してください（終日は「終日」を選択）");
      return;
    }
    updateTeacher(name, (t) => {
      const slots2 = [...(t.ngSlots || [])];
      for (const day of days) {
        if (slots2.some((s) => s.day === day && (s.time || "") === time)) continue;
        slots2.push(time ? { day, time } : { day });
      }
      return slots2.length === (t.ngSlots || []).length
        ? t
        : { ...t, ngSlots: slots2 };
    });
    setNgForm((f) => ({ ...f, days: [] }));
  };
  const removeNg = (name, idx) =>
    updateTeacher(name, (t) => {
      const slots2 = (t.ngSlots || []).filter((_, i) => i !== idx);
      const next = { ...t, ngSlots: slots2 };
      if (slots2.length === 0) delete next.ngSlots;
      return next;
    });

  const [limitForm, setLimitForm] = useState({ name: "", perDay: "", perWeek: "" });
  const pickLimitTeacher = (name) => {
    const t = project.teachers.find((x) => x.name === name);
    setLimitForm({
      name,
      perDay: t?.maxPerDay ?? "",
      perWeek: t?.maxPerWeek ?? "",
    });
  };
  const setLimits = () => {
    if (!limitForm.name) return;
    updateTeacher(limitForm.name, (t) => {
      const next = { ...t };
      const perDay = Number(limitForm.perDay);
      if (limitForm.perDay !== "" && Number.isFinite(perDay) && perDay > 0)
        next.maxPerDay = perDay;
      else delete next.maxPerDay;
      const perWeek = Number(limitForm.perWeek);
      if (limitForm.perWeek !== "" && Number.isFinite(perWeek) && perWeek > 0)
        next.maxPerWeek = perWeek;
      else delete next.maxPerWeek;
      return next;
    });
  };
  const clearLimits = (name) =>
    updateTeacher(name, (t) => {
      const next = { ...t };
      delete next.maxPerDay;
      delete next.maxPerWeek;
      return next;
    });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className={SECTION_HEAD}>NG（不在）</span>
        <div className={UI.hint}>
          NG の曜日・時間帯への割当は、重複と同じく赤枠 + 一覧で警告されます（意図した割当は「承認」で消せます）。
          講師プルダウンにも「(NG)」を予告し、👁 週間ミニビューにも 🚫 で表示されます。
          曜日は複数選べます（「火・木は不在」を 1 回で登録できます）。時間帯は時限から選ぶか「終日」。
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={ngForm.name}
            onChange={(e) => setNgForm((f) => ({ ...f, name: e.target.value }))}
            aria-label="NG を設定する講師"
            className={UI.input}
          >
            <option value="">講師を選択</option>
            {sortedTeachers.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {/* 曜日は複数選択 (「火・木は不在」を 1 回で登録する) */}
          <span
            role="group"
            aria-label="NG の曜日 (複数選択)"
            className="inline-flex items-center gap-1"
          >
            {REGULAR_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={ngForm.days.includes(d)}
                onClick={() => toggleNgDay(d)}
                className={UI.btnToggle(ngForm.days.includes(d))}
              >
                {d}
              </button>
            ))}
          </span>
          {/* 時間帯は時限プールから選ぶ (手打ちの表記ゆれを防ぐ) */}
          <select
            value={ngForm.time}
            onChange={(e) => setNgForm((f) => ({ ...f, time: e.target.value }))}
            aria-label="NG の時間帯"
            className={UI.input}
          >
            <option value="">終日</option>
            {project.periods
              .filter((p) => isWellFormedTimeRange(p.time))
              .map((p) => (
                <option key={p.id} value={p.time.trim()}>
                  {[p.label, p.time].filter(Boolean).join(" ")}
                </option>
              ))}
            <option value={FREE_TIME}>✎ 直接入力…</option>
          </select>
          {ngForm.time === FREE_TIME && (
            <input
              type="text"
              autoFocus
              value={ngForm.customTime}
              onChange={(e) =>
                setNgForm((f) => ({ ...f, customTime: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") addNg();
              }}
              placeholder="18:00-19:00"
              aria-label="NG の時刻範囲 (直接入力)"
              className={`${UI.input} w-32`}
            />
          )}
          <button
            type="button"
            className={UI.btn}
            onClick={addNg}
            disabled={!ngForm.name || ngForm.days.length === 0}
          >
            + NG 追加
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sortedTeachers.flatMap((t) =>
            (t.ngSlots || []).map((s, i) => (
              <span
                key={`${t.name}-${i}`}
                className="text-[11px] bg-builder-danger-soft border border-builder-danger-border text-builder-red rounded-full px-2 py-0.5 inline-flex items-center gap-1"
              >
                🚫 {t.name}: {s.day}
                {s.time ? ` ${s.time}` : "・終日"}
                <button
                  type="button"
                  onClick={() => removeNg(t.name, i)}
                  className={CHIP_DELETE_BTN}
                  aria-label={`${t.name} の NG (${s.day}${s.time ? ` ${s.time}` : " 終日"}) を削除`}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
        <span className={SECTION_HEAD}>コマ数上限</span>
        <div className={UI.hint}>
          超過しても入力は妨げません。📊 集計パネルで超過分が赤字になります。空欄 = 無制限。
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={limitForm.name}
            onChange={(e) => pickLimitTeacher(e.target.value)}
            aria-label="上限を設定する講師"
            className={UI.input}
          >
            <option value="">講師を選択</option>
            {sortedTeachers.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="text-[11px] text-builder-ink inline-flex items-center gap-1">
            1日
            <input
              type="number"
              min="1"
              value={limitForm.perDay}
              onChange={(e) =>
                setLimitForm((f) => ({ ...f, perDay: e.target.value }))
              }
              aria-label="1日の上限コマ数"
              className={`${UI.input} w-16`}
            />
          </label>
          <label className="text-[11px] text-builder-ink inline-flex items-center gap-1">
            週
            <input
              type="number"
              min="1"
              value={limitForm.perWeek}
              onChange={(e) =>
                setLimitForm((f) => ({ ...f, perWeek: e.target.value }))
              }
              aria-label="週の上限コマ数"
              className={`${UI.input} w-16`}
            />
          </label>
          <button
            type="button"
            className={UI.btn}
            onClick={setLimits}
            disabled={!limitForm.name}
          >
            設定
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sortedTeachers
            .filter((t) => t.maxPerDay != null || t.maxPerWeek != null)
            .map((t) => (
              <span
                key={t.name}
                className="text-[11px] bg-builder-warning-soft border border-builder-warning-border text-builder-orange rounded-full px-2 py-0.5 inline-flex items-center gap-1"
              >
                📏 {t.name}:{" "}
                {[
                  t.maxPerDay != null ? `1日${t.maxPerDay}` : null,
                  t.maxPerWeek != null ? `週${t.maxPerWeek}` : null,
                ]
                  .filter(Boolean)
                  .join("・")}
                <button
                  type="button"
                  onClick={() => clearLimits(t.name)}
                  className={CHIP_DELETE_BTN}
                  aria-label={`${t.name} の上限を解除`}
                >
                  ✕
                </button>
              </span>
            ))}
        </div>
      </div>

      {/* 校舎間 (本校 ↔ 亀井町) の移動時間。必要分数は施設ごとの
          事情なので既定値は置かず、入れたときだけチェックする */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
        <span className={SECTION_HEAD}>校舎間の移動時間</span>
        <div className={UI.hint}>
          同じ講師が本校と亀井町（教室「亀◯◯」）を続けて担当するとき、
          コマの間隔がこの分数に満たないと問題一覧で警告します。空欄 = チェックしません。
        </div>
        <label className="text-[11px] text-builder-ink inline-flex items-center gap-1">
          移動に必要な時間
          <input
            type="number"
            min="1"
            value={project.campusTravelMinutes ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              saveProject((p) => {
                const next = { ...p };
                if (e.target.value !== "" && Number.isFinite(v) && v > 0)
                  next.campusTravelMinutes = v;
                else delete next.campusTravelMinutes;
                return next;
              });
            }}
            aria-label="校舎間の移動に必要な分数 (空欄でチェックしない)"
            className={`${UI.input} w-16`}
          />
          分
        </label>
      </div>
    </>
  );
}
