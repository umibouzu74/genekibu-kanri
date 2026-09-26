import { useState } from "react";
import { fmtDateWeekday, WEEKDAYS } from "../../../data";
import { useToday } from "../../../hooks/useToday";

// バイト管理の「◯月の出勤状況」を月のミニカレンダーで見せる。
// 日付を「2026-09-01 (火)、2026-09-03 (木)、…」と 1 行に並べると、何曜日に
// 何回来ているか・どの週に代行が入ったかが読めないため、日ごとに色で塗る。
// 判定 (どの日が通常出勤か等) は呼び出し側の staffHelpers の結果をそのまま
// 受け取り、ここでは描画だけを担う。
//
// 1 日に複数の状態が重なることがある (通常出勤の日に他人のコマも代行する等)。
// セルの塗りは強い方 1 つ (KINDS の並び順) にし、残りはセル下の小さな点で出す。

const ATTENDANCE_KINDS = [
  // 手が要る順に並べる (セルの塗りはこの順で先に当たったもの)
  // 代行が見つかっていない欠勤。「代行された日」は代行者が付いて確定した
  // 分だけなので、ここに出さないと休んだ事実がどこにも出ない。
  {
    key: "pending",
    label: "欠勤・代行未定",
    note: "代行者を探し中",
    bg: "#fff",
    fg: "#c03030",
    border: "#c03030",
    dashed: true,
  },
  {
    key: "absence",
    label: "代行された日",
    note: "出勤なし",
    bg: "#fde4e4",
    fg: "#c03030",
    border: "#f0b0b0",
    strike: true,
  },
  {
    key: "work",
    label: "代行出勤日",
    bg: "#d8f0de",
    fg: "#1f6a3c",
    border: "#8ccaa0",
  },
  {
    key: "regular",
    label: "通常出勤日",
    bg: "#dde8f7",
    fg: "#2a4a7a",
    border: "#a8c0e0",
  },
];

const KIND_BY_KEY = Object.fromEntries(ATTENDANCE_KINDS.map((k) => [k.key, k]));

export function StaffAttendanceCalendar({
  year,
  month,
  regularDates = [],
  workDates = [],
  absenceDates = [],
  pendingAbsenceDates = [],
}) {
  const today = useToday();
  const [showList, setShowList] = useState(false);

  const datesByKind = {
    pending: pendingAbsenceDates,
    absence: absenceDates,
    work: workDates,
    regular: regularDates,
  };
  // 日付 → その日に当たる状態 (ATTENDANCE_KINDS の順)
  const kindsByDate = new Map();
  for (const k of ATTENDANCE_KINDS) {
    for (const ds of datesByKind[k.key]) {
      if (!kindsByDate.has(ds)) kindsByDate.set(ds, []);
      kindsByDate.get(ds).push(k.key);
    }
  }

  const mm = String(month).padStart(2, "0");
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  return (
    <div
      style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}
    >
      <div
        role="list"
        aria-label={`${month}月の出勤カレンダー`}
        data-testid="staff-attendance-calendar"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 26px)",
          gap: 2,
          flexShrink: 0,
        }}
      >
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            aria-hidden="true"
            style={{
              textAlign: "center",
              fontSize: 9,
              fontWeight: 700,
              color: i === 0 ? "#c44" : i === 6 ? "#44c" : "#888",
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} aria-hidden="true" />;
          const ds = `${year}-${mm}-${String(d).padStart(2, "0")}`;
          const kinds = kindsByDate.get(ds) || [];
          const main = kinds.length > 0 ? KIND_BY_KEY[kinds[0]] : null;
          const extra = kinds.slice(1).map((k) => KIND_BY_KEY[k]);
          const isToday = ds === today;
          const label =
            kinds.length > 0
              ? `${fmtDateWeekday(ds)}: ${kinds.map((k) => KIND_BY_KEY[k].label).join("・")}`
              : fmtDateWeekday(ds);
          return (
            <div
              key={ds}
              role="listitem"
              aria-label={label}
              title={label}
              data-kinds={kinds.join(" ")}
              style={{
                position: "relative",
                height: 24,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: main ? 700 : 400,
                background: main ? main.bg : "transparent",
                color: main ? main.fg : "#aaa",
                border: main
                  ? `1px ${main.dashed ? "dashed" : "solid"} ${main.border}`
                  : "1px solid transparent",
                textDecoration: main?.strike ? "line-through" : "none",
                outline: isToday ? "2px solid #e6a800" : "none",
                outlineOffset: -1,
              }}
            >
              {d}
              {extra.length > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    bottom: 1,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    gap: 1,
                  }}
                >
                  {extra.map((k) => (
                    <span
                      key={k.key}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: k.fg,
                      }}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 凡例 = 件数。0 日の状態も出す (「代行出勤 0 日」も情報) が、
          欠勤・代行未定は従来どおりあるときだけ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        {[...ATTENDANCE_KINDS].reverse().map((k) => {
          const n = datesByKind[k.key].length;
          if (k.key === "pending" && n === 0) return null;
          return (
            <div
              key={k.key}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 12,
                  borderRadius: 3,
                  background: k.bg,
                  border: `1px ${k.dashed ? "dashed" : "solid"} ${k.border}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 700, fontSize: 11, color: k.fg }}>{k.label}</span>
              <span style={{ fontWeight: 700 }}>{n}日</span>
              {k.note && n > 0 && (
                <span style={{ fontSize: 10, color: "#999" }}>※ {k.note}</span>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="no-print"
          onClick={() => setShowList((v) => !v)}
          aria-expanded={showList}
          style={{
            alignSelf: "flex-start",
            marginTop: 2,
            padding: 0,
            border: "none",
            background: "none",
            color: "#4a6a9a",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {showList ? "日付の一覧を閉じる" : "日付を一覧で見る"}
        </button>
        {showList && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[...ATTENDANCE_KINDS].reverse().map((k) => {
              const list = datesByKind[k.key];
              if (list.length === 0) return null;
              return (
                <div key={k.key} style={{ fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: k.fg }}>{k.label}:</span>{" "}
                  {list.map((ds) => fmtDateWeekday(ds)).join("、")}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
