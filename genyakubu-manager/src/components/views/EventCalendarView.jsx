import { useMemo, useState } from "react";
import { fmtDate, WEEKDAYS } from "../../data";
import { eachDateStrInRange } from "../../utils/dateHelpers";
import { S } from "../../styles/common";
import { specialEventTypeMeta } from "../../constants/specialEvents";

// イベントカレンダー (休講・テスト期間・特別イベントを統合表示)
//
// 月次のグリッドを描画し、各日のセルに該当イベントをバッジとして並べる。
// 種別ごとに色を分けてフィルタ可能。

// 種別キー (kind 文字列の単一の出所)
const KIND = Object.freeze({
  HOLIDAY: "holiday",
  EXAM: "exam",
  SPECIAL: "special",
});

const KIND_LABELS = Object.freeze({
  [KIND.HOLIDAY]: "休講",
  [KIND.EXAM]: "テスト期間",
  [KIND.SPECIAL]: "特別イベント",
});

const HOLIDAY_META = Object.freeze({ bg: "#f5dada", fg: "#a02020", accent: "#c44040" });
const EXAM_META = Object.freeze({ bg: "#fde8c8", fg: "#7a4a10", accent: "#e0a030" });

// フィルタチェックボックス UI 定義 (描画毎に再生成しないようモジュールレベルに)
const FILTER_BUTTONS = Object.freeze([
  { key: KIND.HOLIDAY, label: "休講", color: HOLIDAY_META.accent },
  { key: KIND.EXAM, label: "テスト期間", color: EXAM_META.accent },
  { key: KIND.SPECIAL, label: "特別イベント", color: "#8a5ec4" },
]);

// 連続バーの border-radius を、左右の継続フラグから決定する。
function barBorderRadius(continuesLeft, continuesRight) {
  if (continuesLeft && continuesRight) return 0;
  if (continuesLeft) return "0 4px 4px 0";
  if (continuesRight) return "4px 0 0 4px";
  return 4;
}

