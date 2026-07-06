// Firebase RTDB から受信した project ペイロードの適用判定 (E6a)。
//
// RTDB の appData/builder/schedule_project には project の JSON 文字列が
// 入っている (オブジェクト保存だと RTDB が空配列・空オブジェクトを刈り取る
// ため。constants.FIREBASE_PROJECT_PATH のコメント参照)。この文字列を
// ローカル project と突き合わせ、どう扱うかを純粋に決定する。
// Firebase への副作用 (onValue / set) は useHistoryStack 側に置く。
//
// 判定結果:
//   - apply:        validate + migrate + cleanSchedule 済みの project を採用する
//   - identical:    ローカルと同内容 (適用不要)。毎回の起動時にサーバ値が
//                   これに落ちるのが正常系 (適用扱いにすると起動のたびに
//                   履歴リセット + toast が出てしまう)
//   - reject:       ペイロードが壊れている (parse 不能 / 構造不正 / migrate
//                   throw)。ローカルを正としてよい — 次の autosave が
//                   サーバ側の壊れた blob を上書きして自己修復する
//   - stale-client: サーバの project がこのクライアントより新しいスキーマ
//                   version。解釈できず、上書きすると新しい方のデータを
//                   壊すため、このセッションの同期を停止すべき (GitHub
//                   Pages のキャッシュで旧アプリが残っている典型ケース)
import { CURRENT_PROJECT_VERSION, cleanSchedule } from './constants';
import { migrateProject } from './scheduleKey';
import { validateProjectShape } from './projectSchema';
import type { Project } from '../types';

export type RemoteProjectDecision =
  | { action: 'apply'; project: Project }
  | { action: 'identical' }
  | { action: 'reject'; reason: string }
  | { action: 'stale-client'; version: number };

// キー順に依存しない JSON 文字列化 (useSyncedStorage.js と同じ方式)。
// ローカル project とリモート由来 project はオブジェクト構築の経路が違い
// キーの挿入順が一致する保証がないため、比較はこれで行う。
export const stableStringify = (val: unknown): string =>
  JSON.stringify(val, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v)
          .sort()
          .reduce((o: Record<string, unknown>, k: string) => {
            o[k] = (v as Record<string, unknown>)[k];
            return o;
          }, {})
      : v,
  );

export function decideRemoteProject(raw: unknown, localProject: Project): RemoteProjectDecision {
  if (typeof raw !== 'string' || raw === '') {
    return { action: 'reject', reason: 'ペイロードが文字列ではありません' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { action: 'reject', reason: 'JSON として解釈できません' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { action: 'reject', reason: 'プロジェクトがオブジェクトではありません' };
  }

  const version = (parsed as { version?: unknown }).version;
  if (typeof version === 'number' && version > CURRENT_PROJECT_VERSION) {
    return { action: 'stale-client', version };
  }

  const { valid, error } = validateProjectShape(parsed);
  if (!valid) {
    return { action: 'reject', reason: `構造が不正です: ${error}` };
  }

  // migrateProject は解釈できない旧データで throw しうる (設計ルール:
  // 「migration 関数自身は throw でよい」)。ここでは reject に落とす。
  let project: Project;
  try {
    project = cleanSchedule(migrateProject(parsed));
  } catch (e) {
    return { action: 'reject', reason: `migration に失敗しました: ${e instanceof Error ? e.message : e}` };
  }

  if (stableStringify(project) === stableStringify(localProject)) {
    return { action: 'identical' };
  }

  return { action: 'apply', project };
}
