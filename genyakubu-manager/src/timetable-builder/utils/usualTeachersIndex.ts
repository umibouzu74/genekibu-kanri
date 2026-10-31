// ─── 講習の「普段の担当」(B1 2026-10-31) ────────────────────────────────
// 講習のクラス (ClassEntity.regular で通常授業のクラスに結び付けたもの) ごとに、
// 本体の時間割から科目の普段の担当を引く。本体の時間割は hostData で読み取り専用
// に受ける。基準日は講習の初日 (その日の「今の時間割」とその日の担当。担当の
// 切り替えも当たる)。計算は本体の utils/usualTeachers。
import type { Project } from '../types';
import { buildUsualTeacherIndex } from '../../utils/usualTeachers';
import { projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';
import { effectiveConfigForTab, makeKey } from './scheduleKey';

export interface UsualTeachersIndex {
  /** 基準日 (講習の初日)。日付が無ければ今日 */
  refYmd: string;
  /** そのセルのクラス・科目の普段の担当 (多い順)。対応の無いクラスは [] */
  forClass: (tabId: number, classId: number, subject: string) => string[];
  /** 対応 (ClassEntity.regular) を 1 つでも持つか */
  hasLinks: boolean;
  /** 本体の時間割の学年 (対応の入力候補) */
  grades: string[];
}

const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 講習の初日 (どれかのタブが使う日のうち一番早い日)。無ければ今日 */
export function koshuFirstYmd(project: Project, fallback = todayYmd()): string {
  const labels = usedDateLabels(project);
  const resolved = resolveDateLabelsYmd(labels, projectBaseYmd(project, fallback));
  let first: string | null = null;
  for (const v of resolved.values()) if (v && (!first || v < first)) first = v;
  return first || fallback;
}

export const EMPTY_USUAL_INDEX: UsualTeachersIndex = {
  refYmd: '',
  forClass: () => [],
  hasLinks: false,
  grades: [],
};

export function buildBuilderUsualIndex(
  project: Project,
  regularSlots: unknown[] | undefined,
  regularTimetables: unknown[] | undefined,
): UsualTeachersIndex {
  if (!project) return EMPTY_USUAL_INDEX;
  const refYmd = koshuFirstYmd(project);
  const host = buildUsualTeacherIndex(regularSlots || [], regularTimetables || [], refYmd) as {
    lookup: (grade: string, classes: string[], subject: string) => string[];
    grades: string[];
  };
  const linkById = new Map<string, { grade: string; classes: string[] }>();
  for (const tab of project.tabs || []) {
    for (const c of tab.config?.classes || []) {
      if (c.regular?.grade) linkById.set(`${tab.id}:${c.id}`, c.regular);
    }
  }
  const cache = new Map<string, string[]>();
  return {
    refYmd,
    hasLinks: linkById.size > 0,
    grades: host.grades,
    forClass: (tabId, classId, subject) => {
      const link = linkById.get(`${tabId}:${classId}`);
      if (!link || !subject) return [];
      const k = `${tabId}:${classId}:${subject}`;
      let v = cache.get(k);
      if (!v) {
        v = host.lookup(link.grade, link.classes, subject);
        cache.set(k, v);
      }
      return v;
    },
  };
}

export interface UsualMismatch {
  tabId: number;
  tabName: string;
  key: string;
  dateLabel: string;
  periodLabel: string;
  classLabel: string;
  subject: string;
  teacher: string;
  usual: string[];
}

/**
 * 普段の担当と違うセル (全タブ。講師の入ったセルで、そのクラス・科目に普段の担当が
 * いて、入っている講師がその中にいないもの)。前の講習の時間割を写した後の点検用。
 * 使う日・時限の外のセル (温存されているだけ) は数えない。「未定」も数えない
 */
export function computeUsualMismatches(project: Project, index: UsualTeachersIndex): UsualMismatch[] {
  if (!index.hasLinks) return [];
  const out: UsualMismatch[] = [];
  for (const tab of project.tabs || []) {
    const cfg = effectiveConfigForTab(project, tab);
    for (const d of cfg.dates) {
      for (const p of cfg.periods) {
        for (const c of cfg.classes || []) {
          const key = makeKey(d.id, p.id, c.id);
          const e = tab.schedule?.[key];
          if (!e?.teacher || !e.subject || e.teacher === '未定') continue;
          const usual = index.forClass(tab.id, c.id, e.subject);
          if (usual.length === 0 || usual.includes(e.teacher)) continue;
          out.push({
            tabId: tab.id,
            tabName: tab.name,
            key,
            dateLabel: d.label,
            periodLabel: p.label,
            classLabel: c.label,
            subject: e.subject,
            teacher: e.teacher,
            usual,
          });
        }
      }
    }
  }
  return out;
}

/**
 * 写す時間割の講師を普段の担当で入れ直す (前の講習の時間割を写す「講師は普段の担当で
 * 入れ直す」、B1)。科目のあるセルの講師を、そのクラス・科目の普段の担当のうち、その
 * 日時が NG でない最初の人にする。普段の担当がいない / 全員 NG のセルは講師を空にする
 * (科目だけ写す)。普段の担当の決まらないクラス (対応なし) は元の講師のまま
 */
export function applyUsualTeachersToWrites<W extends { tabId: number; key: string; subject: string; teacher: string }>(
  writes: W[],
  project: Project,
  index: UsualTeachersIndex,
  isNg: (teacher: string, dateLabel: string, periodLabel: string) => boolean,
): { writes: W[]; replaced: number; blanked: number } {
  const dateById = new Map((project.dates || []).map(d => [d.id, d.label]));
  const periodById = new Map((project.periods || []).map(p => [p.id, p.label]));
  const masters = new Set((project.teachers || []).map(t => t.name));
  let replaced = 0;
  let blanked = 0;
  const out = writes.map(w => {
    if (!w.subject) return w;
    const m = w.key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
    if (!m) return w;
    const tab = (project.tabs || []).find(t => t.id === w.tabId);
    const classId = Number(m[3]);
    const hasLink = !!tab?.config?.classes?.find(c => c.id === classId)?.regular?.grade;
    if (!hasLink) return w;
    const dLabel = dateById.get(Number(m[1])) || '';
    const pLabel = periodById.get(Number(m[2])) || '';
    const pick = index.forClass(w.tabId, classId, w.subject).find(t => masters.has(t) && !isNg(t, dLabel, pLabel)) || '';
    if (pick === w.teacher) return w;
    if (pick) replaced++;
    else blanked++;
    return { ...w, teacher: pick };
  });
  return { writes: out, replaced, blanked };
}
