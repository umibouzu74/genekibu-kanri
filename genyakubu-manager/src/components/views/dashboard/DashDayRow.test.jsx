// @vitest-environment jsdom
// ダッシュボード日別行の振替表示: 他日から来るコマ (休講日でも出す) と
// 他日へ出ていくコマ (「振」バッジ)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashDayRow } from "./DashDayRow";

afterEach(cleanup);

// 2026-12-07 は月曜、2026-12-04 は金曜。
const MON = "2026-12-07";
const FRI = "2026-12-04";

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
  date: MON,
  type: "reschedule",
  slotId: 1,
  targetDate: FRI,
};

function renderRow(props) {
  return render(
    <DashDayRow
      date={FRI}
      dow="金"
      holidays={[]}
      slots={[]}
      subs={[]}
      adjustments={[RESCHEDULE]}
      sessionCtx={{ allSlots: [SLOT] }}
      {...props}
    />
  );
}

describe("DashDayRow の振替表示", () => {
  it("他日から振り替えられてくるコマをバナーに出す", () => {
    renderRow();
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
    expect(screen.getByText("中3S 数学")).toBeTruthy();
  });

  it("振替先が全日休講でもバナーは消さない", () => {
    renderRow({
      holidays: [{ id: 1, date: FRI, label: "創立記念日", scope: ["全部"] }],
    });
    // 休講日メッセージと振替バナーが両方出る
    expect(screen.getByText("休講日（創立記念日）")).toBeTruthy();
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
  });

  it("振替元が複数の日にまたがっても日付ごとにまとめる", () => {
    const other = { ...SLOT, id: 2, day: "水", time: "18:00-19:20", subj: "英語" };
    renderRow({
      slots: [],
      adjustments: [
        RESCHEDULE,
        { id: 10, date: "2026-12-02", type: "reschedule", slotId: 2, targetDate: FRI },
      ],
      sessionCtx: { allSlots: [SLOT, other] },
    });
    expect(screen.getByText("↻ 2026-12-02 (水) から振替 (1件)")).toBeTruthy();
    expect(screen.getByText(`↻ ${MON} (月) から振替 (1件)`)).toBeTruthy();
  });

  it("振替元の日には「振」バッジと行き先を出す", () => {
    renderRow({ date: MON, dow: "月", slots: [SLOT] });
    const badge = screen.getByText("振");
    expect(badge.getAttribute("title")).toContain(FRI);
    // どこへ移したかをカード上でも出す (バッジの tooltip だけにしない)
    expect(screen.getByText(`→ ${FRI} (金) へ振替`)).toBeTruthy();
    // 他日から来るコマは無いのでバナーは出ない
    expect(screen.queryByText(/から振替/)).toBeNull();
  });

  it("その日のコマが全部出ていったら日単位で「振替で休み」と伝える", () => {
    const other = { ...SLOT, id: 2, time: "20:30-21:50", subj: "英語" };
    renderRow({
      date: MON,
      dow: "月",
      slots: [SLOT, other],
      adjustments: [
        RESCHEDULE,
        { id: 10, date: MON, type: "reschedule", slotId: 2, targetDate: FRI },
      ],
      sessionCtx: { allSlots: [SLOT, other] },
    });
    expect(
      screen.getByText(`↻ この日の授業は 2 コマとも ${FRI} (金) へ振替済み`)
    ).toBeTruthy();
  });

  it("1 コマでも残っていれば「振替で休み」とは言わない", () => {
    const stays = { ...SLOT, id: 2, time: "20:30-21:50", subj: "英語" };
    renderRow({
      date: MON,
      dow: "月",
      slots: [SLOT, stays],
      sessionCtx: { allSlots: [SLOT, stays] },
    });
    expect(screen.queryByText(/振替済み/)).toBeNull();
  });
});

