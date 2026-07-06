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
import { stableStringify } from '../../utils/stableStringify';
import type { Project } from '../types';

// 比較・echo 判定は親アプリと共通の stableStringify を使う (実装を分岐
// させると「同じ値」の定義がズレて擬似 apply の温床になる)。テスト等の
// 既存 import 互換のため再エクスポートする。
export { stableStringify };

export type RemoteProjectDecision =
  | { action: 'apply'; project: Project }
  | { action: 'identical' }
  | { action: 'reject'; reason: string }
  | { action: 'stale-client'; version: number };

// parse 済みオブジェクトが「このクライアントより新しいスキーマの project」
// かを判定し、該当すればその version を返す。
//
// - version は数値のほか文字列 "5" も受ける (将来の直列化形式の変化や手編集
//   への防御。数値化できなければ対象外)
// - 非空 tabs を要求する: tabs は project の中核データで、将来スキーマでも
//   残る前提 (ARCHITECTURE §4.1 のルールに明記)。これが無いと
//   '{"version":99}' のようなゴミ blob まで stale-client 扱いになり、全
//   クライアントが同期停止して reject の自己修復 (autosave 上書き) が
//   永遠に届かなくなる
const newerSchemaVersionOf = (obj: Record<string, unknown>): number | null => {
  const rawVersion = obj.version;
  const version =
    typeof rawVersion === 'number' ? rawVersion
    : typeof rawVersion === 'string' ? Number(rawVersion)
    : NaN;
  if (!Number.isFinite(version) || version <= CURRENT_PROJECT_VERSION) return null;
  return Array.isArray(obj.tabs) && obj.tabs.length > 0 ? version : null;
};

// RTDB の生値 (JSON 文字列想定) 版。useHistoryStack が初回送信前の
// 一回きりの get() チェックに使う (受信側の stale-client 検出は初回
// スナップショット到着前の送信には効かないため)。
export function newerSchemaVersion(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return newerSchemaVersionOf(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

// 同一性比較用の正規化。
// - activeTabId は「どのタブを見ているか」のビュー状態で、編集内容ではない。
//   比較に含めるとタブ切替だけで 'apply' になり、受信側の Undo 履歴が
//   ナビゲーション操作で消える (適用側でもローカルの activeTabId を温存する
//   — useHistoryStack 参照)
// - updatedAt は編集のたびに変わるブックキーピングで、これだけが違う
//   payload を「変更」と扱う価値がない
const comparableJson = (p: Project): string =>
  stableStringify({ ...p, activeTabId: null, updatedAt: null });

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

  // JSON 読込 (useJsonIO L1d) と同じく、同梱テンプレートは project state に
  // 混ぜない。strip しないと templates 入り blob が state → LS → RTDB と
  // 恒久的に往復して肥大する (テンプレート実体は端末ローカル管理)。
  const { templates: _templates, ...projectData } = parsed as Record<string, unknown>;

  const staleVersion = newerSchemaVersionOf(projectData);
  if (staleVersion != null) {
    return { action: 'stale-client', version: staleVersion };
  }

  const { valid, error } = validateProjectShape(projectData);
  if (!valid) {
    return { action: 'reject', reason: `構造が不正です: ${error}` };
  }

  // migrateProject は解釈できない旧データで throw しうる (設計ルール:
  // 「migration 関数自身は throw でよい」)。ここでは reject に落とす。
  let project: Project;
  try {
    project = cleanSchedule(migrateProject(projectData));
  } catch (e) {
    return { action: 'reject', reason: `migration に失敗しました: ${e instanceof Error ? e.message : e}` };
  }

  // ローカル側にも cleanSchedule をかけて比較を対称にする。loadInitialProject
  // は migrate のみで clean しないため、stale キーを含む旧データでは
  // byte 一致のサーバ copy が 'apply' 判定になってしまう (擬似の履歴リセット
  // + toast)。
  if (comparableJson(project) === comparableJson(cleanSchedule(localProject))) {
    return { action: 'identical' };
  }

  return { action: 'apply', project };
}
