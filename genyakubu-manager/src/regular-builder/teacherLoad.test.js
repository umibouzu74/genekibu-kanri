import { describe, expect, it } from "vitest";
import {
  computeRoomWeek,
  computeTeacherLoad,
  computeTeacherWeek,
  formatMinutes,
  periodMinutes,
} from "./teacherLoad";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// makeProject: teachers [堀上, 半田]、中3 タブ (月・火, 1限/2限, S/A)、
// schedule: 月1限 S=数学/半田, 月2限 A=英語/堀上

describe("computeTeacherLoad", () => {
  it("講師 × 曜日のコマ数と週計をマスタ順に数える", () => {
    const { days, rows } = computeTeacherLoad(makeProject());
    expect(days).toEqual(["月", "火"]);
    expect(rows.map((r) => r.name)).toEqual(["堀上", "半田"]);
    const horigami = rows[0];
    expect(horigami).toMatchObject({
      inMaster: true,
      byDay: { 月: 1 },
      total: 1,
      overDays: [],
      overWeek: false,
    });
  });

  it("複数講師セルは各講師に 1 コマずつ数え、マスタ外は末尾に名前順で載る", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "理科",
      teacher: "半田·臨時B·臨時A",
    };
    const { rows } = computeTeacherLoad(p);
    expect(rows.map((r) => r.name)).toEqual(["堀上", "半田", "臨時A", "臨時B"]);
    expect(rows[1].byDay).toEqual({ 月: 1, 火: 1 });
    expect(rows[1].total).toBe(2);
    expect(rows[2]).toMatchObject({ inMaster: false, total: 1 });
  });

  it("上限超過を注釈する (1日 = overDays / 週 = overWeek)", () => {
    const p = makeProject();
    p.teachers = [
      { name: "半田", maxPerDay: 1, maxPerWeek: 2 },
      { name: "堀上", maxPerWeek: 1 },
    ];
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "国語", teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    const { rows } = computeTeacherLoad(p);
    const handa = rows.find((r) => r.name === "半田");
    expect(handa.byDay).toEqual({ 月: 2, 火: 1 });
    expect(handa.overDays).toEqual(["月"]); // 月 2 > 1日上限 1
    expect(handa.overWeek).toBe(true); // 計 3 > 週上限 2
    const horigami = rows.find((r) => r.name === "堀上");
    expect(horigami.overWeek).toBe(false); // 計 1 = 上限 1 (超過ではない)
  });

  it("残骸セル (使わない曜日など) は数えない・コマゼロのマスタ講師も載る", () => {
    const p = makeProject();
    p.tabs[0].days = ["火"]; // 月のセル 2 つが残骸になる
    const { days, rows } = computeTeacherLoad(p);
    expect(days).toEqual(["火"]);
    expect(rows.map((r) => r.total)).toEqual([0, 0]);
  });
});

