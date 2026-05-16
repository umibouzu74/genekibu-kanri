/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind を timetable-builder/ 配下にだけ限定する。
  // 親アプリは inline style ベースなので、Tailwind ユーティリティが
  // 親側で意図せず効くことは避けたい。
  content: ["./src/timetable-builder/**/*.{js,jsx}"],
  // 親側の <h1> や <button> などへ Tailwind preflight が当たらないよう、
  // base レイヤは tailwind.css 側で読み込まない方針にしている。
  theme: {
    extend: {},
  },
  plugins: [],
};
