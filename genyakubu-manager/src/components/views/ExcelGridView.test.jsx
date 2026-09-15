// @vitest-environment jsdom
// ダッシュボード時間割モードの表示期間フィルタ: 終講日後・時間割適用期間外の
// コマを表示しないこと (日別リストと同じ判定) を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ExcelGridView } from "./ExcelGridView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

// 2026-07-13 は月曜日。テストは viewDate 固定なのでシステム時刻に依存しない。
const MONDAY = "2026-07-13";

const slot = (overrides) => ({
  id: 1,
  day: "月",
  time: "19:00-20:20",
  grade: "中3",
  cls: "-",
  room: "301",
  subj: "数学",
  teacher: "田中",
  note: "",
  ...overrides,
});

// 破棄の確認 (useConfirm) と保存の toast (useOptionalToasts) を本番と同じ
// Provider の中で描く。toast は render に溜めて検証できるようにする
function renderGrid(props = {}, { toastSink } = {}) {
  return render(
    <ToastProvider
      render={(list) => {
        if (toastSink) toastSink.splice(0, toastSink.length, ...list);
        return null;
      }}
    >
      <ConfirmProvider>
        <ExcelGridView
          slots={[]}
          saveSlots={() => {}}
          biweeklyAnchors={[]}
          isAdmin={false}
          timetables={[]}
          partTimeStaff={[]}
          subjects={[]}
          subs={[]}
          saveSubs={() => {}}
          holidays={[]}
          examPeriods={[]}
          subjectCategories={[]}
          teacherSubjects={{}}
          classSets={[]}
          displayCutoff={null}
          viewDate={MONDAY}
          dashboardMode
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

// 代行モードに入る (enableSubMode の日付入力へ日付を入れる)
function enterSubMode(container, dateStr) {
  const input = container.querySelector('input[type="date"]');
  fireEvent.change(input, { target: { value: dateStr } });
}

describe("ExcelGridView (ダッシュボード表示期間フィルタ)", () => {
  it("終講日を過ぎた学年グループのコマは表示しない (他グループは表示)", () => {
    renderGrid({
      slots: [
        slot({ id: 1, grade: "中3", teacher: "田中" }),
        slot({ id: 2, grade: "高3", subj: "高松西 英語", room: "701", teacher: "佐藤" }),
      ],
      displayCutoff: {
        groups: [
          { grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" },
          { grades: ["高3"], startDate: "2026-04-01", date: "2026-07-31" },
        ],
      },
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(screen.getByText("佐藤")).toBeInTheDocument();
  });

  it("コホート別終講日を過ぎたコースのコマだけ表示しない", () => {
    renderGrid({
      slots: [
        slot({ id: 1, grade: "中3", teacher: "田中" }),
        slot({ id: 2, grade: "中1", teacher: "鈴木" }),
      ],
      displayCutoff: {
        groups: [{ grades: ["中1", "中3"], startDate: "2026-04-01", date: "2026-07-31" }],
        cohorts: [{ id: "M|中3|月木", date: "2026-07-10" }],
      },
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(screen.getByText("鈴木")).toBeInTheDocument();
  });

  it("全日休講の日でも、他日から振り替えられてくるコマはバナーに出す", () => {
    // 12/7 (月) の授業を 12/4 (金、全日休講) へ振り替えた状態。
    // 全日休講ではセクションを描かないので、バナーが無いと画面から消える。
    renderGrid({
      viewDate: "2026-12-04",
      slots: [
        slot({ id: 1, day: "月", teacher: "田中" }),
        // 金曜にもコマがある (曜日タブが立つ = 12/4 を表示できる)
        slot({ id: 2, day: "金", teacher: "佐藤" }),
      ],
      adjustments: [
        {
          id: 9,
          date: "2026-12-07",
          type: "reschedule",
          slotId: 1,
          targetDate: "2026-12-04",
        },
      ],
      holidays: [
        { id: 1, date: "2026-12-04", label: "創立記念日", scope: ["全部"] },
      ],
    });
    expect(screen.getByText("本日休講")).toBeInTheDocument();
    expect(screen.getByText("↻ 2026-12-07 (月) から振替 (1件)")).toBeInTheDocument();
    expect(screen.getByText("田中")).toBeInTheDocument();
  });

  it("その日のコマが全部よそへ行ったら「振替で休み」のバナーを出す", () => {
    // 12/7 (月) の 2 コマをまるごと 12/4 へ振り替えた状態を 12/7 側から見る。
    renderGrid({
      viewDate: "2026-12-07",
      slots: [
        slot({ id: 1, day: "月", teacher: "田中" }),
        slot({ id: 2, day: "月", time: "20:30-21:50", room: "302", teacher: "佐藤" }),
      ],
      adjustments: [
        { id: 9, date: "2026-12-07", type: "reschedule", slotId: 1, targetDate: "2026-12-04" },
        { id: 10, date: "2026-12-07", type: "reschedule", slotId: 2, targetDate: "2026-12-04" },
      ],
    });
    expect(
      screen.getByText("↻ この日の授業は 2 コマとも 2026-12-04 (金) へ振替済み")
    ).toBeInTheDocument();
    // セルにも行き先を出す (バッジの tooltip だけにしない)
    expect(screen.getAllByText("→ 12/4 へ振替")).toHaveLength(2);
  });

  it("1 コマでも残る日は「振替で休み」とは言わない", () => {
    renderGrid({
      viewDate: "2026-12-07",
      slots: [
        slot({ id: 1, day: "月", teacher: "田中" }),
        slot({ id: 2, day: "月", time: "20:30-21:50", room: "302", teacher: "佐藤" }),
      ],
      adjustments: [
        { id: 9, date: "2026-12-07", type: "reschedule", slotId: 1, targetDate: "2026-12-04" },
      ],
    });
    expect(screen.queryByText(/振替済み/)).not.toBeInTheDocument();
    expect(screen.getByText("→ 12/4 へ振替")).toBeInTheDocument();
  });

  it("全グループが期間外の日は未確定バナーを出しコマを表示しない", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" }],
      },
    });
    expect(screen.getByText("この日以降の予定は未確定です")).toBeInTheDocument();
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
  });

  it("時間割の適用期間外のコマは表示せず案内を出す", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      timetables: [
        { id: 1, name: "通常", startDate: "2026-04-01", endDate: "2026-07-10", grades: [] },
      ],
      activeTimetableId: 1,
    });
    expect(screen.queryByText("田中")).not.toBeInTheDocument();
    expect(
      screen.getByText("表示期間外のため、この日に表示するコマはありません")
    ).toBeInTheDocument();
  });

  it("表示期間内のコマは通常どおり表示する", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      timetables: [
        { id: 1, name: "通常", startDate: "2026-04-01", endDate: "2026-07-31", grades: [] },
      ],
      activeTimetableId: 1,
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-31" }],
      },
    });
    expect(screen.getByText("田中")).toBeInTheDocument();
  });

  // 期切替 (1学期 → 2学期) の直後は、表示中の時間割 (activeTimetableId) が
  // 新しい期を指したまま切替日より前の日を開くことがある。ダッシュボードは
  // 日付でどの時間割が有効かを決めるので、セレクタでは絞らない。
  it("ダッシュボードでは表示日に有効な時間割のコマを出す (表示中の時間割で絞らない)", () => {
    renderGrid({
      slots: [
        slot({ id: 1, grade: "中3", teacher: "田中", timetableId: 1 }),
        slot({ id: 2, grade: "中3", cls: "A", teacher: "鈴木", timetableId: 2 }),
      ],
      timetables: [
        { id: 1, name: "2026 1学期", startDate: "2026-04-01", endDate: "2026-08-31", grades: [] },
        { id: 2, name: "2026 2学期", startDate: "2026-09-01", endDate: null, grades: [] },
      ],
      // セレクタは新しい期を指しているが、表示日 (7/13) は 1学期の範囲
      activeTimetableId: 2,
    });
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(screen.queryByText("鈴木")).not.toBeInTheDocument();
  });

  it("非ダッシュボードモード (マスター表示) では終講日後もフィルタしない", () => {
    renderGrid({
      slots: [slot({ id: 1, grade: "中3", teacher: "田中" })],
      displayCutoff: {
        groups: [{ grades: ["中3"], startDate: "2026-04-01", date: "2026-07-10" }],
      },
      dashboardMode: false,
      isAdmin: true,
    });
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(
      screen.queryByText("この日以降の予定は未確定です")
    ).not.toBeInTheDocument();
  });
});

