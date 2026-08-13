// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RegularGrid } from "./RegularGrid";
import { makeCellKey } from "./model";
import { makeProject } from "./testUtils";

afterEach(cleanup);

const noop = () => {};

// 高校の講座タブ (クラス名なし・教室が列見出し) を模したプロジェクト
function kozaProject() {
  return {
    ...makeProject(),
    id: 1,
    tabs: [
      {
        id: 1,
        name: "高2",
        grade: "高2",
        classes: [
          { id: 1, label: "", room: "404" },
          { id: 2, label: "", room: "405" },
        ],
        days: ["月"],
        periodIds: [1, 2],
        schedule: {
          [makeCellKey("月", 1, 1)]: { subj: "文系数学", teacher: "半田" },
        },
      },
    ],
  };
}

function renderGrid(project, over = {}) {
  return render(
    <RegularGrid
      project={project}
      day="月"
      onCellChange={noop}
      onClearCell={noop}
      onSwapCells={noop}
      conflictsByRef={new Map()}
      {...over}
    />
  );
}

describe("RegularGrid - 列見出しの教室編集", () => {
  it("教室クリックで入力に切り替わり、Enter 確定で onSetClassRoom が呼ばれる", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "404" }));
    const input = screen.getByLabelText("高2 404 の既定教室");
    fireEvent.change(input, { target: { value: "407" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 1, "407", "月");
    expect(screen.queryByLabelText("高2 404 の既定教室")).toBeNull();
  });

  it("フォーカスが外れても確定する (display-first のセル編集と同じ)", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "405" }));
    const input = screen.getByLabelText("高2 405 の既定教室");
    fireEvent.change(input, { target: { value: "406" } });
    fireEvent.blur(input);
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 2, "406", "月");
  });

  it("Escape は編集を取り消して何も呼ばない", () => {
    const onSetClassRoom = vi.fn();
    renderGrid(kozaProject(), { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "404" }));
    const input = screen.getByLabelText("高2 404 の既定教室");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSetClassRoom).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("高2 404 の既定教室")).toBeNull();
    expect(screen.getByRole("button", { name: "404" })).toBeDefined();
  });

  it("クラス名のある列は教室部分だけがクリック対象になる", () => {
    const onSetClassRoom = vi.fn();
    renderGrid({ ...makeProject(), id: 1 }, { onSetClassRoom });
    fireEvent.click(screen.getByRole("button", { name: "501" }));
    const input = screen.getByLabelText("中3 S の既定教室");
    fireEvent.change(input, { target: { value: "503" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetClassRoom).toHaveBeenCalledWith(1, 1, "503", "月");
  });

  it("onSetClassRoom が無い (印刷用など) 場合はただのテキスト表示", () => {
    renderGrid(kozaProject());
    expect(screen.queryByRole("button", { name: "404" })).toBeNull();
    expect(screen.getByText("404")).toBeDefined();
  });

  it("曜日別既定 (roomByDay) がある列は、その曜日の教室 + ＊印を見出しに出す", () => {
    const p = kozaProject();
    p.tabs[0].classes[0].roomByDay = { 月: "301" };
    renderGrid(p, { onSetClassRoom: vi.fn() });
    // 列1 は月曜だけ 301 (＊付き)、列2 は基本の 405 のまま
    expect(screen.getByRole("button", { name: "301＊" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "404" })).toBeNull();
    expect(screen.getByRole("button", { name: "405" })).toBeDefined();
    // 編集を開くと初期値はこの曜日の実効既定
    fireEvent.click(screen.getByRole("button", { name: "301＊" }));
    expect(screen.getByLabelText("高2 404 の既定教室").value).toBe("301");
  });
});

