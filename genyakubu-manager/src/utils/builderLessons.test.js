// 講習時間割 (builder project) → 個人月間スケジュール反映の変換ヘルパ。
// 年推定 (日付ラベルは年を持たない)・合同まとめ・タブの実効 config 絞り込み
// あたりが要なので、そこを重点的に固定する。
import { describe, expect, it } from "vitest";
import {
  buildKoshuLessons,
  buildKoshuLessonsForSeasons,
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

  it("半年近く先に組んで以後未編集でも前年に誤解決しない (6月編集の冬期)", () => {
    // 素の距離最小だと 12/25 は前年 12 月 (172 日前 < 193 日後) に化ける。
    // 過去方向×2 の重み付けで先の 12 月へ倒す。
    expect(resolveDateLabelYmd("12/25(金)", "2026-06-15")).toBe("2026-12-25");
    expect(resolveDateLabelYmd("1/7(木)", "2026-06-15")).toBe("2027-01-07");
  });

  it("シーズン終了直後の編集 (過去方向 1〜2 ヶ月) は当年のまま", () => {
    // 夏期 (7/20 開講) を 8/31 に最終編集 → 過去 42 日は重み付け後も当年が最近
    expect(resolveDateLabelYmd("7/20(月)", "2026-08-31")).toBe("2026-07-20");
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

  it("クラスに教室があれば room に添える (合同はクラス順の '/' 連結、無いクラスは ?)", () => {
    const project = baseProject();
    project.tabs[0].config.classes = [
      { id: 1, label: "３S", room: "401" },
      { id: 2, label: "３A" },
    ];
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "社会", teacher: "井上" },
      "d1-p1-c2": { subject: "社会", teacher: "井上" },
      "d1-p2-c1": { subject: "英語", teacher: "堀上" },
      "d1-p2-c2": { subject: "数学", teacher: "半田" },
    };
    const lessons = buildKoshuLessons(project);
    const of = (t) => lessons.find((l) => l.teacher === t).room;
    expect(of("井上")).toBe("401/?");
    expect(of("堀上")).toBe("401");
    expect(of("半田")).toBe("");
  });

  it("同じ時限でも科目・講師が違えば別コマのまま", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d1-p1-c2": { subject: "数学", teacher: "半田" },
    };
    expect(buildKoshuLessons(project)).toHaveLength(2);
  });

  it("回数連番: クラス内で科目ごとに日付→時限順の ①②… を countText に付ける", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d1-p2-c1": { subject: "数学", teacher: "半田" },
      "d2-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    const lessons = buildKoshuLessons(project);
    const byKey = (subj, date) =>
      lessons.find((l) => l.subj === subj && l.date === date);
    expect(byKey("英語", "2026-07-24").countText).toBe("①");
    expect(byKey("数学", "2026-07-24").countText).toBe("①");
    expect(byKey("英語", "2026-07-25").countText).toBe("②");
  });

  it("回数連番は「そのクラスの何回目」— 前の回の担当講師が違っても通算する", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "石原" },
      "d2-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons.find((l) => l.teacher === "堀上").countText).toBe("②");
  });

  it("合同で全クラス同じ番号なら丸数字 1 つ、違えば cls 順の '/' 連結", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      // c2 だけ先に 1 回目の社会がある → d2 の合同は c1=①, c2=②
      "d1-p1-c2": { subject: "社会", teacher: "西岡" },
      "d2-p1-c1": { subject: "社会", teacher: "井上" },
      "d2-p1-c2": { subject: "社会", teacher: "井上" },
    };
    const lessons = buildKoshuLessons(project);
    const combined = lessons.find((l) => l.date === "2026-07-25");
    expect(combined.cls).toBe("３S/３A");
    expect(combined.countText).toBe("①/②");
    // 全クラス同じ番号のケース
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "社会", teacher: "井上" },
      "d1-p1-c2": { subject: "社会", teacher: "井上" },
    };
    expect(buildKoshuLessons(project)[0].countText).toBe("①");
  });

  it("同一クラス×同日に同じ科目が重複している間は番号を付けない (builder と同じ)", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
      "d1-p2-c1": { subject: "英語", teacher: "堀上" },
    };
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(2);
    expect(lessons.every((l) => l.countText === "")).toBe(true);
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

  it("外部授業 (externalSessions) を kind=external で同じ配列に混ぜる", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    project.externalSessions = [
      {
        id: 10,
        date: "7/24(金)",
        teacherName: "堀上",
        memo: "予備校",
        startTime: "9:00",
        endTime: "10:30",
      },
    ];
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(2);
    // 9:00 開始の外部授業が 13:00 の講習コマより先に並ぶ
    expect(lessons[0]).toMatchObject({
      kind: "external",
      key: "ext:10",
      date: "2026-07-24",
      time: "09:00-10:30",
      teacher: "堀上",
      subj: "予備校",
      grade: "",
      cls: "",
    });
    expect(lessons[1].kind).toBe("koshu");
  });

  it("外部授業の種別: メモ未設定は時刻一致のプリセット名、判別不能は「外部」", () => {
    const project = baseProject();
    project.externalSessionPresets = [
      { id: 1, name: "高松高校", startTime: "15:00", endTime: "16:30" },
    ];
    project.externalSessions = [
      { id: 1, date: "7/24(金)", teacherName: "堀上", startTime: "15:00", endTime: "16:30" },
      { id: 2, date: "7/25(土)", teacherName: "堀上", startTime: "18:00" },
    ];
    const lessons = buildKoshuLessons(project);
    expect(lessons.map((l) => l.subj)).toEqual(["高松高校", "外部"]);
  });

  it("外部授業: 講師名なしは除外、時刻の読めないものは同日の末尾", () => {
    const project = baseProject();
    project.tabs[0].schedule = {
      "d1-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    project.externalSessions = [
      { id: 1, date: "7/24(金)", teacherName: "", memo: "予備校" },
      { id: 2, date: "7/24(金)", teacherName: "堀上", memo: "終日不在", label: "午後" },
    ];
    const lessons = buildKoshuLessons(project);
    expect(lessons).toHaveLength(2);
    expect(lessons[1]).toMatchObject({
      kind: "external",
      subj: "終日不在",
      time: null,
      periodLabel: "午後",
    });
  });
});

