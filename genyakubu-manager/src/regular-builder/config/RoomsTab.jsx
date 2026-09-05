import { useMemo, useState } from "react";
import { collectRoomUsage } from "../model";
import { UI } from "../ui";
import { CHIP_DELETE_BTN, SECTION_HEAD, move } from "./shared";

// ⚙ 全体設定 → 🏫 教室マスタ (+ マスタに無い使用中の教室の検出)
export function RoomsTab({ project, saveProject }) {
  const [newRoom, setNewRoom] = useState("");

  // 教室マスタと、実際に使われている教室の突き合わせ。マスタに無い教室は
  // 表記ゆれ ("５０1" と "501" など) の可能性がある — 重複チェックも
  // 亀井町判定も文字列一致なので、揺れていると黙ってすり抜ける
  const roomUsage = useMemo(() => collectRoomUsage(project), [project]);
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

  return (
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
              className={`${CHIP_DELETE_BTN} disabled:opacity-25`}
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
              className={`${CHIP_DELETE_BTN} disabled:opacity-25`}
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
              className={CHIP_DELETE_BTN}
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
        <span className={SECTION_HEAD}>
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
  );
}
