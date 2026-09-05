// ⚙ 全体設定モーダルのタブで共有する小物。タブ本体は同じ階層の *Tab.jsx。

export const CHIP_DELETE_BTN =
  "border-0 bg-transparent cursor-pointer text-[10px] text-builder-ink-subtle hover:text-builder-red p-0";
export const SECTION_HEAD = "text-xs font-bold text-builder-ink";

// 配列の idx 番目を delta だけ前後に入れ替える (範囲外なら元の配列のまま)。
export function move(list, idx, delta) {
  const next = [...list];
  const to = idx + delta;
  if (to < 0 || to >= next.length) return list;
  [next[idx], next[to]] = [next[to], next[idx]];
  return next;
}

// 講師マスタの 1 人を fn で書き換える saveProject ラッパ。講師タブ (よみ・
// 担当科目) と NG・上限タブが同じ更新を書くので 1 か所に置く。
export const updateTeacherIn = (saveProject) => (name, fn) =>
  saveProject((p) => ({
    ...p,
    teachers: p.teachers.map((t) => (t.name === name ? fn(t) : t)),
  }));
