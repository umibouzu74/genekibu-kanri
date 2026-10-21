import { DayNumberLink } from "../../DayNumberLink";
import { YEAR_CAL_LANES } from "../../../constants/yobikoEvents";
import { buildMonthWeeks, shortDate } from "../../../utils/yearCalendar";
import { fmtDateWeekday, formatDateRange } from "../../../utils/dateHelpers";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const SUN_COLOR = "#c03030";
const SAT_COLOR = "#2e5a9e";
// 曜日の見出しは濃い地なので、明るい赤 / 青にする
const SUN_HEAD = "#ffb3b3";
const SAT_HEAD = "#b3d1ff";

// 年間カレンダーの 1 か月 (表)。週ごとに 3 行:
//   日付の行 (数字。予備校部の日の種別 = 休校日など で塗る)
//   予備校部の段
//   ─ 線 ─
//   現役部の段
// 週は <tbody> 1 つにまとめ、紙面で週の途中で改ページしない。
// 段の見出しは左の列 (紙面でも段が読めるように、色だけに頼らない)。
export function YearCalendarMonth({
  ym,
  todayStr,
  lanes,
  yobikoByDate,
  marksByDate,
  genyakuByDate,
  onSelectDate,
  onAddYobiko,
  onEditYobiko,
  onEditGenyaku,
}) {
  const [y, m] = ym.split("-").map(Number);
  const weeks = buildMonthWeeks(ym);
  return (
    <section className="year-cal-month" aria-label={`${y}年${m}月`}>
      <h3 className="year-cal-month-title">
        {y}年{m}月
      </h3>
      <table className="year-cal-table">
        <colgroup>
          <col className="year-cal-lane-col" />
          {WEEK_LABELS.map((w) => (
            <col key={w} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th aria-hidden="true" />
            {WEEK_LABELS.map((w, i) => (
              <th
                key={w}
                scope="col"
                style={{ color: i === 0 ? SUN_HEAD : i === 6 ? SAT_HEAD : undefined }}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        {weeks.map((week) => (
          <tbody key={week.find(Boolean)} className="year-cal-week">
            <tr className="year-cal-daterow">
              <th scope="row" className="year-cal-lane-head">
                <span className="year-cal-sr">日付</span>
              </th>
              {week.map((ds, i) => (
                <DateCell
                  key={i}
                  ds={ds}
                  dow={i}
                  isToday={ds === todayStr}
                  marks={lanes.yobiko && ds ? marksByDate.get(ds) : null}
                  onSelectDate={onSelectDate}
                  onAddYobiko={lanes.yobiko ? onAddYobiko : null}
                />
              ))}
            </tr>
            {lanes.yobiko && (
              <tr className="year-cal-lane year-cal-lane-yobiko">
                <th scope="row" className="year-cal-lane-head" style={laneHeadStyle("yobiko")}>
                  {YEAR_CAL_LANES.yobiko.label}
                </th>
                {week.map((ds, i) => (
                  <LaneCell
                    key={i}
                    ds={ds}
                    items={ds ? yobikoByDate.get(ds) : null}
                    onEdit={onEditYobiko ? (it) => onEditYobiko(it.source) : null}
                  />
                ))}
              </tr>
            )}
            {lanes.genyaku && (
              <tr className="year-cal-lane year-cal-lane-genyaku">
                <th scope="row" className="year-cal-lane-head" style={laneHeadStyle("genyaku")}>
                  {YEAR_CAL_LANES.genyaku.label}
                </th>
                {week.map((ds, i) => (
                  <LaneCell
                    key={i}
                    ds={ds}
                    items={ds ? genyakuByDate.get(ds) : null}
                    onEdit={onEditGenyaku}
                  />
                ))}
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </section>
  );
}

function laneHeadStyle(lane) {
  const meta = YEAR_CAL_LANES[lane];
  return { background: meta.bg, color: meta.fg };
}

function DateCell({ ds, dow, isToday, marks, onSelectDate, onAddYobiko }) {
  if (!ds) return <td className="year-cal-out" />;
  const top = marks?.[0] || null;
  const day = Number(ds.slice(8));
  const color = top?.dayFg || (dow === 0 ? SUN_COLOR : dow === 6 ? SAT_COLOR : undefined);
  return (
    <td
      className={`year-cal-date${isToday ? " year-cal-today" : ""}`}
      style={{ background: top?.dayFill || undefined, color }}
      title={marks?.length ? `予備校部: ${marks.map((k) => k.label).join("・")}` : undefined}
    >
      <span className="year-cal-date-inner">
        <span className="year-cal-day">
          <DayNumberLink d={day} ds={ds} onSelectDate={onSelectDate} />
        </span>
        {marks?.map((k) => (
          <span key={k.key} className="year-cal-mark">
            {k.short}
          </span>
        ))}
        {onAddYobiko && (
          <button
            type="button"
            className="no-print inline-activate year-cal-add"
            onClick={() => onAddYobiko(ds)}
            aria-label={`${fmtDateWeekday(ds)} に予備校部の予定を追加`}
            title="この日に予備校部の予定を追加"
          >
            ＋
          </button>
        )}
      </span>
    </td>
  );
}

function LaneCell({ ds, items, onEdit }) {
  if (!ds) return <td className="year-cal-out" />;
  return (
    <td className="year-cal-cell">
      {/* 読み上げでは段の欄にも日付を (見出しは曜日と段だけで、何日か分からない) */}
      {items?.length > 0 && <span className="year-cal-sr">{Number(ds.slice(8))}日 </span>}
      {(items || []).map((it) => (
        <LaneItem key={it.key} item={it} onEdit={onEdit} />
      ))}
    </td>
  );
}

function LaneItem({ item, onEdit }) {
  const multi = item.endDate !== item.startDate;
  // 期間の始まりの日だけ「〜12/27」を添え、続きの日は画面では薄く出す (同じ名前が
  // 並んでも、どこから続いているかが分かるように)。その日だけの添え書き
  // (テスト期間の「📖 授業あり」) は名前の後ろに
  const base = item.isStart && multi ? `${item.label} 〜${shortDate(item.endDate)}` : item.label;
  const text = item.note ? `${base} · ${item.note}` : base;
  const period = multi ? ` (${formatDateRange(item.startDate, item.endDate)})` : "";
  const title = `${item.title}${period}`;
  const style = {
    display: "block",
    width: "100%",
    textAlign: "left",
    fontSize: 11,
    lineHeight: 1.35,
    padding: "1px 4px",
    margin: "0 0 2px",
    border: "none",
    borderLeft: `3px solid ${item.meta.accent || item.meta.fg}`,
    borderRadius: 2,
    background: item.meta.bg,
    color: item.meta.fg,
    wordBreak: "break-word",
    fontFamily: "inherit",
    fontWeight: item.isStart ? 600 : 400,
  };
  if (onEdit) {
    return (
      <button
        type="button"
        className={`inline-activate year-cal-item${item.isStart ? "" : " year-cal-cont"}`}
        onClick={() => onEdit(item)}
        title={`${title} — クリックで編集`}
        style={{ ...style, cursor: "pointer" }}
      >
        {text}
      </button>
    );
  }
  return (
    <span className={`year-cal-item${item.isStart ? "" : " year-cal-cont"}`} title={title} style={style}>
      {text}
    </span>
  );
}
