// L3e: 部分解の未充填内訳。
//
// 生成結果が部分解のとき、従来は「159/168 コマ」と最初の詰まり 1 セル
// (stuckSlot) しか出ず、残りの空きセルはグリッドを目視で探すしかなかった。
// パターンの schedule と生成対象タブの実効 config から「どのセルが埋まらな
// かったか」「科目別に何コマ不足か」を集計する。
//
// 未充填の判定は solver のスロット構築 (autoGenerator) と同じ規則:
//   - 空 + locked は「この枠は空けておく」の意思表示 (F5w) → 数えない
//   - subject か teacher が欠けているセル → 未充填 (科目固定で講師だけ
//     埋まらなかったセルも含む)
import { makeKey, makeExternalKey, findCombinedGroup } from './scheduleKey';
import { canTeachSubject, isNgSlot, isNgClass, resolveTeacherDailyLimit, resolveTeacherConsecutive } from '../logic/constraints/teacherConstraints';
import { computeAutoNgByTeacher } from './autoNg';
import { resolveGenerationParams } from './generationParams';
import type { EffectiveConfig, Project, Schedule } from '../types';

export interface UnfilledCell {
  key: string;
  date: string;
  period: string;
  className: string;
}

export interface SubjectShortage {
  subject: string;
  missing: number;
}

export function summarizeUnfilled(
  schedule: Schedule | null | undefined,
  config: Pick<EffectiveConfig, 'dates' | 'periods' | 'classes' | 'subjectCounts'> | null | undefined,
): { cells: UnfilledCell[]; shortages: SubjectShortage[] } {
  if (!schedule || !config) return { cells: [], shortages: [] };
  const cells: UnfilledCell[] = [];
  // §M: 配置数はクラス別に持つ。全クラス合算だと「A クラスの超過」が
  // 「B クラスの不足」を相殺して不足が表示から消える (subjectOver 違反が
  // 併存する手動編集状態で発生)。
  const placedByClass: Record<number, Record<string, number>> = {};
  (config.dates || []).forEach(d => {
    (config.periods || []).forEach(p => {
      (config.classes || []).forEach(c => {
        const key = makeKey(d.id, p.id, c.id);
        const entry = schedule[key];
        if (entry?.subject) {
          const byClass = placedByClass[c.id] || (placedByClass[c.id] = {});
          byClass[entry.subject] = (byClass[entry.subject] || 0) + 1;
        }
        if (entry?.locked && !entry.subject) return; // 空ロック (F5w)
        if (!entry || !entry.subject || !entry.teacher) {
          cells.push({ key, date: d.label, period: p.label, className: c.label });
        }
      });
    });
  });
  // 科目別の不足 = Σ_クラス max(0, クォータ − そのクラスの配置数)。
  // 講師未定でも科目が入っていれば「配置済み」に数える (不足は科目枠の話)。
  const shortages = Object.entries(config.subjectCounts || {})
    .map(([subject, quota]) => ({
      subject,
      missing: (config.classes || []).reduce(
        (sum, c) => sum + Math.max(0, (Number(quota) || 0) - (placedByClass[c.id]?.[subject] || 0)),
        0),
    }))
    .filter(s => s.missing > 0);
  return { cells, shortages };
}

// ─── N3b: 未充填セルの「なぜ埋まらないか」診断 ─────────────────────
//
// L3e の内訳は「どこが」までしか答えず、「設定を直すべきか・もう一度
// 回すべきか」をユーザが判断できなかった。セルごとに solver と同じ制約
// (担当科目 / NG / 同時限重複 / 1日・通算・連続上限) を静的に当て、
//   - noQuotaLeft: 置くべき科目が残っていない (コマ数設定 < 枠数)
//   - noTeacherForSubject: 不足科目の担当講師がそもそもいない
//   - noCandidate: 講師は居るが全員ブロック (理由の内訳付き)
//   - searchExhausted: 置ける候補が居る → 探索切れの可能性 (再生成で埋まりうる)
// に分類する。
//
// 近似の注意: 判定はこの案 (単一タブ) の割当 + externalCounts のみで、
// 他タブの割当は含まない (solver は含む)。そのため実際より「候補あり」寄りに
// 出ることがあるが、searchExhausted の提案 (再生成・探索↑) は他タブ負荷が
// 原因の場合でも無害。
export interface UnfilledCellDiagnosis {
  kind: 'noQuotaLeft' | 'noTeacherForSubject' | 'noCandidate' | 'searchExhausted';
  candidateCount: number;
  reasons: { ng: number; busy: number; overDaily: number; overTotal: number; overConsecutive: number };
}

