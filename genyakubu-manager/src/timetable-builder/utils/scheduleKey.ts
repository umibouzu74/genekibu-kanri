// スケジュールキーのユーティリティ
//
// 形式の変遷:
//   - v1 旧形式: "12/25(木)-1限 (13:00~)-３S" (ラベル結合)
//   - v2: "d0-p1-c2" (インデックスベース)
//   - v3: "d1-p2-c3" (タブごとに永続な ID ベース)
//
// 同じ "d{n}-p{n}-c{n}" の string 形式だが、v2 はインデックス、v3 は ID。
// 並び替え・追加・削除でずれない (v3) のが重要な性質。
//
// v3 schema:
//   config.dates:   [{ id: number, label: string }, ...]
//   config.periods: [{ id: number, label: string }, ...]
//   config.classes: [{ id: number, label: string }, ...]
//
// NG キー (`{dateLabel}-{periodLabel}`) と external キー
// (`{dateLabel}-{teacherName}`) はラベル基準のまま維持。タブ横断の参照と
// JSON 出力の人間可読性のため。

// 注意: constants.js は本ファイルの parseKey を import しているため、
// ここから constants.js を import すると循環になる。import してよいのは
// 無依存モジュール (generationParams.js / dateGenerate.js / dateLabelUnify.js —
// 最後者の依存も dateGenerate / labelRefs の無依存モジュールのみ) だけ。
import { clampGenerationParam } from './generationParams';
import { sortPoolDatesByCalendar } from './dateGenerate';
import { unifyDateLabelWeekdays } from './dateLabelUnify';
import type {
  CombinedGroup,
  EffectiveConfig,
  Entity,
  GenerationParamKey,
  Project,
  Schedule,
  Tab,
  Teacher,
} from '../types';

// migrate 系の入力は v1〜v3 の旧形状 / 外部 JSON なので any で受ける
// (untrusted 入力の正規化がこのモジュールの仕事)。出力は v4 の型に揃える。

export interface ParsedKey {
  dateId: number;
  periodId: number;
  classId: number;
}

// --- キー生成・パース ---

export const makeKey = (dateId: number, periodId: number, classId: number): string =>
  `d${dateId}-p${periodId}-c${classId}`;

export const parseKey = (key: string): ParsedKey | null => {
  const m = key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
  if (!m) return null;
  return { dateId: parseInt(m[1]), periodId: parseInt(m[2]), classId: parseInt(m[3]) };
};

// --- ID ベース config の lookup ヘルパー ---

// dates/periods/classes 配列 (entity 配列) から id 一致するものを返す。
// 見つからなければ undefined。
export function findEntityById(entities: Entity[] | undefined, id: number): Entity | undefined {
  return entities?.find(e => e.id === id);
}

// 次に使うべき ID を計算 (max + 1、空なら 1)
export function nextId(entities: Entity[] | undefined): number {
  if (!entities || entities.length === 0) return 1;
  return Math.max(...entities.map(e => e.id)) + 1;
}

// v4(Y): project.dates は全タブの和集合プール。各タブは config.activeDateIds で
// 「この学年が実際に使う日」を選ぶ。未指定 (undefined/null) は『全日使う』の
// 意味 (後方互換: 既存タブはプール全体をそのまま表示)。
// 戻り値は subset を **カレンダー順** (sortPoolDatesByCalendar) に並べたもの。
// プール自体は挿入順 (タブ別の後から追加は末尾 push) のままなので、そのまま
// 返すと時間割の行順・科目の回数連番 (第N回) が日付順にならない (F5j と同根)。
// M/D として解釈できないラベルは末尾 (安定順)。既に日付順のときは入力の参照を
// そのまま返す (既存の identity 前提の memo / no-op 判定を保つ)。
export function activeDatesForTab(poolDates: Entity[] | undefined, tab: Tab | undefined): Entity[] {
  const ids = tab?.config?.activeDateIds;
  let subset: Entity[];
  if (!ids) {
    subset = poolDates || [];
  } else {
    const set = new Set(ids);
    subset = (poolDates || []).filter(d => set.has(d.id));
  }
  const sorted = sortPoolDatesByCalendar(subset);
  return sorted.every((d, i) => d === subset[i]) ? subset : sorted;
}

