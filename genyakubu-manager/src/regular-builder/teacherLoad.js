// ─── 講師の担当コマ数の集計 (📊 集計パネル用) ───────────────────────
// 講師 × 曜日のコマ数と週計を数え、講師マスタの上限 (maxPerDay /
// maxPerWeek) の超過を注釈する純関数。上限は入力を妨げない warning
// (講習の「上限到達で warning 色」と同じ思想)。
//
// - 複数講師 ("·" 区切り) のセルは各講師に 1 コマずつ数える
// - 設定変更で無効になった残骸セルは数えない (resolveAllEntries 基準)
// - マスタに無い講師 (取込データの直接入力など) も inMaster: false で列挙

import { REGULAR_DAYS, resolveAllEntries } from "./model";
import { splitTeacherField } from "../utils/biweekly";

/**
 * @returns {{
 *   days: string[],           // いずれかの学年が使う曜日 (REGULAR_DAYS 順)
 *   rows: {
 *     name: string,
 *     inMaster: boolean,
 *     byDay: Record<string, number>,
 *     total: number,
 *     maxPerDay: number|null,
 *     maxPerWeek: number|null,
 *     overDays: string[],     // maxPerDay を超えた曜日
 *     overWeek: boolean,      // total > maxPerWeek
 *   }[],                      // マスタ順 → マスタ外 (名前順)
 * }}
 */
export function computeTeacherLoad(project) {
  const days = REGULAR_DAYS.filter((d) =>
    (project.tabs || []).some((t) => (t.days || []).includes(d))
  );

  const counted = new Map(); // name → {byDay, total}
  for (const e of resolveAllEntries(project)) {
    for (const name of splitTeacherField(e.cell.teacher || "")) {
      if (!counted.has(name)) counted.set(name, { byDay: {}, total: 0 });
      const r = counted.get(name);
      r.byDay[e.day] = (r.byDay[e.day] || 0) + 1;
      r.total++;
    }
  }

  const finish = (name, master) => {
    const r = counted.get(name) || { byDay: {}, total: 0 };
    const maxPerDay = master?.maxPerDay ?? null;
    const maxPerWeek = master?.maxPerWeek ?? null;
    return {
      name,
      inMaster: !!master,
      byDay: r.byDay,
      total: r.total,
      maxPerDay,
      maxPerWeek,
      overDays: maxPerDay
        ? days.filter((d) => (r.byDay[d] || 0) > maxPerDay)
        : [],
      overWeek: maxPerWeek != null && r.total > maxPerWeek,
    };
  };

  const rows = [];
  for (const t of project.teachers || []) {
    rows.push(finish(t.name, t));
    counted.delete(t.name);
  }
  for (const name of [...counted.keys()].sort()) {
    rows.push(finish(name, null));
  }
  return { days, rows };
}
