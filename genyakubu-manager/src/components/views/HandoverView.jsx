import { useEffect, useMemo, useRef, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { PrintButton } from "../PrintButton";
import { HandoverNoteForm } from "../HandoverNoteForm";
import { S, colors } from "../../styles/common";
import {
  HANDOVER_CATEGORIES,
  addHandoverNote,
  draftFromNote,
  emptyHandoverDraft,
  filterNotes,
  fmtNoteDate,
  fmtOffset,
  groupByMonthOfYear,
  groupByYearMonth,
  notesToMarkdown,
  seasonalNotes,
  splitPinned,
  updateHandoverNote,
  validateHandoverDraft,
} from "../../utils/handoverNotes";

// ─── 引継ぎメモ ─────────────────────────────────────────────────────
// 責任者が日々気付いたことを 1 行ずつ書き溜め、後任に渡す画面。
// 書くときは「日付 + 分類 + 1 行」だけで済むようにし (詳細と「次の担当者へ」
// は任意)、読むときは時系列 / 月別 (年度の流れ) を切り替える。去年までの
// 同じ時期のメモは先頭に出す。日付に縛られないこと (手順・連絡先) は
// 「📚 いつでも必要なこと」として並べ方によらず先頭に固定する。
// 外 (ダッシュボードの「去年のこの時期」/ Cmd+K) から focusRequest で 1 件を
// 指定されたら、絞り込みを外してそこまでスクロールし、少しの間強調する。
// 組み立ては utils/handoverNotes.js。
//
// 削除は cascade 無しなので removeWithUndo (CLAUDE.md の削除 UX ルール)。
// 印刷系統: PrintButton (window.print())。紙面は一覧だけで、入力欄・検索・
// この時期のパネルは no-print。

const PRINT_CSS = `
@media print {
  .handover-note { break-inside: avoid; page-break-inside: avoid; }
  .handover-group-title { break-after: avoid; page-break-after: avoid; }
  .handover-note { box-shadow: none !important; }
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

function download(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NoteCard({ note, editing, highlighted, onEdit, onRemove, children }) {
  const tone = toneOf(note.category);
  return (
    <article
      id={`handover-note-${note.id}`}
      className="handover-note"
      style={{
        ...S.panel,
        boxShadow: highlighted ? `0 0 0 3px ${colors.warning}` : undefined,
        transition: "box-shadow .4s",
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
              {note.pinned ? `${fmtNoteDate(note.date)} 記入` : fmtNoteDate(note.date)}
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

export function HandoverView({
  notes = [],
  onSave,
  enabled = true,
  focusRequest = null,
  onConsumeFocus,
}) {
  const today = useToday();
  const toasts = useToasts();
  const remove = useRemoveWithUndo({ list: notes, save: onSave });

  const [draft, setDraft] = useState(() => emptyHandoverDraft(today));
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [mode, setMode] = useState("timeline");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [highlightId, setHighlightId] = useState(null);

  const filtered = useMemo(
    () => filterNotes(notes, { query, category }),
    [notes, query, category]
  );
  const { pinned, dated } = useMemo(() => splitPinned(filtered), [filtered]);
  const groups = useMemo(
    () => (mode === "month" ? groupByMonthOfYear(dated) : groupByYearMonth(dated)),
    [mode, dated]
  );
  const seasonal = useMemo(() => seasonalNotes(notes, today), [notes, today]);

  // 外から指定された 1 件へ飛ぶ。絞り込みで隠れていたら外す。スクロールは
  // 描画が確定してから (この effect の後の描画) なので 1 タスク譲る。
  // 要求は受け取ったら消してもらう (onConsumeFocus。サイドバーから開き直した
  // ときに古い要求でまた飛ばない)。消した後の再実行でタイマーを止めないよう、
  // タイマーはアンマウント時にだけ片付ける
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const timersRef = useRef([]);
  useEffect(() => {
    const id = focusRequest?.id;
    if (id == null) return;
    onConsumeFocus?.();
    if (!notesRef.current.some((n) => n.id === id)) return;
    setQuery("");
    setCategory("");
    setEditingId(null);
    setHighlightId(id);
    timersRef.current.push(
      setTimeout(() => {
        const el = document.getElementById(`handover-note-${id}`);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 0),
      setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2500)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 要求 (token) が変わったときだけ動く
  }, [focusRequest]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  if (!enabled) {
    return (
      <div style={{ ...S.panel, padding: 16, fontSize: 14 }}>
        引継ぎメモは管理者だけが読めます。サイドバー下の「管理者ログイン」からログインしてください。
      </div>
    );
  }

  const nowIso = () => new Date().toISOString();

  const add = () => {
    const err = validateHandoverDraft(draft);
    if (err) {
      toasts.error(err);
      return;
    }
    onSave(addHandoverNote(notes, draft, nowIso()));
    toasts.success("引継ぎメモを追加しました");
    // 同じ日に続けて書くことが多いので日付と分類は残す
    setDraft(emptyHandoverDraft(draft.date, draft.category));
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setEditDraft(draftFromNote(n));
  };

  const saveEdit = () => {
    const err = validateHandoverDraft(editDraft);
    if (err) {
      toasts.error(err);
      return;
    }
    onSave(updateHandoverNote(notes, editingId, editDraft, nowIso()));
    setEditingId(null);
    setEditDraft(null);
    toasts.success("引継ぎメモを更新しました");
  };

  const renderCard = (n) => (
    <NoteCard
      key={n.id}
      note={n}
      editing={editingId === n.id}
      highlighted={highlightId === n.id}
      onEdit={() => startEdit(n)}
      onRemove={() => remove(n.id, { successMsg: "引継ぎメモを削除しました" })}
    >
      {editingId === n.id && (
        <HandoverNoteForm
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
  );

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
        <HandoverNoteForm
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
        <>
          {pinned.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2
                className="handover-group-title"
                style={{ fontSize: 15, margin: "4px 0 0", borderBottom: `2px solid ${colors.border}` }}
              >
                📚 いつでも必要なこと
                <span style={{ fontSize: 12, fontWeight: 400, color: colors.inkMuted, marginLeft: 8 }}>
                  {pinned.length} 件
                </span>
              </h2>
              {pinned.map(renderCard)}
            </section>
          )}
          {groups.map((g) => (
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
              {g.notes.map(renderCard)}
            </section>
          ))}
        </>
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
            ダッシュボードの先頭にも「📌 去年のこの時期」として出ます。
          </li>
          <li>
            手順・連絡先・物の置き場所のように日付に関係ないことは「詳しく書く」で
            「📚 いつでも必要なこと」にすると、どの並べ方でも先頭に固定されます。
          </li>
          <li>
            どの画面からでも Cmd+K (Ctrl+K) →「引継ぎメモを書く」で書けます。Cmd+K の検索は
            メモの中身も探します。
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
