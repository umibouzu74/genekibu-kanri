// @vitest-environment jsdom
// 週間ビューの「直近2週間のイベント」に休講を出す。曜日マスは日付を持たない
// ので休講バッジは立たない = ここに出さないと週間ビューのどこにも出ない。
// 部門 / 学年 / 教科の読み方はダッシュボードと同じ (makeEventHelpers)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeekView } from "./WeekView";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 11, 1, 12, 0, 0)); // 2026-12-01 (火) → 窓は 12/1〜12/15
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const MON_SLOT = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "S",
  room: "602",
  subj: "数学",
  teacher: "堀上",
  note: "",
};

function renderWeek(props = {}) {
  return render(
    <WeekView
      teacher="堀上"
      slots={[MON_SLOT]}
      subs={[]}
      adjustments={[]}
      allSlots={[MON_SLOT]}
      classSets={[]}
      biweeklyAnchors={[]}
      sessionOverrides={[]}
      holidays={[]}
      examPeriods={[]}
      displayCutoff={null}
      timetables={[]}
      {...props}
    />
  );
}

describe("WeekView の直近 2 週間の休講", () => {
  it("自分のコマに当たる休講を 🚫 付きで出す (当たるコマも添える)", () => {
    renderWeek({
      holidays: [{ id: 1, date: "2026-12-07", label: "創立記念日", scope: ["全部"] }],
    });
    expect(screen.getByText("直近2週間のイベント:")).toBeTruthy();
    const chip = screen.getByTitle(/創立記念日/);
    expect(chip.textContent).toContain("🚫 創立記念日");
    expect(chip.textContent).toContain("中3S 数学");
    expect(chip.textContent).toContain("2026-12-07");
  });

  it("部門が違う休講 (高校部だけ) は中学部のコマには当たらないので出さない", () => {
    renderWeek({
      holidays: [{ id: 1, date: "2026-12-07", label: "高校休講", scope: ["高校部"] }],
    });
    expect(screen.queryByText(/高校休講/)).toBeNull();
  });

  it("学年で絞った休講は対象学年のコマにだけ当たる", () => {
    const mid1 = { ...MON_SLOT, id: 2, grade: "中1", cls: "A", subj: "英語" };
    renderWeek({
      slots: [MON_SLOT, mid1],
      allSlots: [MON_SLOT, mid1],
      holidays: [
        { id: 1, date: "2026-12-07", label: "中1休み", scope: ["全部"], targetGrades: ["中1"] },
      ],
    });
    const chip = screen.getByTitle(/中1休み/);
    expect(chip.textContent).toContain("中1A 英語");
    expect(chip.textContent).not.toContain("中3S 数学");
  });

  it("14 日より先の休講と、自分のコマが無い曜日の休講は出さない", () => {
    renderWeek({
      holidays: [
        { id: 1, date: "2026-12-21", label: "冬休み", scope: ["全部"] },
        { id: 2, date: "2026-12-09", label: "水曜休講", scope: ["全部"] },
      ],
    });
    expect(screen.queryByText("直近2週間のイベント:")).toBeNull();
  });

  it("時間割の有効期間外・終講後の日の休講は出さない (その日に実施されないコマ)", () => {
    const ttSlot = { ...MON_SLOT, timetableId: "t1" };
    // 12/7 (月) の休講。時間割は 12/5 で終わっているので 12/7 のコマは無い
    const { unmount } = renderWeek({
      slots: [ttSlot],
      allSlots: [ttSlot],
      timetables: [{ id: "t1", name: "前期", startDate: "2026-04-01", endDate: "2026-12-05" }],
      holidays: [{ id: 1, date: "2026-12-07", label: "創立記念日", scope: ["全部"] }],
    });
    expect(screen.queryByText("直近2週間のイベント:")).toBeNull();
    unmount();
    // 表示期間設定 (学年グループの終了日) が 12/5 でも同じ
    renderWeek({
      displayCutoff: { groups: [{ id: "g", label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-12-05" }] },
      holidays: [{ id: 1, date: "2026-12-07", label: "創立記念日", scope: ["全部"] }],
    });
    expect(screen.queryByText("直近2週間のイベント:")).toBeNull();
  });

  it("隔週コマは休講日の担当週の講師にだけ出す", () => {
    const bi = { ...MON_SLOT, id: 3, subj: "英/数", note: "隔週(河野)" };
    const anchors = [{ date: "2026-12-07", weekType: "A" }];
    // 12/7 は A 週 → 堀上の担当 → 出る
    const { unmount } = renderWeek({
      slots: [bi],
      allSlots: [bi],
      biweeklyAnchors: anchors,
      holidays: [{ id: 1, date: "2026-12-07", label: "創立記念日", scope: ["全部"] }],
    });
    expect(screen.getByTitle(/創立記念日/)).toBeTruthy();
    unmount();
    // 12/14 は B 週 → 河野の担当 → 堀上には出さない
    renderWeek({
      slots: [bi],
      allSlots: [bi],
      biweeklyAnchors: anchors,
      holidays: [{ id: 2, date: "2026-12-14", label: "B週の休講", scope: ["全部"] }],
    });
    expect(screen.queryByTitle(/B週の休講/)).toBeNull();
  });
});
