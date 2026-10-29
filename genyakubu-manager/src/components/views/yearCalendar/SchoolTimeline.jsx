import { useMemo } from "react";
import {
  buildSchoolTimeline,
  daysBetween,
  estimateTextPx,
  mdRange,
} from "../../../utils/schoolSchedule";
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
// 画面で狭すぎるときだけ min-width を付けて横スクロールにする。土日の縦帯・月の
// 境の線・今日の線。祝日の色付けはしない (全員が読める祝日のデータが無い。
// staffLeave のカレンダーは adminData なので使わない)。
//
// 名前の札 (2026-10-29): テスト期間の帯の上に名前と対象学年 (B4・A3 では発表日・
// 考査日も)、模試の点の右に対象学年と名前。札が隣の札に重ならないように、紙の
// 幅 (PAPER_LAYOUT.trackPx) から札の幅を見積もって段を分け
// (buildSchoolTimeline の labelDays)、それでも足りない分は同じ段の次の帯の手前で
// 「…」で切る (roomDays)。全文は帯の title・内訳・下の学校ごとの一覧にある。
// large = 紙の大きさ「B4・A3」: 字を大きくし、札に発表・考査の日付まで出す。

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 紙の大きさごとの寸法。trackPx は横向きの紙で日付の欄が取れる幅の目安
// (A4 = 297mm、B4 = 364mm から余白と学校名の列を引いたもの)。字の大きさは
// schoolScheduleStyle の .ysl--large と合わせる
const PAPER_LAYOUT = {
  a4: { labelPx: 76, trackPx: 960, examFont: 10, mockFont: 9.5, gradeFont: 8.5 },
  large: { labelPx: 96, trackPx: 1200, examFont: 11.5, mockFont: 11, gradeFont: 10 },
};

// 1 日に要る最小の幅 (px)。これより狭くなる画面では横スクロール (紙の幅の目安より
// 狭い画面では、札が少し早めに「…」で切れる)
const minDayPx = (days) => (days > 200 ? 2.6 : 5);

const pct = (offset, days) => `${(offset / days) * 100}%`;
// 同じ段の次の帯の手前まで (札の幅の上限)
const roomWidth = (roomDays, days, gapPx = 4) => `calc(${pct(Math.max(roomDays, 0), days)} - ${gapPx}px)`;

// 札の文字
const examLabelText = (band, large) => (large ? `${band.label} ${band.detail}` : band.label);
const mockBarDays = (m) => m.endOffset - m.startOffset + 1;