// ─── 全曜日まとめ印刷 ────────────────────────────────────────────────
// 曜日タブ右の「🖨 全曜日」。コマのある曜日を順に描画してスナップショット
// した HTML を popup へ書き出す (popup 生成は utils/printWindow)。
describe("ExcelGridView (欠勤・代行の表示)", () => {
  const SUB = {
    id: 1,
    date: MONDAY,
    slotId: 1,
    originalTeacher: "田中",
    substitute: "",
    status: "requested",
  };

  it("代行者が未定の欠勤も「欠」バッジ + 代行未定で出す", () => {
    renderGrid({ slots: [slot({})], subs: [SUB] });
    expect(screen.getByText("欠")).toBeTruthy();
    expect(screen.getByText("代行未定")).toBeTruthy();
  });

  it("代行者が決まっていれば従来どおり「代」バッジ + 代行者名", () => {
    renderGrid({
      slots: [slot({})],
      subs: [{ ...SUB, substitute: "佐藤", status: "confirmed" }],
    });
    expect(screen.getByText("代")).toBeTruthy();
    expect(screen.getByText("← 佐藤")).toBeTruthy();
    expect(screen.queryByText("代行未定")).toBeNull();
  });
});

describe("ExcelGridView (全曜日まとめ印刷)", () => {
  // popup の代わり。document.write された HTML を溜めて検証する。
  // 実際のブラウザと同じく、close() 済みのドキュメントへの write は
  // 暗黙に open し直して空にする (準備中画面 → 紙面の置き換え)。
  // getElementById は準備中画面の進捗更新が呼ぶ (ここでは要素を持たない)
  function fakeWindow() {
    let chunks = [];
    let closedDoc = false;
    return {
      html: () => chunks.join(""),
      closed: false,
      document: {
        write: (s) => {
          if (closedDoc) {
            chunks = [];
            closedDoc = false;
          }
          chunks.push(s);
        },
        close: () => {
          closedDoc = true;
        },
        getElementById: () => null,
      },
      print: vi.fn(),
      close: vi.fn(),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("コマのある全曜日を曜日ブロックに分けて popup へ書き出す", async () => {
    const w = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(w);
    renderGrid({
      slots: [
        slot({ id: 1, day: "月", teacher: "田中" }),
        slot({ id: 2, day: "水", teacher: "佐藤" }),
      ],
    });
    fireEvent.click(screen.getByLabelText("全曜日をまとめて印刷"));
    // 先に準備中画面が書かれるので、紙面 (曜日ブロック) が書き出されるまで待つ
    await waitFor(() => expect(w.html()).toContain('class="excel-print-day"'));
    const html = w.html();
    expect(html).not.toContain("準備しています");
    // 月・水の 2 ブロック (火はコマが無いので出さない)
    expect(html.match(/<section class="excel-print-day">/g)).toHaveLength(2);
    // MONDAY = 2026-07-13 の週なので、月 = 07/13・水 = 07/15
    expect(html).toContain("2026年07月13日（月）");
    expect(html).toContain("2026年07月15日（水）");
    expect(html).not.toContain("2026年07月14日（火）");
    // 各曜日の担当がその曜日のブロックに入っている
    expect(html.indexOf("田中")).toBeLessThan(html.indexOf("佐藤"));
    // 中学/高校のセクションヘッダ + 曜日ごとの改ページ CSS
    expect(html).toContain("中学の時間割");
    expect(html).toContain(".excel-print-day{break-before:page");
  });

  it("印刷後は画面の表示曜日が元に戻る", async () => {
    const w = fakeWindow();
    vi.spyOn(window, "open").mockReturnValue(w);
    renderGrid({
      slots: [
        slot({ id: 1, day: "月", teacher: "田中" }),
        slot({ id: 2, day: "水", teacher: "佐藤" }),
      ],
    });
    fireEvent.click(screen.getByLabelText("全曜日をまとめて印刷"));
    // 全曜日ぶんの差し替えが終わる (= popup へ紙面を書き出す) まで待つ
    await waitFor(() => expect(w.html()).toContain('class="excel-print-day"'));
    // viewDate (月曜) のグリッドに戻っている
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(screen.queryByText("佐藤")).not.toBeInTheDocument();
  });

  it("コマが 1 つも無ければ押せない", () => {
    renderGrid({ slots: [] });
    expect(screen.getByLabelText("全曜日をまとめて印刷")).toBeDisabled();
  });

  it("ポップアップがブロックされたら印刷せず終わる", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderGrid({ slots: [slot({ id: 1, day: "月", teacher: "田中" })] });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("全曜日をまとめて印刷"));
    });
    // 画面は元のまま (曜日の差し替えが残らない)
    expect(screen.getByText("田中")).toBeInTheDocument();
  });
});

