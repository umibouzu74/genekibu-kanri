import { useEffect, useMemo, useRef, useState } from "react";
import { WEEKDAYS } from "../../data";
import {
  eachDateStrInRange,
  formatDateRange,
  monthOffsetFromToday,
  overlapsRange,
  parseLocalDate,
} from "../../utils/dateHelpers";
import { useToday } from "../../hooks/useToday";
import { DayNumberLegend, DayNumberLink } from "../DayNumberLink";
import { MonthNav } from "../MonthNav";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import {
  DAY_SCHEDULE_META,
  EVENT_KIND,
  EVENT_KIND_LABELS,
  EXAM_META,
  EXTRA_LESSON_META,
  HOLIDAY_META,
  TAG_META,
} from "../../constants/eventKinds";
import { specialEventTypeMeta } from "../../constants/specialEvents";
import {
  describeExtraLesson,
  upcomingExtraLessons,
} from "../../utils/extraLessons";
import { PrintButton } from "../PrintButton";
import {
  DEFAULT_EVENT_VISIBILITY,
  EventVisibilityToggles,
  isEventKindVisible,
  isExamPeriodVisible,
  isSpecialEventVisible,
} from "../EventVisibilityToggles";

// イベントカレンダー (休講・テスト期間・特別イベント・追加授業を統合表示)
//
// 月次のグリッドを描画し、各日のセルに該当イベントをバッジとして並べる。
// 休講は常時表示。テスト期間 / 特別イベント / 追加授業は visibility
// プロパティで切替。
//
// 印刷系統: PrintButton (window.print() 直接呼び) を使う。
// ヘッダ/凡例の動的注入は不要。詳細は src/components/PrintButton.jsx 冒頭コメント。

// 新規登録ボタン定義 (休講含む 4 種)。
const ADD_BUTTONS = Object.freeze([
  { key: EVENT_KIND.HOLIDAY, label: "休講", color: HOLIDAY_META.accent },
  { key: EVENT_KIND.EXAM, label: "テスト期間", color: EXAM_META.accent },
  { key: EVENT_KIND.SPECIAL, label: "特別イベント", color: "#8a5ec4" },
  { key: EVENT_KIND.EXTRA_LESSON, label: "追加授業", color: EXTRA_LESSON_META.accent },
  { key: EVENT_KIND.DAY_SCHEDULE, label: "特別時程", color: DAY_SCHEDULE_META.accent },
]);

// 表示中の月はタブ単位 (sessionStorage) で覚える。休講を入れに別の画面へ
// 寄って戻ると今月に戻ってしまい、月を送り直しになるため。タブを閉じれば
// 今月に戻る。値は絶対の "YYYY-MM"。state も同じ絶対値で持つ — 今日からの
// 差 (monthOff) で持つと、月末に開きっぱなしのタブが 0 時を跨いだ瞬間に
// 表示が翌月へ進み、保存値まで書き換わる。Dashboard の SS_START_DATE_KEY と
// 同じ扱い (try/catch で包み、読めなければ今月)。
export const SS_MONTH_KEY = "genyakubu:eventCalMonth";
// 今日から ±12 か月より遠い保存値は無視する (古いタブの置き土産で 1 年先を
// 開かないように)
const SS_MONTH_MAX_DIST = 12;

// "YYYY-MM" ± n か月
function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 保存された "YYYY-MM" を読む。無い / 壊れている / 遠すぎるときは今月
function loadMonth(today) {
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  try {
    const saved = sessionStorage.getItem(SS_MONTH_KEY);
    const off = monthOffsetFromToday(saved, today);
    if (off == null || Math.abs(off) > SS_MONTH_MAX_DIST) return cur;
    return saved;
  } catch {
    return cur;
  }
}