describe("RegularGrid - セクション縦積み (stackSections)", () => {
  // タブ定義順が 高2 → 中3 でも、縦積みでは 中学部 → 高校部 に揃える。
  // 時限セットは互いに素にして別セクションのまま保つ
  function mixedDeptProject() {
    return {
      ...makeProject(),
      id: 1,
      tabs: [
        {
          id: 1,
          name: "高2",
          grade: "高2",
          classes: [{ id: 1, label: "", room: "404" }],
          days: ["月"],
          periodIds: [1],
          schedule: { [makeCellKey("月", 1, 1)]: { subj: "文系数学" } },
        },
        {
          id: 2,
          name: "中3",
          grade: "中3",
          classes: [{ id: 1, label: "S", room: "501" }],
          days: ["月"],
          periodIds: [2],
          schedule: { [makeCellKey("月", 2, 1)]: { subj: "英語" } },
        },
      ],
    };
  }
  // 見出しボタンの 1 つ目の span (▸/▾ + セクション名。2 つ目はコマ数)
  const sectionNames = (container) =>
    [
      ...container.querySelectorAll(".regb-section > button > span:first-child"),
    ].map((el) => el.textContent.replace(/[▸▾]/g, "").trim());

  it("stackSections で中学部 → 高校部の順になり、親グリッドの行へ直接配置される", () => {
    const { container } = renderGrid(mixedDeptProject(), {
      stackSections: true,
      gridColumn: 2,
    });
    expect(sectionNames(container)).toEqual(["中3", "高2"]);
    // コンテナは display:contents — セクションが MultiDayView のグリッドの
    // アイテムになり、行 (2〜) を並べた曜日どうしで共有する
    expect(container.querySelector(".print-container").className).toContain(
      "contents"
    );
    const secs = [...container.querySelectorAll(".regb-section")];
    expect(secs.map((el) => el.style.gridColumn)).toEqual(["2", "2"]);
    expect(secs.map((el) => el.style.gridRow)).toEqual(["2", "3"]);
    // 横幅を曜日で分け合うため、クラス列の最小幅の下限も詰まる
    expect(screen.getByRole("columnheader", { name: /^S/ }).className).toContain(
      "min-w-[90px]"
    );
  });

  it("splitCampus で改名された手動グループ（◯◯（亀井町））も元グループのタブ定義順で並ぶ", () => {
    // 旧実装はセクション名で元グループを引いていたため、splitCampus が
    // 「高校（亀井町）」に改名した瞬間に対応付けが外れて末尾送りになっていた
    const project = {
      ...makeProject(),
      id: 1,
      tabs: [
        {
          id: 1,
          name: "高1",
          grade: "高1",
          group: "高校",
          classes: [
            { id: 1, label: "", room: "402" },
            { id: 2, label: "", room: "亀21" },
          ],
          days: ["月"],
          periodIds: [1],
          schedule: {
            [makeCellKey("月", 1, 1)]: { subj: "英語" },
            [makeCellKey("月", 1, 2)]: { subj: "数学" },
          },
        },
        {
          id: 2,
          name: "高2",
          grade: "高2",
          group: "選択",
          classes: [{ id: 1, label: "", room: "403" }],
          days: ["月"],
          periodIds: [1],
          schedule: { [makeCellKey("月", 1, 1)]: { subj: "国語" } },
        },
      ],
    };
    const { container } = renderGrid(project, {
      stackSections: true,
      splitCampus: true,
    });
    expect(sectionNames(container)).toEqual(["高校", "高校（亀井町）", "選択"]);
  });

  it("同じ部のセクションは曜日をまたいで同じ並びになる (タブ定義順)", () => {
    // 手動グループ「本校」「亀井町」。月曜に居るのは 亀井町の高1亀 と
    // 本校の高3 だけ — その曜日での検出順は亀井町が先だが、縦積みでは
    // プロジェクト全体のタブ定義順 (本校の高1 が先頭) で本校を先にする
    const project = {
      ...makeProject(),
      id: 1,
      tabs: [
        {
          id: 1,
          name: "高1",
          grade: "高1",
          group: "本校",
          classes: [{ id: 1, label: "", room: "408" }],
          days: ["木"],
          periodIds: [1],
          schedule: { [makeCellKey("木", 1, 1)]: { subj: "英語" } },
        },
        {
          id: 2,
          name: "高1亀",
          grade: "高1",
          group: "亀井町",
          classes: [{ id: 1, label: "", room: "亀42" }],
          days: ["月", "木"],
          periodIds: [1],
          schedule: { [makeCellKey("月", 1, 1)]: { subj: "数学" } },
        },
        {
          id: 3,
          name: "高3",
          grade: "高3",
          group: "本校",
          classes: [{ id: 1, label: "", room: "701" }],
          days: ["月"],
          periodIds: [1],
          schedule: { [makeCellKey("月", 1, 1)]: { subj: "国語" } },
        },
      ],
    };
    const { container } = renderGrid(project, { stackSections: true });
    expect(sectionNames(container)).toEqual(["本校", "亀井町"]);
    // 通常表示は従来どおりその曜日での検出順 (亀井町の高1亀 が先)
    cleanup();
    const { container: plain } = renderGrid(project);
    expect(sectionNames(plain)).toEqual(["亀井町", "本校"]);
  });

  it("通常表示はタブ定義順のまま", () => {
    const { container } = renderGrid(mixedDeptProject());
    expect(sectionNames(container)).toEqual(["高2", "中3"]);
    expect(container.querySelector(".print-container").className).toContain(
      "flex-wrap"
    );
    expect(screen.getByRole("columnheader", { name: /^S/ }).className).toContain(
      "min-w-[125px]"
    );
  });
});

