/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind を timetable-builder/ 配下にだけ限定する。
  // 親アプリは inline style ベースなので、Tailwind ユーティリティが
  // 親側で意図せず効くことは避けたい。
  content: ["./src/timetable-builder/**/*.{js,jsx,ts,tsx}"],
  // 親側の <h1> や <button> などへ Tailwind preflight が当たらないよう、
  // base レイヤは tailwind.css 側で読み込まない方針にしている。
  theme: {
    extend: {
      // ─── Builder design tokens (parent palette と整合) ─────────────
      // 親アプリの src/styles/tokens.js の colors と同値。Tailwind の
      // 鮮色 (bg-blue-600 等) を使うと親と「貼り付け感」が出るので、
      // Builder UI は基本これらの builder-* トークンだけを使うこと。
      colors: {
        // Brand / surface
        'builder-bg': '#f0f1f3',
        'builder-surface': '#ffffff',
        'builder-surface-alt': '#f8f9fa',
        'builder-border': '#e0e0e0',
        // Text
        'builder-ink': '#1a1a2e',
        'builder-ink-muted': '#666666',
        'builder-ink-subtle': '#888888',
        'builder-ink-ghost': '#bbbbbb',
        // Primary action (autoGenerate / 全Excel など主要 CTA)
        'builder-primary': '#1a1a2e',
        'builder-primary-hover': '#2a2a4e',
        // Accent (副次的アクション)
        'builder-blue': '#2e6a9e',
        'builder-blue-hover': '#26597f',
        'builder-green': '#2a7a4a',
        'builder-green-hover': '#21603a',
        'builder-red': '#c03030',
        'builder-red-hover': '#a02525',
        // E1e: 旧 #e67a00 は白背景で 2.94:1 と WCAG AA (4.5:1) 未達だった。
        // 白上・warning-soft 上・白文字ボタンのいずれでも AA を満たす濃いめの
        // バーントオレンジへ調整 (白との対比 5.18:1)。
        'builder-orange': '#c2410c',
        'builder-orange-hover': '#9a330a',
        // Tones (status, soft surfaces)
        'builder-danger-soft': '#fff5f5',
        'builder-danger-border': '#ffcccc',
        'builder-success-soft': '#e8f5e8',
        'builder-success-border': '#bde0bd',
        'builder-info-soft': '#eef2ff',
        'builder-info-border': '#ccd6f5',
        'builder-warning-soft': '#fffbe6',
        'builder-warning-border': '#ffe4a0',
      },
    },
  },
  plugins: [],
};