describe("稼働時間 (minutesByDay / totalMinutes)", () => {
  it("時限の時刻 (HH:MM-HH:MM) から曜日別・週計の分数を集計する", () => {
    const { rows, untimedCount } = computeTeacherLoad(makeProject());
    const handa = rows.find((r) => r.name === "半田");
    expect(handa.minutesByDay).toEqual({ 月: 45 }); // 1限 18:00-18:45
    expect(handa.totalMinutes).toBe(45);
    expect(untimedCount).toBe(0);
  });

  it("1 コマの長さが違う時限は分数で差が出る (高校 60 分など)", () => {
    const p = makeProject();
    p.periods.push({ id: 4, label: "高3 1限", time: "19:00-20:00" });
    p.tabs[0].periodIds.push(4);
    p.tabs[0].schedule[makeCellKey("火", 4, 1)] = { subj: "数学", teacher: "半田" };
    const { rows } = computeTeacherLoad(p);
    const handa = rows.find((r) => r.name === "半田");
    expect(handa.byDay).toEqual({ 月: 1, 火: 1 }); // コマ数は同じ 1 ずつ
    expect(handa.minutesByDay).toEqual({ 月: 45, 火: 60 });
    expect(handa.totalMinutes).toBe(105);
  });

  it("時刻未設定の時限はコマ数のみ数え、untimedCount で知らせる", () => {
    const p = makeProject();
    p.periods.push({ id: 9, label: "特設", time: "" });
    p.tabs[0].periodIds.push(9);
    p.tabs[0].schedule[makeCellKey("火", 9, 1)] = { subj: "数学", teacher: "半田" };
    const { rows, untimedCount } = computeTeacherLoad(p);
    const handa = rows.find((r) => r.name === "半田");
    expect(handa.byDay["火"]).toBe(1);
    expect(handa.minutesByDay["火"]).toBe(0);
    expect(handa.totalMinutes).toBe(45); // 月1限の分だけ
    expect(untimedCount).toBe(1);
  });

  it("隔週コマは主担当・パートナーとも 0.5 週分の時間で算入する", () => {
    const p = makeProject();
    // 月2限 S (18:55-19:40 = 45分): 堀上 が主担当、河野 がパートナー
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = {
      subj: "英語",
      teacher: "堀上",
      note: "隔週(河野)",
    };
    const { rows } = computeTeacherLoad(p);
    const horigami = rows.find((r) => r.name === "堀上");
    expect(horigami.totalMinutes).toBe(67.5); // 月2限A 45 + 隔週 0.5 × 45
    const kono = rows.find((r) => r.name === "河野");
    expect(kono.minutesByDay["月"]).toBe(22.5);
  });

  it("computeTeacherWeek も同じ重みで曜日別・週計を返す", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    const week = computeTeacherWeek(p, "半田");
    expect(week.minutesByDay).toEqual({ 月: 45, 火: 45 });
    expect(week.totalMinutes).toBe(90);
  });
});

describe("periodMinutes / formatMinutes", () => {
  it("'HH:MM-HH:MM' を所要分数に変換する", () => {
    expect(periodMinutes("18:00-18:45")).toBe(45);
    expect(periodMinutes(" 19:00-20:00 ")).toBe(60);
  });

  it("書式外・未設定・終了が開始以前は 0 分", () => {
    expect(periodMinutes("")).toBe(0);
    expect(periodMinutes(undefined)).toBe(0);
    expect(periodMinutes("18:00")).toBe(0); // 開始のみ
    expect(periodMinutes("18:00〜18:45")).toBe(0); // 区切りは "-" が正 (conflicts と同じ)
    expect(periodMinutes("19:00-18:00")).toBe(0); // 入力ミス (終了が開始より前)
  });

  it("formatMinutes は 時:分 表示 (0.5 重みの端数は四捨五入)", () => {
    expect(formatMinutes(45)).toBe("0:45");
    expect(formatMinutes(135)).toBe("2:15");
    expect(formatMinutes(22.5)).toBe("0:23");
    expect(formatMinutes(0)).toBe("0:00");
  });
});

describe("computeTeacherWeek", () => {
  it("担当コマを曜日ごとに開始時刻順で列挙し、ref でジャンプできる", () => {
    const p = makeProject();
    // 半田: 月1限 (18:00) に加えて 月2限 (18:55) と 火1限 を追加
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "国語", teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("火", 1, 2)] = {
      subj: "理科",
      teacher: "半田·堀上",
      room: "601",
    };
    const week = computeTeacherWeek(p, "半田");
    expect(week.days).toEqual(["月", "火"]);
    expect(week.total).toBe(3);
    expect(week.weightedTotal).toBe(3); // 非隔週は件数と一致
    expect(week.byDay["月"].map((e) => e.subj)).toEqual(["数学", "国語"]);
    expect(week.byDay["月"][0]).toMatchObject({
      ref: `1:${makeCellKey("月", 1, 1)}`,
      time: "18:00-18:45",
      periodLabel: "1限",
      tabName: "中3",
      clsLabel: "S",
      room: "501",
    });
    // 複数講師セルも本人の分として載る (セル上書き教室が効く)
    expect(week.byDay["火"][0]).toMatchObject({ subj: "理科", room: "601" });
  });

  it("担当が無い講師は全曜日が空で total 0", () => {
    const week = computeTeacherWeek(makeProject(), "居ない人");
    expect(week.total).toBe(0);
    expect(week.byDay["月"]).toEqual([]);
    expect(week.byDay["火"]).toEqual([]);
  });
});

