// 他学年セッション (予備校・高校など、講習の外の授業) を表で一括登録するための
// パーサ (2026-10-27)。冬期講習の作成でパンフレットの担当表から 98 件を 1 件ずつ
// 入れていた手間を省く。NG 日時 CSV (csvImport.parseNgCsv) は時限の指定だけで、
// 時刻つきのセッションは入れられなかった。
//
// 形式 (1 行目は見出し。列の順は自由):
//   講師,日付,開始,終了,メモ
//   半田,12/25・26・28,9:00,10:10,予備校１限
//   滝澤・武下,12/25〜12/28,12:25,13:35,予備校３限 理科基礎
//
// - 区切りはカンマ。見出しにタブがあればタブ区切り (Excel からの貼り付け)
// - 見出しの名前: 講師 (name / teacher / 先生)・日付 (date)・開始 (start)・
//   終了 (end)・メモ (memo / 備考 / 種別)。開始と終了の代わりに「時刻」列
//   ("9:00-16:10") でもよい
// - 講師は「・」「、」「/」で区切れば 1 行で何人でも (1 人 1 件で登録する)
// - 日付は「12/25」「12/25(金)」「2026-12-25」「12月25日」。「・」「、」で
//   何日でも並べられ、月を省いた「12/25・26・28」も読む。「12/25〜12/28」は
//   日付プールのその期間の日 (プールに無い日は入れない)
// - 日付はプールの日付ラベルに月日で合わせる (「12/25」→「12/25(金)」)。
//   プールに無い日は登録しない (日付の作成が先)
// - 時刻は「9:00」「09:00」「900」「9時30分」。全角も可
//
// 戻り値の rows はプールのラベル・講師マスタの名前に解決済みで、同じ内容の行は
// 1 件にまとめてある (既に登録済みの内容は reducer の addExternalSessions が飛ばす)。

import { parseCsvLine, type CsvError } from './csvImport';
import { parseDateLabel } from './courseDates';
import { seasonMonthOrder, seasonStartMonth } from './dateGenerate';
import { formatHHmm } from './timeRange';
import type { Entity } from '../types';

export interface SessionCsvRow {
  /** CSV の行番号 (1 始まり、見出しが 1) */
  line: number;
  teacherName: string;
  /** プールの日付ラベル */
  date: string;
  startTime?: string;
  endTime?: string;
  memo: string;
}

export interface SessionCsvResult {
  rows: SessionCsvRow[];
  errors: CsvError[];
  /** 講師マスタに無い名前 (その分は登録しない) */
  unknownTeachers: string[];
  /** プールの日付に当たらなかった日付の書き方 (その分は登録しない) */
  unknownDates: string[];
  /** 時刻の無い行の数 (登録はするが自動NG にはならない) */
  untimedCount: number;
}

const HEADER_ALIASES: Record<'teacher' | 'date' | 'start' | 'end' | 'time' | 'memo', string[]> = {
  teacher: ['講師', '講師名', '先生', '担当', 'name', 'teacher'],
  date: ['日付', '日', '日程', 'date', 'dates'],
  start: ['開始', '開始時刻', '始', 'start', 'starttime'],
  end: ['終了', '終了時刻', '終', 'end', 'endtime'],
  time: ['時刻', '時間', '時間帯', 'time'],
  memo: ['メモ', '備考', '種別', '内容', 'memo', 'note'],
};

