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
