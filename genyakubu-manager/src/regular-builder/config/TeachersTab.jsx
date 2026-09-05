import { useRef, useState } from "react";
import { splitTeacherField } from "../../utils/biweekly";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { countTeacherAssignments, renameTeacherInProject } from "../model";
import { applyInferredSubjects } from "../teacherSubjectInfer";
import { UI } from "../ui";
import { CHIP_DELETE_BTN, updateTeacherIn } from "./shared";

// ⚙ 全体設定 → 👤 講師マスタ (名前・よみ・担当科目)。NG・上限は LimitsTab
export function TeachersTab({ project, saveProject, slots, masterSubjects }) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [newTeacher, setNewTeacher] = useState("");
  const updateTeacher = updateTeacherIn(saveProject);

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
                    className={CHIP_DELETE_BTN}
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
                className={`${CHIP_DELETE_BTN} ml-auto`}
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
  );
}
