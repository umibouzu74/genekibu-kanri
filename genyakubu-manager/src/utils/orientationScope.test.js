// 開講日 1 限のオリエンは「本科だけ」「年度の最初の期だけ (既定)」(2026-11-19)。
// プレップ (学年をまたぐコマ)・附属は授業の前に簡単に済ませるので回数から外さない。
import { describe, expect, it } from "vitest";
import {
  computeSessionNumber,
  isOrientationEnabledForSlot,
  isOrientationTargetSlot,
} from "./sessionCount";
import { isFirstTermTimetable } from "./timetable";
import { normalizeSlotCountFields } from "./slotDates";
import { buildCutoffFollowUp } from "../regular-builder/reflect";

const mk = (id, o = {}) => ({
  id,
  day: "火",
  time: "18:55-19:40",
  grade: "中1",
  cls: "",
  room: "601",
  subj: "数学",
  teacher: "T",
  note: "",
  ...o,
});

const GROUP = { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: null };
const DC = { groups: [GROUP] };
const ctxOf = (slots, extra = {}) => ({
  classSets: [],
  allSlots: slots,
  displayCutoff: DC,
  isOffForGrade: () => false,
  orientationOnFirstDay: true,
  ...extra,
});

describe("isOrientationTargetSlot (本科のコマだけ)", () => {
  it("学年グループの学年そのもののコマは対象", () => {
    expect(isOrientationTargetSlot(mk(1), GROUP)).toBe(true);
  });
  it("学年をまたぐコマ (土曜プレップ「中1-3」) は対象外", () => {
    expect(isOrientationTargetSlot(mk(1, { grade: "中1-3" }), GROUP)).toBe(false);
  });
  it("附属 (附中…) はグループに入れていても対象外", () => {
    const g = { ...GROUP, grades: ["中1", "附中1"] };
    expect(isOrientationTargetSlot(mk(1, { grade: "附中1" }), g)).toBe(false);
  });
  it("コマの編集で「オリエンの対象外」にしたコマは対象外", () => {
    expect(isOrientationTargetSlot(mk(1, { noOrientation: true }), GROUP)).toBe(false);
  });
  it("学年グループの無いコマは対象外", () => {
    expect(isOrientationTargetSlot(mk(1), null)).toBe(false);
  });
});

describe("computeSessionNumber: オリエンは本科だけ", () => {
  it("土曜プレップ (中1-3) の初日の 1 コマ目は第1回", () => {
    const prep = mk(1, { day: "土", grade: "中1-3", subj: "プレップ", time: "13:00-14:20" });
    const ctx = ctxOf([prep]);
    expect(computeSessionNumber(prep, "2026-04-11", ctx)).toBe(1);
  });

  it("本科は従来どおり初日の 1 限がオリエン", () => {
    const a = mk(1);
    const b = mk(2, { time: "19:50-20:35", subj: "英語" });
    const ctx = ctxOf([a, b]);
    expect(computeSessionNumber(a, "2026-04-07", ctx)).toBe(0);
    expect(computeSessionNumber(b, "2026-04-07", ctx)).toBe(1);
  });

  it("オリエンの対象外のコマが一番早くても、本科の一番早いコマがオリエン", () => {
    const early = mk(1, { time: "17:00-17:45", subj: "内申対策", noOrientation: true });
    const a = mk(2);
    const b = mk(3, { time: "19:50-20:35", subj: "英語" });
    const ctx = ctxOf([early, a, b]);
    expect(computeSessionNumber(early, "2026-04-07", ctx)).toBe(1);
    expect(computeSessionNumber(a, "2026-04-07", ctx)).toBe(0);
    expect(computeSessionNumber(b, "2026-04-07", ctx)).toBe(1);
  });
});

describe("オリエンの既定は年度の最初の期だけ", () => {
  const T1 = { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] };
  const T3 = { id: 3, name: "2学期", type: "regular", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] };
  const T4 = { id: 4, name: "3学期", type: "regular", startDate: "2027-01-08", endDate: null, grades: [] };
  const TTS = [T1, T3, T4];
  const s1 = mk(1);
  const s3 = mk(3, { timetableId: 3, day: "水" });
  const dc2 = { groups: [{ ...GROUP, startDate: "2026-08-25" }] };

  it("isFirstTermTimetable: 同じ年度 (3 月始まり) に前の期があれば最初の期ではない", () => {
    expect(isFirstTermTimetable(T1, TTS)).toBe(true);
    expect(isFirstTermTimetable(T3, TTS)).toBe(false);
    expect(isFirstTermTimetable(T4, TTS)).toBe(false);
    // 3 月から始める新年度の期は次の年度の最初の期
    expect(isFirstTermTimetable({ id: 9, startDate: "2027-03-23", grades: [] }, TTS)).toBe(true);
    // 開始日の無い時間割 (1 つだけの運用) は最初の期とみなす
    expect(isFirstTermTimetable({ id: 1, startDate: null }, [])).toBe(true);
  });

  it("isFirstTermTimetable: 学年の重ならない時間割 (附属だけの期) は数えない", () => {
    const fuzoku = { id: 5, startDate: "2026-04-07", grades: ["附中1", "附中2"] };
    const later = { id: 6, startDate: "2026-06-01", grades: ["中3"] };
    expect(isFirstTermTimetable(later, [fuzoku, later])).toBe(true);
    expect(isFirstTermTimetable(later, [T1, later])).toBe(false);
  });

  it("2学期 (未設定) は既定でオリエンなし、1学期は既定でオリエンあり", () => {
    expect(isOrientationEnabledForSlot(s3, dc2, TTS)).toBe(false);
    expect(isOrientationEnabledForSlot(s1, DC, TTS)).toBe(true);
    // 時間割を渡さなければ従来どおり (中学部はオン)
    expect(isOrientationEnabledForSlot(s3, dc2)).toBe(true);
  });

  it("2学期でも明示的にオンにしたグループはオリエン", () => {
    const on = { groups: [{ ...GROUP, startDate: "2026-08-25", orientationFirstDay: true }] };
    expect(isOrientationEnabledForSlot(s3, on, TTS)).toBe(true);
  });

  it("2学期の初日の 1 限は (未設定なら) 第1回", () => {
    const ctx = ctxOf([s1, s3], { displayCutoff: dc2, timetables: TTS });
    expect(computeSessionNumber(s3, "2026-08-26", ctx)).toBe(1);
  });

  it("期切替の「新しい期はオリエンなし」: 未設定のグループは 2学期では既に無効なので対象にしない", () => {
    const r = buildCutoffFollowUp({
      displayCutoff: DC,
      startDate: "2026-08-25",
      clearOrientation: true,
      timetables: [T1],
    });
    expect(r.orientationLabels).toEqual([]);
    // 新しい年度の最初の期なら既定でオンなので対象
    const next = buildCutoffFollowUp({
      displayCutoff: DC,
      startDate: "2027-04-06",
      clearOrientation: true,
      timetables: TTS,
    });
    expect(next.orientationLabels).toEqual(["中1・2"]);
  });
});

describe("normalizeSlotCountFields", () => {
  it("オリエンの対象外は付けたときだけ持つ", () => {
    expect(normalizeSlotCountFields(mk(1, { noOrientation: true })).noOrientation).toBe(true);
    expect("noOrientation" in normalizeSlotCountFields(mk(1, { noOrientation: false }))).toBe(false);
  });
});
