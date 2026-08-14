import { useMemo, useRef, useState } from "react";
import { splitTeacherField } from "../utils/biweekly";
import { isWellFormedTimeRange } from "../utils/timeBulkEdit";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  REGULAR_DAYS,
  countCellsForPeriod,
  countTeacherAssignments,
  collectRoomUsage,
  nextPeriodId,
  removePeriodFromProject,
  renameTeacherInProject,
  shiftPeriodTimes,
} from "./model";
import { sortTeachersByKana } from "./teacherOrder";
import { applyInferredSubjects } from "./teacherSubjectInfer";
import { UI } from "./ui";

// ─── ⚙ 全体設定モーダル (時限 / 科目 / 講師 / 教室 / NG・上限) ──────
// 講習ビルダーの「⚙️ 設定メニュー」と同じタブ構成のモーダル (RB19)。
// 以前はインラインパネル (ProjectConfigPanel) だったが、NG・上限が増えて
// 縦に長くなったためタブで分類する。編集は従来どおり即時保存
// (saveProject 経由・Ctrl+Z で戻せる) — 「OK で確定」型ではない。

const TABS = [
  ["periods", "🕐 時限"],
  ["subjects", "📚 科目"],
  ["teachers", "👤 講師"],
  ["rooms", "🏫 教室"],
  ["limits", "🚫 NG・上限"],
];

function move(list, idx, delta) {
  const next = [...list];
  const to = idx + delta;
  if (to < 0 || to >= next.length) return list;
  [next[idx], next[to]] = [next[to], next[idx]];
  return next;
}

