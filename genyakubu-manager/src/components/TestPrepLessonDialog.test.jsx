// @vitest-environment jsdom
// テスト対策の振替・追加授業ダイアログ: コースを選んで振替 / 追加授業を登録し、
// 一覧から直す・取り消す・元に戻す。
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TestPrepLessonDialog } from "./TestPrepLessonDialog";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

// 2026-10-12 は月曜、10-14 は水曜、10-15 は木曜。
const TODAY = "2026-10-12";

const mk = (id, day, time, extras = {}) => ({
  id,
  day,
  time,
  grade: "高2",
  cls: "",
  room: "亀62",
  subj: "高松桜井 英語",
  teacher: "石原",
  note: "",
  ...extras,
});

const SLOTS = [
  mk(1, "水", "19:00-20:20"),
  mk(2, "水", "20:30-21:50", { subj: "高松桜井 数学", teacher: "小見山" }),
  mk(3, "木", "19:00-20:20", { subj: "高松一 英語", room: "401" }),
  mk(4, "木", "17:00-18:00", { subj: "高松一 数学", teacher: "小見山", room: "亀21" }),
  mk(5, "水", "19:00-20:20", { grade: "中3", subj: "数学", teacher: "堀上", room: "亀63" }),
];

const CTX = {
  allSlots: SLOTS,
  classSets: [],
  timetables: [],
  displayCutoff: { groups: [] },
  daySchedules: [],
  biweeklyAnchors: [],
  holidays: [],
  examPeriods: [],
  isOffForGrade: () => false,
};

// 保存すると props が変わるよう、親で state を持つ
function Harness({ initialAdjustments = [], initialExtra = [], initialMode, onState }) {
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [extraLessons, setExtraLessons] = useState(initialExtra);
  onState?.({ adjustments, extraLessons });
  return (
    <TestPrepLessonDialog
      slots={SLOTS}
      adjustments={adjustments}
      extraLessons={extraLessons}
      sessionCtx={CTX}
      today={TODAY}
      initialMode={initialMode}
      saveAdjustments={setAdjustments}
      saveExtraLessons={setExtraLessons}
      onClose={() => {}}
    />
  );
}

