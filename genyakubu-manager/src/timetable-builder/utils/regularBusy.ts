// ─── 通常授業との講師の重なり (2026-11-13) ───────────────────────────────
// 冬期講習の枠「直前ポイント演習」「弱点補強演習」(1/9〜3/6) のように、通常授業
// (3学期の時間割) が動いている期間の講習では、講師が通常授業を教えている時間に
// 講習のコマを入れてはいけない。以前は重なりとして見ていたのが「同じ講習の中の
// コマ同士」と「他学年セッション → 自動NG」だけで、通常授業は誰も見ていなかった
// (2026 冬期講習で講師入りセル 387 のうち 64 が通常授業と重なり、⚠ は 1 件)。
//
// ここは本体のデータから「講師 → 講習の日付ラベル → その日に教える通常授業」
// (RegularBusy) を解く 1 か所。決めごと:
//   - **保存しない・取り込みボタンにしない**。通常授業は担当変更・振替・休講で動く
//     ので、autoNg と同じく毎回導出する
//   - **「その日に実際に教える人」は本体の utils/teachingMinutes.computeTeachingMinutes
//     に委ねる** (授業時間の集計と同じ関数)。時間割の有効期間と対象学年・曜日・
//     休講日 (例外も)・テスト期間・表示期間 / 終講日・不定期のコマ・隔週の A/B・
//     担当の切り替え・コマ休講・特別時程の時刻・代行 (代行者は教える / 休む人は
//     外れる)・振替 (振替先の日に数える)・合同で吸収された側、を全部本体と同じに
//     読む。**講習側で曜日・時刻の突き合わせを書き起こさない**
//   - 数えるのは通常授業とその代行 (種別 own / sub) だけ。追加授業・特訓シフト・
//     他校舎の授業は入れない (2026-11-13 確定)。講習のコマ自身も渡さない
//   - 日付は講習の日付ラベルを年つきに解いてから引く (courseDates.resolveDateLabelsYmd、
//     年は季節ごとに 1 回)。対象はどれかのタブが使う日 (usedDateLabels)。全タブ・
//     全日程で一律 (冬期講習本体の 12/25〜1/7 は通常授業が無いので自然に 0 件)
//   - 講習の講師マスタに居ない名前の通常授業は入れない (名前は完全一致)
//   - NG への合流は autoNg.computeAutoNgByTeacher の 1 か所。ここは解くだけ
//
// 本体のモジュールを import するので、Web Worker (自動作成) からは import しない。
// 型と空の値は autoNg 側 (worker でも読む)。
import { computeTeachingMinutes } from '../../utils/teachingMinutes';
import { makeEventHelpers } from '../../components/views/dashboardHelpers';
import { EMPTY_REGULAR_BUSY } from './autoNg';
import type { RegularBusy, RegularBusyItem } from './autoNg';
import { isSurveyTeacher } from './availability';
import { projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';
import { parseTimeRange } from './timeRange';
import type { Project } from '../types';

/** 本体から受ける読み取り専用のデータ (contexts/hostDataContext の一部) */
export interface RegularBusyHost {
  regularSlots?: unknown[];
  regularTimetables?: unknown[];
  holidays?: unknown[];
  examPeriods?: unknown[];
  biweeklyAnchors?: unknown[];
  substitutes?: unknown[];
  adjustments?: unknown[];
  daySchedules?: unknown[];
  displayCutoff?: unknown;
}

const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type ProjectForBusy = Pick<Project, 'dates' | 'periods' | 'tabs' | 'teachers'> &
  Partial<Pick<Project, 'updatedAt' | 'createdAt'>>;

/**
 * RegularBusy が何から決まるか (React の memo の鍵)。セルを 1 つ変えるたびに本体の
 * 判定を期間ぶん回し直さないよう、使う日・講師名・年の基準日だけを文字列にする。
 */
export function regularBusyInputKey(project: ProjectForBusy | null | undefined, fallbackYmd: string = todayYmd()): string {
  if (!project) return '';
  return JSON.stringify([
    [...usedDateLabels(project)],
    (project.teachers || []).filter(isSurveyTeacher).map(t => t.name),
    projectBaseYmd(project, fallbackYmd),
  ]);
}

interface MinutesEntry {
  date: string;
  time: string;
  kind: string;
  label: string;
}

/**
 * 講師 → 講習の日付ラベル → その日に教える通常授業。本体のコマが無い (単体で描く)・
 * 講習の日が解けない・重なる授業が無いときは EMPTY_REGULAR_BUSY (同じ参照)。
 */
export function buildRegularBusy(
  project: ProjectForBusy | null | undefined,
  host: RegularBusyHost | null | undefined,
  fallbackYmd: string = todayYmd(),
): RegularBusy {
  const slots = host?.regularSlots || [];
  if (!project || slots.length === 0) return EMPTY_REGULAR_BUSY;
  const names = new Set((project.teachers || []).filter(isSurveyTeacher).map(t => t.name));
  if (names.size === 0) return EMPTY_REGULAR_BUSY;

  // 実日付 → 講習の日付ラベル (同じ日を指すラベルが 2 つあれば両方に載せる)
  const resolved = resolveDateLabelsYmd(usedDateLabels(project), projectBaseYmd(project, fallbackYmd));
  const labelsByYmd = new Map<string, string[]>();
  for (const [label, ymd] of resolved) {
    if (!ymd) continue;
    const list = labelsByYmd.get(ymd);
    if (list) list.push(label);
    else labelsByYmd.set(ymd, [label]);
  }
  if (labelsByYmd.size === 0) return EMPTY_REGULAR_BUSY;
  const ymds = [...labelsByYmd.keys()].sort();

  const holidays = host?.holidays || [];
  const examPeriods = host?.examPeriods || [];
  const { isOffForGrade } = makeEventHelpers(holidays, examPeriods) as {
    isOffForGrade: (date: string, grade: string, subj?: string, slotId?: unknown) => boolean;
  };
  // 講習の日の最初〜最後を 1 回で回す (年は季節ごとに 1 回決めるので 1 年を超えない)。
  // 間の講習の無い日の分は labelsByYmd に無いので捨てる
  const { rows } = computeTeachingMinutes({
    startDate: ymds[0],
    endDate: ymds[ymds.length - 1],
    slots,
    subs: host?.substitutes || [],
    adjustments: host?.adjustments || [],
    daySchedules: host?.daySchedules || [],
    timetables: host?.regularTimetables || [],
    displayCutoff: host?.displayCutoff,
    isOffForGrade,
    biweeklyAnchors: host?.biweeklyAnchors || [],
    holidays,
    examPeriods,
  }) as { rows: Map<string, { entries: MinutesEntry[] }> };

  const out: RegularBusy = {};
  for (const [teacher, row] of rows) {
    if (!names.has(teacher)) continue;
    for (const e of row.entries || []) {
      if (e.kind !== 'own' && e.kind !== 'sub') continue;
      const labels = labelsByYmd.get(e.date);
      if (!labels) continue;
      // 時刻の読めないコマ (時限表記だけ) は重なりを決められないので載せない
      if (!parseTimeRange(e.time)) continue;
      const item: RegularBusyItem = { time: e.time, label: e.label, ...(e.kind === 'sub' ? { sub: true } : {}) };
      const byDate = (out[teacher] ||= {});
      for (const label of labels) (byDate[label] ||= []).push(item);
    }
  }
  return Object.keys(out).length > 0 ? out : EMPTY_REGULAR_BUSY;
}
