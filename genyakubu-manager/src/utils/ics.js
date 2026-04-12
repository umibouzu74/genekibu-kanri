// ─── iCal/ICS export ───────────────────────────────────────────────
// 講師の週間スケジュールを iCalendar (.ics) 形式でエクスポートする。
// Google Calendar にインポートして講師のスケジュールを共有できる。

function pad(n) {
  return String(n).padStart(2, "0");
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

function escapeIcal(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function exportTeacherIcs(teacher, slots) {
  const teacherSlots = slots.filter(
    (s) => s.teacher === teacher || s.note?.includes(teacher)
  );
  if (teacherSlots.length === 0) return;

  const today = new Date();
  const uid = Date.now();
  const events = [];

  for (const s of teacherSlots) {
    const dayIdx = DAY_INDEX[s.day];
    if (dayIdx == null) continue;
    const { startH, startM, endH, endM } = parseTime(s.time);
    const eventDate = nextDayOfWeek(today, dayIdx);
    const icalDay = ICAL_DAYS[s.day];

    events.push([
      "BEGIN:VEVENT",
      `UID:slot-${s.id}-${uid}@genyakubu`,
      `DTSTART;TZID=Asia/Tokyo:${icalDateTime(eventDate, startH, startM)}`,
      `DTEND;TZID=Asia/Tokyo:${icalDateTime(eventDate, endH, endM)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${icalDay}`,
      `SUMMARY:${escapeIcal(s.subj)} ${escapeIcal(s.grade)}${s.cls && s.cls !== "-" ? s.cls : ""}`,
      `DESCRIPTION:${escapeIcal(`講師: ${s.teacher}\\n教室: ${s.room || ""}\\n備考: ${s.note || ""}`)}`,
      s.room ? `LOCATION:${escapeIcal(s.room)}` : null,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//genyakubu-manager//JP",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + escapeIcal(`${teacher} 授業予定`),
    "X-WR-TIMEZONE:Asia/Tokyo",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${teacher}-schedule.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