describe("computeTeacherWeek - NG (不在)", () => {
  it("ngByDay に使う曜日の NG を 終日 → 時刻順 で返す", () => {
    const p = makeProject();
    p.teachers = [
      {
        name: "堀上",
        ngSlots: [{ day: "月", time: "19:00-20:00" }, { day: "月" }, { day: "水" }],
      },
      { name: "半田" },
    ];
    const week = computeTeacherWeek(p, "堀上");
    expect(week.ngByDay["月"]).toEqual([{ time: "" }, { time: "19:00-20:00" }]);
    expect(week.ngByDay["火"]).toEqual([]);
    // 使わない曜日 (水) の NG はこのプロジェクトでは効かないため載らない
    expect(week.ngByDay["水"]).toBeUndefined();
  });

  it("NG の無い講師・マスタ外の講師は全曜日空", () => {
    expect(computeTeacherWeek(makeProject(), "半田").ngByDay["月"]).toEqual([]);
    expect(computeTeacherWeek(makeProject(), "マスタ外").ngByDay["月"]).toEqual([]);
  });
});

describe("隔週コマ (note「隔週(パートナー)」) の扱い", () => {
  const biweeklyProject = () => {
    const p = makeProject();
    // 月2限 A: 堀上 が主担当、河野 が隔週パートナー
    p.tabs[0].schedule[makeCellKey("月", 2, 2)] = {
      subj: "英語",
      teacher: "堀上",
      note: "隔週(河野)",
    };
    return p;
  };

  it("computeTeacherLoad は主担当・パートナーとも 0.5 で数える", () => {
    const { rows } = computeTeacherLoad(biweeklyProject());
    const horigami = rows.find((r) => r.name === "堀上");
    expect(horigami.byDay["月"]).toBe(0.5);
    expect(horigami.total).toBe(0.5);
    // パートナーはマスタ外として列挙される
    const kono = rows.find((r) => r.name === "河野");
    expect(kono).toMatchObject({ inMaster: false, total: 0.5 });
  });

  it("computeTeacherWeek は主担当に A、パートナーに B のエントリを載せる", () => {
    const p = biweeklyProject();
    const main = computeTeacherWeek(p, "堀上");
    expect(main.byDay["月"]).toHaveLength(1);
    expect(main.byDay["月"][0].biweekly).toBe("A");
    const partner = computeTeacherWeek(p, "河野");
    expect(partner.total).toBe(1);
    expect(partner.weightedTotal).toBe(0.5); // 計は 📊 集計と同じ 0.5 重み
    expect(partner.byDay["月"][0].biweekly).toBe("B");
    // 非隔週コマには biweekly フィールドが付かない
    const handa = computeTeacherWeek(p, "半田");
    expect(handa.byDay["月"][0].biweekly).toBeUndefined();
  });
});

// ─── 拘束時間・空きコマ ──────────────────────────────────────────────
// 稼働 (担当コマの長さの合計・隔週 0.5) と拘束 (その日の最初のコマの開始
// 〜 最後のコマの終了・重み無し) は別物。空き = 拘束 − 実授業時間。

