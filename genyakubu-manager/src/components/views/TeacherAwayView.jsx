import { useEffect, useMemo, useRef, useState } from "react";
import { TEACHER_AWAY_COLOR as AC } from "../../constants/colors";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { S, colors } from "../../styles/common";
import { fmtMDWeekday } from "../../utils/dateHelpers";
import { compareTeacherNames } from "../../utils/teacherKana";
import {
  addTeacherAways,
  awayDayCount,
  awayStatus,
  draftFromAway,
  emptyAwayDraft,
  formatAwayPeriod,
  updateTeacherAway,
} from "../../utils/teacherAway";
import { listAwayLessons } from "../../utils/teacherAwayLessons";

// ─── 講師の不在期間 (P2-6) ───────────────────────────────────────────
// 「福武先生が 1/4〜1/22 不在」を 1 か所に登録する画面 (utils/teacherAway)。
// 登録しても授業は動かさない — 期間にまだその講師の担当になっている授業を
// 下に並べ、「担当変更（期間限定）にする」「欠勤として登録する」へそのまま進む
// (どちらにするかは人が選ぶ)。講習時間割作成では期間の全時限が自動NG になり、
// 講師の月間・週間・ダッシュボード・欠勤組み換え (代行候補) に「不在」の目印が出る
// (紙には出さない)。
//
// 閲覧者も見られる (代行を探す人が読む)。登録・編集・削除は管理者だけ。
// 削除は cascade 無しなので removeWithUndo (CLAUDE.md の削除 UX ルール)。

const STATUS_META = {
  active: { label: "不在中", bg: AC.bg, fg: AC.deep },
  upcoming: { label: "これから", bg: "#eef2ff", fg: "#1a1a6e" },
  ended: { label: "終了", bg: "#eeeeee", fg: "#666" },
};
const STATUS_RANK = { active: 0, upcoming: 1, ended: 2 };

const FILTERS = [
  { key: "current", label: "不在中・これから" },
  { key: "ended", label: "終了" },
  { key: "all", label: "すべて" },
];

const fieldLabel = { fontSize: 12, fontWeight: 700, display: "block", marginBottom: 2 };
const hint = { fontSize: 11, color: colors.inkSubtle };

/**
 * @param {object} props
 * @param {import("../../types").TeacherAway[]} props.teacherAways
 * @param {(next: import("../../types").TeacherAway[]) => void} props.onSave
 * @param {boolean} props.isAdmin
 * @param {string[]} [props.teacherNames] 入力候補 (時間割・バイトに出てくる講師名)
 * @param {Record<string, string>} [props.teacherKana]
 * @param {object} props.lessonData computeTeachingMinutes の材料 (App の授業データ)
 * @param {{id?: number, teacher?: string, token: number} | null} [props.focusRequest]
 * @param {() => void} [props.onConsumeFocus]
 * @param {(teacher: string, opts?: {month?: string}) => void} [props.onSelectTeacher]
 * @param {(req: {oldTeacher: string, from: string, until: string, memo?: string}) => void} [props.onOpenTeacherChange]
 * @param {(init: {teachers: string[], fromDate: string, toDate: string, memo?: string}) => void} [props.onOpenAbsence]
 */
