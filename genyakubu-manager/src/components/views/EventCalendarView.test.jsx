// @vitest-environment jsdom
// イベントカレンダー: 追加授業の表示 (H1b) と visibility トグルの骨格を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EventCalendarView, SS_MONTH_KEY } from "./EventCalendarView";
import { DEFAULT_EVENT_VISIBILITY } from "../EventVisibilityToggles";
import { EVENT_KIND } from "../../constants/eventKinds";
import { fmtDateWeekday } from "../../utils/dateHelpers";

afterEach(() => {
  cleanup();
  // 表示中の月は sessionStorage に残る (タブ単位の保持)。テスト間で
  // 持ち越すと次のテストが別の月から始まるので毎回消す
  sessionStorage.clear();
});

// ビューは常に「今月」から表示を始めるので、テストデータは実行時の
// 今月の日付で組み立てる (システム時刻のモック無しで安定させる)。
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const LESSON = {
  id: 7,
  date: `${ym}-15`,
  time: "18:30-20:00",
  grade: "中3",
  cls: "A",
  room: "亀73",
  subj: "プレップ個別指導",
  teacher: "香川·福江",
  label: "夏期講習",
  note: "テキスト持参",
};

function renderView(props = {}) {
  const onEventClick = vi.fn();
  const onChangeVisibility = vi.fn();
  render(
    <EventCalendarView
      extraLessons={[LESSON]}
      onEventClick={onEventClick}
      onChangeVisibility={onChangeVisibility}
      {...props}
    />
  );
  return { onEventClick, onChangeVisibility };
}

describe("EventCalendarView (追加授業)", () => {
  it("visibility が OFF (既定) なら追加授業を表示しない", () => {
    renderView({ visibility: DEFAULT_EVENT_VISIBILITY });
    expect(screen.queryByText(/プレップ個別指導/)).not.toBeInTheDocument();
    // トグルチップ自体は出る (イベントカレンダーは opt-in 済み)
    expect(screen.getByText("追加授業")).toBeInTheDocument();
  });

  it("visibility が ON ならグリッドと一覧の両方に表示する", () => {
    renderView({ visibility: { [EVENT_KIND.EXTRA_LESSON]: true } });
    // グリッドのバッジ (開始時刻 + 短ラベル) と一覧行の 2 箇所
    expect(screen.getAllByText(/18:30 中3A プレップ個別指導/)).toHaveLength(2);
    // 一覧行には種別ラベル・担当・教室・メモも出る
    expect(screen.getByText("夏期講習")).toBeInTheDocument();
    expect(screen.getByText("香川·福江")).toBeInTheDocument();
    expect(screen.getByText("@亀73")).toBeInTheDocument();
    expect(screen.getByText("テキスト持参")).toBeInTheDocument();
  });

  it("クリックで onEventClick に kind=extraLesson と元レコードを渡す", () => {
    const { onEventClick } = renderView({
      visibility: { [EVENT_KIND.EXTRA_LESSON]: true },
    });
    fireEvent.click(
      screen.getAllByText(/18:30 中3A プレップ個別指導/)[0].closest("[role=button]")
    );
    expect(onEventClick).toHaveBeenCalledTimes(1);
    const ev = onEventClick.mock.calls[0][0];
    expect(ev.kind).toBe(EVENT_KIND.EXTRA_LESSON);
    expect(ev.source.id).toBe(7);
  });

  it("追加授業トグルの操作で onChangeVisibility が呼ばれ ON になる", () => {
    const { onChangeVisibility } = renderView({
      visibility: DEFAULT_EVENT_VISIBILITY,
    });
    fireEvent.click(screen.getByText("追加授業"));
    expect(onChangeVisibility).toHaveBeenCalledTimes(1);
    // functional update を既定 visibility に適用すると extraLesson が true になる
    const updater = onChangeVisibility.mock.calls[0][0];
    expect(updater(DEFAULT_EVENT_VISIBILITY)[EVENT_KIND.EXTRA_LESSON]).toBe(true);
  });

  it("管理者には追加授業の新規登録ボタンが出て kind を渡す", () => {
    const onAddNewEvent = vi.fn();
    render(
      <EventCalendarView
        extraLessons={[]}
        isAdmin
        onAddNewEvent={onAddNewEvent}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
    // ヘッダと空状態の 2 箇所に出る (どちらでも同じ動作)
    fireEvent.click(screen.getAllByTitle("追加授業を新規登録")[0]);
    expect(onAddNewEvent).toHaveBeenCalledWith(EVENT_KIND.EXTRA_LESSON);
  });
});

describe("EventCalendarView の日付セルからの登録", () => {
  it("管理者には各日のセルに ＋ が出て、種別を選ぶと kind と日付を渡す", () => {
    const onAddNewEvent = vi.fn();
    render(
      <EventCalendarView
        extraLessons={[]}
        isAdmin
        onAddNewEvent={onAddNewEvent}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: `${ym}-15 に登録` }));
    const menu = screen.getByRole("menu", { name: `${ym}-15 に登録する種別` });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "+ 休講" }));
    expect(onAddNewEvent).toHaveBeenCalledWith(EVENT_KIND.HOLIDAY, `${ym}-15`);
    // 選んだらメニューは閉じる
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("閲覧者にはセルの ＋ を出さない", () => {
    renderView({ visibility: DEFAULT_EVENT_VISIBILITY });
    expect(screen.queryByRole("button", { name: /に登録$/ })).toBeNull();
  });
});

