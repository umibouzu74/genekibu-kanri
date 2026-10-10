// @vitest-environment jsdom
// Cmd+K: 空のときは主要なビュー・操作の固定一覧、日付を打てばその日への
// ジャンプ、複数講師のコマは講師ごとに 1 件 (2026-09-12)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { VIEWS } from "../constants/views";

afterEach(cleanup);

const SLOTS = [
  { id: 1, day: "月", time: "18:30-20:00", grade: "中1-3", cls: "", room: "亀73", subj: "プレップ", teacher: "香川·福江", note: "" },
];

function renderPalette(props = {}) {
  const fns = {
    onClose: vi.fn(),
    onSelectTeacher: vi.fn(),
    onSelectView: vi.fn(),
    onSelectDate: vi.fn(),
    onJumpToAbsenceFlow: vi.fn(),
  };
  render(
    <CommandPalette
      open
      slots={SLOTS}
      subs={[]}
      views={VIEWS}
      {...fns}
      {...props}
    />
  );
  return fns;
}

describe("CommandPalette", () => {
  it("空のときは今日・明日の日付ジャンプと主要なビューを固定で出す", () => {
    renderPalette();
    expect(screen.getByRole("option", { name: /今日 .* のダッシュボード/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /明日 .* の欠勤組み換え/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /ダッシュボード.*ビューに移動/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /授業管理/ })).toBeTruthy();
  });

  it("「9/24」でその日のダッシュボード / 欠勤組み換えへ飛べる", () => {
    const { onSelectDate, onJumpToAbsenceFlow } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9/24" } });
    const dash = screen.getByRole("option", { name: /-09-24 \(木\) のダッシュボード/ });
    fireEvent.click(dash);
    expect(onSelectDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-09-24$/));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("option", { name: /の欠勤組み換え/ }));
    expect(onJumpToAbsenceFlow).toHaveBeenCalledWith("2026-09-24");
  });

  it("欠勤組み換えへのジャンプは渡したときだけ (閲覧者には出ない)", () => {
    renderPalette({ onJumpToAbsenceFlow: undefined });
    expect(screen.queryByRole("option", { name: /の欠勤組み換え/ })).toBeNull();
    // ビュー移動の「欠勤組み換え」も出さない (開いても「管理者のみ」の行き止まり)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "欠勤" } });
    expect(screen.queryByRole("option", { name: /欠勤組み換え/ })).toBeNull();
  });

  it("管理者にはビュー移動の「欠勤組み換え」が出る", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "欠勤" } });
    expect(screen.getByRole("option", { name: /欠勤組み換え.*ビューに移動/ })).toBeTruthy();
  });

  it("講師はよみでも当てる (「ふく」で 福江)", () => {
    const { onSelectTeacher } = renderPalette({ teacherKana: { 福江: "ふくえ", 香川: "かがわ" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ふく" } });
    const opt = screen.getByRole("option", { name: /^福江/ });
    fireEvent.click(opt);
    expect(onSelectTeacher).toHaveBeenCalledWith("福江");
    expect(screen.queryByRole("option", { name: /^香川/ })).toBeNull();
  });

  it("複数講師のコマは講師ごとに 1 件出し、選ぶとその講師を開く", () => {
    const { onSelectTeacher } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "プレップ" } });
    const opts = screen.getAllByRole("option", { name: /プレップ/ });
    expect(opts).toHaveLength(2);
    fireEvent.click(opts[1]);
    expect(onSelectTeacher).toHaveBeenCalledWith("福江");
  });

  describe("引継ぎメモ", () => {
    const NOTES = [
      { id: 1, date: "2026-10-01", category: "事務", title: "事務よりズバリ的中の提出催促", body: "9月の会議で告知済み" },
      { id: 2, date: "2026-04-01", category: "設備・システム", title: "鍵の置き場所", pinned: true },
    ];

    it("管理者なら中身を検索でき、選ぶとそのメモを開く", () => {
      const onOpenHandoverNote = vi.fn();
      renderPalette({ canUseAdminData: true, handoverNotes: NOTES, onOpenHandoverNote });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "会議" } });
      fireEvent.click(screen.getByRole("option", { name: /ズバリ的中の提出催促.*2026\/10\/1/ }));
      expect(onOpenHandoverNote).toHaveBeenCalledWith(1);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "鍵" } });
      expect(screen.getByRole("option", { name: /鍵の置き場所.*いつでも必要なこと/ })).toBeTruthy();
    });

    it("「引継ぎメモを書く」でダイアログを開ける", () => {
      const onOpenHandoverAdd = vi.fn();
      renderPalette({ canUseAdminData: true, onOpenHandoverAdd });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "引継ぎ" } });
      fireEvent.click(screen.getByRole("option", { name: /引継ぎメモを書く/ }));
      expect(onOpenHandoverAdd).toHaveBeenCalled();
    });

    it("閲覧者には中身も操作も出さない", () => {
      renderPalette({
        canUseAdminData: false,
        handoverNotes: NOTES,
        onOpenHandoverNote: vi.fn(),
        onOpenHandoverAdd: vi.fn(),
      });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "引継ぎ" } });
      expect(screen.queryByRole("option", { name: /引継ぎメモ/ })).toBeNull();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "会議" } });
      expect(screen.queryByRole("option", { name: /ズバリ/ })).toBeNull();
    });
  });
});

describe("CommandPalette のよみ検索 (講師名の欄)", () => {
  const KANA = { 堀上: "ほりかみ", 石原: "いしはら" };

  it("講師ヒットと並べて、その人の他校舎の授業・代行もよみで出す", () => {
    renderPalette({
      teacherKana: KANA,
      slots: [{ id: 2, day: "火", time: "19:00-20:20", grade: "中3", cls: "A", subj: "英語", teacher: "堀上", note: "" }],
      offsiteLessons: [
        { id: 3, teacher: "堀上", place: "村上高松", days: ["火"], time: "14:50-15:40", startDate: "2026-10-01" },
        { id: 4, teacher: "石原", place: "大手前丸亀", days: ["水"], time: "13:30", startDate: "2026-10-01" },
      ],
      onOpenOffsite: vi.fn(),
      subs: [{ id: 7, date: "2026-10-09", slotId: 2, originalTeacher: "堀上", substitute: "", status: "requested", memo: "" }],
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ほり" } });
    const texts = screen.getAllByRole("option").map((o) => o.textContent);
    // 講師ヒット (1コマ) / 他校舎の授業 / 代行 (代行未定) の 3 種が並ぶ
    expect(texts.some((t) => t.includes("堀上1コマ講師"))).toBe(true);
    expect(texts.some((t) => t.includes("村上高松"))).toBe(true);
    expect(texts.some((t) => t.includes("堀上 → 代行未定"))).toBe(true);
    expect(texts.some((t) => t.includes("大手前丸亀"))).toBe(false);
  });
});