// dates と同じ仕組みを periods にも適用 (E-3)。config.activePeriodIds
// (未指定=全時限使う) で「このタブが実際に使う時限」を選ぶ。
// 講師不在・NG はラベルベースでプール全時限を対象にするため、そちらは
// このフィルタを通さず project.periods を直接参照する (AbsenceNgPanel)。
export function activePeriodsForTab(poolPeriods: Entity[] | undefined, tab: Tab | undefined): Entity[] {
  const ids = tab?.config?.activePeriodIds;
  if (!ids) return poolPeriods || [];
  const set = new Set(ids);
  return (poolPeriods || []).filter(p => set.has(p.id));
}

// F2i: タブの実効 config = tab.config (classes / subjectCounts) + 『このタブが
// 使う日・使う時限』に絞った dates / periods。この合成の唯一の入口。
// dates はカレンダー順に整列済み (activeDatesForTab)。時間割表示・回数連番・
// Excel 出力・自動生成の全 consumer がここを通るため日付順が揃う。
// activeDatesForTab / activePeriodsForTab を個別に並べると片方を絞り忘れる
// 事故 (E-3 型) が再発するため、dates と periods を対で使う consumer は
// 必ずこの関数を通すこと。project は { dates, periods } だけ読む。
export function effectiveConfigForTab(
  project: Pick<Project, 'dates' | 'periods'> | undefined,
  tab: Tab | undefined,
): EffectiveConfig {
  return {
    ...tab?.config,
    dates: activeDatesForTab(project?.dates, tab),
    periods: activePeriodsForTab(project?.periods, tab),
  } as EffectiveConfig;
}

// --- NG スロットキー ---
// NG はタブ横断で使うため、日付名・時限名ベースのまま維持
// (config 変更時にインデックスがずれる問題を避けるため)
export const makeNgKey = (date: string, period: string): string => `${date}-${period}`;

// --- 外部カウントキー ---
// 講師の日別外部コマ数: "日付名-講師名"
export const makeExternalKey = (date: string, teacherName: string): string => `${date}-${teacherName}`;

// --- 合同グループヘルパー ---

// 指定の科目・クラス・日付に該当する合同グループを検索
// className と date は **ラベル** (合同グループ自体はラベルで指定するため)
export function findCombinedGroup(
  combinedGroups: CombinedGroup[] | null | undefined,
  subject: string | undefined,
  className: string,
  date: string,
): CombinedGroup | null {
  if (!combinedGroups || !subject) return null;
  return combinedGroups.find(g =>
    g.subject === subject &&
    g.classes.includes(className) &&
    (g.dates === null || g.dates.includes(date))
  ) || null;
}

// F5z: 追加/編集しようとするグループ (candidate) と「同じ科目で、クラスと
// 対象日の両方が重なる」既存グループを探す。findCombinedGroup は first-match
// なので、重なるグループが 2 つ登録されると伝播・集計が片方しか見ず
// 不整合になる。登録前 (CombinedGroupSettings の draft 検証) にこれで弾く。
// dates は null = 全日程 (何とでも重なる)。excludeId は編集中の自分自身。
export function findConflictingCombinedGroup(
  combinedGroups: CombinedGroup[] | null | undefined,
  candidate: { subject?: string; classes?: string[]; dates?: string[] | null },
  excludeId: number | null = null,
): CombinedGroup | null {
  if (!combinedGroups || !candidate?.subject) return null;
  const candClasses = candidate.classes || [];
  const candDates = candidate.dates ?? null;
  const datesOverlap = (a: string[] | null, b: string[] | null) =>
    a === null || b === null || a.some(d => b.includes(d));
  return combinedGroups.find(g =>
    g.id !== excludeId &&
    g.subject === candidate.subject &&
    (g.classes || []).some(c => candClasses.includes(c)) &&
    datesOverlap(g.dates ?? null, candDates)
  ) || null;
}

// クラスが合同グループの代表（先頭）クラスかどうか
export function isPrimaryCombinedClass(group: CombinedGroup | null | undefined, className: string): boolean {
  return !!group && group.classes[0] === className;
}

