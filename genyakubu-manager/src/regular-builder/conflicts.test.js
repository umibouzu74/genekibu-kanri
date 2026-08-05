import { describe, expect, it } from "vitest";
import {
  buildConflictView,
  computeBusyTeachers,
  computeConflicts,
  computeNgTeachersForTabs,
  conflictKey,
  entryRef,
} from "./conflicts";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

// 2 タブ構成: 中3 (18:00 開始) と 中1・中2 (18:55 開始) で時限 id は別だが
// 時間帯が重なるケースを再現する。
function twoTabProject() {
  const p = makeProject();
  p.periods = [
    { id: 1, label: "中3 1限", time: "18:00-18:45" },
    { id: 2, label: "中3 2限", time: "18:55-19:40" },
    { id: 11, label: "中12 1限", time: "18:55-19:40" },
  ];
  p.tabs = [
    {
      id: 1,
      name: "中3",
      grade: "中3",
      classes: [{ id: 1, label: "S", room: "501" }],
      days: ["月"],
      periodIds: [1, 2],
      schedule: {},
    },
    {
      id: 2,
      name: "中2",
      grade: "中2",
      classes: [{ id: 1, label: "S", room: "602" }],
      days: ["月"],
      periodIds: [11],
      schedule: {},
    },
  ];
  return p;
}

