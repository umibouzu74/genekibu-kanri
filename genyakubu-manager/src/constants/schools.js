export const DAYS = ["月", "火", "水", "木", "金", "土"];
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export const DEPARTMENTS = ["中学部", "高校部", "予備校部"];

export const ALL_GRADES = [
  "中1", "中2", "中3", "附中1", "附中2", "附中3",
  "高1", "高2", "高3",
];

// 部門ごとの学年セット。Manager 系の「中学部一括 / 高校部一括」ボタンや
// 部門スコープ確認で参照する。`gradeToDept` の循環 import を避けるため、
// プレフィックスベースで直接定義する (附中n / 中n / 高n)。
export const MIDDLE_GRADES = ALL_GRADES.filter(
  (g) => g.startsWith("中") || g.startsWith("附中")
);
export const HIGH_GRADES = ALL_GRADES.filter((g) => g.startsWith("高"));

export const SUB_STATUS = {
  requested: { label: "依頼中", color: "#c03030", bg: "#fde4e4", border: "#f0b0b0" },
  confirmed: { label: "確定",   color: "#2a7a4a", bg: "#e0f2e4", border: "#a8d8b0" },
};

export const SUB_STATUS_KEYS = ["requested", "confirmed"];
