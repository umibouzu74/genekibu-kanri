// NG に当たっている割当の一覧 (2026-10-27)。
//
// セルの赤枠 (computeActiveAnalysis の ngViolationKeys) は今のタブのセルにしか
// 出ず、⚠ の内訳も「NG設定違反 N件 →(最初のセル)」だけだった。他学年セッションを
// 後から入れると、どのタブのどのコマが当たったかを 1 件ずつ探すことになる
// (冬期講習の作成で「中3 12/26 2限 3A403 国語 小松 (予備校４限)」のような 4 件を
// 手で拾った)。全タブを通して、当たっている割当を理由つきで並べる。
//
// 判定は computeActiveAnalysis と同じ (手動NG = teacher.ngSlots、自動NG =
// computeAutoNgByTeacher の Map)。タブの使う日・使う時限 (effectiveConfigForTab)
// の外のセルは数えない (画面に出ないセル)。合同授業のように同じ日・時限・講師・
// 科目で複数クラスに入っている割当は 1 件にまとめる。

import { effectiveConfigForTab, makeKey, makeNgKey } from './scheduleKey';
import { formatHHmm, getSessionTimeRange } from './timeRange';
import type { AutoNgEntries } from './autoNg';
import { normalizeSessionCourse } from './externalSessionShape';
import type { Project, Teacher } from '../types';

export interface NgViolationItem {
  tabId: number;
  tabName: string;
  /** 最初のクラスのセルの schedule key (飛び先) */
  key: string;
  dateLabel: string;
  periodLabel: string;
  /** 同じ割当の入っているクラス (合同ならいくつか) */
  classLabels: string[];
  subject: string;
  teacher: string;
  /** NG の理由 (「予備校４限 14:20〜15:30」「手動NG」「出勤可能調査で ×」) */
  reasons: string[];
}

// 他学年セッション 1 件の短い説明 (メモ + 講座名 + 時刻)
function describeSession(s: { memo?: string; course?: string; label?: string; startTime?: string; endTime?: string }): string {
  const range = getSessionTimeRange(s);
  const time = range
    ? `${formatHHmm(range.startMin)}〜${range.endMin != null ? formatHHmm(range.endMin) : ''}`
    : (s.label || '');
  const memo = [(s.memo || '').trim(), normalizeSessionCourse(s.course)].filter(Boolean).join(' ');
  if (memo && time) return `${memo} ${time}`;
  return memo || time || '他学年セッション';
}

export function computeNgViolationList(
  project: Pick<Project, 'tabs' | 'dates' | 'periods' | 'teachers'>,
  autoNgByTeacher: Map<string, AutoNgEntries> | null | undefined,
): NgViolationItem[] {
  const teachersByName = new Map<string, Teacher>();
  (project.teachers || []).forEach(t => { if (t?.name) teachersByName.set(t.name, t); });
  const out: NgViolationItem[] = [];
  (project.tabs || []).forEach(tab => {
    const cfg = effectiveConfigForTab(project, tab);
    const byAssignment = new Map<string, NgViolationItem>();
    cfg.dates.forEach(d => {
      cfg.periods.forEach(p => {
        const ngKey = makeNgKey(d.label, p.label);
        cfg.classes.forEach(c => {
          const key = makeKey(d.id, p.id, c.id);
          const entry = tab.schedule?.[key];
          const teacher = entry?.teacher;
          if (!teacher || teacher === '未定') return;
          const isManual = !!teachersByName.get(teacher)?.ngSlots?.includes(ngKey);
          const auto = autoNgByTeacher?.get(teacher)?.get(ngKey);
          if (!isManual && !auto) return;
          const subject = entry?.subject || '';
          const groupKey = JSON.stringify([d.id, p.id, teacher, subject]);
          const existing = byAssignment.get(groupKey);
          if (existing) {
            existing.classLabels.push(c.label);
            return;
          }
          const reasons: string[] = [];
          (auto?.sessions || []).forEach(s => {
            const text = describeSession(s);
            if (!reasons.includes(text)) reasons.push(text);
          });
          if (auto?.availability) reasons.push('出勤可能調査で ×');
          if (isManual) reasons.push('手動NG');
          const item: NgViolationItem = {
            tabId: tab.id,
            tabName: tab.name,
            key,
            dateLabel: d.label,
            periodLabel: p.label,
            classLabels: [c.label],
            subject,
            teacher,
            reasons,
          };
          byAssignment.set(groupKey, item);
          out.push(item);
        });
      });
    });
  });
  return out;
}

// 1 件の読み上げ・一覧用の文 (「中3 12/26(土) 1限 3C 理科 滝澤」)
export function describeNgViolation(item: NgViolationItem, { withTab = true }: { withTab?: boolean } = {}): string {
  const parts = [
    withTab ? item.tabName : '',
    item.dateLabel,
    shortPeriodLabel(item.periodLabel),
    item.classLabels.join('・'),
    item.subject,
    item.teacher,
  ].filter(Boolean);
  return parts.join(' ');
}

// "1限 (13:00~14:00)" → "1限"
export function shortPeriodLabel(label: string): string {
  const short = String(label ?? '').replace(/\s*[(（].*$/, '').trim();
  return short || String(label ?? '');
}
