import { useMemo, useState } from "react";
import { S } from "../styles/common";
import { useConfirm } from "../hooks/useConfirm";
import { timeStartToMin } from "../utils/dateHelpers";
import {
  TIME_BULK_PRESETS,
  isWellFormedTimeRange,
  planTimeBulkEdit,
} from "../utils/timeBulkEdit";

const DAY_CHOICES = ["月", "火", "水", "木", "金", "土", "日"];

// ─── 時刻一括変換パネル (期切替支援) ────────────────────────────────
// 前期 → 後期のように「割当はそのまま、時刻だけ変わる」期の切替で、
// 複製した時間割のコマ時刻をまとめて差し替える。時間割管理ビュー内に
// 表示する管理者専用ツール。適用前に対象件数をプレビューし、確認
// ダイアログを経てから保存する。
export function TimeBulkEditPanel({ timetables, slots, ttCrud, isAdmin }) {
  const confirm = useConfirm();
  // 変換先はふつう直近に複製した時間割なので、初期値は一覧の末尾。
  const [rawTimetableId, setTimetableId] = useState(
    () => timetables[timetables.length - 1]?.id ?? 1
  );
  // 選択中の時間割が削除されたら先頭へフォールバック (表示と適用対象のずれ防止)
  const timetableId = timetables.some((t) => t.id === rawTimetableId)
    ? rawTimetableId
    : timetables[0]?.id ?? 1;
  const [gradesText, setGradesText] = useState("");
  const [days, setDays] = useState([]);
  const [mappings, setMappings] = useState([{ from: "", to: "" }]);

  const grades = useMemo(
    () =>
      gradesText
        .split(/[,、\s]+/)
        .map((g) => g.trim())
        .filter(Boolean),
    [gradesText]
  );
  const filter = useMemo(
    () => ({ timetableId, grades, days }),
    [timetableId, grades, days]
  );

  // from 候補: フィルタに合致するコマの時刻を件数付きで列挙。
  const timeOptions = useMemo(() => {
    const counts = new Map();
    for (const s of slots) {
      if ((s.timetableId ?? 1) !== timetableId) continue;
      if (grades.length > 0 && !grades.includes(s.grade)) continue;
      if (days.length > 0 && !days.includes(s.day)) continue;
      const t = (s.time || "").trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => timeStartToMin(a[0]) - timeStartToMin(b[0]))
      .map(([time, count]) => ({ time, count }));
  }, [slots, timetableId, grades, days]);

  const activeMappings = useMemo(
    () => mappings.filter((m) => m.from.trim() && m.to.trim()),
    [mappings]
  );
  const plan = useMemo(
    () => planTimeBulkEdit(slots, filter, activeMappings),
    [slots, filter, activeMappings]
  );
  const badTo = mappings.some(
    (m) => m.to.trim() && !isWellFormedTimeRange(m.to)
  );
  const total = plan.changes.length;

  const updateMapping = (idx, key, value) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [key]: value } : m))
    );
  };

  const applyPreset = (preset) => {
    setGradesText(preset.grades.join(", "));
    setDays([...preset.days]);
    setMappings(preset.mappings.map((m) => ({ ...m })));
  };

  const apply = async () => {
    const tt = timetables.find((t) => t.id === timetableId);
    const lines = activeMappings
      .map(
        (m, i) =>
          `  ${m.from} → ${m.to}（${plan.countsByMapping[i] || 0} 件）`
      )
      .join("\n");
    const ok = await confirm({
      title: "時刻一括変換",
      message:
        `「${tt?.name ?? "?"}」の ${total} 件のコマの時刻を変換します。\n${lines}\n\nよろしいですか？`,
      okLabel: "変換する",
    });
    if (!ok) return;
    ttCrud.bulkRetime(filter, activeMappings);
  };

  if (!isAdmin) return null;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fafafa",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>時刻一括変換</span>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          期の切替（前期 → 後期など）で複製した時間割のコマ時刻をまとめて差し替えます。
          学年は完全一致で照合します（「中3」指定で附中3は対象外）。
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* プリセット */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>プリセット:</span>
          {TIME_BULK_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              title={p.description}
              style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px", background: "#e8eef8", color: "#2a4a8e" }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            対象時間割
            <select
              value={timetableId}
              onChange={(e) => setTimetableId(Number(e.target.value))}
              style={{ ...S.input, marginTop: 2, display: "block", minWidth: 180 }}
            >
              {timetables.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 160 }}>
            対象学年（カンマ区切り、空欄で全学年）
            <input
              type="text"
              value={gradesText}
              onChange={(e) => setGradesText(e.target.value)}
              placeholder="例: 中3"
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>対象曜日</span>
          {DAY_CHOICES.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setDays((prev) =>
                    on ? prev.filter((x) => x !== d) : [...prev, d]
                  )
                }
                style={{
                  ...S.btn(on),
                  fontSize: 11,
                  padding: "4px 9px",
                }}
              >
                {d}
              </button>
            );
          })}
          <span style={{ fontSize: 10, color: "#aaa", marginLeft: 4 }}>
            未選択 = 全曜日
          </span>
        </div>

        {/* 置換マップ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {mappings.map((m, idx) => {
            // activeMappings は mappings の filter (同一参照) なので indexOf で対応付く
            const aIdx = activeMappings.indexOf(m);
            const count = aIdx >= 0 ? plan.countsByMapping[aIdx] || 0 : null;
            const toInvalid = m.to.trim() && !isWellFormedTimeRange(m.to);
            return (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={m.from}
                  onChange={(e) => updateMapping(idx, "from", e.target.value)}
                  style={{ ...S.input, width: "auto", minWidth: 170 }}
                >
                  <option value="">変換元の時刻を選択</option>
                  {timeOptions.map((o) => (
                    <option key={o.time} value={o.time}>
                      {o.time}（{o.count} 件）
                    </option>
                  ))}
                  {/* 候補に無い保存済み値 (フィルタ変更後など) も残す */}
                  {m.from && !timeOptions.some((o) => o.time === m.from) && (
                    <option value={m.from}>{m.from}（0 件）</option>
                  )}
                </select>
                <span style={{ fontSize: 12, color: "#888" }}>→</span>
                <input
                  type="text"
                  value={m.to}
                  onChange={(e) => updateMapping(idx, "to", e.target.value)}
                  placeholder="18:00-18:45"
                  style={{
                    ...S.input,
                    width: 130,
                    ...(toInvalid ? { borderColor: "#c03030" } : {}),
                  }}
                />
                {count != null && (
                  <span style={{ fontSize: 11, color: count > 0 ? "#2a7a2a" : "#c03030", fontWeight: 600 }}>
                    {count} 件
                  </span>
                )}
                {toInvalid && (
                  <span style={{ fontSize: 10, color: "#c03030" }}>
                    「HH:MM-HH:MM」形式で入力してください
                  </span>
                )}
                {mappings.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMappings((prev) => prev.filter((_, i) => i !== idx))
                    }
                    style={{ ...S.btn(false), fontSize: 11, padding: "3px 8px" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          <div>
            <button
              type="button"
              onClick={() => setMappings((prev) => [...prev, { from: "", to: "" }])}
              style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
            >
              + 変換ルールを追加
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12, color: total > 0 ? "#333" : "#888", fontWeight: 600 }}>
            対象: {total} 件
          </span>
          <button
            type="button"
            onClick={apply}
            disabled={total === 0 || badTo}
            style={{
              ...S.btn(true),
              background: "#2a4a8e",
              opacity: total > 0 && !badTo ? 1 : 0.5,
            }}
          >
            変換する
          </button>
        </div>
      </div>
    </div>
  );
}