describe("computeTeacherLoad: 拘束時間・空き", () => {
  const row = (p, name) =>
    computeTeacherLoad(p).rows.find((r) => r.name === name);

  it("連続コマなら拘束 = 稼働、空きは 0", () => {
    const p = makeProject();
    // 半田: 月1限 (18:00-18:45) のみ
    const r = row(p, "半田");
    expect(r.spanByDay["月"]).toBe(45);
    expect(r.gapByDay["月"]).toBe(0);
    expect(r.totalSpan).toBe(45);
    expect(r.totalGap).toBe(0);
  });

  it("間が空くと拘束が伸び、差が空きになる", () => {
    const p = makeProject();
    // 半田に 月 確認テスト (20:40-20:55) を足す → 18:00〜20:55 拘束
    p.tabs[0].periodIds.push(3);
    p.tabs[0].schedule[makeCellKey("月", 3, 1)] = { subj: "テスト", teacher: "半田" };
    const r = row(p, "半田");
    expect(r.spanByDay["月"]).toBe(175); // 18:00 → 20:55
    expect(r.minutesByDay["月"]).toBe(60); // 45 + 15
    expect(r.gapByDay["月"]).toBe(115);
  });

  it("拘束は隔週でも重み付けしない (居る週は丸ごと居る)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = {
      subj: "数学",
      teacher: "半田",
      note: "隔週(河野)",
    };
    const r = row(p, "半田");
    expect(r.minutesByDay["月"]).toBe(22.5); // 稼働は 0.5 週分
    expect(r.spanByDay["月"]).toBe(45); // 拘束は実時間
    // パートナー側も同じ扱い
    const partner = row(p, "河野");
    expect(partner.spanByDay["月"]).toBe(45);
  });

  it("曜日ごとに独立して数え、週計は合計になる", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { subj: "理科", teacher: "半田" };
    const r = row(p, "半田");
    expect(r.spanByDay).toEqual({ 月: 45, 火: 45 });
    expect(r.totalSpan).toBe(90);
  });

  it("時刻未設定の時限は拘束に入らない", () => {
    const p = makeProject();
    p.periods.push({ id: 4, label: "未定", time: "" });
    p.tabs[0].periodIds.push(4);
    p.tabs[0].schedule[makeCellKey("月", 4, 1)] = { subj: "国語", teacher: "半田" };
    const r = row(p, "半田");
    expect(r.spanByDay["月"]).toBe(45);
    expect(computeTeacherLoad(p).untimedCount).toBe(1);
  });

  it("担当ゼロの講師は拘束も 0", () => {
    const p = makeProject();
    p.teachers.push({ name: "未担当" });
    const r = row(p, "未担当");
    expect(r.spanByDay).toEqual({});
    expect(r.totalSpan).toBe(0);
    expect(r.totalGap).toBe(0);
  });
});

// ─── 教室の週間 (👁 教室の週間ミニビュー) ────────────────────────────

describe("computeRoomWeek", () => {
  it("実効教室が一致するコマを曜日ごとに時刻順で並べる", () => {
    const p = makeProject();
    // 月1限 S はクラス既定 501、月2限 A はセル上書き 601
    const w = computeRoomWeek(p, "501");
    expect(w.total).toBe(1);
    expect(w.byDay["月"]).toHaveLength(1);
    expect(w.byDay["月"][0]).toMatchObject({
      time: "18:00-18:45",
      tabName: "中3",
      clsLabel: "S",
      subj: "数学",
      teacher: "半田",
      overlap: false,
    });
    expect(w.minutesByDay["月"]).toBe(45);
    expect(w.totalMinutes).toBe(45);
  });

  it("セルの上書き教室も拾う", () => {
    const w = computeRoomWeek(makeProject(), "601");
    expect(w.total).toBe(1);
    expect(w.byDay["月"][0].subj).toBe("英語");
  });

  it("曜日別の既定教室 (roomByDay) を尊重する", () => {
    const p = makeProject();
    p.tabs[0].classes[0].roomByDay = { 月: "亀63" };
    expect(computeRoomWeek(p, "501").total).toBe(0);
    expect(computeRoomWeek(p, "亀63").total).toBe(1);
  });

  it("同じ教室で時間帯が重なるコマに印を付ける", () => {
    const p = makeProject();
    // 月2限 A (18:55-19:40, 601) と同じ時間帯の別クラスを 601 に置く
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = {
      subj: "国語",
      teacher: "松川",
      room: "601",
    };
    const w = computeRoomWeek(p, "601");
    expect(w.total).toBe(2);
    expect(w.byDay["月"].every((e) => e.overlap)).toBe(true);
  });

  it("時刻が重ならなければ印は付かない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 2)] = { subj: "国語", room: "601" };
    const w = computeRoomWeek(p, "601");
    expect(w.total).toBe(2);
      expect(w.byDay["月"].filter((e) => e.overlap)).toHaveLength(0);
  });

  it("該当の無い教室は 0 コマ", () => {
    const w = computeRoomWeek(makeProject(), "999");
    expect(w.total).toBe(0);
    expect(w.byDay["月"]).toEqual([]);
  });

  it("残骸セルは数えない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("水", 1, 1)] = { subj: "国語", room: "501" };
    expect(computeRoomWeek(p, "501").total).toBe(1);
  });
});