// 合同グループを考慮した講師コマ数カウント
export function countTeacherHoursWithCombined(
  schedule: Schedule,
  config: { dates: Entity[]; periods?: Entity[]; classes: Entity[] },
  combinedGroups: CombinedGroup[] | null | undefined,
): Record<string, number> {
  const totals: Record<string, number> = {};
  const counted = new Set<string>();

  Object.keys(schedule).forEach(key => {
    const entry = schedule[key];
    if (!entry || !entry.teacher || entry.teacher === "未定") return;

    const parsed = parseKey(key);
    if (!parsed) return;
    const { dateId, periodId, classId } = parsed;
    const dateEnt = findEntityById(config.dates, dateId);
    const classEnt = findEntityById(config.classes, classId);
    if (!dateEnt || !classEnt) return;
    // config.periods が渡されていれば時限も照合する (E-3: タブが使わない
    // 時限に温存された非表示セルを集計に混入させない。dates と対称)。
    if (config.periods && !findEntityById(config.periods, periodId)) return;

    const group = findCombinedGroup(combinedGroups, entry.subject, classEnt.label, dateEnt.label);
    if (group) {
      const countKey = `${dateId}-${periodId}-${group.id}-${entry.teacher}`;
      if (counted.has(countKey)) return;
      counted.add(countKey);
    }

    if (!totals[entry.teacher]) totals[entry.teacher] = 0;
    totals[entry.teacher]++;
  });

  return totals;
}

// --- 旧形式の検出 ---
export const isLegacyKey = (key: string): boolean => {
  // 新形式は "d数字-p数字-c数字" のパターン
  return !(/^d\d+-p\d+-c\d+$/.test(key));
};

// --- v1 → v2 マイグレーション (旧 string 結合形式 → インデックスベース) ---

