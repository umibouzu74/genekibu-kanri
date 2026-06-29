// E1g: infeasibility (静的に解けない設定) ごとに、具体的な解決策の文字列を
// 生成する純粋関数。computeInfeasibilities の検出結果に「ではどう直すか」を
// 添えてデバッグ時間を短縮する。
//
// 提案はあくまでヒント。自動適用はせず、ユーザが選んで手で直す前提。
import { makeNgKey } from './scheduleKey';

// noTeacherForSlot: (date, period, subject) で担当できる講師が居ない。
// 提案: 担当登録 / NG 解除 / 別時限へ移動。
export function suggestForNoTeacher(item, { currentConfig, teachers, autoNgByTeacher = null } = {}) {
  const { date, period, subject } = item;
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const teaches = reals.filter(t => t.subjects?.includes(subject));
  const suggestions = [];

  if (teaches.length === 0) {
    suggestions.push(`「${subject}」を担当できる講師が居ません。講師マスタで誰かに「${subject}」を割り当ててください。`);
    return suggestions;
  }

  // この時限で手動 NG の担当講師 (解除すれば埋まる)
  const hereKey = makeNgKey(date, period);
  const manualNg = teaches.filter(t => t.ngSlots?.includes(hereKey));
  if (manualNg.length > 0) {
    const names = manualNg.slice(0, 3).map(t => t.name).join('、');
    const more = manualNg.length > 3 ? ` 他${manualNg.length - 3}名` : '';
    suggestions.push(`${date} ${period} の NG を解除する: ${names}${more}`);
  }

  // 別の時限なら担当可能か (同じ日で空きのある時限)
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
    suggestions.push(`別の時限なら担当可能: ${shown}${more}（この科目を移すか時限を入れ替える）`);
  }

  // 具体策が無ければ汎用フォールバック
  if (suggestions.length === 0) {
    suggestions.push(`「${subject}」を担当できる講師を増やすか、この時限を空けられるよう NG を見直してください。`);
  }
  return suggestions;
}

// subjectCapacityShortage: 科目の総需要 > 講師の理論最大 capacity。
// 提案: 担当講師を増やす / 1日上限を上げる / コマ数を減らす。
export function suggestForCapacity(item, { currentConfig, maxDailyHours } = {}) {
  const { subject, demand, teacherCount } = item;
  const dates = currentConfig?.dates?.length || 0;
  const suggestions = [];

  if (dates > 0 && maxDailyHours > 0) {
    const neededTeachers = Math.ceil(demand / (dates * maxDailyHours));
    const add = Math.max(0, neededTeachers - teacherCount);
    if (add > 0) {
      suggestions.push(`「${subject}」担当の講師を あと ${add} 名 増やす`);
    }
  }

  if (teacherCount > 0 && dates > 0) {
    const neededMax = Math.ceil(demand / (teacherCount * dates));
    if (neededMax > maxDailyHours) {
      suggestions.push(`1日コマ数上限を ${maxDailyHours} → ${neededMax} に上げる（⚡自動生成タブ）`);
    }
  }

  suggestions.push(`「${subject}」の科目コマ数を減らす（全クラス計 ${demand} コマ必要）`);
  return suggestions;
}

// infeasibilities (computeInfeasibilities の戻り値) の各 item に suggestions を
// 付与した新しいオブジェクトを返す。元のオブジェクトは変更しない。
export function buildFixSuggestions(infeasibilities, ctx = {}) {
  if (!infeasibilities) return infeasibilities;
  const noTeacher = infeasibilities.noTeacherForSlot || { count: 0, items: [] };
  const capacity = infeasibilities.subjectCapacityShortage || { count: 0, items: [] };
  return {
    noTeacherForSlot: {
      ...noTeacher,
      items: (noTeacher.items || []).map(it => ({ ...it, suggestions: suggestForNoTeacher(it, ctx) })),
    },
    subjectCapacityShortage: {
      ...capacity,
      items: (capacity.items || []).map(it => ({ ...it, suggestions: suggestForCapacity(it, ctx) })),
    },
  };
}
