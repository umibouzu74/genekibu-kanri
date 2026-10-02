// @vitest-environment jsdom
// 他校舎の授業: 講師ごとの「行き先 × 曜日 × 時間 × 期間」をパッと登録できる
// (続けて別の講師を入れられる・複数講師を一度に)・休みの日を日付で切り替え
// られる・削除は Undo 付き・外から 1 件 / 講師指定で開ける、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OffsiteLessonView } from "./OffsiteLessonView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0)); // 2026-10-02 (金)
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const holidays = [
  { id: 1, date: "2026-11-03", label: "文化の日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
];

function Harness({ initial = [], isAdmin = true, onSaveSpy, focusRequest = null, onConsumeFocus }) {
  const [list, setList] = useState(initial);
  return (
    <OffsiteLessonView
      offsiteLessons={list}
      onSave={(next) => {
        onSaveSpy?.(next);
        setList(next);
      }}
      isAdmin={isAdmin}
      holidays={holidays}
      teacherNames={["石原", "片岡", "堀上"]}
      teacherKana={{ 石原: "いしはら", 片岡: "かたおか", 堀上: "ほりかみ" }}
      focusRequest={focusRequest}
      onConsumeFocus={onConsumeFocus}
    />
  );
}

const renderView = (props) =>
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
            </div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>
        <Harness {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const day = (d) => fireEvent.click(screen.getByRole("button", { name: `${d}曜` }));
const submit = () => fireEvent.click(screen.getByRole("button", { name: "登録" }));

describe("OffsiteLessonView — 登録", () => {
  it("依頼の 4 件を、講師を入れ替えながら続けて登録できる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });

    // 1. 石原 村上高松 火木 14:50-15:40 10/1〜 (未定)
    type("講師", "石原");
    type("行き先", "村上高松");
    day("火");
    day("木");
    type("時間", "14:50-15:40");
    type("開始日", "2026-10-01");
    type("メモ", "1月まで？");
    submit();
    expect(spy).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 1,
        teacher: "石原",
        place: "村上高松",
        days: ["火", "木"],
        time: "14:50-15:40",
        startDate: "2026-10-01",
        memo: "1月まで？",
      }),
    ]);
    expect(spy.mock.calls[0][0][0]).not.toHaveProperty("endDate");
    // 講師だけ空いて、行き先・曜日・時間・期間・メモは残る
    expect(screen.getByLabelText("講師")).toHaveValue("");
    expect(screen.getByLabelText("行き先")).toHaveValue("村上高松");
    expect(screen.getByLabelText("時間")).toHaveValue("14:50-15:40");
    expect(screen.getByRole("button", { name: "火曜" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("石原 を登録しました");

    // 2. 片岡 は木曜だけ (火を外す)
    type("講師", "片岡");
    day("火");
    submit();
    // 3. 堀上 は火木で 10/13 まで (メモは消す)
    type("講師", "堀上");
    day("火");
    type("終了日 (空欄 = 未定)", "2026-10-13");
    type("メモ", "");
    submit();
    // 4. 堀上 大手前丸亀 月水 13:30〜 (終了時刻未定) 10/14〜 (行き先ボタンは使わず手入力)
    type("講師", "堀上");
    type("行き先", "大手前丸亀");
    day("火");
    day("木");
    day("月");
    day("水");
    type("時間", "13:30");
    type("開始日", "2026-10-14");
    fireEvent.click(screen.getByRole("button", { name: "未定に戻す" }));
    type("メモ", "3月まで？");
    submit();

    const saved = spy.mock.calls.at(-1)[0];
    expect(saved.map((r) => [r.teacher, r.place, r.days.join(""), r.time, r.startDate, r.endDate ?? "未定"])).toEqual([
      ["石原", "村上高松", "火木", "14:50-15:40", "2026-10-01", "未定"],
      ["片岡", "村上高松", "木", "14:50-15:40", "2026-10-01", "未定"],
      ["堀上", "村上高松", "火木", "14:50-15:40", "2026-10-01", "2026-10-13"],
      ["堀上", "大手前丸亀", "月水", "13:30", "2026-10-14", "未定"],
    ]);
    expect(saved.map((r) => r.memo ?? "")).toEqual(["1月まで？", "1月まで？", "", "3月まで？"]);

    // 一覧は行き先ごと。終了時刻未定・終了日未定はそう出る
    const marugame = screen.getByText("🏫 大手前丸亀", { exact: false }).closest(".offsite-group");
    expect(within(marugame).getByText("13:30〜 (終了未定)")).toBeInTheDocument();
    expect(within(marugame).getByText("10/14 から")).toBeInTheDocument();
    const murakami = screen.getByText("🏫 村上高松", { exact: false }).closest(".offsite-group");
    // よみ順 (いしはら → かたおか → ほりかみ)
    expect(
      within(murakami)
        .getAllByRole("button", { name: /を編集$/ })
        .map((b) => b.getAttribute("aria-label").split(":")[0])
    ).toEqual(["石原", "片岡", "堀上"]);
  });

  it("「石原・片岡」で 2 人分を一度に作り、全角の時間も整える", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    type("講師", "石原・片岡");
    type("行き先", "村上高松");
    day("木");
    type("時間", "１４：５０〜１５：４０");
    submit();
    expect(spy.mock.calls[0][0].map((r) => [r.id, r.teacher, r.time])).toEqual([
      [1, "石原", "14:50-15:40"],
      [2, "片岡", "14:50-15:40"],
    ]);
  });

  it("曜日が無いと登録せず、理由を出す。時間割に無い名前は注意を出す", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    type("講師", "石はら");
    type("行き先", "村上高松");
    type("時間", "14:50-15:40");
    expect(screen.getByText(/時間割・バイトに無い名前です: 石はら/)).toBeInTheDocument();
    submit();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("曜日を 1 つ以上選んでください");
  });

  it("閲覧者にはフォームも操作ボタンも出さない", () => {
    renderView({
      isAdmin: false,
      initial: [{ id: 1, teacher: "石原", place: "村上高松", days: ["火"], time: "14:50-15:40", startDate: "2026-10-01" }],
    });
    expect(screen.queryByLabelText("講師")).toBeNull();
    expect(screen.queryByRole("button", { name: /を編集$/ })).toBeNull();
    expect(screen.getByText("石原")).toBeInTheDocument();
  });
});

