// ─── iCal/ICS export ───────────────────────────────────────────────
// 講師の週間スケジュールを iCalendar (.ics) 形式でエクスポートする。
// Google Calendar にインポートして講師のスケジュールを共有できる。
//
// コマ 1 つ = 毎週の繰り返し予定 1 件。繰り返しには終わりと抜けを入れる
// (以前は RRULE だけで UNTIL も EXDATE も無く、夏休みや期切替の後も
// 休講日も、講師の Google カレンダーに授業が永遠に出続けていた):
//   - DTSTART: 次の該当曜日以降で、実際にその講師が教える最初の日
//     (所属時間割の開始日・学年グループの開始日より前には置かない)
//   - UNTIL:   所属時間割の終了日と表示期間の終了日 (コース別終講日 →
//     学年グループの終了日) の早い方。1 年以内なら実際の最後の授業日まで
//     詰める。どちらも未設定なら付けない (終わりを勝手に作らない = 従来どおり)
//   - EXDATE:  その間で教えない日 (休講・テスト期間・コマ休講・特別時程の
//     部分休講・隔週の担当外の週)。判定は画面・回数計算と同じ述語に委ねる
//     (isTaughtOn)
// 代行・振替・コマ移動・特別時程の時刻読み替えは載せない (予定の時刻や
// 日付そのものが変わるので、抜くだけでは表せない)。
import {
  biweeklyDisplaySubject,
  getSlotTeachers,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
} from "./biweekly";
import { fmtDate, parseLocalDate } from "./dateHelpers";
import { escapeIcal } from "./escape";
import { isSlotHeldOnDate } from "./sessionCount";
import { getSlotCutoffRange, isSlotBeyondCutoff } from "./timetable";

// EXDATE を判定する窓の長さ (探索の起点から 1 年)。終了日が分かっていれば
// そこまでで止まるので、効くのは「終了日が未設定」か「1 年より先」のとき
// だけ。毎週のコマでも EXDATE は 1 件あたり最大 53 行に収まる。1 年あれば
// 期 (半年前後) を丸ごと覆えるうえ、終了日が未設定のまま何年も先まで休講を
// 数えて ICS が膨らむのを防ぐ (窓の外は従来どおり抜けなしで繰り返す)。
const EXDATE_HORIZON_YEARS = 1;

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" を n 日ずらす
function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function addYears(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setFullYear(d.getFullYear() + n);
  return fmtDate(d);
}

// null を「制限なし」とみなして遅い方 / 早い方を返す ("YYYY-MM-DD" は辞書順で比較できる)
function laterOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

function earlierOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

// "19:00-20:20" → { startH: 19, startM: 0, endH: 20, endM: 20 }
function parseTime(timeStr) {
  const [start, end] = timeStr.split("-");
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return { startH: sh, startM: sm, endH: eh, endM: em };
}

// DAYS の index: 月=1, 火=2, ...
const DAY_INDEX = { "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };

// iCal の曜日略称
const ICAL_DAYS = { "月": "MO", "火": "TU", "水": "WE", "木": "TH", "金": "FR", "土": "SA" };

// JST は固定オフセットの単純帯。RFC 5545 で TZID を使うなら VTIMEZONE
// ブロックを ICS 内に持っている方が厳格パーサ (Apple Calendar 等) に対して
// 安全。Asia/Tokyo は DST なし・常に UTC+9 なので静的に書き下せる。
const ASIA_TOKYO_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Tokyo",
  "X-LIC-LOCATION:Asia/Tokyo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0900",
  "TZOFFSETTO:+0900",
  "TZNAME:JST",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

// iCal 形式のタイムスタンプ (ローカル時間。TZID=Asia/Tokyo を付けて使う)。
// EXDATE も DTSTART と同じ値の型・同じ TZID で書く (RFC 5545 §3.8.5.1)
function icalDateTime(dateStr, h, m) {
  return `${dateStr.replace(/-/g, "")}T${pad(h)}${pad(m)}00`;
}

// RRULE の UNTIL。DTSTART が TZID 付きのローカル時刻なので、UNTIL は UTC で
// 書く決まり (RFC 5545 §3.3.10)。その日の 23:59:59 JST = 14:59:59Z を入れて
// 当日の回まで含める (UNTIL は包含。Asia/Tokyo は常に UTC+9 なので固定で引ける)
function icalUntilUtc(dateStr) {
  return `${dateStr.replace(/-/g, "")}T145959Z`;
}

// dateStr 以降 (当日を含む) で最初の該当曜日
function firstWeekdayOnOrAfter(dateStr, dayIdx) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + ((dayIdx - d.getDay() + 7) % 7));
  return fmtDate(d);
}

