// ─── iCal/ICS export ───────────────────────────────────────────────
// 講師の週間スケジュールを iCalendar (.ics) 形式でエクスポートする。
// Google Calendar にインポートして講師のスケジュールを共有できる。
import { isBiweekly, isSlotForTeacher, isTeacherActiveOnDate } from "./biweekly";
import { escapeIcal } from "./escape";

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

// 副作用 (Blob 書き出し) のない純粋な ICS テキスト生成関数。
// テスト容易性と再利用性のために `exportTeacherIcs` から切り出してある。
// `now` を引数化して時刻に依存しないテストを書けるようにしている。
export function buildTeacherIcsContent(teacher, slots, biweeklyAnchors = [], now = new Date()) {
  const teacherSlots = slots.filter((s) => isSlotForTeacher(s, teacher));
  if (teacherSlots.length === 0) return null;

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

    events.push([
      "BEGIN:VEVENT",
      `UID:slot-${s.id}-${uid}@genyakubu`,
      `DTSTART;TZID=Asia/Tokyo:${icalDateTime(eventDate, startH, startM)}`,
      `DTEND;TZID=Asia/Tokyo:${icalDateTime(eventDate, endH, endM)}`,
      rrule,
      `SUMMARY:${escapeIcal(s.subj)} ${escapeIcal(s.grade)}${s.cls && s.cls !== "-" ? s.cls : ""}`,
      `DESCRIPTION:${escapeIcal(`講師: ${s.teacher}\\n教室: ${s.room || ""}\\n備考: ${s.note || ""}`)}`,
      s.room ? `LOCATION:${escapeIcal(s.room)}` : null,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//genyakubu-manager//JP",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + escapeIcal(`${teacher} 授業予定`),
    "X-WR-TIMEZONE:Asia/Tokyo",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function exportTeacherIcs(teacher, slots, biweeklyAnchors = []) {
  const ical = buildTeacherIcsContent(teacher, slots, biweeklyAnchors);
  if (ical == null) return;

  const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${teacher}-schedule.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
