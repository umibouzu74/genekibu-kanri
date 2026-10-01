import { useMemo, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { PrintButton } from "../PrintButton";
import { S, colors } from "../../styles/common";
import { isValidDateStr } from "../../utils/dateHelpers";
import { nextNumericId } from "../../utils/schema";
import {
  DEFAULT_HANDOVER_CATEGORY,
  HANDOVER_CATEGORIES,
  filterNotes,
  fmtNoteDate,
  fmtOffset,
  groupByMonthOfYear,
  groupByYearMonth,
  normalizeHandoverNote,
  notesToMarkdown,
  seasonalNotes,
} from "../../utils/handoverNotes";

// ─── 引継ぎメモ ─────────────────────────────────────────────────────
// 責任者が日々気付いたことを 1 行ずつ書き溜め、後任に渡す画面。
// 書くときは「日付 + 分類 + 1 行」だけで済むようにし (詳細と「次の担当者へ」
// は任意)、読むときは時系列 / 月別 (年度の流れ) を切り替える。去年までの
// 同じ時期のメモは先頭に出す。組み立ては utils/handoverNotes.js。
//
// 削除は cascade 無しなので removeWithUndo (CLAUDE.md の削除 UX ルール)。
// 印刷系統: PrintButton (window.print())。紙面は一覧だけで、入力欄・検索・
// この時期のパネルは no-print。

const PRINT_CSS = `
@media print {
  .handover-note { break-inside: avoid; page-break-inside: avoid; }
  .handover-group-title { break-after: avoid; page-break-after: avoid; }
}
`;

const CATEGORY_TONE = {
  事務: { bg: "#eef2ff", fg: "#1a1a6e" },
  講師: { bg: "#e8f5e8", fg: "#2a7a2a" },
  "生徒・保護者": { bg: "#fff1e6", fg: "#a04a00" },
  "行事・講習": { bg: "#f6ecff", fg: "#6a2a9e" },
  "教材・テスト": { bg: "#fffbe6", fg: "#8a6000" },
  "設備・システム": { bg: "#eef6f8", fg: "#2e6a7e" },
};
const toneOf = (c) => CATEGORY_TONE[c] || { bg: "#ececf0", fg: "#555" };

const chip = (bg, fg) => ({
  display: "inline-block",
  padding: "1px 8px",
  borderRadius: 10,
  background: bg,
  color: fg,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
});

const emptyDraft = (date, category = DEFAULT_HANDOVER_CATEGORY) => ({
  date,
  category,
  title: "",
  body: "",
  advice: "",
  annual: false,
});

function download(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 追加と編集で共有する入力欄。詳細 (経緯・次の担当者へ・毎年) は既定で
// 畳んでおき、日々の 1 行メモの手間を増やさない
function NoteForm({ draft, onChange, onSubmit, onCancel, submitLabel, defaultOpen = false, idPrefix }) {
  const [open, setOpen] = useState(
    defaultOpen || Boolean(draft.body || draft.advice || draft.annual)
  );
  const set = (patch) => onChange({ ...draft, ...patch });
  const submitOnCtrlEnter = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => set({ date: e.target.value })}
          aria-label="日付"
          style={{ ...S.input, width: 150, padding: "6px 8px" }}
        />
        <select
          value={draft.category}
          onChange={(e) => set({ category: e.target.value })}
          aria-label="分類"
          style={{ ...S.input, width: 130, padding: "6px 8px" }}
        >
          {HANDOVER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {!HANDOVER_CATEGORIES.includes(draft.category) && (
            <option value={draft.category}>{draft.category}</option>
          )}
        </select>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="何があったか (例: 事務よりズバリ的中の提出催促)"
          aria-label="メモ"
          style={{ ...S.input, flex: "1 1 260px", width: "auto", padding: "6px 8px" }}
        />
        <button type="submit" style={{ ...S.btn(true), padding: "6px 14px" }}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ ...S.btn(false), padding: "6px 12px" }}>
            キャンセル
          </button>
        )}
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 12,
            color: colors.accentBlue,
            cursor: "pointer",
          }}
        >
          ▸ 詳しく書く (経緯・次の担当者へ・毎年あること)
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={`${idPrefix}-body`} style={{ ...S.formLabel, marginBottom: 0 }}>
            経緯・詳細
          </label>
          <textarea
            id={`${idPrefix}-body`}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            onKeyDown={submitOnCtrlEnter}
            rows={2}
            placeholder="例: 9月の会議で告知済み"
            style={{ ...S.input, fontSize: 13, resize: "vertical" }}
          />
          <label htmlFor={`${idPrefix}-advice`} style={{ ...S.formLabel, marginBottom: 0 }}>
            次の担当者へ
          </label>
          <textarea
            id={`${idPrefix}-advice`}
            value={draft.advice}
            onChange={(e) => set({ advice: e.target.value })}
            onKeyDown={submitOnCtrlEnter}
            rows={2}
            placeholder="例: 9月の会議で告知したあと、月末に講師へ念押ししておくと催促が来ない"
            style={{ ...S.input, fontSize: 13, resize: "vertical" }}
          />
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.annual}
              onChange={(e) => set({ annual: e.target.checked })}
            />
            🔁 毎年この時期にあること
          </label>
        </div>
      )}
    </form>
  );
}

