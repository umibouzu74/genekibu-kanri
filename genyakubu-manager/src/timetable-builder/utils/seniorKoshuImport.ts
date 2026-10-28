// 本体の「高校・予備校の講習」(utils/seniorKoshu) → この講習の他学年セッション (2026-10-27)。
//
// 本体に登録した高校部・予備校の講習の担当を、この講習の日付に当たる分だけ他学年セッション
// (時刻つき = 自動NG) にする計画を作る純関数。取り込むのは画面のボタンを押したときだけ
// (ConfigModal/SeniorKoshuImport)。本体が正なので:
//   - 取り込んだセッションには source: 'seniorKoshu' と sourceKey (本体の予定のキー) を付ける。
//     本体の月間にはこれを出さない (本体の登録の「講」カードと二重になる。utils/builderLessons)
//   - 前に取り込んだもので本体から消えた / 変わったものは消す (変わったものは入れ直す)
//   - 手で入れた他学年セッションで、講師・日・時刻が同じものは「置き換える候補」にする
//     (これまで手で入れていた分。既定で置き換える)
//
// 対象の日:
//   - この講習の日 (タブが使う日 + 外部授業だけの日、courseDates.sessionDateLabels) に当たる予定
//   - それ以外で、講習の最初の日の 14 日前〜最後の日の 14 日後に当たる予定は「日付プールに
//     無い日」として知らせる (12/24 の高3 Ⅰ期の初日など。外部授業だけの日として足せる)
//   - 講習の講師にいない名前は取り込まず、名前を出す

import type { ExternalSession, ExternalSessionDraft, Project } from '../types';
import { projectBaseYmd, resolveDateLabelsYmd, sessionDateLabels } from './courseDates';
import { externalSessionContentKey } from './externalSessionShape';
import { ymdToLabel } from './dateGenerate';

/** 本体の expandSeniorKoshu の 1 件 (必要なところだけ) */
export interface SeniorKoshuItemLike {
  key: string;
  teacher: string;
  date: string; // YYYY-MM-DD
  time: string; // "12:25-13:35" / "12:25" / ""
  termName: string;
  periodName: string;
  grade?: string;
  course?: string;
}

export interface SeniorKoshuImportPlan {
  /** 取り込む予定 (この講習の日に当たる・講師がいる) */
  planned: Array<ExternalSessionDraft & { sourceKey: string }>;
  /** 新しく足すもの (前に取り込んでいない / 変わった) */
  toAdd: Array<ExternalSessionDraft & { sourceKey: string }>;
  /** 前に取り込んだもので、本体と同じままのもの */
  unchanged: number;
  /** 前に取り込んだもので、本体で変わったもの (消して入れ直す) */
  changedIds: number[];
  /** 前に取り込んだもので、本体から無くなったもの (消す) */
  staleIds: number[];
  /** 手で入れたもので、講師・日・時刻が取り込む予定と同じもの (置き換える候補) */
  manualDuplicateIds: number[];
  /** 講習の講師にいない名前 */
  unknownTeachers: string[];
  /** 日付プールに無い (講習の日でない) 日の予定。{ ymd, label, count } */
  missingDates: Array<{ ymd: string; label: string; count: number }>;
}

