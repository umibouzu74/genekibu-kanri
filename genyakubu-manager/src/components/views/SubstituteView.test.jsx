// @vitest-environment jsdom
// 授業管理 (SubstituteView):
//  - ＋ 新規代行 で来月の日付を登録すると、当月の月フィルタで一覧から消えて
//    「登録できなかった」ように見えていた (2026-09-15)。登録後は月フィルタを
//    その月へ動かす (「すべて」は動かさない)
//  - 時間割表タブ (代行モード) に特別時程を渡す
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SubstituteView } from "./SubstituteView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

// 月フィルタの既定はシステム時刻の当月なので、相対で組む
function ym(offsetMonths) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const THIS_MONTH = ym(0);
const NEXT_MONTH = ym(1);

const SLOT = {
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "-",
  room: "301",
  subj: "数学",
  teacher: "田中",
  note: "",
};
const sub = (over) => ({
  id: 1,
  date: `${THIS_MONTH}-05`,
  slotId: 1,
  originalTeacher: "田中",
  substitute: "西岡",
  status: "confirmed",
  memo: "",
  ...over,
});

function renderView(props = {}) {
  const onNew = vi.fn();
  const utils = render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <SubstituteView
          subs={[]}
          slots={[SLOT]}
          holidays={[]}
          partTimeStaff={[]}
          onNew={onNew}
          onEdit={() => {}}
          onDel={() => {}}
          onQuickUpdate={() => {}}
          onGoToStaffView={() => {}}
          isAdmin
          saveSubs={() => {}}
          examPeriods={[]}
          subjects={[]}
          subjectCategories={[]}
          timetables={[]}
          biweeklyAnchors={[]}
          teacherSubjects={{}}
          classSets={[]}
          displayCutoff={null}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  const rerenderWith = (next) =>
    utils.rerender(
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <SubstituteView
            subs={[]}
            slots={[SLOT]}
            holidays={[]}
            partTimeStaff={[]}
            onNew={onNew}
            onEdit={() => {}}
            onDel={() => {}}
            onQuickUpdate={() => {}}
            onGoToStaffView={() => {}}
            isAdmin
            saveSubs={() => {}}
            examPeriods={[]}
            subjects={[]}
            subjectCategories={[]}
            timetables={[]}
            biweeklyAnchors={[]}
            teacherSubjects={{}}
            classSets={[]}
            displayCutoff={null}
            {...props}
            {...next}
          />
        </ConfirmProvider>
      </ToastProvider>
    );
  return { ...utils, onNew, rerenderWith };
}

const monthInput = () => screen.getByLabelText("月");

describe("SubstituteView の新規代行と月フィルタ", () => {
  it("この画面から来月の代行を登録したら (createdSubs)、月フィルタをその月へ動かして一覧に出す", () => {
    const { rerenderWith } = renderView();
    expect(monthInput().value).toBe(THIS_MONTH);
    const created = [sub({ id: 9, date: `${NEXT_MONTH}-03` })];
    // App 側のフォームが保存して subs が増え、作ったレコードが createdSubs で届く
    rerenderWith({ subs: created, createdSubs: created });
    expect(monthInput().value).toBe(NEXT_MONTH);
    expect(within(screen.getByRole("table")).getByText("西岡")).toBeInTheDocument();
  });

  it("当月の代行なら月フィルタは動かさない", () => {
    const { rerenderWith } = renderView();
    const created = [sub({ id: 9, date: `${THIS_MONTH}-20` })];
    rerenderWith({ subs: created, createdSubs: created });
    expect(monthInput().value).toBe(THIS_MONTH);
    expect(within(screen.getByRole("table")).getByText("西岡")).toBeInTheDocument();
  });

  it("他端末の同期で subs が増えただけ (createdSubs なし) なら動かさない", () => {
    const { rerenderWith } = renderView();
    rerenderWith({ subs: [sub({ id: 9, date: `${NEXT_MONTH}-03` })] });
    expect(monthInput().value).toBe(THIS_MONTH);
  });

  it("「すべて」(月フィルタ空) はそのまま", () => {
    const { rerenderWith } = renderView({ subs: [sub({ id: 1 })] });
    fireEvent.change(monthInput(), { target: { value: "" } });
    const created = [sub({ id: 9, date: `${NEXT_MONTH}-03` })];
    rerenderWith({ subs: [sub({ id: 1 }), ...created], createdSubs: created });
    expect(monthInput().value).toBe("");
  });

  it("＋ 新規代行 と空表示の ＋ 代行を登録 はどちらも onNew を呼ぶ", () => {
    const { onNew } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規代行" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 代行を登録" }));
    expect(onNew).toHaveBeenCalledTimes(2);
  });
});