describe("buildKoshuLessons: 前の季節の日付が残った project", () => {
  // 夏期の project を冬期に作り替えた: プールに夏の日付と予備校の予定が残っていて、
  // タブは冬の日付だけを使う。最終編集は 2026-12-20
  const winter = () => {
    const project = baseProject({
      name: "2026冬期",
      updatedAt: "2026-12-20T09:00:00.000Z",
      dates: [
        { id: 1, label: "7/29(水)" },
        { id: 2, label: "12/25(金)" },
        { id: 3, label: "1/7(木)" },
      ],
    });
    project.tabs[0].config.activeDateIds = [2, 3];
    project.tabs[0].schedule = {
      "d2-p1-c1": { subject: "英語", teacher: "堀上" },
      "d3-p1-c1": { subject: "英語", teacher: "堀上" },
    };
    project.externalSessions = [
      { id: 1, date: "7/29(水)", teacherName: "堀上", memo: "予備校", startTime: "9:00", endTime: "10:30" },
      { id: 2, date: "1/7(木)", teacherName: "堀上", memo: "予備校", startTime: "9:00", endTime: "10:30" },
    ];
    return project;
  };

  it("どのタブも使わない日の外部授業は載せない (翌年 7 月の予定に化けない)", () => {
    const lessons = buildKoshuLessons(winter());
    expect(lessons.filter((l) => l.kind === "external").map((l) => l.date)).toEqual(["2027-01-07"]);
  });

  it("講習のコマは年をまたいで 12 月 → 翌年 1 月", () => {
    const lessons = buildKoshuLessons(winter());
    expect(lessons.filter((l) => l.kind === "koshu").map((l) => l.date)).toEqual(["2026-12-25", "2027-01-07"]);
  });

  it("講習の数か月後に開いても (最終編集が 5 月)、曜日の合う年に置く", () => {
    const project = winter();
    project.updatedAt = "2027-05-01T09:00:00.000Z";
    const lessons = buildKoshuLessons(project);
    expect(lessons.filter((l) => l.kind === "koshu").map((l) => l.date)).toEqual(["2026-12-25", "2027-01-07"]);
  });

  it("講習の半年後の編集でも、1 つの講習が 2 つの年に割れない (年は季節ごとに決める)", () => {
    // 最終編集 2027-07-01: 12/25 は 188 日前・1/7 は 175 日前。ラベルごとに決めると
    // 曜日を信じる範囲 (180 日) の境目で 12/25 だけ 2027-12-25 へ移っていた
    const project = winter();
    project.updatedAt = "2027-07-01T09:00:00.000Z";
    const dates = buildKoshuLessons(project).map((l) => l.date);
    expect(dates).toEqual(["2026-12-25", "2027-01-07", "2027-01-07"]);
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

describe("buildKoshuLessonsForSeasons (季節ごとの project、2026-10-23)", () => {
  const summer = baseProject({
    name: "2026夏期",
    tabs: [
      {
        ...baseProject().tabs[0],
        schedule: { "d1-p1-c1": { subject: "英語", teacher: "堀上" } },
      },
    ],
  });
  const winter = baseProject({
    name: "2026冬期",
    updatedAt: "2026-12-01T09:00:00.000Z",
    dates: [{ id: 1, label: "12/24(木)" }],
    tabs: [
      {
        ...baseProject().tabs[0],
        schedule: { "d1-p1-c1": { subject: "数学", teacher: "堀上" } },
      },
    ],
  });

  it("全季節の講習コマを 1 本にまとめ、日付順に並べる (冬期を作っても夏期の「講」は残る)", () => {
    const lessons = buildKoshuLessonsForSeasons({
      winter: { status: "ready", project: winter },
      summer: { status: "ready", project: summer },
      spring: { status: "missing", project: null },
    });
    expect(lessons.map((l) => [l.date, l.subj, l.season, l.projectName])).toEqual([
      ["2026-07-24", "英語", "summer", "2026夏期"],
      ["2026-12-24", "数学", "winter", "2026冬期"],
    ]);
  });

  it("key は季節で区別する (タブ id は季節ごとの連番で重なる)", () => {
    const lessons = buildKoshuLessonsForSeasons({
      summer: { project: summer },
      winter: { project: winter },
    });
    expect(new Set(lessons.map((l) => l.key)).size).toBe(lessons.length);
    expect(lessons[0].key.startsWith("summer:")).toBe(true);
  });

  it("空・壊れた入力は空配列", () => {
    expect(buildKoshuLessonsForSeasons(null)).toEqual([]);
    expect(buildKoshuLessonsForSeasons({ spring: null })).toEqual([]);
  });
});


describe("buildKoshuLessons: 作成中 / 仮確定 / 確定 (2026-10-27)", () => {
  const withLessons = (over = {}) => {
    const project = baseProject(over);
    project.tabs[0].schedule = { "d1-p1-c1": { subject: "英語", teacher: "堀上" } };
    project.externalSessions = [
      { id: 1, date: "7/24(金)", teacherName: "堀上", label: "", memo: "予備校", startTime: "09:00", endTime: "10:00" },
    ];
    return project;
  };

  it("作成中の時間割は講習コマも外部授業も出さない", () => {
    expect(buildKoshuLessons(withLessons({ publishState: "draft" }))).toEqual([]);
  });

  it("仮確定は出して tentative=true、確定・未設定 (この項目ができる前の時間割) は tentative=false", () => {
    const tentative = buildKoshuLessons(withLessons({ publishState: "tentative" }));
    expect(tentative.map((l) => [l.kind, l.tentative])).toEqual([
      ["external", true],
      ["koshu", true],
    ]);
    for (const project of [withLessons({ publishState: "final" }), withLessons()]) {
      expect(buildKoshuLessons(project).every((l) => l.tentative === false)).toBe(true);
      expect(buildKoshuLessons(project)).toHaveLength(2);
    }
  });

  it("季節ごとに決まる (作成中の冬期を作っていても、確定の夏期は出る)", () => {
    const lessons = buildKoshuLessonsForSeasons({
      summer: { status: "ready", project: withLessons({ publishState: "final" }) },
      winter: { status: "ready", project: withLessons({ name: "冬", publishState: "draft", updatedAt: "2026-12-01T09:00:00.000Z" }) },
    });
    expect(lessons.map((l) => l.season)).toEqual(["summer", "summer"]);
  });
});

describe("buildKoshuLessons: 外部授業の講座名 (2026-10-27)", () => {
  it("「外」カードの科目は「メモ + 講座名」", () => {
    const project = baseProject({
      externalSessions: [
        { id: 1, date: "7/24(金)", teacherName: "滝澤", label: "", memo: "Ⅰ期 予備校３限", course: "共通テスト理科基礎(物理基礎)", startTime: "12:25", endTime: "13:35" },
      ],
    });
    project.tabs[0].schedule = { "d1-p1-c1": { subject: "英語", teacher: "堀上" } };
    const ext = buildKoshuLessons(project).find((l) => l.kind === "external");
    expect(ext.subj).toBe("Ⅰ期 予備校３限 共通テスト理科基礎(物理基礎)");
  });
});
