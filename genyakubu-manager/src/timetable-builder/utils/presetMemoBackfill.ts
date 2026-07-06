// メモ未設定の他学年セッションへ、時刻が一致するプリセットの名前を
// 後付けするための突き合わせロジック (純粋関数)。
//
// 背景: プリセット適用時にプリセット名をメモへ展開する対応 (2026-07-06) 以前に
// 登録されたセッションは、メモが空だと時刻しか情報が無く「予備校か高校か」を
// 判別できない。ただしセッションには startTime / endTime が保存されているので、
// プリセットの時刻と突き合わせれば由来をほぼ復元できる。
//
// マッチング規則 (安全側に倒す):
//   1. 対象はメモが空で startTime を持つセッションのみ (既存メモは上書きしない)
//   2. プリセット候補 = startTime / endTime が完全一致 (どちらも '' と欠落は
//      同値扱い)。プリセットに期間があり、かつ期間・セッション日付の両方が
//      日付プールで解決できる場合は、期間外のプリセットを候補から外す
//      (解決できない場合は除外しない — プール変更で期間が消えた場合に
//      時刻一致まで捨てない)
//   3. 候補が 1 つ → 採用。複数 → プリセットの対象講師リストに
//      セッションの講師が入っているものだけに絞り、1 つに絞れたら採用、
//      それでも複数なら「判別不能」としてスキップ
//   4. 適用する値は applyPreset と同じ優先順位 (preset.memo || preset.name)
import { sortPoolDatesByCalendar } from './dateGenerate';
import type { Entity, ExternalSession, ExternalSessionPreset } from '../types';

export interface PresetMemoAssignment {
  sessionId: number;
  memo: string;
  presetName: string;
}

export interface PresetMemoBackfillResult {
  /** 適用可能な (sessionId, memo) の組 */
  assignments: PresetMemoAssignment[];
  /** 時刻が複数プリセットに一致して判別できなかった件数 */
  ambiguousCount: number;
  /** 一致するプリセットが無い / 時刻なしで突き合わせ不能の件数 */
  noMatchCount: number;
}

// '' / undefined / null を同値 (null) に潰して比較する
const normTime = (v: string | null | undefined): string | null => (v ? v : null);

export function computePresetMemoBackfill(
  sessions: ExternalSession[] | null | undefined,
  presets: ExternalSessionPreset[] | null | undefined,
  poolDates: Entity[] | null | undefined,
): PresetMemoBackfillResult {
  const result: PresetMemoBackfillResult = { assignments: [], ambiguousCount: 0, noMatchCount: 0 };
  const presetList = presets || [];
  if (presetList.length === 0) {
    result.noMatchCount = (sessions || []).filter(s => !s.memo && normTime(s.startTime)).length;
    return result;
  }

  // 期間判定用: プールのカレンダー順位置 (AbsenceNgPanel の期間 slice と同じ座標系)
  const idxByLabel = new Map(
    sortPoolDatesByCalendar(poolDates || []).map((d, i) => [d.label, i] as const),
  );

  // プリセットの期間がセッションの日付を「明確に」除外するか。
  // ラベルがプールで解決できないときは除外しない (規則 2)。
  const dateExcludes = (p: ExternalSessionPreset, sessionDate: string): boolean => {
    if (!p.startDateLabel) return false;
    const s = idxByLabel.get(p.startDateLabel);
    const d = idxByLabel.get(sessionDate);
    if (p.endDateLabel) {
      const e = idxByLabel.get(p.endDateLabel);
      if (s == null || e == null || d == null) return false;
      const lo = Math.min(s, e);
      const hi = Math.max(s, e);
      return d < lo || d > hi;
    }
    // 終了日なし = 単日プリセット (applyPreset の解釈と同じ)
    if (s == null || d == null) return false;
    return d !== s;
  };

  (sessions || []).forEach(s => {
    if (s.memo) return; // 既存メモは対象外
    const start = normTime(s.startTime);
    if (!start) {
      result.noMatchCount++;
      return;
    }
    const end = normTime(s.endTime);

    let candidates = presetList.filter(p =>
      normTime(p.startTime) === start
      && normTime(p.endTime) === end
      && !dateExcludes(p, s.date),
    );
    if (candidates.length > 1) {
      // 対象講師リストで絞り込み (講師なしプリセットは絞り込みに使えない)
      const narrowed = candidates.filter(p =>
        Array.isArray(p.teachers) && p.teachers.includes(s.teacherName),
      );
      if (narrowed.length === 1) candidates = narrowed;
    }

    if (candidates.length === 1) {
      const p = candidates[0];
      result.assignments.push({
        sessionId: s.id,
        memo: p.memo || p.name,
        presetName: p.name,
      });
    } else if (candidates.length > 1) {
      result.ambiguousCount++;
    } else {
      result.noMatchCount++;
    }
  });

  return result;
}