// コマが授業をしうる期間 { start, end } (null = その側は制限なし)。
//   - 所属時間割 (timetableId 未設定は 1) の startDate / endDate
//   - 表示期間 (学年グループの開始日 〜 コース別終講日 / グループ終了日)。
//     isSlotBeyondCutoff と同じ窓を getSlotCutoffRange で引く
// 開始は遅い方、終了は早い方を採る。
function slotActiveRange(slot, ctx) {
  const tts = ctx.timetables;
  const tt =
    Array.isArray(tts) && tts.length > 0
      ? tts.find((t) => t.id === (slot.timetableId ?? 1))
      : null;
  const cutoff = getSlotCutoffRange(slot, ctx.displayCutoff);
  return {
    start: laterOf(tt?.startDate || null, cutoff.startDate),
    end: earlierOf(tt?.endDate || null, cutoff.endDate),
  };
}

// その日にこの講師がこのコマを実際に教えるか (EXDATE の判定)。
// 「実施されるか」は独自に書き起こさず共通の述語を組み合わせる:
//   - 週 (隔週の A/B) は講師の側から見る = isTeacherActiveOnDate
//     (A 週 = 講師欄 / B 週 = パートナー。休講で週送りが止まる分も込み)
//   - コマそのものが走るかは sessionCount.isSlotHeldOnDate (時間割の有効
//     期間・休講・テスト期間・特別時程の部分休講・コマ休講)。ただしこれは
//     回数計算の視点なので、単独教科の隔週は「B 週 = 実施なし」になる。
//     講師のカレンダーでは B 週もパートナーの授業なので、隔週の印を外した
//     コマ (probe) で「その日にコマが走るか」だけを聞き、週は上に任せる
//   - 表示期間 (学年グループ / コース別終講日) は isSlotBeyondCutoff
//     (isSlotHeldOnDate は見ない。日まるごと振替と同じ組み合わせ)
function isTaughtOn(slot, probe, teacher, dateStr, ctx) {
  if (
    isBiweekly(slot.note) &&
    !isTeacherActiveOnDate(
      slot, teacher, dateStr, ctx.biweeklyAnchors || [], ctx.holidays, ctx.examPeriods
    )
  ) {
    return false;
  }
  if (!isSlotHeldOnDate(probe, dateStr, ctx)) return false;
  return !isSlotBeyondCutoff(dateStr, slot, ctx.displayCutoff);
}

// teacher 視点での「実態に即した教科」と「実態に即した担当表記」を返す。
// 隔週コマは A 週 / B 週で実施科目・実施担当が違うため、ICS の SUMMARY /
// DESCRIPTION にそのまま slot.subj / slot.teacher を出すと誤解を招く。
//   - subject: A 週担当には A 週側の科目 (複合 "英/数" の場合)
//              B 週パートナーには B 週側の科目
//   - teacher 表記: 該当週に実際に実施する人だけを書く
function effectiveSubjectAndTeacher(slot, teacher, dateStr, ctx) {
  if (!isBiweekly(slot.note)) {
    return { subject: slot.subj, teacherDisplay: slot.teacher };
  }
  const subject = biweeklyDisplaySubject(
    slot, dateStr, ctx.biweeklyAnchors || [], ctx.holidays, ctx.examPeriods
  );
  const mainTeachers = getSlotTeachers(slot);
  // teacher が main 側にいる = A 週担当のいずれか。それ以外は partner。
  const teacherDisplay = mainTeachers.includes(teacher)
    ? slot.teacher
    : teacher;
  return { subject, teacherDisplay };
}

/**
 * 副作用 (Blob 書き出し) のない純粋な ICS テキスト生成関数。
 * テスト容易性と再利用性のために `exportTeacherIcs` から切り出してある。
 * `now` を引数化して時刻に依存しないテストを書けるようにしている。
 *
 * @param {string} teacher
 * @param {import("../types").Slot[]} slots
 * @param {object} [ctx] useSessionCtx が返す sessionCtx (timetables /
 *   displayCutoff / isOffForGrade / holidays / examPeriods / daySchedules /
 *   adjustments / biweeklyAnchors …)。欠けている項目はその判定をしない
 *   (例: timetables も displayCutoff も無ければ UNTIL は付かない)
 * @param {Date} [now]
 * @returns {string | null} 書き出す予定が 1 件も無ければ null
 */
