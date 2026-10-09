import { describe, expect, it } from "vitest";
import {
  effectiveMapping,
  matchScore,
  normalizeName,
  suggestMapping,
  systemGradesFor,
  tokenizeSubject,
} from "./courseMapping";

describe("normalizeName / tokenizeSubject", () => {
  it("予定表の書き方をシステムの科目名に揃える", () => {
    expect(normalizeName("東京大・京都大・医進／高松高校")).toBe("東大京大医進高松高");
    expect(normalizeName("高松第一高校・高松桜井高校")).toBe("高松一高松桜井");
    expect(normalizeName("共通テスト数学ⅠA・ⅡBC(スタンダード)")).toBe("共テ数IAIIBC(St)");
    expect(normalizeName("東京大・京都大国語")).toBe("東大京大国語");
  });

  it("科目名を頭の語と教科に分ける", () => {
    expect(tokenizeSubject("高松一 英語選抜")).toEqual({ groups: ["高松一"], subjects: ["英語"] });
    expect(tokenizeSubject("阪大神大 文系数学")).toEqual({ groups: ["阪大神大"], subjects: ["数"] });
    expect(tokenizeSubject("共テ数IA(St)")).toEqual({ groups: ["共テ", "IA", "St"], subjects: ["数"] });
    expect(tokenizeSubject("共テ国語(古漢)")).toEqual({ groups: ["共テ"], subjects: ["国語", "古", "漢"] });
    expect(tokenizeSubject("関関同立 現古")).toEqual({ groups: ["関関同立"], subjects: ["現", "古"] });
    expect(tokenizeSubject("古文漢文")).toEqual({ groups: [], subjects: ["古文", "漢文"] });
    expect(tokenizeSubject("Speaking/Listening")).toEqual({ groups: ["SpeakingListening"], subjects: [] });
  });
});

describe("matchScore", () => {
  it("頭の語が講座名に含まれれば当たる (講座名に教科が無ければ教科は問わない)", () => {
    expect(matchScore("高松第一高校・高松桜井高校", "高松一 英語")).toBeGreaterThan(0);
    expect(matchScore("東京大・京都大・医進／高松高校", "高松高 数学")).toBeGreaterThan(0);
    expect(matchScore("高松西高校", "高松一 英語")).toBe(0);
  });

  it("講座名に教科があれば、コマの教科もその中にあること", () => {
    expect(matchScore("高松第一高校 物理", "高松一 物理")).toBeGreaterThan(matchScore("高松第一高校・高松桜井高校", "高松一 物理"));
    expect(matchScore("高松第一高校 物理", "高松一 英語")).toBe(0);
  });

  it("凡例の説明 (高3) と共テの科目名", () => {
    const st = "共通テスト数学ⅠA・ⅡBC(スタンダード)、共通テスト物理・生物";
    expect(matchScore(st, "共テ数IA(St)")).toBeGreaterThan(0);
    expect(matchScore(st, "共テ生物")).toBeGreaterThan(0);
    expect(matchScore(st, "共テ英語(St)")).toBe(0);
    expect(matchScore("共通テスト英語(ハイレベル)", "共テ英語(Hi)")).toBeGreaterThan(0);
    expect(matchScore("共通テスト英語(スタンダード)", "共テ英語(Hi)")).toBe(0);
    const ss = "共通テスト【世・日・地】、共通テスト数学ⅠA（ハイレベル）、共通テスト国語（現代文）";
    expect(matchScore(ss, "共テ世界史")).toBeGreaterThan(0);
    expect(matchScore(ss, "共テ国語(現)")).toBeGreaterThan(0);
    expect(matchScore("関関同立【英語・現代文・古文】", "関関同立 現古")).toBeGreaterThan(0);
    expect(matchScore("古文・漢文", "古文漢文")).toBeGreaterThan(0);
    expect(matchScore("高松西高校", "古文漢文")).toBe(0);
  });
});

describe("systemGradesFor", () => {
  it("高1・高2 の講座は 高1 / 高2 / 高1高2 のコマを候補にする", () => {
    expect([...systemGradesFor({ grades: ["高1", "高2"] })].sort()).toEqual(["高1", "高1・高2", "高1高2", "高2"]);
    expect([...systemGradesFor({ grades: ["高3"] })]).toEqual(["高3"]);
  });
});

// 講座 (mergeHighSchoolSheets の形の最小限)。sessions の曜日で「いつもの曜日」が決まる
function course(key, { grades, name, campus = "", mode = "column", days }) {
  const sessions = new Map();
  // 2026-10 の該当曜日 (0=日 … 6=土) を 4 週ぶん
  for (let d = 1; d <= 28; d++) {
    const iso = `2026-10-${String(d).padStart(2, "0")}`;
    if (days.includes(new Date(Date.UTC(2026, 9, d)).getUTCDay())) {
      sessions.set(iso, { status: "held", changed: false, number: null });
    }
  }
  return { key, grades, name, campus, mode, sessions, ranges: [] };
}

