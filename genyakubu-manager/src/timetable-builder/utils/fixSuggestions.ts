// E1g / E2b: infeasibility (静的に解けない設定) ごとに、具体的な解決策を
// 生成する純粋関数。computeInfeasibilities の検出結果に「ではどう直すか」を
// 添えてデバッグ時間を短縮する。
//
// 各提案は { text, action? } の形。action があるものはワンクリックで適用できる
// (E2b)。action の解決・適用は呼び出し側 (Toolbar) が行う。
//   - { type: 'releaseNg', teacherName, date, period }: 講師の手動 NG を解除
//   - { type: 'setMaxDaily', value }: 1 日コマ数上限を value に変更
// action 無しの提案は手作業が必要なヒント (別時限へ移動 / 講師を増やす等)。
import { makeNgKey } from './scheduleKey';
import { clampGenerationParam } from './constants';
import type { Entity, Teacher } from '../types';
import type { AutoNgEntries } from './autoNg';

export type FixAction =
  | { type: 'releaseNg'; teacherName: string; date: string; period: string }
  | { type: 'setMaxDaily'; value: number };

export interface FixSuggestion {
  text: string;
  action?: FixAction;
}

// 提案生成が読む文脈。item は computeInfeasibilities (analysisHelpers) の
// 戻り値要素なので、Phase 2b 時点では最小限のフィールドだけ型に貼る。
export interface SuggestContext {
  currentConfig?: { dates?: Entity[]; periods?: Entity[] };
  teachers?: Teacher[];
  autoNgByTeacher?: Map<string, AutoNgEntries> | null;
  maxDailyHours?: number;
}

const hint = (text: string): FixSuggestion => ({ text });

// noTeacherForSlot: (date, period, subject) で担当できる講師が居ない。
// 提案: 担当登録 / NG 解除 (適用可) / 別時限へ移動。
export function suggestForNoTeacher(
  item: { date: string; period: string; subject: string },
  { currentConfig, teachers, autoNgByTeacher = null }: SuggestContext = {},
): FixSuggestion[] {
  const { date, period, subject } = item;
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const teaches = reals.filter(t => t.subjects?.includes(subject));
  const suggestions: FixSuggestion[] = [];

  if (teaches.length === 0) {
    return [hint(`「${subject}」を担当できる講師が居ません。講師マスタで誰かに「${subject}」を割り当ててください。`)];
  }

  // この時限で手動 NG の担当講師 → 1 名ずつ「NG 解除」アクションを出す
  const hereKey = makeNgKey(date, period);
  const manualNg = teaches.filter(t => t.ngSlots?.includes(hereKey));
  manualNg.forEach(t => {
    suggestions.push({
      text: `${t.name} の ${date} ${period} の NG を解除`,
      action: { type: 'releaseNg', teacherName: t.name, date, period },
    });
  });

  // 別の時限なら担当可能か (同じ日で空きのある時限) — 移動は手作業ヒント
  const altPeriods = (currentConfig?.periods || [])
    .filter(p => p.label !== period)
    .filter(p => {
      const k = makeNgKey(date, p.label);
      return teaches.some(t => !t.ngSlots?.includes(k) && !autoNgByTeacher?.get(t.name)?.has(k));
    })
    .map(p => p.label);
  if (altPeriods.length > 0) {
    const shown = altPeriods.slice(0, 3).join(' / ');
    const more = altPeriods.length > 3 ? ' …' : '';
    suggestions.push(hint(`別の時限なら担当可能: ${shown}${more}（この科目を移すか時限を入れ替える）`));
  }

  if (suggestions.length === 0) {
    suggestions.push(hint(`「${subject}」を担当できる講師を増やすか、この時限を空けられるよう NG を見直してください。`));
  }
  return suggestions;
}