function renderDialog(props = {}) {
  const state = { current: null };
  const utils = render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              <span>{t.message}</span>
              {t.action && (
                <button type="button" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    >
      <Harness {...props} onState={(s) => (state.current = s)} />
    </ToastProvider>
  );
  return { ...utils, state };
}

const click = (el) => fireEvent.click(el);
const pressed = (name) => screen.getByRole("button", { name, pressed: false });

function chooseSakuraiEnglish() {
  click(screen.getByRole("button", { name: "高2" }));
  click(screen.getByRole("button", { name: "高松桜井" }));
  const list = screen.getByRole("list", { name: "コース" });
  expect(within(list).getAllByRole("button")).toHaveLength(2);
  click(within(list).getByRole("button", { name: /高松桜井 英語/ }));
}

describe("TestPrepLessonDialog の振替", () => {
  it("10/14 の高2 桜井 英語を 10/15 の 17:00-18:00 に別の教室で振り替える", () => {
    const { state } = renderDialog();
    chooseSakuraiEnglish();
    click(screen.getByRole("button", { name: "10/14 (水)" }));
    click(screen.getByRole("button", { name: /翌日 10\/15/ }));
    fireEvent.change(screen.getByLabelText("時間"), { target: { value: "1700-1800" } });
    // 17:00 に使われている亀21 は「空き」から外れる (使用中も表示で出せる)
    expect(screen.queryByRole("button", { name: "亀21" })).toBeNull();
    click(pressed("亀63"));
    click(screen.getByRole("button", { name: "↻ 振替を登録" }));

    expect(state.current.adjustments).toHaveLength(1);
    expect(state.current.adjustments[0]).toMatchObject({
      date: "2026-10-14",
      type: "reschedule",
      slotId: 1,
      targetDate: "2026-10-15",
      targetTime: "17:00-18:00",
      targetRoom: "亀63",
      memo: "テスト対策",
    });
    expect(screen.getByText(/振替を登録しました/)).toBeTruthy();
    // 下の一覧に出る (振替先の日・教室・振替元)
    expect(screen.getByText(/← 10\/14 \(水\) 19:00-20:20 の分/)).toBeTruthy();
    expect(screen.getByText("@亀63")).toBeTruthy();

    // 元に戻す
    click(screen.getByRole("button", { name: "元に戻す" }));
    expect(state.current.adjustments).toHaveLength(0);
  });

  it("講師が重なる時間は警告を出す (登録は止めない)", () => {
    const { state } = renderDialog();
    chooseSakuraiEnglish();
    click(screen.getByRole("button", { name: "10/14 (水)" }));
    click(screen.getByRole("button", { name: /翌日 10\/15/ }));
    // 元の時間 (19:00-20:20) のままだと、10/15 の高松一 英語 (石原) と重なる
    expect(screen.getByText(/講師が重なります: 石原/)).toBeTruthy();
    click(screen.getByRole("button", { name: "↻ 振替を登録" }));
    expect(state.current.adjustments).toHaveLength(1);
  });

  it("振替元の日を選ぶまで登録できない (あと何が要るかを出す)", () => {
    renderDialog();
    chooseSakuraiEnglish();
    expect(screen.getByRole("button", { name: "↻ 振替を登録" }).disabled).toBe(true);
    expect(screen.getByText("振替元の日を選んでください")).toBeTruthy();
  });

  it("一覧の ✏️ で直すと、同じ振替を置き換える", () => {
    const { state } = renderDialog({
      initialAdjustments: [
        { id: 3, date: "2026-10-14", type: "reschedule", slotId: 1, targetDate: "2026-10-15", targetTime: "17:00-18:00", memo: "" },
      ],
    });
    chooseSakuraiEnglish();
    click(screen.getByRole("button", { name: /を直す$/ }));
    expect(screen.getByLabelText("時間").value).toBe("17:00-18:00");
    fireEvent.change(screen.getByLabelText("教室"), { target: { value: "亀63" } });
    click(screen.getByRole("button", { name: "振替を直す" }));
    expect(state.current.adjustments).toHaveLength(1);
    expect(state.current.adjustments[0]).toMatchObject({
      slotId: 1,
      targetDate: "2026-10-15",
      targetTime: "17:00-18:00",
      targetRoom: "亀63",
    });
  });

  it("振替登録済みの日を選ぶと、その振替先を読み込む (登録すると上書き)", () => {
    const { state } = renderDialog({
      initialAdjustments: [
        { id: 3, date: "2026-10-14", type: "reschedule", slotId: 1, targetDate: "2026-10-15", targetTime: "17:00-18:00", targetRoom: "亀63", memo: "" },
      ],
    });
    chooseSakuraiEnglish();
    click(screen.getByRole("button", { name: "10/14 (水) ↻10/15" }));
    expect(screen.getByLabelText("振替先の日").value).toBe("2026-10-15");
    expect(screen.getByLabelText("時間").value).toBe("17:00-18:00");
    expect(screen.getByLabelText("教室").value).toBe("亀63");
    expect(screen.getByText(/上書きします/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("時間"), { target: { value: "16:30-17:30" } });
    click(screen.getByRole("button", { name: "↻ 振替を登録" }));
    expect(state.current.adjustments).toHaveLength(1);
    expect(state.current.adjustments[0]).toMatchObject({
      targetTime: "16:30-17:30",
      targetRoom: "亀63",
    });
  });

  it("一覧の ✕ で取り消し、元に戻せる", () => {
    const { state } = renderDialog({
      initialAdjustments: [
        { id: 3, date: "2026-10-14", type: "reschedule", slotId: 1, targetDate: "2026-10-15", memo: "" },
      ],
    });
    chooseSakuraiEnglish();
    click(screen.getByRole("button", { name: /を取り消す$/ }));
    expect(state.current.adjustments).toHaveLength(0);
    click(screen.getByRole("button", { name: "元に戻す" }));
    expect(state.current.adjustments).toHaveLength(1);
  });
});

describe("TestPrepLessonDialog の追加授業", () => {
  it("コマを型にして、複数日の追加授業を登録する", () => {
    const { state } = renderDialog({ initialMode: "extra" });
    // 検索でも選べる (全角の学年も可)
    fireEvent.change(screen.getByLabelText("コースを検索"), { target: { value: "高２ 桜井 英語" } });
    click(screen.getByRole("button", { name: /高松桜井 英語/ }));
    fireEvent.change(screen.getByLabelText("実施日を追加"), { target: { value: "2026-10-17" } });
    fireEvent.change(screen.getByLabelText("実施日を追加"), { target: { value: "2026-10-16" } });
    fireEvent.change(screen.getByLabelText("時間"), { target: { value: "13:00-14:30" } });
    click(screen.getByRole("button", { name: "➕ 追加授業を 2 件登録" }));

    const list = state.current.extraLessons;
    expect(list.map((l) => l.date)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(list[0]).toMatchObject({
      time: "13:00-14:30",
      grade: "高2",
      subj: "高松桜井 英語",
      teacher: "石原",
      label: "テスト対策",
    });
    expect(screen.getByText(/追加授業を 2 件登録しました/)).toBeTruthy();
    click(screen.getByRole("button", { name: "元に戻す" }));
    expect(state.current.extraLessons).toHaveLength(0);
  });

  it("時間を入れるまでは登録できない", () => {
    renderDialog({ initialMode: "extra" });
    chooseSakuraiEnglish();
    fireEvent.change(screen.getByLabelText("実施日を追加"), { target: { value: "2026-10-17" } });
    expect(screen.getByText(/^時間を入れてください/)).toBeTruthy();
  });
});