const SLOTS = [
  { id: 1, day: "水", grade: "高2", subj: "高松一 英語", room: "701" },
  { id: 2, day: "水", grade: "高2", subj: "高松一 物理", room: "702" },
  { id: 3, day: "水", grade: "高2", subj: "高松桜井 英語", room: "703" },
  { id: 4, day: "金", grade: "高2", subj: "高松一 英語", room: "701" },
  { id: 5, day: "土", grade: "高1高2", subj: "高予備プレップ", room: "" },
  { id: 6, day: "土", grade: "高3", subj: "マークテスト 国語", room: "亀21" },
  { id: 7, day: "月", grade: "高3", subj: "マークテスト 国語", room: "701" },
  { id: 8, day: "土", grade: "高3", subj: "共テ化学", room: "亀31" },
  { id: 9, day: "土", grade: "高3", subj: "共テ物理", room: "亀32" },
  { id: 10, day: "木", grade: "高2", subj: "古文漢文", room: "704" },
  { id: 11, day: "水", grade: "中3", subj: "数学", room: "501" },
  { id: 12, day: "水", grade: "高2", subj: "東大京大医進 英語", room: "705" },
];

describe("suggestMapping", () => {
  const courses = [
    course("高2|高松第一高校・高松桜井高校", { grades: ["高2"], name: "高松第一高校・高松桜井高校", days: [3, 5] }),
    course("高2|高松第一高校 物理", { grades: ["高2"], name: "高松第一高校 物理", days: [3] }),
    course("高1・高2|高予備プレップ", { grades: ["高1", "高2"], name: "高予備プレップ", days: [6] }),
    course("高3|mark:土", { grades: ["高3"], name: "マークテスト（土）", campus: "亀井町", mode: "mark", days: [6] }),
    course("高3|mark:月", { grades: ["高3"], name: "マークテスト（月）", campus: "本校", mode: "mark", days: [1] }),
    course("高3|sym:✸", { grades: ["高3"], name: "土曜コース", campus: "亀井町", mode: "symbol", days: [6] }),
  ];
  const { byCourse, unmatched } = suggestMapping(courses, SLOTS);

  it("頭の語と教科で、いちばん合う講座に当てる", () => {
    expect(byCourse.get("高2|高松第一高校・高松桜井高校").subjects).toEqual(["高2|高松一 英語", "高2|高松桜井 英語"]);
    expect(byCourse.get("高2|高松第一高校 物理").subjects).toEqual(["高2|高松一 物理"]);
    expect(byCourse.get("高1・高2|高予備プレップ").subjects).toEqual(["高1高2|高予備プレップ"]);
  });

  it("マークテストは校舎 (教室) と曜日で分ける", () => {
    expect(byCourse.get("高3|mark:土").subjects).toEqual(["高3|マークテスト 国語"]);
    expect(byCourse.get("高3|mark:月").subjects).toEqual(["高3|マークテスト 国語"]);
  });

  it("名前で当たらない講座は、校舎・曜日・学年の残りのコマをまとめて当てる", () => {
    expect(byCourse.get("高3|sym:✸").subjects).toEqual(["高3|共テ化学", "高3|共テ物理"]);
  });

  it("予定表の学年・曜日に入るのに当たらなかったコマを返す (中学部は見ない)", () => {
    // 水曜の高2 東大京大医進 はどの講座にも当たらない。木曜の古文漢文は
    // どの講座の曜日にも入らない (= 予定表の範囲外) ので出さない
    expect(unmatched.map((u) => u.key)).toEqual(["高2|東大京大医進 英語"]);
    expect(unmatched[0].days).toEqual(["水"]);
  });
});

describe("effectiveMapping", () => {
  it("手で直した対応 (対象外・選び直し) を推定に重ねる", () => {
    const suggested = new Map([
      ["a", { subjects: ["高1|x"] }],
      ["b", { subjects: ["高1|y"] }],
      ["c", { subjects: ["高1|z"] }],
    ]);
    const eff = effectiveMapping(suggested, { a: { skip: true }, b: { subjects: ["高1|w"] } });
    expect(eff.get("a")).toEqual({ subjects: [], skip: true, manual: true });
    expect(eff.get("b")).toEqual({ subjects: ["高1|w"], skip: false, manual: true });
    expect(eff.get("c")).toEqual({ subjects: ["高1|z"], skip: false, manual: false });
  });
});
