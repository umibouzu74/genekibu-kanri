// 前の講習の時間割 (科目・講師) を、新しい講習へ写す (2026-10-27)。
//
// 季節の project は翌年の同じ季節に作り直して使う (「🔄 次の◯期講習用に作り直す」)。
// 作り直すと日付と時間割が空になるので、去年と同じ組み方から始めたいときは
// 去年の Excel を見て入れ直していた (2026 冬期講習では JSON を作って読み込んだ)。
//
// - 写す元は「作り直す前の時間割の控え」(project.previousTimetable。作り直したとき
//   に残す) か、💾 プロジェクト保存で書き出した JSON。どちらも CarriedTimetable に
//   そろえてから写す (carryTimetable)
// - 日付は「N 日目 → N 日目」(タブの使う日のカレンダー順)。去年と今年で日付が
//   違うので、ラベルでは合わせない。人が 1 日ずつ付け替えられる。去年の方が日が多い
//   (直前ポイント演習が去年 15 日・今年 14 日) ときは、去年の日を外すと残りを先頭から
//   順に詰める (sequentialDateMapping)。曜日が違う対応は知らせる (火木のコースの
//   1 日ずれ)
// - 写したあとの科目ごとのコマ数をクラス別にコマ数の設定と比べる
//   (subjectCountDiffsAfterCopy。パンフレットの 英9・数9・国8… と合わないクラス)
// - 時限はラベルが同じものへ、無ければ「1限」のような短い名前、それも無ければ
//   N 番目。クラスはラベルが同じもの (教室番号の付け外しは前方一致) へ
// - 入れない講師 (バイト・退職・講師マスタにいない人) は講師を空にして科目だけ写す
// - 既定は空いているセルにだけ写す。ロックしたセルには写さない
//
// 書き込みは schedule/importCells の 1 アクション (Undo 1 回で戻せる)。

import { effectiveConfigForTab, makeKey } from './scheduleKey';
import { parseDateLabel } from './courseDates';
import { quotasForClass } from './subjectQuota';
import type { CarriedCell, CarriedTab, CarriedTimetable, Entity, Project } from '../types';

export { normalizeCarriedTimetable } from './carriedTimetable';

// ─── 控えを作る / 読む ─────────────────────────────────────────────

/** project の今の時間割を控えにする (タブの使う日・時限の範囲だけ) */
export function carryTimetable(project: Project, { now = new Date() }: { now?: Date } = {}): CarriedTimetable {
  const tabs: CarriedTab[] = (project.tabs || []).map(tab => {
    const cfg = effectiveConfigForTab(project, tab);
    const cells: CarriedCell[] = [];
    cfg.dates.forEach((d, di) => {
      cfg.periods.forEach((p, pi) => {
        (cfg.classes || []).forEach((c, ci) => {
          const entry = tab.schedule?.[makeKey(d.id, p.id, c.id)];
          const subject = typeof entry?.subject === 'string' ? entry.subject : '';
          const teacher = typeof entry?.teacher === 'string' ? entry.teacher : '';
          if (!subject && !teacher) return;
          cells.push({ d: di, p: pi, c: ci, ...(subject ? { subject } : {}), ...(teacher ? { teacher } : {}) });
        });
      });
    });
    return {
      name: tab.name || '',
      dates: cfg.dates.map(d => d.label),
      periods: cfg.periods.map(p => p.label),
      classes: (cfg.classes || []).map(c => c.label),
      cells,
    };
  });
  return { name: project.name || '', savedAt: now.toISOString(), tabs };
}

export function countCarriedCells(source: CarriedTimetable | null | undefined): number {
  return (source?.tabs || []).reduce((n, t) => n + t.cells.length, 0);
}

// ─── 対応の既定 ───────────────────────────────────────────────────

/** 名前の比較用 (全角半角・空白・中黒の違いを無視) */
export function normalizeLabel(s: string): string {
  return String(s ?? '').normalize('NFKC').replace(/[\s・·･]/g, '').toLowerCase();
}

