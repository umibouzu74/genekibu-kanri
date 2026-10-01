import { useMemo } from "react";
import { useToday } from "../hooks/useToday";
import { S, colors } from "../styles/common";
import { fmtNoteDate, fmtOffset, seasonalNotes } from "../utils/handoverNotes";

const MAX_ITEMS = 3;

// ダッシュボードの先頭に出す「📌 去年のこの時期」(引継ぎメモ、管理者のみ)。
// 後任は引継ぎメモの画面を毎日開くとは限らないので、毎日見る画面で
// 「去年の今ごろ何があったか」に気付けるようにする。判定は日付だけ
// (seasonalNotes。閲覧履歴などでは変えない)。該当が無い日は何も出さない。
// 画面の道具なので紙面には載せない (no-print)。
export function HandoverSeasonBanner({ notes, onOpenNote, onOpenList, onAdd }) {
  const today = useToday();
  const items = useMemo(() => seasonalNotes(notes, today), [notes, today]);
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_ITEMS);
  const rest = items.length - shown.length;
  const linkBtn = {
    background: "none",
    border: "none",
    padding: 0,
    color: colors.accentBlue,
    cursor: "pointer",
    fontSize: 12,
    textDecoration: "underline",
  };
  return (
    <section
      className="no-print"
      aria-label="去年のこの時期 (引継ぎメモ)"
      style={{
        ...S.panel,
        padding: "8px 12px",
        background: colors.infoSoft,
        borderColor: colors.infoBorder,
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>📌 去年のこの時期 (引継ぎメモ)</b>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {onAdd && (
            <button type="button" onClick={onAdd} style={linkBtn}>
              ✏ メモを書く
            </button>
          )}
          {onOpenList && (
            <button type="button" onClick={onOpenList} style={linkBtn}>
              引継ぎメモを開く
            </button>
          )}
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {shown.map(({ note, offset }) => (
          <li key={note.id}>
            <b>{fmtOffset(offset)}</b>{" "}
            <button
              type="button"
              onClick={() => onOpenNote?.(note.id)}
              title={`${fmtNoteDate(note.date)} のメモを開く`}
              style={{ ...linkBtn, fontSize: 13, color: colors.ink }}
            >
              {note.title}
            </button>{" "}
            <span style={{ color: colors.inkMuted, fontSize: 12 }}>({fmtNoteDate(note.date)})</span>
            {note.advice && (
              <span style={{ color: "#444", fontSize: 12 }}> → {note.advice.split("\n")[0]}</span>
            )}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <div style={{ fontSize: 12, color: colors.inkMuted }}>ほか {rest} 件</div>
      )}
    </section>
  );
}
