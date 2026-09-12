import { fmtDate, isValidDateStr, parseLocalDate } from "./dateHelpers";

// Cmd+K に打った文字列を日付として読む。「9/24」「9-24」「2026-09-24」
// 「2026/9/24」「0924」を受ける。年の無い書き方は今年。ただし 3 か月より前に
// なる日付は来年に読む (年度は 1〜3 月へまたぐので、1 月に「3/5」と打てば
// 来年ではなく今年、10 月に「1/10」と打てば来年、が自然)。
// 日付でなければ null。
export function parseDateQuery(raw, todayStr) {
  const q = String(raw || "").trim();
  if (!q) return null;
  let y = null;
  let m = null;
  let d = null;
  let mm;
  if ((mm = q.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/))) {
    [y, m, d] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
  } else if ((mm = q.match(/^(\d{1,2})[/-](\d{1,2})$/))) {
    [m, d] = [Number(mm[1]), Number(mm[2])];
  } else if ((mm = q.match(/^(\d{2})(\d{2})$/))) {
    [m, d] = [Number(mm[1]), Number(mm[2])];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const today = parseLocalDate(todayStr) || new Date();
  if (y == null) {
    y = today.getFullYear();
    const candidate = new Date(y, m - 1, d);
    const limit = new Date(today);
    limit.setMonth(limit.getMonth() - 3);
    if (candidate < limit) y += 1;
  }
  const out = fmtDate(new Date(y, m - 1, d));
  // 2/30 のような日はずれるので、組み立て直した値と一致するものだけ通す
  const back = parseLocalDate(out);
  if (!back || back.getMonth() + 1 !== m || back.getDate() !== d) return null;
  return isValidDateStr(out) ? out : null;
}
