// @vitest-environment jsdom
// 欠勤登録の時間割グリッドは「その日に有効な時間割のコマ」だけを出す。
// 曜日だけで絞っていた頃は、期切替で残してある旧期の時間割のコマが重なり、
// 同じクラスが 2 重・3 重に並んでいた (2026-08-20)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// toastRender を渡すと通知を描く (「元に戻す」を押すテスト用)。保存で props が
// 変わる流れを試すときは viewTree を rerender に渡す
function renderView(props = {}, opts = {}) {
  return render(viewTree(props, opts));
}

function viewTree(props = {}, { toastRender = () => null } = {}) {
  return (
    <ToastProvider render={toastRender}>
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

describe("AbsenceWorkflowView の下書きの通知 (onDirtyChange)", () => {
  // 下書きを 1 件作る共通手順 (欠勤する先生を選んで「欠勤にする」)
  // (保存後は先生が選ばれたままなので、2 回目は選択を飛ばす)
  function makeDraft() {
    const placeholder = screen.queryByText("(クリックして選択)");
    if (placeholder) {
      fireEvent.click(placeholder);
      fireEvent.click(screen.getByLabelText("滝澤", { selector: "input" }));
    }
    fireEvent.click(screen.getByRole("button", { name: /欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /1 件を欠勤にする/ }));
  }

  it("編集で件数 (1)、破棄で 0 を親へ知らせる", async () => {
    const onDirtyChange = vi.fn();
    renderView({ onDirtyChange });
    // マウント直後は下書きなし
    expect(onDirtyChange).toHaveBeenLastCalledWith(0);
    makeDraft();
    expect(onDirtyChange).toHaveBeenLastCalledWith(1);
    // 破棄 → 確認ダイアログで OK
    fireEvent.click(screen.getByRole("button", { name: "破棄" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "破棄" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(0));
  });

  it("保存でも 0 に戻り、アンマウントでも 0 を送る", () => {
    const onDirtyChange = vi.fn();
    const { unmount } = renderView({ onDirtyChange });
    makeDraft();
    expect(onDirtyChange).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(0);
    makeDraft();
    expect(onDirtyChange).toHaveBeenLastCalledWith(1);
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(0);
  });
});

describe("AbsenceWorkflowView のコマ休講", () => {
  it("「コマを休講にする」で時刻より前のコマを選んで cancel 調整を保存できる", () => {
    const saveAdjustments = vi.fn();
    const saveSubs = vi.fn();
    const slots = [
      { ...base, id: 2, timetableId: 2, time: "13:00-14:20", subj: "数学" },
      { ...base, id: 3, timetableId: 2, time: "15:30-16:50", subj: "英語" },
    ];
    renderView({
      slots,
      saveAdjustments,
      saveSubs,
      // 同じコマの代行未定は休講と同時に解除される
      subs: [
        { id: 9, date: MON, slotId: 2, originalTeacher: "滝澤", substitute: "", status: "requested" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /コマを休講にする/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("時刻で選ぶ:"), {
      target: { value: "15:30" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /より前に始まるコマを選ぶ/ }));
    fireEvent.change(within(dialog).getByLabelText("理由メモ:"), {
      target: { value: "学校行事" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /1 コマを休講にする/ }));

    // 下書きのカードは「休講 (下書き)」
    expect(screen.getByText("休講 (下書き)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    const saved = saveAdjustments.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ date: MON, type: "cancel", slotId: 2, memo: "学校行事" });
    // 休講にしたコマの代行未定は消える
    expect(saveSubs).toHaveBeenCalledTimes(1);
    expect(saveSubs.mock.calls[0][0]).toEqual([]);
  });

  it("保存済みのコマ休講はグリッドに「休講」として出て、右クリックで取り消せる", () => {
    const saveAdjustments = vi.fn();
    renderView({
      saveAdjustments,
      adjustments: [{ id: 4, date: MON, type: "cancel", slotId: 2, memo: "台風" }],
    });
    const card = screen.getByRole("button", { name: /理科（休講、台風）/ });
    fireEvent.contextMenu(card);
    fireEvent.click(screen.getByText("休講を取り消す"));
    expect(screen.getByText(/解除予定: 1 件/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    expect(saveAdjustments.mock.calls[0][0]).toEqual([]);
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

// 日付の前後送りと、欠勤する先生の一覧の「この日に担当あり」グループ
// (2026-09-12)。
describe("AbsenceWorkflowView の日付ナビと先生の絞り込み", () => {
  it("← 前 / 次 → で 1 日ずつ動く", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "次 →" }));
    expect(screen.getByLabelText("対象日:").value).toBe("2026-09-22");
    fireEvent.click(screen.getByRole("button", { name: "← 前" }));
    expect(screen.getByLabelText("対象日:").value).toBe(MON);
  });

  it("日曜は飛ばす (土曜の「次 →」で月曜、月曜の「← 前」で土曜)", () => {
    renderView({ initDate: "2026-09-26" }); // 土曜
    fireEvent.click(screen.getByRole("button", { name: "次 →" }));
    expect(screen.getByLabelText("対象日:").value).toBe("2026-09-28");
    fireEvent.click(screen.getByRole("button", { name: "← 前" }));
    expect(screen.getByLabelText("対象日:").value).toBe("2026-09-26");
  });

  it("← / → キーでも日付を送れる (日曜は飛ばす)", () => {
    renderView({ initDate: "2026-09-26" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByLabelText("対象日:").value).toBe("2026-09-28");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByLabelText("対象日:").value).toBe("2026-09-26");
  });

  it("コマをクリックすると右クリックと同じ操作メニューが開く (タッチ端末向け)", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /^19:00-20:20 中3 S 理科/ }));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("この日に担当のある先生を先頭のグループに出し、名前で絞れる", () => {
    renderView({ partTimeStaff: [{ name: "河野", subjectIds: [] }] });
    fireEvent.click(screen.getByText("(クリックして選択)"));
    const onDay = screen.getByRole("group", { name: /この日に担当あり \(1\)/ });
    expect(within(onDay).getByLabelText("滝澤", { selector: "input" })).toBeTruthy();
    const others = screen.getByRole("group", { name: /その他 \(1\)/ });
    expect(within(others).getByLabelText("河野", { selector: "input" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("欠勤する先生を名前で絞り込み"), {
      target: { value: "河" },
    });
    expect(screen.queryByLabelText("滝澤", { selector: "input" })).toBeNull();
    expect(screen.getByLabelText("河野", { selector: "input" })).toBeTruthy();
  });
});

describe("AbsenceWorkflowView の欠勤登録の理由メモ", () => {
  it("ダイアログのメモが下書き → 保存レコードに入る", () => {
    const saveSubs = vi.fn();
    renderView({ saveSubs });
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("滝澤", { selector: "input" }));
    fireEvent.click(screen.getByRole("button", { name: /欠勤にする/ }));
    fireEvent.change(screen.getByLabelText("理由メモ:"), { target: { value: "学校行事" } });
    fireEvent.click(screen.getByRole("button", { name: /1 件を欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(saveSubs.mock.calls[0][0][0]).toMatchObject({
      originalTeacher: "滝澤",
      substitute: "",
      status: "requested",
      memo: "学校行事",
    });
  });
});

describe("AbsenceWorkflowView の日付ジャンプ (initDate) と下書き", () => {
  function makeDraft() {
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("滝澤", { selector: "input" }));
    fireEvent.click(screen.getByRole("button", { name: /欠勤にする/ }));
    fireEvent.click(screen.getByRole("button", { name: /1 件を欠勤にする/ }));
  }
  const NEXT_MON = "2026-09-28";

  it("下書きがある状態で別の日へジャンプすると確認を出し、キャンセルなら日付も下書きも保つ", async () => {
    const onConsumeInitDate = vi.fn();
    const { rerender } = renderView({ onConsumeInitDate });
    makeDraft();
    expect(screen.getByRole("button", { name: /保存/ })).toBeInTheDocument();
    const dateInput = screen.getByDisplayValue(MON);
    rerender(
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <AbsenceWorkflowView
            slots={SLOTS} subs={[]} adjustments={[]} sessionOverrides={[]} holidays={[]}
            examPeriods={[]} biweeklyAnchors={[]} classSets={[]}
            displayCutoff={{ groups: [], cohorts: [] }} partTimeStaff={[]} subjects={[]}
            timetables={TIMETABLES} saveSubs={vi.fn()} saveAdjustments={vi.fn()}
            saveSessionOverrides={vi.fn()} isAdmin initDate={NEXT_MON}
            onConsumeInitDate={onConsumeInitDate}
          />
        </ConfirmProvider>
      </ToastProvider>
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/下書きが 1 件あります。破棄して 2026-09-28 \(月\) へ移動しますか/);
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(dateInput.value).toBe(MON);
    expect(screen.getByRole("button", { name: /保存/ })).toBeInTheDocument();
    // ジャンプ要求は消費済み (もう一度同じ日付を頼まれても再び聞かない)
    expect(onConsumeInitDate).toHaveBeenCalled();
  });

  it("下書きが無ければ確認なしで日付を切り替える", () => {
    const onConsumeInitDate = vi.fn();
    const { rerender } = renderView({ onConsumeInitDate });
    rerender(
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <AbsenceWorkflowView
            slots={SLOTS} subs={[]} adjustments={[]} sessionOverrides={[]} holidays={[]}
            examPeriods={[]} biweeklyAnchors={[]} classSets={[]}
            displayCutoff={{ groups: [], cohorts: [] }} partTimeStaff={[]} subjects={[]}
            timetables={TIMETABLES} saveSubs={vi.fn()} saveAdjustments={vi.fn()}
            saveSessionOverrides={vi.fn()} isAdmin initDate={NEXT_MON}
            onConsumeInitDate={onConsumeInitDate}
          />
        </ConfirmProvider>
      </ToastProvider>
    );
    expect(screen.getByDisplayValue(NEXT_MON)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConsumeInitDate).toHaveBeenCalled();
  });

  it("「玉突き代行で探す」は下書きがあれば保存してから開く (キャンセルなら留まる)", async () => {
    const saveSubs = vi.fn();
    const onOpenChainSubstitution = vi.fn();
    renderView({ saveSubs, onOpenChainSubstitution });
    makeDraft();
    fireEvent.click(screen.getByRole("button", { name: /玉突き代行で探す/ }));
    let dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/下書きが 1 件あります。保存してから玉突き代行を開きますか/);
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(saveSubs).not.toHaveBeenCalled();
    expect(onOpenChainSubstitution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /玉突き代行で探す/ }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "保存して開く" }));
    await waitFor(() => expect(onOpenChainSubstitution).toHaveBeenCalledWith(MON));
    expect(saveSubs).toHaveBeenCalledTimes(1);
  });

  it("下書きが無ければ「玉突き代行で探す」はそのまま開く", () => {
    const onOpenChainSubstitution = vi.fn();
    renderView({ onOpenChainSubstitution });
    fireEvent.click(screen.getByRole("button", { name: /玉突き代行で探す/ }));
    expect(onOpenChainSubstitution).toHaveBeenCalledWith(MON);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// 10/16 (金) の高1 文系・理系の数学を、高1・2 が休みの 10/9 (金) へ振り替え、
// 10/9 の画面で合同にする (振替先での合同、combineWith)。振替で入るコマは
// 時間割のセルに通常のコマと同じカードで並ぶ (2026-10-10)。
describe("AbsenceWorkflowView の振替で入るコマ", () => {
  const FRI_TT = [{ id: 1, name: "通年", type: "regular", grades: [], startDate: "2026-04-01", endDate: null }];
  const fri = { day: "金", time: "19:00-20:20", room: "", subj: "数学", note: "", timetableId: 1 };
  const slots = [
    { ...fri, id: 1, grade: "高1", cls: "文系", room: "301", teacher: "香川" },
    { ...fri, id: 2, grade: "高1", cls: "理系", room: "302", teacher: "福江" },
    { ...fri, id: 3, grade: "高1", cls: "文系", room: "301", time: "20:30-21:50", subj: "英語", teacher: "河野" },
  ];
  const holidays = [
    { id: 1, date: "2026-10-09", label: "高校休み", scope: ["高校部"], targetGrades: ["高1", "高2"], subjKeywords: [] },
  ];
  const adjustments = [
    { id: 10, type: "reschedule", date: "2026-10-16", slotId: 1, targetDate: "2026-10-09" },
    { id: 11, type: "reschedule", date: "2026-10-16", slotId: 2, targetDate: "2026-10-09" },
  ];
  const combineWith = { date: "2026-10-16", slotId: 1 };
  const base1009 = { slots, holidays, timetables: FRI_TT, initDate: "2026-10-09" };
  const card = (re) => screen.getByRole("button", { name: re });
  const toastRender = (toasts) => (
    <div>
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
  );

  it("振替で入るコマは時間割のセルにカードで並び、同じコマの休講カードは出さない", () => {
    renderView({ ...base1009, adjustments });
    expect(card(/19:00-20:20 高1 文系 数学 香川 （振替で入るコマ）/)).toBeTruthy();
    expect(card(/19:00-20:20 高1 理系 数学 福江 （振替で入るコマ）/)).toBeTruthy();
    expect(screen.getAllByText("← 10/16 (金) から振替")).toHaveLength(2);
    // 同じセルの「休講」カードは隠れ、振り替えていない英語は休講のまま
    expect(screen.getAllByText("数学")).toHaveLength(2);
    expect(screen.getAllByText("英語")).toHaveLength(1);
    expect(screen.getByText("3コマ / 振替 +2")).toBeTruthy();
  });

  it("カードのメニューから合同にすると、吸収する側の振替に combineWith を付けて保存し、元に戻せる", () => {
    const saveAdjustments = vi.fn();
    renderView({ ...base1009, adjustments, saveAdjustments }, { toastRender });
    fireEvent.click(card(/高1 文系 数学 香川 （振替で入るコマ）/));
    fireEvent.click(screen.getByText(/合同にする: 高1理系 数学/));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    const next = saveAdjustments.mock.calls[0][0](adjustments);
    // 相手は振替元の日とコマで指す (id は再利用されうる)
    expect(next.find((a) => a.id === 11).combineWith).toEqual(combineWith);
    expect(next.find((a) => a.id === 10).combineWith).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    const undone = saveAdjustments.mock.calls[1][0](next);
    expect("combineWith" in undone.find((a) => a.id === 11)).toBe(false);
  });

  it("合同にした振替は 1 枚のカードにまとまり (吸収された側のセルは空)、メニューから外せる", () => {
    const saveAdjustments = vi.fn();
    const combined = [adjustments[0], { ...adjustments[1], combineWith }];
    renderView({ ...base1009, adjustments: combined, saveAdjustments });
    expect(card(/高1 文系 数学 香川 （振替で入るコマ、合同）/)).toBeTruthy();
    expect(screen.getByText("+ 高1理系 数学 (合同)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /高1 理系 数学 福江/ })).toBeNull();
    // 理系の休講カードも出さない (授業は合同で行う)
    expect(screen.getAllByText("数学")).toHaveLength(1);
    // 上の帯のチップにも出る
    expect(screen.getByText("→ 高1文系 数学 に合同")).toBeTruthy();
    fireEvent.click(card(/高1 文系 数学 香川 （振替で入るコマ、合同）/));
    fireEvent.click(screen.getByText("合同を外す: 高1理系 数学"));
    const next = saveAdjustments.mock.calls[0][0](combined);
    expect("combineWith" in next.find((a) => a.id === 11)).toBe(false);
  });

  it("上の帯のチップからも同じメニューを開ける", () => {
    const saveAdjustments = vi.fn();
    renderView({ ...base1009, adjustments, saveAdjustments });
    fireEvent.click(screen.getByRole("button", { name: "高1文系 数学 の振替 (操作)" }));
    fireEvent.click(screen.getByText(/合同にする: 高1理系 数学/));
    const next = saveAdjustments.mock.calls[0][0](adjustments);
    expect(next.find((a) => a.id === 11).combineWith).toEqual(combineWith);
  });

  it("「振替先の担当・時刻を変更…」で担当を変えるとその場で保存し、元に戻せる", () => {
    const saveAdjustments = vi.fn();
    renderView({ ...base1009, adjustments, saveAdjustments }, { toastRender });
    fireEvent.click(card(/高1 文系 数学 香川 （振替で入るコマ）/));
    fireEvent.click(screen.getByText("振替先の担当・時刻を変更…"));
    // 振替元の日の回数補正には触らない
    expect(screen.queryByText(/元日付の回数カウントから外す/)).toBeNull();
    fireEvent.change(screen.getByDisplayValue("(元担当 香川 のまま)"), {
      target: { value: "河野" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    const next = saveAdjustments.mock.calls[0][0](adjustments);
    const edited = next.find((a) => a.id === 10);
    expect(edited).toMatchObject({ id: 10, targetDate: "2026-10-09", targetTeacher: "河野" });
    // 元のコマと同じ時刻は持たない (振替元の表示に時刻を増やさない)
    expect("targetTime" in edited).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(saveAdjustments.mock.calls[1][0](next).find((a) => a.id === 10)).toEqual(adjustments[0]);
  });

  it("振替先の日を変えたら、振替先での合同は外す", () => {
    const saveAdjustments = vi.fn();
    const combined = [adjustments[0], { ...adjustments[1], combineWith }];
    renderView({ ...base1009, adjustments: combined, saveAdjustments });
    fireEvent.click(screen.getByRole("button", { name: "高1理系 数学 の振替 (操作)" }));
    fireEvent.click(screen.getByText("振替先の担当・時刻を変更…"));
    // 画面の対象日とピッカーの振替先の日が並ぶので、後から開いたピッカーの方
    fireEvent.change(screen.getAllByDisplayValue("2026-10-09").at(-1), {
      target: { value: "2026-10-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const next = saveAdjustments.mock.calls[0][0](combined);
    const moved = next.find((a) => a.id === 11);
    expect(moved.targetDate).toBe("2026-10-10");
    expect("combineWith" in moved).toBe(false);
  });

  it("「振替を取り消す」は元に戻せる削除。振替元の日のカウント外が残ることを知らせる", () => {
    const saveAdjustments = vi.fn();
    const props = {
      ...base1009,
      adjustments,
      saveAdjustments,
      sessionOverrides: [
        { id: 1, date: "2026-10-16", slotId: 1, mode: "skip", memo: "振替に伴う skip" },
      ],
    };
    const { rerender } = renderView(props, { toastRender });
    fireEvent.click(card(/高1 文系 数学 香川 （振替で入るコマ）/));
    fireEvent.click(screen.getByText("振替を取り消す"));
    const afterRemove = saveAdjustments.mock.calls[0][0];
    expect(afterRemove.map((a) => a.id)).toEqual([11]);
    expect(screen.getByText(/10\/16 \(金\) の回数補正「カウント外」は残っています/)).toBeTruthy();
    // 保存が画面に返ってきた後で「元に戻す」(戻すのは消えたままのときだけ)
    rerender(viewTree({ ...props, adjustments: afterRemove }, { toastRender }));
    expect(screen.queryByRole("button", { name: /高1 文系 数学 香川 （振替で入るコマ/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(saveAdjustments.mock.calls[1][0].map((a) => a.id).sort()).toEqual([10, 11]);
  });

  it("「振替元の日を開く」でその日へ移る", () => {
    renderView({ ...base1009, adjustments });
    fireEvent.click(card(/高1 文系 数学 香川 （振替で入るコマ）/));
    fireEvent.click(screen.getByText("振替元の日 (10/16 (金)) を開く"));
    expect(screen.getByDisplayValue("2026-10-16")).toBeTruthy();
  });

  it("振替で入るコマも講師の重なりと欠勤の印に入る", () => {
    // 10/9 の 19:00 に香川の中3 のコマもある (振替で入る文系数学と重なる)
    const chu3 = { ...fri, id: 4, grade: "中3", cls: "S", room: "501", subj: "理科", teacher: "香川" };
    renderView({ ...base1009, slots: [...slots, chu3], adjustments });
    expect(card(/高1 文系 数学 香川 （振替で入るコマ、講師重複/)).toBeTruthy();
    expect(card(/中3 S 理科 香川 （講師重複/)).toBeTruthy();
    // 欠勤する先生に選ぶと、振替で入るコマにも ❗欠勤
    fireEvent.click(screen.getByText("(クリックして選択)"));
    fireEvent.click(screen.getByLabelText("香川", { selector: "input" }));
    expect(card(/高1 文系 数学 香川 （欠勤、振替で入るコマ/)).toBeTruthy();
  });

  // 振替元の日 (10/16) で吸収された側の振替を開き直して「適用」しても、
  // 振替先の日が同じなら合同は外れない (保存し直すと新しい振替になるため)
  it("振替元の日で振替先の日を変えない振替の変更では、振替先での合同を引き継ぐ", () => {
    const saveAdjustments = vi.fn();
    renderView({
      slots,
      timetables: FRI_TT,
      adjustments: [adjustments[0], { ...adjustments[1], combineWith }],
      saveAdjustments,
      initDate: "2026-10-16",
    });
    fireEvent.contextMenu(screen.getByRole("button", { name: /高1 理系 数学/ }));
    fireEvent.click(screen.getByText("振替を変更…"));
    const confirmWarn = screen.queryByLabelText("上記を確認した");
    if (confirmWarn) fireEvent.click(confirmWarn);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    const saved = saveAdjustments.mock.calls[0][0];
    const ri = saved.filter((a) => a.type === "reschedule" && a.slotId === 2);
    expect(ri).toHaveLength(1);
    expect(ri[0].id).not.toBe(11); // 登録し直し
    expect(ri[0]).toMatchObject({ targetDate: "2026-10-09", combineWith });
  });
});

// 9/9 (水) は高1・高2 休講。ただし高2 高松一 物理は授業あり (休講日の例外、
// Holiday.excludeSlotIds)。休講日で休みのカードから例外にできる (2026-10-16)。
// 休講日は下書きに入らないので、その場で保存して「元に戻す」を出す
describe("AbsenceWorkflowView の休講日の例外 (この日はこのコマだけ授業あり)", () => {
  const WED = "2026-09-09";
  const WED_TT = [{ id: 1, name: "通年", type: "regular", grades: [], startDate: "2026-04-01", endDate: null }];
  const wed = { day: "水", time: "19:00-20:20", note: "", timetableId: 1 };
  const slots = [
    { ...wed, id: 11, grade: "高2", cls: "高松一", room: "301", subj: "物理", teacher: "滝澤" },
    { ...wed, id: 12, grade: "高2", cls: "高松二", room: "302", subj: "英語", teacher: "河野" },
    { ...wed, id: 13, grade: "中3", cls: "S", room: "501", subj: "理科", teacher: "藤田" },
  ];
  const holiday = {
    id: 1,
    date: WED,
    label: "高1・高2 休講",
    scope: ["高校部"],
    targetGrades: ["高1", "高2"],
    subjKeywords: [],
  };
  const toastRender = (toasts) => (
    <div>
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
  );
  const base = { slots, timetables: WED_TT, initDate: WED };

  it("休講日で休みのカードを押すと休講日の例外にでき、その場で保存して元に戻せる", () => {
    const saveHolidays = vi.fn();
    renderView({ ...base, holidays: [holiday], saveHolidays }, { toastRender });
    fireEvent.click(screen.getByRole("button", { name: /高2 高松一 物理（休講）/ }));
    fireEvent.click(screen.getByText("この日はこのコマだけ授業あり（休講日の例外にする）"));

    expect(saveHolidays).toHaveBeenCalledTimes(1);
    const next = saveHolidays.mock.calls[0][0]([holiday]);
    expect(next[0].excludeSlotIds).toEqual([11]);
    // 休講日は下書きに入らない (未保存バーを出さない)
    expect(screen.queryByRole("region", { name: "未保存の下書き" })).toBeNull();
    expect(screen.getByText(/高2高松一 物理 を休講日「高1・高2 休講」の例外にしました/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    const undone = saveHolidays.mock.calls[1][0](next);
    expect("excludeSlotIds" in undone[0]).toBe(false);
  });

  it("例外のコマは印つきの通常のカードになり、「休講日どおり休講に戻す」で戻せる", () => {
    const saveHolidays = vi.fn();
    const excepted = { ...holiday, excludeSlotIds: [11] };
    renderView({ ...base, holidays: [excepted], saveHolidays }, { toastRender });
    // 物理は授業ありのカード (印つき)、英語は休講のまま
    const card = screen.getByRole("button", { name: /高2 高松一 物理 滝澤 （休講日の例外）/ });
    expect(within(card).getByText("休講日の例外 (「高1・高2 休講」。この日は授業あり)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /高2 高松二 英語（休講）/ })).toBeTruthy();
    // 上の帯にも例外のコマを添える
    expect(screen.getByText("例外 (授業あり): 高2高松一 物理")).toBeTruthy();

    fireEvent.click(card);
    fireEvent.click(screen.getByText("休講日どおり休講に戻す"));
    expect(saveHolidays).toHaveBeenCalledTimes(1);
    const next = saveHolidays.mock.calls[0][0]([excepted]);
    expect("excludeSlotIds" in next[0]).toBe(false);
    expect(screen.getByText(/を休講日「高1・高2 休講」どおり休講に戻しました/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(saveHolidays.mock.calls[1][0](next)[0].excludeSlotIds).toEqual([11]);
  });

  it("例外のコマに下書きがあるときは休講日どおりに戻せない (下書きが見えないまま保存されるため)", () => {
    const saveHolidays = vi.fn();
    renderView({ ...base, holidays: [{ ...holiday, excludeSlotIds: [11] }], saveHolidays });
    const card = () => screen.getByRole("button", { name: /高2 高松一 物理 滝澤/ });
    fireEvent.click(card());
    fireEvent.click(screen.getByText("❗ 代行未定のまま欠勤にする"));
    fireEvent.click(card());
    const item = screen.getByRole("menuitem", { name: /休講日どおり休講に戻す/ });
    expect(item).toBeDisabled();
    expect(item.textContent).toMatch(/先にこのコマの下書きを片付けてください/);
    expect(saveHolidays).not.toHaveBeenCalled();
  });

  it("テスト期間でも止まっているコマは、例外にしてもテスト期間のままと知らせ、そこから戻せる", () => {
    const saveHolidays = vi.fn();
    const examPeriods = [
      { id: 1, name: "高2 中間", startDate: WED, endDate: WED, targetGrades: ["高2"], stopsClasses: true },
    ];
    renderView({ ...base, holidays: [holiday], examPeriods, saveHolidays }, { toastRender });
    fireEvent.click(screen.getByRole("button", { name: /高2 高松一 物理（休講）/ }));
    fireEvent.click(screen.getByText("この日はこのコマだけ授業あり（休講日の例外にする）"));
    expect(screen.getByText(/テスト期間のため、この日の授業は止まったままです/)).toBeTruthy();
  });

  it("例外にしたがテスト期間で止まっているコマは「テスト期間」のカードから休講日どおりに戻せる", () => {
    const saveHolidays = vi.fn();
    const examPeriods = [
      { id: 1, name: "高2 中間", startDate: WED, endDate: WED, targetGrades: ["高2"], stopsClasses: true },
    ];
    renderView({
      ...base,
      holidays: [{ ...holiday, excludeSlotIds: [11] }],
      examPeriods,
      saveHolidays,
    });
    const card = screen.getByRole("button", { name: /高2 高松一 物理（テスト期間）/ });
    expect(within(card).getByText(/休講日の例外/)).toBeTruthy();
    fireEvent.click(card);
    fireEvent.click(screen.getByText("休講日どおり休講に戻す"));
    expect(saveHolidays).toHaveBeenCalledTimes(1);
  });

  it("休講日を保存できないとき (saveHolidays なし) は休講のカードを押せないまま", () => {
    renderView({ ...base, holidays: [holiday] });
    expect(screen.queryByRole("button", { name: /高2 高松一 物理（休講）/ })).toBeNull();
    expect(screen.getAllByText("休講").length).toBeGreaterThan(0);
  });
});

// コマ休講などの下書きを「保存」せずに離れていた (2026-10-16)。右下の小さな
// 浮きボタンは狭い画面や通知に隠れて見落とされるので、下書きがある間は画面下に
// 固定の未保存バーを出す。離れる操作 (日付の変更・同じ画面の中のジャンプ・
// タブを閉じる) は確認を通す。
describe("AbsenceWorkflowView の未保存バーと離れるときの確認", () => {
  const toastRender = (toasts) => (
    <div>
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
  );
  // この日のコマを全部「コマ休講」の下書きにする
  function draftCancelAll() {
    fireEvent.click(screen.getByRole("button", { name: /コマを休講にする/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "全部選ぶ" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /\d+ コマを休講にする/ }));
  }

  it("下書きがある間だけ画面下に未保存バー (件数・内訳・保存・破棄) を出し、紙面には載せない", () => {
    const saveAdjustments = vi.fn();
    renderView({ saveAdjustments });
    expect(screen.queryByRole("region", { name: "未保存の下書き" })).toBeNull();
    draftCancelAll();
    const bar = screen.getByRole("region", { name: "未保存の下書き" });
    expect(bar.className).toContain("no-print");
    expect(within(bar).getByText("未保存の下書き 1 件")).toBeTruthy();
    expect(within(bar).getByText("コマ休講 1")).toBeTruthy();
    // バーの高さを CSS 変数に書く (本文の下の余白・通知の位置がこれを見る)
    expect(document.documentElement.style.getPropertyValue("--app-bottom-bar-height")).not.toBe("");
    fireEvent.click(within(bar).getByRole("button", { name: "1 件の変更を保存" }));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    expect(saveAdjustments.mock.calls[0][0][0]).toMatchObject({ type: "cancel", slotId: 2 });
    expect(screen.queryByRole("region", { name: "未保存の下書き" })).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--app-bottom-bar-height")).toBe("");
  });

  it("コマ休講の下書きを作ると、まだ保存されていないと通知し、通知からも保存できる", () => {
    const saveAdjustments = vi.fn();
    renderView({ saveAdjustments }, { toastRender });
    draftCancelAll();
    expect(screen.getByText(/1 コマを休講の下書きにしました。まだ保存されていません/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "今すぐ保存" }));
    expect(saveAdjustments).toHaveBeenCalledTimes(1);
    expect(saveAdjustments.mock.calls[0][0][0]).toMatchObject({ type: "cancel", slotId: 2 });
  });

  it("画面を離れた後に通知の「今すぐ保存」を押しても、捨てた下書きを保存しない", () => {
    const saveAdjustments = vi.fn();
    let actions = [];
    const capture = (toasts) => {
      actions = toasts.filter((t) => t.action).map((t) => t.action);
      return null;
    };
    const { rerender } = renderView({ saveAdjustments }, { toastRender: capture });
    draftCancelAll();
    expect(actions.length).toBe(1);
    // 欠勤組み換えをアンマウント (別の画面へ移った)
    rerender(
      <ToastProvider render={capture}>
        <ConfirmProvider>
          <div />
        </ConfirmProvider>
      </ToastProvider>
    );
    actions[0].onClick();
    expect(saveAdjustments).not.toHaveBeenCalled();
  });

  it("日付欄を変えると確認が出て、キャンセルなら日付も下書きも保つ (OK なら破棄して移る)", async () => {
    renderView();
    draftCancelAll();
    const input = screen.getByLabelText("対象日:");
    fireEvent.change(input, { target: { value: "2026-09-22" } });
    let dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/下書きが 1 件あります。破棄して 2026-09-22 \(火\) へ変更しますか/);
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("対象日:").value).toBe(MON);
    expect(screen.getByRole("region", { name: "未保存の下書き" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "次 →" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "破棄して変更" }));
    await waitFor(() => expect(screen.getByLabelText("対象日:").value).toBe("2026-09-22"));
    expect(screen.queryByRole("region", { name: "未保存の下書き" })).toBeNull();
  });

  it("同じ画面の中のジャンプ (振替元の日を開く) も下書きがあれば確認する", async () => {
    const FRI_TT = [{ id: 1, name: "通年", type: "regular", grades: [], startDate: "2026-04-01", endDate: null }];
    const fri = { day: "金", time: "19:00-20:20", subj: "数学", note: "", timetableId: 1 };
    const slots = [
      { ...fri, id: 1, grade: "高1", cls: "文系", room: "301", teacher: "香川" },
      { ...fri, id: 3, grade: "高1", cls: "文系", room: "301", time: "20:30-21:50", subj: "英語", teacher: "河野" },
    ];
    renderView({
      slots,
      timetables: FRI_TT,
      initDate: "2026-10-09",
      adjustments: [{ id: 10, type: "reschedule", date: "2026-10-16", slotId: 1, targetDate: "2026-10-09" }],
    });
    // 英語 (通常のコマ) を休講の下書きにする
    fireEvent.click(screen.getByRole("button", { name: /20:30-21:50 高1 文系 英語/ }));
    fireEvent.click(screen.getByText("🚫 このコマを休講にする"));
    expect(screen.getByText("休講 (下書き)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /高1 文系 数学 香川 （振替で入るコマ）/ }));
    fireEvent.click(screen.getByText("振替元の日 (10/16 (金)) を開く"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/下書きが 1 件あります/);
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("対象日:").value).toBe("2026-10-09");
    expect(screen.getByText("休講 (下書き)")).toBeTruthy();
  });

  it("下書きがある間はタブを閉じる・再読み込みで警告する (beforeunload)", () => {
    renderView();
    const fire = () => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(fire()).toBe(false);
    draftCancelAll();
    expect(fire()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1 件の変更を保存" }));
    expect(fire()).toBe(false);
  });
});