describe("ExcelGridView (講師の同時刻の重なり)", () => {
  // 2026-09-10 (木): 福江が 19:50 に 中2C 数学 (奥村の代行) と 中3A 理科
  // (小見山の代行) で二重。作成ツールと違い本体は何も出していなかった。
  const THU = "2026-09-10";
  it("同じ代行者が同時刻に 2 コマ入ったら両方のセルに警告を出す", () => {
    renderGrid({
      viewDate: THU,
      slots: [
        slot({ id: 1, day: "木", time: "19:50-20:35", grade: "中2", cls: "C", room: "603", subj: "数学", teacher: "奥村" }),
        slot({ id: 2, day: "木", time: "19:50-20:35", grade: "中3", cls: "A", room: "502", subj: "理科", teacher: "小見山" }),
      ],
      subs: [
        { id: 1, date: THU, slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
        { id: 2, date: THU, slotId: 2, originalTeacher: "小見山", substitute: "福江", status: "confirmed" },
      ],
    });
    expect(screen.getByText("⚠ 福江: 中3A 理科 (代行) と重複")).toBeInTheDocument();
    expect(screen.getByText("⚠ 福江: 中2C 数学 (代行) と重複")).toBeInTheDocument();
  });

  it("代行者が自分のコマを持っている時間に代行を入れても警告する", () => {
    renderGrid({
      viewDate: THU,
      slots: [
        slot({ id: 1, day: "木", time: "19:50-20:35", grade: "中2", cls: "C", room: "603", subj: "数学", teacher: "奥村" }),
        slot({ id: 2, day: "木", time: "19:50-20:35", grade: "中3", cls: "SS", room: "505", subj: "理科", teacher: "滝澤" }),
      ],
      subs: [
        { id: 1, date: THU, slotId: 1, originalTeacher: "奥村", substitute: "滝澤", status: "confirmed" },
      ],
    });
    expect(screen.getByText("⚠ 滝澤: 中3SS 理科 と重複")).toBeInTheDocument();
    expect(screen.getByText("⚠ 滝澤: 中2C 数学 (代行) と重複")).toBeInTheDocument();
  });

  it("時間帯が重ならない代行・欠勤で手を離れたコマは警告しない", () => {
    renderGrid({
      viewDate: THU,
      slots: [
        slot({ id: 1, day: "木", time: "19:50-20:35", grade: "中2", cls: "C", room: "603", subj: "数学", teacher: "奥村" }),
        slot({ id: 2, day: "木", time: "20:45-21:30", grade: "中2", cls: "AB", room: "601", subj: "数学", teacher: "奥村" }),
        slot({ id: 3, day: "木", time: "19:50-20:35", grade: "中3", cls: "A", room: "502", subj: "理科", teacher: "福江" }),
      ],
      subs: [
        // 福江は 19:50 に自分の理科があるが、そちらを欠勤にしているので空く
        { id: 1, date: THU, slotId: 1, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
        { id: 2, date: THU, slotId: 3, originalTeacher: "福江", substitute: "", status: "requested" },
      ],
    });
    expect(screen.queryByText(/と重複/)).not.toBeInTheDocument();
  });
});

describe("ExcelGridView (代行モードと特別時程)", () => {
  // 附属の「1限カット + 50 分授業」の日。ダッシュボードでは 移/休 とバナーが
  // 出るのに、授業管理 → 時間割 (代行モード) では何も出なかった (2026-09-15)
  const DAY_SCHEDULE = {
    id: 1,
    date: MONDAY,
    targetGrades: ["中3"],
    label: "行事",
    cancelTimes: ["19:00-20:20"],
    timeMap: [{ from: "20:30-21:50", to: "20:00-20:50" }],
  };
  const SLOTS = [
    slot({ id: 1, teacher: "田中" }),
    slot({ id: 2, time: "20:30-21:50", room: "302", teacher: "佐藤" }),
  ];

  it("代行モードでは特別時程バナーと 移/休 を出す", () => {
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      slots: SLOTS,
      daySchedules: [DAY_SCHEDULE],
    });
    // 代行モードに入る前 (日付を持たない時間割表示) は出さない
    expect(screen.queryByText("⏰ 特別時程")).toBeNull();
    enterSubMode(container, MONDAY);
    expect(screen.getByText("月曜日 - 代行モード")).toBeInTheDocument();
    expect(screen.getByText("⏰ 特別時程")).toBeInTheDocument();
    expect(screen.getByText("中3 (行事)")).toBeInTheDocument();
    // 1限カットのコマは「休」、読み替えのコマは「移」
    expect(screen.getByText("休")).toBeInTheDocument();
    expect(screen.getByText("移")).toBeInTheDocument();
  });

  it("特別時程が無い日はバナーを出さない", () => {
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      slots: SLOTS,
      daySchedules: [{ ...DAY_SCHEDULE, date: "2026-07-20" }],
    });
    enterSubMode(container, MONDAY);
    expect(screen.queryByText("⏰ 特別時程")).toBeNull();
  });
});

