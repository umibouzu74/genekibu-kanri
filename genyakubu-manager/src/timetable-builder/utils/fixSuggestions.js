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

const hint = (text) => ({ text });

// noTeacherForSlot: (date, period, subject) で担当できる講師が居ない。
// 提案: 担当登録 / NG 解除 (適用可) / 別時限へ移動。
export function suggestForNoTeacher(item, { currentConfig, teachers, autoNgByTeacher = null } = {}) {
  const { date, period, subject } = item;
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const teaches = reals.filter(t => t.subjects?.includes(subject));
  const suggestions = [];

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
export function suggestForCapacity(item, { currentConfig, maxDailyHours } = {}) {
  const { subject, demand, teacherCount } = item;
  const dates = currentConfig?.dates?.length || 0;
  const periodsLen = currentConfig?.periods?.length || 0;
  // 1 日に教えられる実上限は時限数を超えない (computeInfeasibilities C2 と同じ式)
  const perDayCap = periodsLen > 0 ? Math.min(maxDailyHours, periodsLen) : maxDailyHours;
  const suggestions = [];

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
export function suggestForQuotaMismatch(item) {
  const { totalQuota, cells } = item;
  if (totalQuota < cells) {
    return [hint(`科目コマ数の合計 (${totalQuota}) がセル数 (${cells}) より少なく、全セルを埋める完全解が存在しません。コマ数を増やすか、使う日・時限を減らしてください。`)];
  }
  return [hint(`科目コマ数の合計 (${totalQuota}) がセル数 (${cells}) を超えており、全コマを消化できません。コマ数を減らすか、使う日・時限を増やしてください。`)];
}

// subjectQuotaOverDays: コマ数 > 日数。同日重複禁止のため達成不能。
export function suggestForQuotaOverDays(item) {
  const { subject, quota, days } = item;
  return [hint(`「${subject}」のコマ数 (${quota}) が使う日数 (${days}) を超えています。同じ日に同じ科目は 1 コマまでのため、コマ数を減らすか日数を増やしてください。`)];
}

export function buildFixSuggestions(infeasibilities, ctx = {}) {
  if (!infeasibilities) return infeasibilities;
  const noTeacher = infeasibilities.noTeacherForSlot || { count: 0, items: [] };
  const capacity = infeasibilities.subjectCapacityShortage || { count: 0, items: [] };
  const quotaMismatch = infeasibilities.quotaCellMismatch || { count: 0, items: [] };
  const quotaOverDays = infeasibilities.subjectQuotaOverDays || { count: 0, items: [] };
  return {
    noTeacherForSlot: {
      ...noTeacher,
      items: (noTeacher.items || []).map(it => ({ ...it, suggestions: suggestForNoTeacher(it, ctx) })),
    },
    subjectCapacityShortage: {
      ...capacity,
      items: (capacity.items || []).map(it => ({ ...it, suggestions: suggestForCapacity(it, ctx) })),
    },
    quotaCellMismatch: {
      ...quotaMismatch,
      items: (quotaMismatch.items || []).map(it => ({ ...it, suggestions: suggestForQuotaMismatch(it) })),
    },
    subjectQuotaOverDays: {
      ...quotaOverDays,
      items: (quotaOverDays.items || []).map(it => ({ ...it, suggestions: suggestForQuotaOverDays(it) })),
    },
  };
}
