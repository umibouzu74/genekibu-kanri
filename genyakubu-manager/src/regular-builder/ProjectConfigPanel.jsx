import { useRef, useState } from "react";
import { splitTeacherField } from "../utils/biweekly";
import { isWellFormedTimeRange } from "../utils/timeBulkEdit";
import { nextNumericId } from "../utils/schema";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import {
  REGULAR_DAYS,
  countTeacherAssignments,
  renameTeacherInProject,
} from "./model";
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
  const toasts = useToasts();
  const confirm = useConfirm();
  const [newSubject, setNewSubject] = useState("");
  const [newTeacher, setNewTeacher] = useState("");

  // 講師の削除。割当セルや NG・上限設定のある講師だけ確認を挟む
  // (リネームが件数まで知らせるのと対称に、失うものを知らせてから消す)。
  // セルの講師名は残る (マスタ外扱いになる) ため cascade は無い — 確認後の
  // 即削除で Ctrl+Z でも戻せる
  const removeTeacher = async (t) => {
    const cells = countTeacherAssignments(project, t.name);
    const hasNg = (t.ngSlots || []).length > 0;
    const hasLimits = t.maxPerDay != null || t.maxPerWeek != null;
    if (cells > 0 || hasNg || hasLimits) {
      const lines = [];
      if (cells > 0)
        lines.push(
          `割当済みのセル ${cells} 件はそのまま残ります（プルダウンの選択肢からは消えます）。`
        );
      if (hasNg || hasLimits)
        lines.push(
          `${[hasNg ? "NG（不在）" : null, hasLimits ? "コマ数上限" : null]
            .filter(Boolean)
            .join("・")}の設定は削除されます。`
        );
      const ok = await confirm({
        title: "講師の削除",
        message: `講師「${t.name}」をマスタから削除しますか？\n${lines.join(
          "\n"
        )}\n（Ctrl+Z で戻せます）`,
        okLabel: "削除する",
        tone: "danger",
      });
      if (!ok) return;
    }
    saveProject((p) => ({
      ...p,
      teachers: p.teachers.filter((x) => x.name !== t.name),
    }));
  };

  // 講師のリネーム (クリックでインライン編集)。Enter/blur = 確定、
  // Escape = 取消 (blur はどちらでも発火するためフラグで振り分ける —
  // RegularCell の FreeTextInput と同じパターン)
  const [editingTeacher, setEditingTeacher] = useState(null); // { name, value }
  const cancelRenameRef = useRef(false);

  const commitRename = () => {
    if (!editingTeacher) return;
    const from = editingTeacher.name;
    const to = editingTeacher.value.trim();
    setEditingTeacher(null);
    if (!to || to === from) return;
    if (project.teachers.some((t) => t.name === to)) {
      toasts.error(`「${to}」は既に登録されています`);
      return;
    }
    if (splitTeacherField(to).join("") !== to) {
      // 講師名そのものに区切り文字は使えない (CLAUDE.md の複数講師規約)。
      // 末尾の「·」だけ等の残骸も join 比較で弾く
      toasts.error("講師名に「·」（中黒）は使えません");
      return;
    }
    // 件数は表示用に現時点の project で数え、保存は saveProject の最新値で行う
    const { changedCells } = renameTeacherInProject(project, from, to);
    saveProject((p) => renameTeacherInProject(p, from, to).project);
    toasts.success(
      changedCells > 0
        ? `「${from}」→「${to}」に変更しました（割当セル ${changedCells} 件も更新）`
        : `「${from}」→「${to}」に変更しました`
    );
  };

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

  // ── 講師の NG (不在) と上限 ─────────────────────────────────────
  const updateTeacher = (name, fn) =>
    saveProject((p) => ({
      ...p,
      teachers: p.teachers.map((t) => (t.name === name ? fn(t) : t)),
    }));

  const [ngForm, setNgForm] = useState({
    name: "",
    day: REGULAR_DAYS[0],
    time: "",
  });
  const addNg = () => {
    const { name, day } = ngForm;
    const time = ngForm.time.trim();
    if (!name) return;
    if (time && !isWellFormedTimeRange(time)) {
      toasts.error("時刻は「HH:MM-HH:MM」形式で入力してください（空欄で終日）");
      return;
    }
    updateTeacher(name, (t) => {
      const slots = t.ngSlots || [];
      if (slots.some((s) => s.day === day && (s.time || "") === time)) return t;
      return { ...t, ngSlots: [...slots, time ? { day, time } : { day }] };
    });
    setNgForm((f) => ({ ...f, time: "" }));
  };
  const removeNg = (name, idx) =>
    updateTeacher(name, (t) => {
      const slots = (t.ngSlots || []).filter((_, i) => i !== idx);
      const next = { ...t, ngSlots: slots };
      if (slots.length === 0) delete next.ngSlots;
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
          名前をクリックすると変更でき、割当済みのセルも追従します。
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {project.teachers.map((t) => (
            <span
              key={t.name}
              className="text-[11px] bg-builder-bg border border-builder-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            >
              {editingTeacher?.name === t.name ? (
                <input
                  type="text"
                  autoFocus
                  value={editingTeacher.value}
                  aria-label={`${t.name} の新しい名前`}
                  onChange={(e) =>
                    setEditingTeacher({ name: t.name, value: e.target.value })
                  }
                  onBlur={() => {
                    if (cancelRenameRef.current) {
                      cancelRenameRef.current = false;
                      setEditingTeacher(null);
                    } else {
                      commitRename();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                    else if (e.key === "Escape") {
                      cancelRenameRef.current = true;
                      e.target.blur();
                    }
                  }}
                  className="w-24 text-[11px] rounded border border-builder-info-border bg-builder-surface px-1 py-0 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTeacher({ name: t.name, value: t.name })}
                  title="クリックで名前を変更（割当済みのセルも追従します）"
                  className="border-0 bg-transparent cursor-pointer p-0 text-inherit hover:text-builder-blue hover:underline decoration-dotted"
                >
                  {t.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => removeTeacher(t)}
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

        {/* NG (不在) */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
          <span className="text-[11px] font-bold text-builder-ink">NG（不在）</span>
          <div className={UI.hint}>
            NG の曜日・時間帯への割当は、重複と同じく赤枠 + 一覧で警告されます（意図した割当は「承認」で消せます）。
            講師プルダウンにも「(NG)」を予告します。時刻を空欄にすると終日 NG です。
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={ngForm.name}
              onChange={(e) => setNgForm((f) => ({ ...f, name: e.target.value }))}
              aria-label="NG を設定する講師"
              className={UI.input}
            >
              <option value="">講師を選択</option>
              {project.teachers.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={ngForm.day}
              onChange={(e) => setNgForm((f) => ({ ...f, day: e.target.value }))}
              aria-label="NG の曜日"
              className={UI.input}
            >
              {REGULAR_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}曜
                </option>
              ))}
            </select>
            <input
              type="text"
              value={ngForm.time}
              onChange={(e) => setNgForm((f) => ({ ...f, time: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") addNg();
              }}
              placeholder="18:00-19:00 (空欄で終日)"
              aria-label="NG の時刻範囲 (空欄で終日)"
              className={`${UI.input} w-44`}
            />
            <button
              type="button"
              className={UI.btn}
              onClick={addNg}
              disabled={!ngForm.name}
            >
              + NG 追加
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {project.teachers.flatMap((t) =>
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
                    className={chipDeleteBtn}
                    aria-label={`${t.name} の NG (${s.day}${s.time ? ` ${s.time}` : " 終日"}) を削除`}
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* コマ数上限 */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
          <span className="text-[11px] font-bold text-builder-ink">コマ数上限</span>
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
              {project.teachers.map((t) => (
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
            {project.teachers
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
                    className={chipDeleteBtn}
                    aria-label={`${t.name} の上限を解除`}
                  >
                    ✕
                  </button>
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
