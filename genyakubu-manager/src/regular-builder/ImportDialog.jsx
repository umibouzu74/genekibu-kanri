import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";

// ─── 本体から取込ダイアログ ─────────────────────────────────────────
// 本体の時間割 (Slot 群) を選んで新しいプロジェクトとして取り込む。
// オプションで「中3 の 2学期変更」(平日前倒し + 土曜内申の午前枠) を
// 取込と同時に適用できる — 1学期を取り込んでこのチェックを入れれば、
// 2学期のたたき台が一発でできる。

export function ImportDialog({ timetables, slots, onImport, onClose }) {
  const [sourceId, setSourceId] = useState(timetables[0]?.id ?? 1);
  const [name, setName] = useState(timetables[0]?.name ?? "");
  const [applyShift, setApplyShift] = useState(false);
  const [splitWeekend, setSplitWeekend] = useState(true);
  const [splitBuilding, setSplitBuilding] = useState(true);

  const count = useMemo(
    () => slots.filter((s) => (s.timetableId ?? 1) === Number(sourceId)).length,
    [slots, sourceId]
  );

  const changeSource = (id) => {
    setSourceId(id);
    const tt = timetables.find((t) => t.id === id);
    // 名前を手で変えていなければ取込元の名前に追従させる
    setName((prev) => {
      const untouched = timetables.some((t) => t.name === prev) || !prev.trim();
      return untouched ? tt?.name ?? prev : prev;
    });
  };

  return (
    <Modal title="本体から取込" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <label style={{ fontWeight: 600 }}>
          取込元の時間割
          <select
            value={sourceId}
            onChange={(e) => changeSource(Number(e.target.value))}
            style={{ ...S.input, marginTop: 2, display: "block", minWidth: 220 }}
          >
            {timetables.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
            {count} コマを新しいプロジェクトとして取り込みます
          </span>
        </label>

        <label style={{ fontWeight: 600 }}>
          プロジェクト名
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 2026 1学期"
            style={{ ...S.input, marginTop: 2 }}
          />
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={splitWeekend}
            onChange={(e) => setSplitWeekend(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            平日と土曜で学年タブを分ける
            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
              平日と土日の両方にコマがある学年を「中3」「中3 (土)」のように 2 タブに分けます。
              曜日で時刻体系が違う学年のマス目が見やすくなります。
            </div>
          </span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={splitBuilding}
            onChange={(e) => setSplitBuilding(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            教室の建物（亀井町）で学年タブを分ける
            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
              教室が「亀◯◯」のコマとそれ以外の両方がある学年を「高2」「高2 (亀)」のように分けます。
              各学年にはグループ名（中学部 / 附属 / 高校部・本校 / 高校部・亀井町）が自動で付き、
              曜日ビューでダッシュボードと同じセクション構成になります（学年設定で変更可）。
            </div>
          </span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={applyShift}
            onChange={(e) => setApplyShift(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            中3 の 2学期変更を適用する
            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
              平日: 最終コマ 20:45-21:30 の内容を新 1 限 18:00-18:45 へ移動し、確認テストを 20:40-20:55 に繰り上げます。
              土曜: 内申対策の午前枠（10:00-11:00 / 11:10-12:10 / 12:50-13:50 / 14:00-15:00）を空の時限として追加します。
            </div>
          </span>
        </label>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={() =>
              onImport({
                sourceId: Number(sourceId),
                name: name.trim(),
                applyShift,
                splitWeekend,
                splitBuilding,
              })
            }
            disabled={!name.trim() || count === 0}
            style={{
              ...S.btn(true),
              background: "#2a4a8e",
              opacity: name.trim() && count > 0 ? 1 : 0.5,
            }}
          >
            取り込む
          </button>
        </div>
      </div>
    </Modal>
  );
}