export function ProjectConfigModal({
  project,
  saveProject,
  slots,
  /** 親アプリの教科マスタ (name + aliases)。担当科目の推定で
      「英/数」→ 英語 のような読み替えに使う */
  masterSubjects = [],
  onClose,
  /** 開いたとき最初に表示するタブ (オンボーディングの導線用) */
  initialTab = "periods",
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [tab, setTab] = useState(initialTab);
  const dialogRef = useRef(null);
  const tablistRef = useRef(null);
  const [newSubject, setNewSubject] = useState("");
  const [newTeacher, setNewTeacher] = useState("");
  const [newRoom, setNewRoom] = useState("");

  // 教室マスタと、実際に使われている教室の突き合わせ。マスタに無い教室は
  // 表記ゆれ ("５０1" と "501" など) の可能性がある — 重複チェックも
  // 亀井町判定も文字列一致なので、揺れていると黙ってすり抜ける
  const roomUsage = useMemo(() => collectRoomUsage(project), [project]);

  // 講師を選ぶ / 一覧するところはセルのプルダウンと同じアイウエオ順にする
  // (👤 講師マスタのタブだけはマスタ順のまま — よみを打つそばから行が
  // 動くと編集しづらいため)
  const sortedTeachers = useMemo(
    () => sortTeachersByKana(project.teachers),
    [project.teachers]
  );
  const roomMaster = project.rooms || [];
  const unknownRooms = roomUsage.filter((r) => !roomMaster.includes(r.room));

  const addRoom = (value) => {
    const v = (value ?? newRoom).trim();
    if (!v) return;
    saveProject((p) =>
      (p.rooms || []).includes(v) ? p : { ...p, rooms: [...(p.rooms || []), v] }
    );
    if (value === undefined) setNewRoom("");
  };
  const importRooms = () => {
    const names = roomUsage.map((r) => r.room);
    saveProject((p) => {
      const known = new Set(p.rooms || []);
      const added = names.filter((n) => !known.has(n));
      if (!added.length) return p;
      return { ...p, rooms: [...(p.rooms || []), ...added] };
    });
  };

  // Escape で閉じる + Tab フォーカスをモーダル内に閉じ込める
  useFocusTrap(dialogRef, { onClose });

  // tablist の ←→/Home/End ナビ (講習 ConfigModal と同じ roving tabindex)
  const handleTablistKeyDown = (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const current = TABS.findIndex(([id]) => id === tab);
    let next = current;
    if (e.key === "ArrowLeft") next = (current - 1 + TABS.length) % TABS.length;
    else if (e.key === "ArrowRight") next = (current + 1) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    const nextId = TABS[next][0];
    setTab(nextId);
    tablistRef.current?.querySelector(`#regb-config-tab-${nextId}`)?.focus();
  };

  // ── 講師のリネーム (クリックでインライン編集)。Enter/blur = 確定、
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

  // ── 講師の削除。割当セルや NG・上限設定のある講師だけ確認を挟む
  // (リネームが件数まで知らせるのと対称に、失うものを知らせてから消す)。
  // セルの講師名は残る (マスタ外扱いになる) ため cascade は無い — 確認後の
  // 即削除で Ctrl+Z でも戻せる
  const removeTeacher = async (t) => {
    const cells = countTeacherAssignments(project, t.name);
    const hasNg = (t.ngSlots || []).length > 0;
    const hasLimits = t.maxPerDay != null || t.maxPerWeek != null;
    const hasProfile = !!(t.kana || (t.subjects || []).length);
    if (cells > 0 || hasNg || hasLimits) {
      const lines = [];
      if (cells > 0)
        lines.push(
          `割当済みのセル ${cells} 件はそのまま残ります（プルダウンの選択肢からは消えます）。`
        );
      // 消える設定は漏れなく挙げる (よみ・担当科目もこの講師に紐づく)
      if (hasNg || hasLimits || hasProfile)
        lines.push(
          `${[
            hasNg ? "NG（不在）" : null,
            hasLimits ? "コマ数上限" : null,
            hasProfile ? "よみ・担当科目" : null,
          ]
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
        { id: nextPeriodId(p), label: `${p.periods.length + 1}限`, time: "" },
      ],
    }));

  // 時限の削除は全学年のその時限のコマを巻き込む (cascade) ため確認を挟む
  // (CLAUDE.md 削除 UX ルールの confirmedRemove 相当)。件数は表示用に現在の
  // project で数え、保存は saveProject の最新値で再計算する
  const removePeriod = async (per) => {
    const cells = countCellsForPeriod(project, per.id);
    if (cells > 0) {
      const ok = await confirm({
        title: "時限の削除",
        message:
          `時限「${per.label || per.time || `id:${per.id}`}」を削除しますか？\n` +
          `この時限に入力済みのコマ ${cells} 件も削除されます（全学年）。\n` +
          `（Ctrl+Z で戻せます）`,
        okLabel: "削除する",
        tone: "danger",
      });
      if (!ok) return;
    }
    saveProject((p) => removePeriodFromProject(p, per.id).project, {
      atomic: true,
    });
    if (cells > 0) {
      toasts.success(`時限を削除しました（コマ ${cells} 件も削除）`);
    }
  };

  // 時限の一括時刻シフト (期切替の「全体を 15 分後ろへ」)。件数は表示用に
  // 現在の project で数え、保存は saveProject の最新値で再計算する
  const [shiftMinutes, setShiftMinutes] = useState("15");
  const shiftAllPeriods = (sign) => {
    const delta = sign * Number(shiftMinutes);
    if (!Number.isFinite(delta) || delta === 0) {
      toasts.error("ずらす分数を入力してください");
      return;
    }
    const res = shiftPeriodTimes(project, delta);
    if (res.shifted === 0) {
      toasts.info(
        res.skipped.length > 0
          ? `ずらせる時限がありません（${res.skipped.join("・")} は時刻が未設定か範囲外です）`
          : "ずらせる時限がありません（時刻を設定してください）"
      );
      return;
    }
    saveProject((p) => shiftPeriodTimes(p, delta).project, { atomic: true });
    const parts = [
      `${res.shifted} 件の時限を ${Math.abs(delta)} 分${delta > 0 ? "後ろへ" : "前へ"}ずらしました`,
    ];
    if (res.skipped.length > 0)
      parts.push(`${res.skipped.join("・")} は据え置き（時刻が未設定か範囲外）`);
    toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`, { duration: 5000 });
  };

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

  // ── よみ (アイウエオ順の並べ替えキー) と担当科目 (科目別グループ) ──
  // どちらも講師プルダウンの並びにしか使わない任意フィールド。空にすると
  // フィールドごと落とす (未設定 = 従来どおりの並び)
  const setTeacherKana = (name, value) =>
    updateTeacher(name, (t) => {
      const next = { ...t };
      if (value.trim()) next.kana = value;
      else delete next.kana;
      return next;
    });

  const toggleTeacherSubject = (name, subject) =>
    updateTeacher(name, (t) => {
      const current = t.subjects || [];
      const next = { ...t };
      const subs = current.includes(subject)
        ? current.filter((s) => s !== subject)
        : [...current, subject];
      // 並びは科目マスタ順 (押した順に散らからないように)。マスタ外は後ろ
      const rank = (s) => {
        const i = (project.subjects || []).indexOf(s);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      subs.sort((a, b) => rank(a) - rank(b));
      if (subs.length) next.subjects = subs;
      else delete next.subjects;
      return next;
    });

  // 担当科目を「いま組んである割当」から推定して埋める入力補助。既に
  // 入っている担当科目は残す (手で入れたものを上書きしない)。件数は表示用に
  // 現在の project で数え、保存は saveProject の最新値で再計算する
  const inferSubjects = () => {
    const res = applyInferredSubjects(project, masterSubjects);
    if (!res.filled) {
      toasts.info(
        "割当から推定できる担当科目がありませんでした（コマの科目が科目マスタのどれにも当たらない場合は推定できません）"
      );
      return;
    }
    saveProject((p) => ({
      ...p,
      teachers: applyInferredSubjects(p, masterSubjects).teachers,
    }));
    toasts.success(
      `${res.filled} 名の担当科目を推定しました（科目 ${res.added} 件を追加。Ctrl+Z で戻せます）`
    );
  };

  const kanaMissing = project.teachers.filter((t) => !(t.kana || "").trim()).length;

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
  const sectionHead = "text-xs font-bold text-builder-ink";

  return (
    <div
      className="no-print fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regb-config-title"
        className="bg-builder-surface w-full max-w-3xl max-h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in"
      >
        <div className="px-4 py-3 border-b border-builder-border flex justify-between items-center bg-builder-surface-alt">
          <h2
            id="regb-config-title"
            className="m-0 font-bold text-base text-builder-ink truncate"
          >
            ⚙ 全体設定{project.name ? ` — ${project.name}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="全体設定を閉じる"
            className="border-0 bg-transparent cursor-pointer text-xl font-bold leading-none text-builder-ink-muted hover:text-builder-ink shrink-0"
          >
            ×
          </button>
        </div>

        <div
          ref={tablistRef}
          role="tablist"
          aria-label="設定カテゴリ"
          onKeyDown={handleTablistKeyDown}
          className="flex gap-4 px-4 pt-3 border-b border-builder-border overflow-x-auto"
        >
          {TABS.map(([id, label]) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                id={`regb-config-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="regb-config-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                className={`pb-2 border-0 bg-transparent cursor-pointer text-sm font-bold whitespace-nowrap ${
                  selected
                    ? "text-builder-blue border-b-2 border-builder-blue"
                    : "text-builder-ink-muted hover:text-builder-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          id="regb-config-tabpanel"
          role="tabpanel"
          aria-labelledby={`regb-config-tab-${tab}`}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 text-xs"
        >
          {/* ── 🕐 時限 (全タブ共通の時限プール) ── */}
          {tab === "periods" && (
            <>
              <div className={UI.hint}>
                時刻は「HH:MM-HH:MM」形式。
                学年で時刻が違う場合は「中3 1限」「中12 1限」のように別の時限として登録し、各学年の設定で使う時限を選びます。
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
                    {bad && (
                      <span className="text-[10px] text-builder-red">形式が不正です</span>
                    )}
                    <button
                      type="button"
                      className={UI.btn}
                      onClick={() =>
                        saveProject((p) => ({ ...p, periods: move(p.periods, idx, -1) }))
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={UI.btn}
                      onClick={() =>
                        saveProject((p) => ({ ...p, periods: move(p.periods, idx, 1) }))
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={UI.btnDanger}
                      onClick={() => removePeriod(per)}
                    >
                      削除
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" className={UI.btn} onClick={addPeriod}>
                  + 時限を追加
                </button>
                {/* 期切替の「全体を 15 分後ろへ」を 1 操作で。時限 id は
                    変わらないのでセルの中身は動かない */}
                {project.periods.length > 0 && (
                  <span className="inline-flex items-center gap-1 ml-2 text-[11px] text-builder-ink">
                    全時限を
                    <input
                      type="number"
                      value={shiftMinutes}
                      onChange={(e) => setShiftMinutes(e.target.value)}
                      aria-label="ずらす分数 (正で後ろへ・負で前へ)"
                      className={`${UI.input} w-16`}
                    />
                    分
                    <button
                      type="button"
                      className={UI.btn}
                      onClick={() => shiftAllPeriods(-1)}
                      title="全時限の時刻をこの分数だけ前倒しする（コマの中身は動きません）"
                    >
                      ◂ 前へ
                    </button>
                    <button
                      type="button"
                      className={UI.btn}
                      onClick={() => shiftAllPeriods(1)}
                      title="全時限の時刻をこの分数だけ後ろへずらす（コマの中身は動きません）"
                    >
                      後ろへ ▸
                    </button>
                  </span>
                )}
              </div>
            </>
          )}

          {/* ── 📚 科目マスタ ── */}
          {tab === "subjects" && (
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
                      className={`${chipDeleteBtn} disabled:opacity-25`}
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
                      className={`${chipDeleteBtn} disabled:opacity-25`}
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
            </>
          )}

          {/* ── 👤 講師マスタ ── */}
          {tab === "teachers" && (
            <>
              <div className={UI.hint}>
                セルの講師プルダウンの選択肢になります。複数講師は「✎ 直接入力」で「·」区切り（全角中点でも可）。
                名前をクリックすると変更でき、割当済みのセルも追従します。NG（不在）とコマ数上限は「🚫 NG・上限」タブで設定します。
              </div>
              <div className={UI.hint}>
                プルダウンは<b>担当科目ごとのグループ + よみのアイウエオ順</b>
                で出します。漢字の名前は読み順に並べられないので、並べたい講師には
                「よみ」を入れてください（未設定の講師はマスタ順のまま末尾に並びます）。
                担当科目が誰も未設定のときは、これまでどおり見出しの無い一覧になります。
              </div>
              {/* 1 人 1 行なので人数が増えると縦に伸びる。リストだけを
                  スクロールさせ、下の「追加」「📚 担当科目を推定」を
                  スクロールせずに押せるようにする (実運用は 50 名規模) */}
              <div className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto">
                {project.teachers.map((t) => {
                  const assigned = t.subjects || [];
                  const pickable = (project.subjects || []).filter(
                    (s) => !assigned.includes(s)
                  );
                  return (
                    <div
                      key={t.name}
                      className="flex items-center gap-1.5 flex-wrap text-[11px] border-b border-builder-border pb-1"
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
                            if (e.key === "Enter") {
                              // 既定動作 (フォーカス移動先ボタンの activation 等)
                              // を確実に殺してから確定する
                              e.preventDefault();
                              e.target.blur();
                            } else if (e.key === "Escape") {
                              // モーダルの Escape (閉じる) まで波及させない
                              e.stopPropagation();
                              cancelRenameRef.current = true;
                              e.target.blur();
                            }
                          }}
                          className="w-20 text-[11px] rounded border border-builder-info-border bg-builder-surface px-1 py-0.5 focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingTeacher({ name: t.name, value: t.name })
                          }
                          title="クリックで名前を変更（割当済みのセルも追従します）"
                          /* 短い名前は列を揃え、長い名前は隣の「よみ」に
                             かぶらないよう幅を伸ばす (min-w) */
                          className="min-w-[5rem] text-left shrink-0 border-0 bg-transparent cursor-pointer p-0 font-bold text-builder-ink hover:text-builder-blue hover:underline decoration-dotted"
                        >
                          {t.name}
                        </button>
                      )}
                      <input
                        type="text"
                        value={t.kana || ""}
                        aria-label={`${t.name} のよみ`}
                        placeholder="よみ"
                        onChange={(e) => setTeacherKana(t.name, e.target.value)}
                        className="w-24 shrink-0 text-[11px] rounded border border-builder-border bg-builder-surface px-1 py-0.5 focus:outline-none placeholder:text-builder-ink-ghost"
                      />
                      {/* 科目マスタが空で担当科目も無いときは「担当」の
                          見出しだけが浮くので出さない */}
                      {(assigned.length > 0 || pickable.length > 0) && (
                        <span className="text-builder-ink-subtle shrink-0">担当</span>
                      )}
                      {assigned.map((s) => (
                        <span
                          key={s}
                          className="bg-builder-bg border border-builder-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
                        >
                          {s}
                          {!(project.subjects || []).includes(s) && (
                            <span
                              title="科目マスタに無い科目です"
                              className="text-builder-ink-ghost"
                            >
                              ?
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleTeacherSubject(t.name, s)}
                            className={chipDeleteBtn}
                            aria-label={`${t.name} の担当科目から ${s} を外す`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      {pickable.length > 0 && (
                        <select
                          value=""
                          aria-label={`${t.name} の担当科目を追加`}
                          onChange={(e) => {
                            if (e.target.value)
                              toggleTeacherSubject(t.name, e.target.value);
                          }}
                          className="text-[11px] rounded border border-builder-border bg-builder-surface px-1 py-0.5 cursor-pointer focus:outline-none"
                        >
                          <option value="">＋</option>
                          {pickable.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTeacher(t)}
                        className={`${chipDeleteBtn} ml-auto`}
                        aria-label={`${t.name} を削除`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                <button
                  type="button"
                  className={UI.btnBlue}
                  onClick={inferSubjects}
                  title="いま組んである割当から、各講師の担当科目を推定して埋めます（既に入っている科目はそのまま）"
                >
                  📚 担当科目を推定
                </button>
                {kanaMissing > 0 && (
                  <span className={UI.hint}>
                    よみ未設定 {kanaMissing} 名（プルダウンの末尾に並びます）
                  </span>
                )}
              </div>
            </>
          )}

          {/* ── 🏫 教室マスタ ── */}
          {tab === "rooms" && (
            <>
              <div className={UI.hint}>
                セル・列見出しの教室入力の候補になります。教室の重複チェックと
                亀井町（「亀◯◯」）の判定は文字列一致なので、表記ゆれがあると
                黙って検出をすり抜けます。マスタに揃えておくと下の「マスタに無い教室」で
                ゆれに気付けます。マスタは空でも構いません（候補が使用中の教室だけになります）。
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {roomMaster.map((r, idx) => (
                  <span
                    key={r}
                    className="text-[11px] bg-builder-info-soft border border-builder-info-border text-builder-ink rounded-full px-2 py-0.5 inline-flex items-center gap-1"
                  >
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        saveProject((p) => ({ ...p, rooms: move(p.rooms || [], idx, -1) }))
                      }
                      className={`${chipDeleteBtn} disabled:opacity-25`}
                      aria-label={`${r} を前へ`}
                      title="前へ"
                    >
                      ◂
                    </button>
                    {r}
                    <button
                      type="button"
                      disabled={idx === roomMaster.length - 1}
                      onClick={() =>
                        saveProject((p) => ({ ...p, rooms: move(p.rooms || [], idx, 1) }))
                      }
                      className={`${chipDeleteBtn} disabled:opacity-25`}
                      aria-label={`${r} を後ろへ`}
                      title="後ろへ"
                    >
                      ▸
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        saveProject((p) => ({
                          ...p,
                          rooms: (p.rooms || []).filter((x) => x !== r),
                        }))
                      }
                      className={chipDeleteBtn}
                      aria-label={`${r} を削除`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addRoom();
                  }}
                  placeholder="教室を追加 (例: 501)"
                  className={`${UI.input} w-32`}
                />
                <button type="button" className={UI.btn} onClick={() => addRoom()}>
                  追加
                </button>
                <button
                  type="button"
                  className={UI.btnBlue}
                  onClick={importRooms}
                  disabled={unknownRooms.length === 0}
                  title="今このプロジェクトで使われている教室をまとめてマスタに入れる"
                >
                  🔗 使用中の教室から取込
                </button>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
                <span className={sectionHead}>
                  マスタに無い教室（使用中）{unknownRooms.length > 0 ? ` ${unknownRooms.length} 件` : ""}
                </span>
                {unknownRooms.length === 0 ? (
                  <div className="text-builder-ink-subtle">
                    {roomUsage.length === 0
                      ? "まだ教室が使われていません。"
                      : "使用中の教室はすべてマスタにあります。"}
                  </div>
                ) : (
                  <>
                    <div className={UI.hint}>
                      同じ部屋が違う表記で入っていないか確認してください
                      （「501」と「５０１」は別の教室として扱われ、重複チェックに掛かりません）。
                      クリックでマスタに追加できます。
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {unknownRooms.map((r) => (
                        <button
                          key={r.room}
                          type="button"
                          onClick={() => addRoom(r.room)}
                          title="クリックでマスタに追加"
                          className="text-[11px] bg-builder-warning-soft border border-builder-warning-border text-builder-orange rounded-full px-2 py-0.5 cursor-pointer"
                        >
                          + {r.room}
                          <span className="ml-1 font-normal opacity-80">
                            {r.cells > 0 ? `${r.cells}コマ` : ""}
                            {r.columns > 0 ? `${r.cells > 0 ? "・" : ""}列${r.columns}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── 🚫 NG (不在) とコマ数上限 ── */}
          {tab === "limits" && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className={sectionHead}>NG（不在）</span>
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

              <div className="flex flex-col gap-1.5 pt-2 border-t border-builder-border">
                <span className={sectionHead}>コマ数上限</span>
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
                          className={chipDeleteBtn}
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
                <span className={sectionHead}>校舎間の移動時間</span>
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
          )}
        </div>
      </div>
    </div>
  );
}
