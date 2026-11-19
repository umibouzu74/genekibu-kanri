// @vitest-environment jsdom
// 担当変更タブ (P2-3): 期間に授業のある時間割のコマだけ既定でチェックする。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeacherChangeTab } from "./TeacherChangeTab";
import { ToastProvider } from "../../../hooks/useToasts";

afterEach(cleanup);

const TTS = [
  { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
  { id: 3, name: "2026 2学期", type: "regular", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] },
  { id: 4, name: "2026 3学期", type: "regular", startDate: "2027-01-08", endDate: null, grades: [] },
];
const mk = (id, timetableId, o = {}) => ({
  id, timetableId, day: "火", time: "19:00-20:20", grade: "高2", cls: "", room: "亀62",
  subj: "高松高 文系数学", teacher: "福武", note: "", ...o,
});
const SLOTS = [mk(1, 1), mk(3, 3), mk(814, 4), mk(820, 4, { day: "金" })];

function setup(extra = {}) {
  const saveSlots = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <TeacherChangeTab slots={SLOTS} timetables={TTS} saveSlots={saveSlots} isAdmin {...extra} />
    </ToastProvider>
  );
  fireEvent.change(screen.getByLabelText("旧担当"), { target: { value: "福武" } });
  fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2027-01-04" } });
  fireEvent.change(screen.getByLabelText("新担当"), { target: { value: "川井" } });
  fireEvent.change(screen.getByLabelText("◯日まで（任意）"), { target: { value: "2027-01-22" } });
  return { saveSlots };
}

describe("TeacherChangeTab: 期間に授業のあるコマだけ既定でチェック (P2-3)", () => {
  it("3学期の 2 コマだけをチェックし、1学期・2学期のコマは畳んで外しておく", () => {
    setup();
    const list = screen.getByRole("list", { name: "担当変更の対象のコマ" });
    expect(list.querySelectorAll("input:checked")).toHaveLength(2);
    expect(screen.getByText(/この期間に授業の無いコマ 2 件/)).toBeInTheDocument();
    const folded = screen.getByRole("list", { name: "この期間に授業の無いコマ", hidden: true });
    expect(folded.querySelectorAll("input:checked")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "2 コマに担当変更を付ける" })).toBeEnabled();
  });

  it("畳んだコマも開いてチェックすれば付けられる", () => {
    const { saveSlots } = setup();
    const folded = screen.getByRole("list", { name: "この期間に授業の無いコマ", hidden: true });
    fireEvent.click(folded.querySelector("input"));
    const button = screen.getByRole("button", { name: "3 コマに担当変更を付ける" });
    fireEvent.click(button);
    const next = saveSlots.mock.calls[0][0](SLOTS);
    expect(next.filter((s) => s.teacherChanges).map((s) => s.id)).toEqual([1, 814, 820]);
  });
});

describe("TeacherChangeTab: 担当が変わる授業日と新担当の重なり (P2-4)", () => {
  it("◯日まで を入れると、実際に変わる授業日を数える (1/8 金・1/12 火・1/15 金・1/19 火・1/22 金)", () => {
    setup();
    expect(screen.getByText("担当が変わる授業 計 5 回")).toBeInTheDocument();
    const items = screen.getByRole("list", { name: "担当が変わる授業" }).querySelectorAll("li");
    expect([...items].map((li) => li.textContent.slice(0, 4))).toEqual(["1/8 ", "1/12", "1/15", "1/19", "1/22"]);
  });

  it("休講で実施されない日は理由つきで別に出す", () => {
    setup({ holidays: [{ id: 1, date: "2027-01-15", label: "休講", scope: ["全部"] }] });
    expect(screen.getByText("担当が変わる授業 計 4 回")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "実施されない日" }).textContent).toMatch(/1\/15.*休講・テスト期間/);
  });

  it("新担当がその時間に別の授業を持っていれば知らせる (登録はできる)", () => {
    const kawai = mk(900, 4, { teacher: "川井", grade: "中2", subj: "数学", room: "601" });
    const saveSlots = vi.fn();
    render(
      <ToastProvider render={() => null}>
        <TeacherChangeTab slots={[...SLOTS, kawai]} timetables={TTS} saveSlots={saveSlots} isAdmin />
      </ToastProvider>
    );
    fireEvent.change(screen.getByLabelText("旧担当"), { target: { value: "福武" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2027-01-04" } });
    fireEvent.change(screen.getByLabelText("新担当"), { target: { value: "川井" } });
    fireEvent.change(screen.getByLabelText("◯日まで（任意）"), { target: { value: "2027-01-22" } });
    const alert = screen.getByText(/川井 はこの時間に別の予定があります/).closest("[role=alert]");
    expect(alert.textContent).toMatch(/1\/12.*中2.*数学/);
    expect(screen.getByRole("button", { name: "2 コマに担当変更を付ける" })).toBeEnabled();
  });

  it("期限なしなら最初の数回と「以降も毎週」", () => {
    const saveSlots = vi.fn();
    render(
      <ToastProvider render={() => null}>
        <TeacherChangeTab slots={SLOTS} timetables={TTS} saveSlots={saveSlots} isAdmin />
      </ToastProvider>
    );
    fireEvent.change(screen.getByLabelText("旧担当"), { target: { value: "福武" } });
    fireEvent.change(screen.getByLabelText("開始日"), { target: { value: "2027-01-04" } });
    expect(screen.getByText(/担当が変わる授業（最初の 8 回。以降も毎週）/)).toBeInTheDocument();
  });
});