// subjectCapacityShortage: 科目の総需要 > 講師の理論最大 capacity。
// 提案: 担当講師を増やす / 1日上限を上げる (適用可) / コマ数を減らす。
export function suggestForCapacity(
  item: { subject: string; demand: number; teacherCount: number },
  // maxDailyHours にデフォルト値は与えない (旧 JS は undefined のとき比較が
  // すべて false になり setMaxDaily 提案を出さなかった。= 0 を置くと
  // 「0 → N に上げる」という嘘の提案が生成される)。production 経路
  // (useAnalysis) は常に数値を渡す。
  { currentConfig, maxDailyHours }: SuggestContext = {},
): FixSuggestion[] {
  const { subject, demand, teacherCount } = item;
  const dates = currentConfig?.dates?.length || 0;
  const periodsLen = currentConfig?.periods?.length || 0;
  // 1 日に教えられる実上限は時限数を超えない (computeInfeasibilities C2 と同じ式)
  const perDayCap = periodsLen > 0 ? Math.min(maxDailyHours, periodsLen) : maxDailyHours;
  const suggestions: FixSuggestion[] = [];

  if (dates > 0 && perDayCap > 0) {
    const neededTeachers = Math.ceil(demand / (dates * perDayCap));
    const add = Math.max(0, neededTeachers - teacherCount);
    if (add > 0) {
      suggestions.push(hint(`「${subject}」担当の講師を あと ${add} 名 増やす`));
    }
  }

  if (teacherCount > 0 && dates > 0) {
    const neededMax = Math.ceil(demand / (teacherCount * dates));
    // 設定可能な上限 (GENERATION_PARAM_BOUNDS.maxDailyHours.max) を超える値は
    // 適用しても clamp されるので、提案値・表示・action を実際に適用される値に
    // 揃える (review F2: toast が嘘にならないように)。clamp 後も現状を上回る
    // 場合のみ提案する。時限数を超える引き上げは効果が無いので提案しない。
    const applicableMax = clampGenerationParam('maxDailyHours', neededMax);
    if (applicableMax > maxDailyHours && (periodsLen === 0 || applicableMax <= periodsLen)) {
      suggestions.push({
        text: `1日コマ数上限を ${maxDailyHours} → ${applicableMax} に上げる`,
        action: { type: 'setMaxDaily', value: applicableMax },
      });
    }
  }

  suggestions.push(hint(`「${subject}」の科目コマ数を減らす（全クラス計 ${demand} コマ必要）`));
  return suggestions;
}

// infeasibilities (computeInfeasibilities の戻り値) の各 item に suggestions を
// 付与した新しいオブジェクトを返す。元のオブジェクトは変更しない。
// quotaCellMismatch: クォータ合計 ≠ セル数。方向に応じた文言のヒントのみ。
export function suggestForQuotaMismatch(item: { totalQuota: number; cells: number }): FixSuggestion[] {
  const { totalQuota, cells } = item;
  if (totalQuota < cells) {
    return [hint(`科目コマ数の合計 (${totalQuota}) がセル数 (${cells}) より少なく、全セルを埋める完全解が存在しません。コマ数を増やすか、使う日・時限を減らしてください。`)];
  }
  return [hint(`科目コマ数の合計 (${totalQuota}) がセル数 (${cells}) を超えており、全コマを消化できません。コマ数を減らすか、使う日・時限を増やしてください。`)];
}

// subjectQuotaOverDays: コマ数 > 日数。同日重複禁止のため達成不能。
export function suggestForQuotaOverDays(item: { subject: string; quota: number; days: number }): FixSuggestion[] {
  const { subject, quota, days } = item;
  return [hint(`「${subject}」のコマ数 (${quota}) が使う日数 (${days}) を超えています。同じ日に同じ科目は 1 コマまでのため、コマ数を減らすか日数を増やしてください。`)];
}

// subjectPlaceholderOnly (K2d): 実講師 0 名で「未定」だけが担当する科目。
// 生成は未定で埋まるため致命ではないが、実運用までに担当割当が必要。
export function suggestForPlaceholderOnly(item: { subject: string; demand: number }): FixSuggestion[] {
  const { subject, demand } = item;
  return [hint(`「${subject}」(全クラス計 ${demand} コマ) は現在「未定」のみが担当しています。生成は未定で埋まりますが、実運用までに実講師を割り当ててください。`)];
}

