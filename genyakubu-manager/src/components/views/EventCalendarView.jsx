import { useMemo, useState } from "react";
import { fmtDate, WEEKDAYS } from "../../data";
import { eachDateStrInRange, formatDateRange, overlapsRange } from "../../utils/dateHelpers";
import { S } from "../../styles/common";
import {
  EVENT_KIND,
  EVENT_KIND_LABELS,
  EXAM_META,
  HOLIDAY_META,
} from "../../constants/eventKinds";
import { specialEventTypeMeta } from "../../constants/specialEvents";
import { PrintButton } from "../PrintButton";
import {
  DEFAULT_EVENT_VISIBILITY,
  EventVisibilityToggles,
  isEventKindVisible,
} from "../EventVisibilityToggles";

// イベントカレンダー (休講・テスト期間・特別イベントを統合表示)
//
// 月次のグリッドを描画し、各日のセルに該当イベントをバッジとして並べる。
// 休講は常時表示。テスト期間 / 特別イベントは visibility プロパティで切替。

// 新規登録ボタン定義 (休講含む 3 種)。
const ADD_BUTTONS = Object.freeze([
  { key: EVENT_KIND.HOLIDAY, label: "休講", color: HOLIDAY_META.accent },
  { key: EVENT_KIND.EXAM, label: "テスト期間", color: EXAM_META.accent },
  { key: EVENT_KIND.SPECIAL, label: "特別イベント", color: "#8a5ec4" },
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
  onEventClick,
  onAddNewEvent,
  isAdmin = false,
  visibility = DEFAULT_EVENT_VISIBILITY,
  onChangeVisibility,
}) {
  const today = useMemo(() => new Date(), []);
  const [monthOff, setMonthOff] = useState(0);

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

  // 月内に重なるイベントだけを抽出 + 日付昇順。休講は常時表示。
  const showExam = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const showSpecial = isEventKindVisible(visibility, EVENT_KIND.SPECIAL);
  const eventsInMonth = useMemo(() => {
    const all = [];
    for (const h of holidays) {
      if (!overlapsRange(h.date, h.date, monthStart, monthEnd)) continue;
      all.push({
        kind: EVENT_KIND.HOLIDAY,
        id: `h-${h.id}`,
        name: h.label || "休講",
        startDate: h.date,
        endDate: h.date,
        meta: HOLIDAY_META,
        source: h,
      });
    }
    if (showExam) {
      for (const ep of examPeriods) {
        if (!overlapsRange(ep.startDate, ep.endDate, monthStart, monthEnd)) continue;
        all.push({
          kind: EVENT_KIND.EXAM,
          id: `e-${ep.id}`,
          name: ep.name,
          startDate: ep.startDate,
          endDate: ep.endDate,
          meta: EXAM_META,
          source: ep,
        });
      }
    }
    if (showSpecial) {
      for (const ev of specialEvents) {
        if (!overlapsRange(ev.startDate, ev.endDate, monthStart, monthEnd)) continue;
        all.push({
          kind: EVENT_KIND.SPECIAL,
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
  }, [holidays, examPeriods, specialEvents, showExam, showSpecial, monthStart, monthEnd]);

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

  const showAdd = isAdmin && !!onAddNewEvent;

  // 新規登録ボタン (ヘッダ・空状態で再利用)。hover で背景を薄く塗る。
  const renderAddButton = (f) => (
    <button
      key={`add-${f.key}`}
      type="button"
      onClick={() => onAddNewEvent(f.key)}
      title={`${f.label}を新規登録`}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${f.color}14`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#fff";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 6,
        cursor: "pointer",
        background: "#fff",
        color: f.color,
        border: `1px dashed ${f.color}`,
        fontWeight: 700,
        transition: "background .15s",
      }}
    >
      <span aria-hidden="true">+</span>
      {f.label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ヘッダ: 月送り + 新規登録 + フィルタ */}
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
          <PrintButton style={{ fontSize: 11, marginLeft: 8 }} />
        </div>
        {showAdd && (
          <>
            <div
              aria-hidden="true"
              style={{ width: 1, height: 22, background: "#e0e0e0" }}
            />
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>
                新規登録:
              </span>
              {ADD_BUTTONS.map((f) => renderAddButton(f))}
            </div>
          </>
        )}
        <div
          aria-hidden="true"
          style={{ width: 1, height: 22, background: "#e0e0e0" }}
        />
        <EventVisibilityToggles
          visibility={visibility}
          onChange={onChangeVisibility}
        />
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
                const clickable = !!onEventClick;
                // 複数日イベントは「開始日」と「週頭 (日曜) で前日から続いている日」だけ
                // 名前を表示し、それ以外は色帯のみ。1ヶ月続くイベントの名前が 30 セル
                // 並ぶのを抑える。
                const showName = isStart || (continuesLeft && dow === 0);
                return (
                  <div
                    key={ev.id}
                    title={`${EVENT_KIND_LABELS[ev.kind]}: ${ev.name}\n${formatDateRange(
                      ev.startDate,
                      ev.endDate
                    )}${ev.source.memo ? "\n" + ev.source.memo : ""}${
                      clickable ? "\n\nクリックで編集画面を開きます" : ""
                    }`}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => onEventClick(ev) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onEventClick(ev);
                            }
                          }
                        : undefined
                    }
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
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    {showName ? (
                      <>
                        {ev.kind === EVENT_KIND.SPECIAL && ev.meta.icon ? (
                          <>
                            <span aria-hidden="true">{ev.meta.icon}</span>{" "}
                          </>
                        ) : null}
                        {ev.name}
                      </>
                    ) : (
                      // 名前を出さないセルでも色帯の高さを維持するため、不可視文字
                      " "
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
            {showAdd && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  justifyContent: "center",
                  flexWrap: "wrap",
                  marginTop: 14,
                }}
              >
                {ADD_BUTTONS.map((f) => renderAddButton(f))}
              </div>
            )}
          </div>
        ) : (
          eventsInMonth.map((ev, i) => {
            const isCurrent = ev.startDate <= todayStr && todayStr <= ev.endDate;
            const isUpcoming = !isCurrent && ev.startDate > todayStr;
            const clickable = !!onEventClick;
            return (
              <div
                key={ev.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onEventClick(ev) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEventClick(ev);
                        }
                      }
                    : undefined
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "8px 14px",
                  borderBottom:
                    i < eventsInMonth.length - 1 ? "1px solid #eee" : "none",
                  background: isCurrent ? "#fffbe6" : i % 2 ? "#fafafa" : "#fff",
                  borderLeft: isCurrent ? "3px solid #e6a800" : "3px solid transparent",
                  opacity: !isCurrent && !isUpcoming ? 0.55 : 1,
                  cursor: clickable ? "pointer" : "default",
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
                  {ev.kind === EVENT_KIND.SPECIAL && ev.meta.icon ? `${ev.meta.icon} ` : ""}
                  {EVENT_KIND_LABELS[ev.kind]}
                </span>
                <strong style={{ fontSize: 13 }}>{ev.name}</strong>
                <span style={{ fontSize: 11, color: "#666" }}>
                  {formatDateRange(ev.startDate, ev.endDate)}
                </span>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "#e6a800",
                      color: "#fff",
                    }}
                  >
                    今日
                  </span>
                )}
                {ev.kind === EVENT_KIND.SPECIAL && ev.source.memo && (
                  <span
                    style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                  >
                    {ev.source.memo}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