// 日別モードでも講師の同時刻の重なりを出す (時間割モードにしか無かった)。
// 判定は utils/teacherConflicts、索引はセクション横断で日単位に組む
describe("DashDayRow の講師重複と講師名クリック", () => {
  const A = { ...SLOT, id: 11, day: "金", time: "19:50-20:35", grade: "中2", cls: "C", subj: "数学", teacher: "奥村" };
  const B = { ...SLOT, id: 12, day: "金", time: "19:50-20:35", grade: "中3", cls: "A", subj: "理科", teacher: "小見山" };
  const SUBS = [
    { id: 1, date: FRI, slotId: 11, originalTeacher: "奥村", substitute: "福江", status: "confirmed" },
    { id: 2, date: FRI, slotId: 12, originalTeacher: "小見山", substitute: "福江", status: "confirmed" },
  ];

  it("代行を入れた結果同じ人が 2 か所に居れば ⚠ の行を出す (中学部の 2 コマ)", () => {
    renderRow({ slots: [A, B], subs: SUBS, adjustments: [], sessionCtx: { allSlots: [A, B] } });
    expect(screen.getByText("⚠ 福江: 中3A 理科 (代行) と重複")).toBeTruthy();
    expect(screen.getByText("⚠ 福江: 中2C 数学 (代行) と重複")).toBeTruthy();
  });

  it("重なりが無ければ何も出さない", () => {
    renderRow({ slots: [A, B], subs: [SUBS[0]], adjustments: [], sessionCtx: { allSlots: [A, B] } });
    expect(screen.queryByText(/と重複/)).toBeNull();
  });

  it("講師名をクリックするとその講師を選べる (複数講師は 1 人ずつ)", () => {
    const onSelectTeacher = vi.fn();
    const P = { ...SLOT, id: 13, day: "金", time: "18:30-20:00", grade: "中1-3", cls: "", subj: "プレップ", teacher: "香川·福江" };
    renderRow({ slots: [P], adjustments: [], sessionCtx: { allSlots: [P] }, onSelectTeacher });
    fireEvent.click(screen.getByRole("button", { name: "福江" }));
    expect(onSelectTeacher).toHaveBeenCalledWith("福江");
  });
});

// 日別モードでも隔週コマの A/B 週を日付で解決する (時間割モードの ExcelCell と
// 同じ)。A 週 = 講師欄の主担当、B 週 = note「隔週(◯◯)」のパートナー
describe("DashDayRow の隔週コマ", () => {
  const BI = {
    ...SLOT,
    id: 21,
    day: "金",
    time: "19:00-20:20",
    grade: "中2",
    cls: "A",
    subj: "英/数",
    teacher: "堀上",
    note: "隔週(河野)",
  };
  const ANCHORS = [{ date: FRI, weekType: "A" }];
  const ctx = { allSlots: [BI], biweeklyAnchors: ANCHORS, holidays: [], examPeriods: [] };

  it("A 週は主担当と先頭の教科 + A週バッジ", () => {
    renderRow({ slots: [BI], adjustments: [], sessionCtx: ctx });
    expect(screen.getByText("A週")).toBeTruthy();
    expect(screen.getByText("英")).toBeTruthy();
    expect(screen.getByText("堀上")).toBeTruthy();
    expect(screen.queryByText("河野")).toBeNull();
    // パートナーは note の行で分かる
    expect(screen.getByText("(隔週 : 堀上 / 河野)")).toBeTruthy();
  });

  it("B 週はパートナーと 2 つ目の教科 + B週バッジ。名前クリックもパートナーで動く", () => {
    const onSelectTeacher = vi.fn();
    renderRow({
      date: "2026-12-11",
      slots: [BI],
      adjustments: [],
      sessionCtx: ctx,
      onSelectTeacher,
    });
    expect(screen.getByText("B週")).toBeTruthy();
    expect(screen.getByText("数")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "堀上" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "河野" }));
    expect(onSelectTeacher).toHaveBeenCalledWith("河野");
  });

  it("アンカー未設定なら従来どおり (バッジ無し・主担当・教科そのまま)", () => {
    renderRow({ slots: [BI], adjustments: [], sessionCtx: { allSlots: [BI] } });
    expect(screen.queryByText(/[AB]週/)).toBeNull();
    expect(screen.getByText("英/数")).toBeTruthy();
    expect(screen.getByText("堀上")).toBeTruthy();
  });

  it("隔週でないコマは変わらない", () => {
    renderRow({ slots: [SLOT], adjustments: [], sessionCtx: ctx });
    expect(screen.queryByText(/[AB]週/)).toBeNull();
    expect(screen.getByText("数学")).toBeTruthy();
    expect(screen.getByText("堀上")).toBeTruthy();
  });
});

// 追加授業バナーの行クリックで編集へ (月次・週間・イベントカレンダーと同じ導線)
describe("DashDayRow の追加授業バナー", () => {
  const LESSON = {
    id: 7,
    date: FRI,
    time: "18:30-20:00",
    grade: "中3",
    cls: "A",
    subj: "プレップ個別指導",
    teacher: "香川",
  };

  it("onEditExtraLesson があれば行をクリックして id を渡す", () => {
    const onEditExtraLesson = vi.fn();
    renderRow({ extraLessonsForDate: [LESSON], adjustments: [], onEditExtraLesson });
    fireEvent.click(screen.getByRole("button", { name: /プレップ個別指導/ }));
    expect(onEditExtraLesson).toHaveBeenCalledWith(7);
  });

  it("onEditExtraLesson が無ければ素の行 (ボタンにしない)", () => {
    renderRow({ extraLessonsForDate: [LESSON], adjustments: [] });
    expect(screen.getByText(/プレップ個別指導/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /プレップ個別指導/ })).toBeNull();
  });
});
