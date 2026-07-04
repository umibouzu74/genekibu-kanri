// 日付ラベルの表記ゆれ統一 (migrateProject から呼ぶ純粋関数)。
//
// 手動追加が date picker 化される前のデータには「8/6」のような曜日サフィックス
// 無しのラベルが残っており、現行形式「8/6(木)」と別 entity として日付プールに
// 共存してしまう (NG パネルに同じ日が 2 つ並ぶ)。renameHeader は重複ラベルへの
// リネームを reject する (H3) ため、UI からはマージできない。ここで読込時に
// 「M/D(曜)」形式へ寄せる:
//
//   - 同じ月日の「M/D(曜)」entity がプールに居る場合 → その entity へ **マージ**
//     (schedule キー / activeDateIds / NG / externalCounts / 合同グループ /
//     他学年セッション / プリセットの参照を付け替えて裸 entity を除去)。
//     衝突時は既存の (曜) 側のデータを優先し、裸側は捨てる。
//   - 居ない場合 → 曜日を推定して「M/D(曜)」へ **リネーム** (参照も追従)。
//     年はラベルに無いので、プール内の (曜) 付きラベル全部と矛盾しない年を
//     現在年 ±α から探して決める。候補年間で曜日が割れる・(曜) 付きが 1 つも
//     無い等、確実に決まらないときは触らない (誤った曜日を付けない)。
//
// 冪等: 統一後のプールに裸ラベルは残らないので 2 回目以降は no-op。
import type { CombinedGroup, Entity, Schedule, Tab, TabSnapshot, Teacher } from '../types';
import { WEEKDAY_LABELS } from './dateGenerate';
import { makeDateKeyDropMatcher } from './labelRefs';

const BARE_RE = /^(\d{1,2})\/(\d{1,2})$/;
const SUFFIXED_RE = /^(\d{1,2})\/(\d{1,2})\(([日月火水木金土])\)$/;

// 実在する日付なら Date (ローカル正午)、桁あふれ (2/30 等) は null。
function makeValidDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

interface ParsedPoolDate {
  entity: Entity;
  month: number;
  day: number;
  /** '日'〜'土'。裸ラベルは null */
  weekday: string | null;
}

// プール entity を月日でパースする。M/D と解釈できないラベルは null。
function parsePoolDate(entity: Entity): ParsedPoolDate | null {
  const label = typeof entity?.label === 'string' ? entity.label : '';
  const bare = label.match(BARE_RE);
  const suffixed = bare ? null : label.match(SUFFIXED_RE);
  const m = bare || suffixed;
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { entity, month, day, weekday: suffixed ? suffixed[3] : null };
}

// (曜) 付きラベル全部と矛盾しない年の候補を nowYear-6〜nowYear+2 から探す。
// wrapsYear (10〜12月と1〜3月の混在 = 年またぎ講習) は sortPoolDatesByCalendar
// と同じ前提で 1〜3 月を翌年扱いにする。
function findCandidateYears(
  suffixed: ParsedPoolDate[],
  wrapsYear: boolean,
  nowYear: number,
): number[] {
  if (suffixed.length === 0) return [];
  const out: number[] = [];
  for (let y = nowYear - 6; y <= nowYear + 2; y++) {
    const allMatch = suffixed.every(s => {
      const dt = makeValidDate(wrapsYear && s.month <= 3 ? y + 1 : y, s.month, s.day);
      return dt !== null && WEEKDAY_LABELS[dt.getDay()] === s.weekday;
    });
    if (allMatch) out.push(y);
  }
  return out;
}

// 候補年すべてで同じ曜日になるときだけその曜日を返す (割れたら null)。
function inferWeekday(
  month: number,
  day: number,
  candidateYears: number[],
  wrapsYear: boolean,
): string | null {
  if (candidateYears.length === 0) return null;
  let weekday: string | null = null;
  for (const y of candidateYears) {
    const dt = makeValidDate(wrapsYear && month <= 3 ? y + 1 : y, month, day);
    if (!dt) return null;
    const wd = WEEKDAY_LABELS[dt.getDay()];
    if (weekday === null) weekday = wd;
    else if (weekday !== wd) return null;
  }
  return weekday;
}

