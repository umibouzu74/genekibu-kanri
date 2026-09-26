import { describe, expect, it } from "vitest";
import { buildTeacherIcsContent } from "./ics";
import { makeEventHelpers } from "../components/views/dashboardHelpers";

// 火曜 (2026-04-07 = 火) を起点に固定。
// アンカーは 2026-04-06 (月) を A 週として設定 → 2026-04-07 火 は A 週、
// 2026-04-14 火 は B 週。
const NOW = new Date("2026-04-06T12:00:00");
const ANCHORS = [{ date: "2026-04-06", weekType: "A" }];
// 期間の設定 (時間割・表示期間) が何も無い ctx = 従来どおり終わりなしで繰り返す
const CTX = { biweeklyAnchors: ANCHORS };

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
    const ical = buildTeacherIcsContent("堀上", [baseSlot], CTX, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    expect(ical).not.toContain("INTERVAL=2");
  });

  it("隔週コマには INTERVAL=2 を付ける (A 週担当)", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("堀上", [slot], CTX, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    // A 週担当 (堀上) なので最初の出現日は A 週の火曜 = 2026-04-07
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260407T190000");
  });

  it("隔週コマでパートナー (B 週) の場合は B 週の最初の該当曜日を起点にする", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    // 河野 は B 週担当。NOW=2026-04-06(月) → 次の火曜は 04-07 だが A 週なので
    // 1 週後の 04-14 (B 週) が最初の出現日になることを期待。
    const ical = buildTeacherIcsContent("河野", [slot], CTX, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260414T190000");
  });

  it("対象スロットが無ければ null を返す", () => {
    expect(buildTeacherIcsContent("無関係", [baseSlot], CTX, NOW)).toBeNull();
  });

  it("VCALENDAR 全体を返す", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], CTX, NOW);
    expect(ical).toMatch(/^BEGIN:VCALENDAR/);
    expect(ical).toMatch(/END:VCALENDAR$/);
    expect(ical).toContain("X-WR-TIMEZONE:Asia/Tokyo");
  });

  it("VTIMEZONE Asia/Tokyo ブロックを VCALENDAR の中に含む", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], CTX, NOW);
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
    const ical = buildTeacherIcsContent("堀上", [slot], CTX, NOW);
    // 堀上 は A 週担当 → SUMMARY は "英 中3"
    expect(ical).toMatch(/SUMMARY:英 中3/);
    expect(ical).not.toMatch(/SUMMARY:英\/数/);
  });

  it("複合教科の隔週コマでは B 週パートナーには 2 つ目の教科を SUMMARY に出す", () => {
    const slot = { ...baseSlot, subj: "英/数", note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("河野", [slot], CTX, NOW);
    // 河野 は B 週担当 → SUMMARY は "数 中3"
    expect(ical).toMatch(/SUMMARY:数 中3/);
    expect(ical).not.toMatch(/SUMMARY:英\/数/);
  });

  it("隔週コマの DESCRIPTION 講師名は B 週側エクスポート時はパートナー名のみ", () => {
    const slot = { ...baseSlot, note: "隔週(河野)" };
    const ical = buildTeacherIcsContent("河野", [slot], CTX, NOW);
    // 河野 用 ICS では DESCRIPTION の講師欄が "河野" になる
    expect(ical).toMatch(/講師: 河野/);
    expect(ical).not.toMatch(/講師: 堀上/);
  });

  it("通常コマの SUMMARY / DESCRIPTION は slot.subj / slot.teacher のまま", () => {
    const ical = buildTeacherIcsContent("堀上", [baseSlot], CTX, NOW);
    expect(ical).toMatch(/SUMMARY:数学 中3/);
    expect(ical).toMatch(/講師: 堀上/);
  });
});

// ─── 繰り返しの終わり (UNTIL) と抜け (EXDATE) ───────────────────────
// 夏休み・期切替の後も休講日も、講師のカレンダーに授業が出続けないように。

// 画面 (useSessionCtx) と同じ形の ctx を組む。休講・テスト期間の判定は
// 本物の makeEventHelpers を通す
function makeCtx({ holidays = [], examPeriods = [], ...rest } = {}) {
  const { isOffForGrade } = makeEventHelpers(holidays, examPeriods, []);
  return {
    biweeklyAnchors: ANCHORS,
    holidays,
    examPeriods,
    isOffForGrade,
    classSets: [],
    allSlots: [baseSlot],
    ...rest,
  };
}

const TT = (over = {}) => ({ id: 1, name: "1学期", grades: [], ...over });
const GROUP = (over = {}) => ({ label: "中3", grades: ["中3"], ...over });
const exdatesOf = (ical) =>
  ical.split("\r\n").filter((l) => l.startsWith("EXDATE"));

