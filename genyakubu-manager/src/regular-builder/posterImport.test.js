import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildProjectFromPoster,
  parseBlockLines,
  parseDay,
  parsePosterSheet,
  parseTime,
  splitRoomSuffix,
  textOf,
} from "./posterImport";
import { buildPosterWorkbook } from "./posterExport";
import { createDefaultProject, makeCellKey } from "./model";

// 書き出した workbook をそのまま読み直す (exceljs は同じインスタンスでも
// merges を model から読めるが、往復の実態に近づけるため一度直列化する)
async function reload(workbook) {
  const buf = await workbook.xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}

const cls = (id, label, room) => ({ id, label, room });

// 元紙面の作りを一通り含むプロジェクト
const source = () => ({
  ...createDefaultProject(),
  name: "2026 前期",
  periods: [
    { id: 1, label: "", time: "18:00-18:45" },
    { id: 2, label: "", time: "18:55-19:40" },
    { id: 3, label: "", time: "21:35-21:50" },
    { id: 4, label: "", time: "16:25-17:25" },
    { id: 5, label: "", time: "21:00-21:30" },
  ],
  tabs: [
    {
      id: 1,
      name: "中2",
      grade: "中2",
      course: "本　科",
      classes: [
        cls(1, "S", "602"),
        cls(2, "A･B", "601"),
        cls(3, "C", "603"),
        cls(4, "S〜C", "601"),
      ],
      days: ["月"],
      periodIds: [1, 2, 3],
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "社会", teacher: "西岡" },
        // 隔週 (A 週 = 数/江本、B 週 = 英/堀上)
        [makeCellKey("月", 1, 2)]: {
          subj: "数/英",
          teacher: "江本",
          note: "隔週(堀上)",
        },
        [makeCellKey("月", 1, 3)]: { subj: "国語", teacher: "小松", room: "605" },
        // 合同 (3 クラスに掛かる)
        [makeCellKey("月", 2, 4)]: { subj: "理科", teacher: "三宮", room: "601" },
        // 確認テスト (担任 1 人)
        [makeCellKey("月", 3, 4)]: { subj: "確認テスト", teacher: "堀上", room: "601" },
      },
    },
    {
      id: 2,
      name: "中1 附中",
      grade: "中1",
      course: "附中",
      classes: [cls(5, "", "401")],
      days: ["水"],
      periodIds: [4],
      schedule: { [makeCellKey("水", 4, 5)]: { subj: "数学", teacher: "本多" } },
    },
    {
      id: 3,
      name: "中2 附中",
      grade: "中2",
      course: "附中",
      classes: [cls(6, "", "404")],
      days: ["水"],
      periodIds: [4],
      schedule: { [makeCellKey("水", 4, 6)]: { subj: "英語", teacher: "石原" } },
    },
  ],
});

async function roundTrip(project) {
  const { workbook } = buildPosterWorkbook(project);
  const ws = await reload(workbook);
  return buildProjectFromPoster("取込", parsePosterSheet(ws));
}

describe("小さな parser", () => {
  it("曜日", () => {
    expect(parseDay("月曜日")).toBe("月");
    expect(parseDay("土")).toBe("土");
    expect(parseDay("本科")).toBe(null);
  });

  it("時刻 (全角コロン・改行・波ダッシュ)", () => {
    expect(parseTime("18：00\n〜\n18：45")).toBe("18:00-18:45");
    expect(parseTime("16：25\n～\n17：25")).toBe("16:25-17:25");
    expect(parseTime("確認テスト")).toBe("");
  });

  it("教室の括弧", () => {
    expect(splitRoomSuffix("社会（601教室）")).toEqual({ subj: "社会", room: "601" });
    expect(splitRoomSuffix("（亀63）")).toEqual({ subj: "", room: "亀63" });
    expect(splitRoomSuffix("社会")).toEqual({ subj: "社会", room: "" });
  });

  it("確認テストのブロック", () => {
    expect(parseBlockLines("確認テスト\n担任：堀上\n（601教室）")).toEqual({
      subj: "確認テスト",
      entries: [{ teacher: "堀上", room: "601" }],
    });
    expect(
      parseBlockLines("確認テスト\n担任：藤田（501教室）\n担任：小松（503教室）")
    ).toEqual({
      subj: "確認テスト",
      entries: [
        { teacher: "藤田", room: "501" },
        { teacher: "小松", room: "503" },
      ],
    });
  });

  it("richText と数値のセル値", () => {
    expect(textOf({ richText: [{ text: "確認" }, { text: "テスト" }] })).toBe("確認テスト");
    expect(textOf(601)).toBe("601");
    expect(textOf(null)).toBe("");
  });
});