function normalizeHeader(h: string): string {
  return h.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

/** "9:00" / "900" / "9時30分" → "09:00"。読めなければ null */
export function normalizeTimeText(raw: string): string | null {
  const s = raw.normalize('NFKC').trim().replace(/\s+/g, '');
  if (!s) return null;
  let h: number;
  let m: number;
  let mt = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mt) {
    h = Number(mt[1]);
    m = Number(mt[2]);
  } else if ((mt = s.match(/^(\d{1,2})時(?:(\d{1,2})分?|半)?$/))) {
    h = Number(mt[1]);
    m = s.endsWith('半') ? 30 : mt[2] ? Number(mt[2]) : 0;
  } else if ((mt = s.match(/^(\d{1,2})(\d{2})$/))) {
    h = Number(mt[1]);
    m = Number(mt[2]);
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return formatHHmm(h * 60 + m);
}

/** "9:00-16:10" / "9:00〜16:10" / "9:00〜" → { start, end } */
function splitTimeRange(raw: string): { start: string; end: string } {
  const s = raw.normalize('NFKC').trim();
  const parts = s.split(/\s*[〜~～\-–]\s*/);
  return { start: parts[0] ?? '', end: parts[1] ?? '' };
}

export function splitTeacherCell(raw: string): string[] {
  return raw
    .split(/[・·･、，,/／]/)
    .map(s => s.trim())
    .filter(Boolean);
}

type MonthDay = { month: number; day: number };

// 「12/25」「12/25(金)」「2026-12-25」「12月25日」「25」(月なし) を読む。
// 月なしは直前の月 (prevMonth) を使う。読めなければ null
function parseDateToken(token: string, prevMonth: number | null): MonthDay | null {
  const t = token.trim();
  let mt = t.match(/^\d{4}[-/](\d{1,2})[-/](\d{1,2})(?:\([日月火水木金土]\))?$/);
  if (mt) return checkMonthDay(Number(mt[1]), Number(mt[2]));
  mt = t.match(/^(\d{1,2})月(\d{1,2})日?(?:\([日月火水木金土]\))?$/);
  if (mt) return checkMonthDay(Number(mt[1]), Number(mt[2]));
  const label = parseDateLabel(t);
  if (label && /^\d{1,2}\/\d{1,2}(?:\([日月火水木金土]\))?$/.test(t)) return checkMonthDay(label.month, label.day);
  mt = t.match(/^(\d{1,2})日?(?:\([日月火水木金土]\))?$/);
  if (mt && prevMonth != null) return checkMonthDay(prevMonth, Number(mt[1]));
  return null;
}

function checkMonthDay(month: number, day: number): MonthDay | null {
  // うるう年 (2024) で実在する月日か
  const dt = new Date(2024, month - 1, day, 12);
  return month >= 1 && month <= 12 && dt.getMonth() === month - 1 && dt.getDate() === day
    ? { month, day }
    : null;
}

// 日付の欄 → プールの日付ラベル。読めない語・プールに無い日は unknown に返す
export function resolveSessionDates(
  raw: string,
  poolDates: Entity[],
): { labels: string[]; unknown: string[] } {
  const pool = poolDates
    .map(d => ({ label: d.label, md: parseDateLabel(d.label) }))
    .filter((d): d is { label: string; md: { month: number; day: number; weekday: number | null } } => !!d.md);
  const start = seasonStartMonth(pool.map(d => d.md.month));
  const order = (md: MonthDay) => seasonMonthOrder(md.month, start) * 100 + md.day;
  const byKey = new Map<number, string>();
  pool.forEach(d => {
    const k = order(d.md);
    if (!byKey.has(k)) byKey.set(k, d.label);
  });

  const labels: string[] = [];
  const unknown: string[] = [];
  const add = (label: string) => { if (!labels.includes(label)) labels.push(label); };
  let prevMonth: number | null = null;
  String(raw ?? '')
    .normalize('NFKC')
    // 「12/25 〜 12/28」の空白で期間が割れないように
    .replace(/\s*[〜~～]\s*/g, '〜')
    .split(/[・･·、，,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(token => {
      const parts = token.split('〜');
      if (parts.length === 1) {
        const md = parseDateToken(token, prevMonth);
        if (!md) { unknown.push(token); return; }
        prevMonth = md.month;
        const label = byKey.get(order(md));
        if (label) add(label);
        else unknown.push(token);
        return;
      }
      if (parts.length !== 2) { unknown.push(token); return; }
      const from = parseDateToken(parts[0], prevMonth);
      const to = from ? parseDateToken(parts[1], from.month) : null;
      if (!from || !to) { unknown.push(token); return; }
      prevMonth = to.month;
      const lo = order(from);
      const hi = order(to);
      if (lo > hi) { unknown.push(token); return; }
      const hits = [...byKey.entries()].filter(([k]) => k >= lo && k <= hi).sort((a, b) => a[0] - b[0]);
      if (hits.length === 0) { unknown.push(token); return; }
      hits.forEach(([, label]) => add(label));
    });
  return { labels, unknown };
}

export function parseSessionCsv(
  text: string | null | undefined,
  { teacherNames = [], poolDates = [] }: { teacherNames?: string[]; poolDates?: Entity[] } = {},
): SessionCsvResult {
  const rows: SessionCsvRow[] = [];
  const errors: CsvError[] = [];
  const unknownTeachers = new Set<string>();
  const unknownDates = new Set<string>();
  let untimedCount = 0;
  const empty = (message: string, line = 1): SessionCsvResult => ({
    rows, errors: [{ line, message }], unknownTeachers: [], unknownDates: [], untimedCount: 0,
  });

  const lines = String(text ?? '').split(/\n/).map(l => l.replace(/\r$/, ''));
  const headerIdx = lines.findIndex(l => l.trim() !== '');
  if (headerIdx < 0) return empty('空の入力です', 0);
  const delimiter = lines[headerIdx].includes('\t') ? '\t' : ',';
  const header = parseCsvLine(lines[headerIdx], delimiter).map(normalizeHeader);
  const col = (key: keyof typeof HEADER_ALIASES) => {
    const aliases = HEADER_ALIASES[key].map(normalizeHeader);
    return header.findIndex(h => aliases.includes(h));
  };
  const teacherCol = col('teacher');
  const dateCol = col('date');
  const startCol = col('start');
  const endCol = col('end');
  const timeCol = col('time');
  const memoCol = col('memo');
  if (teacherCol < 0 || dateCol < 0) {
    return empty('見出しに「講師」と「日付」の列が見つかりません (例: 講師,日付,開始,終了,メモ)', headerIdx + 1);
  }

  const known = new Set(teacherNames);
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim() === '') continue;
    const lineNo = i + 1;
    const fields = parseCsvLine(rawLine, delimiter).map(f => f.trim());
    const cell = (idx: number) => (idx >= 0 ? fields[idx] ?? '' : '');
    const teachers = splitTeacherCell(cell(teacherCol).normalize('NFKC'));
    const dateCell = cell(dateCol);
    if (teachers.length === 0 || !dateCell) {
      errors.push({ line: lineNo, message: teachers.length === 0 ? '講師が空です' : '日付が空です' });
      continue;
    }
    // 講師マスタに無い名前は、ほかの欄が読めない行でも知らせる
    const unknownHere = known.size > 0 ? teachers.filter(n => !known.has(n)) : [];
    unknownHere.forEach(n => unknownTeachers.add(n));

    let startRaw = cell(startCol);
    let endRaw = cell(endCol);
    if (!startRaw && timeCol >= 0) {
      ({ start: startRaw, end: endRaw } = splitTimeRange(cell(timeCol)));
    } else if (startRaw && !endRaw && /[〜~～\-–]/.test(startRaw.normalize('NFKC'))) {
      // 開始の欄に「9:00〜16:10」と書いてある
      ({ start: startRaw, end: endRaw } = splitTimeRange(startRaw));
    }
    const startTime = startRaw ? normalizeTimeText(startRaw) : null;
    const endTime = endRaw ? normalizeTimeText(endRaw) : null;
    if (startRaw && !startTime) { errors.push({ line: lineNo, message: `開始時刻「${startRaw}」が読めません` }); continue; }
    if (endRaw && !endTime) { errors.push({ line: lineNo, message: `終了時刻「${endRaw}」が読めません` }); continue; }
    if (!startTime && endTime) { errors.push({ line: lineNo, message: '終了時刻だけでなく開始時刻も入れてください' }); continue; }
    if (startTime && endTime && startTime >= endTime) { errors.push({ line: lineNo, message: '開始時刻は終了時刻より前にしてください' }); continue; }

    const { labels, unknown } = resolveSessionDates(dateCell, poolDates);
    unknown.forEach(u => unknownDates.add(u));
    if (labels.length === 0) {
      errors.push({ line: lineNo, message: `日付「${dateCell}」が日付プールにありません` });
      continue;
    }
    const memo = cell(memoCol);
    if (!startTime) untimedCount++;
    for (const name of teachers) {
      if (unknownHere.includes(name)) continue;
      for (const date of labels) {
        const key = JSON.stringify([date, name, memo, startTime || '', endTime || '']);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          line: lineNo,
          teacherName: name,
          date,
          ...(startTime ? { startTime } : {}),
          ...(startTime && endTime ? { endTime } : {}),
          memo,
        });
      }
    }
  }
  return {
    rows,
    errors,
    unknownTeachers: [...unknownTeachers],
    unknownDates: [...unknownDates],
    untimedCount,
  };
}

/** 他学年セッション CSV の雛形 (今の講師・日付を埋める) */
export function buildSessionCsvTemplate(teacherNames: string[], dateLabels: string[]): string {
  const name = teacherNames.find(n => n && n !== '未定') || '田中';
  const second = teacherNames.find(n => n && n !== '未定' && n !== name) || '山田';
  const md = (label: string | undefined) => {
    const p = parseDateLabel(label);
    return p ? `${p.month}/${p.day}` : null;
  };
  const d1 = md(dateLabels[0]) || '12/25';
  const d2 = md(dateLabels[1]) || d1;
  return [
    '講師,日付,開始,終了,メモ',
    `${name},${d1},9:00,10:10,予備校１限`,
    `${name}・${second},${d1}・${d2},12:25,13:35,予備校３限`,
  ].join('\n');
}
