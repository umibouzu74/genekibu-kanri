import { describe, expect, it } from "vitest";
import { buildTeacherIcsContent } from "./ics";

// 火曜 (2026-04-07 = 火) を起点に固定。
// アンカーは 2026-04-06 (月) を A 週として設定 → 2026-04-07 火 は A 週、
// 2026-04-14 火 は B 週。
const NOW = new Date("2026-04-06T12:00:00");
const ANCHORS = [{ date: "2026-04-06", weekType: "A" }];

const baseSlot = {
  id: 1,
  day: "火",
  time: "19:00-20:20",
  grade: "中3",
  cls: "-",
  subj: "数学",
  teacher: "堀上",
  room: "101",
};

describe("buildTeacherIcsContent", () => {
  it("通常コマには INTERVAL=2 を付けない", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ANCHORS, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    expect(ical).not.toContain("INTERVAL=2");
  });

  it("隔週コマには INTERVAL=2 を付ける (A 週担当)", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("堀上", [slot], ANCHORS, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    // A 週担当 (堀上) なので最初の出現日は A 週の火曜 = 2026-04-07
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260407T190000");
  });

  it("隔週コマでパートナー (B 週) の場合は B 週の最初の該当曜日を起点にする", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    // 河野 は B 週担当。NOW=2026-04-06(月) → 次の火曜は 04-07 だが A 週なので
    // 1 週後の 04-14 (B 週) が最初の出現日になることを期待。
    const ical = buildTeacherIcsContent("河野", [slot], ANCHORS, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260414T190000");
  });

  it("対象スロットが無ければ null を返す", () => {
    expect(buildTeacherIcsContent("無関係", [baseSlot], ANCHORS, NOW)).toBeNull();
  });

  it("VCALENDAR 全体を返す", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ANCHORS, NOW);
    expect(ical).toMatch(/^BEGIN:VCALENDAR/);
    expect(ical).toMatch(/END:VCALENDAR$/);
    expect(ical).toContain("X-WR-TIMEZONE:Asia/Tokyo");
  });

  it("VTIMEZONE Asia/Tokyo ブロックを VCALENDAR の中に含む", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ANCHORS, NOW);
    expect(ical).toContain("BEGIN:VTIMEZONE");
    expect(ical).toContain("TZID:Asia/Tokyo");
    expect(ical).toContain("TZOFFSETTO:+0900");
    expect(ical).toContain("END:VTIMEZONE");
    // VEVENT より前に置かれていること
    const tzIdx = ical.indexOf("BEGIN:VTIMEZONE");
    const evIdx = ical.indexOf("BEGIN:VEVENT");
    expect(tzIdx).toBeGreaterThan(0);
    expect(tzIdx).toBeLessThan(evIdx);
  });

  it("複合教科の隔週コマでは A 週担当には先頭教科を SUMMARY に出す", () => {
    const slot = { ...baseSlot, subj: "英/数", note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("堀上", [slot], ANCHORS, NOW);
    // 堀上 は A 週担当 → SUMMARY は "英 中3"
    expect(ical).toMatch(/SUMMARY:英 中3/);
    expect(ical).not.toMatch(/SUMMARY:英\/数/);
  });

  it("複合教科の隔週コマでは B 週パートナーには 2 つ目の教科を SUMMARY に出す", () => {
    const slot = { ...baseSlot, subj: "英/数", note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("河野", [slot], ANCHORS, NOW);
    // 河野 は B 週担当 → SUMMARY は "数 中3"
    expect(ical).toMatch(/SUMMARY:数 中3/);
    expect(ical).not.toMatch(/SUMMARY:英\/数/);
  });

  it("隔週コマの DESCRIPTION 講師名は B 週側エクスポート時はパートナー名のみ", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("河野", [slot], ANCHORS, NOW);
    // 河野 用 ICS では DESCRIPTION の講師欄が "河野" になる
    expect(ical).toMatch(/講師: 河野/);
    expect(ical).not.toMatch(/講師: 堀上/);
  });

  it("通常コマの SUMMARY / DESCRIPTION は slot.subj / slot.teacher のまま", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ANCHORS, NOW);
    expect(ical).toMatch(/SUMMARY:数学 中3/);
    expect(ical).toMatch(/講師: 堀上/);
  });
});