function saveMonth(ym) {
  try {
    sessionStorage.setItem(SS_MONTH_KEY, ym);
  } catch {
    /* quota / private mode */
  }
}

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
  extraLessons = [],
  daySchedules = [],
  onEventClick,
  onAddNewEvent,
  isAdmin = false,
  visibility = DEFAULT_EVENT_VISIBILITY,
  onChangeVisibility,
  availableTags = [],
  // 日付の数字から「その日」へ跳ぶ導線 (どちらも任意)。
  //   onSelectDate(ds)        = その日のダッシュボードを開く
  //   onJumpToAbsenceFlow(ds) = その日の欠勤組み換えを開く (管理者だけ)
  onSelectDate,
  onJumpToAbsenceFlow,
}) {
  // 「今日」はタブを開いたまま日付を跨いでも翌 0 時に更新される (useToday)。
  // new Date() を 1 回だけ読むと、開きっぱなしのタブで昨日を強調し続ける
  const todayStr = useToday();
  const today = useMemo(() => parseLocalDate(todayStr), [todayStr]);
  const todayYm = todayStr.slice(0, 7);
  // 表示中の月 (絶対の "YYYY-MM")。今日が変わっても勝手に動かない
  const [ym, setYm] = useState(() => loadMonth(today));
  const jumpToAbsenceFlow =
    isAdmin && onJumpToAbsenceFlow ? onJumpToAbsenceFlow : null;

  const [year, month] = ym.split("-").map(Number); // month は 1-indexed
  const isCurrentMonth = ym === todayYm;
  useEffect(() => {
    saveMonth(ym);
  }, [ym]);

  // ← / → で前後の月、t で今月 (入力中・ダイアログ中は効かない)
  const goPrevMonth = () => setYm((cur) => shiftYm(cur, -1));
  const goNextMonth = () => setYm((cur) => shiftYm(cur, 1));
  const goThisMonth = () => setYm(todayYm);
  // <input type="month"> の値。形式外 (空など) は無視
  const pickMonth = (value) => {
    if (monthOffsetFromToday(value, today) != null) setYm(value);
  };
  useDateKeyNav({
    onPrev: goPrevMonth,
    onNext: goNextMonth,
    onToday: goThisMonth,
  });
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
  const showExtra = isEventKindVisible(visibility, EVENT_KIND.EXTRA_LESSON);
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
    // 特別時程 (時刻読み替え / 部分休講)。休講と同様に常時表示。
    for (const d of daySchedules) {
      if (!overlapsRange(d.date, d.date, monthStart, monthEnd)) continue;
      all.push({
        kind: EVENT_KIND.DAY_SCHEDULE,
        id: `d-${d.id}`,
        name: `${DAY_SCHEDULE_META.icon} ${d.label || "特別時程"}`,
        startDate: d.date,
        endDate: d.date,
        meta: DAY_SCHEDULE_META,
        detail: [
          (d.targetGrades || []).join("・"),
          (d.timeMap || [])
            .map((m) => `${m.from}→${m.to}`)
            .join(" / "),
          (d.cancelTimes || []).length
            ? `休講: ${(d.cancelTimes || []).join(" / ")}`
            : "",
          d.memo,
        ]
          .filter(Boolean)
          .join(" / "),
        source: d,
      });
    }
    if (showExam) {
      for (const ep of examPeriods) {
        if (!isExamPeriodVisible(ep, visibility)) continue;
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
        if (!isSpecialEventVisible(ev, visibility)) continue;
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
    if (showExtra) {
      // 日付 → 時刻順に整列済みのヘルパを使う (同日複数コマの表示順を保証。
      // 最終 sort は stable + startDate 比較のみなので、この順が保たれる)
      for (const l of upcomingExtraLessons(extraLessons, {
        winStartStr: monthStart,
        winEndStr: monthEnd,
      })) {
        all.push({
          kind: EVENT_KIND.EXTRA_LESSON,
          id: `x-${l.id}`,
          // グリッドのバッジ幅が限られるので開始時刻のみ + 短ラベル
          name: `${(l.time || "").split(/[-〜~]/)[0].trim()} ${describeExtraLesson(l)}`,
          startDate: l.date,
          endDate: l.date,
          meta: EXTRA_LESSON_META,
          // ツールチップ用の詳細 (時間全体・担当・教室・メモ)
          detail: [
            l.time,
            l.teacher,
            l.room ? `@${l.room}` : "",
            l.note,
          ]
            .filter(Boolean)
            .join(" / "),
          source: l,
        });
      }
    }
    return all.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate)
    );
  }, [holidays, examPeriods, specialEvents, extraLessons, daySchedules, showExam, showSpecial, showExtra, visibility, monthStart, monthEnd]);

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


  const showAdd = isAdmin && !!onAddNewEvent;

  // 日付セルの「＋」→ 種別メニュー。開いているセルの日付を持つ。外側クリック /
  // Escape で閉じる。「10/13 を休講に」がカレンダーを見て別画面で日付を打ち直す
  // 往復にならないよう、セルから日付つきで登録フォームを開く
  const [addMenuDate, setAddMenuDate] = useState(null);
  const addMenuRef = useRef(null);
  useEffect(() => {
    if (!addMenuDate) return undefined;
    const onDown = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuDate(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape" && !e.isComposing) setAddMenuDate(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenuDate]);

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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* 月送り (講師別月間と共通の MonthNav)。年月表示は紙面に必要なので
              残り、操作ボタンだけ no-print */}
          <MonthNav
            year={year}
            month={month}
            onPrev={goPrevMonth}
            onNext={goNextMonth}
            onToday={goThisMonth}
            onPick={pickMonth}
            isCurrent={isCurrentMonth}
          />
          <PrintButton style={{ fontSize: 11, marginLeft: 8 }} />
        </div>
        {showAdd && (
          <>
            <div
              aria-hidden="true"
              className="no-print"
              style={{ width: 1, height: 22, background: "#e0e0e0" }}
            />
            <div
              className="no-print"
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
          className="no-print"
          style={{ width: 1, height: 22, background: "#e0e0e0" }}
        />
        <EventVisibilityToggles
          visibility={visibility}
          onChange={onChangeVisibility}
          availableTags={availableTags}
          includeExtraLessons
        />
        {/* 日付の数字 / 🚑 が何かの凡例 (導線を渡したときだけ) */}
        <DayNumberLegend
          onSelectDate={onSelectDate}
          onJumpToAbsenceFlow={jumpToAbsenceFlow}
          style={{ marginLeft: "auto" }}
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
                className="event-cal-cell"
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
              className="event-cal-cell"
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <DayNumberLink
                  d={d}
                  ds={ds}
                  onSelectDate={onSelectDate}
                  onJumpToAbsenceFlow={jumpToAbsenceFlow}
                />
                <span
                  className="no-print"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                >
                {showAdd && (
                  <span
                    style={{ position: "relative" }}
                    ref={addMenuDate === ds ? addMenuRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setAddMenuDate((cur) => (cur === ds ? null : ds))}
                      aria-label={`${ds} に登録`}
                      aria-expanded={addMenuDate === ds}
                      aria-haspopup="menu"
                      title="この日に休講・テスト期間・イベント・追加授業・特別時程を登録"
                      className="event-cal-add"
                      style={{
                        border: "1px solid #ccc",
                        background: addMenuDate === ds ? "#1a1a2e" : "#fff",
                        color: addMenuDate === ds ? "#fff" : "#666",
                        borderRadius: 4,
                        width: 18,
                        height: 18,
                        lineHeight: "16px",
                        fontSize: 12,
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      +
                    </button>
                    {addMenuDate === ds && (
                      <div
                        role="menu"
                        aria-label={`${ds} に登録する種別`}
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          zIndex: 20,
                          background: "#fff",
                          border: "1px solid #ccc",
                          borderRadius: 6,
                          boxShadow: "0 4px 12px rgba(0,0,0,.15)",
                          padding: 4,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          minWidth: 130,
                          fontWeight: 400,
                        }}
                      >
                        {ADD_BUTTONS.map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAddMenuDate(null);
                              onAddNewEvent(f.key, ds);
                            }}
                            style={{
                              textAlign: "left",
                              fontSize: 12,
                              padding: "5px 8px",
                              border: "none",
                              background: "none",
                              color: f.color,
                              fontWeight: 700,
                              cursor: "pointer",
                              borderRadius: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            + {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
                </span>
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
                    )}${ev.detail ? "\n" + ev.detail : ""}${
                      ev.source.memo ? "\n" + ev.source.memo : ""
                    }${clickable ? "\n\nクリックで編集画面を開きます" : ""}`}
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
                        {(ev.source.tags || []).length > 0 && (
                          <span style={{ opacity: 0.7, marginLeft: 3 }}>
                            [{ev.source.tags.join("·")}]
                          </span>
                        )}
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
                {ev.kind === EVENT_KIND.EXAM &&
                  ev.source.stopsClasses === false && (
                    <span
                      title="授業を休止しない (表示のみ)"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#fff",
                        color: "#7a4a10",
                        border: "1px dashed #e0a030",
                      }}
                    >
                      表示のみ
                    </span>
                  )}
                {ev.kind === EVENT_KIND.EXAM &&
                  ev.source.stopsClasses !== false &&
                  (ev.source.classExceptions || []).length > 0 && (
                    <span
                      title={`例外的に授業を行う日:\n${[...ev.source.classExceptions]
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(
                          (ex) =>
                            `${ex.date} ${
                              (ex.grades || []).length > 0
                                ? ex.grades.join("・")
                                : "対象学年すべて"
                            }${ex.memo ? ` (${ex.memo})` : ""}`
                        )
                        .join("\n")}`}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#e8f3e8",
                        color: "#2f6b2f",
                        border: "1px solid #9fc79f",
                      }}
                    >
                      📖 授業あり {ev.source.classExceptions.length} 日
                    </span>
                  )}
                {(ev.source.tags || []).map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: TAG_META.bg,
                        color: TAG_META.fg,
                        border: `1px solid ${TAG_META.accent}`,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                {ev.kind === EVENT_KIND.EXTRA_LESSON && ev.source.label && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: EXTRA_LESSON_META.bg,
                      color: EXTRA_LESSON_META.fg,
                      border: `1px solid ${EXTRA_LESSON_META.accent}`,
                    }}
                  >
                    {ev.source.label}
                  </span>
                )}
                {ev.kind === EVENT_KIND.EXTRA_LESSON && ev.source.teacher && (
                  <span style={{ fontSize: 11, color: "#666" }}>
                    {ev.source.teacher}
                  </span>
                )}
                {ev.kind === EVENT_KIND.EXTRA_LESSON && ev.source.room && (
                  <span style={{ fontSize: 11, color: "#888" }}>
                    @{ev.source.room}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#666" }}>
                  {formatDateRange(ev.startDate, ev.endDate, { weekday: true })}
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
                {ev.kind === EVENT_KIND.EXTRA_LESSON && ev.source.note && (
                  <span
                    style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}
                  >
                    {ev.source.note}
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