// "1限 (13:00~14:00)" → "1限"
function shortLabel(s: string): string {
  return normalizeLabel(String(s ?? '').replace(/\s*[(（].*$/, ''));
}

/** 写す先のタブ → 写す元のタブの添字 (名前が同じもの。無ければ同じ並び。どちらも無ければ null) */
export function defaultSourceTabIndex(
  targetTabName: string,
  targetIndex: number,
  source: CarriedTimetable,
  targetTabCount: number,
): number | null {
  const name = normalizeLabel(targetTabName);
  const byName = source.tabs.findIndex(t => normalizeLabel(t.name) === name);
  if (byName >= 0) return byName;
  if (source.tabs.length === targetTabCount && targetIndex < source.tabs.length) return targetIndex;
  return null;
}

/** 日付: N 日目 → N 日目。写す先の日が足りなければ null (写さない) */
export function defaultDateMapping(sourceDates: string[], targetDates: Entity[]): Array<number | null> {
  return sourceDates.map((_, i) => targetDates[i]?.id ?? null);
}

/**
 * 日付: 外す日 (写す元の添字) を飛ばして、残りを先頭から順に写す先の日へ。
 * 去年 15 日 → 今年 14 日なら、去年の 1 日を外せば残りの 14 日がそろう
 */
export function sequentialDateMapping(
  sourceCount: number,
  targetDates: Entity[],
  skipped: Iterable<number>,
): Array<number | null> {
  const skip = new Set(skipped);
  let next = 0;
  return Array.from({ length: sourceCount }, (_, i) => {
    if (skip.has(i)) return null;
    return targetDates[next++]?.id ?? null;
  });
}

/** 対応させた日のうち曜日が違うもの (写す元の添字・ラベル → 写す先のラベル) */
export function weekdayMismatches(
  sourceDates: string[],
  mapping: Array<number | null>,
  targetDates: Entity[],
): Array<{ index: number; from: string; to: string }> {
  const byId = new Map(targetDates.map(d => [d.id, d.label] as const));
  const out: Array<{ index: number; from: string; to: string }> = [];
  sourceDates.forEach((from, i) => {
    const id = mapping[i];
    const to = id != null ? byId.get(id) : undefined;
    if (!to) return;
    const a = parseDateLabel(from)?.weekday;
    const b = parseDateLabel(to)?.weekday;
    if (a != null && b != null && a !== b) out.push({ index: i, from, to });
  });
  return out;
}

/**
 * ラベルの対応: 同じラベル → 短い名前 (時限) / 前方一致 (クラス) → (ordinal なら) N 番目。
 * 写す先のそれぞれは 1 回しか使わない (2 つの元が 1 つの先に重ならないように)
 */
export function defaultLabelMapping(
  sourceLabels: string[],
  targets: Entity[],
  { kind }: { kind: 'period' | 'class' },
): Array<number | null> {
  const used = new Set<number>();
  const out: Array<number | null> = sourceLabels.map(() => null);
  const tryMatch = (pred: (src: string, tgt: Entity) => boolean) => {
    sourceLabels.forEach((src, i) => {
      if (out[i] != null) return;
      const hits = targets.filter(t => !used.has(t.id) && pred(src, t));
      if (hits.length === 1) {
        out[i] = hits[0].id;
        used.add(hits[0].id);
      }
    });
  };
  tryMatch((src, t) => t.label === src);
  tryMatch((src, t) => normalizeLabel(t.label) === normalizeLabel(src));
  if (kind === 'period') {
    tryMatch((src, t) => shortLabel(t.label) === shortLabel(src));
    // それでも当たらない時限は N 番目 (同じ番目が空いているときだけ)
    sourceLabels.forEach((_, i) => {
      if (out[i] != null) return;
      const t = targets[i];
      if (t && !used.has(t.id)) {
        out[i] = t.id;
        used.add(t.id);
      }
    });
  } else {
    // クラス名に教室番号を付け外ししたとき ("3S401" ↔ "3S")
    tryMatch((src, t) => {
      const a = normalizeLabel(src);
      const b = normalizeLabel(t.label);
      return a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a));
    });
  }
  return out;
}

// ─── 写す計画 ─────────────────────────────────────────────────────

