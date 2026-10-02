// ─── iCal/ICS export ───────────────────────────────────────────────
// 講師の週間スケジュールを iCalendar (.ics) 形式でエクスポートする。
// Google Calendar にインポートして講師のスケジュールを共有できる。
import {
  biweeklyDisplaySubject,
  getSlotTeachers,
  isBiweekly,
  isSlotForTeacher,
  isTeacherActiveOnDate,
} from "./biweekly";
import { escapeIcal } from "./escape";
import { parseLocalDate } from "./dateHelpers";
import {
  formatOffsitePeriod,
  listOffsiteDates,
  offsiteTimeRange,
  sortOffsiteDays,
} from "./offsiteLessons";

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtIsoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// iCal 形式のタイムスタンプ (ローカル時間)
function icalDateTime(date, h, m) {
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`;
}

// 次の該当曜日を取得
function nextDayOfWeek(baseDate, dayIdx) {
  const d = new Date(baseDate);
  const current = d.getDay(); // 0=日 ~ 6=土
  // DAY_INDEX は月=1 だが getDay() は月=1
  const diff = (dayIdx - current + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// 隔週コマの場合、teacher がその週に実施しないなら 1 週進める。
// 結果として、A 週担当の講師は A 週の最初の該当曜日が DTSTART に、
// B 週 (隔週パートナー) の講師は B 週の最初の該当曜日が DTSTART に入る。
// アンカー未設定の場合は安全側で「次の該当曜日」をそのまま返す
// (`isTeacherActiveOnDate` は anchors 不在で true を返す)。
function nextActiveDayForTeacher(baseDate, dayIdx, slot, teacher, anchors) {
  const first = nextDayOfWeek(baseDate, dayIdx);
  if (!isBiweekly(slot.note)) return first;
  if (isTeacherActiveOnDate(slot, teacher, fmtIsoDate(first), anchors)) {
    return first;
  }
  const next = new Date(first);
  next.setDate(next.getDate() + 7);
  return next;
}

// teacher 視点での「実態に即した教科」と「実態に即した担当表記」を返す。
// 隔週コマは A 週 / B 週で実施科目・実施担当が違うため、ICS の SUMMARY /
// DESCRIPTION にそのまま slot.subj / slot.teacher を出すと誤解を招く。
//   - subject: A 週担当には A 週側の科目 (複合 "英/数" の場合)
//              B 週パートナーには B 週側の科目
//   - teacher 表記: 該当週に実際に実施する人だけを書く
function effectiveSubjectAndTeacher(slot, teacher, eventDate, anchors) {
  if (!isBiweekly(slot.note)) {
    return { subject: slot.subj, teacherDisplay: slot.teacher };
  }
  const dateStr = fmtIsoDate(eventDate);
  const subject = biweeklyDisplaySubject(slot, dateStr, anchors);
  const mainTeachers = getSlotTeachers(slot);
  // teacher が main 側にいる = A 週担当のいずれか。それ以外は partner。
  const teacherDisplay = mainTeachers.includes(teacher)
    ? slot.teacher
    : teacher;
  return { subject, teacherDisplay };
}

// ─── 他校舎の授業 (utils/offsiteLessons) ─────────────────────────────
// 毎週の予定なので通常コマと同じく RRULE にする。コマと違って期間があるので
// 終了日は UNTIL、休みの日 (skipDates) と塾の全体休講日 (keepOnHolidays で
// なければ) は EXDATE で抜く。終了日未定は UNTIL を付けず、EXDATE は 1 年先
// までの分だけ書く。終了時刻が未定 ("13:30") の予定は 1 時間の枠で置き、
// 件名に「終了時刻未定」と書く。

// 1 年先までの EXDATE を書く (終了日未定の予定)
const OFFSITE_EXDATE_HORIZON_DAYS = 366;

function firstMatchingDate(fromStr, days) {
  const d = parseLocalDate(fromStr);
  if (!d) return null;
  for (let i = 0; i < 7; i++) {
    if (days.includes(["日", "月", "火", "水", "木", "金", "土"][d.getDay()])) return d;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function buildOffsiteEvents(teacher, offsiteLessons, holidays, now, uid) {
  const todayStr = fmtIsoDate(now);
  const events = [];
  for (const rec of offsiteLessons || []) {
    if (rec?.teacher !== teacher) continue;
    if (rec.endDate && rec.endDate < todayStr) continue;
    const range = offsiteTimeRange(rec.time);
    const days = sortOffsiteDays(rec.days).filter((d) => ICAL_DAYS[d]);
    if (!range || days.length === 0 || !rec.startDate) continue;
    const first = firstMatchingDate(rec.startDate > todayStr ? rec.startDate : todayStr, days);
    if (!first) continue;
    const firstStr = fmtIsoDate(first);
    if (rec.endDate && firstStr > rec.endDate) continue;
    const sh = Math.floor(range.start / 60);
    const sm = range.start % 60;
    const endMin = Math.min(range.end ?? range.start + 60, 23 * 60 + 59);
    const horizon = new Date(first);
    horizon.setDate(horizon.getDate() + OFFSITE_EXDATE_HORIZON_DAYS);
    const exdates = listOffsiteDates(rec, {
      from: firstStr,
      to: rec.endDate || fmtIsoDate(horizon),
      holidays,
    })
      .filter((x) => x.status !== "on")
      .map((x) => icalDateTime(parseLocalDate(x.date), sh, sm));
    // DTSTART が TZID 付きなので UNTIL は UTC で書く (RFC 5545)。
    // 終了日 23:59:59 JST = 同日 14:59:59Z
    const until = rec.endDate ? `;UNTIL=${rec.endDate.replace(/-/g, "")}T145959Z` : "";
    const openEnd = range.end == null;
    const desc = [
      "他校舎の授業",
      `期間: ${formatOffsitePeriod(rec)}`,
      openEnd ? "終了時刻は未定 (仮に 1 時間で置いています)" : null,
      rec.memo || null,
    ]
      .filter(Boolean)
      .join("\n");
    events.push(
      [
        "BEGIN:VEVENT",
        `UID:offsite-${rec.id}-${uid}@genyakubu`,
        `DTSTART;TZID=Asia/Tokyo:${icalDateTime(first, sh, sm)}`,
        `DTEND;TZID=Asia/Tokyo:${icalDateTime(first, Math.floor(endMin / 60), endMin % 60)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICAL_DAYS[d]).join(",")}${until}`,
        exdates.length > 0 ? `EXDATE;TZID=Asia/Tokyo:${exdates.join(",")}` : null,
        `SUMMARY:${escapeIcal(`他校舎 ${rec.place}${openEnd ? " (終了時刻未定)" : ""}`)}`,
        `DESCRIPTION:${escapeIcal(desc)}`,
        `LOCATION:${escapeIcal(rec.place)}`,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n")
    );
  }
  return events;
}

// 副作用 (Blob 書き出し) のない純粋な ICS テキスト生成関数。
// テスト容易性と再利用性のために `exportTeacherIcs` から切り出してある。
// `now` を引数化して時刻に依存しないテストを書けるようにしている。
// opts.offsiteLessons / opts.holidays を渡すと、その講師の他校舎の授業も入れる。
export function buildTeacherIcsContent(
  teacher,
  slots,
  biweeklyAnchors = [],
  now = new Date(),
  { offsiteLessons = [], holidays = [] } = {}
) {
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, teacher));

  const uid = now.getTime();
  const events = [];

  for (const s of teacherSlots) {
    const dayIdx = DAY_INDEX[s.day];
    if (dayIdx == null) continue;
    const { startH, startM, endH, endM } = parseTime(s.time);
    const biweekly = isBiweekly(s.note);
    const eventDate = nextActiveDayForTeacher(
      now,
      dayIdx,
      s,
      teacher,
      biweeklyAnchors
    );
    const icalDay = ICAL_DAYS[s.day];
    // 隔週は 2 週ごとに発生するので RRULE に INTERVAL=2 を付ける。
    // 通常コマは毎週なので既定値 (INTERVAL=1) で十分なので省略する。
    const rrule = biweekly
      ? `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${icalDay}`
      : `RRULE:FREQ=WEEKLY;BYDAY=${icalDay}`;

    const { subject, teacherDisplay } = effectiveSubjectAndTeacher(
      s,
      teacher,
      eventDate,
      biweeklyAnchors
    );

    events.push([
      "BEGIN:VEVENT",
      `UID:slot-${s.id}-${uid}@genyakubu`,
      `DTSTART;TZID=Asia/Tokyo:${icalDateTime(eventDate, startH, startM)}`,
      `DTEND;TZID=Asia/Tokyo:${icalDateTime(eventDate, endH, endM)}`,
      rrule,
      `SUMMARY:${escapeIcal(subject)} ${escapeIcal(s.grade)}${s.cls && s.cls !== "-" ? s.cls : ""}`,
      // 改行は本物の改行で渡し、escapeIcal に iCal の改行記法へ変換させる
      // (以前は「バックスラッシュ + n」の 2 文字を渡していて、escapeIcal が
      // バックスラッシュを二重にするため、カレンダーに「\n」が文字のまま出ていた)
      `DESCRIPTION:${escapeIcal(`講師: ${teacherDisplay}\n教室: ${s.room || ""}\n備考: ${s.note || ""}`)}`,
      s.room ? `LOCATION:${escapeIcal(s.room)}` : null,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }

  events.push(...buildOffsiteEvents(teacher, offsiteLessons, holidays, now, uid));
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

export function exportTeacherIcs(teacher, slots, biweeklyAnchors = [], opts = {}) {
  const ical = buildTeacherIcsContent(teacher, slots, biweeklyAnchors, new Date(), opts);
  if (ical == null) return;

  const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${teacher}-schedule.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
