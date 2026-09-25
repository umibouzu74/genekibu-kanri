// @vitest-environment jsdom
// タイムテーブルのセルをキーボードだけで操作できること (2026-09-04)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExcelCell } from "./ExcelCell";

afterEach(cleanup);

const SLOT = {
  id: 1,
  day: "火",
  time: "19:50-20:35",
  grade: "中3",
  cls: "S",
  subj: "数学",
  teacher: "堀上",
  note: "",
};

function renderCell(props = {}) {
  render(
    <table>
      <tbody>
        <tr>
          <ExcelCell slot={SLOT} biweeklyAnchors={[]} holidays={[]} examPeriods={[]} {...props} />
        </tr>
      </tbody>
    </table>
  );
}

describe("ExcelCell のキーボード操作", () => {
  it("管理者の通常モードでは Enter で編集 (ダブルクリック相当) を開く", () => {
    const onEdit = vi.fn();
    renderCell({ isAdmin: true, onEdit, sessionNumber: 3 });
    const cell = screen.getByRole("button", { name: /中3 S 数学 堀上 第3回 を編集/ });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledWith(SLOT);
  });

  it("代行モードでは Enter でクリック相当 (セルの矩形と要素を渡す)", () => {
    const onCellClick = vi.fn();
    renderCell({ isAdmin: true, isSubMode: true, onCellClick });
    const cell = screen.getByRole("button");
    fireEvent.keyDown(cell, { key: " " });
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const [slot, rect, el] = onCellClick.mock.calls[0];
    expect(slot).toBe(SLOT);
    expect(rect).toBeTruthy();
    expect(el).toBe(cell);
  });

  it("閲覧者の通常モードでは操作が無いので button にしない", () => {
    renderCell({ isAdmin: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("欠勤・休講の状態を読み上げ名に含める", () => {
    renderCell({
      isAdmin: true,
      onEdit: vi.fn(),
      existingSubs: [{ originalTeacher: "堀上", substitute: "", status: "requested" }],
    });
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/代行未定/);
  });
});

describe("ExcelCell の講師重複", () => {
  const conflict = {
    teacher: "福江",
    role: "sub",
    other: { id: 2, grade: "中3", cls: "A", subj: "理科" },
    otherTime: "19:50-20:35",
    otherRole: "sub",
  };
  it("バッジとセル内の 1 行で出し、読み上げ名にも含める (tooltip だけにしない)", () => {
    renderCell({
      isAdmin: true,
      onEdit: vi.fn(),
      existingSubs: [{ originalTeacher: "堀上", substitute: "福江", status: "confirmed" }],
      teacherConflicts: [conflict],
    });
    expect(screen.getByText("⚠ 重複")).toBeInTheDocument();
    expect(screen.getByText("⚠ 福江: 中3A 理科 (代行) と重複")).toBeInTheDocument();
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/講師重複/);
  });
  it("重なりが無ければ何も出さない", () => {
    renderCell({ isAdmin: false, teacherConflicts: [] });
    expect(screen.queryByText(/重複/)).toBeNull();
  });
});

// 多担任コマ (プレップ) で 1 人だけ休むとき、残りの担当者まで休みに
// 読めないこと (2026-09-25)。
describe("ExcelCell の多担任コマの欠勤", () => {
  const PREP = {
    ...SLOT,
    grade: "中1-3",
    cls: "-",
    subj: "英語·数学·理科",
    teacher: "香川·福江·川井",
    note: "プレップ個別指導",
  };
  const renderPrep = (props = {}) =>
    render(
      <table>
        <tbody>
          <tr>
            <ExcelCell slot={PREP} biweeklyAnchors={[]} holidays={[]} examPeriods={[]} {...props} />
          </tr>
        </tbody>
      </table>
    );
  // 自分か祖先に line-through が付いているか (text-decoration は子へ伝播する)
  const isStruck = (el) => {
    for (let n = el; n && n.tagName !== "TD"; n = n.parentElement) {
      if ((n.style?.textDecoration || "").includes("line-through")) return true;
    }
    return false;
  };

  it("休む人だけに取消線を引き、出勤する人には線を通さない", () => {
    renderPrep({
      existingSubs: [{ originalTeacher: "香川", substitute: "", status: "confirmed" }],
    });
    expect(isStruck(screen.getByText("香川"))).toBe(true);
    expect(isStruck(screen.getByText("福江"))).toBe(false);
    expect(isStruck(screen.getByText("川井"))).toBe(false);
  });

  it("誰が休みかを添えて出す (「代行なし」だけだと全員に読める)", () => {
    renderPrep({
      existingSubs: [{ originalTeacher: "香川", substitute: "", status: "confirmed" }],
    });
    expect(screen.getByText("香川 休み（代行なし）")).toBeInTheDocument();
  });

  it("代行未定も同じく名前を添える", () => {
    renderPrep({
      existingSubs: [{ originalTeacher: "福江", substitute: "", status: "requested" }],
    });
    expect(screen.getByText("福江 休み（代行未定）")).toBeInTheDocument();
    expect(isStruck(screen.getByText("香川"))).toBe(false);
    expect(isStruck(screen.getByText("福江"))).toBe(true);
  });

  it("代行なしで確定だけなら赤で塗らない (コマごと止まったように見せない)", () => {
    renderPrep({
      existingSubs: [{ originalTeacher: "香川", substitute: "", status: "confirmed" }],
    });
    const td = screen.getByText("香川").closest("td");
    expect(td.style.background).not.toBe("rgb(255, 240, 240)");
  });

  it("出勤する人は名前から月間へ飛べる", () => {
    const onSelectTeacher = vi.fn();
    renderPrep({
      existingSubs: [{ originalTeacher: "香川", substitute: "", status: "confirmed" }],
      onSelectTeacher,
    });
    fireEvent.click(screen.getByRole("button", { name: "福江" }));
    expect(onSelectTeacher).toHaveBeenCalledWith("福江");
    expect(screen.queryByRole("button", { name: "香川" })).toBeNull();
  });

  it("読み上げ名にも誰の欠勤かを含める", () => {
    renderPrep({
      isAdmin: true,
      onEdit: vi.fn(),
      existingSubs: [{ originalTeacher: "香川", substitute: "", status: "confirmed" }],
    });
    expect(screen.getByRole("button", { name: /香川 代行なし/ })).toBeInTheDocument();
  });

  it("代行モードで欠勤に選んだ人も、その人だけに取消線", () => {
    renderPrep({ isUnavailable: true, unavailableNames: ["川井"] });
    expect(isStruck(screen.getByText("川井"))).toBe(true);
    expect(isStruck(screen.getByText("香川"))).toBe(false);
  });

  it("1 人担当のコマは従来どおり「代行なし」だけ", () => {
    renderCell({
      existingSubs: [{ originalTeacher: "堀上", substitute: "", status: "confirmed" }],
    });
    expect(screen.getByText("代行なし")).toBeInTheDocument();
    expect(isStruck(screen.getByText("堀上"))).toBe(true);
  });
});