function NoteCard({ note, editing, onEdit, onRemove, children }) {
  const tone = toneOf(note.category);
  return (
    <article
      className="handover-note"
      style={{
        ...S.panel,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderLeft: `4px solid ${tone.fg}`,
      }}
    >
      {editing ? (
        children
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.inkMuted }}>
              {fmtNoteDate(note.date)}
            </span>
            <span style={chip(tone.bg, tone.fg)}>{note.category}</span>
            {note.annual && <span style={chip("#e8f2ea", colors.accentGreen)}>🔁 毎年</span>}
            {onEdit && (
              <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={`${note.title} を編集`}
                  style={{ ...S.btn(false), padding: "2px 10px", fontSize: 11 }}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label={`${note.title} を削除`}
                  style={{ ...S.btn(false), padding: "2px 10px", fontSize: 11, color: colors.danger }}
                >
                  削除
                </button>
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "pre-wrap" }}>{note.title}</div>
          {note.body && (
            <div style={{ fontSize: 13, color: "#444", whiteSpace: "pre-wrap" }}>{note.body}</div>
          )}
          {note.advice && (
            <div
              style={{
                fontSize: 13,
                whiteSpace: "pre-wrap",
                background: colors.warningSoft,
                borderRadius: 4,
                padding: "4px 8px",
              }}
            >
              <b>→ 次の担当者へ:</b> {note.advice}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function HandoverView({ notes = [], onSave, enabled = true }) {
  const today = useToday();
  const toasts = useToasts();
  const remove = useRemoveWithUndo({ list: notes, save: onSave });

  const [draft, setDraft] = useState(() => emptyDraft(today));
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [mode, setMode] = useState("timeline");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const filtered = useMemo(
    () => filterNotes(notes, { query, category }),
    [notes, query, category]
  );
  const groups = useMemo(
    () => (mode === "month" ? groupByMonthOfYear(filtered) : groupByYearMonth(filtered)),
    [mode, filtered]
  );
  const seasonal = useMemo(() => seasonalNotes(notes, today), [notes, today]);

  if (!enabled) {
    return (
      <div style={{ ...S.panel, padding: 16, fontSize: 14 }}>
        引継ぎメモは管理者だけが読めます。サイドバー下の「管理者ログイン」からログインしてください。
      </div>
    );
  }

  const validate = (d) => {
    if (!isValidDateStr(d.date)) return "日付を入れてください";
    if (!d.title.trim()) return "何があったかを 1 行で入れてください";
    return null;
  };

  const add = () => {
    const err = validate(draft);
    if (err) {
      toasts.error(err);
      return;
    }
    const now = new Date().toISOString();
    const note = normalizeHandoverNote({
      ...draft,
      id: nextNumericId(notes),
      createdAt: now,
      updatedAt: now,
    });
    onSave([...notes, note]);
    toasts.success("引継ぎメモを追加しました");
    // 同じ日に続けて書くことが多いので日付と分類は残す
    setDraft(emptyDraft(draft.date, draft.category));
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setEditDraft({
      date: n.date,
      category: n.category,
      title: n.title,
      body: n.body || "",
      advice: n.advice || "",
      annual: Boolean(n.annual),
    });
  };

  const saveEdit = () => {
    const err = validate(editDraft);
    if (err) {
      toasts.error(err);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      notes.map((n) =>
        n.id === editingId
          ? normalizeHandoverNote({ ...n, ...editDraft, id: n.id, updatedAt: now })
          : n
      )
    );
    setEditingId(null);
    setEditDraft(null);
    toasts.success("引継ぎメモを更新しました");
  };

  const exportText = () => {
    const filteredNote = query || category ? " (絞り込み中)" : "";
    download(
      `引継ぎメモ-${today}.md`,
      notesToMarkdown(filtered, { title: `引継ぎメモ${filteredNote}`, generatedOn: today })
    );
  };

  const tabBtn = (key, label) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      aria-pressed={mode === key}
      style={{ ...S.btn(mode === key), padding: "4px 12px", fontSize: 12 }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{PRINT_CSS}</style>

      <section className="no-print" style={{ ...S.panel, padding: "10px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>✏ 気付いたことを書く</div>
        <NoteForm
          idPrefix="handover-new"
          draft={draft}
          onChange={setDraft}
          onSubmit={add}
          submitLabel="＋ 追加"
        />
      </section>

      {seasonal.length > 0 && (
        <section
          className="no-print"
          aria-label="去年までのこの時期のメモ"
          style={{
            ...S.panel,
            padding: "10px 12px",
            background: colors.infoSoft,
            borderColor: colors.infoBorder,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
            📌 去年までのこの時期 ({seasonal.length} 件・1 週間前〜1 か月先)
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {seasonal.map(({ note, offset }) => (
              <li key={note.id} style={{ fontSize: 13 }}>
                <b>{fmtOffset(offset)}</b>{" "}
                <span style={{ color: colors.inkMuted }}>({fmtNoteDate(note.date)})</span>{" "}
                <span style={chip(toneOf(note.category).bg, toneOf(note.category).fg)}>
                  {note.category}
                </span>{" "}
                {note.title}
                {note.advice && (
                  <div style={{ fontSize: 12, color: "#444" }}>→ {note.advice}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        className="no-print"
        style={{
          ...S.panel,
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div role="group" aria-label="並べ方" style={{ display: "flex", gap: 4 }}>
          {tabBtn("timeline", "時系列")}
          {tabBtn("month", "月別 (年度の流れ)")}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索 (例: ズバリ 10月)"
          aria-label="引継ぎメモを検索"
          style={{ ...S.input, width: 200, padding: "5px 8px", fontSize: 13 }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="分類で絞り込む"
          style={{ ...S.input, width: 130, padding: "5px 8px", fontSize: 13 }}
        >
          <option value="">すべての分類</option>
          {HANDOVER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: colors.inkMuted }}>
          {filtered.length === notes.length
            ? `${notes.length} 件`
            : `${filtered.length} / ${notes.length} 件`}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={exportText}
            disabled={filtered.length === 0}
            title="表示中のメモを月別 (年度の流れ) のテキストで保存します。後任へのメールや引継ぎ書に"
            style={{ ...S.btn(false), fontSize: 12, padding: "4px 12px" }}
          >
            ⬇ テキストで書き出す
          </button>
          <PrintButton />
        </span>
      </div>

      {notes.length === 0 ? (
        <div style={{ ...S.panel, padding: 16, fontSize: 13, color: colors.inkMuted, lineHeight: 1.8 }}>
          まだメモはありません。気付いたことを上の欄に 1 行で書いておくと、後任が
          「毎年いつ何が起きるか」を月別に読めるようになります。
          <br />
          例: 2026/10/1 [事務] 事務よりズバリ的中の提出催促 — 経緯「9月の会議で告知済み」
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...S.panel, padding: 16, fontSize: 13, color: colors.inkMuted }}>
          条件に合うメモはありません。
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2
              className="handover-group-title"
              style={{ fontSize: 15, margin: "4px 0 0", borderBottom: `2px solid ${colors.border}` }}
            >
              {g.label}
              <span style={{ fontSize: 12, fontWeight: 400, color: colors.inkMuted, marginLeft: 8 }}>
                {g.notes.length} 件
              </span>
            </h2>
            {g.notes.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                editing={editingId === n.id}
                onEdit={() => startEdit(n)}
                onRemove={() => remove(n.id, { successMsg: "引継ぎメモを削除しました" })}
              >
                {editingId === n.id && (
                  <NoteForm
                    idPrefix={`handover-edit-${n.id}`}
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSubmit={saveEdit}
                    onCancel={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                    submitLabel="保存"
                  />
                )}
              </NoteCard>
            ))}
          </section>
        ))
      )}

      <details className="no-print" style={{ fontSize: 12, color: colors.inkMuted }}>
        <summary style={{ cursor: "pointer" }}>この画面の使い方</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            普段は「日付・分類・1 行」だけで十分です。経緯や「次の担当者へ」(こうしておくと
            よい) は「詳しく書く」から。詳細欄では Ctrl+Enter で保存できます。
          </li>
          <li>
            「月別 (年度の流れ)」は年をまたいで同じ月のメモを 4 月 → 3 月の順に並べます。
            引継ぎのときはこの並びで印刷・書き出しすると「1 年の流れ」として渡せます。
          </li>
          <li>
            去年以前のメモのうち、今の時期 (1 週間前〜1 か月先) にあたるものを上に出します。
          </li>
          <li>
            引継ぎメモは管理者だけが読めます (閲覧用のログインでは見えません)。データ管理の
            バックアップには管理者が書き出したときだけ含まれ、データの初期化では消えません。
          </li>
        </ul>
      </details>
    </div>
  );
}
