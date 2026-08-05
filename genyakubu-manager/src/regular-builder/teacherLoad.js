// ─── 講師の担当コマ数の集計 (📊 集計パネル用) ───────────────────────
// 講師 × 曜日のコマ数と週計を数え、講師マスタの上限 (maxPerDay /
// maxPerWeek) の超過を注釈する純関数。上限は入力を妨げない warning
// (講習の「上限到達で warning 色」と同じ思想)。
//
// - 複数講師 ("·" 区切り) のセルは各講師に 1 コマずつ数える
// - 設定変更で無効になった残骸セルは数えない (resolveAllEntries 基準)
// - マスタに無い講師 (取込データの直接入力など) も inMaster: false で列挙

import { REGULAR_DAYS, effectiveRoom, resolveAllEntries } from "./model";
import { entryRef } from "./conflicts";
import { splitTeacherField } from "../utils/biweekly";
import { timeStartToMin } from "../utils/dateHelpers";

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

// ─── 講師 1 人の週間一覧 (👁 週間ミニビュー用) ──────────────────────

/**
 * 指定講師の担当コマを曜日ごとに開始時刻順で列挙する。ref はセルへの
 * ジャンプ (`jumpToCells`) に使える entryRef。講師マスタの NG (不在) も
 * ngByDay で返す — 割り当てる前に「入れられない時間帯」が週間で見える
 * ように (割当後の警告は conflicts 側)。
 * @returns {{
 *   days: string[],                 // いずれかの学年が使う曜日
 *   byDay: Record<string, {
 *     ref: string, time: string, periodLabel: string,
 *     tabName: string, clsLabel: string, subj: string, room: string,
 *   }[]>,
 *   ngByDay: Record<string, {time: string}[]>, // NG (不在)。time "" = 終日
 *   total: number,
 * }}
 */
export function computeTeacherWeek(project, teacherName) {
  const days = REGULAR_DAYS.filter((d) =>
    (project.tabs || []).some((t) => (t.days || []).includes(d))
  );
  const byDay = {};
  for (const d of days) byDay[d] = [];
  let total = 0;
  for (const e of resolveAllEntries(project)) {
    if (!splitTeacherField(e.cell.teacher || "").includes(teacherName)) continue;
    if (!byDay[e.day]) continue;
    byDay[e.day].push({
      ref: entryRef(e),
      time: (e.period.time || "").trim(),
      periodLabel: e.period.label || "",
      tabName: e.tab.name,
      clsLabel: e.cls.label || e.cls.room || "",
      subj: e.cell.subj || "",
      room: effectiveRoom(e),
    });
    total++;
  }
  for (const d of days) {
    byDay[d].sort((a, b) => timeStartToMin(a.time) - timeStartToMin(b.time));
  }

  // NG (不在): 使う曜日のものだけを 終日 → 時刻順 で並べる (使わない曜日の
  // NG はこのプロジェクトでは効かないため載せない)
  const master = (project.teachers || []).find((t) => t.name === teacherName);
  const ngByDay = {};
  for (const d of days) ngByDay[d] = [];
  for (const s of master?.ngSlots || []) {
    if (ngByDay[s.day]) ngByDay[s.day].push({ time: s.time || "" });
  }
  const ngOrder = (s) => (s.time ? timeStartToMin(s.time) : -1);
  for (const d of days) ngByDay[d].sort((a, b) => ngOrder(a) - ngOrder(b));

  return { days, byDay, ngByDay, total };
}
