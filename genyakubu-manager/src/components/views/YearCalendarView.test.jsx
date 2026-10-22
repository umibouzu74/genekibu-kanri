// @vitest-environment jsdom
// 年間カレンダー: 1 日の欄が上 = 予備校部 / 下 = 現役部 に分かれて並ぶ・予備校部の
// 日の種別 (休校日) は日付の塗りと短い名前で出る・段を隠せる・管理者は日付の
// 「＋」/ まとめて登録で予備校部の予定を入れ、Undo 付きで消せる・現役部の記録は
// 編集画面へ、閲覧者は見るだけ・印刷の向き (既定は横)、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { YearCalendarView, SS_YEAR_CAL_KEY } from "./YearCalendarView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { buildImportedExamPeriods, parseExamPeriodImport } from "../../utils/examPeriodImport";
import { buildImportedEvents, parseSpecialEventImport } from "../../utils/specialEventImport";
import { SCHOOL_EXAM_TSV, SCHOOL_MOCK_TSV } from "../../utils/testdata/schoolSchedule2026";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0)); // 2026-10-21 (水)
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const holidays = [{ id: 1, date: "2026-11-03", label: "文化の日", scope: ["全部"], targetGrades: [], subjKeywords: [] }];
const examPeriods = [
  {
    id: 7,
    name: "テスト直前特訓",
    startDate: "2026-11-17",
    endDate: "2026-11-26",
    targetGrades: ["中1", "中2"],
    classExceptions: [{ date: "2026-11-21", grades: ["中2"] }],
  },
  { id: 8, name: "高校 期末", startDate: "2026-12-08", endDate: "2026-12-08", targetGrades: [], stopsClasses: false },
];
const specialEvents = [
  { id: 3, name: "第2回保護者会", startDate: "2026-11-28", endDate: "2026-12-06", eventType: "parents", targetGrades: [], memo: "" },
];
const yobiko = [
  { id: 1, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" },
  { id: 2, name: "スポーツの日", startDate: "2026-10-12", endDate: "2026-10-12", kind: "closed" },
  { id: 3, name: "冬期講習Ⅰ期", startDate: "2026-12-24", endDate: "2026-12-27", kind: "event", source: "予備校2026" },
  { id: 4, name: "進研模試(記述)", startDate: "2026-10-10", endDate: "2026-10-10", kind: "event", source: "予備校2026" },
];

function Harness({
  initial = yobiko,
  isAdmin = true,
  onSaveSpy,
  onEditGenyakuEvent,
  adminRef,
  exams = examPeriods,
  events = specialEvents,
}) {
  const [list, setList] = useState(initial);
  const [admin, setAdmin] = useState(isAdmin);
  if (adminRef) adminRef.current = setAdmin;
  isAdmin = admin;
  return (
    <YearCalendarView
      yobikoEvents={list}
      onSaveYobikoEvents={
        isAdmin
          ? (next) => {
              onSaveSpy?.(next);
              setList(next);
            }
          : undefined
      }
      holidays={holidays}
      examPeriods={exams}
      specialEvents={events}
      isAdmin={isAdmin}
      onEditGenyakuEvent={onEditGenyakuEvent}
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

const month = (label) => screen.getByRole("region", { name: label });

describe("YearCalendarView", () => {
  it("既定は今月から 3 か月。週ごとに 予備校部 / 現役部 の段が並ぶ", () => {
    renderView();
    expect(screen.getByText("2026年10月〜12月")).toBeTruthy();
    const oct = month("2026年10月");
    expect(within(oct).getAllByRole("rowheader", { name: "予備校部" }).length).toBe(5);
    expect(within(oct).getAllByRole("rowheader", { name: "現役部" }).length).toBe(5);
    // 予備校部: 名前の無い休校日は日付の塗りと短い名前だけ、名前のある休校日は欄にも
    expect(within(oct).getAllByText("休校").length).toBe(2);
    expect(within(oct).getByText("スポーツの日")).toBeTruthy();
    expect(within(oct).getByText("進研模試(記述)")).toBeTruthy();
    // 現役部: 休講・テスト期間 (対象つき)・特別イベント
    const nov = month("2026年11月");
    expect(within(nov).getByText("文化の日")).toBeTruthy();
    expect(within(nov).getByText("テスト直前特訓 (中1・中2) 〜11/26")).toBeTruthy();
    expect(within(nov).getByText("👪 第2回保護者会 〜12/6")).toBeTruthy();
    // 期間の続きの日も (画面では薄く) 同じ名前で出る
    expect(within(month("2026年12月")).getAllByText("👪 第2回保護者会").length).toBe(6);
    expect(within(month("2026年12月")).getByText("冬期講習Ⅰ期 〜12/27")).toBeTruthy();
    // テスト期間の例外日 (授業あり)・授業を止めないテスト期間は見分けが付く
    expect(within(nov).getByText("テスト直前特訓 (中1・中2) · 📖 授業あり (中2)")).toBeTruthy();
    expect(within(month("2026年12月")).getByText("高校 期末 [表示のみ]")).toBeTruthy();
  });

  it("紙面の見出しは表示中の段だけ。印刷ジョブ名は期間から", () => {
    renderView();
    const title = screen.getByRole("heading", { level: 2, hidden: true });
    expect(title.textContent).toBe("2026年10月〜12月 (上: 予備校部 / 下: 現役部)");
    expect(title.getAttribute("data-print-title")).toBe("年間カレンダー 2026年10月〜12月");
    fireEvent.click(screen.getByRole("checkbox", { name: "現役部" }));
    expect(title.textContent).toBe("2026年10月〜12月 (予備校部)");
  });

  it("段を隠せる (最後の 1 つは外せない)。期間と段は sessionStorage に残る", () => {
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: "現役部" }));
    expect(screen.queryAllByRole("rowheader", { name: "現役部" })).toHaveLength(0);
    expect(screen.getByRole("checkbox", { name: "予備校部" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1か月" }));
    expect(screen.queryByRole("region", { name: "2026年11月" })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY))).toMatchObject({
      ym: "2026-10",
      count: 1,
      lanes: { yobiko: true, genyaku: false },
    });
  });

  it("印刷の向きは既定で横。縦に切り替えられ、sessionStorage に残る", () => {
    const { container } = renderView();
    const pageRule = () => container.querySelector(".year-cal-view > style").textContent;
    const group = screen.getByRole("group", { name: "印刷の向き" });
    expect(within(group).getByRole("button", { name: "横" }).getAttribute("aria-pressed")).toBe("true");
    // 紙の大きさは書かない (印刷ダイアログで A4 / A3 / B4 を選べるように)
    expect(pageRule()).toMatch(/@page\s*\{\s*size:\s*landscape;/);
    fireEvent.click(within(group).getByRole("button", { name: "縦" }));
    expect(pageRule()).toMatch(/@page\s*\{\s*size:\s*portrait;/);
    expect(pageRule()).not.toMatch(/landscape/);
    expect(JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY))).toMatchObject({ orient: "portrait" });
  });

  it("保存された向きが読めなければ横に戻す", () => {
    sessionStorage.setItem(SS_YEAR_CAL_KEY, JSON.stringify({ ym: "2026-10", count: 1, orient: "sideways" }));
    renderView();
    const group = screen.getByRole("group", { name: "印刷の向き" });
    expect(within(group).getByRole("button", { name: "横" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("年度ボタンで 4 月〜3 月の 12 か月。◀ / ▶ は 1 年ずつ", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "年度" }));
    expect(screen.getByText("2026年4月〜2027年3月")).toBeTruthy();
    expect(screen.getByRole("region", { name: "2027年3月" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(screen.getByText("2027年4月〜2028年3月")).toBeTruthy();
    expect(screen.getByRole("button", { name: "年度" }).getAttribute("aria-pressed")).toBe("true");
    // 今月 (t) は 12 か月の表示では今年度へ
    fireEvent.click(screen.getByRole("button", { name: "今月" }));
    expect(screen.getByText("2026年4月〜2027年3月")).toBeTruthy();
  });

  it("「年度」は今日ではなく見ている月の年度 (3 月に来年度を見る)", () => {
    sessionStorage.setItem(SS_YEAR_CAL_KEY, JSON.stringify({ ym: "2027-05", count: 1 }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "年度" }));
    expect(screen.getByText("2027年4月〜2028年3月")).toBeTruthy();
    // まとめて登録の年度の既定も見ている年度
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    expect(screen.getByLabelText("年度").value).toBe("2027");
  });

  it("管理者: 日付の「＋」から追加、一覧から削除して元に戻せる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(screen.getByRole("button", { name: "2026-10-31 (土) に予備校部の予定を追加" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を追加" });
    expect(within(dialog).getByLabelText("開始日").value).toBe("2026-10-31");
    // 行事は名称が要る
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("名称を入れてください");
    fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "進研模試(マーク)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(month("2026年10月")).getByText("進研模試(マーク)")).toBeTruthy();

    // 一覧の削除 → 元に戻す
    const panel = screen.getByRole("region", { name: "予備校部の予定の登録" });
    fireEvent.click(within(panel).getByRole("button", { name: "「進研模試(記述)」を削除" }));
    expect(within(month("2026年10月")).queryByText("進研模試(記述)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(within(month("2026年10月")).getByText("進研模試(記述)")).toBeTruthy();
  });

  it("管理者: 一番新しい予定を消してすぐ足しても、消した方を元に戻せる (id を使い回さない)", () => {
    renderView();
    const panel = screen.getByRole("region", { name: "予備校部の予定の登録" });
    // id 4 (最大) を消す
    fireEvent.click(within(panel).getByRole("button", { name: "「進研模試(記述)」を削除" }));
    fireEvent.click(within(panel).getByRole("button", { name: "＋ 追加" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を追加" });
    fireEvent.change(within(dialog).getByLabelText("開始日"), { target: { value: "2026-10-20" } });
    fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "新しい予定" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    fireEvent.click(screen.getAllByRole("button", { name: "元に戻す" })[0]);
    expect(within(month("2026年10月")).getByText("進研模試(記述)")).toBeTruthy();
    expect(within(month("2026年10月")).getByText("新しい予定")).toBeTruthy();
  });

  it("開いている間に管理者でなくなったら、ダイアログを閉じる (保存できないまま残さない)", () => {
    const adminRef = { current: null };
    renderView({ adminRef });
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => adminRef.current(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("管理者: 欄の予定をクリックすると編集。休校日は名称なしで登録できる", () => {
    renderView();
    fireEvent.click(within(month("2026年10月")).getByRole("button", { name: "スポーツの日" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を編集" });
    fireEvent.change(within(dialog).getByLabelText("名称 (任意)"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "更新" }));
    // 欄からは消え、日付の「休校」だけが残る
    expect(within(month("2026年10月")).queryByText("スポーツの日")).toBeNull();
    expect(within(month("2026年10月")).getAllByText("休校").length).toBe(2);
  });

  it("管理者: まとめて登録 → 確認 → 登録", () => {
    renderView({ initial: [] });
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog", { name: "📋 予備校部の予定をまとめて登録" });
    fireEvent.change(within(dialog).getByLabelText("貼り付ける表 (TSV)"), {
      target: { value: "開始日\t終了日\t種別\t名称\tメモ\n10/18\t\t休校日\t\t\n10/19\t\t行事\tダブル授業(5校時迄)\t\n10/20\t\t祝日\tx\t" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    expect(within(dialog).getByRole("status").textContent).toMatch("OK 2 件 / 重複 0 件 / エラー 1 件");
    fireEvent.click(within(dialog).getByRole("button", { name: "2 件を登録" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(month("2026年10月")).getByText("ダブル授業(5校時迄)")).toBeTruthy();
    expect(within(month("2026年10月")).getByText("休校")).toBeTruthy();
  });

  it("管理者: 現役部の記録をクリックすると種類と id で編集画面へ", () => {
    const onEdit = vi.fn();
    renderView({ onEditGenyakuEvent: onEdit });
    fireEvent.click(within(month("2026年11月")).getByRole("button", { name: "文化の日" }));
    expect(onEdit).toHaveBeenCalledWith("holiday", 1);
  });

  it("閲覧者: 見るだけ (追加・編集・一覧の道具を出さない)", () => {
    renderView({ isAdmin: false, onEditGenyakuEvent: vi.fn() });
    expect(screen.queryByRole("button", { name: /予備校部の予定を追加/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "予備校部の予定の登録" })).toBeNull();
    expect(within(month("2026年11月")).queryByRole("button", { name: "文化の日" })).toBeNull();
    expect(within(month("2026年11月")).getByText("文化の日")).toBeTruthy();
  });
});

// 付録 B (2026 年度の桜井・第一) をまとめて登録の経路で読み込む。学校タグの無い
// 「授業を止めない」テスト期間 (examPeriods の id 8) は従来どおり 1 件ずつ出る
const schoolExams = [
  ...examPeriods,
  ...buildImportedExamPeriods(parseExamPeriodImport(SCHOOL_EXAM_TSV, { fiscalYear: 2026 }).rows, {
    startId: 100,
  }),
];
const schoolEvents = [
  ...specialEvents,
  ...buildImportedEvents(parseSpecialEventImport(SCHOOL_MOCK_TSV, { fiscalYear: 2026 }).rows, {
    startId: 100,
  }),
];
const viewAt = (state) => sessionStorage.setItem(SS_YEAR_CAL_KEY, JSON.stringify(state));
const renderSchool = (props) => renderView({ exams: schoolExams, events: schoolEvents, ...props });
// その日の学校バッジ (aria-label は「11/26 (木) 桜井 …」)
const chipsOn = (md) =>
  screen
    .queryAllByRole("button", { name: new RegExp(`^${md.replace(/[()/]/g, "\\$&")} `) })
    .filter((b) => b.classList.contains("ycs-chip"))
    .map((b) => b.textContent);

describe("YearCalendarView: 学校の考査・模試", () => {
  it("11 月: 現役部の欄の先頭に学校ごとのバッジ 1 行。考査期間の毎日に名前が並ばない", () => {
    viewAt({ ym: "2026-11", count: 1 });
    renderSchool();
    expect(chipsOn("11/19 (木)")).toEqual(["桜井 発表"]);
    expect(chipsOn("11/20 (金)")).toEqual(["桜井"]);
    expect(chipsOn("11/25 (水)")).toEqual(["桜井", "第一 発表"]);
    expect(chipsOn("11/26 (木)")).toEqual(["桜井❶", "第一"]);
    expect(chipsOn("11/28 (土)")).toEqual(["桜井", "第一"]);
    expect(chipsOn("11/30 (月)")).toEqual(["桜井❸", "第一"]);
    // 状態は見た目 (class) と aria-label の全文で読める
    const [kimatsu] = screen.getAllByRole("button", { name: /^11\/27 \(金\) 桜井/ });
    expect(kimatsu.getAttribute("aria-label")).toBe("11/27 (金) 桜井 2学期期末（高校部）考査2日目 11/26〜12/2");
    expect(kimatsu.className).toContain("ycs-chip--exam");
    // バッジにした記録は 1 件ずつ出さない。学校タグの無いテスト期間・休講・他の種別は従来どおり
    const nov = month("2026年11月");
    expect(within(nov).queryByText(/桜井2学期期末/)).toBeNull();
    expect(within(nov).getByText("文化の日")).toBeTruthy();
    expect(within(nov).getByText("👪 第2回保護者会 〜12/6")).toBeTruthy();
    // 模試のある日は「模」の小札 (11/7 は第一の 1・2年進研記述。冠模試は既定で出さない)
    expect(chipsOn("11/7 (土)")).toEqual(["第一模"]);
  });

  it("12 月: 12/2 は桜井❺と第一❶、12/3 は第一の休み、12/8 は第一❹", () => {
    viewAt({ ym: "2026-12", count: 1 });
    renderSchool();
    expect(chipsOn("12/2 (水)")).toEqual(["桜井❺", "第一❶"]);
    expect(chipsOn("12/3 (木)")).toEqual(["第一"]);
    expect(screen.getAllByRole("button", { name: /^12\/3 \(木\) 第一/ })[0].className).toContain("ycs-chip--gap");
    expect(chipsOn("12/8 (火)")).toEqual(["第一❹"]);
  });

  it("バッジを押すと内訳。管理者は記録ごとに編集へ", () => {
    viewAt({ ym: "2026-11", count: 1 });
    const onEdit = vi.fn();
    renderSchool({ onEditGenyakuEvent: onEdit });
    fireEvent.click(screen.getAllByRole("button", { name: /^11\/27 \(金\) 桜井/ })[0]);
    const pop = screen.getByRole("dialog", { name: "11/27 (金) 桜井" });
    expect(pop.textContent).toContain("考査 11/26 (木)・11/27 (金)・11/30 (月)・12/1 (火)・12/2 (水) (5日)");
    expect(pop.textContent).toContain("発表 11/19 (木)");
    fireEvent.click(within(pop).getByRole("button", { name: "桜井2学期期末 を編集" }));
    const sakuraiKimatsu = schoolExams.find((e) => e.name === "桜井2学期期末");
    expect(onEdit).toHaveBeenCalledWith("exam", sakuraiKimatsu.id);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("閲覧者も内訳は見られる (編集は出さない)", () => {
    viewAt({ ym: "2026-11", count: 1 });
    renderSchool({ isAdmin: false, onEditGenyakuEvent: vi.fn() });
    fireEvent.click(screen.getAllByRole("button", { name: /^11\/7 \(土\) 第一/ })[0]);
    const pop = screen.getByRole("dialog", { name: "11/7 (土) 第一" });
    expect(pop.textContent).toContain("1・2年進研記述（高1・高2）");
    expect(within(pop).queryByRole("button", { name: /編集/ })).toBeNull();
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("学年「高1・2」で 3 年のみの模試が消え、希望者・冠模試はオンで点線の「模」", () => {
    viewAt({ ym: "2026-10", count: 1 });
    renderSchool();
    expect(chipsOn("10/30 (金)")).toEqual(["桜井模", "第一模"]);
    expect(chipsOn("10/24 (土)")).toEqual(["桜井模"]);
    const filters = screen.getByRole("group", { name: "学校の予定" });
    fireEvent.click(within(filters).getByRole("button", { name: "高1・2" }));
    expect(chipsOn("10/30 (金)")).toEqual([]);
    expect(chipsOn("10/31 (土)")).toEqual(["桜井模"]);
    fireEvent.click(within(filters).getByRole("button", { name: "全学年" }));
    fireEvent.click(within(filters).getByRole("checkbox", { name: "希望者・冠模試" }));
    expect(chipsOn("10/24 (土)")).toEqual(["桜井模", "第一模"]);
    const daiichi = screen.getAllByRole("button", { name: /^10\/24 \(土\) 第一/ })[0];
    expect(daiichi.querySelector(".ycs-mk--opt")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY)).schoolFilter).toEqual({
      grade: "all",
      exam: true,
      mock: true,
      optional: true,
    });
    // 種類のチェックを外すとバッジにならない (1 件ずつにも戻らない)
    fireEvent.click(within(filters).getByRole("checkbox", { name: "模試" }));
    expect(chipsOn("10/24 (土)")).toEqual([]);
    expect(within(month("2026年10月")).queryByText(/全統マーク模試/)).toBeNull();
  });

  it("表示「学校別」: 学校の行のタイムライン。考査日が 2 校重なるのは 10/13〜16 と 12/2 だけ", () => {
    renderSchool();
    fireEvent.click(screen.getByRole("button", { name: "学校別" }));
    expect(screen.queryByRole("region", { name: "2026年10月" })).toBeNull();
    expect(screen.getByRole("group", { name: "桜井 の考査・模試" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "第一 の考査・模試" })).toBeTruthy();
    expect(screen.getByText("考査日が 2 校以上重なる日: 10/13〜16、12/2")).toBeTruthy();
    // 段の切替はカレンダーだけのもの
    expect(screen.queryByRole("group", { name: "表示する段" })).toBeNull();
    const title = screen.getByRole("heading", { level: 2, hidden: true });
    expect(title.textContent).toBe("2026年10月〜12月 (学校別の考査・模試)");
    expect(title.getAttribute("data-print-title")).toBe("学校別の考査・模試 2026年10月〜12月");
    // 帯を押すと内訳
    const sakurai = screen.getByRole("group", { name: "桜井 の考査・模試" });
    fireEvent.click(within(sakurai).getByRole("button", { name: /^桜井 2学期期末（高校部）/ }));
    expect(screen.getByRole("dialog", { name: "桜井 2学期期末" }).textContent).toContain("発表 11/19 (木)");
    // 絞り込みも効く (高3 → 12/2 の重なりは残る)
    fireEvent.click(within(screen.getByRole("group", { name: "学校の予定" })).getByRole("button", { name: "高3" }));
    expect(JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY))).toMatchObject({
      display: "school",
      schoolFilter: { grade: "3" },
    });
    expect(title.textContent).toBe("2026年10月〜12月 (学校別の考査・模試 / 高3)");
  });

  it("学校の記録が無ければ学校別は案内だけ", () => {
    viewAt({ ym: "2026-10", count: 1, display: "school" });
    renderView();
    expect(screen.getByText(/この期間に表示する学校の考査・模試はありません/)).toBeTruthy();
  });

  it("sessionStorage の表示・絞り込みが読めなければ既定に戻す", () => {
    viewAt({ ym: "2026-11", count: 1, display: "gantt", schoolFilter: { grade: "高1", exam: "x", optional: 1 } });
    renderSchool();
    expect(screen.getByRole("button", { name: "カレンダー" }).getAttribute("aria-pressed")).toBe("true");
    const filters = screen.getByRole("group", { name: "学校の予定" });
    expect(within(filters).getByRole("button", { name: "全学年" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(filters).getByRole("checkbox", { name: "発表〜考査" }).checked).toBe(true);
    expect(within(filters).getByRole("checkbox", { name: "希望者・冠模試" }).checked).toBe(false);
  });
});

