// @vitest-environment jsdom
// 欠勤登録の時間割グリッドは「その日に有効な時間割のコマ」だけを出す。
// 曜日だけで絞っていた頃は、期切替で残してある旧期の時間割のコマが重なり、
// 同じクラスが 2 重・3 重に並んでいた (2026-08-20)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AbsenceWorkflowView } from "./AbsenceWorkflowView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

// 2026-09-21 は月曜。
const MON = "2026-09-21";

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", grades: [], startDate: "2026-04-07", endDate: "2026-09-14" },
  { id: 2, name: "2学期", type: "regular", grades: [], startDate: "2026-09-15", endDate: null },
];

const base = {
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "S",
  room: "501",
  subj: "理科",
  teacher: "滝澤",
  note: "",
};

// 同じコマが 1学期 / 2学期 の両方に存在する (期切替でコマは消さない仕様)。
const SLOTS = [
  { ...base, id: 1, timetableId: 1 },
  { ...base, id: 2, timetableId: 2 },
];

function renderView(props = {}) {
  return render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <AbsenceWorkflowView
          slots={SLOTS}
          subs={[]}
          adjustments={[]}
          sessionOverrides={[]}
          holidays={[]}
          examPeriods={[]}
          biweeklyAnchors={[]}
          classSets={[]}
          displayCutoff={{ groups: [], cohorts: [] }}
          partTimeStaff={[]}
          subjects={[]}
          timetables={TIMETABLES}
          saveSubs={vi.fn()}
          saveAdjustments={vi.fn()}
          saveSessionOverrides={vi.fn()}
          isAdmin
          initDate={MON}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe("AbsenceWorkflowView のコマ絞り込み", () => {
  it("旧期 (期間外) の時間割のコマを重ねて出さない", () => {
    renderView();
    // 教科名のカードは 2学期のコマ 1 枚だけ
    expect(screen.getAllByText("理科")).toHaveLength(1);
    // セクション見出しのコマ数も 1
    expect(screen.getByText("1コマ")).toBeTruthy();
  });

  it("旧期の期間内の日付なら旧期のコマだけを出す", () => {
    renderView({ initDate: "2026-09-07" }); // 月曜、1学期の期間内
    expect(screen.getAllByText("理科")).toHaveLength(1);
  });

  it("表示期間 (学年グループ) の開始日より前ならコマを出さず開講前と伝える", () => {
    renderView({
      displayCutoff: {
        groups: [{ label: "中学部", grades: ["中3"], startDate: "2026-10-01", date: null }],
        cohorts: [],
      },
    });
    expect(screen.getByText(/開講前/)).toBeTruthy();
    expect(screen.queryByText("理科")).toBeNull();
  });
});

describe("AbsenceWorkflowView の欠勤登録 (代行未定)", () => {
  it("欠勤する先生を選ぶと「欠勤にする」で代行未定の下書きを作れる", () => {
    const saveSubs = vi.fn();
    renderView({ saveSubs });

    // 先生を選ぶ → 対象件数つきのボタンが出る
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("滝澤", { selector: "input" }));
    const markBtn = screen.getByRole("button", { name: /欠勤にする/ });
    expect(markBtn.textContent).toContain("1 件");

    // ダイアログで対象コマを確認して登録
    fireEvent.click(markBtn);
    fireEvent.click(screen.getByRole("button", { name: /1 件を欠勤にする/ }));
    // 下書き 1 件 → 保存ボタンが出る (代行者が空でも件数に数える)
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    expect(saveSubs).toHaveBeenCalledTimes(1);
    const saved = saveSubs.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      date: MON,
      slotId: 2,
      originalTeacher: "滝澤",
      substitute: "",
      status: "requested",
    });
  });

  it("登録済みの欠勤はグリッドに「代行未定」として出る", () => {
    renderView({
      subs: [
        {
          id: 3,
          date: MON,
          slotId: 2,
          originalTeacher: "滝澤",
          substitute: "",
          status: "requested",
        },
      ],
    });
    // カードは「滝澤 ⇒ 代行未定」(チップは他と同じ 2 文字で「未定」)
    expect(screen.getByText("代行未定", { exact: false })).toBeTruthy();
    expect(screen.getByText("未定")).toBeTruthy();
  });
});

// プレップのように 1 コマを 3 人で担当するコマ。ここが「1 コマ 1 件」だと
// 2 人目の欠勤が登録できず、画面上も全員休みに見えていた (2026-08-21)。
describe("AbsenceWorkflowView の多担任コマ (プレップ)", () => {
  const PREP = {
    id: 5,
    day: "月",
    time: "18:30-20:00",
    grade: "中1-3",
    cls: "-",
    room: "亀73",
    subj: "英語·数学·理科",
    teacher: "香川·福江·川井",
    note: "",
    timetableId: 2,
  };

  function renderPrep(props = {}) {
    return renderView({ slots: [...SLOTS, PREP], ...props });
  }

  it("2 人が休むと (コマ, 講師) の 2 件になる", () => {
    const saveSubs = vi.fn();
    renderPrep({ saveSubs });
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("香川", { selector: "input" }));
    fireEvent.click(screen.getByLabelText("福江", { selector: "input" }));

    fireEvent.click(screen.getByRole("button", { name: /欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /2 件を欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    const saved = saveSubs.mock.calls[0][0];
    expect(
      saved.map((r) => [r.slotId, r.originalTeacher, r.substitute]).sort()
    ).toEqual([
      [5, "福江", ""],
      [5, "香川", ""],
    ]);
    // 出勤する川井のレコードは作らない
    expect(saved.some((r) => r.originalTeacher === "川井")).toBe(false);
  });

  it("すでに 1 人ぶん登録済みでも、別の講師の欠勤を足せる", () => {
    const saveSubs = vi.fn();
    renderPrep({
      saveSubs,
      subs: [
        {
          id: 7,
          date: MON,
          slotId: 5,
          originalTeacher: "香川",
          substitute: "",
          status: "requested",
        },
      ],
    });
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("福江", { selector: "input" }));
    // 香川は登録済みなので対象は福江の 1 件だけ
    fireEvent.click(screen.getByRole("button", { name: /欠勤にする \(1 件\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /1 件を欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    const saved = saveSubs.mock.calls[0][0];
    // 既存の香川のレコードは残したまま、福江を足す
    expect(saved.map((r) => r.originalTeacher).sort()).toEqual(["福江", "香川"]);
  });

  it("休む人だけ取消線を付け、出勤する講師はそのまま出す", () => {
    renderPrep({
      subs: [
        {
          id: 7,
          date: MON,
          slotId: 5,
          originalTeacher: "香川",
          substitute: "",
          status: "requested",
        },
      ],
    });
    // 「香川 ⇒ 代行未定 · 福江 · 川井」
    expect(screen.getByText("香川").style.textDecoration).toBe("line-through");
    expect(screen.getByText("福江").style.textDecoration).not.toBe("line-through");
    expect(screen.getByText("川井").style.textDecoration).not.toBe("line-through");
  });
});
