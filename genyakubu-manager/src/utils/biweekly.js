// ─── Biweekly helpers ──────────────────────────────────────────────

// Format a teacher name with a biweekly partner extracted from the
// free-form note field. e.g. teacher="堀上", note="隔週(河野)"
// → "堀上 / 河野".
export function formatBiweeklyTeacher(teacher, note) {
  const m = note && note.match(/隔週\(([^)]+)\)/);
  return m ? `${teacher} / ${m[1]}` : teacher;
}

// Determine whether a given date falls in an "A" week or "B" week.
//
// Accepts either:
//   - a base date string (legacy): getWeekType("2026-04-13", "2026-04-06")
//   - an array of BiweeklyAnchor objects: getWeekType("2026-04-13", [{date:"2026-04-06", weekType:"A"}])
//
// When multiple anchors are provided the most recent anchor on or before
// the target date is used as the reference point. This prevents drift
// caused by holidays or schedule disruptions — just add a new anchor
// after the disruption to re-sync.
//
// Returns "A" | "B" | null.
export function getWeekType(dateStr, anchorsOrBaseStr) {
  if (!dateStr) return null;

  // Legacy: single base-date string
  if (typeof anchorsOrBaseStr === "string") {
    return anchorsOrBaseStr ? getWeekTypeFromBase(dateStr, anchorsOrBaseStr) : null;
  }

  // New: array of anchor objects
  const anchors = anchorsOrBaseStr;
  if (!Array.isArray(anchors) || anchors.length === 0) return null;

  // Find the most recent anchor whose date is <= dateStr
  let best = null;
  for (const a of anchors) {
    if (a.date && a.date <= dateStr) {
      if (!best || a.date > best.date) best = a;
    }
  }

  if (best) return getWeekTypeFromBase(dateStr, best.date);

  // dateStr is before all anchors — use the earliest anchor and calculate backwards
  let earliest = anchors[0];
  for (const a of anchors) {
    if (a.date && a.date < earliest.date) earliest = a;
  }
  return getWeekTypeFromBase(dateStr, earliest.date);
}

// Core week-type calculation from a single base date.
function getWeekTypeFromBase(dateStr, baseStr) {
  const base = new Date(baseStr + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");
  if (isNaN(base.getTime()) || isNaN(target.getTime())) return null;
  const diffDays = Math.round((target - base) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7);
  return Math.abs(weeks) % 2 === 0 ? "A" : "B";
}

// Convenience: check if a note includes the "隔週" marker.
export function isBiweekly(note) {
  return !!note && note.includes("隔週");
}

// Determine the week type for a specific slot on a given date.
// Uses per-slot anchors when present, otherwise falls back to global anchors.
export function getSlotWeekType(dateStr, slot, globalAnchors) {
  const anchors =
    slot.biweeklyAnchors && slot.biweeklyAnchors.length > 0
      ? slot.biweeklyAnchors
      : globalAnchors;
  return getWeekType(dateStr, anchors);
}

// Returns the weight of a slot for コマ数 calculation.
// Biweekly slots count as 0.5, regular slots as 1.
export function slotWeight(note) {
  return isBiweekly(note) ? 0.5 : 1;
}

// Compute weighted slot count for an array of slots.
export function weightedSlotCount(slots) {
  let total = 0;
  for (const s of slots) total += slotWeight(s.note);
  return total;
}

// Format a weighted count for display.
// Integer → "7", fractional → "7.5".
export function formatCount(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
