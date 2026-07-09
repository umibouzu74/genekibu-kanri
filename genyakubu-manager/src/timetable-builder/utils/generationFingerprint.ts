// F2n/F2p: 生成結果 (自動生成の案) の失効判定に使う config fingerprint。
//
// 生成された案は「生成時点の構造 (使う日・使う時限・クラス・クォータ・
// 合同グループ・生成制約)」を前提にしている。生成後にこれらが変わると、
// 案の schedule キーが存在しない/別の entity を指したり、クォータ的に
// 誤った案を「この案を採用」で書き込めてしまう (F2n)。タブ削除 → 再作成で
// ID が再利用されると、無関係な新タブへ旧案を適用できる (F2p)。
//
// 生成開始時に fingerprint を捕捉し、以後 project が変わるたびに再計算して
// 一致しなくなったら案を破棄する (BuilderApp)。
//
// **意図的に含めないもの**:
//   - teachers (NG / 担当変更): 案の構造は壊れず、採用後の違反は
//     ⚠ バッジ / NG ハイライトが検出する。講師調整のたびに案が消えると
//     「NG を直してから採用」という自然な運用ができなくなる
//   - externalCounts / externalSessions / 他タブの schedule: 同上
//     (違反として可視化される。構造は不変)
//   - 自タブの schedule: 採用 = 生成結果で置き換える操作なので、生成後の
//     手動編集は「採用したら破棄される」ことをユーザが選択できてよい
//   - numPatterns / maxIterations: 生成の探索量であって案の意味を変えない
import { resolveGenerationParams } from './generationParams';
import type { Project } from '../types';

export function computeGenerationFingerprint(project: Project | null | undefined, tabId: number): string | null {
  const tab = (project?.tabs || []).find(t => t.id === tabId);
  if (!tab) return null;
  const { maxDailyHours, maxConsecutivePeriods } = resolveGenerationParams(project);
  return JSON.stringify({
    dates: project.dates || [],
    periods: project.periods || [],
    config: {
      classes: tab.config?.classes || [],
      subjectCounts: tab.config?.subjectCounts || {},
      // §N: クラス別上書きの変更も案を失効させる (クォータ的に誤った案の
      // 採用を防ぐ)。モードの ON/OFF ({} ↔ null) 自体は実効クォータを
      // 変えないが、保守的に含める。
      classSubjectCounts: tab.config?.classSubjectCounts ?? null,
      activeDateIds: tab.config?.activeDateIds ?? null,
      activePeriodIds: tab.config?.activePeriodIds ?? null,
    },
    combinedGroups: project.combinedGroups || [],
    maxDailyHours,
    maxConsecutivePeriods,
  });
}
