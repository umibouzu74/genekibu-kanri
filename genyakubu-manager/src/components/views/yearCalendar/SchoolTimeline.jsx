import { useMemo } from "react";
import { buildSchoolTimeline, daysBetween, mdRange } from "../../../utils/schoolSchedule";
import { eachDateStrInRange } from "../../../utils/dateHelpers";
import { MOCK_GRADE_LABELS, SCHOOL_COLORS } from "./schoolScheduleStyle";

// 学校別タイムライン (年間カレンダーの表示切替「学校別」)。行 = 学校、列 = 日付。
//   最上段: 見出し (月の名前・日付の数字。1 日の幅が狭い期間は月曜だけ、さらに
//           狭ければ数字を出さない)
//   2 段目: 「考査中」= その日に考査日の学校の数 (1 校 / 2 校以上で濃さを変える)
//   学校の行: 上段にテスト期間 (発表〜終了日の淡い帯、考査日の塗り、発表日に ▼、
//           帯の上に名前と対象学年)、下段に模試 (対象学年で色分け、希望者は点線)。
//           重なる帯は段を分ける
// 位置は日数に対する割合 (%) で置く (画面幅・紙面に追従させ、JS で幅を測らない)。
// 画面で狭すぎるときだけ min-width を付けて横スクロールにする。土日の縦帯と今日の線。
// 祝日の色付けはしない (全員が読める祝日のデータが無い。staffLeave のカレンダーは
// adminData なので使わない)。

const LABEL_PX = 76;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 1 日に要る最小の幅 (px)。これより狭くなる画面では横スクロール
const minDayPx = (days) => (days > 200 ? 2.6 : 5);

const pct = (offset, days) => `${(offset / days) * 100}%`;

