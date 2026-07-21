// 講習時間割 (builder project) → 個人月間スケジュール反映の変換ヘルパ。
// 年推定 (日付ラベルは年を持たない)・合同まとめ・タブの実効 config 絞り込み
// あたりが要なので、そこを重点的に固定する。
import { describe, expect, it } from "vitest";
import {
  buildKoshuLessons,
  indexKoshuLessonsByDate,
  parseBuilderProject,
  resolveDateLabelYmd,
} from "./builderLessons";

// v4 project の最小 fixture。schedule 等は各テストで上書きする。
const baseProject = (over = {}) => ({
  version: 4,
  name: "2026夏期",
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-07-10T09:00:00.000Z",
  teachers: [],
  activeTabId: 1,
  dates: [
    { id: 1, label: "7/24(金)" },
    { id: 2, label: "7/25(土)" },
  ],
  periods: [
    { id: 1, label: "1限 (13:00~13:45)" },
    { id: 2, label: "2限 (14:10~)" },
    { id: 3, label: "自習" },
  ],
  tabs: [
    {
      id: 1,
      name: "中3",
      config: {
        classes: [
          { id: 1, label: "３S" },
          { id: 2, label: "３A" },
        ],
        subjectCounts: {},
      },
      schedule: {},
    },
  ],
  subjects: [],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
  ...over,
});

describe("resolveDateLabelYmd", () => {
  it("基準日と同じ年の M/D を解決する", () => {
    expect(resolveDateLabelYmd("7/24(金)", "2026-07-10")).toBe("2026-07-24");
  });

  it("曜日サフィックス無し・1 桁月日も受ける", () => {
    expect(resolveDateLabelYmd("8/6", "2026-07-10")).toBe("2026-08-06");
  });

  it("冬期の年跨ぎ: 11月基準で 12月は当年・1月は翌年", () => {
    expect(resolveDateLabelYmd("12/25(木)", "2026-11-15")).toBe("2026-12-25");
    expect(resolveDateLabelYmd("1/7(水)", "2026-11-15")).toBe("2027-01-07");
  });

  it("シーズン中 (1月) に編集しても 12月は前年に解決する", () => {
    expect(resolveDateLabelYmd("12/25(木)", "2027-01-05")).toBe("2026-12-25");
    expect(resolveDateLabelYmd("1/7(水)", "2027-01-05")).toBe("2027-01-07");
  });

  it("年末に組む春期講習 (翌年 3 月) は翌年に解決する", () => {
    expect(resolveDateLabelYmd("3/25(水)", "2026-12-10")).toBe("2027-03-25");
  });

  it("解釈できないラベル・実在しない日付は null", () => {
    expect(resolveDateLabelYmd("初日", "2026-07-10")).toBeNull();
    expect(resolveDateLabelYmd("2/30(月)", "2026-02-01")).toBeNull();
    expect(resolveDateLabelYmd("7/24(金)", "invalid")).toBeNull();
    expect(resolveDateLabelYmd(null, "2026-07-10")).toBeNull();
  });

  it("うるう年の 2/29 は実在する年の候補で解決する", () => {
    expect(resolveDateLabelYmd("2/29(木)", "2024-02-01")).toBe("2024-02-29");
  });
});

describe("parseBuilderProject", () => {
  it("正常な JSON 文字列を Project として返す", () => {
    const p = parseBuilderProject(JSON.stringify(baseProject()));
    expect(p).not.toBeNull();
    expect(p.tabs).toHaveLength(1);
    expect(p.name).toBe("2026夏期");
  });

  it("文字列以外・空文字・壊れた JSON・構造不正は null", () => {
    expect(parseBuilderProject(null)).toBeNull();
    expect(parseBuilderProject("")).toBeNull();
    expect(parseBuilderProject("{oops")).toBeNull();
    expect(parseBuilderProject(JSON.stringify({ version: 4, tabs: [] }))).toBeNull();
  });

  it("このクライアントより新しいスキーマ version は解釈しない", () => {
    const newer = { ...baseProject(), version: 99 };
    expect(parseBuilderProject(JSON.stringify(newer))).toBeNull();
  });

  it("同梱テンプレートは project に混ぜない", () => {
    const withTemplates = { ...baseProject(), templates: [{ id: 1 }] };
    const p = parseBuilderProject(JSON.stringify(withTemplates));
    expect(p).not.toBeNull();
    expect(p.templates).toBeUndefined();
  });
});