export function SchoolTimeline({
  examPeriods,
  specialEvents,
  filter,
  from,
  to,
  todayStr,
  onOpen,
  openKey,
  large = false,
}) {
  const L = PAPER_LAYOUT[large ? "large" : "a4"];
  const tl = useMemo(() => {
    const pxPerDay = L.trackPx / (daysBetween(from, to) + 1);
    // 札が帯の始まりから何日ぶん塞ぐか (見積もり)
    const labelDays = (kind, it) => {
      if (kind === "exam") return (estimateTextPx(examLabelText(it, large), L.examFont) + 12) / pxPerDay;
      const barPx = Math.max(mockBarDays(it) * pxPerDay, 8);
      const gradePx = estimateTextPx(it.grade, L.gradeFont) + 8;
      const optPx = it.optional ? estimateTextPx("希望者", L.gradeFont) + 8 : 0;
      return (barPx + 3 + gradePx + 3 + estimateTextPx(it.name, L.mockFont) + optPx + 6) / pxPerDay;
    };
    return buildSchoolTimeline({ examPeriods, specialEvents, filter }, from, to, { labelDays });
  }, [examPeriods, specialEvents, filter, from, to, large, L]);
  const { days } = tl;
  const dates = useMemo(() => eachDateStrInRange(from, to), [from, to]);
  const LABEL_PX = L.labelPx;
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

  // 日付の数字: 狭いほど間引く (B4・A3 は 3 か月まで毎日、年度まで月曜)
  const showAllNums = days <= (large ? 100 : 45);
  const showMondays = !showAllNums && days <= (large ? 400 : 200);
  const todayOff = todayStr >= from && todayStr <= to ? daysBetween(from, todayStr) : null;
  const overlapDays = tl.examCounts.filter((c) => c.count >= 2).map((c) => c.date);

  return (
    <div className="ysl-scroll">
      <div
        className={`ysl${large ? " ysl--large" : ""}`}
        style={{ minWidth, "--ysl-label": `${LABEL_PX}px` }}
      >
        {/* 土日の縦帯と月の境の線 (行をまたいで 1 枚) */}
        <div className="ysl-bg" aria-hidden="true">
          {dates.map((d, i) => {
            const dow = new Date(`${d}T00:00:00`).getDay();
            const monthLine =
              i > 0 && d.endsWith("-01") ? (
                <div key={`l-${d}`} className="ysl-mline" style={{ left: pct(i, days) }} />
              ) : null;
            if (dow !== 0 && dow !== 6) return monthLine;
            return [
              <div key={d} className="ysl-we" style={{ left: pct(i, days), width: pct(1, days) }} />,
              monthLine,
            ];
          })}
        </div>

        <div className="ysl-row ysl-row--dates">
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

        <div className="ysl-row ysl-row--count">
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
                      large={large}
                      open={openKey === `exam|${b.exam.id}`}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ))}
              {s.mockLanes.map((lane, li) => (
                <div key={`m${li}`} className="ysl-lane ysl-lane--mock">
                  {lane.map((m) => (
                    <MockMark
                      key={m.event.id}
                      mock={m}
                      days={days}
                      open={openKey === `mock|${m.event.id}`}
                      onOpen={onOpen}
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
            style={{ left: `calc(var(--ysl-label) + (100% - var(--ysl-label)) * ${(todayOff + 0.5) / days})` }}
          >
            <span>今日</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ExamBand({ band, days, large, open, onOpen }) {
  const len = band.endOffset - band.startOffset + 1;
  const hasDates = band.exam.examDates?.length > 0;
  return (
    <>
      <div
        className="ysl-ename"
        aria-hidden="true"
        style={{ left: pct(band.startOffset, days), maxWidth: roomWidth(band.roomDays, days) }}
      >
        {band.label}
        {large && <span className="ysl-edetail"> {band.detail}</span>}
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

// 模試: 日付の位置に点 (対象学年の色、希望者・冠模試は点線) と、その右に対象学年と
// 名前の札。点がボタン (読み上げ名 = 全文)、札は同じ内訳を開く (読み上げは点で足りる)
function MockMark({ mock: m, days, open, onOpen }) {
  const span = mockBarDays(m);
  const openIt = (e) => onOpen({ kind: "mock", record: m.event }, e.currentTarget);
  return (
    <>
      <button
        type="button"
        className={`ysl-mock ysl-mock--${m.gradeClass}${m.optional ? " ysl-mock--opt" : ""} inline-activate`}
        style={{ left: pct(m.startOffset, days), width: pct(span, days) }}
        title={`${m.title} — クリックで内訳`}
        aria-label={m.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openIt}
      />
      <span
        className="ysl-mlabel"
        aria-hidden="true"
        title={`${m.title} — クリックで内訳`}
        style={{
          // 点は 1 日の幅が狭くても 6px (.ysl-mock の min-width) あるので、その後ろから
          left: `calc(max(${pct(m.startOffset + span, days)}, ${pct(m.startOffset, days)} + 6px) + 3px)`,
          maxWidth: roomWidth(m.roomDays - span, days, 7),
        }}
        onClick={openIt}
      >
        <span className={`ysl-grade ysl-grade--${m.gradeClass}${m.optional ? " ysl-grade--opt" : ""}`}>
          {m.grade}
        </span>
        {m.name}
        {m.optional && <span className="ysl-optmark">希望者</span>}
      </span>
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
      <span style={{ fontSize: 11, color: "#555" }}>
        模試の札 = 対象学年 + 名前 (「…」で切れたものは下の一覧に全文)
      </span>
    </div>
  );
}
