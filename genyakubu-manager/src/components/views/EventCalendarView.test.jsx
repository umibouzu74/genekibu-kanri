// @vitest-environment jsdom
// イベントカレンダー: 追加授業の表示 (H1b) と visibility トグルの骨格を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EventCalendarView } from "./EventCalendarView";
import { DEFAULT_EVENT_VISIBILITY } from "../EventVisibilityToggles";
import { EVENT_KIND } from "../../constants/eventKinds";

afterEach(cleanup);

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
