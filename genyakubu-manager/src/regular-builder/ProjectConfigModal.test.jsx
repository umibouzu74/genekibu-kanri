// @vitest-environment jsdom
// ⚙ 全体設定モーダルのスモーク: 5 タブが描け、各タブの主な操作が saveProject に
// 期待どおりの更新を渡すことを固定する (タブ分割時の回帰防止)。
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProjectConfigModal } from "./ProjectConfigModal";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";
import { makeProject } from "./testUtils";

afterEach(cleanup);

// saveProject(fn) を state に適用して再描画する。テストからは current() で
// 最新の project を読む (本物の RegularBuilderApp と同じ「即時保存」の形)。
let latest = null;
function Harness({ initial, onClose, ...props }) {
  const [project, setProject] = useState(initial);
  latest = project;
  const saveProject = (fn) => {
    setProject((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      latest = next;
      return next;
    });
  };
  return (
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ProjectConfigModal
          project={project}
          saveProject={saveProject}
          slots={[]}
          masterSubjects={[]}
          onClose={onClose}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function setup(over = {}, props = {}) {
  const onClose = vi.fn();
  const utils = render(<Harness initial={makeProject(over)} onClose={onClose} {...props} />);
  return { ...utils, onClose, current: () => latest };
}

const tabButton = (name) => screen.getByRole("tab", { name });
const panel = () => screen.getByRole("tabpanel");

describe("ProjectConfigModal", () => {
  it("5 つのタブが並び、initialTab のタブが選ばれている", () => {
    setup({}, { initialTab: "rooms" });
    expect(screen.getAllByRole("tab").map((b) => b.textContent)).toEqual([
      "🕐 時限",
      "📚 科目",
      "👤 講師",
      "🏫 教室",
      "🚫 NG・上限",
    ]);
    expect(tabButton("🏫 教室")).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent("マスタに無い教室");
  });

  it("タブを順に開いてもクラッシュしない", () => {
    setup();
    for (const name of ["📚 科目", "👤 講師", "🏫 教室", "🚫 NG・上限", "🕐 時限"]) {
      fireEvent.click(tabButton(name));
      expect(tabButton(name)).toHaveAttribute("aria-selected", "true");
      expect(panel()).toBeInTheDocument();
    }
  });

  it("時限: 追加すると次の id で末尾に足される", () => {
    const { current } = setup();
    fireEvent.click(screen.getByRole("button", { name: "+ 時限を追加" }));
    expect(current().periods.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(current().periods[3].label).toBe("4限");
  });

  it("科目: Enter で追加、重複は増えない", () => {
    const { current } = setup();
    fireEvent.click(tabButton("📚 科目"));
    const input = screen.getByPlaceholderText("科目を追加");
    fireEvent.change(input, { target: { value: "地理" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(current().subjects).toContain("地理");
    const n = current().subjects.length;
    fireEvent.change(input, { target: { value: "地理" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(current().subjects.length).toBe(n);
  });

  it("講師: 追加・よみの入力・担当科目の付け外しが保存される", () => {
    const { current } = setup({ subjects: ["英語", "数学"] });
    fireEvent.click(tabButton("👤 講師"));
    fireEvent.change(screen.getByPlaceholderText("講師を追加"), { target: { value: "河野" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(current().teachers.map((t) => t.name)).toEqual(["堀上", "半田", "河野"]);

    fireEvent.change(screen.getByLabelText("堀上 のよみ"), { target: { value: "ほりかみ" } });
    expect(current().teachers[0].kana).toBe("ほりかみ");

    fireEvent.change(screen.getByLabelText("堀上 の担当科目を追加"), { target: { value: "数学" } });
    expect(current().teachers[0].subjects).toEqual(["数学"]);
  });

  it("講師: 本体のコマから取込は区切り文字を分解して重複を除く", () => {
    const { current } = setup({}, {
      slots: [
        { id: 1, teacher: "堀上·河野" },
        { id: 2, teacher: "香川・福江" },
      ],
    });
    fireEvent.click(tabButton("👤 講師"));
    fireEvent.click(screen.getByRole("button", { name: "🔗 本体のコマから取込" }));
    expect(current().teachers.map((t) => t.name)).toEqual(["堀上", "半田", "河野", "福江", "香川"]);
  });

  it("教室: マスタに無い使用中の教室が一覧され、クリックで取り込める", () => {
    const { current } = setup({ rooms: ["501"] });
    fireEvent.click(tabButton("🏫 教室"));
    const p = panel();
    expect(p).toHaveTextContent("マスタに無い教室（使用中） 2 件");
    fireEvent.click(within(p).getByRole("button", { name: /\+ 502/ }));
    expect(current().rooms).toEqual(["501", "502"]);
  });

  it("NG・上限: 曜日を複数選んで NG を足し、上限を設定・解除できる", () => {
    const { current } = setup();
    fireEvent.click(tabButton("🚫 NG・上限"));
    fireEvent.change(screen.getByLabelText("NG を設定する講師"), { target: { value: "半田" } });
    const days = screen.getByRole("group", { name: "NG の曜日 (複数選択)" });
    fireEvent.click(within(days).getByRole("button", { name: "火" }));
    fireEvent.click(within(days).getByRole("button", { name: "木" }));
    fireEvent.click(screen.getByRole("button", { name: "+ NG 追加" }));
    expect(current().teachers.find((t) => t.name === "半田").ngSlots).toEqual([
      { day: "火" },
      { day: "木" },
    ]);

    fireEvent.change(screen.getByLabelText("上限を設定する講師"), { target: { value: "堀上" } });
    fireEvent.change(screen.getByLabelText("1日の上限コマ数"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    expect(current().teachers[0].maxPerDay).toBe(3);
    expect(current().teachers[0].maxPerWeek).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "堀上 の上限を解除" }));
    expect(current().teachers[0].maxPerDay).toBeUndefined();
  });

  it("× と Escape で閉じる", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "全体設定を閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
