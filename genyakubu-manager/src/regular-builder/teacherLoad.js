// ─── 講師の担当コマ数・稼働時間の集計 (📊 集計パネル用) ─────────────
// 講師 × 曜日のコマ数と週計を数え、講師マスタの上限 (maxPerDay /
// maxPerWeek) の超過を注釈する純関数。上限は入力を妨げない warning
// (講習の「上限到達で warning 色」と同じ思想)。
// コマ数と並行して稼働時間 (分) も集計する — 学年で 1 コマの長さが違う
// (中学 45 分 / 高校 60 分〜) ため、講師の負荷はコマ数より時間で見る。
//
// - 複数講師 ("·" 区切り) のセルは各講師に 1 コマずつ数える
// - 隔週コマ (note に「隔週」) は本体の slotWeight と同じ 0.5 で数え、
//   note「隔週(パートナー)」のパートナー講師にも 0.5 を計上する
//   (稼働時間も同じ 0.5 週分)
// - 設定変更で無効になった残骸セルは数えない (resolveAllEntries 基準)
// - マスタに無い講師 (取込データの直接入力など) も inMaster: false で列挙

import { REGULAR_DAYS, effectiveRoom, resolveAllEntries } from "./model";
import { entryRef } from "./conflicts";
import {
  biweeklyPartner,
  isBiweekly,
  splitTeacherField,
} from "../utils/biweekly";
import { timeStartToMin } from "../utils/dateHelpers";

// ─── 時限の所要分数 (稼働時間の集計用) ──────────────────────────────
// 時限時刻はこのサブシステム全体で "HH:MM-HH:MM" が正 (conflicts の
// TIME_RE と同じ)。書式外・時刻未設定・終了が開始以前 (入力ミス) は
// 0 分 — コマ数には数え、時間には足さない (untimedCount で注意喚起)。

const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

export function periodMinutes(time) {
  const m = String(time || "").trim().match(TIME_RANGE_RE);
  if (!m) return 0;
  const dur =
    Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
  return dur > 0 ? dur : 0;
}