describe("SubstituteView の時間割表タブ (代行モード)", () => {
  it("特別時程を渡し、代行日を入れると 移/休 とバナーが出る", () => {
    // 2026-07-13 は月曜
    const MON = "2026-07-13";
    const { container } = renderView({
      slots: [SLOT, { ...SLOT, id: 2, time: "20:30-21:50", room: "302", teacher: "佐藤" }],
      daySchedules: [
        {
          id: 1,
          date: MON,
          targetGrades: ["中3"],
          label: "行事",
          cancelTimes: ["19:00-20:20"],
          timeMap: [{ from: "20:30-21:50", to: "20:00-20:50" }],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "時間割表" }));
    fireEvent.change(container.querySelector('input[type="date"]'), {
      target: { value: MON },
    });
    expect(screen.getByText("⏰ 特別時程")).toBeInTheDocument();
    expect(screen.getByText("休")).toBeInTheDocument();
    expect(screen.getByText("移")).toBeInTheDocument();
  });
});

// 代行一覧の並び替え (対象日 / 登録が新しい順) と 📅 の配線 (2026-09-15)。
// 並び順の state はこの画面が持つ (CSV も同じ順で出すため)
describe("SubstituteView の代行一覧の並び替えと日付ジャンプ", () => {
  const SUBS = [
    sub({ id: 1, date: `${THIS_MONTH}-05`, createdAt: "2026-09-01T10:00:00.000Z", memo: "A" }),
    sub({ id: 2, date: `${THIS_MONTH}-20`, createdAt: "2026-09-03T10:00:00.000Z", memo: "B" }),
    sub({ id: 3, date: `${THIS_MONTH}-12`, createdAt: "2026-09-02T10:00:00.000Z", memo: "C" }),
  ];
  it("既定は対象日昇順。見出しクリックで登録が新しい順、もう一度で戻る", () => {
    renderView({ subs: SUBS });
    const dates = () =>
      screen.getAllByRole("row").slice(1).map((r) => r.textContent.slice(0, 10));
    expect(dates()).toEqual([`${THIS_MONTH}-05`, `${THIS_MONTH}-12`, `${THIS_MONTH}-20`]);
    fireEvent.click(screen.getByRole("columnheader", { name: /作成日時/ }));
    expect(dates()).toEqual([`${THIS_MONTH}-20`, `${THIS_MONTH}-12`, `${THIS_MONTH}-05`]);
    fireEvent.click(screen.getByRole("columnheader", { name: /作成日時/ }));
    expect(dates()).toEqual([`${THIS_MONTH}-05`, `${THIS_MONTH}-12`, `${THIS_MONTH}-20`]);
  });

  it("🚑 は onJumpToAbsenceFlow に日付を渡す", () => {
    const onJumpToAbsenceFlow = vi.fn();
    renderView({ subs: SUBS, onJumpToAbsenceFlow });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${THIS_MONTH}-12 .*の欠勤組み換えを開く$`) })
    );
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith(`${THIS_MONTH}-12`);
  });
});

describe("SubstituteView の講師・代行者フィルタ", () => {
  it("多担任コマの講師欄は 1 人ずつの選択肢に分け、選ぶとその人の代行が出る", () => {
    const PREP = { ...SLOT, id: 2, teacher: "香川·福江·川井", subj: "プレップ" };
    renderView({
      slots: [SLOT, PREP],
      subs: [sub({ id: 5, slotId: 2, originalTeacher: "福江", substitute: "" , status: "requested" })],
    });
    const select = screen.getByLabelText("講師・代行者");
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(["香川", "福江", "川井"]));
    expect(values).not.toContain("香川·福江·川井");
    fireEvent.change(select, { target: { value: "福江" } });
    expect(screen.getByText("1 / 1 件表示")).toBeInTheDocument();
  });

  it("時間割に居ない代行者 (直接入力した名前) も選べる", () => {
    renderView({ subs: [sub({ substitute: "臨時講師" })] });
    const values = [...screen.getByLabelText("講師・代行者").querySelectorAll("option")].map(
      (o) => o.value
    );
    expect(values).toContain("臨時講師");
  });
});