// NG キー / external キー (`${dateLabel}-...`) の日付部分が oldLabel に
// 「既知ラベル中の最長一致で」該当するキーだけ prefix を書き換える。
// 素の startsWith だと「8/6」の書き換えが「8/6-補講-1限」まで巻き込む
// (labelRefs の削除系 matcher と同じ注意点)。
function renameKeyPrefixExact(
  key: string,
  isTarget: (key: string) => boolean,
  oldLabel: string,
  newLabel: string,
): string {
  return isTarget(key) ? `${newLabel}-${key.substring(oldLabel.length + 1)}` : key;
}

// schedule のキー d{oldId}-... を d{newId}-... へ付け替える。付け替え先の
// キーが既に存在する (= (曜) 側にもコマが入っている) セルは既存を優先して
// 裸側を捨てる。
function remapScheduleDateId(schedule: Schedule, oldId: number, newId: number): Schedule {
  const out: Schedule = {};
  const dropped: string[] = [];
  Object.keys(schedule || {}).forEach(key => {
    const m = key.match(/^d(\d+)-(p\d+-c\d+)$/);
    if (!m || Number(m[1]) !== oldId) {
      out[key] = schedule[key];
      return;
    }
    const newKey = `d${newId}-${m[2]}`;
    if (newKey in schedule) {
      dropped.push(key);
      return;
    }
    out[newKey] = schedule[key];
  });
  if (dropped.length > 0) {
    console.warn('unifyDateLabelWeekdays: マージ先に既存コマがあるため破棄:', dropped);
  }
  return out;
}

interface LabelRewriteResult {
  teachers: Teacher[];
  externalCounts: Record<string, number>;
  combinedGroups: CombinedGroup[];
  externalSessions: any[];
  externalSessionPresets: any[];
}

// ラベル参照 (NG / externalCounts / 合同 / セッション / プリセット) を
// oldLabel → newLabel へ付け替える。マージで衝突し得る箇所は既存
// (newLabel 側) を優先する。
function rewriteLabelRefs(project: any, oldLabel: string, newLabel: string): LabelRewriteResult {
  const allLabels: string[] = (project.dates || []).map((d: Entity) => d.label);
  const isTarget = makeDateKeyDropMatcher(allLabels, [oldLabel]);

  const teachers: Teacher[] = (project.teachers || []).map((t: Teacher) => {
    if (!t.ngSlots || t.ngSlots.length === 0) return t;
    const renamed = t.ngSlots.map(slot => renameKeyPrefixExact(slot, isTarget, oldLabel, newLabel));
    // マージで「8/6-1限」と「8/6(木)-1限」が同キーになったら dedupe
    const deduped = [...new Set(renamed)];
    return deduped.length === t.ngSlots.length && deduped.every((s, i) => s === t.ngSlots[i])
      ? t
      : { ...t, ngSlots: deduped };
  });

  const externalCounts: Record<string, number> = {};
  const src = project.externalCounts || {};
  Object.keys(src).forEach(key => {
    const newKey = renameKeyPrefixExact(key, isTarget, oldLabel, newLabel);
    // 衝突 ((曜) 側にも同講師のカウントがある) は既存値を優先
    if (newKey !== key && newKey in src) return;
    externalCounts[newKey] = src[key];
  });

  const combinedGroups: CombinedGroup[] = (project.combinedGroups || []).map((g: CombinedGroup) => {
    if (g.dates === null || !g.dates?.includes(oldLabel)) return g;
    return { ...g, dates: [...new Set(g.dates.map(d => (d === oldLabel ? newLabel : d)))] };
  });

  const externalSessions = (project.externalSessions || []).map((s: any) =>
    s.date === oldLabel ? { ...s, date: newLabel } : s,
  );

  const externalSessionPresets = (project.externalSessionPresets || []).map((p: any) => {
    let q = p;
    if (q.startDateLabel === oldLabel) q = { ...q, startDateLabel: newLabel };
    if (q.endDateLabel === oldLabel) q = { ...q, endDateLabel: newLabel };
    return q;
  });

  return { teachers, externalCounts, combinedGroups, externalSessions, externalSessionPresets };
}