export function EventCalendarView({
  holidays = [],
  examPeriods = [],
  specialEvents = [],
}) {
  const today = useMemo(() => new Date(), []);
  const [monthOff, setMonthOff] = useState(0);
  const [filters, setFilters] = useState({
    [KIND.HOLIDAY]: true,
    [KIND.EXAM]: true,
    [KIND.SPECIAL]: true,
  });

  const vd = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + monthOff, 1),
    [today, monthOff]
  );
  const year = vd.getFullYear();
  const month = vd.getMonth() + 1; // 1-indexed
  const dim = useMemo(
    () => new Date(year, month, 0).getDate(),
    [year, month]
  );
  const firstDow = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);

  // セル配列: 先頭の空セル + 日付セル + 末尾の空セル (7 の倍数になるよう詰める)
  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(d);
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [firstDow, dim]);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;

  // 月内に重なるイベントだけを抽出 + 日付昇順
  const eventsInMonth = useMemo(() => {
    const all = [];
    if (filters[KIND.HOLIDAY]) {
      for (const h of holidays) {
        if (h.date < monthStart || h.date > monthEnd) continue;
        all.push({
          kind: KIND.HOLIDAY,
          id: `h-${h.id}`,
          name: h.label || "休講",
          startDate: h.date,
          endDate: h.date,
          meta: HOLIDAY_META,
          source: h,
        });
      }
    }
    if (filters[KIND.EXAM]) {
      for (const ep of examPeriods) {
        if (ep.endDate < monthStart || ep.startDate > monthEnd) continue;
        all.push({
          kind: KIND.EXAM,
          id: `e-${ep.id}`,
          name: ep.name,
          startDate: ep.startDate,
          endDate: ep.endDate,
          meta: EXAM_META,
          source: ep,
        });
      }
    }
    if (filters[KIND.SPECIAL]) {
      for (const ev of specialEvents) {
        if (ev.endDate < monthStart || ev.startDate > monthEnd) continue;
        all.push({
          kind: KIND.SPECIAL,
          id: `s-${ev.id}`,
          name: ev.name,
          startDate: ev.startDate,
          endDate: ev.endDate,
          meta: specialEventTypeMeta(ev.eventType),
          source: ev,
        });
      }
    }
    return all.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate)
    );
  }, [holidays, examPeriods, specialEvents, filters, monthStart, monthEnd]);

  // 日付 → イベント[] の索引 (グリッド表示用)
  const eventsByDate = useMemo(() => {
    const m = new Map();
    for (const ev of eventsInMonth) {
      for (const key of eachDateStrInRange(ev.startDate, ev.endDate)) {
        if (key < monthStart || key > monthEnd) continue;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(ev);
      }
    }
    return m;
  }, [eventsInMonth, monthStart, monthEnd]);

  const todayStr = fmtDate(today);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ヘッダ: 月送り + フィルタ */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#fff",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #e0e0e0",
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setMonthOff((o) => o - 1)}
            style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
          >
            ◀
          </button>
          <span style={{ fontSize: 15, fontWeight: 800 }}>
            {year}年{month}月
          </span>
          <button
            type="button"
            onClick={() => setMonthOff((o) => o + 1)}
            style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => setMonthOff(0)}
            style={{ ...S.btn(false), fontSize: 11 }}
          >
            今月
          </button>
        </div>
        <div
          aria-hidden="true"
          style={{ width: 1, height: 22, background: "#e0e0e0" }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>表示:</span>
          {FILTER_BUTTONS.map((f) => {
            const on = filters[f.key];
            return (
              <label
                key={f.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: on ? "#fff" : "#f5f5f5",
                  color: on ? f.color : "#aaa",
                  border: `1px solid ${on ? f.color : "#ddd"}`,
                  fontWeight: on ? 700 : 400,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setFilters((p) => ({ ...p, [f.key]: !p[f.key] }))
                  }
                  style={{ display: "none" }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: f.color,
                    opacity: on ? 1 : 0.3,
                  }}
                />
                {f.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* 月グリッド */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 1,
          background: "#ccc",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              background: w === "日" ? "#f5e0e0" : w === "土" ? "#e0e0f5" : "#eee",
              textAlign: "center",
              padding: "6px 0",
              fontWeight: 800,
              fontSize: 12,
              color: w === "日" ? "#c44" : w === "土" ? "#44c" : "#333",
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) {
            return (
              <div
                key={`empty-${i}`}
                style={{ background: "#fafafa", minHeight: 110 }}
              />
            );
          }
          const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dow = new Date(year, month - 1, d).getDay();
          const evs = eventsByDate.get(ds) || [];
          const isT = ds === todayStr;
          return (
            <div
              key={ds}
              style={{
                background: isT
                  ? "#fffbe6"
                  : dow === 0
                    ? "#fdf5f5"
                    : dow === 6
                      ? "#f5f5fd"
                      : "#fff",
                minHeight: 110,
                padding: 4,
                border: isT ? "2px solid #e6a800" : "none",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isT ? 800 : 600,
                  color:
                    dow === 0 ? "#c44" : dow === 6 ? "#44c" : "#333",
                  marginBottom: 2,
                }}
              >
                {d}
              </div>
              {evs.map((ev) => {
                const isStart = ev.startDate === ds;
                const isEnd = ev.endDate === ds;
                const continuesLeft = !isStart && ev.startDate < ds;
                const continuesRight = !isEnd && ev.endDate > ds;
                return (
                  <div
                    key={ev.id}
                    title={`${KIND_LABELS[ev.kind]}: ${ev.name}\n${ev.startDate}${
                      ev.startDate !== ev.endDate ? ` 〜 ${ev.endDate}` : ""
                    }${ev.source.memo ? "\n" + ev.source.memo : ""}`}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 5px",
                      background: ev.meta.bg,
                      color: ev.meta.fg,
                      borderLeft: continuesLeft
                        ? "none"
                        : `3px solid ${ev.meta.accent}`,
                      borderRadius: barBorderRadius(continuesLeft, continuesRight),
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isStart ? (
                      <>
                        {ev.kind === KIND.SPECIAL && ev.meta.icon ? (
                          <>
                            <span aria-hidden="true">{ev.meta.icon}</span>{" "}
                          </>
                        ) : null}
                        {ev.name}
                      </>
                    ) : (
                      <span style={{ opacity: 0.55 }}>↳</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 月内イベントの一覧 */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid #eee",
            fontSize: 13,
            fontWeight: 700,
            color: "#1a1a2e",
            background: "#f8f9fa",
          }}
        >
          {year}年{month}月のイベント一覧 ({eventsInMonth.length}件)
        </div>
        {eventsInMonth.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "#888",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>
              📅
            </div>
            <div style={{ fontWeight: 700, color: "#555" }}>
              該当するイベントはありません
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              フィルタを切り替える、または別の月を確認してください
            </div>
          </div>
        ) : (
          eventsInMonth.map((ev, i) => (
            <div
              key={ev.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                padding: "8px 14px",
                borderBottom:
                  i < eventsInMonth.length - 1 ? "1px solid #eee" : "none",
                background: i % 2 ? "#fafafa" : "#fff",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: ev.meta.bg,
                  color: ev.meta.fg,
                  border: `1px solid ${ev.meta.accent}`,
                  minWidth: 88,
                  textAlign: "center",
                }}
              >
                {ev.kind === KIND.SPECIAL && ev.meta.icon ? `${ev.meta.icon} ` : ""}
                {KIND_LABELS[ev.kind]}
              </span>
              <strong style={{ fontSize: 13 }}>{ev.name}</strong>
              <span style={{ fontSize: 11, color: "#666" }}>
                {ev.startDate === ev.endDate
                  ? ev.startDate
                  : `${ev.startDate} 〜 ${ev.endDate}`}
              </span>
              {ev.kind === KIND.SPECIAL && ev.source.memo && (
                <span
                  style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                >
                  {ev.source.memo}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