export function diagnoseUnfilledCells(
  schedule: Schedule | null | undefined,
  config: Pick<EffectiveConfig, 'dates' | 'periods' | 'classes' | 'subjectCounts'> | null | undefined,
  project: Pick<Project, 'teachers' | 'combinedGroups' | 'externalCounts' | 'externalSessions' | 'maxDailyHours' | 'maxConsecutivePeriods'> | null | undefined,
): Map<string, UnfilledCellDiagnosis> {
  const result = new Map<string, UnfilledCellDiagnosis>();
  if (!schedule || !config || !project) return result;
  const teachers = project.teachers || [];
  const combinedGroups = project.combinedGroups || [];
  const externalCounts = project.externalCounts || {};
  const { maxDailyHours, maxConsecutivePeriods } = resolveGenerationParams(project);
  const autoNgByTeacher = computeAutoNgByTeacher(teachers, project.externalSessions || [], config.periods || []);

  // ── この案の割当を 1 パスで集計 (合同は 1 コマ扱い = solver と同規則) ──
  const busy = new Set<string>();                 // `${dateId}|${periodId}|${name}`
  const dailyCount = new Map<string, number>();   // JSON [name, dateId]
  const totalCount = new Map<string, number>();   // name
  const placedByClass: Record<number, Record<string, number>> = {};
  const countedCombined = new Set<string>();
  (config.dates || []).forEach(d => {
    (config.periods || []).forEach(p => {
      (config.classes || []).forEach(c => {
        const entry = schedule[makeKey(d.id, p.id, c.id)];
        if (!entry) return;
        if (entry.subject) {
          const byClass = placedByClass[c.id] || (placedByClass[c.id] = {});
          byClass[entry.subject] = (byClass[entry.subject] || 0) + 1;
        }
        if (!entry.teacher || entry.teacher === '未定') return;
        busy.add(`${d.id}|${p.id}|${entry.teacher}`);
        const group = entry.subject ? findCombinedGroup(combinedGroups, entry.subject, c.label, d.label) : null;
        if (group) {
          const ck = `${d.id}-${p.id}-${group.id}-${entry.teacher}`;
          if (countedCombined.has(ck)) return;
          countedCombined.add(ck);
        }
        const dayKey = JSON.stringify([entry.teacher, d.id]);
        dailyCount.set(dayKey, (dailyCount.get(dayKey) || 0) + 1);
        totalCount.set(entry.teacher, (totalCount.get(entry.teacher) || 0) + 1);
      });
    });
  });
  // 外部コマ (他学年授業の負荷) を日次・通算に合算
  const externalTotalByTeacher = new Map<string, number>();
  teachers.forEach(t => {
    let sum = 0;
    (config.dates || []).forEach(d => {
      sum += externalCounts[makeExternalKey(d.label, t.name)] || 0;
    });
    if (sum > 0) externalTotalByTeacher.set(t.name, sum);
  });

  const periodsOrder = (config.periods || []).map(p => p.id);

  (config.dates || []).forEach(d => {
    (config.periods || []).forEach(p => {
      (config.classes || []).forEach(c => {
        const key = makeKey(d.id, p.id, c.id);
        const entry = schedule[key];
        if (entry?.locked && !entry.subject) return;            // 空ロック (F5w)
        if (entry && entry.subject && entry.teacher) return;    // 充填済み
        // このセルに置くべき科目: 科目固定セルはその科目、空セルはクォータ残のある科目
        const deficitSubjects = entry?.subject
          ? [entry.subject]
          : Object.entries(config.subjectCounts || {})
              .filter(([s, quota]) => (Number(quota) || 0) - (placedByClass[c.id]?.[s] || 0) > 0)
              .map(([s]) => s);
        if (deficitSubjects.length === 0) {
          result.set(key, { kind: 'noQuotaLeft', candidateCount: 0, reasons: { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 } });
          return;
        }
        const pool = teachers.filter(t => deficitSubjects.some(s => canTeachSubject(t, s)));
        if (pool.length === 0) {
          result.set(key, { kind: 'noTeacherForSubject', candidateCount: 0, reasons: { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 } });
          return;
        }
        const reasons = { ng: 0, busy: 0, overDaily: 0, overTotal: 0, overConsecutive: 0 };
        let candidateCount = 0;
        pool.forEach(t => {
          // '未定' は solver が上限・重複の対象外で常に置ける placeholder
          if (t.name === '未定') { candidateCount++; return; }
          if (isNgSlot(t, d.label, p.label, autoNgByTeacher.get(t.name) || null) || isNgClass(t, c.label)) { reasons.ng++; return; }
          if (busy.has(`${d.id}|${p.id}|${t.name}`)) { reasons.busy++; return; }
          const used = (dailyCount.get(JSON.stringify([t.name, d.id])) || 0) + (externalCounts[makeExternalKey(d.label, t.name)] || 0);
          if (used + 1 > resolveTeacherDailyLimit(t, maxDailyHours)) { reasons.overDaily++; return; }
          const totalLimit = t.maxTotalHours;
          if (typeof totalLimit === 'number' && Number.isFinite(totalLimit) && totalLimit > 0) {
            const totalUsed = (totalCount.get(t.name) || 0) + (externalTotalByTeacher.get(t.name) || 0);
            if (totalUsed + 1 > totalLimit) { reasons.overTotal++; return; }
          }
          const maxConsecutive = resolveTeacherConsecutive(t, maxConsecutivePeriods);
          if (maxConsecutive > 0) {
            const placeIdx = periodsOrder.indexOf(p.id);
            if (placeIdx >= 0) {
              const occ = (i: number) => i === placeIdx || busy.has(`${d.id}|${periodsOrder[i]}|${t.name}`);
              let run = 1;
              for (let i = placeIdx - 1; i >= 0 && occ(i); i--) run++;
              for (let i = placeIdx + 1; i < periodsOrder.length && occ(i); i++) run++;
              if (run > maxConsecutive) { reasons.overConsecutive++; return; }
            }
          }
          candidateCount++;
        });
        result.set(key, {
          kind: candidateCount > 0 ? 'searchExhausted' : 'noCandidate',
          candidateCount,
          reasons,
        });
      });
    });
  });
  return result;
}

// 診断を人間可読な短いラベルにする (UnfilledBreakdown 用)。
export function formatDiagnosis(diag: UnfilledCellDiagnosis | undefined): string {
  if (!diag) return '';
  if (diag.kind === 'noQuotaLeft') return '置く科目なし (コマ数設定が枠より少ない)';
  if (diag.kind === 'noTeacherForSubject') return '不足科目の担当講師がいない';
  if (diag.kind === 'searchExhausted') return `候補 ${diag.candidateCount} 名 — 探索切れの可能性`;
  const parts: string[] = [];
  if (diag.reasons.ng > 0) parts.push(`NG ${diag.reasons.ng}`);
  if (diag.reasons.busy > 0) parts.push(`同時限 ${diag.reasons.busy}`);
  if (diag.reasons.overDaily > 0) parts.push(`1日上限 ${diag.reasons.overDaily}`);
  if (diag.reasons.overTotal > 0) parts.push(`通算上限 ${diag.reasons.overTotal}`);
  if (diag.reasons.overConsecutive > 0) parts.push(`連続上限 ${diag.reasons.overConsecutive}`);
  return `置ける講師なし${parts.length > 0 ? ` (${parts.join('・')})` : ''}`;
}
