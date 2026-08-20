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
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
    expect(screen.getByText("中3S 数学")).toBeTruthy();
  });

  it("振替先が全日休講でもバナーは消さない", () => {
    renderRow({
      holidays: [{ id: 1, date: FRI, label: "創立記念日", scope: ["全部"] }],
    });
    // 休講日メッセージと振替バナーが両方出る
    expect(screen.getByText("休講日（創立記念日）")).toBeTruthy();
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
  });

  it("振替元が複数の日にまたがっても日付ごとにまとめる", () => {
    const other = { ...SLOT, id: 2, day: "水", time: "18:00-19:20", subj: "英語" };
    renderRow({
      slots: [],
      adjustments: [
        RESCHEDULE,
        { id: 10, date: "2026-12-02", type: "reschedule", slotId: 2, targetDate: FRI },
      ],
      sessionCtx: { allSlots: [SLOT, other] },
    });
    expect(screen.getByText("↻ 2026-12-02 (水) から振替 (1件)")).toBeTruthy();
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
  });

  it("振替元の日には「振」バッジと行き先を出す", () => {
    renderRow({ date: MON, dow: "月", slots: [SLOT] });
    const badge = screen.getByText("振");
    expect(badge.getAttribute("title")).toContain(FRI);
    // どこへ移したかをカード上でも出す (バッジの tooltip だけにしない)
    expect(screen.getByText(`→ ${FRI} (金) へ振替`)).toBeTruthy();
    // 他日から来るコマは無いのでバナーは出ない
    expect(screen.queryByText(/から振替/)).toBeNull();
  });

  it("その日のコマが全部出ていったら日単位で「振替で休み」と伝える", () => {
    const other = { ...SLOT, id: 2, time: "20:30-21:50", subj: "英語" };
    renderRow({
      date: MON,
      dow: "月",
      slots: [SLOT, other],
      adjustments: [
        RESCHEDULE,
        { id: 10, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
      ],
      sessionCtx: { allSlots: [SLOT, other] },
    });
    expect(
      screen.getByText(`↻ この日の授業は 2 コマとも ${FRI} (金) へ振替済み`)
    ).toBeTruthy();
  });

  it("1 コマでも残っていれば「振替で休み」とは言わない", () => {
    const stays = { ...SLOT, id: 2, time: "20:30-21:50", subj: "英語" };
    renderRow({
      date: MON,
      dow: "月",
      slots: [SLOT, stays],
      sessionCtx: { allSlots: [SLOT, stays] },
    });
    expect(screen.queryByText(/振替済み/)).toBeNull();
  });
});
