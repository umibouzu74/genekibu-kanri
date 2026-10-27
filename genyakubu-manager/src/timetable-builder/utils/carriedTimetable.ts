// 作り直す前の時間割の控え (project.previousTimetable) の形の確認。無依存
// (型だけ) なので scheduleKey.migrateProject から使える (timetableCopy は
// scheduleKey を import するので、そちらに置くと循環になる)。

import type { CarriedCell, CarriedTab, CarriedTimetable } from '../types';

const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

/** 保存値・外部 JSON の控えを確かめる。形にならなければ null */
export function normalizeCarriedTimetable(raw: unknown): CarriedTimetable | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.tabs)) return null;
  const tabs: CarriedTab[] = [];
  for (const t of r.tabs) {
    if (!t || typeof t !== 'object') continue;
    const tab = t as Record<string, unknown>;
    if (!isStrArray(tab.dates) || !isStrArray(tab.periods) || !isStrArray(tab.classes) || !Array.isArray(tab.cells)) continue;
    const cells: CarriedCell[] = [];
    for (const c of tab.cells) {
      if (!c || typeof c !== 'object') continue;
      const cell = c as Record<string, unknown>;
      const ok = [cell.d, cell.p, cell.c].every(n => Number.isInteger(n) && (n as number) >= 0);
      if (!ok) continue;
      if ((cell.d as number) >= tab.dates.length || (cell.p as number) >= tab.periods.length || (cell.c as number) >= tab.classes.length) continue;
      const subject = typeof cell.subject === 'string' ? cell.subject : '';
      const teacher = typeof cell.teacher === 'string' ? cell.teacher : '';
      if (!subject && !teacher) continue;
      cells.push({ d: cell.d as number, p: cell.p as number, c: cell.c as number, ...(subject ? { subject } : {}), ...(teacher ? { teacher } : {}) });
    }
    tabs.push({ name: typeof tab.name === 'string' ? tab.name : '', dates: tab.dates, periods: tab.periods, classes: tab.classes, cells });
  }
  if (tabs.length === 0) return null;
  return {
    name: typeof r.name === 'string' ? r.name : '',
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
    tabs,
  };
}