// 裸 entity を (曜) 付き twin へマージして 1 つに統合する。
function mergeIntoTwin(project: any, bare: Entity, twin: Entity): any {
  const refs = rewriteLabelRefs(project, bare.label, twin.label);
  const tabs = (project.tabs || []).map((tab: Tab) => {
    const schedule = remapScheduleDateId(tab.schedule, bare.id, twin.id);
    let activeDateIds = tab.config?.activeDateIds;
    if (Array.isArray(activeDateIds) && activeDateIds.includes(bare.id)) {
      activeDateIds = [...new Set(activeDateIds.map(id => (id === bare.id ? twin.id : id)))];
      return { ...tab, schedule, config: { ...tab.config, activeDateIds } };
    }
    return { ...tab, schedule };
  });
  const snapshots = (project.snapshots || []).map((s: TabSnapshot) => ({
    ...s,
    schedule: remapScheduleDateId(s.schedule, bare.id, twin.id),
  }));
  return {
    ...project,
    ...refs,
    dates: (project.dates || []).filter((d: Entity) => d.id !== bare.id),
    tabs,
    snapshots,
  };
}

// 裸 entity のラベルだけを newLabel へ変える (id 不変なので schedule は無影響)。
function renameBareLabel(project: any, bare: Entity, newLabel: string): any {
  const refs = rewriteLabelRefs(project, bare.label, newLabel);
  return {
    ...project,
    ...refs,
    dates: (project.dates || []).map((d: Entity) =>
      d.id === bare.id ? { ...d, label: newLabel } : d,
    ),
  };
}

// 日付プールの裸ラベル「M/D」を「M/D(曜)」へ統一する。変更が無ければ元の
// project をそのまま返す (no-op 判定用)。nowYear はテスト用に注入可能。
export function unifyDateLabelWeekdays(
  project: any,
  nowYear: number = new Date().getFullYear(),
): any {
  if (!project || !Array.isArray(project.dates)) return project;

  const parsed = (project.dates as Entity[])
    .map(parsePoolDate)
    .filter((p): p is ParsedPoolDate => p !== null);
  const bares = parsed.filter(p => p.weekday === null);
  if (bares.length === 0) return project; // fast path (統一済みプールの通常経路)

  const suffixed = parsed.filter(p => p.weekday !== null);
  const months = parsed.map(p => p.month);
  const wrapsYear = months.some(m => m >= 10) && months.some(m => m <= 3);
  const candidateYears = findCandidateYears(suffixed, wrapsYear, nowYear);

  // 同じ月日の (曜) 付き entity。同月日に複数 (曜) 付きが居る (曜日の打ち
  // 間違い等) 場合はどちらへ寄せるべきか判断できないので対象外にする。
  const twinByMd = new Map<string, Entity | null>();
  suffixed.forEach(s => {
    const key = `${s.month}/${s.day}`;
    twinByMd.set(key, twinByMd.has(key) ? null : s.entity);
  });

  let result = project;
  bares.forEach(bare => {
    const md = `${bare.month}/${bare.day}`;
    const twin = twinByMd.get(md);
    if (twin) {
      result = mergeIntoTwin(result, bare.entity, twin);
      return;
    }
    if (twinByMd.get(md) === null) return; // 同月日の (曜) 付きが複数 → 触らない
    const weekday = inferWeekday(bare.month, bare.day, candidateYears, wrapsYear);
    if (!weekday) return; // 年が確定できない → 誤った曜日を付けるより温存
    const newLabel = `${bare.month}/${bare.day}(${weekday})`;
    // 念のためのラベル衝突ガード (通常は twin 検出で弾かれている)
    if ((result.dates as Entity[]).some(d => d.label === newLabel)) return;
    const renamed = renameBareLabel(result, bare.entity, newLabel);
    // 「08/06」→「8/6(木)」のような桁正規化で twin 化した場合に備えて登録
    twinByMd.set(md, renamed.dates.find((d: Entity) => d.id === bare.entity.id));
    result = renamed;
  });

  return result;
}