export function migrateScheduleKeys(schedule: Record<string, any>, config: any): Record<string, any> {
  const hasLegacy = Object.keys(schedule).some(isLegacyKey);
  if (!hasLegacy) return schedule;

  // 外部 JSON では config の次元が欠落し得る (F5e)。undefined.length で
  // migration 全体が落ちると読込自体が失敗するので空配列として扱う
  // (対応するキーは復元できず drop されるが、起動は守る)。
  const dates = Array.isArray(config.dates) ? config.dates : [];
  const periods = Array.isArray(config.periods) ? config.periods : [];
  const classes = Array.isArray(config.classes) ? config.classes : [];

  const newSchedule: Record<string, any> = {};
  Object.keys(schedule).forEach(oldKey => {
    if (!isLegacyKey(oldKey)) {
      newSchedule[oldKey] = schedule[oldKey];
      return;
    }

    // 旧形式: "日付-時限-クラス" → インデックスを探す。日本語文字列に "-" を
    // 含む可能性があるため、既知 config 値の prefix match で復元する。
    // v1 から v2 への移行 (v2 ではキーがインデックスベース) なので、ここで
    // makeKey(dIdx, pIdx, cIdx) と書いていたものはそのままインデックスで OK。
    // (v2→v3 migration が後段で ID ベースに振り直す)
    let matched = false;
    for (let dIdx = 0; dIdx < dates.length; dIdx++) {
      const d = dates[dIdx];
      if (!oldKey.startsWith(d + '-')) continue;
      const rest1 = oldKey.substring(d.length + 1);
      for (let pIdx = 0; pIdx < periods.length; pIdx++) {
        const p = periods[pIdx];
        if (!rest1.startsWith(p + '-')) continue;
        const rest2 = rest1.substring(p.length + 1);
        const cIdx = classes.indexOf(rest2);
        if (cIdx >= 0) {
          // v1→v2 では「インデックス」をそのままキーに埋める
          newSchedule[`d${dIdx}-p${pIdx}-c${cIdx}`] = schedule[oldKey];
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      console.warn('Migration: could not map legacy key:', oldKey);
    }
  });

  return newSchedule;
}

// --- v2 → v3 マイグレーション (インデックス → ID 永続化) ---
//
// dates/periods/classes が string[] のものを [{id, label}] に変換し、既存
// schedule キー (d{dIdx}-p{pIdx}-c{cIdx}) を新 ID キー (d{dateId}-p{periodId}-c{classId})
// に書き換える。ID はタブごとに 1 始まりの incremental。
//
// 注意: 各次元を独立に判定する (v3 と v2 が混在しても各次元で正しく処理)。
// 空配列は v3 互換とみなす (v3 schema は length 0 を許容する)。これにより
// 「片方の次元だけ空で他は v3」というケースで残りの次元を破壊しない。
export function migrateTabV2toV3(tab: any): any {
  // entity 配列の形を判定: 空配列は v3 互換、内部が { id, label } object なら v3
  const isV3Shape = (arr: unknown): boolean =>
    Array.isArray(arr) && (arr.length === 0 || (typeof arr[0] === 'object' && arr[0] !== null && 'id' in arr[0]));

  // 全 dimension が v3 形式 (空含む) ならそのまま返す
  if (isV3Shape(tab.config.dates) && isV3Shape(tab.config.periods) && isV3Shape(tab.config.classes)) {
    return tab;
  }

  // 次元ごとに「v3 形式 → そのまま使う」「string array → wrap」を独立判定。
  // 戻り値: { arr: 新配列, resolve: schedule キーの数値成分 → entity.id }
  // 次元が配列でない (欠落等の外部 JSON、F5e) 場合は空配列として扱い、
  // undefined.map で migration 全体が落ちるのを防ぐ。
  //
  // F5f: schedule キーの数値成分の解釈は次元の形式で異なる —
  //   - v2 (string[]) の次元: 数値は「配列位置 (0-based)」 → wrap 後の id へ
  //   - v3 ({id,label}[]) の次元: 数値は「既に ID」 → 存在確認だけして素通し。
  //     インデックスと解釈すると、ID が位置とずれた配列 (削除で歯抜けの
  //     [{id:1},{id:3}] 等) でセルが隣へシフト / 消失する
  const normalize = (raw: unknown): { arr: Entity[]; resolve: (n: number) => number | null } => {
    const arr = Array.isArray(raw) ? raw : [];
    if (isV3Shape(arr)) {
      const ids = new Set(arr.map(e => e.id));
      return { arr, resolve: (n) => (ids.has(n) ? n : null) };
    }
    const wrapped = arr.map((label, idx) => ({ id: idx + 1, label }));
    return { arr: wrapped, resolve: (n) => (n >= 0 && n < wrapped.length ? wrapped[n].id : null) };
  };

  const dates = normalize(tab.config.dates);
  const periods = normalize(tab.config.periods);
  const classes = normalize(tab.config.classes);
  const newDates = dates.arr, newPeriods = periods.arr, newClasses = classes.arr;

  // schedule キーを次元ごとの resolve で新 ID キーに書き換える。
  // 解決できない (範囲外 / 存在しない ID の) キーは drop (cleanSchedule 相当)。
  const newSchedule: Record<string, any> = {};
  Object.keys(tab.schedule).forEach(oldKey => {
    const m = oldKey.match(/^d(\d+)-p(\d+)-c(\d+)$/);
    if (!m) return; // 不正キー
    const dateId = dates.resolve(parseInt(m[1]));
    const periodId = periods.resolve(parseInt(m[2]));
    const classId = classes.resolve(parseInt(m[3]));
    if (dateId == null || periodId == null || classId == null) return;
    newSchedule[makeKey(dateId, periodId, classId)] = tab.schedule[oldKey];
  });

  return {
    ...tab,
    config: { ...tab.config, dates: newDates, periods: newPeriods, classes: newClasses },
    schedule: newSchedule,
  };
}

// v3 → v4: dates / periods を tab.config から project レベルへ昇格する。
// 各タブが個別に持っていた dates / periods を『ラベル基準の union』で 1 つに
// 統合し (出現順を保持)、project.dates / project.periods に project-global な
// ID を振り直す。schedule キー (d{id}-p{id}-c{id}) と snapshot.schedule は
// 旧 tab-local ID → ラベル → 新 project ID で remap する。classId は不変。
//
// 共通ケース (全タブが同一の dates / periods) では union = 元の配列で、ID も
// 元の並び順どおりなので remap は実質 identity になる。タブごとに日程が違う
// 場合も、union により全タブの日付が残るので schedule は失われない。
export function migrateProjectV3toV4(project: any): any {
  const tabs = project.tabs || [];

  const dateLabels: string[] = [];
  const periodLabels: string[] = [];
  const seenDate = new Set<string>();
  const seenPeriod = new Set<string>();
  tabs.forEach((t: any) => {
    (t.config?.dates || []).forEach((d: Entity) => {
      if (!seenDate.has(d.label)) { seenDate.add(d.label); dateLabels.push(d.label); }
    });
    (t.config?.periods || []).forEach((p: Entity) => {
      if (!seenPeriod.has(p.label)) { seenPeriod.add(p.label); periodLabels.push(p.label); }
    });
  });
  const projDates = dateLabels.map((label, i) => ({ id: i + 1, label }));
  const projPeriods = periodLabels.map((label, i) => ({ id: i + 1, label }));
  const dateIdByLabel = new Map(projDates.map(d => [d.label, d.id]));
  const periodIdByLabel = new Map(projPeriods.map(p => [p.label, p.id]));

  // 旧 tab-local の dates / periods (id→label) を使い schedule キーを remap する。
  const remapSchedule = (
    schedule: Record<string, any>,
    oldDates: Entity[] | undefined,
    oldPeriods: Entity[] | undefined,
  ): Record<string, any> => {
    const oldDateLabelById = new Map((oldDates || []).map(d => [d.id, d.label]));
    const oldPeriodLabelById = new Map((oldPeriods || []).map(p => [p.id, p.label]));
    const out: Record<string, any> = {};
    Object.keys(schedule || {}).forEach(key => {
      const m = key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
      if (!m) return;
      const dLabel = oldDateLabelById.get(Number(m[1]));
      const pLabel = oldPeriodLabelById.get(Number(m[2]));
      if (dLabel == null || pLabel == null) return;
      const nDId = dateIdByLabel.get(dLabel);
      const nPId = periodIdByLabel.get(pLabel);
      if (nDId == null || nPId == null) return;
      out[makeKey(nDId, nPId, Number(m[3]))] = schedule[key];
    });
    return out;
  };

  const newTabs = tabs.map((t: any) => {
    const cfg = t.config || {};
    const { dates: _omitDates, periods: _omitPeriods, ...restConfig } = cfg;
    // 旧タブが union プールの一部しか持っていなかった場合、そのタブの
    // 「使う日・使う時限」を旧 subset に設定して学年別日程を保存する。
    // これをしないと migration 後に全タブが union 全日・全時限を使う扱いに
    // なり、自動生成が他学年の日にもコマを埋めてしまう。プール全体と一致
    // するタブは undefined のまま (= 全日・全時限、従来表現)。
    const oldDateIds = (cfg.dates || [])
      .map((d: Entity) => dateIdByLabel.get(d.label))
      .filter((id: number | undefined) => id != null);
    const oldPeriodIds = (cfg.periods || [])
      .map((p: Entity) => periodIdByLabel.get(p.label))
      .filter((id: number | undefined) => id != null);
    // F5v: 空 (0 日 / 0 時限) のタブも subset として保存する。
    // `length > 0` を条件に含めると空配列が「絞り込みなし = union 全日」に
    // 化け、0 日だったタブが migration 後に全学年の日付を表示し、自動生成が
    // 他学年の日にコマを埋めてしまう。
    if (oldDateIds.length < projDates.length) {
      restConfig.activeDateIds = oldDateIds;
    }
    if (oldPeriodIds.length < projPeriods.length) {
      restConfig.activePeriodIds = oldPeriodIds;
    }
    return { ...t, config: restConfig, schedule: remapSchedule(t.schedule, cfg.dates, cfg.periods) };
  });

  // snapshot は schedule のみ保持し source tabId に紐づくので、そのタブの旧
  // dates / periods で remap する。元タブが消えている snapshot はそのまま残す。
  // snapshots が配列でない外部 JSON ({} 等、F5a) は truthy なので `|| []` では
  // 防げず .map で throw する。Array.isArray で正規化する。
  const oldConfigByTabId = new Map(tabs.map((t: any) => [t.id, t.config || {}]));
  const newSnapshots = (Array.isArray(project.snapshots) ? project.snapshots : []).map((s: any) => {
    const cfg: any = oldConfigByTabId.get(s.tabId);
    if (!cfg) return s;
    return { ...s, schedule: remapSchedule(s.schedule, cfg.dates, cfg.periods) };
  });

  return {
    ...project,
    version: 4,
    dates: projDates,
    periods: projPeriods,
    tabs: newTabs,
    snapshots: newSnapshots,
  };
}

// プロジェクト全体のマイグレーション
export function migrateProject(project: any): Project {
  if (!project) return project;

  let result = project;

  // v1 → v2: 旧 string 結合キーをインデックスベースに変換
  if (!project.version || project.version < 2) {
    const migratedTabs = project.tabs.map((tab: any) => ({
      ...tab,
      schedule: migrateScheduleKeys(tab.schedule, tab.config),
    }));
    result = {
      ...project,
      version: 2,
      name: project.name || "",
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: migratedTabs,
    };
  }

  // v2 → v3: dates/periods/classes を {id, label} に、schedule を ID キーに
  if (!result.version || result.version < 3) {
    const migratedTabs = result.tabs.map(migrateTabV2toV3);
    result = {
      ...result,
      version: 3,
      updatedAt: new Date().toISOString(),
      tabs: migratedTabs,
    };
  }

  // v3 → v4: dates/periods を project レベルへ昇格 (全タブ共通)
  if (!result.version || result.version < 4) {
    result = {
      ...migrateProjectV3toV4(result),
      updatedAt: new Date().toISOString(),
    };
  }

  // ── 後発フィールドの補完 + 型崩れの正規化 (F.5 系統 A) ──
  // validateProjectShape は tabs / config / schedule の致命的構造しか見ない。
  // 以下のフィールドは「無ければ default 補完」に加えて「配列/オブジェクトで
  // ない外部 JSON ({} や文字列は truthy なので `!x` を素通りする)」も既定値に
  // 正規化する。放置すると .find / .forEach / .filter が render や生成で
  // throw → autosave が汚染を永続化してリロードでも再クラッシュする。

  // subjectColors が未設定 / 型崩れの場合はデフォルト値を追加
  if (!result.subjectColors || typeof result.subjectColors !== 'object' || Array.isArray(result.subjectColors)) {
    result = { ...result, subjectColors: {} };
  }

  // subjects が未設定 / 型崩れの場合は subjectCounts のキーから生成
  if (!Array.isArray(result.subjects)) {
    const firstTab = result.tabs[0];
    const subjects = firstTab ? Object.keys(firstTab.config.subjectCounts) : [];
    result = { ...result, subjects };
  }

  // combinedGroups が未設定 / 型崩れの場合は空配列で初期化
  if (!Array.isArray(result.combinedGroups)) {
    result = { ...result, combinedGroups: [] };
  }
  // 要素レベルの正規化: dates キー欠落 (undefined) は findCombinedGroup の
  // `g.dates.includes` で throw する (F5c)。classes 非配列のグループも drop。
  {
    const normalized = normalizeCombinedGroups(result.combinedGroups);
    if (normalized !== result.combinedGroups) {
      result = { ...result, combinedGroups: normalized };
    }
  }

  // externalSessions が未設定 / 型崩れの場合は空配列で初期化 (後発フィールド)。
  // 配列でも object でない要素は落とす (`s?.date` guard の効かない文字列等)。
  if (!Array.isArray(result.externalSessions)) {
    result = { ...result, externalSessions: [] };
  } else if (result.externalSessions.some(s => !s || typeof s !== 'object')) {
    result = { ...result, externalSessions: result.externalSessions.filter(s => s && typeof s === 'object') };
  }

  // externalSessionPresets が未設定 / 型崩れの場合は空配列で初期化 (他学年
  // セッション登録テンプレートの保存先、後発フィールド)
  if (!Array.isArray(result.externalSessionPresets)) {
    result = { ...result, externalSessionPresets: [] };
  }

  // externalCounts が欠落 / 型崩れの場合は空オブジェクトに正規化
  // (types.ts では必須宣言なので、migrate 後は必ずオブジェクトにする)
  if (result.externalCounts == null
    || typeof result.externalCounts !== 'object' || Array.isArray(result.externalCounts)) {
    result = { ...result, externalCounts: {} };
  }

  // 自動生成パラメータ (numPatterns 等) が保存値として範囲外の場合は clamp
  // する (F5d)。UI は resolveGenerationParams で clamp 表示する一方、solver は
  // 保存値をそのまま読むため、ここで正規化しないと「表示は 1・実動作は 0 で
  // 全講師除外」のような UI と実挙動の乖離が起きる。reducer 編集時は
  // clamp 済みなので、外部 JSON / 旧データだけがここに該当する。
  {
    const clampedParams: Record<string, number> = {};
    let paramsChanged = false;
    const paramKeys: GenerationParamKey[] = ['numPatterns', 'maxDailyHours', 'maxIterations', 'maxConsecutivePeriods', 'generationSeed'];
    for (const key of paramKeys) {
      if (result[key] === undefined) continue;
      const clamped = clampGenerationParam(key, result[key]);
      if (clamped !== result[key]) {
        clampedParams[key] = clamped;
        paramsChanged = true;
      }
    }
    if (paramsChanged) {
      result = { ...result, ...clampedParams };
    }
  }

  // snapshots が未設定 / 不正な場合は空配列で初期化 (E1c で追加された後発フィールド)
  if (!Array.isArray(result.snapshots)) {
    result = { ...result, snapshots: [] };
  }

  // teachers が欠落した JSON はバリデーション ('teachers' in obj のときのみ
  // 型検証) を通過するが、読込直後の render で project.teachers.filter が
  // throw して画面ごと落ちる。空配列で補完して起動させる。
  if (!Array.isArray(result.teachers)) {
    result = { ...result, teachers: [] };
  }
  // 要素レベルの正規化 (F5b): teacher.subjects 等の配列フィールドが欠落した
  // JSON は ScheduleCell の `t.subjects.includes` / reducer の
  // `t.subjects.filter` で throw する。name の無い要素は参照キーとして
  // 機能しないので drop。
  {
    const normalized = normalizeTeacherFields(result.teachers);
    if (normalized !== result.teachers) {
      result = { ...result, teachers: normalized };
    }
  }

  // tab.dayStatuses (日付ごとの手動チェック、後発フィールド) の型崩れを正規化
  // する。オブジェクトでない値は落とし、値が 'ok' | 'check' 以外のエントリは
  // drop する (render の Object.entries / 表示分岐で未知値が漏れないように)。
  if (Array.isArray(result.tabs)) {
    const normalizedTabs = normalizeTabDayStatuses(result.tabs);
    if (normalizedTabs !== result.tabs) {
      result = { ...result, tabs: normalizedTabs };
    }
  }

  // activeTabId がどのタブとも一致しない場合は先頭タブに正規化する。
  // dangling のまま残すと「読み取りは tabs[0] へフォールバック・書き込みは
  // silent no-op」という乖離が起きる (編集しても何も保存されない)。
  if (Array.isArray(result.tabs) && result.tabs.length > 0
    && !result.tabs.some((t: any) => t.id === result.activeTabId)) {
    result = { ...result, activeTabId: result.tabs[0].id };
  }

  // 同名講師がいる場合は " (2)" / " (3)" の suffix を付けて自動で uniq 化する。
  // teacher.name は NG / 優先度 / 他学年セッション等の参照キーになるため、
  // 重複したまま load すると UI で『どちらの行を操作しているか分からない』
  // 状態になる (code-review P1)。古い projects に対する idempotent な migration。
  if (Array.isArray(result.teachers)) {
    const deduped = dedupeTeacherNames(result.teachers);
    if (deduped !== result.teachers) {
      result = { ...result, teachers: deduped };
    }
  }

  // 日付ラベルの表記ゆれ統一: date picker 化 (L4 系) 以前の手入力で残った
  // 「8/6」を現行形式「8/6(木)」へ寄せる。「8/6」と「8/6(木)」が別 entity と
  // して共存しているプールはマージし、参照 (schedule / NG / externalCounts /
  // 合同 / セッション) も付け替える。idempotent (詳細は dateLabelUnify.js)。
  result = unifyDateLabelWeekdays(result);

  return result;
}

// teacher 要素の配列フィールド (subjects/ngSlots/ngClasses/priorityClasses) を
// 補完する純粋関数 (F5b)。object でない要素・name の無い要素は drop。
// 変更が無ければ元の配列をそのまま返す (no-op 判定用)。
export function normalizeTeacherFields(teachers: any): Teacher[] | any {
  if (!Array.isArray(teachers)) return teachers;
  let changed = false;
  const result: any[] = [];
  teachers.forEach((t: any) => {
    if (!t || typeof t !== 'object' || typeof t.name !== 'string' || !t.name) {
      changed = true; // drop
      return;
    }
    let nt = t;
    for (const key of ['subjects', 'ngSlots', 'ngClasses', 'priorityClasses']) {
      if (!Array.isArray(nt[key])) {
        if (nt === t) nt = { ...t };
        nt[key] = [];
        changed = true;
      }
    }
    // §M (L3a/L3b/N3a): 講師個別上限は「正の有限数」以外を落とす。solver /
    // 分析は型ガードで黙って無視するが、UI (TeacherManager) は保存値を
    // そのまま表示するため、外部 JSON 由来の "3" (文字列) 等が残ると
    // 「表示は効いているのに実動作は未設定」の乖離になる。
    for (const key of ['maxDailyHours', 'maxTotalHours', 'maxConsecutivePeriods']) {
      const v = nt[key];
      if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
        if (nt === t) nt = { ...t };
        delete nt[key];
        changed = true;
      }
    }
    result.push(nt);
  });
  return changed ? result : teachers;
}

// tab.dayStatuses (日付ごとの手動チェック) を正規化する純粋関数。
// - オブジェクトでない値 (文字列・配列等の外部 JSON) はフィールドごと削除
// - 値が 'ok' | 'check' 以外のエントリは drop
// 変更が無ければ元の配列をそのまま返す (no-op 判定用)。
export function normalizeTabDayStatuses(tabs: any): Tab[] | any {
  if (!Array.isArray(tabs)) return tabs;
  let changed = false;
  const result = tabs.map((t: any) => {
    if (!t || typeof t !== 'object' || t.dayStatuses === undefined) return t;
    const ds = t.dayStatuses;
    if (ds === null || typeof ds !== 'object' || Array.isArray(ds)) {
      changed = true;
      const { dayStatuses: _dropped, ...rest } = t;
      return rest;
    }
    const badKeys = Object.keys(ds).filter(k => ds[k] !== 'ok' && ds[k] !== 'check');
    if (badKeys.length === 0) return t;
    changed = true;
    const cleaned = { ...ds };
    badKeys.forEach(k => { delete cleaned[k]; });
    return { ...t, dayStatuses: cleaned };
  });
  return changed ? result : tabs;
}

// combinedGroups 要素を正規化する純粋関数 (F5c)。
// - object でない / classes が配列でない / subject が文字列でないグループは drop
//   (findCombinedGroup の `g.classes.includes` / `g.subject ===` が前提とする形)
// - dates は null (全日) か配列のみ許容。欠落 (undefined) や型崩れは null に
//   倒す (`g.dates.includes` の throw 防止。全日扱いは保存時の既定と同じ)
// 変更が無ければ元の配列をそのまま返す (no-op 判定用)。
export function normalizeCombinedGroups(groups: any): CombinedGroup[] | any {
  if (!Array.isArray(groups)) return groups;
  let changed = false;
  const result: any[] = [];
  groups.forEach((g: any) => {
    if (!g || typeof g !== 'object' || typeof g.subject !== 'string' || !Array.isArray(g.classes)) {
      changed = true; // drop
      return;
    }
    if (g.dates === null || Array.isArray(g.dates)) {
      result.push(g);
      return;
    }
    changed = true;
    result.push({ ...g, dates: null });
  });
  return changed ? result : groups;
}

// 配列内の同名講師に suffix を振って衝突を解消する純粋関数。
// 戻り値が === で元と等しいなら変更無し (no-op)。
export function dedupeTeacherNames(teachers: any): Teacher[] | any {
  if (!Array.isArray(teachers)) return teachers;
  const seen = new Set<string>();
  let changed = false;
  const result = teachers.map((t: any) => {
    if (!t?.name) return t;
    if (!seen.has(t.name)) {
      seen.add(t.name);
      return t;
    }
    // 2 件目以降は " (2)" / " (3)" の suffix を試して空きを探す
    changed = true;
    let suffix = 2;
    let newName: string;
    do {
      newName = `${t.name} (${suffix})`;
      suffix++;
    } while (seen.has(newName));
    seen.add(newName);
    return { ...t, name: newName };
  });
  return changed ? result : teachers;
}