export function buildTeacherIcsContent(teacher, slots, ctx = {}, now = new Date()) {
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, teacher));
  if (teacherSlots.length === 0) return null;

  // 開講日 1 限のオリエンは「授業」ではないが、その時間に講師が塞がって
  // いることは変わらない。講師別の月間カレンダー (MonthView) も消さないので
  // 揃える (回数計算の都合で EXDATE にしない)
  const heldCtx = { ...(ctx || {}), orientationOnFirstDay: false };
  const uid = now.getTime();
  // 従来どおり今日の回は含めず、明日以降の該当曜日から始める
  const tomorrow = addDays(fmtDate(now), 1);
  const events = [];

  for (const s of teacherSlots) {
    const dayIdx = DAY_INDEX[s.day];
    if (dayIdx == null) continue;
    const { startH, startM, endH, endM } = parseTime(s.time);
    const biweekly = isBiweekly(s.note);
    const probe = biweekly ? { ...s, note: "" } : s;
    const taught = (dateStr) => isTaughtOn(s, probe, teacher, dateStr, heldCtx);

    // 判定の窓 = [searchStart, windowEnd]。開始は時間割・学年グループの
    // 開始日より前にしない。終わりは終了日と 1 年の早い方
    const range = slotActiveRange(s, heldCtx);
    const searchStart = laterOf(tomorrow, range.start);
    const horizonEnd = addYears(searchStart, EXDATE_HORIZON_YEARS);
    const windowEnd = earlierOf(range.end, horizonEnd);
    // 終了日までの全部の回を窓の中で判定し切れるか。
    const exact = range.end != null && range.end <= horizonEnd;
    // 隔週の週は休講・テスト期間で送りが止まる (getSlotWeekType) ので、
    // 休みを 1 回挟むと INTERVAL=2 の位相がずれる。終わりまで判定し切れる
    // ときは毎週の RRULE にして担当外の週を EXDATE で抜く (ずれも込みで正確)。
    // 終了日が無い / 1 年より先のときは、窓の外が毎週出てしまわないように
    // 従来どおり INTERVAL=2 のまま (終了日を入れれば正確になる)
    const stepDays = biweekly && !exact ? 14 : 7;

    // DTSTART = 実際に教える最初の日。隔週の位相もここで決まるので 7 日刻みで探す
    let first = null;
    for (
      let d = firstWeekdayOnOrAfter(searchStart, dayIdx);
      d <= windowEnd;
      d = addDays(d, 7)
    ) {
      if (taught(d)) {
        first = d;
        break;
      }
    }
    // 窓の中で 1 回も教えない (期が終わった・1 年のあいだ授業が無い) コマは書き出さない
    if (!first) continue;

    let exdates = [];
    let last = first;
    for (let d = addDays(first, stepDays); d <= windowEnd; d = addDays(d, stepDays)) {
      if (taught(d)) last = d;
      else exdates.push(d);
    }
    // UNTIL は終了日。窓の中で全部判定し切れたときは実際の最終授業日まで
    // 詰め、その後ろの EXDATE を落とす (繰り返しの終わりが最後の授業になる)
    let until = range.end;
    if (exact) {
      until = last;
      exdates = exdates.filter((d) => d < last);
    }

    const icalDay = ICAL_DAYS[s.day];
    // 毎週 (INTERVAL=1) は既定値なので省略する。FREQ は先頭に置く
    // (RFC 5545 §3.3.10。旧 RFC 2445 実装との互換のため)
    const rrule = [
      "RRULE:FREQ=WEEKLY",
      stepDays === 14 ? "INTERVAL=2" : null,
      until ? `UNTIL=${icalUntilUtc(until)}` : null,
      `BYDAY=${icalDay}`,
    ].filter(Boolean).join(";");

    const { subject, teacherDisplay } = effectiveSubjectAndTeacher(
      s,
      teacher,
      first,
      heldCtx
    );

    events.push([
      "BEGIN:VEVENT",
      `UID:slot-${s.id}-${uid}@genyakubu`,
      `DTSTART;TZID=Asia/Tokyo:${icalDateTime(first, startH, startM)}`,
      `DTEND;TZID=Asia/Tokyo:${icalDateTime(first, endH, endM)}`,
      rrule,
      // 1 日 1 行にする (1 行に並べると 75 オクテットを超えて折り返しが要る)
      ...exdates.map(
        (d) => `EXDATE;TZID=Asia/Tokyo:${icalDateTime(d, startH, startM)}`
      ),
      `SUMMARY:${escapeIcal(subject)} ${escapeIcal(s.grade)}${s.cls && s.cls !== "-" ? s.cls : ""}`,
      `DESCRIPTION:${escapeIcal(`講師: ${teacherDisplay}\\n教室: ${s.room || ""}\\n備考: ${s.note || ""}`)}`,
      s.room ? `LOCATION:${escapeIcal(s.room)}` : null,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }
  if (events.length === 0) return null;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//genyakubu-manager//JP",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + escapeIcal(`${teacher} 授業予定`),
    "X-WR-TIMEZONE:Asia/Tokyo",
    ASIA_TOKYO_VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ICS をダウンロードさせる。書き出す予定が無ければ何もせず false
// (呼び出し側で「書き出す授業がありません」を出す)。
export function exportTeacherIcs(teacher, slots, ctx = {}) {
  const ical = buildTeacherIcsContent(teacher, slots, ctx);
  if (ical == null) return false;

  const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${teacher}-schedule.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
