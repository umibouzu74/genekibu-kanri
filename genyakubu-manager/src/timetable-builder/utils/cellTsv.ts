// ─── タブのセルを表 (TSV) で書き出す・貼り付ける (B5 2026-10-31) ───────────
// セルをまとめて変える安全な入口 (Claude in Chrome の操作用でもある)。以前は
// ページ内で project JSON を組み立てて「📂 開く」で丸ごと置き換えていた。
//   列: タブ / 日付 / 時限 / クラス / 科目 / 講師 / ロック
//   - 書き出すのは使う日・時限の全部のセル (空のセルも。埋める欄として使える)
//   - 貼り付けは貼った行のセルだけを変える (ほかのセルは触らない)。科目と講師を
//     両方空にした行は「空にする」
//   - ロックの列があれば、その通りのロックにする (ロックしてあるセルも書き換える)。
//     列が無ければロックは今のまま、ロックしたセルは書き換えない
//   - 適用は schedule/importCells の 1 アクション (Undo 1 回で戻る)
// 合同 (combinedGroups) の伝播はしない (表は 1 セルずつ明示するので、合同の
// クラスも行で書く)。
import type { Project, Schedule } from '../types';
import { effectiveConfigForTab, findCombinedGroup, makeKey, makeNgKey, makeExternalKey } from './scheduleKey';
import { computeGlobalUsage } from './analysisHelpers';
import { computeAutoNgByTeacher } from './autoNg';
import { resolveTeacherDailyLimit } from '../logic/constraints/teacherConstraints';
import { resolveGenerationParams } from './constants';
import { parseCsvLine } from './csvImport';

export const CELL_TSV_HEADER = ['タブ', '日付', '時限', 'クラス', '科目', '講師', 'ロック'];

const LOCK_ON = new Set(['○', '〇', '◯', '🔒', '1', 'true', 'yes', 'ロック', '✓', 'x', 'X']);

export interface CellWrite {
  tabId: number;
  key: string;
  subject: string;
  teacher: string;
  /** 書くロックの状態 (undefined = ロックを持たない = 従来どおり) */
  locked?: boolean;
  /** 科目・講師を空にする */
  clear?: boolean;
  /** ロックしてあるセルも書き換える (表にロックの列があるとき) */
  overrideLock?: boolean;
}

const tsvCell = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** タブのセルを TSV に (tabIds 省略 = 全タブ) */
export function cellsToTsv(project: Project, tabIds?: number[] | null): string {
  const lines = [CELL_TSV_HEADER.join('\t')];
  for (const tab of project.tabs || []) {
    if (tabIds && tabIds.length > 0 && !tabIds.includes(tab.id)) continue;
    const cfg = effectiveConfigForTab(project, tab);
    for (const d of cfg.dates) {
      for (const p of cfg.periods) {
        for (const c of cfg.classes || []) {
          const e = tab.schedule?.[makeKey(d.id, p.id, c.id)] || {};
          lines.push([tab.name, d.label, p.label, c.label, e.subject || '', e.teacher || '', e.locked ? '○' : '']
            .map(tsvCell).join('\t'));
        }
      }
    }
  }
  return lines.join('\n') + '\n';
}