const HM = /^(\d{1,2}):(\d{2})$/;
function parseTime(time: string): { start: string; end?: string } | null {
  const [a, b] = String(time || '').split('-').map(s => s.trim());
  const ma = HM.exec(a || '');
  if (!ma) return null;
  const start = `${ma[1].padStart(2, '0')}:${ma[2]}`;
  const mb = HM.exec(b || '');
  if (!mb) return { start };
  const end = `${mb[1].padStart(2, '0')}:${mb[2]}`;
  return end > start ? { start, end } : { start };
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const MARGIN_DAYS = 14;

/** 取り込む予定の 1 件 (他学年セッションの形) */
export function seniorKoshuSessionDraft(item: SeniorKoshuItemLike, dateLabel: string): ExternalSessionDraft & { sourceKey: string } {
  const t = parseTime(item.time);
  const memo = [item.termName, item.periodName].filter(Boolean).join(' ');
  const course = [item.grade, item.course].filter(Boolean).join(' ');
  return {
    date: dateLabel,
    teacherName: item.teacher,
    label: t ? (t.end ? `${t.start}-${t.end}` : t.start) : '',
    memo,
    ...(course ? { course } : {}),
    ...(t ? { startTime: t.start, ...(t.end ? { endTime: t.end } : {}) } : {}),
    source: 'seniorKoshu',
    sourceKey: item.key,
  };
}

// 開始が同じなら同じ予定 (終わりは片方に無ければ比べない。本体の seniorKoshu.sameAsSeniorKoshu と同じ)
const sameTime = (a: Pick<ExternalSession, 'startTime' | 'endTime'>, b: Pick<ExternalSession, 'startTime' | 'endTime'>) =>
  !!a.startTime && a.startTime === b.startTime && (!a.endTime || !b.endTime || a.endTime === b.endTime);

export function planSeniorKoshuImport(
  project: Project,
  items: readonly unknown[] | null | undefined,
  { todayYmd }: { todayYmd: string },
): SeniorKoshuImportPlan {
  const plan: SeniorKoshuImportPlan = {
    planned: [],
    toAdd: [],
    unchanged: 0,
    changedIds: [],
    staleIds: [],
    manualDuplicateIds: [],
    unknownTeachers: [],
    missingDates: [],
  };
  const sessions = project.externalSessions || [];
  const sourced = sessions.filter(s => s.source === 'seniorKoshu');
  const list = (Array.isArray(items) ? items : []) as SeniorKoshuItemLike[];

  const sessionLabels = sessionDateLabels(project);
  const labels = (project.dates || []).map(d => d.label).filter(l => sessionLabels.has(l));
  const ymdByLabel = resolveDateLabelsYmd(labels, projectBaseYmd(project, todayYmd));
  const labelByYmd = new Map<string, string>();
  for (const l of labels) {
    const ymd = ymdByLabel.get(l);
    if (ymd && !labelByYmd.has(ymd)) labelByYmd.set(ymd, l);
  }
  const ymds = [...labelByYmd.keys()].sort();
  const known = new Set((project.teachers || []).map(t => t.name));
  const unknown = new Set<string>();
  const missing = new Map<string, number>();

  if (ymds.length > 0) {
    const from = shiftYmd(ymds[0], -MARGIN_DAYS);
    const to = shiftYmd(ymds[ymds.length - 1], MARGIN_DAYS);
    for (const it of list) {
      if (!it || typeof it.date !== 'string' || typeof it.teacher !== 'string' || typeof it.key !== 'string') continue;
      if (it.date < from || it.date > to) continue;
      const label = labelByYmd.get(it.date);
      if (!label) {
        missing.set(it.date, (missing.get(it.date) || 0) + 1);
        continue;
      }
      if (!known.has(it.teacher)) {
        unknown.add(it.teacher);
        continue;
      }
      plan.planned.push(seniorKoshuSessionDraft(it, label));
    }
  }

  // 前に取り込んだものとの突き合わせ (sourceKey で)
  const plannedByKey = new Map(plan.planned.map(p => [p.sourceKey, p]));
  const sourcedByKey = new Map<string, ExternalSession>();
  for (const s of sourced) {
    const p = s.sourceKey ? plannedByKey.get(s.sourceKey) : undefined;
    if (!p || sourcedByKey.has(s.sourceKey as string)) {
      plan.staleIds.push(s.id);
      continue;
    }
    sourcedByKey.set(s.sourceKey as string, s);
  }
  for (const p of plan.planned) {
    const s = sourcedByKey.get(p.sourceKey);
    if (!s) {
      plan.toAdd.push(p);
      continue;
    }
    if (externalSessionContentKey(s) === externalSessionContentKey(p)) {
      plan.unchanged++;
    } else {
      plan.changedIds.push(s.id);
      plan.toAdd.push(p);
    }
  }

  // 手で入れたもので、講師・日・時刻が取り込む予定と同じもの
  const plannedByTeacherDate = new Map<string, Array<ExternalSessionDraft>>();
  for (const p of plan.planned) {
    const k = `${p.teacherName}|${p.date}`;
    if (!plannedByTeacherDate.has(k)) plannedByTeacherDate.set(k, []);
    plannedByTeacherDate.get(k)!.push(p);
  }
  for (const s of sessions) {
    if (s.source === 'seniorKoshu') continue;
    const cands = plannedByTeacherDate.get(`${s.teacherName}|${s.date}`) || [];
    if (cands.some(p => sameTime(s, p))) plan.manualDuplicateIds.push(s.id);
  }

  // 本体の並び (日付 → 時刻) で最初に出てきた順 (講師名を漢字の並びで並べない)
  plan.unknownTeachers = [...unknown];
  plan.missingDates = [...missing.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, count]) => ({ ymd, label: ymdToLabel(ymd) || ymd, count }));
  return plan;
}
