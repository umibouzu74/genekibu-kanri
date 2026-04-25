// Dashboard 用の小さな定数群。
// (コンポーネントと別ファイルにすることで react-refresh の Fast Refresh 警告を回避)

export const DAY_COUNT_OPTIONS = [1, 3, 7, 14];

// 日数 → ボタン表示ラベル。1 だけ「今日」と表記して 1-click 切替を分かりやすくする。
export const DAY_COUNT_LABEL = {
  1: "今日",
  3: "3日",
  7: "1週",
  14: "2週",
};