export interface TabCopyMapping {
  targetTabId: number;
  /** null = このタブには写さない */
  sourceTabIndex: number | null;
  /** 写す元の日付の添字 → 写す先の日付 id (null = 写さない) */
  dates: Array<number | null>;
  /** 外した写す元の日 (添字)。外すと残りを先頭から順に詰め直す (sequentialDateMapping) */
  skippedDates?: number[];
  periods: Array<number | null>;
  classes: Array<number | null>;
}

export interface CellWrite {
  tabId: number;
  key: string;
  subject: string;
  teacher: string;
}

export interface TimetableCopyPlan {
  writes: CellWrite[];
  /** 講師を空にして写したセル (入れない講師・講師マスタにいない人) */
  teacherBlanked: number;
  /** 写す先のセルに入っていたので写さなかった (上書きしないとき) */
  skippedFilled: number;
  /** 写す先がロックしてあって写さなかった */
  skippedLocked: number;
  /** 日付・時限・クラスの対応が無くて写さなかった */
  unmapped: number;
  /** 写す先の科目マスタに無い科目 */
  unknownSubjects: string[];
}

/** 写す元の講師 (セルに出てくる順・重複なし) とコマ数 */
export function sourceTeacherCounts(source: CarriedTimetable): Array<{ name: string; cells: number }> {
  const m = new Map<string, number>();
  source.tabs.forEach(t => t.cells.forEach(c => {
    if (c.teacher && c.teacher !== '未定') m.set(c.teacher, (m.get(c.teacher) || 0) + 1);
  }));
  return [...m.entries()].map(([name, cells]) => ({ name, cells }));
}

export function planTimetableCopy({
  source,
  project,
  mappings,
  includeTeachers,
  overwrite = false,
}: {
  source: CarriedTimetable;
  project: Project;
  mappings: TabCopyMapping[];
  /** 講師を写す人 (これ以外の講師は空にして科目だけ写す) */
  includeTeachers: Set<string>;
  /** true なら、ロックしていないセルは入っている内容を上書きする */
  overwrite?: boolean;
}): TimetableCopyPlan {
  const plan: TimetableCopyPlan = { writes: [], teacherBlanked: 0, skippedFilled: 0, skippedLocked: 0, unmapped: 0, unknownSubjects: [] };
  const masterTeachers = new Set((project.teachers || []).map(t => t.name));
  const subjects = new Set(project.subjects || []);
  const unknownSubjects = new Set<string>();
  for (const m of mappings) {
    if (m.sourceTabIndex == null) continue;
    const srcTab = source.tabs[m.sourceTabIndex];
    const tab = project.tabs.find(t => t.id === m.targetTabId);
    if (!srcTab || !tab) continue;
    const cfg = effectiveConfigForTab(project, tab);
    const dateIds = new Set(cfg.dates.map(d => d.id));
    const periodIds = new Set(cfg.periods.map(p => p.id));
    const classIds = new Set((cfg.classes || []).map(c => c.id));
    const seen = new Set<string>();
    for (const cell of srcTab.cells) {
      const dateId = m.dates[cell.d];
      const periodId = m.periods[cell.p];
      const classId = m.classes[cell.c];
      if (dateId == null || periodId == null || classId == null
        || !dateIds.has(dateId) || !periodIds.has(periodId) || !classIds.has(classId)) {
        plan.unmapped++;
        continue;
      }
      const key = makeKey(dateId, periodId, classId);
      // 2 つの元が同じ先に当たったら先のものだけ (対応を人が重ねたとき)
      if (seen.has(key)) { plan.unmapped++; continue; }
      seen.add(key);
      const existing = tab.schedule?.[key];
      if (existing?.locked) { plan.skippedLocked++; continue; }
      if (!overwrite && (existing?.subject || existing?.teacher)) { plan.skippedFilled++; continue; }
      const subject = cell.subject || '';
      let teacher = cell.teacher || '';
      if (teacher && teacher !== '未定' && (!includeTeachers.has(teacher) || !masterTeachers.has(teacher))) {
        teacher = '';
        plan.teacherBlanked++;
      } else if (teacher === '未定' && !masterTeachers.has('未定')) {
        teacher = '';
      }
      if (!subject && !teacher) { plan.unmapped++; continue; }
      if (subject && subjects.size > 0 && !subjects.has(subject)) unknownSubjects.add(subject);
      plan.writes.push({ tabId: tab.id, key, subject, teacher });
    }
  }
  plan.unknownSubjects = [...unknownSubjects];
  return plan;
}

