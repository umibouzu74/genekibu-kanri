// ─── テスト用フィクスチャ ───────────────────────────────────────────
// *.test.js から共有する。テストファイル同士で import し合うと describe が
// 二重登録されて件数が水増しされるため、fixture は必ずこのファイルに置く。

import { createDefaultProject, makeCellKey } from "./model";

export function makeProject(over = {}) {
  return {
    ...createDefaultProject(),
    name: "2026 後期",
    periods: [
      { id: 1, label: "1限", time: "18:00-18:45" },
      { id: 2, label: "2限", time: "18:55-19:40" },
      { id: 3, label: "確認テスト", time: "20:40-20:55" },
    ],
    teachers: [{ name: "堀上" }, { name: "半田" }],
    tabs: [
      {
        id: 1,
        name: "中3",
        grade: "中3",
        classes: [
          { id: 1, label: "S", room: "501" },
          { id: 2, label: "A", room: "502" },
        ],
        days: ["月", "火"],
        periodIds: [1, 2],
        schedule: {
          [makeCellKey("月", 1, 1)]: { subj: "数学", teacher: "半田" },
          [makeCellKey("月", 2, 2)]: { subj: "英語", teacher: "堀上", room: "601", note: "合同" },
        },
      },
    ],
    ...over,
  };
}
