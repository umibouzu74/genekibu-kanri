import { describe, expect, it } from "vitest";
import {
  draftFromYobikoEvent,
  emptyYobikoDraft,
  migrateYobikoEvents,
  parseYobikoEventImport,
  parseYobikoKind,
  validateYobikoDraft,
  yobikoEventLabel,
  yobikoEventsToTsv,
  yobikoSources,
} from "./yobikoEvents";

describe("parseYobikoKind", () => {
  it("ラベル・key・短い呼び方・波ダッシュの揺れを受ける", () => {
    expect(parseYobikoKind("")).toBe("event");
    expect(parseYobikoKind("行事")).toBe("event");
    expect(parseYobikoKind("休校日")).toBe("closed");
    expect(parseYobikoKind("休校")).toBe("closed");
    expect(parseYobikoKind("closed")).toBe("closed");
    expect(parseYobikoKind("月〜金出勤者休日")).toBe("offMonFri");
    expect(parseYobikoKind("月～金出勤者休日")).toBe("offMonFri");
    expect(parseYobikoKind("月~金 出勤者休日")).toBe("offMonFri");
    expect(parseYobikoKind("火〜土出勤者休日")).toBe("offTueSat");
    expect(parseYobikoKind("登校日で授業のない日")).toBe("noClass");
    expect(parseYobikoKind("授業なし")).toBe("noClass");
    expect(parseYobikoKind("入寮日")).toBe("dorm");
    expect(parseYobikoKind("OFFTUESAT")).toBe("offTueSat");
    expect(parseYobikoKind("祝日")).toBe(null);
  });
});