// 「今日」の強調は useToday (深夜 0 時に更新)。開きっぱなしのタブが翌日も
// 昨日を強調し続けないこと
describe("EventCalendarView の「今日」", () => {
  function todayCell(container) {
    // 今日のセルだけ枠線 (#e6a800) が付く。jsdom は rgb() に正規化する
    return [...container.querySelectorAll(".event-cal-cell")].find((el) =>
      /e6a800|230, 168, 0/.test(el.style.border || "")
    );
  }

  it("深夜 0 時を跨ぐと強調する日付が翌日へ移る", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 6, 3, 23, 59, 0)); // 2026-07-03 23:59
      const { container } = render(
        <EventCalendarView
          extraLessons={[]}
          visibility={DEFAULT_EVENT_VISIBILITY}
          onChangeVisibility={() => {}}
        />
      );
      expect(todayCell(container).textContent.startsWith("3")).toBe(true);
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000); // → 7/4 0:01
      });
      expect(todayCell(container).textContent.startsWith("4")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// 日付の数字から「その日」へ跳ぶ (ダッシュボード / 欠勤組み換え)。
// ＋ と同じセル見出しに置く。どちらも任意の prop
describe("EventCalendarView の日付から跳ぶ", () => {
  const d15 = fmtDateWeekday(`${ym}-15`); // "YYYY-MM-15 (曜)"

  it("onSelectDate があれば日付の数字がボタンになり、その日付を渡す。凡例も出る", () => {
    const onSelectDate = vi.fn();
    renderView({ visibility: DEFAULT_EVENT_VISIBILITY, onSelectDate });
    fireEvent.click(screen.getByRole("button", { name: `${d15} をダッシュボードで見る` }));
    expect(onSelectDate).toHaveBeenCalledWith(`${ym}-15`);
    expect(screen.getByTestId("day-number-legend").textContent).toBe(
      "日付クリック = その日のダッシュボード"
    );
  });

  it("管理者で onJumpToAbsenceFlow があれば 🚑 が出る (紙面には出さない)。凡例に 🚑 が加わる", () => {
    const onJumpToAbsenceFlow = vi.fn();
    renderView({
      visibility: DEFAULT_EVENT_VISIBILITY,
      isAdmin: true,
      onJumpToAbsenceFlow,
      onSelectDate: vi.fn(),
    });
    const btn = screen.getByRole("button", { name: `${d15} の欠勤組み換えを開く` });
    expect(btn.getAttribute("title")).toBe(`${d15} の欠勤組み換えを開く`);
    expect(btn.closest(".no-print")).not.toBeNull();
    fireEvent.click(btn);
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith(`${ym}-15`);
    expect(screen.getByTestId("day-number-legend").textContent).toBe(
      "日付クリック = その日のダッシュボード / 🚑 = 欠勤組み換え"
    );
  });

  it("閲覧者には 🚑 を出さず、prop 無しなら日付はボタンにならない (凡例も無し)", () => {
    renderView({ visibility: DEFAULT_EVENT_VISIBILITY, onJumpToAbsenceFlow: vi.fn() });
    expect(screen.queryByRole("button", { name: /の欠勤組み換えを開く$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /をダッシュボードで見る$/ })).toBeNull();
    expect(screen.queryByTestId("day-number-legend")).toBeNull();
  });
});

// 休講・テスト期間の「誰に効くか」。学校全体の休講と中3 だけの休講を
// 同じ見た目にしない
describe("EventCalendarView の対象 (休講・テスト期間)", () => {
  const cell = (container, ds) => container.querySelector(`.event-cal-cell[data-date="${ds}"]`);
  const HOL = (over) => ({ id: 1, date: `${ym}-10`, label: "休講", scope: ["全部"], targetGrades: [], subjKeywords: [], ...over });

  it("学年を絞った休講はチップに学年を添え、ツールチップと一覧には全文で出す", () => {
    const { container } = render(
      <EventCalendarView
        holidays={[HOL({ id: 2, label: "中3休講", scope: ["中学部"], targetGrades: ["中3"] })]}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
    const chip = within(cell(container, `${ym}-10`)).getByText("中3休講").closest("[title]");
    expect(within(chip).getByText("中3")).toBeInTheDocument();
    expect(chip.getAttribute("title")).toContain("対象: 中学部 中3");
    expect(screen.getByText("対象: 中学部 中3")).toBeInTheDocument();
  });

  it("学校全体の休講はチップに対象を出さず、一覧には「全部」と書く", () => {
    const { container } = render(
      <EventCalendarView
        holidays={[HOL({ id: 3, label: "文化の日" })]}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
    expect(cell(container, `${ym}-10`).querySelector(".event-cal-target")).toBeNull();
    expect(screen.getByText("対象: 全部")).toBeInTheDocument();
  });

  it("部門・科目で絞った休講は部門 / 科目を添える", () => {
    const { container } = render(
      <EventCalendarView
        holidays={[
          HOL({ id: 4, date: `${ym}-11`, label: "高校休講", scope: ["高校部"] }),
          HOL({ id: 5, date: `${ym}-12`, label: "英語休講", scope: ["高校部"], targetGrades: ["高1", "高2"], subjKeywords: ["英語"] }),
        ]}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
    expect(cell(container, `${ym}-11`).querySelector(".event-cal-target").textContent).toBe("高校部");
    expect(cell(container, `${ym}-12`).querySelector(".event-cal-target").textContent).toBe("高1・高2 英語");
    expect(screen.getByText("対象: 高校部 高1・高2 英語")).toBeInTheDocument();
  });

  it("テスト期間は対象学年を出す (全学年はチップに出さず、一覧に「全学年」)", () => {
    const { container } = render(
      <EventCalendarView
        examPeriods={[
          { id: 1, name: "中3定期", startDate: `${ym}-05`, endDate: `${ym}-06`, targetGrades: ["中3"] },
          { id: 2, name: "全体模試", startDate: `${ym}-20`, endDate: `${ym}-20`, targetGrades: [] },
        ]}
        visibility={{ [EVENT_KIND.EXAM]: true }}
        onChangeVisibility={() => {}}
      />
    );
    expect(cell(container, `${ym}-05`).querySelector(".event-cal-target").textContent).toBe("中3");
    expect(cell(container, `${ym}-20`).querySelector(".event-cal-target")).toBeNull();
    expect(screen.getByText("対象: 中3")).toBeInTheDocument();
    expect(screen.getByText("対象: 全学年")).toBeInTheDocument();
  });
});

// 日まるごと振替 (振替 adjustments の束) とコマ休講 (adjustments の cancel)。
// イベントのレコードを持たないので、ここで拾わないとカレンダーに出ない
describe("EventCalendarView の振替・コマ休講", () => {
  const cell = (container, ds) => container.querySelector(`.event-cal-cell[data-date="${ds}"]`);
  const md = (d) => `${now.getMonth() + 1}/${d}`;
  const SLOTS = [
    { id: 1, day: "月", time: "19:40-21:00", grade: "中3", cls: "A", subj: "英語", teacher: "香川" },
    { id: 2, day: "月", time: "18:00-19:30", grade: "中3", cls: "B", subj: "数学", teacher: "福江" },
  ];
  const ADJS = [
    { id: 11, type: "reschedule", date: `${ym}-07`, slotId: 1, targetDate: `${ym}-04` },
    { id: 12, type: "reschedule", date: `${ym}-07`, slotId: 2, targetDate: `${ym}-04` },
    { id: 21, type: "cancel", date: `${ym}-19`, slotId: 1, memo: "行事" },
    { id: 22, type: "cancel", date: `${ym}-19`, slotId: 2 },
  ];
  function renderAdj(props = {}) {
    return render(
      <EventCalendarView
        adjustments={ADJS}
        slots={SLOTS}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
        {...props}
      />
    );
  }

  it("振替は振替元と振替先の両方の日に、相手の日付とコマ数で出る", () => {
    const { container } = renderAdj();
    // 読み上げ名 = チップの文言 1 行 (見た目は本体と相手の日付に分かれている)
    const out = within(cell(container, `${ym}-07`)).getByLabelText(`↻ 振替 2 コマ → ${md(4)}`);
    const inn = within(cell(container, `${ym}-04`)).getByLabelText(`↻ 振替 2 コマ ← ${md(7)}`);
    expect(out.textContent).toContain(`→ ${md(4)}`);
    expect(inn.textContent).toContain(`← ${md(7)}`);
    // ツールチップにどのコマか
    const chip = inn;
    expect(chip.getAttribute("title")).toContain("19:40-21:00 中3A 英語 香川");
    expect(chip.getAttribute("title")).toContain("18:00-19:30 中3B 数学 福江");
  });

  it("コマ休講はその日の件数で出し、ツールチップにコマを並べる", () => {
    const { container } = renderAdj();
    const chip = within(cell(container, `${ym}-19`)).getByLabelText("🚫 コマ休講 2");
    expect(chip.textContent).toContain("コマ休講");
    expect(chip.getAttribute("title")).toContain("中3A 英語 香川 — 行事");
    expect(chip.getAttribute("title")).toContain("中3B 数学 福江");
  });

  it("月の一覧にも出る (振替は元・先の組で 1 行)", () => {
    const { container } = renderAdj();
    const rows = container.querySelectorAll(".event-cal-adj-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText(`${fmtDateWeekday(`${ym}-07`)} → ${fmtDateWeekday(`${ym}-04`)}`)).toBeInTheDocument();
    expect(screen.getByText(fmtDateWeekday(`${ym}-19`))).toBeInTheDocument();
    // イベントが無くても空状態にしない
    expect(screen.queryByText("該当するイベントはありません")).toBeNull();
    expect(screen.getByText(/のイベント一覧 \(2件\)/)).toBeInTheDocument();
  });

  it("クリックは編集画面ではなく、その日のダッシュボードへ", () => {
    const onSelectDate = vi.fn();
    const onEventClick = vi.fn();
    const { container } = renderAdj({ onSelectDate, onEventClick });
    fireEvent.click(within(cell(container, `${ym}-19`)).getByRole("button", { name: "🚫 コマ休講 2" }));
    expect(onSelectDate).toHaveBeenCalledWith(`${ym}-19`);
    expect(onEventClick).not.toHaveBeenCalled();
  });
});

// 月の移動: ◀ ▶ 今月 に加えて月ピッカー・← → t・タブ内での月の保持
describe("EventCalendarView の月の移動", () => {
  function renderAt(dateArgs = [2026, 6, 3, 12, 0, 0]) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(...dateArgs)); // 既定 2026-07-03
    return render(
      <EventCalendarView
        extraLessons={[]}
        visibility={DEFAULT_EVENT_VISIBILITY}
        onChangeVisibility={() => {}}
      />
    );
  }
  afterEach(() => {
    vi.useRealTimers();
  });

  it("← / → で前後の月、t で今月 (◀ ▶ 今月 ボタンも同じ)", () => {
    renderAt();
    expect(screen.getByText("2026年7月")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("2026年6月")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2026年8月")).toBeTruthy();
    fireEvent.keyDown(window, { key: "t" });
    expect(screen.getByText("2026年7月")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    expect(screen.getByText("2026年5月")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(screen.getByText("2026年6月")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "今月" }));
    expect(screen.getByText("2026年7月")).toBeTruthy();
    // 年月の表示は読み上げ (aria-live)
    expect(screen.getByText("2026年7月").getAttribute("aria-live")).toBe("polite");
  });

  it("月末に開いたまま 0 時を跨いでも表示中の月は動かない (保存値も 9 月のまま)", () => {
    renderAt([2026, 8, 30, 23, 59, 0]); // 2026-09-30 23:59
    expect(screen.getByText("2026年9月")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000); // → 10/1 0:01 (useToday が更新される)
    });
    expect(screen.getByText("2026年9月")).toBeTruthy();
    expect(sessionStorage.getItem(SS_MONTH_KEY)).toBe("2026-09");
    // 「今月」は 10 月になったので、t で 10 月へ
    fireEvent.keyDown(window, { key: "t" });
    expect(screen.getByText("2026年10月")).toBeTruthy();
  });

  it("月ピッカーで直接指定できる (年をまたいでも)", () => {
    renderAt();
    const picker = screen.getByLabelText("表示する月");
    expect(picker.value).toBe("2026-07");
    fireEvent.change(picker, { target: { value: "2027-02" } });
    expect(screen.getByText("2027年2月")).toBeTruthy();
    expect(picker.value).toBe("2027-02");
    // 形式外は無視
    fireEvent.change(picker, { target: { value: "" } });
    expect(screen.getByText("2027年2月")).toBeTruthy();
  });

  it("表示中の月を sessionStorage に持ち、開き直しても同じ月から始まる", () => {
    const { unmount } = renderAt();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(sessionStorage.getItem(SS_MONTH_KEY)).toBe("2026-08");
    unmount();
    renderAt();
    expect(screen.getByText("2026年8月")).toBeTruthy();
  });

  it("保存された月が今日から 12 か月より遠い・壊れているときは今月から始める", () => {
    sessionStorage.setItem(SS_MONTH_KEY, "2028-01"); // 18 か月先
    const { unmount } = renderAt();
    expect(screen.getByText("2026年7月")).toBeTruthy();
    unmount();
    sessionStorage.setItem(SS_MONTH_KEY, "garbage");
    renderAt();
    expect(screen.getByText("2026年7月")).toBeTruthy();
  });
});