describe("computeConflicts - 講師重複", () => {
  it("タブをまたぐ同時間帯の同一講師を検出する", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("teacher");
    const { byRef } = buildConflictView(list, []);
    expect(byRef.size).toBe(2);
    expect([...byRef.values()][0][0]).toContain("堀上");
  });

  it("時間帯が重ならなければ衝突なし (中3 1限 18:00 と 中12 1限 18:55)", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = { subj: "数学", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("曜日が違えば衝突なし", () => {
    const p = twoTabProject();
    p.tabs[1].days = ["火"];
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("火", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("複数講師セルは分解して照合し、IME の全角中点も拾う", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "個別", teacher: "香川・福江" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "理科", teacher: "福江" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].label).toContain("福江");
  });

  it("同一セル内の複数講師 (並列監督) は衝突にならない", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "確認テスト", teacher: "藤田·大屋敷" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("computeConflicts - 教室重複", () => {
  it("同時間帯の同一教室 (クラス既定 vs セル上書き) を検出する", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "A" }; // 教室 501 (既定)
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "数学", teacher: "B", room: "501" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("room");
    expect(list[0].label).toContain("501");
  });

  it("教室が未設定 (空) 同士は衝突にしない", () => {
    const p = twoTabProject();
    p.tabs[0].classes[0].room = "";
    p.tabs[1].classes[0].room = "";
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "A" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "数学", teacher: "B" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("computeConflicts - クラス (生徒) の時間重複", () => {
  // makeProject: 月1限 S=数学/半田 (18:00-18:45)。2限の時刻をタイポで
  // 1限と重ねた上で、同じ S 列に講師・教室の重複を作らないセルを足す
  // (class 単独で検出されることを確かめるため)
  const typoProject = () => {
    const p = makeProject();
    p.periods[1].time = "18:40-19:25";
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", room: "602" };
    return p;
  };

  it("同じクラス列に時間帯の重なるコマが 2 つあると class として検出する", () => {
    const { list } = computeConflicts(typoProject());
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("class");
    expect(list[0].label).toContain("中3 S");
    expect([...list[0].refs].sort()).toEqual([
      `1:${makeCellKey("月", 1, 1)}`,
      `1:${makeCellKey("月", 2, 1)}`,
    ]);
    expect(list[0].reasons[0]).toContain("時間帯が重複");
  });

  it("別クラス列の並列コマは class 衝突にしない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 2)] = { subj: "理科" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("時間帯が重ならない同一クラスのコマは検出しない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", room: "602" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });

  it("他の重複と同じく承認で消せる", () => {
    const { list } = computeConflicts(typoProject());
    const view = buildConflictView(list, [conflictKey(list[0])]);
    expect(view.active).toHaveLength(0);
    expect(view.approved).toHaveLength(1);
  });
});

describe("computeConflicts - 時刻未設定", () => {
  it("時刻の無い時限のセルは判定対象外 (落ちない)", () => {
    const p = twoTabProject();
    p.periods[1].time = "";
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    expect(computeConflicts(p).list).toHaveLength(0);
  });
});

describe("entryRef", () => {
  it("タブ id とセルキーで一意になる", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = { subj: "数学" };
    const { list } = computeConflicts(p);
    expect(list).toHaveLength(0);
    expect(
      entryRef({ tab: p.tabs[0], key: makeCellKey("月", 1, 1) })
    ).toBe("1:月|1|1");
  });
});

describe("conflictKey / buildConflictView (承認)", () => {
  function conflictedProject() {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "英語", teacher: "堀上" };
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    return p;
  }

  it("conflictKey は refs の順序に依存しない", () => {
    const { list } = computeConflicts(conflictedProject());
    const c = list[0];
    const swapped = { ...c, refs: [c.refs[1], c.refs[0]] };
    expect(conflictKey(swapped)).toBe(conflictKey(c));
  });

  it("承認済みの衝突はバッジ (active) と赤枠 (byRef) から外れる", () => {
    const { list } = computeConflicts(conflictedProject());
    const key = conflictKey(list[0]);
    const view = buildConflictView(list, [key]);
    expect(view.active).toHaveLength(0);
    expect(view.approved).toHaveLength(1);
    expect(view.byRef.size).toBe(0);
  });

  it("承認リストに無い衝突は active のまま", () => {
    const { list } = computeConflicts(conflictedProject());
    const view = buildConflictView(list, ["別のキー"]);
    expect(view.active).toHaveLength(1);
    expect(view.approved).toHaveLength(0);
    expect(view.byRef.size).toBe(2);
  });

  it("セルが動くと承認は無効になる (キー不一致で active に戻る)", () => {
    const p = conflictedProject();
    const key = conflictKey(computeConflicts(p).list[0]);
    // 衝突セルを別クラス列 (id 2) に移すと refs が変わる
    p.tabs[1].classes.push({ id: 2, label: "S2", room: "603" });
    const cell = p.tabs[1].schedule[makeCellKey("月", 11, 1)];
    delete p.tabs[1].schedule[makeCellKey("月", 11, 1)];
    p.tabs[1].schedule[makeCellKey("月", 11, 2)] = cell;
    const view = buildConflictView(computeConflicts(p).list, [key]);
    expect(view.active).toHaveLength(1);
  });
});

describe("computeBusyTeachers - 講師プルダウンの重複予告", () => {
  it("タブをまたぐ同時間帯に入っている講師を空セルにも予告する", () => {
    const p = twoTabProject();
    // 中2 タブ 月 18:55-19:40 に堀上が入っている
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    const busy = computeBusyTeachers(p, p.tabs[0]);
    // 中3 の 2限 (18:55-19:40) は重なるので予告あり、1限 (18:00-18:45) はなし
    expect(busy.get(makeCellKey("月", 2, 1))).toEqual(["堀上"]);
    expect(busy.get(makeCellKey("月", 1, 1))).toBeUndefined();
  });

  it("自セルに入っている講師は予告しない (自分自身とは重複しない)", () => {
    const p = twoTabProject();
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "数学", teacher: "半田" };
    const busy = computeBusyTeachers(p, p.tabs[0]);
    expect(busy.get(makeCellKey("月", 2, 1))).toBeUndefined();
  });

  it("複数講師セル (·区切り) は各講師に展開して予告する", () => {
    const p = twoTabProject();
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上·半田" };
    const busy = computeBusyTeachers(p, p.tabs[0]);
    expect(busy.get(makeCellKey("月", 2, 1))).toEqual(["半田", "堀上"].sort());
  });

  it("時刻未設定の時限は判定不能なので予告しない", () => {
    const p = twoTabProject();
    p.periods[1].time = "";
    p.tabs[1].schedule[makeCellKey("月", 11, 1)] = { subj: "英語", teacher: "堀上" };
    const busy = computeBusyTeachers(p, p.tabs[0]);
    expect(busy.get(makeCellKey("月", 2, 1))).toBeUndefined();
  });
});

describe("computeConflicts - 講師 NG (不在) への割当", () => {
  const ngProject = (ngSlots) => {
    const p = makeProject();
    // makeProject: 月1限(18:00-18:45) S=数学/半田, 月2限(18:55-19:40) A=英語/堀上
    p.teachers = [{ name: "堀上", ngSlots }, { name: "半田" }];
    return p;
  };

  it("終日 NG の曜日への割当を refs 1 件の ng として検出する", () => {
    const { list } = computeConflicts(ngProject([{ day: "月" }]));
    const ng = list.filter((c) => c.type === "ng");
    expect(ng).toHaveLength(1);
    expect(ng[0].refs).toEqual([`1:${makeCellKey("月", 2, 2)}`]);
    expect(ng[0].label).toContain("堀上");
    expect(ng[0].label).toContain("終日");
    expect(ng[0].reasons[0]).toContain("NG 時間帯");
  });

  it("時刻範囲付き NG は重なる時限だけ検出する", () => {
    const { list } = computeConflicts(
      ngProject([{ day: "月", time: "19:00-21:00" }])
    );
    const ng = list.filter((c) => c.type === "ng");
    expect(ng).toHaveLength(1); // 2限 18:55-19:40 のみ重なる
    const none = computeConflicts(
      ngProject([{ day: "月", time: "20:00-21:00" }])
    ).list.filter((c) => c.type === "ng");
    expect(none).toHaveLength(0);
  });

  it("別曜日の NG は検出しない・承認で消せる (conflictKey 互換)", () => {
    expect(
      computeConflicts(ngProject([{ day: "火" }])).list.filter(
        (c) => c.type === "ng"
      )
    ).toHaveLength(0);
    const { list } = computeConflicts(ngProject([{ day: "月" }]));
    const ng = list.find((c) => c.type === "ng");
    const view = buildConflictView(list, [conflictKey(ng)]);
    expect(view.active.some((c) => c.type === "ng")).toBe(false);
    expect(view.approved.some((c) => c.type === "ng")).toBe(true);
  });

  it("同じセルに複数の NG が重なっても 1 件にまとめる", () => {
    const { list } = computeConflicts(
      ngProject([
        { day: "月", time: "18:30-19:10" },
        { day: "月", time: "19:20-20:00" },
      ])
    );
    expect(list.filter((c) => c.type === "ng")).toHaveLength(1);
  });

  it("複数講師セル (·区切り) は該当講師だけを検出する", () => {
    const p = ngProject([{ day: "月" }]);
    p.tabs[0].schedule[makeCellKey("月", 2, 2)] = {
      subj: "英語",
      teacher: "堀上·半田",
    };
    const ng = computeConflicts(p).list.filter((c) => c.type === "ng");
    expect(ng).toHaveLength(1);
    expect(ng[0].label).toContain("堀上");
  });
});

describe("computeNgTeachersForTabs - 講師プルダウンの (NG) 予告", () => {
  it("NG に当たるマスの全クラス列に講師名を予告する", () => {
    const p = makeProject();
    p.teachers = [{ name: "堀上", ngSlots: [{ day: "月", time: "18:00-18:30" }] }];
    const ng = computeNgTeachersForTabs(p, p.tabs).get(1);
    // 1限 18:00-18:45 は重なる (S/A 両列)、2限 18:55-19:40 は重ならない
    expect(ng.get(makeCellKey("月", 1, 1))).toEqual(["堀上"]);
    expect(ng.get(makeCellKey("月", 1, 2))).toEqual(["堀上"]);
    expect(ng.get(makeCellKey("月", 2, 1))).toBeUndefined();
    // 火曜はタブが使うが NG は月曜のみ
    expect(ng.get(makeCellKey("火", 1, 1))).toBeUndefined();
  });

  it("終日 NG は時刻未設定の時限にも予告する", () => {
    const p = makeProject();
    p.periods[0].time = "";
    p.teachers = [{ name: "堀上", ngSlots: [{ day: "月" }] }];
    const ng = computeNgTeachersForTabs(p, p.tabs).get(1);
    expect(ng.get(makeCellKey("月", 1, 1))).toEqual(["堀上"]);
  });

  it("時刻範囲 NG は時刻未設定の時限には予告しない (判定不能)", () => {
    const p = makeProject();
    p.periods[0].time = "";
    p.teachers = [{ name: "堀上", ngSlots: [{ day: "月", time: "18:00-19:00" }] }];
    const ng = computeNgTeachersForTabs(p, p.tabs).get(1);
    expect(ng.get(makeCellKey("月", 1, 1))).toBeUndefined();
  });
});

describe("buildConflictView - ngOnlyRefs", () => {
  it("未承認が NG のみのセルだけを ngOnlyRefs に入れる", () => {
    const p = makeProject();
    // 月2限 A=英語/堀上 に終日 NG。さらに同時間帯の講師重複も作る
    p.teachers = [{ name: "堀上", ngSlots: [{ day: "月" }] }, { name: "半田" }];
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "国語", teacher: "半田" };
    p.tabs[0].schedule[makeCellKey("月", 1, 2)] = { subj: "理科", teacher: "半田" };
    const view = buildConflictView(computeConflicts(p).list, []);
    const ngRef = `1:${makeCellKey("月", 2, 2)}`; // NG のみ
    const pairRef = `1:${makeCellKey("月", 1, 1)}`; // 講師重複のみ
    expect(view.ngOnlyRefs.has(ngRef)).toBe(true);
    expect(view.ngOnlyRefs.has(pairRef)).toBe(false);
  });
});