describe("parseYobikoEventImport", () => {
  const text = [
    "開始日\t終了日\t種別\t名称\tメモ",
    "10/4\t\t休校日\t\t",
    "10/12\t\t休校日\tスポーツの日\t",
    "10/5\t\t火〜土出勤者休日\t\t",
    "12/24\t12/27\t行事\t冬期講習Ⅰ期\t❶〜❹",
    "1/4\t\t\tマークテスト⑤(国・理・地公)\t",
    "10/9\t\t行事\t\t",
    "11/31\t\t行事\tx\t",
    "10/20\t10/19\t行事\tx\t",
    "10/21\t\t祝日\tx\t",
  ].join("\n");

  it("行ごとに OK / エラーを判定し、年の無い日付は年度で補う (1〜3 月は翌年)", () => {
    const { rows, header } = parseYobikoEventImport(text, { fiscalYear: 2026, source: "2026予備校" });
    expect(header).toBe(true);
    expect(rows.map((r) => r.status)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "error",
      "error",
      "error",
      "error",
    ]);
    expect(rows[0].event).toEqual({ name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed", source: "2026予備校" });
    expect(rows[1].event.name).toBe("スポーツの日");
    expect(rows[3].event).toMatchObject({ startDate: "2026-12-24", endDate: "2026-12-27", memo: "❶〜❹" });
    // 種別が空 = 行事。1 月は翌年
    expect(rows[4].event).toMatchObject({ kind: "event", startDate: "2027-01-04" });
    expect(rows[5].error).toBe("名称が空です");
    expect(rows[6].error).toMatch("開始日");
    expect(rows[7].error).toBe("終了日が開始日より前です");
    expect(rows[8].error).toMatch("種別「祝日」");
  });

  it("登録済み・表の中の同じもの (名称・種別・期間) は重複", () => {
    const existing = [{ id: 1, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" }];
    const { rows } = parseYobikoEventImport(
      "開始日\t種別\t名称\n10/4\t休校日\t\n10/5\t休校日\t\n10/5\t休校日\t\n10/5\t行事\t休校日",
      { existing, fiscalYear: 2026 }
    );
    expect(rows.map((r) => r.status)).toEqual(["duplicate", "ok", "duplicate", "ok"]);
  });

  it("見出しの無い表の 1 行目を見出しと取り違えない (「行事」は種別の値)", () => {
    const { rows, header } = parseYobikoEventImport("3/19\t\t行事\t終了式\n10/9\t\t行事\tx\t備考あり", {
      fiscalYear: 2026,
    });
    expect(header).toBe(false);
    expect(rows.map((r) => r.event?.name)).toEqual(["終了式", "x"]);
  });

  it("日付に添えた曜日が暦と合わなければエラー (年度の取り違えに気付く)", () => {
    // 2027 年度の予定表を 2026 年度として貼った: 4/8 は 2026 年なら水曜、2027 年なら木曜
    const text = "開始日\t種別\t名称\n4/8(木)\t入寮日\t\n4/9（金）\t行事\tx";
    const wrong = parseYobikoEventImport(text, { fiscalYear: 2026 });
    expect(wrong.rows[0].error).toBe("開始日「4/8(木)」の曜日が合いません (2026-04-08 は 水曜)。年度を確かめてください");
    const right = parseYobikoEventImport(text, { fiscalYear: 2027 });
    expect(right.rows.map((r) => r.status)).toEqual(["ok", "ok"]);
  });

  it("年度をまたぐ期間を年なしで書いたら、年を書くよう案内する", () => {
    const { rows } = parseYobikoEventImport("開始日\t終了日\t名称\n3/25\t4/5\tx\n3/25\t2027/4/5\tx", {
      fiscalYear: 2026,
    });
    expect(rows[0].error).toMatch("年度をまたぐ期間は");
    expect(rows[1].status).toBe("ok");
  });

  it("出典の列があれば列の値を使う", () => {
    const { rows } = parseYobikoEventImport("開始日\t名称\t出典\n2026/10/1\tA\t改訂版", {
      fiscalYear: 2026,
      source: "初版",
    });
    expect(rows[0].event.source).toBe("改訂版");
  });
});

describe("書き出し → 貼り戻し", () => {
  it("同じ内容で読める", () => {
    const events = [
      { id: 2, name: "冬期講習Ⅰ期", startDate: "2026-12-24", endDate: "2026-12-27", kind: "event", memo: "❶〜❹", source: "S" },
      { id: 1, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" },
    ];
    const tsv = yobikoEventsToTsv(events);
    expect(tsv.split("\n")[0]).toBe("開始日\t終了日\t種別\t名称\tメモ\t出典");
    const { rows } = parseYobikoEventImport(tsv, { fiscalYear: 2026 });
    expect(rows.every((r) => r.status === "ok")).toBe(true);
    expect(rows.map((r) => r.event)).toEqual([
      { name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" },
      { name: "冬期講習Ⅰ期", startDate: "2026-12-24", endDate: "2026-12-27", kind: "event", memo: "❶〜❹", source: "S" },
    ]);
  });
});

describe("書き出しのタブ・改行", () => {
  it("セルの中のタブ・改行は空白にして書く (貼り戻すと列がずれない)", () => {
    const tsv = yobikoEventsToTsv([
      { id: 1, name: "a\tb", startDate: "2026-10-04", endDate: "2026-10-04", kind: "event", memo: "1行目\n2行目" },
    ]);
    const { rows } = parseYobikoEventImport(tsv, { fiscalYear: 2026 });
    expect(rows[0].event).toMatchObject({ name: "a b", memo: "1行目 2行目" });
  });
});

describe("フォーム", () => {
  it("行事は名称が要る。日の種別は名称なしで登録できる。終了日の空は単日", () => {
    expect(validateYobikoDraft({ ...emptyYobikoDraft("2026-10-04") }).error).toBe("名称を入れてください");
    expect(validateYobikoDraft({ ...emptyYobikoDraft("2026-10-04"), kind: "closed" }).event).toEqual({
      name: "",
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      kind: "closed",
    });
    expect(validateYobikoDraft({ ...emptyYobikoDraft(""), name: "x" }).error).toBe("開始日を入れてください");
    expect(
      validateYobikoDraft({ ...emptyYobikoDraft("2026-10-04"), endDate: "2026-10-03", name: "x" }).error
    ).toBe("終了日が開始日より前です");
  });

  it("編集の下書きは単日なら終了日を空にする", () => {
    const ev = { id: 1, name: "x", startDate: "2026-10-04", endDate: "2026-10-04", kind: "event" };
    expect(draftFromYobikoEvent(ev).endDate).toBe("");
    expect(draftFromYobikoEvent({ ...ev, endDate: "2026-10-05" }).endDate).toBe("2026-10-05");
  });
});

describe("migrateYobikoEvents", () => {
  it("崩れた値を揃え、日付の読めない行は捨てる", () => {
    expect(migrateYobikoEvents(null)).toEqual([]);
    expect(
      migrateYobikoEvents([
        { id: 3, name: "A", startDate: "2026-10-01", kind: "unknown" },
        { name: 1, startDate: "2026-10-02", endDate: "2026-10-01", kind: "closed", memo: "", source: "S" },
        { startDate: "10/3" },
        null,
      ])
    ).toEqual([
      { id: 3, name: "A", startDate: "2026-10-01", endDate: "2026-10-01", kind: "event" },
      { id: 4, name: "", startDate: "2026-10-02", endDate: "2026-10-02", kind: "closed", source: "S" },
    ]);
  });

  it("id の無い行・重なった id は最大の次から振り直す (1 件の編集が 2 件に効かない)", () => {
    const out = migrateYobikoEvents([
      { id: 2, startDate: "2026-10-01", kind: "event", name: "a" },
      { startDate: "2026-10-02", kind: "event", name: "b" },
      { id: 2, startDate: "2026-10-03", kind: "event", name: "c" },
    ]);
    expect(out.map((e) => e.id)).toEqual([2, 3, 4]);
  });
});

describe("表示", () => {
  it("名称の無い日の種別は種別の名前", () => {
    expect(yobikoEventLabel({ kind: "offMonFri", name: "" })).toBe("月〜金出勤者休日");
    expect(yobikoEventLabel({ kind: "closed", name: "スポーツの日" })).toBe("スポーツの日");
  });

  it("出典の一覧", () => {
    expect(yobikoSources([{ source: "B" }, { source: "A" }, { source: "B" }, {}])).toEqual([
      { source: "A", count: 1 },
      { source: "B", count: 2 },
    ]);
  });
});
