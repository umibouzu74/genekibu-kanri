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

  // 講習は季節ごとの時間割 (2026-10-23)。以前は講習時間割作成・通常時間割作成が
  // Cmd+K から引けなかった
  it("「冬期」で講習時間割作成をその季節で開ける。空のときの一覧には並べない", () => {
    const onSelectKoshuSeason = vi.fn();
    const fns = renderPalette({ onSelectKoshuSeason });
    expect(screen.queryByRole("option", { name: /講習時間割作成/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "冬期" } });
    fireEvent.click(screen.getByRole("option", { name: /講習時間割作成: 冬期講習/ }));
    expect(onSelectKoshuSeason).toHaveBeenCalledWith("winter");
    expect(fns.onClose).toHaveBeenCalled();
  });

  it("「講習」で 3 季節とも出る / 「通常時間割」で通常時間割作成へ", () => {
    const { onSelectView } = renderPalette({ onSelectKoshuSeason: vi.fn() });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "講習時間割" } });
    expect(screen.getAllByRole("option", { name: /講習時間割作成: (春期|夏期|冬期)講習/ })).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "通常時間割" } });
    fireEvent.click(screen.getByRole("option", { name: /通常時間割作成/ }));
    expect(onSelectView).toHaveBeenCalledWith(VIEWS.REGULAR_BUILDER);
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

    it("「有給・半休を入れる」で入れる欄を開いた有給・半休の画面へ (閲覧者には出さない)", () => {
      const onOpenLeaveEntry = vi.fn();
      renderPalette({ canUseAdminData: true, onOpenLeaveEntry });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "有給" } });
      fireEvent.click(screen.getByRole("option", { name: /有給・半休を入れる/ }));
      expect(onOpenLeaveEntry).toHaveBeenCalled();
      cleanup();
      renderPalette({ canUseAdminData: false, onOpenLeaveEntry });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "有給" } });
      expect(screen.queryByRole("option", { name: /有給・半休を入れる/ })).toBeNull();
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

describe("CommandPalette の月間予定のまとめて印刷・画像", () => {
  it("月間予定のまとめて印刷・画像を「まとめて印刷」「画像」で開ける", () => {
    const onOpenMonthBatch = vi.fn();
    const { onClose } = renderPalette({ onOpenMonthBatch });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "まとめて印刷" } });
    expect(screen.getByRole("option", { name: /月間予定のまとめて印刷・画像/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "画像" } });
    fireEvent.click(screen.getByRole("option", { name: /月間予定のまとめて印刷・画像/ }));
    expect(onOpenMonthBatch).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("onOpenMonthBatch を渡さなければ出さない", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "まとめて印刷" } });
    expect(screen.queryByRole("option", { name: /月間予定のまとめて印刷・画像/ })).toBeNull();
  });
});

// 時間割管理の中のカード (コース別終講日など) を名前で開く (C4)
describe("CommandPalette の時間割管理のセクション", () => {
  it("「終講」でコース別終講日へ飛べる", () => {
    const onSelectTimetableSection = vi.fn();
    const { onClose } = renderPalette({ onSelectTimetableSection });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "終講" } });
    fireEvent.click(
      screen.getByRole("option", { name: /コース別終講日.*時間割管理のセクションに移動/ })
    );
    expect(onSelectTimetableSection).toHaveBeenCalledWith("cohortCutoff");
    expect(onClose).toHaveBeenCalled();
  });

  it("空のときの固定一覧には並べない (他の操作を押し出さない)", () => {
    renderPalette({ onSelectTimetableSection: vi.fn() });
    expect(screen.queryByRole("option", { name: /時間割管理のセクションに移動/ })).toBeNull();
  });

  it("時刻一括変換は管理者だけ (閲覧者の画面には無いカード)", () => {
    renderPalette({ onSelectTimetableSection: vi.fn() });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "時刻一括" } });
    expect(screen.getByRole("option", { name: /時刻一括変換.*時間割管理のセクション/ })).toBeTruthy();
    cleanup();
    renderPalette({ onSelectTimetableSection: vi.fn(), onJumpToAbsenceFlow: undefined });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "時刻一括" } });
    expect(screen.queryByRole("option", { name: /時刻一括変換/ })).toBeNull();
  });
});

// メニューにあるものは Cmd+K でも出る (2026-11-19、P3-8)。サイドバーの項目の名前で
// 探すと、何か 1 件は出ること (ビューはその画面、ダイアログはそのダイアログ)
import { SIDEBAR_MENU } from "../constants/sidebarMenu";

describe("CommandPalette: メニューにあるものは Cmd+K でも出る (P3-8)", () => {
  const handlers = {
    onOpenDayReschedule: vi.fn(),
    onOpenMultiDayAbsence: vi.fn(),
    onOpenTestPrep: vi.fn(),
    onOpenMonthBatch: vi.fn(),
    onOpenCardForget: vi.fn(),
    onOpenDataManager: vi.fn(),
  };
  for (const item of SIDEBAR_MENU) {
    it(`「${item.label}」で出る`, () => {
      renderPalette({ ...handlers, canUseAdminData: true });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: item.label } });
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
  }

  it("「データ管理」でデータ管理のダイアログを開ける", () => {
    const { onClose } = renderPalette(handlers);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "データ管理" } });
    fireEvent.click(screen.getByRole("option", { name: /データ管理/ }));
    expect(handlers.onOpenDataManager).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// 講師のコマ数はサイドバーと同じ (今の時間割・隔週は 0.5)、コマの結果は今の期から (P3-7)
describe("CommandPalette: 講師のコマ数とコマの結果の期 (P3-7)", () => {
  const TTS = [
    { id: 1, name: "2026 1学期", startDate: "2026-04-07", endDate: "2026-08-24", grades: [] },
    { id: 3, name: "2026 2学期", startDate: "2026-08-25", endDate: "2026-12-21", grades: [] },
  ];
  const mk = (id, o = {}) => ({
    id, day: "水", time: "18:55-19:40", grade: "中3", cls: "", room: "502", subj: "英/数", teacher: "堀上", note: "", ...o,
  });
  const old1 = mk(1);
  const old2 = mk(2, { day: "金" });
  const cur = mk(10, { timetableId: 3 });
  const curBi = mk(11, { timetableId: 3, day: "木", note: "隔週(河野)" });
  const slots = [old1, old2, cur, curBi];

  it("講師の「◯コマ」は今の時間割で数える (全期の合計ではない)", () => {
    renderPalette({ slots, currentSlots: [cur, curBi], rosterSlots: [cur, curBi], timetables: TTS });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "堀上" } });
    expect(screen.getByRole("option", { name: /堀上.*1\.5コマ/ })).toBeTruthy();
  });

  it("コマの結果は今の期を先に出し、ほかの期のコマには時間割の名前を添える", () => {
    renderPalette({ slots: [old1, cur], currentSlots: [cur], rosterSlots: [cur], timetables: TTS });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "英/数" } });
    const texts = screen.getAllByRole("option").map((o) => o.textContent);
    const slotTexts = texts.filter((t) => t.includes("水 18:55-19:40"));
    expect(slotTexts).toHaveLength(2);
    expect(slotTexts[0]).not.toContain("2026 1学期");
    expect(slotTexts[1]).toContain("2026 1学期");
  });
});