const norm = (s: unknown) => String(s ?? '').normalize('NFKC').trim();
// 時限の短い名前 ("1限 (13:00~)" → "1限")
const shortLabel = (s: string) => norm(s).split(/[\s(（]/)[0];
// 日付の月日 ("12/25(金)" → "12/25")
const md = (s: string) => {
  const m = norm(s).match(/(\d{1,2})\/(\d{1,2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
};

function findBy<T extends { label: string }>(list: T[], raw: string, loose: (x: T) => string | null): T | null {
  const v = norm(raw);
  if (!v) return null;
  return list.find(x => norm(x.label) === v) || list.find(x => loose(x) != null && loose(x) === (loose({ label: v } as T))) || null;
}

export interface CellTsvRow {
  line: number;
  status: 'ok' | 'same' | 'error' | 'skipped';
  message: string;
}

export interface CellTsvPlan {
  rows: CellTsvRow[];
  writes: CellWrite[];
  errorCount: number;
  changeCount: number;
}

/**
 * 貼った表を読み、セルの書き込みに直す (保存はしない)。
 * @param activeTabId タブの列が無い・空の行の既定のタブ
 */
export function parseCellTsv(text: string, project: Project, activeTabId: number): CellTsvPlan {
  const rows: CellTsvRow[] = [];
  const writes: CellWrite[] = [];
  const lines = String(text ?? '').split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1 })).filter(l => l.raw.trim() !== '');
  if (lines.length === 0) return { rows, writes, errorCount: 0, changeCount: 0 };
  const split = (raw: string) => (raw.includes('\t') ? raw.split('\t') : parseCsvLine(raw, ','));
  const head = split(lines[0].raw).map(norm);
  const colOf = (names: string[]) => head.findIndex(h => names.includes(h));
  const idx = {
    tab: colOf(['タブ', 'tab']),
    date: colOf(['日付', '日', 'date']),
    period: colOf(['時限', 'period']),
    cls: colOf(['クラス', 'class']),
    subject: colOf(['科目', 'subject']),
    teacher: colOf(['講師', '先生', 'teacher']),
    lock: colOf(['ロック', 'lock']),
  };
  if (idx.date < 0 || idx.period < 0 || idx.cls < 0 || (idx.subject < 0 && idx.teacher < 0)) {
    rows.push({ line: lines[0].line, status: 'error', message: '見出しの行 (タブ / 日付 / 時限 / クラス / 科目 / 講師 / ロック) がありません' });
    return { rows, writes, errorCount: 1, changeCount: 0 };
  }
  const hasLock = idx.lock >= 0;
  const subjects = new Set(project.subjects || []);
  const teachers = new Map((project.teachers || []).map(t => [t.name, t]));
  const seen = new Set<string>();
  for (const { raw, line } of lines.slice(1)) {
    const cells = split(raw);
    const get = (i: number) => (i >= 0 ? norm(cells[i]) : '');
    const tabName = get(idx.tab);
    const tab = tabName
      ? (project.tabs || []).find(t => norm(t.name) === tabName)
      : (project.tabs || []).find(t => t.id === activeTabId);
    if (!tab) {
      rows.push({ line, status: 'error', message: `タブ「${tabName}」がありません` });
      continue;
    }
    const cfg = effectiveConfigForTab(project, tab);
    const d = findBy(cfg.dates, get(idx.date), x => md(x.label));
    const p = findBy(cfg.periods, get(idx.period), x => shortLabel(x.label));
    const c = findBy(cfg.classes || [], get(idx.cls), x => norm(x.label));
    if (!d || !p || !c) {
      const miss = [!d && `日付「${get(idx.date)}」`, !p && `時限「${get(idx.period)}」`, !c && `クラス「${get(idx.cls)}」`].filter(Boolean).join('・');
      rows.push({ line, status: 'error', message: `「${tab.name}」の使う日・時限・クラスに ${miss} がありません` });
      continue;
    }
    const key = makeKey(d.id, p.id, c.id);
    const where = `${tab.name} ${d.label} ${p.label} ${c.label}`;
    if (seen.has(`${tab.id}:${key}`)) {
      rows.push({ line, status: 'error', message: `${where} が 2 行あります` });
      continue;
    }
    seen.add(`${tab.id}:${key}`);
    const subject = get(idx.subject);
    const teacher = get(idx.teacher);
    if (subject && subjects.size > 0 && !subjects.has(subject)) {
      rows.push({ line, status: 'error', message: `${where}: 科目「${subject}」は科目マスタにありません` });
      continue;
    }
    if (teacher && !teachers.has(teacher)) {
      rows.push({ line, status: 'error', message: `${where}: 講師「${teacher}」は講師マスタにいません` });
      continue;
    }
    if (teacher && !subject) {
      rows.push({ line, status: 'error', message: `${where}: 講師だけで科目がありません` });
      continue;
    }
    const cur = tab.schedule?.[key] || {};
    const lockRaw = get(idx.lock);
    const locked = hasLock ? LOCK_ON.has(lockRaw) : !!cur.locked;
    if (!hasLock && cur.locked && ((cur.subject || '') !== subject || (cur.teacher || '') !== teacher)) {
      rows.push({ line, status: 'skipped', message: `${where}: ロックしてあるので書き換えません (ロックの列を付けると書き換えます)` });
      continue;
    }
    if ((cur.subject || '') === subject && (cur.teacher || '') === teacher && !!cur.locked === locked) {
      rows.push({ line, status: 'same', message: `${where}: 変わりません` });
      continue;
    }
    const clear = !subject && !teacher;
    writes.push({
      tabId: tab.id,
      key,
      subject,
      teacher,
      ...(locked ? { locked: true } : {}),
      ...(clear ? { clear: true } : {}),
      ...(hasLock ? { overrideLock: true } : {}),
    });
    const desc = clear ? '空にする' : `${subject}${teacher ? ` ${teacher}` : ''}`;
    if (teacher && subject && !teachers.get(teacher)!.subjects.includes(subject)) {
      rows.push({ line, status: 'ok', message: `${where}: ${desc}${locked ? ' 🔒' : ''} (⚠ ${teacher} の担当科目に ${subject} がありません)` });
    } else {
      rows.push({ line, status: 'ok', message: `${where}: ${desc}${locked ? ' 🔒' : ''}` });
    }
  }
  return {
    rows,
    writes,
    errorCount: rows.filter(r => r.status === 'error').length,
    changeCount: writes.length,
  };
}

/** セルの書き込みを当てた schedule (reducer の schedule/importCells と同じ規則) */
export function applyWritesToSchedule(schedule: Schedule, writes: CellWrite[]): { schedule: Schedule; changed: boolean } {
  const next = { ...schedule };
  let changed = false;
  for (const w of writes) {
    const cur = next[w.key];
    if (cur?.locked && !w.overrideLock) continue;
    if (w.clear || (!w.subject && !w.teacher)) {
      if (!w.clear) continue;
      if (w.locked) next[w.key] = { locked: true };
      else delete next[w.key];
      changed = true;
      continue;
    }
    next[w.key] = { subject: w.subject, teacher: w.teacher, ...(w.locked ? { locked: true } : {}) };
    changed = true;
  }
  return { schedule: next, changed };
}

/** 書き込みを当てた project (プレビュー用) */
export function projectWithWrites(project: Project, writes: CellWrite[]): Project {
  const byTab = new Map<number, CellWrite[]>();
  for (const w of writes) {
    if (!byTab.has(w.tabId)) byTab.set(w.tabId, []);
    byTab.get(w.tabId)!.push(w);
  }
  return {
    ...project,
    tabs: project.tabs.map(t => (byTab.has(t.id) ? { ...t, schedule: applyWritesToSchedule(t.schedule || {}, byTab.get(t.id)!).schedule } : t)),
  };
}

/**
 * 貼った後に新しく増える問題 (NG・同じ時間の講師の重なり・日上限)。今ある問題は
 * 出さない (貼り付けで増えるものだけ)
 */
export function newProblemsAfterWrites(project: Project, writes: CellWrite[]): string[] {
  if (writes.length === 0) return [];
  const after = projectWithWrites(project, writes);
  const out: string[] = [];
  const autoNg = computeAutoNgByTeacher(project.teachers, project.externalSessions || [], project.periods || []);
  const teachers = new Map((project.teachers || []).map(t => [t.name, t]));
  const dateLabel = new Map((project.dates || []).map(d => [d.id, d.label]));
  const periodLabel = new Map((project.periods || []).map(p => [p.id, p.label]));
  // NG: 書いたセルだけ見る
  for (const w of writes) {
    if (!w.teacher || w.teacher === '未定') continue;
    const m = w.key.match(/^d(\d+)-p(\d+)-c\d+$/);
    if (!m) continue;
    const dl = dateLabel.get(Number(m[1])) || '';
    const pl = periodLabel.get(Number(m[2])) || '';
    const ngKey = makeNgKey(dl, pl);
    if (teachers.get(w.teacher)?.ngSlots?.includes(ngKey) || autoNg.get(w.teacher)?.get(ngKey)) {
      out.push(`NG: ${w.teacher} ${dl} ${pl}`);
    }
  }
  const usage = (p: Project) =>
    computeGlobalUsage(p.tabs, p.combinedGroups, p.externalCounts, p.externalSessions, p.dates, p.periods);
  const before = usage(project);
  const aft = usage(after);
  // 同じ日時の講師の重なり (別のセル・別のタブ。合同は 1 つ。未定は数えない)
  const uses = (p: Project) => {
    const m = new Map<string, Set<string>>();
    for (const tab of p.tabs || []) {
      const cfg = effectiveConfigForTab(p, tab);
      for (const d of cfg.dates) {
        for (const pe of cfg.periods) {
          for (const c of cfg.classes || []) {
            const e = tab.schedule?.[makeKey(d.id, pe.id, c.id)];
            if (!e?.teacher || e.teacher === '未定') continue;
            const g = e.subject ? findCombinedGroup(p.combinedGroups, e.subject, c.label, d.label) : null;
            const k = `${d.label} ${pe.label} ${e.teacher}`;
            if (!m.has(k)) m.set(k, new Set());
            m.get(k)!.add(g ? `${tab.id}:g${g.id}` : `${tab.id}:c${c.id}`);
          }
        }
      }
    }
    return m;
  };
  const beforeUses = uses(project);
  for (const [k, set] of uses(after)) {
    if (set.size > 1 && set.size > (beforeUses.get(k)?.size || 0)) out.push(`講師の重なり: ${k}`);
  }
  // 日上限
  const { maxDailyHours } = resolveGenerationParams(project);
  for (const t of project.teachers || []) {
    if (t.name === '未定') continue;
    const limit = resolveTeacherDailyLimit(t, maxDailyHours);
    for (const d of project.dates || []) {
      const k = makeExternalKey(d.label, t.name);
      const a = aft.teacherDailyCounts[k]?.total || 0;
      const b = before.teacherDailyCounts[k]?.total || 0;
      if (a > limit && a > b) out.push(`日上限超: ${t.name} ${d.label} ${a}/${limit}`);
    }
  }
  return out;
}
