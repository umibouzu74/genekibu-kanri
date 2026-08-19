// @vitest-environment jsdom
// 日まるごと振替ダイアログ: 対象コマの抽出・除外・一括登録・一括解除。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DayRescheduleDialog } from "./DayRescheduleDialog";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

// 2026-12-07 は月曜、2026-12-04 は金曜。
const MON = "2026-12-07";
const FRI = "2026-12-04";

const mk = (id, day, time, extras = {}) => ({
  id,
  day,
  time,
  grade: "中3",
  cls: "S",
  room: "602",
  subj: "数学",
  teacher: "堀上",
  note: "",
  ...extras,
});

const SLOTS = [
  mk(1, "月", "19:00-20:20"),
  mk(2, "月", "20:30-21:50", { subj: "英語", teacher: "河野", room: "603" }),
  mk(3, "金", "19:00-20:20", { subj: "国語", teacher: "藤田", room: "701" }),
];

function renderDialog(props = {}) {
  const saveAdjustments = props.saveAdjustments || vi.fn();
  const utils = render(
    <ToastProvider render={() => null}>
      <DayRescheduleDialog
        slots={SLOTS}
        adjustments={[]}
        sessionCtx={{
          allSlots: SLOTS,
          classSets: [],
          timetables: [],
          displayCutoff: { groups: [] },
          daySchedules: [],
          biweeklyAnchors: [],
          holidays: [],
          examPeriods: [],
          isOffForGrade: () => false,
        }}
        isAdmin
        saveAdjustments={saveAdjustments}
        onClose={vi.fn()}
        {...props}
      />
    </ToastProvider>
  );
  return { ...utils, saveAdjustments };
}

function setDates(source, target) {
  fireEvent.change(screen.getByLabelText("振替元日"), {
    target: { value: source },
  });
  if (target) {
    fireEvent.change(screen.getByLabelText("振替先日"), {
      target: { value: target },
    });
  }
}

describe("DayRescheduleDialog", () => {
  it("振替元日を選ぶとその曜日のコマだけが対象に並ぶ", () => {
    renderDialog();
    setDates(MON);
    expect(screen.getByText("振替するコマ 2 / 2")).toBeTruthy();
    expect(screen.getByText("19:00-20:20")).toBeTruthy();
    expect(screen.getByText("20:30-21:50")).toBeTruthy();
    // 金曜のコマは対象外
    expect(screen.queryByText("国語")).toBeNull();
  });

  it("選択したコマぶんの振替をまとめて登録する", () => {
    const { saveAdjustments } = renderDialog();
    setDates(MON, FRI);
    fireEvent.change(screen.getByLabelText("メモ (任意)"), {
      target: { value: "12/7 → 12/4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "2 コマを振り替える" }));

    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    const saved = saveAdjustments.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved.map((a) => a.slotId)).toEqual([1, 2]);
    expect(
      saved.every(
        (a) =>
          a.type === "reschedule" &&
          a.date === MON &&
          a.targetDate === FRI &&
          a.memo === "12/7 → 12/4"
      )
    ).toBe(true);
  });

  it("チェックを外したコマは登録しない", () => {
    const { saveAdjustments } = renderDialog();
    setDates(MON, FRI);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText("振替するコマ 1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 コマを振り替える" }));
    expect(saveAdjustments.mock.calls[0][0].map((a) => a.slotId)).toEqual([1]);
  });

  it("開いた直後は赤字のエラーを出さない", () => {
    renderDialog();
    expect(screen.queryByText("振替元日を選んでください")).toBeNull();
    expect(screen.queryByText("振替先日を選んでください")).toBeNull();
    expect(screen.getByRole("button", { name: "振り替える" }).disabled).toBe(true);
  });

  it("振替先が未入力なら実行できない", () => {
    renderDialog();
    setDates(MON);
    expect(screen.getByText("振替先日を選んでください")).toBeTruthy();
    expect(screen.getByRole("button", { name: "振り替える" }).disabled).toBe(true);
  });

  it("振替先の重なりを対象コマの行に出す", () => {
    // 金曜 19:00 に堀上がいる状態で、月曜 19:00 の堀上のコマを金曜へ移す
    const slots = [mk(1, "月", "19:00-20:20"), mk(3, "金", "19:00-20:20", { room: "701" })];
    renderDialog({
      slots,
      sessionCtx: {
        allSlots: slots,
        classSets: [],
        timetables: [],
        displayCutoff: { groups: [] },
        daySchedules: [],
        biweeklyAnchors: [],
        holidays: [],
        examPeriods: [],
        isOffForGrade: () => false,
      },
    });
    setDates(MON, FRI);
    expect(screen.getByText(/講師重複/)).toBeTruthy();
    expect(screen.getByText(/重なりが 1 コマで見つかりました/)).toBeTruthy();
  });

  it("休講で実施されないコマは理由つきで対象外に落とす", () => {
    renderDialog({
      sessionCtx: {
        allSlots: SLOTS,
        classSets: [],
        timetables: [],
        displayCutoff: { groups: [] },
        daySchedules: [],
        biweeklyAnchors: [],
        holidays: [],
        examPeriods: [],
        isOffForGrade: (d) => d === MON,
      },
    });
    setDates(MON, FRI);
    expect(screen.getByText(/対象外のコマ 2 件/)).toBeTruthy();
    expect(screen.getAllByText("休講・テスト期間")).toHaveLength(2);
    expect(screen.getByText("振替元日に実施されるコマがありません")).toBeTruthy();
  });

  it("登録済みの振替をまとめて解除できる", () => {
    const onRemoveAdjustments = vi.fn();
    renderDialog({
      adjustments: [
        { id: 5, date: MON, type: "reschedule", slotId: 1, targetDate: FRI },
        { id: 6, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
      ],
      onRemoveAdjustments,
    });
    setDates(MON);
    fireEvent.click(screen.getByRole("button", { name: "まとめて解除" }));
    expect(onRemoveAdjustments).toHaveBeenCalledWith([5, 6]);
  });
});
