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