describe("buildTeacherIcsContent - UNTIL", () => {
  it("所属時間割の終了日で止める (UNTIL は UTC、最後の授業日の 23:59:59 JST)", () => {
    const ctx = makeCtx({ timetables: [TT({ startDate: "2026-04-01", endDate: "2026-07-20" })] });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    // 7/20 (月) 以前の最後の火曜は 7/14
    expect(ical).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260714T145959Z;BYDAY=TU");
  });

  it("timetableId 未設定のコマは時間割 id 1 の期間を使う", () => {
    const ctx = makeCtx({
      timetables: [
        TT({ endDate: "2026-06-30" }),
        TT({ id: 2, name: "2学期", startDate: "2026-07-01" }),
      ],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("UNTIL=20260630T145959Z");
  });

  it("表示期間 (学年グループの終了日) で止める", () => {
    const ctx = makeCtx({
      displayCutoff: { groups: [GROUP({ startDate: "2026-04-07", date: "2026-06-30" })] },
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("UNTIL=20260630T145959Z");
  });

  it("コース別終講日がグループの終了日より早ければそちらで止める", () => {
    const ctx = makeCtx({
      displayCutoff: {
        groups: [GROUP({ startDate: "2026-04-07", date: "2026-07-17" })],
        cohorts: [{ id: "M|中3|火金", label: "中3 火金", grade: "中3", date: "2026-06-23" }],
      },
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("UNTIL=20260623T145959Z");
  });

  it("時間割の終了日と表示期間の終了日の早い方を採る", () => {
    const ctx = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      displayCutoff: { groups: [GROUP({ date: "2026-06-30" })] },
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("UNTIL=20260630T145959Z");
    expect(ical).not.toContain("UNTIL=20260714");
  });

  it("終了日がどこにも無ければ UNTIL を付けない (終わりを勝手に作らない)", () => {
    const ctx = makeCtx({
      timetables: [TT({ startDate: "2026-04-01" })],
      displayCutoff: { groups: [GROUP({ startDate: "2026-04-07" })] },
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    expect(ical).not.toContain("UNTIL=");
  });

  it("最後の授業日が休講なら UNTIL はその前の授業日まで詰める", () => {
    const ctx = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      holidays: [{ id: 1, date: "2026-07-14", scope: ["全部"] }],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("UNTIL=20260707T145959Z");
    // UNTIL より後ろの EXDATE は要らない
    expect(ical).not.toContain("EXDATE;TZID=Asia/Tokyo:20260714T190000");
  });
});

describe("buildTeacherIcsContent - DTSTART の下限", () => {
  it("時間割の開始日より前には置かない", () => {
    const ctx = makeCtx({ timetables: [TT({ startDate: "2026-05-01" })] });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    // 5/1 (金) 以降の最初の火曜 = 5/5
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260505T190000");
    expect(ical).toContain("DTEND;TZID=Asia/Tokyo:20260505T202000");
  });

  it("学年グループの開始日が時間割より遅ければそちらに合わせる", () => {
    const ctx = makeCtx({
      timetables: [TT({ startDate: "2026-05-01" })],
      displayCutoff: { groups: [GROUP({ startDate: "2026-05-12" })] },
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260512T190000");
  });

  it("最初の回が休講なら DTSTART は次の授業日にする", () => {
    const ctx = makeCtx({ holidays: [{ id: 1, date: "2026-04-07", scope: ["全部"] }] });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260414T190000");
    expect(ical).not.toContain("20260407T190000");
  });

  it("期が終わったコマしか無ければ何も書き出さない (null)", () => {
    const ctx = makeCtx({ timetables: [TT({ endDate: "2026-03-31" })] });
    expect(buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW)).toBeNull();
  });

  it("終わったコマだけ落とし、続いているコマは残す", () => {
    const oldSlot = { ...baseSlot, id: 2, timetableId: 2, day: "木" };
    const ctx = makeCtx({
      timetables: [TT(), TT({ id: 2, name: "旧", endDate: "2026-03-31" })],
      allSlots: [baseSlot, oldSlot],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot, oldSlot], ctx, NOW);
    expect(ical).toContain("UID:slot-1-");
    expect(ical).not.toContain("UID:slot-2-");
  });
});

describe("buildTeacherIcsContent - EXDATE", () => {
  it("窓の中の休講日は EXDATE、普通の日は EXDATE にしない", () => {
    const ctx = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      holidays: [{ id: 1, date: "2026-04-28", scope: ["全部"] }],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    // DTSTART と同じ値の型・同じ TZID・同じ時刻で書く
    expect(ical).toContain("EXDATE;TZID=Asia/Tokyo:20260428T190000");
    expect(ical).not.toContain("EXDATE;TZID=Asia/Tokyo:20260421T190000");
    expect(exdatesOf(ical)).toHaveLength(1);
  });

  it("他の学年だけの休講は抜かない", () => {
    const ctx = makeCtx({
      holidays: [{ id: 1, date: "2026-04-28", scope: ["全部"], targetGrades: ["中1"] }],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(exdatesOf(ical)).toHaveLength(0);
  });

  it("授業を止めるテスト期間は抜き、止めないテスト期間は抜かない", () => {
    const stop = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      examPeriods: [
        { id: 1, name: "中間", startDate: "2026-05-11", endDate: "2026-05-22", targetGrades: ["中3"] },
      ],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], stop, NOW);
    expect(ical).toContain("EXDATE;TZID=Asia/Tokyo:20260512T190000");
    expect(ical).toContain("EXDATE;TZID=Asia/Tokyo:20260519T190000");

    const keep = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      examPeriods: [
        {
          id: 1, name: "中間", startDate: "2026-05-11", endDate: "2026-05-22",
          targetGrades: ["中3"], stopsClasses: false,
        },
      ],
    });
    expect(exdatesOf(buildTeacherIcsContent("堀上", [baseSlot], keep, NOW))).toHaveLength(0);
  });

  it("コマ休講 (adjustments の cancel) と特別時程の部分休講を抜く", () => {
    const ctx = makeCtx({
      timetables: [TT({ endDate: "2026-07-20" })],
      adjustments: [{ id: 1, type: "cancel", date: "2026-05-05", slotId: 1 }],
      daySchedules: [
        { id: 1, date: "2026-06-02", targetGrades: ["中3"], timeMap: [], cancelTimes: ["19:00-20:20"] },
      ],
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("EXDATE;TZID=Asia/Tokyo:20260505T190000");
    expect(ical).toContain("EXDATE;TZID=Asia/Tokyo:20260602T190000");
    expect(exdatesOf(ical)).toHaveLength(2);
  });

  it("開講日 1 限のオリエンは抜かない (講師はその時間塞がっている)", () => {
    const ctx = makeCtx({
      displayCutoff: {
        groups: [GROUP({ startDate: "2026-04-07", date: "2026-07-20", orientationFirstDay: true })],
      },
      orientationOnFirstDay: true,
    });
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260407T190000");
    expect(exdatesOf(ical)).toHaveLength(0);
  });

  it("終了日が無いときの EXDATE は起点から 1 年で打ち切る (件数に上限がある)", () => {
    // 4/7 以外は全部休講 = 抜きたい日が際限なくある状態
    const ctx = {
      biweeklyAnchors: ANCHORS,
      isOffForGrade: (d) => d !== "2026-04-07",
    };
    const ical = buildTeacherIcsContent("堀上", [baseSlot], ctx, NOW);
    const ex = exdatesOf(ical);
    expect(ical).not.toContain("UNTIL=");
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.length).toBeLessThanOrEqual(53);
    // 窓の終わり = 起点 (4/7) の 1 年後
    const last = ex[ex.length - 1].split(":")[1];
    expect(last < "20270408").toBe(true);
  });
});

describe("buildTeacherIcsContent - 隔週と EXDATE", () => {
  const slot = { ...baseSlot, note: "隔週(河野)" };
  // 4/21 (A 週) が休講 → 週送りが止まり、4/28 以降は A/B が入れ替わる
  // (getSlotWeekType)。INTERVAL=2 では位相がずれるので、終了日までを判定し
  // 切れるときは毎週の RRULE + 担当外の週を EXDATE で表す
  const ctx = makeCtx({
    allSlots: [slot],
    timetables: [TT({ endDate: "2026-05-19" })],
    holidays: [{ id: 1, date: "2026-04-21", scope: ["全部"] }],
  });

  it("A 週担当: 休講を挟んだ週送りのずれまで反映する", () => {
    const ical = buildTeacherIcsContent("堀上", [slot], ctx, NOW);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260407T190000");
    expect(ical).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260512T145959Z;BYDAY=TU");
    expect(exdatesOf(ical).map((l) => l.split(":")[1])).toEqual([
      "20260414T190000", // B 週
      "20260421T190000", // 休講
      "20260505T190000", // 週送りのずれで B 週
    ]);
  });

  it("B 週パートナー: 自分の週だけが残る", () => {
    const ical = buildTeacherIcsContent("河野", [slot], ctx, NOW);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260414T190000");
    expect(ical).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260519T145959Z;BYDAY=TU");
    expect(exdatesOf(ical).map((l) => l.split(":")[1])).toEqual([
      "20260421T190000",
      "20260428T190000",
      "20260512T190000",
    ]);
  });

  it("終了日が無いときは従来どおり INTERVAL=2 (窓の外が毎週出ないように)", () => {
    const noEnd = makeCtx({ allSlots: [slot] });
    const ical = buildTeacherIcsContent("河野", [slot], noEnd, NOW);
    expect(ical).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(exdatesOf(ical)).toHaveLength(0);
  });
});
