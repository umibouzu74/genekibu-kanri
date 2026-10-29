import { useMemo } from "react";
import { fmtMDWeekday } from "../../../utils/dateHelpers";
import { buildSchoolScheduleList, examDatesText } from "../../../utils/schoolSchedule";

// 学校別の下に出す、学校ごとの一覧 (2026-10-29)。タイムラインの札は狭いと「…」で
// 切れるので、テスト期間 (考査の範囲・発表日・考査日) と模試 (名前・対象学年・
// 希望者・冠模試か) をここで全部読めるようにする。学校を横に並べ、行は日付順
// (utils/schoolSchedule.buildSchoolScheduleList。絞り込み・期間はタイムラインと同じ)。
// 紙面にも載せる (行の途中で改ページしない)。
export function SchoolScheduleList({ examPeriods, specialEvents, filter, from, to, large = false }) {
  const list = useMemo(
    () => buildSchoolScheduleList({ examPeriods, specialEvents, filter }, from, to),
    [examPeriods, specialEvents, filter, from, to]
  );
  if (list.length === 0) return null;
  return (
    <section className={`ysl-list${large ? " ysl-list--large" : ""}`} aria-label="学校ごとの考査・模試の一覧">
      {list.map(({ school, rows }) => (
        <div key={school} className="ysl-list-school">
          <table className="ysl-list-table" aria-label={`${school} の考査・模試の一覧`}>
            <colgroup>
              <col className="ysl-list-col-date" />
              <col />
              <col className="ysl-list-col-grade" />
            </colgroup>
            {/* 学校名も見出しの行に入れる (紙面で次のページへ続くとき、見出しごと繰り返す。
                見出しだけがページの末尾に取り残されない) */}
            <thead>
              <tr>
                <th colSpan={3} className="ysl-list-title">
                  {school}
                  <small>
                    考査 {rows.filter((r) => r.kind === "exam").length} / 模試{" "}
                    {rows.filter((r) => r.kind === "mock").length}
                  </small>
                </th>
              </tr>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">内容</th>
                <th scope="col">対象</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (r.kind === "exam" ? <ExamRow key={r.key} row={r} /> : <MockRow key={r.key} row={r} />))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

// "11/26 (木)〜12/2 (水)" / "11/26 (木)"。折り返すのは「〜」の後だけ
function dateRange(a, b) {
  if (!b || b === a) return <span className="ysl-nw">{fmtMDWeekday(a)}</span>;
  return (
    <>
      <span className="ysl-nw">{fmtMDWeekday(a)}〜</span>
      <wbr />
      <span className="ysl-nw">{fmtMDWeekday(b)}</span>
    </>
  );
}

function ExamRow({ row }) {
  const n = row.examDates.length;
  return (
    <tr className="ysl-list-row ysl-list-row--exam">
      <td className="ysl-list-date">{dateRange(row.date, row.end)}</td>
      <td>
        <span className="ysl-list-kind ysl-list-kind--exam">考査</span>
        <b>{row.name}</b>
        <div className="ysl-list-sub">
          {[
            row.announce ? `発表 ${fmtMDWeekday(row.announce)}` : "",
            n > 0 ? `考査日 ${examDatesText(row.examDates)}（${n}日）` : "テスト期間 (考査日の登録なし)",
          ]
            .filter(Boolean)
            .join(" / ")}
        </div>
      </td>
      <td className="ysl-list-grade">{row.grade}</td>
    </tr>
  );
}

function MockRow({ row }) {
  return (
    <tr className={`ysl-list-row ysl-list-row--mock${row.optional ? " ysl-list-row--opt" : ""}`}>
      <td className="ysl-list-date">{dateRange(row.date, row.end)}</td>
      <td>
        <span className="ysl-list-kind ysl-list-kind--mock">模試</span>
        {row.name}
        {row.optional && <span className="ysl-optmark">希望者・冠模試</span>}
      </td>
      <td className="ysl-list-grade">
        <span className={`ysl-grade ysl-grade--${row.gradeClass}${row.optional ? " ysl-grade--opt" : ""}`}>
          {row.grade}
        </span>
      </td>
    </tr>
  );
}
