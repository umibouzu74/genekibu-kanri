import { describe, expect, it } from "vitest";
import {
  applyCohortCutoffs,
  lastHeldDate,
  proposeCohortCutoffs,
  restoreCohortCutoffs,
  previousCohortCutoffs,
} from "./cutoffProposals";
import { effectiveMapping, suggestMapping } from "./courseMapping";
import { mergeHighSchoolSheets, parseHighSchoolSheet } from "./highSchoolSheet";
import { SMALL_SLOTS, makeSheet, smallH12Sheet, weekdayIndexOf } from "./testUtils";

// 1〜2 月 (3学期) の高1・高2。高松西 (月木) は 2/12 (木) まで、古文・漢文 (木) は 2/5 (木) まで。
// 読み込んだ予定表は 2/28 まで
function lastTermSheet() {
  return makeSheet("2026 H1H2【1-2月】教員用", (s) => {
    s.set(1, 1, "2026年度 【高1・高2ゼミ】 1月～2月予定表");
    for (const b of [
      { dayCol: 1, month: 1 },
      { dayCol: 6, month: 2 },
    ]) {
      const c0 = b.dayCol + 2;
      s.set(4, c0, "高1");
      s.set(4, c0 + 1, "高2");
      s.set(6, c0, "高松西高校");
      s.set(6, c0 + 1, "古文・漢文");
      const map = s.month({ year: 2027, month: b.month, dayCol: b.dayCol, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) {
        const wd = weekdayIndexOf(iso);
        if ((wd === 1 || wd === 4) && iso >= "2027-01-07" && iso <= "2027-02-12") s.set(r, c0, "●");
        if (wd === 4 && iso >= "2027-01-07" && iso <= "2027-02-05") s.set(r, c0 + 1, "◇");
      }
    }
  });
}

function plan(sheet, { displayCutoff = null, overrides = {}, slots = SMALL_SLOTS } = {}) {
  const merged = mergeHighSchoolSheets([{ name: "x", parsed: parseHighSchoolSheet(sheet) }]);
  const mapping = effectiveMapping(suggestMapping(merged.courses.values(), slots).byCourse, overrides);
  return { merged, ...proposeCohortCutoffs({ merged, mapping, slots, displayCutoff }) };
}

describe("proposeCohortCutoffs", () => {
  it("講座の最後の授業日を、そのコマのコースの終講日の案にする (英数以外はコースが無い)", () => {
    const { proposals, noCohort, merged } = plan(lastTermSheet());
    expect(lastHeldDate(merged.courses.get("高1|高松西高校"))).toBe("2027-02-11");
    expect(proposals).toEqual([
      {
        key: "1::H|高1|高松西|英数",
        cohortId: "H|高1|高松西|英数",
        timetableId: 1,
        label: "高1 高松西 英数",
        grade: "高1",
        current: null,
        groupDate: null,
        proposed: "2027-02-11",
        courses: [{ key: "高1|高松西高校", last: "2027-02-11" }],
        mayContinue: false,
      },
    ]);
    // 高2 古文漢文はコースの無いコマ (表示期間設定の終了日に従う)
    expect(noCohort).toEqual([{ key: "高2|古文・漢文", subjects: ["高2|古文漢文"] }]);
  });

  it("1 つのコースに講座がいくつも当たるときは遅い方。今の終講日と同じなら案にしない", () => {
    // 高2 高松西 英語 (木) を古文・漢文の講座にも当てる → 高1 と高2 の英数は別のコース
    const overrides = { "高2|古文・漢文": { subjects: ["高2|古文漢文", "高2|高松西 英語"] } };
    const r = plan(lastTermSheet(), { overrides });
    expect(r.proposals.map((p) => [p.cohortId, p.proposed])).toEqual([
      ["H|高1|高松西|英数", "2027-02-11"],
      ["H|高2|高松西|英数", "2027-02-04"],
    ]);
    // 高1 の講座を高2 のコマにも当てると、高2 のコースは遅い方 (2/11)
    const both = plan(lastTermSheet(), {
      overrides: { ...overrides, "高1|高松西高校": { subjects: ["高1|高松西 数学", "高1|高松西 英語", "高2|高松西 英語"] } },
    });
    const h2 = both.proposals.find((p) => p.cohortId === "H|高2|高松西|英数");
    expect(h2.proposed).toBe("2027-02-11");
    expect(h2.courses).toEqual([
      { key: "高1|高松西高校", last: "2027-02-11" },
      { key: "高2|古文・漢文", last: "2027-02-04" },
    ]);
    // 今の終講日と同じなら出さない
    const same = plan(lastTermSheet(), {
      displayCutoff: { groups: [], cohorts: [{ id: "H|高1|高松西|英数", label: "高1 高松西 英数", grade: "高1", date: "2027-02-11" }] },
    });
    expect(same.proposals).toEqual([]);
    expect(same.unchanged).toBe(1);
  });

  it("読み込んだ予定表の終わり近くまで授業がある講座には、続きがあるかもしれないと印を付ける", () => {
    // 10〜11 月の表 (11/30 まで)。高松西は 11/30 (月) まで授業
    const { proposals } = plan(smallH12Sheet());
    expect(proposals.find((p) => p.cohortId === "H|高1|高松西|英数")).toMatchObject({
      proposed: "2026-11-30",
      mayContinue: true,
    });
  });

  it("予定表が年度末 (3/31) まであれば、終わり近くまで授業があっても続きは無い", () => {
    const march = makeSheet("2026 H1H2【3月】", (s) => {
      s.set(1, 1, "2026年度 【高1・高2ゼミ】 3月予定表");
      s.set(4, 3, "高1");
      s.set(6, 3, "高松西高校");
      const map = s.month({ year: 2027, month: 3, dayCol: 1, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) {
        const wd = weekdayIndexOf(iso);
        if ((wd === 1 || wd === 4) && iso <= "2027-03-22") s.set(r, 3, "●");
      }
    });
    expect(plan(march).proposals[0]).toMatchObject({ proposed: "2027-03-22", mayContinue: false });
  });

  it("比べられない講座 (比べない・コマが無い) は案にしない", () => {
    expect(plan(lastTermSheet(), { overrides: { "高1|高松西高校": { skip: true } } }).proposals).toEqual([]);
  });
});

describe("applyCohortCutoffs / restoreCohortCutoffs", () => {
  it("選んだ時間割・コースだけ書き換え、元に戻すと前の値 (無ければ消す) に戻る", () => {
    const before = {
      groups: [{ label: "高1・2", grades: ["高1", "高2"], date: "2027-03-20" }],
      cohorts: [
        { id: "H|高1|高松西|英数", label: "高1 高松西 英数", grade: "高1", date: "2027-02-01", timetableId: 3 },
        { id: "H|高3|共テ英語(Hi)", label: "高3 共テ英語(Hi)", grade: "高3", date: "2027-01-10", timetableId: 3 },
        // 別の時間割の同じコースは触らない
        { id: "H|高1|高松西|英数", label: "高1 高松西 英数", grade: "高1", date: "2026-12-18", timetableId: 2 },
      ],
    };
    const chosen = [
      { cohortId: "H|高1|高松西|英数", timetableId: 3, label: "高1 高松西 英数", grade: "高1", proposed: "2027-02-11" },
      { cohortId: "H|高2|高松西|英数", timetableId: 3, label: "高2 高松西 英数", grade: "高2", proposed: "2027-02-04" },
    ];
    const previous = previousCohortCutoffs(before, chosen);
    expect(previous).toEqual([before.cohorts[0]]);
    const after = applyCohortCutoffs(before, chosen);
    expect(after.groups).toBe(before.groups);
    expect(after.cohorts).toEqual([
      before.cohorts[1],
      before.cohorts[2],
      { id: "H|高1|高松西|英数", label: "高1 高松西 英数", grade: "高1", date: "2027-02-11", timetableId: 3 },
      { id: "H|高2|高松西|英数", label: "高2 高松西 英数", grade: "高2", date: "2027-02-04", timetableId: 3 },
    ]);
    const back = restoreCohortCutoffs(after, chosen, previous);
    expect(back.cohorts).toEqual([before.cohorts[1], before.cohorts[2], before.cohorts[0]]);
  });
});