describe("parsePosterSheet", () => {
  it("表・曜日・クラス列・時限を読み下す", async () => {
    const { workbook } = buildPosterWorkbook(source());
    const ws = await reload(workbook);
    const { tables } = parsePosterSheet(ws);
    expect(tables).toHaveLength(2);
    const [main, fuchu] = tables;
    expect(main.days.map((d) => d.day)).toEqual(["月"]);
    expect(main.columns.map((c) => c.label)).toEqual(["S", "A･B", "C"]);
    expect(main.columns.map((c) => c.room)).toEqual(["602", "601", "603"]);
    expect(main.columns.map((c) => c.grade)).toEqual(["中2", "中2", "中2"]);
    expect(main.periods.map((p) => p.time)).toEqual([
      "18:00-18:45",
      "18:55-19:40",
      "21:35-21:50",
    ]);
    // クラス段の無い表も教室段から列を数えられる
    expect(fuchu.columns.map((c) => c.room)).toEqual(["401", "404"]);
    expect(fuchu.columns.map((c) => c.grade)).toEqual(["中1", "中2"]);
  });
});

describe("buildProjectFromPoster (往復)", () => {
  it("学年 × コースごとにタブへ戻す", async () => {
    const { project, stats } = await roundTrip(source());
    expect(project.tabs.map((t) => [t.grade, t.course])).toEqual([
      ["中2", "本　科"],
      ["中1", "附中"],
      ["中2", "附中"],
    ]);
    expect(project.tabs[0].days).toEqual(["月"]);
    expect(stats.tableCount).toBe(2);
    expect(stats.dayCount).toBe(2);
  });

  it("時限プールは時刻で同一視して開始時刻順に並ぶ", async () => {
    const { project } = await roundTrip(source());
    expect(project.periods.map((p) => p.time)).toEqual([
      "16:25-17:25",
      "18:00-18:45",
      "18:55-19:40",
      "21:35-21:50",
    ]);
  });

  it("通常コマ・教室の上書きが戻る", async () => {
    const { project } = await roundTrip(source());
    const tab = project.tabs[0];
    const pid = project.periods.find((p) => p.time === "18:00-18:45").id;
    const byLabel = (label) => tab.classes.find((c) => c.label === label);
    expect(tab.schedule[makeCellKey("月", pid, byLabel("S").id)]).toEqual({
      subj: "社会",
      teacher: "西岡",
    });
    // 既定と違う教室はセルに残る
    expect(tab.schedule[makeCellKey("月", pid, byLabel("C").id)]).toEqual({
      subj: "国語",
      teacher: "小松",
      room: "605",
    });
    // 既定の教室は列側
    expect(byLabel("S").room).toBe("602");
  });

  it("隔週コマが A 週 / B 週のまま戻る", async () => {
    const { project } = await roundTrip(source());
    const tab = project.tabs[0];
    const pid = project.periods.find((p) => p.time === "18:00-18:45").id;
    const cls2 = tab.classes.find((c) => c.label === "A･B");
    expect(tab.schedule[makeCellKey("月", pid, cls2.id)]).toEqual({
      subj: "数/英",
      teacher: "江本",
      note: "隔週(堀上)",
    });
  });

  it("合同コマは範囲ラベルの列に戻る", async () => {
    const { project } = await roundTrip(source());
    const tab = project.tabs[0];
    const pid = project.periods.find((p) => p.time === "18:55-19:40").id;
    const range = tab.classes.find((c) => c.label === "S〜C");
    expect(range).toBeTruthy();
    expect(tab.schedule[makeCellKey("月", pid, range.id)]).toEqual({
      subj: "理科",
      teacher: "三宮",
      room: "601",
    });
  });

  it("確認テストは担任つきで戻る", async () => {
    const { project } = await roundTrip(source());
    const tab = project.tabs[0];
    const pid = project.periods.find((p) => p.time === "21:35-21:50").id;
    const cell = Object.entries(tab.schedule).find(([k]) =>
      k.startsWith(`月|${pid}|`)
    );
    expect(cell[1]).toEqual({ subj: "確認テスト", teacher: "堀上", room: "601" });
  });

  it("並列の担任は範囲ラベルの列を人数ぶん作る", async () => {
    const p = source();
    p.tabs[0].classes.push(cls(7, "S〜C", "603"));
    p.tabs[0].schedule[makeCellKey("月", 3, 7)] = {
      subj: "確認テスト",
      teacher: "小松",
      room: "603",
    };
    const { project } = await roundTrip(p);
    const tab = project.tabs[0];
    const pid = project.periods.find((p2) => p2.time === "21:35-21:50").id;
    const ranges = tab.classes.filter((c) => c.label === "S〜C");
    expect(ranges).toHaveLength(2);
    const cells = ranges
      .map((r) => tab.schedule[makeCellKey("月", pid, r.id)])
      .filter(Boolean);
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => c.teacher).sort()).toEqual(["堀上", "小松"]);
  });

  it("クラス名の無い紙面で学年をまたぐ枠は各学年へ配る", async () => {
    const p = source();
    // 附中 2 学年の同じ時限に、まったく同じ確認テストを入れる
    // (紙面では 1 枠に結合され、取込で学年ごとに戻る)
    p.tabs[1].periodIds.push(5);
    p.tabs[2].periodIds.push(5);
    p.tabs[1].schedule[makeCellKey("水", 5, 5)] = {
      subj: "確認テスト",
      teacher: "石原",
      room: "404",
    };
    p.tabs[2].schedule[makeCellKey("水", 5, 6)] = {
      subj: "確認テスト",
      teacher: "石原",
      room: "404",
    };
    const { project } = await roundTrip(p);
    const pid = project.periods.find((x) => x.time === "21:00-21:30").id;
    for (const grade of ["中1", "中2"]) {
      const tab = project.tabs.find((t) => t.grade === grade && t.course === "附中");
      const cell = tab.schedule[makeCellKey("水", pid, tab.classes[0].id)];
      expect(cell).toEqual({ subj: "確認テスト", teacher: "石原", room: "404" });
    }
  });

  it("講師・科目マスタを拾う", async () => {
    const { project } = await roundTrip(source());
    expect(project.teachers.map((t) => t.name)).toEqual(
      expect.arrayContaining(["西岡", "江本", "堀上", "小松", "三宮", "本多", "石原"])
    );
    expect(project.subjects).toEqual(
      expect.arrayContaining(["社会", "数", "英", "国語", "理科", "確認テスト"])
    );
  });

  it("同じ学年 × コースが複数曜日にあれば 1 タブにまとまる", async () => {
    const p = source();
    p.tabs[0].days = ["月", "木"];
    p.tabs[0].schedule[makeCellKey("木", 1, 1)] = { subj: "数学", teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("木", 1, 2)] = { subj: "英語", teacher: "堀上" };
    p.tabs[0].schedule[makeCellKey("木", 1, 3)] = { subj: "国語", teacher: "小松" };
    const { project } = await roundTrip(p);
    const tab = project.tabs.find((t) => t.course === "本　科");
    expect(tab.days).toEqual(["月", "木"]);
    expect(tab.classes.filter((c) => c.label === "S")).toHaveLength(1);
  });

  it("取り込んだプロジェクトを書き出すと同じ紙面になる", async () => {
    const before = buildPosterWorkbook(source()).workbook;
    const { project } = await roundTrip(source());
    const after = buildPosterWorkbook(project, { title: "2026 前期　中学生コース時間割" })
      .workbook;
    const dump = (wb) => {
      const ws = wb.worksheets[0];
      const out = [];
      ws.eachRow((row, r) => {
        row.eachCell({ includeEmpty: false }, (cell, c) => {
          const v = textOf(cell.value);
          if (v) out.push(`${r},${c}=${v}`);
        });
      });
      return out;
    };
    expect(dump(after)).toEqual(dump(before));
  });

  it("曜日で教室が違えば roomByDay に残す", async () => {
    const p = source();
    p.tabs[0].days = ["月", "木"];
    p.tabs[0].classes[0].roomByDay = { 木: "701" };
    p.tabs[0].schedule[makeCellKey("木", 1, 1)] = { subj: "数学", teacher: "半田" };
    const { project } = await roundTrip(p);
    const tab = project.tabs.find((t) => t.course === "本　科");
    const s = tab.classes.find((c) => c.label === "S");
    expect(s.room).toBe("602");
    expect(s.roomByDay).toEqual({ 木: "701" });
  });
});