/** 写す先の全タブの既定の対応 (タブ → 名前 / 並び、日付 → N 日目、時限・クラス → ラベル) */
export function buildDefaultMappings(source: CarriedTimetable, project: Project): TabCopyMapping[] {
  const tabs = project.tabs || [];
  const taken = new Set<number>();
  return tabs.map((tab, i) => {
    let idx = defaultSourceTabIndex(tab.name, i, source, tabs.length);
    // 同じ元のタブを 2 つの先に当てない (名前の当たった先を優先)
    if (idx != null && taken.has(idx)) idx = null;
    if (idx != null) taken.add(idx);
    return mappingForSourceTab(source, project, tab.id, idx);
  });
}

// ─── 写したあとのコマ数 ─────────────────────────────────────────

export interface SubjectCountDiff {
  tabId: number;
  tabName: string;
  className: string;
  /** コマ数の設定と違う科目 (diff = 写したあとのコマ数 − 設定) */
  items: Array<{ subject: string; count: number; quota: number; diff: number }>;
}

/**
 * 写したあと (writes を当てた時間割) の、クラスごとの科目のコマ数とコマ数の設定
 * (subjectCounts / クラス別の上書き) の差。対象は tabIds のタブだけ、差のある
 * クラス・科目だけ。「3SS 数学 −1・理科 +1」
 */
export function subjectCountDiffsAfterCopy(
  project: Project,
  writes: CellWrite[],
  tabIds: Iterable<number>,
): SubjectCountDiff[] {
  const targets = new Set(tabIds);
  const writesByTab = new Map<number, Map<string, CellWrite>>();
  writes.forEach(w => {
    if (!writesByTab.has(w.tabId)) writesByTab.set(w.tabId, new Map());
    writesByTab.get(w.tabId)!.set(w.key, w);
  });
  const out: SubjectCountDiff[] = [];
  for (const tab of project.tabs || []) {
    if (!targets.has(tab.id)) continue;
    const cfg = effectiveConfigForTab(project, tab);
    const tabWrites = writesByTab.get(tab.id) || new Map<string, CellWrite>();
    for (const c of cfg.classes || []) {
      const counts: Record<string, number> = {};
      cfg.dates.forEach(d => cfg.periods.forEach(p => {
        const key = makeKey(d.id, p.id, c.id);
        const subject = tabWrites.get(key)?.subject ?? tab.schedule?.[key]?.subject;
        if (subject) counts[subject] = (counts[subject] || 0) + 1;
      }));
      const quotas = quotasForClass(cfg, c.id);
      const subjects = [...new Set([...Object.keys(quotas), ...Object.keys(counts)])];
      const order = new Map((project.subjects || []).map((sub, i) => [sub, i] as const));
      const items = subjects
        .map(subject => ({ subject, count: counts[subject] || 0, quota: quotas[subject] || 0 }))
        .filter(x => x.count !== x.quota)
        .map(x => ({ ...x, diff: x.count - x.quota }))
        .sort((a, b) => (order.get(a.subject) ?? 999) - (order.get(b.subject) ?? 999));
      if (items.length > 0) out.push({ tabId: tab.id, tabName: tab.name, className: c.label, items });
    }
  }
  return out;
}

/** 1 つの先のタブに、元のタブ idx を当てたときの既定の対応 */
export function mappingForSourceTab(
  source: CarriedTimetable,
  project: Project,
  targetTabId: number,
  sourceTabIndex: number | null,
): TabCopyMapping {
  const tab = project.tabs.find(t => t.id === targetTabId);
  const src = sourceTabIndex != null ? source.tabs[sourceTabIndex] : null;
  if (!tab || !src) return { targetTabId, sourceTabIndex: null, dates: [], periods: [], classes: [] };
  const cfg = effectiveConfigForTab(project, tab);
  return {
    targetTabId,
    sourceTabIndex,
    dates: defaultDateMapping(src.dates, cfg.dates),
    periods: defaultLabelMapping(src.periods, cfg.periods, { kind: 'period' }),
    classes: defaultLabelMapping(src.classes, cfg.classes || [], { kind: 'class' }),
  };
}
