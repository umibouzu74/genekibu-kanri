// @vitest-environment jsdom
// タイムテーブル代行モードの仮代行は「コマ × 講師」単位 (2026-09-15)。
// コマ id だけで持っていたため、プレップ (香川·福江·川井) で福江の仮代行を
// 入れると香川の仮代行が黙って消えていた。保存時は欠勤登録の理由メモを
// 引き継ぎ、保存件数を toast で返す。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { ToastProvider } from "./useToasts";
import { useSubstitutionMode } from "./useSubstitutionMode";

afterEach(cleanup);

// 2026-09-19 は土曜
const SAT = "2026-09-19";
const PREP = {
  id: 1,
  day: "土",
  time: "14:00-16:00",
  grade: "中1-3",
  cls: "-",
  room: "301",
  subj: "プレップ",
  teacher: "香川·福江·川井",
  note: "",
};
const OTHER = {
  id: 2,
  day: "土",
  time: "17:00-18:00",
  grade: "中3",
  cls: "A",
  room: "302",
  subj: "数学",
  teacher: "堀上",
  note: "",
};

function setup({ subs = [], saveSubs = () => {}, unavailable = [], daySchedules = [], toasts } = {}) {
  const wrapper = toasts
    ? ({ children }) => <ToastProvider render={() => null}>{children}</ToastProvider>
    : undefined;
  return renderHook(
    () =>
      useSubstitutionMode({
        slots: [PREP, OTHER],
        subs,
        saveSubs,
        holidays: [],
        examPeriods: [],
        partTimeStaff: [],
        subjects: [],
        subjectCategories: [],
        timetables: [],
        biweeklyAnchors: [],
        teacherSubjects: {},
        unavailableTeachers: new Set(unavailable),
        daySchedules,
      }),
    { wrapper }
  );
}

describe("useSubstitutionMode の仮代行 (コマ × 講師)", () => {
  it("同じコマの 2 人に仮代行を入れても、先に入れた方が残る", () => {
    const { result } = setup({ unavailable: ["香川", "福江"] });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    act(() => result.current.assignSubstitute(1, "福江", "杉原"));
    expect(result.current.pendingSubs).toEqual([
      { slotId: 1, originalTeacher: "香川", substitute: "西岡" },
      { slotId: 1, originalTeacher: "福江", substitute: "杉原" },
    ]);
    expect(result.current.pendingSubMap.get(1)).toHaveLength(2);
    expect(result.current.getPendingSub(1, "香川")?.substitute).toBe("西岡");
    expect(result.current.getPendingSub(1, "福江")?.substitute).toBe("杉原");
    expect(result.current.getPendingSub(1, "川井")).toBeNull();
    // 2 人とも仮代行が付いたので未割当は 0
    expect(result.current.uncoveredSlots).toEqual([]);
  });

  it("同じ (コマ, 講師) に入れ直すと差し替え (重複しない)", () => {
    const { result } = setup({ unavailable: ["香川"] });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    act(() => result.current.assignSubstitute(1, "香川", "杉原"));
    expect(result.current.pendingSubs).toEqual([
      { slotId: 1, originalTeacher: "香川", substitute: "杉原" },
    ]);
  });

  it("取消は講師ごと。省略するとそのコマの仮代行を全部消す", () => {
    const { result } = setup({ unavailable: ["香川", "福江"] });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    act(() => result.current.assignSubstitute(1, "福江", "杉原"));
    act(() => result.current.removeAssignment(1, "香川"));
    expect(result.current.pendingSubs).toEqual([
      { slotId: 1, originalTeacher: "福江", substitute: "杉原" },
    ]);
    // 香川は仮代行が外れたので未割当に戻る
    expect(result.current.uncoveredSlots).toEqual([
      { slotId: 1, originalTeacher: "香川", date: SAT },
    ]);
    act(() => result.current.removeAssignment(1));
    expect(result.current.pendingSubs).toEqual([]);
  });

  it("1 人だけ仮代行を入れた多担任コマは、残りの欠勤者が未割当のまま", () => {
    const { result } = setup({ unavailable: ["香川", "福江"] });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    expect(result.current.uncoveredSlots).toEqual([
      { slotId: 1, originalTeacher: "福江", date: SAT },
    ]);
  });
});