describe("ExcelGridView (代行モードの仮代行)", () => {
  // 19:00 の田中のコマに、20:30 にしかコマの無い佐藤を代行で入れる。
  // 佐藤は 19:00 に空いているので候補に出る
  const SLOTS = [
    slot({ id: 1, teacher: "田中" }),
    slot({ id: 2, time: "20:30-21:50", room: "302", teacher: "佐藤" }),
  ];

  // セルは role=button (aria-label = 時刻 学年 科目 講師 …)。講師名だけで
  // 引くと右パネルの講師ボタンにも当たる
  const cell = (re) => screen.getByRole("button", { name: re });
  // 空き候補は「休講で空いた人」だけなので、全員表示に切り替えてから選ぶ
  function pickCandidate(candidate) {
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("全員表示"));
    const listbox = within(dialog).getByRole("listbox", { name: "代行候補" });
    fireEvent.click(within(listbox).getByRole("option", { name: new RegExp(candidate) }));
  }
  function assignViaPopover(cellRe, candidate) {
    fireEvent.click(cell(cellRe));
    pickCandidate(candidate);
  }

  it("破棄は確認ダイアログ (useConfirm) を挟み、OK で仮代行を消す", async () => {
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      isAdmin: true,
      slots: SLOTS,
    });
    enterSubMode(container, MONDAY);
    assignViaPopover(/^19:00-20:20 中3 - 数学 田中/, "佐藤");
    expect(screen.getByText("仮代行: 1件")).toBeInTheDocument();
    expect(screen.getByText("← 佐藤")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "破棄" }));
    // window.confirm ではなくアプリのダイアログ
    expect(screen.getByText("仮代行をすべて破棄しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByText("仮代行: 1件")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "破棄" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByText("仮代行: 1件")).toBeNull());
    expect(screen.queryByText("← 佐藤")).toBeNull();
  });

  it("確定して保存すると保存件数を toast で出し、理由メモを引き継ぐ", () => {
    const saveSubs = vi.fn();
    const toastSink = [];
    const { container } = renderGrid(
      {
        dashboardMode: false,
        enableSubMode: true,
        isAdmin: true,
        slots: SLOTS,
        subs: [
          // 欠勤登録済み (代行未定) の理由メモ
          { id: 5, date: MONDAY, slotId: 1, originalTeacher: "田中", substitute: "", status: "requested", memo: "体調不良" },
        ],
        saveSubs,
      },
      { toastSink }
    );
    enterSubMode(container, MONDAY);
    assignViaPopover(/^19:00-20:20 中3 - 数学 田中/, "佐藤");
    fireEvent.click(screen.getByRole("button", { name: "確定して保存" }));
    expect(saveSubs).toHaveBeenCalledTimes(1);
    expect(saveSubs.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 5, substitute: "佐藤", status: "confirmed", memo: "体調不良" }),
    ]);
    expect(toastSink.map((t) => t.message)).toEqual(["代行 1 件を保存しました"]);
  });

  it("セルのクリックは「代行なしで確定」も片付いた扱いにして、代行未定の人を先に出す", () => {
    const PREP = slot({ id: 1, grade: "中1-3", subj: "プレップ", teacher: "香川·福江" });
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      isAdmin: true,
      slots: [PREP, slot({ id: 2, time: "20:30-21:50", room: "302", teacher: "西岡" })],
      subs: [
        // 香川は代行なしで確定 (nosub)、福江は代行未定 (pending)
        { id: 5, date: MONDAY, slotId: 1, originalTeacher: "香川", substitute: "", status: "confirmed", memo: "" },
        { id: 6, date: MONDAY, slotId: 1, originalTeacher: "福江", substitute: "", status: "requested", memo: "" },
      ],
    });
    enterSubMode(container, MONDAY);
    // 代行未定 (福江) は代行モードに入ると自動で欠勤に取り込まれる。香川も手で欠勤に
    fireEvent.click(screen.getByRole("button", { name: /^香川/ }));
    fireEvent.click(cell(/^19:00-20:20 中1-3 - プレップ 香川·福江/));
    expect(screen.getByRole("dialog").textContent).toMatch(/担当: 福江/);
  });

  it("多担任コマは 2 人分の仮代行をセルに並べて出す", () => {
    // プレップ (香川·福江) の 2 人とも欠勤。西岡・杉原は同じ時間に空いている
    const PREP = slot({ id: 1, grade: "中1-3", subj: "プレップ", teacher: "香川·福江" });
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      isAdmin: true,
      slots: [
        PREP,
        slot({ id: 2, time: "20:30-21:50", room: "302", teacher: "西岡" }),
        slot({ id: 3, time: "20:30-21:50", room: "303", teacher: "杉原" }),
      ],
    });
    enterSubMode(container, MONDAY);
    // 右パネル (講師ごとのボタン) で 2 人を欠勤にする
    fireEvent.click(screen.getByRole("button", { name: /^香川/ }));
    fireEvent.click(screen.getByRole("button", { name: /^福江/ }));
    // 1 回目のクリックは香川 (欠勤者の先頭)、2 回目は仮代行の無い福江
    const prepCell = /^19:00-20:20 中1-3 - プレップ 香川·福江/;
    fireEvent.click(cell(prepCell));
    expect(screen.getByRole("dialog").textContent).toMatch(/担当: 香川/);
    pickCandidate("西岡");
    fireEvent.click(cell(prepCell));
    expect(screen.getByRole("dialog").textContent).toMatch(/担当: 福江/);
    pickCandidate("杉原");
    expect(screen.getByText("仮代行: 2件")).toBeInTheDocument();
    expect(screen.getByText("香川 ⇒ ← 西岡")).toBeInTheDocument();
    expect(screen.getByText("福江 ⇒ ← 杉原")).toBeInTheDocument();
  });

  it("多担任コマのポップオーバーは担当を切り替えて 2 人目の仮代行を直せる", () => {
    const PREP = slot({ id: 1, grade: "中1-3", subj: "プレップ", teacher: "香川·福江" });
    const { container } = renderGrid({
      dashboardMode: false,
      enableSubMode: true,
      isAdmin: true,
      slots: [
        PREP,
        slot({ id: 2, time: "20:30-21:50", room: "302", teacher: "西岡" }),
        slot({ id: 3, time: "20:30-21:50", room: "303", teacher: "杉原" }),
      ],
    });
    enterSubMode(container, MONDAY);
    fireEvent.click(screen.getByRole("button", { name: /^香川/ }));
    fireEvent.click(screen.getByRole("button", { name: /^福江/ }));
    const prepCell = /^19:00-20:20 中1-3 - プレップ 香川·福江/;
    fireEvent.click(cell(prepCell));
    pickCandidate("西岡");
    fireEvent.click(cell(prepCell));
    pickCandidate("杉原");
    // 2 人とも仮代行が付いた後のクリックは先頭 (香川) に戻る。担当の
    // 切替ボタンで福江へ移れる (1 人目を取り消さなくてよい)
    fireEvent.click(cell(prepCell));
    let dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/担当: 香川/);
    expect(dialog.textContent).toMatch(/仮割当: 西岡/);
    const group = within(dialog).getByRole("group", { name: "他の欠勤者へ切替" });
    fireEvent.click(within(group).getByRole("button", { name: "→ 福江" }));
    dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/担当: 福江/);
    expect(dialog.textContent).toMatch(/仮割当: 杉原/);
    fireEvent.keyDown(document, { key: "Escape" });
    // 1 人しか休まないコマでは切替は出ない (右パネルで福江の欠勤を外す)
    fireEvent.click(screen.getByRole("button", { name: /^✓ 福江/ }));
    fireEvent.click(cell(prepCell));
    expect(
      within(screen.getByRole("dialog")).queryByRole("group", { name: "他の欠勤者へ切替" })
    ).toBeNull();
  });
});
