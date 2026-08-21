// @vitest-environment jsdom
// 月次カレンダーの講習コマ反映 (講習時間割作成からの読み取り専用表示) を固定する。
// 変換ロジック自体は utils/builderLessons.test.js が担うので、ここでは
// 「本人の分だけ載る」「カットオフ日の未確定より講習カードが優先」を見る。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MonthView } from "./MonthView";

afterEach(cleanup);

const KOSHU_LESSON = {
  kind: "koshu",
  key: "1:1:1:堀上:英語",
  date: "2026-07-24",
  dateLabel: "7/24(金)",
  time: "13:00-13:45",
  periodLabel: "1限",
  teacher: "堀上",
  subj: "英語",
  countText: "②",
  grade: "中3",
  cls: "３S/３A",
  tabName: "中3",
  projectName: "2026夏期",
};

const EXTERNAL_LESSON = {
  kind: "external",
  key: "ext:10",
  date: "2026-07-24",
  dateLabel: "7/24(金)",
  time: "09:00-10:30",
  periodLabel: "",
  teacher: "堀上",
  subj: "予備校",
  grade: "",
  cls: "",
  tabName: "",
  projectName: "2026夏期",
};

const baseProps = {
  teacher: "堀上",
  slots: [],
  holidays: [],
  subs: [],
  adjustments: [],
  year: 2026,
  month: 7,
  isAdmin: false,
  timetables: [],
  displayCutoff: null,
  examPeriods: [],
  examPrepSchedules: [],
  specialEvents: [],
  extraLessons: [],
  classSets: [],
  biweeklyAnchors: [],
  sessionOverrides: [],
};