describe("useSubstitutionMode の保存", () => {
  it("同じ (日付, コマ, 元講師) の既存レコードを置き換え、理由メモは引き継ぐ", () => {
    const saveSubs = vi.fn();
    const existing = {
      id: 7,
      date: SAT,
      slotId: 1,
      originalTeacher: "香川",
      substitute: "",
      status: "requested",
      memo: "体調不良",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    };
    const other = { ...existing, id: 8, originalTeacher: "福江", memo: "出張" };
    const { result } = setup({ subs: [existing, other], saveSubs, unavailable: ["香川"] });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    let n;
    act(() => {
      n = result.current.saveAll();
    });
    expect(n).toBe(1);
    expect(saveSubs).toHaveBeenCalledTimes(1);
    const saved = saveSubs.mock.calls[0][0];
    // 福江の欠勤 (別件) はそのまま残る
    expect(saved.find((s) => s.id === 8)).toEqual(other);
    const replaced = saved.find((s) => s.id === 7);
    expect(replaced).toMatchObject({
      date: SAT,
      slotId: 1,
      originalTeacher: "香川",
      substitute: "西岡",
      status: "confirmed",
      memo: "体調不良",
      createdAt: existing.createdAt,
    });
    expect(replaced.updatedAt).not.toBe(existing.updatedAt);
    expect(saved).toHaveLength(2);
    expect(result.current.pendingSubs).toEqual([]);
  });

  it("新規レコードは memo 空で id を採番する", () => {
    const saveSubs = vi.fn();
    const { result } = setup({
      subs: [{ id: 3, date: "2026-09-12", slotId: 2, originalTeacher: "堀上", substitute: "西岡", status: "confirmed" }],
      saveSubs,
      unavailable: ["香川", "福江"],
    });
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    act(() => result.current.assignSubstitute(1, "福江", "杉原"));
    act(() => result.current.saveAll());
    const saved = saveSubs.mock.calls[0][0];
    expect(saved.map((s) => s.id)).toEqual([3, 4, 5]);
    expect(saved.slice(1).map((s) => [s.originalTeacher, s.substitute, s.memo])).toEqual([
      ["香川", "西岡", ""],
      ["福江", "杉原", ""],
    ]);
  });

  it("保存すると件数を toast で出す (ToastProvider が無ければ黙って保存)", () => {
    const pushed = [];
    const wrapper = ({ children }) => (
      <ToastProvider
        render={(list) => {
          pushed.splice(0, pushed.length, ...list);
          return null;
        }}
      >
        {children}
      </ToastProvider>
    );
    const { result } = renderHook(
      () =>
        useSubstitutionMode({
          slots: [PREP],
          subs: [],
          saveSubs: () => {},
          holidays: [],
          examPeriods: [],
          partTimeStaff: [],
          subjects: [],
          subjectCategories: [],
          timetables: [],
          biweeklyAnchors: [],
          teacherSubjects: {},
          unavailableTeachers: new Set(["香川", "福江"]),
        }),
      { wrapper }
    );
    act(() => result.current.setSubDate(SAT));
    act(() => result.current.assignSubstitute(1, "香川", "西岡"));
    act(() => result.current.assignSubstitute(1, "福江", "杉原"));
    act(() => result.current.saveAll());
    expect(pushed.map((t) => [t.tone, t.message])).toEqual([
      ["success", "代行 2 件を保存しました"],
    ]);

    // Provider なし (renderHook 既定) でも落ちない
    const bare = setup({ unavailable: ["香川"] });
    act(() => bare.result.current.setSubDate(SAT));
    act(() => bare.result.current.assignSubstitute(1, "香川", "西岡"));
    expect(() => act(() => bare.result.current.saveAll())).not.toThrow();
  });

  it("仮代行が無ければ何もしない", () => {
    const saveSubs = vi.fn();
    const { result } = setup({ saveSubs });
    act(() => result.current.setSubDate(SAT));
    let n;
    act(() => {
      n = result.current.saveAll();
    });
    expect(n).toBe(0);
    expect(saveSubs).not.toHaveBeenCalled();
  });
});

describe("useSubstitutionMode と特別時程", () => {
  it("部分休講 (cancelTimes) のコマは休講扱いで、代行対象にしない", () => {
    const { result } = setup({
      unavailable: ["堀上"],
      daySchedules: [
        { id: 1, date: SAT, targetGrades: ["中3"], label: "1限カット", cancelTimes: ["17:00-18:00"], timeMap: [] },
      ],
    });
    act(() => result.current.setSubDate(SAT));
    expect([...result.current.holidayOffSlots]).toEqual([2]);
    expect(result.current.uncoveredSlots).toEqual([]);
  });
});
