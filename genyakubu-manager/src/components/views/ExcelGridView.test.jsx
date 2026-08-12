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
} from "@testing-library/react";
import { ExcelGridView } from "./ExcelGridView";

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

function renderGrid(props = {}) {
  return render(
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
  );
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
describe("ExcelGridView (全曜日まとめ印刷)", () => {
  // popup の代わり。document.write された HTML を溜めて検証する。
  function fakeWindow() {
    const chunks = [];
    return {
      html: () => chunks.join(""),
      document: {
        write: (s) => chunks.push(s),
        close: () => {},
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
    // 曜日ごとに requestAnimationFrame 2 回ぶん待ってから DOM を拾うので、
    // popup への書き出しが済むまで待つ。
    await waitFor(() => expect(w.html()).not.toBe(""));
    const html = w.html();
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
    // 全曜日ぶんの差し替えが終わる (= popup へ書き出す) まで待つ
    await waitFor(() => expect(w.html()).not.toBe(""));
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
