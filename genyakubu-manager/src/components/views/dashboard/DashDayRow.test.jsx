// @vitest-environment jsdom
// ダッシュボード日別行の振替表示: 他日から来るコマ (休講日でも出す) と
// 他日へ出ていくコマ (「振」バッジ)。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DashDayRow } from "./DashDayRow";

afterEach(cleanup);

// 2026-12-07 は月曜、2026-12-04 は金曜。
const MON = "2026-12-07";
const FRI = "2026-12-04";

const SLOT = {
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

const RESCHEDULE = {
  id: 9,
  date: MON,
  type: "reschedule",
  slotId: 1,
  targetDate: FRI,
};

function renderRow(props) {
  return render(
    <DashDayRow
      date={FRI}
      dow="金"
      holidays={[]}
      slots={[]}
      subs={[]}
      adjustments={[RESCHEDULE]}
      sessionCtx={{ allSlots: [SLOT] }}
      {...props}
    />
  );
}

describe("DashDayRow の振替表示", () => {
  it("他日から振り替えられてくるコマをバナーに出す", () => {
    renderRow();
    expect(screen.getByText("↻ 他の日から振替 (1件)")).toBeTruthy();
    expect(screen.getByText(`${MON} (月) から`)).toBeTruthy();
    expect(screen.getByText("中3S 数学")).toBeTruthy();
  });

  it("振替先が全日休講でもバナーは消さない", () => {
    renderRow({
      holidays: [{ id: 1, date: FRI, label: "創立記念日", scope: ["全部"] }],
    });
    // 休講日メッセージと振替バナーが両方出る
    expect(screen.getByText("休講日（創立記念日）")).toBeTruthy();
    expect(screen.getByText("↻ 他の日から振替 (1件)")).toBeTruthy();
  });

  it("振替元の日には「振」バッジを出す", () => {
    renderRow({ date: MON, dow: "月", slots: [SLOT] });
    const badge = screen.getByText("振");
    expect(badge.getAttribute("title")).toContain(FRI);
    // 他日から来るコマは無いのでバナーは出ない
    expect(screen.queryByText(/他の日から振替/)).toBeNull();
  });
});