export function TeacherAwayView({
  teacherAways = [],
  onSave,
  isAdmin,
  teacherNames = [],
  teacherKana = {},
  lessonData,
  focusRequest = null,
  onConsumeFocus,
  onSelectTeacher,
  onOpenTeacherChange,
  onOpenAbsence,
}) {
  const today = useToday();
  const toasts = useToasts();
  const confirm = useConfirm();
  const removeWithUndo = useRemoveWithUndo({ list: teacherAways, save: onSave });
  const [draft, setDraft] = useState(() => emptyAwayDraft());
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("current");
  // 授業の一覧を開いている記録 (不在中・これからは既定で開く。終了は押したときだけ)
  const [toggledOpen, setToggledOpen] = useState(() => new Set());
  const [highlightId, setHighlightId] = useState(null);
  // 新しい id は画面を開いてから見た最大の id より後 (消した id を使い回すと
  // 6 秒の「元に戻す」が効かなくなる)
  const idFloorRef = useRef(0);
  idFloorRef.current = Math.max(idFloorRef.current, ...teacherAways.map((r) => r.id || 0), 0);
  const formRef = useRef(null);

  const sorted = useMemo(() => {
    const list = teacherAways.filter((r) => {
      const st = awayStatus(r, today);
      if (filter === "current") return st !== "ended";
      if (filter === "ended") return st === "ended";
      return true;
    });
    return list.sort((a, b) => {
      const sa = STATUS_RANK[awayStatus(a, today)];
      const sb = STATUS_RANK[awayStatus(b, today)];
      if (sa !== sb) return sa - sb;
      // 終了は新しい順、それ以外は近い順
      const byDate = sa === 2 ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
      return byDate || compareTeacherNames(a.teacher, b.teacher, teacherKana) || a.id - b.id;
    });
  }, [teacherAways, filter, today, teacherKana]);

  const counts = useMemo(() => {
    const c = { current: 0, ended: 0, all: teacherAways.length };
    for (const r of teacherAways) c[awayStatus(r, today) === "ended" ? "ended" : "current"] += 1;
    return c;
  }, [teacherAways, today]);

  const isOpen = (r) => {
    const def = awayStatus(r, today) !== "ended";
    return toggledOpen.has(r.id) ? !def : def;
  };
  const toggleOpen = (id) => {
    const next = new Set(toggledOpen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setToggledOpen(next);
  };

  const editingDirty = () => {
    if (editId == null) return Boolean(draft.teacher || draft.startDate || draft.endDate || draft.memo);
    const rec = teacherAways.find((r) => r.id === editId);
    return JSON.stringify(draftFromAway(rec)) !== JSON.stringify(draft);
  };

  const scrollToForm = () =>
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  const scrollToRecord = (id) =>
    requestAnimationFrame(() =>
      document.getElementById(`teacher-away-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" })
    );

  const resetForm = () => {
    setDraft(emptyAwayDraft());
    setEditId(null);
    setError(null);
  };

  const startEdit = (rec) => {
    setDraft(draftFromAway(rec));
    setEditId(rec.id);
    setError(null);
    scrollToForm();
  };

  const showRecord = (rec) => {
    const st = awayStatus(rec, today);
    if ((filter === "current" && st === "ended") || (filter === "ended" && st !== "ended")) setFilter("all");
    if (st === "ended") setToggledOpen((prev) => new Set(prev).add(rec.id));
    setHighlightId(rec.id);
    scrollToRecord(rec.id);
  };

  // 外からの要求 (講師の月間・ダッシュボード・Cmd+K)。{id} はその 1 件、{teacher} は
  // その講師の新規登録 (管理者)
  useEffect(() => {
    if (!focusRequest) return;
    const req = focusRequest;
    onConsumeFocus?.();
    (async () => {
      if (req.id != null) {
        const rec = teacherAways.find((r) => r.id === req.id);
        if (rec) showRecord(rec);
        return;
      }
      if (!isAdmin) return;
      if (editingDirty()) {
        const ok = await confirm({
          title: "編集中の内容",
          message: "入力中の不在期間がまだ保存されていません。破棄して開きますか？",
          okLabel: "破棄して開く",
          tone: "danger",
        });
        if (!ok) return;
      }
      setDraft({ ...emptyAwayDraft(), teacher: req.teacher || "" });
      setEditId(null);
      setError(null);
      scrollToForm();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 要求 (token) ごとに 1 回だけ
  }, [focusRequest]);

  const submit = () => {
    if (!isAdmin) return;
    const result =
      editId == null
        ? addTeacherAways(teacherAways, draft, idFloorRef.current)
        : updateTeacherAway(teacherAways, editId, draft);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSave(result.next);
    const shown = editId == null ? result.added : [result.updated];
    idFloorRef.current = Math.max(idFloorRef.current, ...shown.map((r) => r.id));
    toasts.success(
      editId == null
        ? `不在期間を登録しました (${shown.map((r) => r.teacher).join("・")} ${formatAwayPeriod(shown[0])})。下の一覧で期間中の授業を確かめてください`
        : "不在期間を直しました"
    );
    resetForm();
    // 登録した記録へ (期間中の授業と、担当変更・欠勤登録へのボタンが出る)
    showRecord(shown[0]);
  };

  const remove = (rec) => {
    removeWithUndo(rec.id, { successMsg: `${rec.teacher} の不在期間 (${formatAwayPeriod(rec)}) を削除しました` });
    if (editId === rec.id) resetForm();
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <h2 style={{ fontSize: 18, margin: "4px 0 6px" }}>🧳 講師の不在期間</h2>
      <p style={{ ...hint, fontSize: 12, margin: "0 0 12px", lineHeight: 1.6 }}>
        研修・病気などで何日も続けて来られない期間を登録します。登録しても授業は動きません —
        期間中にまだその先生の担当になっている授業を一覧にするので、
        「担当変更（期間限定）にする」か「欠勤として登録する」を選んで片付けてください。
        講習時間割作成では期間中の全時限が自動で NG (不在) になり、講師の月間・週間・
        ダッシュボード・欠勤組み換え (代行候補) に「不在」と出ます (印刷・画像には出しません)。
      </p>

      {isAdmin && (
        <div
          ref={formRef}
          className="no-print"
          style={{
            background: "#fff",
            border: `1px solid ${editId != null ? AC.color : "#e0e0e0"}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            {editId != null ? "✏ 不在期間を直す" : "＋ 不在期間を登録する"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 160px" }}>
              <span style={fieldLabel}>講師</span>
              <input
                list="teacher-away-names"
                value={draft.teacher}
                onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}
                placeholder={editId != null ? "福武" : "福武 (「・」で何人でも)"}
                style={S.input}
                aria-label="講師"
              />
              <datalist id="teacher-away-names">
                {teacherNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label style={{ flex: "0 1 160px" }}>
              <span style={fieldLabel}>開始日</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                style={S.input}
                aria-label="開始日"
              />
            </label>
            <label style={{ flex: "0 1 160px" }}>
              <span style={fieldLabel}>終了日</span>
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                style={S.input}
                aria-label="終了日"
              />
            </label>
            <label style={{ flex: "1 1 160px" }}>
              <span style={fieldLabel}>メモ (任意)</span>
              <input
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                placeholder="研修・入院など"
                style={S.input}
                aria-label="メモ"
              />
            </label>
          </div>
          <div style={{ ...hint, marginTop: 4 }}>終了日が空欄なら開始日の 1 日だけ。</div>
          {error && (
            <div role="alert" style={{ color: colors.danger || "#c03030", fontSize: 12, marginTop: 6 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={submit} style={S.btn(true)}>
              {editId != null ? "直す" : "登録"}
            </button>
            {(editId != null || editingDirty()) && (
              <button type="button" onClick={resetForm} style={S.btn(false)}>
                {editId != null ? "やめる" : "クリア"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }} role="group" aria-label="表示する不在期間">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={S.btn(filter === f.key)} aria-pressed={filter === f.key}>
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div style={{ ...hint, fontSize: 13, padding: 16, background: "#fff", borderRadius: 8 }}>
          {teacherAways.length === 0 ? "登録された不在期間はありません。" : "この絞り込みに当たる不在期間はありません。"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((rec) => (
            <AwayCard
              key={rec.id}
              rec={rec}
              today={today}
              open={isOpen(rec)}
              onToggle={() => toggleOpen(rec.id)}
              highlight={highlightId === rec.id}
              isAdmin={isAdmin}
              lessonData={lessonData}
              onEdit={() => startEdit(rec)}
              onRemove={() => remove(rec)}
              onSelectTeacher={onSelectTeacher}
              onOpenTeacherChange={onOpenTeacherChange}
              onOpenAbsence={onOpenAbsence}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AwayCard({
  rec,
  today,
  open,
  onToggle,
  highlight,
  isAdmin,
  lessonData,
  onEdit,
  onRemove,
  onSelectTeacher,
  onOpenTeacherChange,
  onOpenAbsence,
}) {
  const st = awayStatus(rec, today);
  const meta = STATUS_META[st];
  const days = awayDayCount(rec);
  return (
    <div
      id={`teacher-away-${rec.id}`}
      style={{
        background: "#fff",
        border: `1px solid ${highlight ? AC.color : "#e0e0e0"}`,
        boxShadow: highlight ? `0 0 0 2px ${AC.bannerBorder}` : "none",
        borderLeft: `4px solid ${st === "ended" ? "#bbb" : AC.color}`,
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: meta.bg, color: meta.fg }}>
          {meta.label}
        </span>
        <strong style={{ fontSize: 15 }}>{rec.teacher}</strong>
        <span style={{ fontSize: 13 }}>
          {fmtMDWeekday(rec.startDate)}
          {rec.endDate !== rec.startDate && <> 〜 {fmtMDWeekday(rec.endDate)}</>}
          <span style={{ ...hint, marginLeft: 6 }}>({days}日間)</span>
        </span>
        {rec.memo && <span style={{ fontSize: 12, color: colors.inkSubtle }}>📝 {rec.memo}</span>}
        <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {onSelectTeacher && (
            <button type="button" onClick={() => onSelectTeacher(rec.teacher, { month: rec.startDate.slice(0, 7) })} style={S.btn(false)}>
              📅 月間
            </button>
          )}
          {isAdmin && (
            <>
              <button type="button" onClick={onEdit} style={S.btn(false)} aria-label={`${rec.teacher} の不在期間を直す`}>
                ✏ 直す
              </button>
              <button type="button" onClick={onRemove} style={S.btn(false)} aria-label={`${rec.teacher} の不在期間を削除`}>
                🗑
              </button>
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        className="no-print"
        onClick={onToggle}
        aria-expanded={open}
        style={{ border: "none", background: "none", padding: "6px 0 0", cursor: "pointer", fontSize: 12, color: AC.deep, fontWeight: 700 }}
      >
        {open ? "▼" : "▶"} 期間中の授業
      </button>
      {open && (
        <AwayLessons
          rec={rec}
          isAdmin={isAdmin}
          lessonData={lessonData}
          onOpenTeacherChange={onOpenTeacherChange}
          onOpenAbsence={onOpenAbsence}
        />
      )}
    </div>
  );
}

// まだその講師の担当になっている授業 (代行・担当変更・振替・休講を反映した後)
function AwayLessons({ rec, isAdmin, lessonData, onOpenTeacherChange, onOpenAbsence }) {
  const { lessons, pending, truncated } = useMemo(() => listAwayLessons(rec, lessonData), [rec, lessonData]);
  const ownCount = lessons.filter((l) => l.kind === "own").length;
  return (
    <div style={{ marginTop: 6, paddingLeft: 4 }}>
      {lessons.length === 0 ? (
        <div style={{ fontSize: 12, color: "#2a7a4a", fontWeight: 700 }}>
          ✓ 期間中に {rec.teacher} 先生の担当になっている授業はありません
          {pending.length > 0 && <span style={{ color: AC.deep }}> (代行未定の欠勤 {pending.length} 件)</span>}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: AC.deep, marginBottom: 4 }}>
            まだ {rec.teacher} 先生の担当になっている授業 {lessons.length} 件
            {pending.length > 0 && <span style={{ fontWeight: 400 }}> ・ 代行未定の欠勤 {pending.length} 件</span>}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, lineHeight: 1.7 }}>
            {lessons.map((l, i) => (
              <li key={`${l.date}-${l.time}-${l.label}-${i}`}>
                <span style={{ display: "inline-block", minWidth: 78 }}>{fmtMDWeekday(l.date)}</span>
                <span style={{ display: "inline-block", minWidth: 92, color: "#555" }}>{l.time || "時刻なし"}</span>
                {l.label}
                {l.kind !== "own" && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 8, background: AC.bg, color: AC.deep }}>
                    {l.kindLabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {truncated && <div style={hint}>期間が長いので、最初の 400 日ぶんだけ並べています。</div>}
          {lessons.length > ownCount && (
            <div style={{ ...hint, marginTop: 4 }}>
              代行・追加授業・講習・特訓は担当変更では外れません。それぞれの画面で担当を直してください。
            </div>
          )}
        </>
      )}
      {isAdmin && ownCount > 0 && (onOpenTeacherChange || onOpenAbsence) && (
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {onOpenTeacherChange && (
            <button
              type="button"
              onClick={() =>
                onOpenTeacherChange({ oldTeacher: rec.teacher, from: rec.startDate, until: rec.endDate, memo: rec.memo || "" })
              }
              style={S.btn(true)}
            >
              👤 担当変更（期間限定）にする
            </button>
          )}
          {onOpenAbsence && (
            <button
              type="button"
              onClick={() =>
                onOpenAbsence({ teachers: [rec.teacher], fromDate: rec.startDate, toDate: rec.endDate, memo: rec.memo || "" })
              }
              style={S.btn(false)}
            >
              🤒 欠勤として登録する
            </button>
          )}
          <span style={{ ...hint, alignSelf: "center" }}>
            代わりの先生が決まっていれば担当変更、まだなら欠勤 (代行を探す) に。
          </span>
        </div>
      )}
    </div>
  );
}