// F2m: infeasibility 種別のレジストリ。種別ごとの「popover 表示ラベル」と
// 「修正提案の生成関数」をここに集約し、buildFixSuggestions と Toolbar の
// 同型 4 連ブロックを解消する。新しい種別を computeInfeasibilities に
// 追加するときは、ここに 1 エントリ足せば表示と提案の両方に反映される。
//   - key: computeInfeasibilities の戻り値のフィールド名
//   - kind: 表示側の種別識別子 (Toolbar の item.kind)
//   - informational: true = popover には出すが ⚠ バッジ件数には数えない
//     (quotaCellMismatch は「意図的にコマ数をセル数未満にして残りを手動
//     運用」が正当にあり得るため。数えると違反ゼロでも赤バッジが恒久点灯)
//   - label(item): popover に出す 1 行文言
//   - suggest(item, ctx): 修正提案 ({ text, action? }[])
export interface InfeasibilityKind {
  key: string;
  kind: string;
  /** true = popover には出すが ⚠ バッジ件数には数えない */
  informational?: boolean;
  label: (item: any) => string;
  suggest: (item: any, ctx: SuggestContext) => FixSuggestion[];
}

export const INFEASIBILITY_KINDS: InfeasibilityKind[] = [
  {
    key: 'noTeacherForSlot',
    kind: 'noTeacher',
    label: (it: any) => `${it.date} ${it.period} の${it.subject}: 担当できる講師が居ません (全員 NG または未登録)`,
    suggest: suggestForNoTeacher,
  },
  {
    key: 'subjectCapacityShortage',
    kind: 'capacity',
    label: (it: any) => `${it.subject}: 必要 ${it.demand} コマ > 講師 capacity ${it.capacity} (担当${it.teacherCount}人)`,
    suggest: suggestForCapacity,
  },
  {
    key: 'subjectPlaceholderOnly',
    kind: 'placeholderOnly',
    // 未定で生成は通るので致命ではない (⚠ バッジに数えない)。
    // 「実講師がまだ居ない」の気付きとして popover にだけ出す (K2d)
    informational: true,
    label: (it: any) => `${it.subject}: 実講師の担当者がいません (現在は「未定」のみ。生成は可能)`,
    suggest: suggestForPlaceholderOnly,
  },
  {
    key: 'quotaCellMismatch',
    kind: 'quotaMismatch',
    informational: true,
    label: (it: any) => `科目コマ数の合計 ${it.totalQuota} ≠ セル数 ${it.cells}${it.className ? `【${it.className}】` : ''} (使う日 × 使う時限${it.lockedEmpty ? ` − 空ロック ${it.lockedEmpty}` : ''})。完全解を狙う場合は一致させてください`,
    suggest: suggestForQuotaMismatch,
  },
  {
    key: 'subjectQuotaOverDays',
    kind: 'quotaOverDays',
    label: (it: any) => `${it.subject}: コマ数 ${it.quota} > 使う日数 ${it.days} (同日重複禁止のため達成不能)`,
    suggest: suggestForQuotaOverDays,
  },
];

// L1h: 生成前の事前警告用。informational でない種別 (= 完全解が静的に
// 不可能な設定) の合計件数を返す。BuilderApp が 🧙‍♂️ 自動作成の前に
// これを見て「それでも部分解を生成するか」を確認する。
export function countFatalInfeasibilities(infeasibilities: any): number {
  if (!infeasibilities) return 0;
  return INFEASIBILITY_KINDS
    .filter(k => !k.informational)
    .reduce((n, k) => n + (infeasibilities[k.key]?.count || 0), 0);
}

export function buildFixSuggestions(infeasibilities: any, ctx: SuggestContext = {}): any {
  if (!infeasibilities) return infeasibilities;
  const out: Record<string, any> = {};
  INFEASIBILITY_KINDS.forEach(({ key, suggest }) => {
    const src = infeasibilities[key] || { count: 0, items: [] };
    out[key] = {
      ...src,
      items: (src.items || []).map((it: any) => ({ ...it, suggestions: suggest(it, ctx) })),
    };
  });
  return out;
}
