// ─── Dashboard section definitions ─────────────────────────────────
// Splits today's / tomorrow's schedule into three columns on the
// dashboard and master views.
import { gradeToDept, isKameiRoom } from "../data";

export const DASH_SECTIONS = [
  {
    key: "中学部",
    label: "中学部",
    dept: "中学部",
    filterFn: (s) => gradeToDept(s.grade) === "中学部",
  },
  {
    key: "高校本校",
    label: "高校部・本校",
    dept: "高校部",
    filterFn: (s) => gradeToDept(s.grade) === "高校部" && !isKameiRoom(s.room),
  },
  {
    key: "高校亀井町",
    label: "高校部・亀井町",
    dept: "高校部",
    filterFn: (s) => gradeToDept(s.grade) === "高校部" && isKameiRoom(s.room),
  },
];

// ─── Day-aware section definitions (for timetable grid) ────────────
// Wednesday and Saturday have special layouts; other days use defaults.

const isPrep = (s) => s.note?.includes("プレップ") || s.subj?.includes("プレップ");
const isMarkTest = (s) => s.subj?.includes("マークテスト");
const isFuzoku = (s) => s.grade.includes("附中");

const KOKO_SECTIONS = [
  {
    key: "高校本校",
    label: "高校部・本校",
    dept: "高校部",
    filterFn: (s) => gradeToDept(s.grade) === "高校部" && !isKameiRoom(s.room),
  },
  {
    key: "高校亀井町",
    label: "高校部・亀井町",
    dept: "高校部",
    filterFn: (s) => gradeToDept(s.grade) === "高校部" && isKameiRoom(s.room),
  },
];

const PREP_COLOR = { b: "#d8e8f0", f: "#2a4a6a", accent: "#5a8ab0" };
const MARKTEST_COLOR = { b: "#e8e0f0", f: "#4a2a6a", accent: "#7a5a9a" };

const WED_SECTIONS = [
  {
    key: "中3",
    label: "中3",
    dept: "中学部",
    filterFn: (s) => gradeToDept(s.grade) === "中学部" && !isFuzoku(s),
  },
  {
    key: "附属",
    label: "附属",
    dept: "中学部",
    filterFn: (s) => gradeToDept(s.grade) === "中学部" && isFuzoku(s),
  },
  ...KOKO_SECTIONS,
];

const SAT_SECTIONS = [
  {
    key: "プレップ",
    label: "プレップ",
    dept: null,
    color: PREP_COLOR,
    filterFn: (s) => isPrep(s),
  },
  {
    key: "中学部",
    label: "中学部",
    dept: "中学部",
    filterFn: (s) => gradeToDept(s.grade) === "中学部" && !isPrep(s),
  },
  {
    key: "高校本校",
    label: "高校部・本校",
    dept: "高校部",
    filterFn: (s) =>
      gradeToDept(s.grade) === "高校部" &&
      !isKameiRoom(s.room) &&
      !isMarkTest(s) &&
      !isPrep(s),
  },
  {
    key: "高校亀井町",
    label: "高校部・亀井町",
    dept: "高校部",
    filterFn: (s) =>
      gradeToDept(s.grade) === "高校部" &&
      isKameiRoom(s.room) &&
      !isMarkTest(s) &&
      !isPrep(s),
  },
  {
    key: "マークテスト",
    label: "マークテスト",
    dept: null,
    color: MARKTEST_COLOR,
    filterFn: (s) => isMarkTest(s),
  },
];

const SECTION_MAP = { 水: WED_SECTIONS, 土: SAT_SECTIONS };

export function getDashSections(day) {
  return SECTION_MAP[day] || DASH_SECTIONS;
}
