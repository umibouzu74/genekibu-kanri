// プリセットの名称 / メモ変更を登録済み他学年セッションへ同期するための
// 突き合わせロジック (純粋関数)。
//
// 背景: プリセットは適用時にフォームへ値をコピーするだけのテンプレートで、
// セッション側はプリセット ID を持たない。そのためプリセット名の間違いに
// 後から気づいて直しても (例:「予備校1限」が実は 2限だった)、登録済み
// セッションのメモは古い名称のまま残る。ここでは「そのプリセット由来と
// 推定できるセッション」を突き合わせて、リネームの同期対象を求める。
//
// マッチング規則 (安全側に倒す):
//   1. memo === 旧プリセットの展開ラベル (preset.memo || preset.name —
//      applyPreset / presetMemoBackfill と同じ優先順位) であること。
//      適用後にメモを手で書き換えたセッションは対象にしない
//   2. startTime / endTime が旧プリセットと完全一致 ('' と欠落は同値)。
//      時刻まで一致して初めて「同じプリセット由来」とみなす。これにより
//      連鎖リネーム (1限→2限, 2限→3限, …) でも、直前のリネームで同名に
//      なったばかりの別時刻セッションを誤って巻き込まない
//   3. 期間 (startDateLabel 〜 endDateLabel) では絞らない。プリセットの
//      期間を後から編集していても、ラベル + 時刻が一致するセッションの
//      メモは等しく古い名称であり、直す対象だから
import type { ExternalSession, ExternalSessionPreset } from '../types';

/** セッション登録時にメモへ展開される値 (applyPreset と同じ優先順位) */
export const presetSessionLabel = (
  p: Pick<ExternalSessionPreset, 'name' | 'memo'>,
): string => p.memo || p.name || '';

// '' / undefined / null を同値 (null) に潰して比較する (presetMemoBackfill と同じ)
const normTime = (v: string | null | undefined): string | null => (v ? v : null);

/**
 * 旧プリセット (変更前の値) 由来と推定できるセッションの id を返す。
 * 呼び出し側は返った id のメモを新しい展開ラベルへ書き換える。
 */
export function computePresetRenameSyncIds(
  sessions: ExternalSession[] | null | undefined,
  oldPreset: Pick<ExternalSessionPreset, 'name' | 'memo' | 'startTime' | 'endTime'>,
): number[] {
  const oldLabel = presetSessionLabel(oldPreset);
  if (!oldLabel) return [];
  const start = normTime(oldPreset.startTime);
  const end = normTime(oldPreset.endTime);
  return (sessions || [])
    .filter(s =>
      s.memo === oldLabel
      && normTime(s.startTime) === start
      && normTime(s.endTime) === end,
    )
    .map(s => s.id);
}