describe("buildKoshuLessons", () => {
  it("schedule のセルを実日付・時刻付きの講習コマに展開する", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d2-p2-c2": { subject: "数学", teacher: "半田" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toMatchObject({
      date: "2026-07-24",
      dateLabel: "7/24(金)",
      time: "13:00-13:45",
      periodLabel: "1限",
      teacher: "堀上",
      subj: "英語",
      grade: "中3",
      cls: "３S",
      tabName: "中3",
      projectName: "2026夏期",
    });
    expect(lessons[1]).toMatchObject({
      date: "2026-07-25",
      // 終了時刻の無い時限は開始のみ ("14:10")
      time: "14:10",
      teacher: "半田",
      cls: "３A",
    });
  });

  it("講師が空・「未定」のセルは載せない", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "未定" },
      "d1-p2-c1": { subject: "数学" },
      "d1-p2-c2": { subject: "国語", teacher: "  " },
    };
    expect(buildKoshuLessons(project)).toHaveLength(0);
  });

  it("同じ日・時限・講師・科目の複数クラス (合同) は 1 コマにまとめる", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c2": { subject: "社会", teacher: "井上" },
      "d1-p1-c1": { subject: "社会", teacher: "井上" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(1);
    // クラス登録順で連結 (schedule キーの列挙順に依らない)
    expect(lessons[0].cls).toBe("３S/３A");
  });

  it("同じ時限でも科目・講師が違えば別コマのまま", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d1-p1-c2": { subject: "数学", teacher: "半田" },
    };
    expect(buildKoshuLessons(project)).toHaveLength(2);
  });

  it("タブの activeDateIds / activePeriodIds で絞った範囲外のセルは載せない", () => {
    const project = baseProject();
    project.tabs[0].config.activeDateIds = [1];
    project.tabs[0].config.activePeriodIds = [1];
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d2-p1-c1": { subject: "英語", teacher: "堀上" }, // 使わない日
      "d1-p2-c1": { subject: "数学", teacher: "半田" }, // 使わない時限
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].date).toBe("2026-07-24");
  });

  it("時刻の読めない時限は time=null で短ラベルを残す", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p3-c1": { subject: "演習", teacher: "堀上" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons[0].time).toBeNull();
    expect(lessons[0].periodLabel).toBe("自習");
  });

  it("日付昇順 → 開始時刻順に整列する", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d2-p1-c1": { subject: "国語", teacher: "小松" },
      "d1-p2-c1": { subject: "数学", teacher: "半田" },
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons.map((l) => `${l.date} ${l.subj}`)).toEqual([
      "2026-07-24 英語",
      "2026-07-24 数学",
      "2026-07-25 国語",
    ]);
  });

  it("updatedAt が無い project は todayYmd を年推定の基準にする", () => {
    const project = baseProject({ createdAt: "", updatedAt: "" });
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    expect(buildKoshuLessons(project)).toHaveLength(0); // 基準なし → 変換不可
    const lessons = buildKoshuLessons(project, { todayYmd: "2027-07-01" });
    expect(lessons[0].date).toBe("2027-07-24");
  });

  it("project が null / tabs 無しなら空配列", () => {
    expect(buildKoshuLessons(null)).toEqual([]);
    expect(buildKoshuLessons({})).toEqual([]);
  });
});

describe("indexKoshuLessonsByDate", () => {
  const lessons = [
    { date: "2026-07-24", teacher: "堀上", subj: "英語" },
    { date: "2026-07-24", teacher: "半田", subj: "数学" },
    { date: "2026-07-25", teacher: "堀上", subj: "英語" },
  ];

  it("講師名の完全一致で日付ごとにまとめる", () => {
    const m = indexKoshuLessonsByDate(lessons, "堀上");
    expect([...m.keys()]).toEqual(["2026-07-24", "2026-07-25"]);
    expect(m.get("2026-07-24")).toHaveLength(1);
    expect(m.get("2026-07-24")[0].subj).toBe("英語");
  });

  it("teacher = null なら全講師分", () => {
    const m = indexKoshuLessonsByDate(lessons, null);
    expect(m.get("2026-07-24")).toHaveLength(2);
  });

  it("配列以外は空 Map", () => {
    expect(indexKoshuLessonsByDate(null, "堀上").size).toBe(0);
  });
});