describe("RegularGrid - グリッド横断 D&D (週表示・セット編集の別曜日)", () => {
  // 別グリッド発のドラッグは dragSource (ローカル state) が null のまま
  // dataTransfer のカスタム型 (text/x-regb-cell-<projectId>) だけで届く
  const external = (ref, projectId = 1) => ({
    dataTransfer: {
      types: [`text/x-regb-cell-${projectId}`],
      getData: (t) => (t === `text/x-regb-cell-${projectId}` ? ref : ""),
      setData: () => {},
    },
  });

  it("別グリッドからのドロップで onSwapCells が呼ばれる", () => {
    const onSwapCells = vi.fn();
    renderGrid({ ...makeProject(), id: 1 }, { onSwapCells });
    const target = document.getElementById(`regb-1:${makeCellKey("月", 1, 2)}-cell`);
    fireEvent.drop(target, external(`1:${makeCellKey("火", 1, 1)}`));
    expect(onSwapCells).toHaveBeenCalledWith(
      `1:${makeCellKey("火", 1, 1)}`,
      `1:${makeCellKey("月", 1, 2)}`
    );
  });

  it("別プロジェクトの型 (別ウィンドウ) やロック中セルへのドロップは無視する", () => {
    const onSwapCells = vi.fn();
    const p = { ...makeProject(), id: 1 };
    p.tabs[0].schedule[makeCellKey("月", 2, 1)] = { subj: "理科", locked: true };
    renderGrid(p, { onSwapCells });
    // 型のプロジェクト id が違う → 受け付けない
    fireEvent.drop(
      document.getElementById(`regb-1:${makeCellKey("月", 1, 2)}-cell`),
      external(`1:${makeCellKey("火", 1, 1)}`, 99)
    );
    // ロック中のセルへは落とせない
    fireEvent.drop(
      document.getElementById(`regb-1:${makeCellKey("月", 2, 1)}-cell`),
      external(`1:${makeCellKey("火", 1, 1)}`)
    );
    expect(onSwapCells).not.toHaveBeenCalled();
  });
});

describe("RegularGrid - 紙面レイアウトの目印", () => {
  it("時間列 (見出し・行見出し) に regb-timecol が付く", () => {
    // 紙面では table-layout:fixed が幅指定の無い列を等分するため、この印を
    // 頼りに時間列だけ実寸で固定する (printStyle.js)。印が落ちると時間列の
    // 幅がセクションの列数で変わり、時刻が隣の列へはみ出す
    const { container } = renderGrid({ ...makeProject(), id: 1 });
    expect(
      container.querySelector("thead .regb-timecol")?.textContent
    ).toBe("時間");
    expect(container.querySelector("tbody .regb-timecol")?.textContent).toContain(
      "1限"
    );
  });

  it("時限が多い (11 行以上) セクションだけ regb-section-tall が付く", () => {
    // 1 ページに収まらない表で break-inside: avoid を効かせたままだと
    // Chromium が空きページを作った末に結局分断するため、背の高い
    // セクションは素直に分断させる (printStyle.js)
    const short = renderGrid({ ...makeProject(), id: 1 });
    expect(short.container.querySelector(".regb-section-tall")).toBeNull();
    cleanup();

    const periods = [];
    const schedule = {};
    for (let i = 1; i <= 11; i++) {
      periods.push({ id: i, label: `${i}限`, time: `${7 + i}:00-${7 + i}:45` });
      schedule[makeCellKey("月", i, 1)] = { subj: "数学" };
    }
    const project = {
      ...makeProject(),
      id: 1,
      periods,
      tabs: [
        {
          id: 1,
          name: "中3",
          grade: "中3",
          classes: [{ id: 1, label: "S", room: "501" }],
          days: ["月"],
          periodIds: periods.map((p) => p.id),
          schedule,
        },
      ],
    };
    const tall = renderGrid(project);
    expect(tall.container.querySelector(".regb-section-tall")).not.toBeNull();
  });
});
