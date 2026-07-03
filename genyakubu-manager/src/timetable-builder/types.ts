// timetable-builder のドメインモデル型定義 (E5e Phase 1)。
//
// ここが「Project データ構造の単一の正」。JS 時代はコメントと ROADMAP に
// 散らばっていた形状知識を機械可読にする。ラベル参照 (NG キー / 合同
// グループ / externalCounts) と ID 参照 (schedule キー) の使い分けは
// utils/scheduleKey.ts の冒頭コメントを参照。
//
// バージョン史 (migrateProject が v1→v4 を順に適用):
//   v1: schedule キーがラベル結合 ("12/25(木)-1限-３S")
//   v2: キーがインデックスベース ("d0-p1-c2")、dates 等は string[]
//   v3: dates/periods/classes が { id, label }、キーは ID ベース
//   v4: dates / periods を tab.config から project 共通プールへ昇格

// dates / periods / classes の要素。id は次元ごとの 1 始まり incremental
// (dates / periods は project-global、classes は tab-local)。
export interface Entity {
  id: number;
  label: string;
}

export interface Teacher {
  name: string;
  subjects: string[];
  /** makeNgKey(dateLabel, periodLabel) = `${date}-${period}` の配列 (手動NG) */
  ngSlots: string[];
  /** 担当不可クラス (ラベル参照) */
  ngClasses: string[];
  /** 優先クラス (ラベル参照) */
  priorityClasses: string[];
}

export interface ScheduleEntry {
  subject?: string;
  teacher?: string;
  locked?: boolean;
}

/** キーは makeKey(dateId, periodId, classId) = `d{n}-p{n}-c{n}` */
export type Schedule = Record<string, ScheduleEntry>;

export interface TabConfig {
  /** クラスは tab-local (タブ間で同 id が別クラスを指し得る) */
  classes: Entity[];
  /** 科目 → このタブでのコマ数上限 */
  subjectCounts: Record<string, number>;
  /**
   * このタブが使う日 (project.dates プールの id サブセット)。
   * undefined / null = 全日使う (後方互換の既定)。[] = 0 日。
   */
  activeDateIds?: number[] | null;
  /** activeDateIds の periods 版 (E-3) */
  activePeriodIds?: number[] | null;
  /** v3 以前の互換: migrate 前の外部 JSON にのみ現れる (v4 では project 側) */
  dates?: Entity[];
  /** v3 以前の互換 (同上) */
  periods?: Entity[];
}

export interface Tab {
  id: number;
  name: string;
  config: TabConfig;
  schedule: Schedule;
}

/** effectiveConfigForTab の戻り値: tab.config + タブで絞った dates / periods */
export interface EffectiveConfig extends TabConfig {
  dates: Entity[];
  periods: Entity[];
}

export interface CombinedGroup {
  id: number;
  subject: string;
  /** クラスラベル (タブ横断のラベル参照)。先頭が代表 (primary) クラス */
  classes: string[];
  /** 対象日ラベル。null = 全日程 */
  dates: string[] | null;
}

export interface ExternalSession {
  id: number;
  /** 日付ラベル (プールの label 参照) */
  date: string;
  teacherName: string;
  /** reducer 経由では常に '' が入るが、外部 JSON は欠落し得る (migrate は補完しない) */
  label?: string;
  memo?: string;
  /** "HH:mm"。あれば自動NG派生 (utils/autoNg) の対象 */
  startTime?: string;
  /** startTime がある場合のみ保持 (orphan endTime は作らない) */
  endTime?: string;
}

export interface ExternalSessionPreset {
  id: number;
  name: string;
  startTime?: string;
  endTime?: string;
  startDateLabel?: string;
  endDateLabel?: string;
  memo?: string;
}

/** 名前付きスナップショット (E1c)。タブ単位で schedule を保存 */
export interface TabSnapshot {
  id: number;
  name: string;
  tabId: number;
  createdAt: string | null;
  schedule: Schedule;
}

/** 自動生成パラメータ (E2e)。project に optional で保存、未設定はデフォルト */
export interface GenerationParams {
  numPatterns: number;
  maxDailyHours: number;
  maxIterations: number;
  maxConsecutivePeriods: number;
}

export type GenerationParamKey = keyof GenerationParams;

export interface Project {
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  teachers: Teacher[];
  activeTabId: number;
  /** v4: 全タブ共通の日付プール (各タブは activeDateIds で絞る) */
  dates: Entity[];
  /** v4: 全タブ共通の時限プール (各タブは activePeriodIds で絞る) */
  periods: Entity[];
  tabs: Tab[];
  subjects: string[];
  subjectColors: Record<string, string>;
  combinedGroups: CombinedGroup[];
  /** makeExternalKey(dateLabel, teacherName) = `${date}-${teacher}` → コマ数 */
  externalCounts: Record<string, number>;
  externalSessions: ExternalSession[];
  externalSessionPresets: ExternalSessionPreset[];
  snapshots: TabSnapshot[];
  /** 自動生成パラメータの保存値 (optional、resolveGenerationParams で解決) */
  numPatterns?: number;
  maxDailyHours?: number;
  maxIterations?: number;
  maxConsecutivePeriods?: number;
}

/** useHistoryStack (useReducer) が持つ state */
export interface ProjectState {
  project: Project;
  /** undo/redo 履歴 (最古 → 最新)。project === history[historyIndex] */
  history: Project[];
  historyIndex: number;
  loadError: string | null;
}
