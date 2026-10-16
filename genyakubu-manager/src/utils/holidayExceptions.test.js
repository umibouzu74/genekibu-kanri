import { describe, expect, it } from "vitest";
import {
  addHolidayException,
  holidayExceptionSlots,
  holidaysCancellingSlot,
  holidaysExceptingSlot,
  removeHolidayException,
} from "./holidayExceptions";
import { holidayMatches, isFullDayHoliday, isGranularHoliday, isSlotCancelledByHoliday } from "./scheduleHelpers";
import { makeEventHelpers } from "../components/views/dashboardHelpers";

const physics = { id: 7, day: "水", time: "19:00-20:20", grade: "高2", subj: "高松一 物理" };
const english = { id: 8, day: "水", time: "19:00-20:20", grade: "高2", subj: "高松一 英語" };
const hol = { id: 1, date: "2026-09-09", label: "休講", scope: ["高校部"], targetGrades: ["高1", "高2"], subjKeywords: [] };

describe("休講日の例外 (この日は授業あり)", () => {
  it("例外にしたコマだけ休講日が効かない", () => {
    const { next, changedIds } = addHolidayException([hol], physics, "2026-09-09");
    expect(changedIds).toEqual([1]);
    expect(next[0].excludeSlotIds).toEqual([7]);
    expect(isSlotCancelledByHoliday(physics, "2026-09-09", next)).toBe(false);
    expect(isSlotCancelledByHoliday(english, "2026-09-09", next)).toBe(true);
  });

  it("isOffForGrade もコマ id を渡したときだけ例外を見る", () => {
    const { next } = addHolidayException([hol], physics, "2026-09-09");
    const { isOffForGrade } = makeEventHelpers(next, []);
    expect(isOffForGrade("2026-09-09", "高2", physics.subj, physics.id)).toBe(false);
    expect(isOffForGrade("2026-09-09", "高2", english.subj, english.id)).toBe(true);
    // 学年単位の判定 (コマ id なし) は休講日どおり
    expect(isOffForGrade("2026-09-09", "高2", physics.subj)).toBe(true);
  });

  it("例外を外すと休講に戻り、空になったらキーごと消える", () => {
    const { next } = addHolidayException([hol], physics, "2026-09-09");
    expect(holidaysExceptingSlot(next, physics, "2026-09-09").map((h) => h.id)).toEqual([1]);
    const back = removeHolidayException(next, physics, "2026-09-09").next;
    expect(back[0]).not.toHaveProperty("excludeSlotIds");
    expect(isSlotCancelledByHoliday(physics, "2026-09-09", back)).toBe(true);
  });

  it("休講日の効いていないコマには何もしない", () => {
    const other = { ...physics, id: 9, grade: "高3" };
    expect(holidaysCancellingSlot([hol], other, "2026-09-09")).toEqual([]);
    const { next, changedIds } = addHolidayException([hol], other, "2026-09-09");
    expect(changedIds).toEqual([]);
    expect(next).toEqual([hol]);
  });

  it("例外のある休講日は全日休講・部門まるごとの扱いにしない", () => {
    const all = { id: 2, date: "2026-12-07", label: "休校", scope: ["全部"], targetGrades: [], subjKeywords: [] };
    expect(isFullDayHoliday(all)).toBe(true);
    expect(isFullDayHoliday({ ...all, excludeSlotIds: [7] })).toBe(false);
    expect(isGranularHoliday({ ...all, excludeSlotIds: [7] })).toBe(true);
  });

  it("文字列の id (手編集) も同じコマとして照合する", () => {
    expect(holidayMatches({ ...hol, excludeSlotIds: ["7"] }, "高2", physics.subj, 7)).toBe(false);
  });

  it("一覧の表示用に例外のコマを引く (消えたコマは null)", () => {
    const list = holidayExceptionSlots({ ...hol, excludeSlotIds: [7, 99] }, [physics, english]);
    expect(list.map((x) => x.slot?.id ?? null)).toEqual([7, null]);
  });

  it("共通学年 (附中) は対象学年にそれ自体を選んだときだけ止まる", () => {
    const fz = { grade: "附中", subj: "確認テスト" };
    const h = { id: 3, date: "2026-11-18", scope: ["中学部"], targetGrades: ["附中1", "附中2", "附中3"], subjKeywords: [] };
    expect(holidayMatches(h, fz.grade, fz.subj)).toBe(false);
    expect(holidayMatches({ ...h, targetGrades: [...h.targetGrades, "附中"] }, fz.grade, fz.subj)).toBe(true);
  });
});