describe("MonthView 講習コマ", () => {
  it("担当講師のセルに「講」バッジ付きカードを表示する (回数連番の丸数字付き)", () => {
    render(<MonthView {...baseProps} koshuLessons={[KOSHU_LESSON]} />);
    expect(screen.getByText("講")).toBeInTheDocument();
    expect(screen.getByText("３S/３A")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    // 科目名の直後に「そのクラスで何回目か」(builder / 配布用 Excel と同じ番号)
    expect(screen.getByText(/英語②/)).toBeInTheDocument();
  });

  it("講習期間の外部授業 (予備校・高校等) は「外」バッジで表示する", () => {
    render(
      <MonthView
        {...baseProps}
        koshuLessons={[KOSHU_LESSON, EXTERNAL_LESSON]}
      />
    );
    expect(screen.getByText("外")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText(/予備校/)).toBeInTheDocument();
    // 講習コマ本体も同じセルに共存する
    expect(screen.getByText("講")).toBeInTheDocument();
  });

  it("他講師の講習コマは表示しない", () => {
    render(
      <MonthView
        {...baseProps}
        koshuLessons={[{ ...KOSHU_LESSON, teacher: "半田" }]}
      />
    );
    expect(screen.queryByText("講")).not.toBeInTheDocument();
  });

  it("カットオフ超過日でも講習コマは表示し、その日は「未確定」を出さない", () => {
    // 全学年グループの表示終了が 6/30 → 7 月の全セルがカットオフ超過
    const displayCutoff = {
      groups: [{ label: "全", grades: [], startDate: null, date: "2026-06-30" }],
    };
    render(
      <MonthView
        {...baseProps}
        displayCutoff={displayCutoff}
        koshuLessons={[KOSHU_LESSON]}
      />
    );
    expect(screen.getByText("講")).toBeInTheDocument();
    expect(screen.getByText(/英語/)).toBeInTheDocument();
    // 2026-07 は 31 日。講習コマのある 7/24 だけ「未確定」を出さない
    expect(screen.getAllByText("未確定")).toHaveLength(30);
  });
});

// 2026-12-07 は月曜、2026-12-04 は金曜。
describe("MonthView 振替で入るコマ", () => {
  const SLOT = {
    id: 1,
    day: "月",
    time: "19:00-20:20",
    grade: "中3",
    cls: "S",
    room: "602",
    subj: "数学",
    teacher: "堀上",
    note: "",
  };
  const RESCHEDULE = {
    id: 9,
    date: "2026-12-07",
    type: "reschedule",
    slotId: 1,
    targetDate: "2026-12-04",
  };
  const decProps = { ...baseProps, year: 2026, month: 12, slots: [SLOT] };

  it("振替先が全日休講でも「振」カードを消さない", () => {
    const { rerender } = render(
      <MonthView {...decProps} adjustments={[RESCHEDULE]} />
    );
    // 振替元 (12/7 の「振」バッジ) と振替先 (12/4 の振替カード) で 2 枚
    expect(screen.getAllByText("振")).toHaveLength(2);

    // 振替先を全日休講にしても枚数は変わらない (休講の巻き添えで消さない)
    rerender(
      <MonthView
        {...decProps}
        adjustments={[RESCHEDULE]}
        holidays={[
          { id: 1, date: "2026-12-04", label: "創立記念日", scope: ["全部"] },
        ]}
      />
    );
    expect(screen.getAllByText("振")).toHaveLength(2);
  });

  it("その日のコマが全部よそへ行ったら日付の横に「振替で休み」を出す", () => {
    render(<MonthView {...decProps} adjustments={[RESCHEDULE]} />);
    // 12/7 (月) だけが空になる。他の月曜は通常どおりなので 1 日分だけ
    expect(screen.getAllByText("↻ 振替で休み")).toHaveLength(1);
    // カードには行き先を出す (取消線だけだとどこへ行ったか分からない)
    expect(screen.getByText("→12/4")).toBeInTheDocument();
  });

  // 振替ピッカーは「振替先の担当」に元担当を既定で書き込んでいた。担当が
  // 自分のままの振替まで「手を離れていない」と読むと、休みの表示が丸ごと
  // 消える (2026-08-21 の再発防止)。
  it("振替先の担当が元担当のままでも「振替で休み」を出す", () => {
    render(
      <MonthView
        {...decProps}
        adjustments={[{ ...RESCHEDULE, targetTeacher: "堀上" }]}
      />
    );
    expect(screen.getAllByText("↻ 振替で休み")).toHaveLength(1);
    // 担当は変わっていないので行き先に名前は出さない
    expect(screen.getByText("→12/4")).toBeInTheDocument();
  });

  it("同じ日に残るコマがあれば「振替で休み」とは言わない", () => {
    const stays = { ...SLOT, id: 2, time: "17:30-18:50", subj: "英語" };
    render(
      <MonthView
        {...decProps}
        slots={[SLOT, stays]}
        adjustments={[RESCHEDULE]}
      />
    );
    expect(screen.queryByText("↻ 振替で休み")).not.toBeInTheDocument();
  });

  it("代行に出したコマは取消線 + 代行者名を出し、全部なら「代行で休み」", () => {
    render(
      <MonthView
        {...decProps}
        subs={[
          {
            id: 5,
            date: "2026-12-07",
            slotId: 1,
            originalTeacher: "堀上",
            substitute: "河野",
            status: "confirmed",
          },
        ]}
      />
    );
    // 誰に渡したかをカードに出す (これまでは tooltip だけだった)
    expect(screen.getByText("→ 河野")).toBeInTheDocument();
    expect(screen.getAllByText("代 代行で休み")).toHaveLength(1);
  });

  it("代行と振替が混ざった日は「担当なし」とまとめる", () => {
    const stays = { ...SLOT, id: 2, time: "17:30-18:50", subj: "英語" };
    render(
      <MonthView
        {...decProps}
        slots={[SLOT, stays]}
        adjustments={[RESCHEDULE]}
        subs={[
          {
            id: 5,
            date: "2026-12-07",
            slotId: 2,
            originalTeacher: "堀上",
            substitute: "河野",
            status: "confirmed",
          },
        ]}
      />
    );
    expect(screen.getAllByText("この日は担当なし")).toHaveLength(1);
  });

  it("他人のコマを代行する日は誰の代わりかを出す (休みにはしない)", () => {
    const other = { ...SLOT, id: 3, teacher: "河野" };
    render(
      <MonthView
        {...decProps}
        slots={[other]}
        subs={[
          {
            id: 6,
            date: "2026-12-07",
            slotId: 3,
            originalTeacher: "河野",
            substitute: "堀上",
            status: "confirmed",
          },
        ]}
      />
    );
    expect(screen.getByText("(河野 の代行)")).toBeInTheDocument();
    expect(screen.queryByText(/休み|担当なし/)).not.toBeInTheDocument();
  });

  it("担当が違う振替は表示しない", () => {
    render(
      <MonthView
        {...decProps}
        slots={[{ ...SLOT, teacher: "河野" }]}
        adjustments={[RESCHEDULE]}
      />
    );
    expect(screen.queryByText("振")).not.toBeInTheDocument();
  });
});

// 2026-12-07 は月曜。
describe("MonthView 欠勤 (代行未定) とカードの並び", () => {
  const SLOT = {
    id: 1,
    day: "月",
    time: "19:00-20:20",
    grade: "中3",
    cls: "S",
    room: "602",
    subj: "数学",
    teacher: "堀上",
    note: "",
  };
  const decProps = { ...baseProps, year: 2026, month: 12, slots: [SLOT] };

  it("代行者が未定の欠勤も「代行未定」として出す", () => {
    render(
      <MonthView
        {...decProps}
        subs={[
          {
            id: 5,
            date: "2026-12-07",
            slotId: 1,
            originalTeacher: "堀上",
            substitute: "",
            status: "requested",
          },
        ]}
      />
    );
    expect(screen.getByText("代行未定")).toBeInTheDocument();
    // 「代行で休み」だと代行者が見つかったように読めるので出し分ける
    expect(screen.getAllByText("欠 欠勤")).toHaveLength(1);
    expect(screen.queryByText("代 代行で休み")).not.toBeInTheDocument();
  });

  it("特訓シフトのカードも時系列の中に並ぶ", () => {
    render(
      <MonthView
        {...decProps}
        examPeriods={[
          {
            id: 1,
            name: "2学期期末",
            startDate: "2026-12-07",
            endDate: "2026-12-11",
            targetGrades: [],
            // 授業は続く扱い (高校テスト等)。通常コマと特訓の並びを見たい。
            stopsClasses: false,
          },
        ]}
        examPrepSchedules={[
          {
            examPeriodId: 1,
            days: [
              {
                date: "2026-12-07",
                periods: [
                  { no: 1, start: "14:00", end: "15:00" },
                  { no: 2, start: "15:10", end: "16:10" },
                ],
                assignments: { 堀上: [1, 2] },
              },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("特訓")).toBeTruthy();
    // 14:00 開始なので 19:00 の通常コマより前
    const cells = [...document.querySelectorAll(".month-print-cell")];
    const dec7 = cells.find((c) => c.textContent.startsWith("7"));
    const times = [...dec7.querySelectorAll(".month-print-card b")].map(
      (b) => b.textContent
    );
    expect(times).toEqual(["14:00", "19:00"]);
  });

  it("1 日のカードは種類をまたいで開始時刻順に並べる", () => {
    const other = { ...SLOT, id: 3, teacher: "河野", time: "17:30-18:50" };
    const { container } = render(
      <MonthView
        {...decProps}
        slots={[SLOT, other]}
        extraLessons={[
          {
            id: 7,
            date: "2026-12-07",
            time: "21:00-21:45",
            grade: "中3",
            cls: "S",
            subj: "確認テスト",
            teacher: "堀上",
          },
        ]}
        subs={[
          {
            id: 6,
            date: "2026-12-07",
            slotId: 3,
            originalTeacher: "河野",
            substitute: "堀上",
            status: "confirmed",
          },
        ]}
      />
    );
    // 12/7 のセルに 3 枚 (代行 17:30 / 通常 19:00 / 追加授業 21:00)。
    // 種類ごとに固めると 17:30 の代行が最後に来てしまう。
    const cells = [...container.querySelectorAll(".month-print-cell")];
    const dec7 = cells.find((c) => c.textContent.startsWith("7"));
    const times = [...dec7.querySelectorAll(".month-print-card b")].map(
      (b) => b.textContent
    );
    expect(times).toEqual(["17:30", "19:00", "21:00"]);
  });
});

// 1 コマを 3 人で担当するコマ (プレップ)。同じ (日付, コマ) に複数の
// 代行レコードが立つので、自分のぶんだけを見ないと他人の欠勤が自分の
// カレンダーに出る / 自分の欠勤が消える (2026-08-21)。
describe("MonthView 多担任コマの代行", () => {
  const PREP = {
    id: 5,
    day: "月",
    time: "18:30-20:00",
    grade: "中1-3",
    cls: "-",
    room: "亀73",
    subj: "英語·数学·理科",
    teacher: "香川·福江·堀上",
    note: "",
  };
  const decProps = { ...baseProps, year: 2026, month: 12, slots: [PREP] };
  const KAGAWA_ABSENT = {
    id: 1,
    date: "2026-12-07",
    slotId: 5,
    originalTeacher: "香川",
    substitute: "",
    status: "requested",
  };

  it("他の講師の欠勤を自分のカレンダーに出さない", () => {
    render(<MonthView {...decProps} subs={[KAGAWA_ABSENT]} />);
    // 堀上のカレンダー: 香川が休むだけなので堀上は通常どおり担当
    expect(screen.queryByText(/代行未定/)).toBeNull();
    expect(screen.queryByText(/休み|担当なし/)).toBeNull();
  });

  it("同じコマに 2 件あっても自分のぶんを拾う", () => {
    render(
      <MonthView
        {...decProps}
        subs={[
          KAGAWA_ABSENT,
          {
            id: 2,
            date: "2026-12-07",
            slotId: 5,
            originalTeacher: "堀上",
            substitute: "杉原",
            status: "confirmed",
          },
        ]}
      />
    );
    // 堀上のぶん (→ 杉原) が出る。香川のぶんに引きずられない
    expect(screen.getByText("→ 杉原")).toBeTruthy();
    expect(screen.getAllByText("代 代行で休み")).toHaveLength(1);
  });
});
