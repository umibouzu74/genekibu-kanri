import { useMemo } from "react";
import { fmtDate, WEEKDAYS } from "../../../data";
import {
  SUB_STATE,
  subStateMeta,
  subTargetLabel,
  summarizeOpenSubs,
} from "../../../utils/substituteState";

// ─── 代行サマリーカード ─────────────────────────────────────────────
// 今日・明日の代行予定と「まだ人の対応が要る」件数を一目で把握する
// ウィジェット。ダッシュボードの日別 / 時間割どちらのモードでも出す。
//   - 代行未定 (探し中) と 依頼中 (頼んだが未返事) は別のアクションなので
//     カードを分ける。件数は今日以降だけ (過去の未処理は小さく別枠)
//   - onJumpToSubs(filterKey) で代行一覧をその絞り込みで開く
//     (filterKey は utils/substituteState.SUB_STATE_FILTERS の key)
//   - onJumpToAbsenceFlow(date) があれば今日 / 明日のカードから
//     その日の欠勤組み換えを開ける (管理者のみ渡す)
export function SubSummaryCards({
  subs,
  slots,
  todayStr,
  onJumpToSubs,
  onJumpToAbsenceFlow,
}) {
  const summary = useMemo(() => {
    if (!subs || subs.length === 0) return null;

    const tomorrow = new Date(todayStr + "T12:00:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = fmtDate(tomorrow);
    const tomorrowDow = WEEKDAYS[tomorrow.getDay()];

    const todayDow = (() => {
      const d = new Date(todayStr + "T12:00:00");
      return WEEKDAYS[d.getDay()];
    })();

    const todaySubs = subs.filter((s) => s.date === todayStr);
    const tomorrowSubs = subs.filter((s) => s.date === tomorrowStr);
    const open = summarizeOpenSubs(subs, todayStr);

    // 今後 7 日の代行件数
    const weekAhead = [];
    const base = new Date(todayStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      weekAhead.push(fmtDate(d));
    }
    const weekSubs = subs.filter((s) => weekAhead.includes(s.date));

    return {
      todaySubs,
      todayDow,
      tomorrowStr,
      tomorrowSubs,
      tomorrowDow,
      open,
      weekSubs,
    };
  }, [subs, todayStr]);

  if (!summary) return null;

  const {
    todaySubs,
    todayDow,
    tomorrowStr,
    tomorrowSubs,
    tomorrowDow,
    open,
    weekSubs,
  } = summary;

  // 何も無ければ表示しない
  if (
    todaySubs.length === 0 &&
    tomorrowSubs.length === 0 &&
    open.upcoming.length === 0 &&
    open.past.length === 0
  ) {
    return null;
  }
  const pendingMeta = subStateMeta({ substitute: "", status: "requested" });
  const requestedMeta = subStateMeta({ substitute: "x", status: "requested" });

  // onActivate 付きのカードはクリック / Enter / Space で遷移できる
  // (EventSummaryCards の Card と同型)
  const Card = ({ label, count, color, bg, detail, children, onActivate, activateTitle }) => (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      title={onActivate ? activateTitle : undefined}
      style={{
        background: bg,
        borderRadius: 10,
        padding: "10px 14px",
        border: `1px solid ${color}30`,
        minWidth: 130,
        flex: "1 1 130px",
        cursor: onActivate ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>件</span>
      </div>
      {detail && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{detail}</div>
      )}
      {children}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {/* 今日の代行 */}
      <Card
        label={`今日 (${todayDow}) の代行`}
        count={todaySubs.length}
        color={todaySubs.length > 0 ? "#2e6a9e" : "#888"}
        bg={todaySubs.length > 0 ? "#e8f0fa" : "#f8f8f8"}
        detail={
          todaySubs.length > 0
            ? `代行あり: ${todaySubs.filter((s) => s.substitute).length} / 代行なし: ${todaySubs.filter((s) => !s.substitute).length}`
            : null
        }
        onActivate={
          onJumpToAbsenceFlow ? () => onJumpToAbsenceFlow(todayStr) : undefined
        }
        activateTitle="クリックで今日の欠勤組み換えを開く"
      >
        {todaySubs.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {todaySubs.slice(0, 3).map((s) => {
              const slot = slots.find((sl) => sl.id === s.slotId);
              const st = subStateMeta(s);
              return (
                <div
                  key={s.id}
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      background: st.color,
                      color: "#fff",
                      padding: "0 3px",
                      borderRadius: 2,
                      fontSize: 8,
                      fontWeight: 800,
                    }}
                  >
                    {st.badge}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {slot?.time?.split("-")[0] || "?"} {slot?.subj || "?"}
                  </span>
                  <span style={{ color: "#888" }}>
                    {s.originalTeacher}→{subTargetLabel(s)}
                  </span>
                </div>
              );
            })}
            {todaySubs.length > 3 && (
              <div style={{ fontSize: 9, color: "#888" }}>
                他 {todaySubs.length - 3} 件
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 明日の代行 */}
      <Card
        label={`明日 (${tomorrowDow}) の代行`}
        count={tomorrowSubs.length}
        color={tomorrowSubs.length > 0 ? "#6a3d8e" : "#888"}
        bg={tomorrowSubs.length > 0 ? "#f0e8f6" : "#f8f8f8"}
        detail={
          tomorrowSubs.length > 0
            ? `代行あり: ${tomorrowSubs.filter((s) => s.substitute).length} / 代行なし: ${tomorrowSubs.filter((s) => !s.substitute).length}`
            : null
        }
        onActivate={
          onJumpToAbsenceFlow ? () => onJumpToAbsenceFlow(tomorrowStr) : undefined
        }
        activateTitle="クリックで明日の欠勤組み換えを開く"
      />

      {/* 代行未定 (探し中)。今日以降だけを数える */}
      {open.upcomingPending > 0 && (
        <Card
          label="代行未定 (探し中・今日以降)"
          count={open.upcomingPending}
          color={pendingMeta.color}
          bg={pendingMeta.bg}
          detail={`今後7日間の代行: ${weekSubs.length}件`}
          onActivate={onJumpToSubs ? () => onJumpToSubs(SUB_STATE.PENDING) : undefined}
          activateTitle="クリックで代行一覧 (代行未定) を開く"
        >
          {onJumpToSubs && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {open.upcoming
                .filter((s) => !s.substitute)
                .slice(0, 3)
                .map((s) => {
                  const slot = slots.find((sl) => sl.id === s.slotId);
                  return (
                    <div key={s.id} style={{ fontSize: 10, lineHeight: 1.3 }}>
                      <span style={{ fontWeight: 600 }}>
                        {s.date.slice(5).replace("-", "/")} {slot?.time?.split("-")[0] || "?"}{" "}
                        {slot?.subj || "?"}
                      </span>{" "}
                      <span style={{ color: "#888" }}>{s.originalTeacher}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      )}

      {/* 依頼中 (頼んだが未返事)。今日以降だけを数える */}
      {open.upcomingRequested > 0 && (
        <Card
          label="依頼中 (未確定・今日以降)"
          count={open.upcomingRequested}
          color={requestedMeta.color}
          bg={requestedMeta.bg}
          detail={
            open.upcomingPending > 0 ? null : `今後7日間の代行: ${weekSubs.length}件`
          }
          onActivate={onJumpToSubs ? () => onJumpToSubs(SUB_STATE.REQUESTED) : undefined}
          activateTitle="クリックで代行一覧 (依頼中) を開く"
        />
      )}

      {/* 過去の未処理。放置すると片付かないので小さく別枠で出す */}
      {open.past.length > 0 && (
        <Card
          label="過去の未処理 (確定し忘れ?)"
          count={open.past.length}
          color="#777"
          bg="#f3f3f3"
          detail="昨日以前で「代行未定」「依頼中」のままの記録"
          onActivate={onJumpToSubs ? () => onJumpToSubs("open") : undefined}
          activateTitle="クリックで代行一覧 (未処理) を開く"
        />
      )}
    </div>
  );
}