describe("OffsiteLessonView — 一覧の操作", () => {
  const rec = { id: 1, teacher: "石原", place: "村上高松", days: ["火", "木"], time: "14:50-15:40", startDate: "2026-10-01" };

  it("📅 日程で日付を押すとその日だけ休みになり、休講日は「祝」で出る", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy, initial: [rec] });
    fireEvent.click(screen.getByRole("button", { name: /村上高松 火・木 14:50-15:40 の日程/ }));
    // 文化の日 (11/3 火) は塾の休講日なので押せない
    expect(screen.getByText("11/3 (火) 休講")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-10-06 (火) を休みにする" }));
    expect(spy).toHaveBeenLastCalledWith([{ ...rec, skipDates: ["2026-10-06"] }]);
    // 戻せる
    fireEvent.click(screen.getByRole("button", { name: "2026-10-06 (火) を授業ありに戻す" }));
    expect(spy).toHaveBeenLastCalledWith([rec]);
  });

  it("休みの期間をまとめて追加すると、担当曜日の日だけ休みにする", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy, initial: [rec] });
    fireEvent.click(screen.getByRole("button", { name: /の日程/ }));
    type("休みの期間の開始日", "2026-12-24");
    type("休みの期間の終了日", "2027-01-07");
    fireEvent.click(screen.getByRole("button", { name: "休みにする" }));
    expect(spy.mock.calls.at(-1)[0][0].skipDates).toEqual([
      "2026-12-24",
      "2026-12-29",
      "2026-12-31",
      "2027-01-05",
      "2027-01-07",
    ]);
  });

  it("✏️ 編集で直し、📋 複製で講師だけ空けてフォームへ写す", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy, initial: [rec] });
    fireEvent.click(screen.getByRole("button", { name: "石原: 村上高松 火・木 14:50-15:40 を編集" }));
    expect(screen.getByLabelText("講師")).toHaveValue("石原");
    type("終了日 (空欄 = 未定)", "2027-01-31");
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(spy).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 1, endDate: "2027-01-31", updatedAt: expect.any(String) }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /石原: 村上高松 .* を複製/ }));
    expect(screen.getByLabelText("講師")).toHaveValue("");
    expect(screen.getByLabelText("行き先")).toHaveValue("村上高松");
    expect(screen.getByRole("button", { name: "登録" })).toBeInTheDocument();
  });

  it("削除は Undo で戻せる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy, initial: [rec] });
    fireEvent.click(screen.getByRole("button", { name: /石原: 村上高松 .* を削除/ }));
    expect(spy).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(spy).toHaveBeenLastCalledWith([rec]);
  });

  it("終了した予定は「終了」の絞り込みに分ける", () => {
    renderView({
      initial: [rec, { ...rec, id: 2, teacher: "堀上", endDate: "2026-09-30" }],
    });
    const list = screen.getByRole("region", { name: "他校舎の授業の一覧" });
    expect(within(list).queryByText("堀上")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "終了 (1)" }));
    expect(within(list).getByText("堀上")).toBeInTheDocument();
    expect(within(list).queryByText("石原")).toBeNull();
  });

  it("週ごとの予定は休講日を抜いて、行き先 × 時刻で講師をまとめる", () => {
    renderView({
      initial: [rec, { ...rec, id: 2, teacher: "片岡", days: ["木"] }],
    });
    const week = screen.getByRole("region", { name: "週ごとの他校舎の授業" });
    // 今週 (9/28〜10/3) の木曜 10/1: 石原・片岡 (よみ順)
    expect(within(week).getByText("石原・片岡")).toBeInTheDocument();
    // 文化の日の週へ
    fireEvent.click(within(week).getByRole("button", { name: "次の週" }));
    fireEvent.click(within(week).getByRole("button", { name: "次の週" }));
    fireEvent.click(within(week).getByRole("button", { name: "次の週" }));
    fireEvent.click(within(week).getByRole("button", { name: "次の週" }));
    fireEvent.click(within(week).getByRole("button", { name: "次の週" }));
    expect(within(week).getByText("🚫 文化の日")).toBeInTheDocument();
  });
});

describe("OffsiteLessonView — 外からの要求", () => {
  const rec = { id: 7, teacher: "堀上", place: "大手前丸亀", days: ["月", "水"], time: "13:30", startDate: "2026-10-14" };

  it("{id} でその 1 件を編集に開き、要求を消す", () => {
    const consume = vi.fn();
    renderView({ initial: [rec], focusRequest: { id: 7, token: 1 }, onConsumeFocus: consume });
    expect(screen.getByLabelText("講師")).toHaveValue("堀上");
    expect(screen.getByLabelText("時間")).toHaveValue("13:30");
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
    expect(consume).toHaveBeenCalled();
  });

  it("{teacher} でその講師の新規登録を始める", () => {
    renderView({ focusRequest: { teacher: "片岡", token: 1 }, onConsumeFocus: () => {} });
    expect(screen.getByLabelText("講師")).toHaveValue("片岡");
    expect(screen.getByRole("button", { name: "登録" })).toBeInTheDocument();
  });
});