/** 分数を「時:分」表示にする (45 → "0:45")。隔週 0.5 重みの端数は四捨五入 */
export function formatMinutes(min) {
  const t = Math.round(min);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * @returns {{
 *   days: string[],           // いずれかの学年が使う曜日 (REGULAR_DAYS 順)
 *   rows: {
 *     name: string,
 *     inMaster: boolean,
 *     byDay: Record<string, number>,
 *     minutesByDay: Record<string, number>, // 稼働時間 (分)。時刻未設定の時限は 0 分
 *     total: number,
 *     totalMinutes: number,   // 週の稼働時間 (分)
 *     maxPerDay: number|null,
 *     maxPerWeek: number|null,
 *     overDays: string[],     // maxPerDay を超えた曜日
 *     overWeek: boolean,      // total > maxPerWeek
 *   }[],                      // マスタ順 → マスタ外 (名前順)
 *   untimedCount: number,     // 時刻未設定の時限に載った担当コマ数 (時間に未算入)
 * }}
 */
export function computeTeacherLoad(project) {
  const days = REGULAR_DAYS.filter((d) =>
    (project.tabs || []).some((t) => (t.days || []).includes(d))
  );

  const counted = new Map(); // name → {byDay, minutesByDay, total, totalMinutes}
  const add = (name, day, weight, minutes) => {
    if (!counted.has(name)) {
      counted.set(name, { byDay: {}, minutesByDay: {}, total: 0, totalMinutes: 0 });
    }
    const r = counted.get(name);
    r.byDay[day] = (r.byDay[day] || 0) + weight;
    r.minutesByDay[day] = (r.minutesByDay[day] || 0) + weight * minutes;
    r.total += weight;
    r.totalMinutes += weight * minutes;
  };
  let untimedCount = 0;
  for (const e of resolveAllEntries(project)) {
    const biweekly = isBiweekly(e.cell.note);
    const weight = biweekly ? 0.5 : 1;
    const minutes = periodMinutes(e.period.time);
    const names = splitTeacherField(e.cell.teacher || "");
    for (const name of names) {
      add(name, e.day, weight, minutes);
    }
    // 隔週パートナー (B 週担当) にも 0.5 を計上する
    const partner = biweekly ? biweeklyPartner(e.cell.note) : null;
    if (partner) add(partner, e.day, 0.5, minutes);
    if (!minutes && (names.length > 0 || partner)) untimedCount++;
  }

  const finish = (name, master) => {
    const r = counted.get(name) || {
      byDay: {},
      minutesByDay: {},
      total: 0,
      totalMinutes: 0,
    };
    const maxPerDay = master?.maxPerDay ?? null;
    const maxPerWeek = master?.maxPerWeek ?? null;
    return {
      name,
      inMaster: !!master,
      byDay: r.byDay,
      minutesByDay: r.minutesByDay,
      total: r.total,
      totalMinutes: r.totalMinutes,
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
  return { days, rows, untimedCount };
}

// ─── 講師 1 人の週間一覧 (👁 週間ミニビュー用) ──────────────────────

/**
 * 指定講師の担当コマを曜日ごとに開始時刻順で列挙する。ref はセルへの
 * ジャンプ (`jumpToCells`) に使える entryRef。講師マスタの NG (不在) も
 * ngByDay で返す — 割り当てる前に「入れられない時間帯」が週間で見える
 * ように (割当後の警告は conflicts 側)。
 * 隔週コマは主担当に biweekly: "A"、note「隔週(パートナー)」の
 * パートナー側にも biweekly: "B" のエントリとして載せる。
 * @returns {{
 *   days: string[],                 // いずれかの学年が使う曜日
 *   byDay: Record<string, {
 *     ref: string, time: string, periodLabel: string,
 *     tabName: string, clsLabel: string, subj: string, room: string,
 *     biweekly?: "A"|"B",           // 隔週コマのみ (A=主担当 / B=パートナー)
 *   }[]>,
 *   ngByDay: Record<string, {time: string}[]>, // NG (不在)。time "" = 終日
 *   total: number,          // エントリ件数 (隔週も 1 と数える)
 *   weightedTotal: number,  // 重み付き週計 (隔週 0.5 — 📊 集計と同じ)
 *   minutesByDay: Record<string, number>, // 曜日別の稼働時間 (分、隔週 0.5)
 *   totalMinutes: number,   // 週の稼働時間 (分、隔週 0.5 — 📊 集計と同じ)
 * }}
 */
export function computeTeacherWeek(project, teacherName) {
  const days = REGULAR_DAYS.filter((d) =>
    (project.tabs || []).some((t) => (t.days || []).includes(d))
  );
  const byDay = {};
  const minutesByDay = {};
  for (const d of days) {
    byDay[d] = [];
    minutesByDay[d] = 0;
  }
  let total = 0;
  let weightedTotal = 0;
  let totalMinutes = 0;
  for (const e of resolveAllEntries(project)) {
    if (!byDay[e.day]) continue;
    const biweekly = isBiweekly(e.cell.note);
    const isMain = splitTeacherField(e.cell.teacher || "").includes(teacherName);
    const isPartner =
      biweekly && biweeklyPartner(e.cell.note) === teacherName && !isMain;
    if (!isMain && !isPartner) continue;
    const entry = {
      ref: entryRef(e),
      time: (e.period.time || "").trim(),
      periodLabel: e.period.label || "",
      tabName: e.tab.name,
      clsLabel: e.cls.label || e.cls.room || "",
      subj: e.cell.subj || "",
      room: effectiveRoom(e),
    };
    if (biweekly) entry.biweekly = isPartner ? "B" : "A";
    byDay[e.day].push(entry);
    total++;
    const weight = biweekly ? 0.5 : 1;
    weightedTotal += weight;
    const minutes = weight * periodMinutes(e.period.time);
    minutesByDay[e.day] += minutes;
    totalMinutes += minutes;
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

  return { days, byDay, ngByDay, total, weightedTotal, minutesByDay, totalMinutes };
}