export function SchoolTimeline({ examPeriods, specialEvents, filter, from, to, todayStr, onOpen, openKey }) {
  const tl = useMemo(
    () => buildSchoolTimeline({ examPeriods, specialEvents, filter }, from, to),
    [examPeriods, specialEvents, filter, from, to]
  );
  const { days } = tl;
  const dates = useMemo(() => eachDateStrInRange(from, to), [from, to]);
  const minWidth = Math.round(LABEL_PX + days * minDayPx(days));

  if (tl.schools.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#666", padding: "12px 4px", lineHeight: 1.7 }}>
        この期間に表示する学校の考査・模試はありません (絞り込みも確かめてください)。
        <br />
        学校別に出るのは、学校名のタグを付けた「授業を休止しない」テスト期間と、学校名のタグを付けた
        種別「模試」の特別イベントです。
      </div>
    );
  }

  const showAllNums = days <= 45;
  const showMondays = !showAllNums && days <= 200;
  const todayOff = todayStr >= from && todayStr <= to ? daysBetween(from, todayStr) : null;
  const overlapDays = tl.examCounts.filter((c) => c.count >= 2).map((c) => c.date);

  return (
    <div className="ysl-scroll">
      <div className="ysl" style={{ minWidth }}>
        {/* 土日の縦帯 (行をまたいで 1 枚) */}
        <div className="ysl-bg" aria-hidden="true">
          {dates.map((d, i) => {
            const dow = new Date(`${d}T00:00:00`).getDay();
            if (dow !== 0 && dow !== 6) return null;
            return <div key={d} className="ysl-we" style={{ left: pct(i, days), width: pct(1, days) }} />;
          })}
        </div>

        <div className="ysl-row" style={{ height: 34 }}>
          <div className="ysl-label" style={{ fontSize: 10, color: "#6b7480" }}>
            日付
          </div>
          <div className="ysl-track" aria-hidden="true">
            {dates.map((d, i) => {
              const day = Number(d.slice(8));
              const dow = new Date(`${d}T00:00:00`).getDay();
              const month =
                day === 1 || i === 0 ? (
                  <div key={`m-${d}`} className="ysl-month" style={{ left: pct(i, days) }}>
                    {Number(d.slice(5, 7)) === 1 || i === 0 ? `${Number(d.slice(0, 4))}年` : ""}
                    {Number(d.slice(5, 7))}月
                  </div>
                ) : null;
              const showNum = showAllNums || (showMondays && dow === 1);
              const num = showNum ? (
                <div
                  key={`d-${d}`}
                  className={`ysl-dnum${dow === 0 ? " ysl-dnum--sun" : dow === 6 ? " ysl-dnum--sat" : ""}`}
                  style={{ left: pct(i + 0.5, days) }}
                  title={`${d} (${WEEKDAY_LABELS[dow]})`}
                >
                  {day}
                </div>
              ) : null;
              return [month, num];
            })}
          </div>
        </div>

        <div className="ysl-row" style={{ height: 28 }}>
          <div className="ysl-label" style={{ fontSize: 11 }}>
            考査中<small>学校数</small>
          </div>
          <div className="ysl-track">
            <span className="year-cal-sr">
              {overlapDays.length
                ? `考査日が 2 校以上重なる日: ${groupDates(overlapDays).join("、")}`
                : "考査日が 2 校以上重なる日はありません"}
            </span>
            {tl.examCounts.map((c) => (
              <div
                key={c.date}
                aria-hidden="true"
                className="ysl-count"
                title={`${mdRange(c.date)} 考査中 ${c.count} 校`}
                data-count={c.count}
                style={{
                  left: pct(c.offset, days),
                  width: pct(1, days),
                  background: c.count >= 2 ? SCHOOL_COLORS.count2 : SCHOOL_COLORS.count1,
                }}
              />
            ))}
          </div>
        </div>

        {tl.schools.map((s) => (
          <div
            key={s.school}
            className="ysl-row ysl-school"
            role="group"
            aria-label={`${s.school} の考査・模試`}
          >
            <div className="ysl-label">
              {s.school}
              <small>考査 / 模試</small>
            </div>
            <div className="ysl-track" style={{ paddingBottom: 4 }}>
              {s.examLanes.map((lane, li) => (
                <div key={`e${li}`} className="ysl-lane ysl-lane--exam">
                  {lane.map((b) => (
                    <ExamBand
                      key={b.exam.id}
                      band={b}
                      days={days}
                      open={openKey === `exam|${b.exam.id}`}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ))}
              {s.mockLanes.map((lane, li) => (
                <div key={`m${li}`} className="ysl-lane ysl-lane--mock">
                  {lane.map((m) => (
                    <button
                      key={m.event.id}
                      type="button"
                      className={`ysl-mock ysl-mock--${m.gradeClass}${m.optional ? " ysl-mock--opt" : ""} inline-activate`}
                      style={{
                        left: pct(m.startOffset, days),
                        width: pct(m.endOffset - m.startOffset + 1, days),
                      }}
                      title={`${m.title} — クリックで内訳`}
                      aria-label={m.title}
                      aria-haspopup="dialog"
                      aria-expanded={openKey === `mock|${m.event.id}`}
                      onClick={(e) => onOpen({ kind: "mock", record: m.event }, e.currentTarget)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}

        {todayOff != null && (
          <div
            className="ysl-today no-print"
            aria-hidden="true"
            style={{ left: `calc(${LABEL_PX}px + (100% - ${LABEL_PX}px) * ${(todayOff + 0.5) / days})` }}
          >
            <span>今日</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ExamBand({ band, days, open, onOpen }) {
  const len = band.endOffset - band.startOffset + 1;
  const hasDates = band.exam.examDates?.length > 0;
  return (
    <>
      <div className="ysl-ename" style={{ left: pct(band.startOffset, days) }}>
        {band.label}
      </div>
      {band.announceOffset != null && (
        <div className="ysl-ann" style={{ left: pct(band.announceOffset + 0.5, days) }} />
      )}
      <button
        type="button"
        className={`ysl-band${hasDates ? "" : " ysl-band--period"} inline-activate`}
        style={{ left: pct(band.startOffset, days), width: pct(len, days) }}
        title={`${band.title} — クリックで内訳`}
        aria-label={band.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => onOpen({ kind: "exam", record: band.exam }, e.currentTarget)}
      >
        {band.examOffsets.map((o) => (
          <span
            key={o}
            className="ysl-exam"
            style={{ left: pct(o - band.startOffset, len), width: pct(1, len) }}
          />
        ))}
      </button>
    </>
  );
}

// 続いた日付を「10/13〜16」にまとめる (読み上げ用)
function groupDates(dates) {
  const out = [];
  let start = null;
  let prev = null;
  for (const d of dates) {
    if (prev && daysBetween(prev, d) === 1) {
      prev = d;
      continue;
    }
    if (start) out.push(mdRange(start, prev));
    start = d;
    prev = d;
  }
  if (start) out.push(mdRange(start, prev));
  return out;
}

// 凡例 (紙面にも載せる)
export function SchoolTimelineLegend() {
  const sw = (style) => <span className="ysl-sw" aria-hidden="true" style={style} />;
  const item = (swatch, label) => (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11, color: "#555" }}>
      {swatch}
      {label}
    </span>
  );
  const C = SCHOOL_COLORS;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center" }}>
      {item(sw({ background: C.examPre, border: `1px solid ${C.examAccent}` }), "発表〜考査")}
      {item(sw({ background: C.examSolid }), "考査日")}
      {item(<span style={{ color: C.examSolid, fontSize: 10 }}>▼</span>, "考査発表")}
      {item(sw({ background: C.examBg, border: `1px dashed ${C.examAccent}` }), "テスト期間 (考査日の登録なし)")}
      {item(sw({ background: C.g12 }), `模試 (${MOCK_GRADE_LABELS.g12})`)}
      {item(sw({ background: C.g3 }), `模試 (${MOCK_GRADE_LABELS.g3})`)}
      {item(sw({ background: C.all }), `模試 (${MOCK_GRADE_LABELS.all})`)}
      {item(sw({ background: "#fff", border: `1.5px dashed ${C.g3}` }), "希望者・冠模試")}
      {item(sw({ background: C.count1 }), "考査中 1 校")}
      {item(sw({ background: C.count2 }), "2 校以上")}
      {item(sw({ background: "#f2f3f6", border: "1px solid #e3e5e8" }), "土日")}
    </div>
  );
}
