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

/**
 * 日付プールの日 (2026-10-27)。externalOnly = 外部授業だけの日: どのタブの時間割にも
 * 行を出さず、他学年セッション (高校・予備校の講習) の登録・本体の月間・講師別 Excel の
 * 対象にだけする (12/24 の高3 Ⅰ期の初日のように、中学の講習が無い日)。前の季節から
 * 残った日 (どのタブも使わない日) と区別するための印。タブがその日を使い始めたら外す
 */
export interface DateEntity extends Entity {
  externalOnly?: boolean;
}

/**
 * 出勤可能調査の回答 1 マス分。ok = ○ (出られる) / maybe = △ (相談・できれば
 * 避けたい) / ng = × (出られない)。未記入はキーが無いことで表す。
 */
export type AvailabilityMark = 'ok' | 'maybe' | 'ng';

/**
 * 出勤可能調査の回答。日付ラベル → 時限ラベル → 記号 の入れ子
 * (NG キーのような `${date}-${period}` 連結にしないのは、ラベルに "-" を
 * 含むときの分解の曖昧さを持ち込まないため。utils/availability.ts 参照)。
 */
export type AvailabilityMap = Record<string, Record<string, AvailabilityMark>>;

export interface Teacher {
  name: string;
  subjects: string[];
  /** makeNgKey(dateLabel, periodLabel) = `${date}-${period}` の配列 (手動NG) */
  ngSlots: string[];
  /**
   * 出勤可能調査の回答 (任意)。× は手動NG とは別に「導出される NG」として
   * 自動NG に合流する (utils/autoNg)。未回答の講師はフィールドごと持たない
   */
  availability?: AvailabilityMap;
  /** 出勤可能調査の自由記述 (「19 時以降なら可」等)。空なら持たない */
  availabilityMemo?: string;
  /** 担当不可クラス (ラベル参照) */
  ngClasses: string[];
  /** 優先クラス (ラベル参照) */
  priorityClasses: string[];
  /** L3a: 講師個別の 1 日コマ数上限。未設定/0 = project 全体値を使う */
  maxDailyHours?: number;
  /** L3b: 講師個別の通算コマ数上限 (全タブ + 外部コマ)。未設定/0 = 無制限 */
  maxTotalHours?: number;
  /** N3a: 講師個別の連続コマ数上限。未設定/0 = project 全体値を使う */
  maxConsecutivePeriods?: number;
  /**
   * 講習での使い方 (B3 2026-10-31、任意)。未設定は標準 (所属が予備校部で
   * Project.yobikoReserve が付いていれば控えめ)。NG とは別物 (日時ではなく講師の扱い)
   *   - reserve: 控えめ。ほかで埋まらないときだけ候補に出す (プルダウンの下・自動作成で後回し)
   *   - never:   使わない。候補に出さない (入っているセルでは出す)
   *   - normal:  標準 (所属からの既定を上書きして標準にする)
   */
  usage?: TeacherUsage;
}

export type TeacherUsage = 'normal' | 'reserve' | 'never';

/**
 * 連続出勤日数の上限 (B2 2026-10-31)。「予備校部の先生は中1・2 の夜 (18:30〜) に
 * 3 日以上続けて入れない」。暦日で数える (日曜をはさむと途切れる)
 */
export interface DayStreakRule {
  id: number;
  /** 対象: 本体の講師の所属 (key) と講師名。どちらかに当たる講師 */
  categories?: string[];
  teachers?: string[];
  /** 数えるタブ (null / 空 = 全部のタブ) */
  tabIds?: number[] | null;
  /** 時間帯 "HH:MM" (この時刻より後に終わる時限 / この時刻より前に始まる時限を数える) */
  fromTime?: string;
  toTime?: string;
  /** 続けて入れる日数の上限 (2 なら 3 日続くと違反) */
  maxDays: number;
}

export interface ScheduleEntry {
  subject?: string;
  teacher?: string;
  locked?: boolean;
}

/** キーは makeKey(dateId, periodId, classId) = `d{n}-p{n}-c{n}` */
export type Schedule = Record<string, ScheduleEntry>;

/**
 * クラス (tab-local)。room は教室 (任意、2026-10-27)。年ごとに教室が変わっても
 * クラス名 (ラベル参照のキー) を変えずに済むよう、教室は別に持つ。表示・Excel・
 * 本体の講師の月間 (「講」のカード) に添える (utils/classRoom)
 */
export interface ClassEntity extends Entity {
  room?: string;
  /**
   * 通常授業のどのクラスか (任意、B1 2026-10-31)。本体の時間割から科目ごとの
   * 「普段の担当」を引く (utils/usualTeachers)。classes 空 = その学年の全部。
   * 例: 3S401 → {grade: "中3", classes: ["SS", "S"]}、1附属 → {grade: "附中1", classes: []}
   */
  regular?: RegularClassLink;
}

export interface RegularClassLink {
  grade: string;
  classes: string[];
}

export interface TabConfig {
  /** クラスは tab-local (タブ間で同 id が別クラスを指し得る) */
  classes: ClassEntity[];
  /** 科目 → このタブでのコマ数上限 (1 クラスあたり) */
  subjectCounts: Record<string, number>;
  /**
   * クラス別のコマ数上書き (§N: 同一タブ内で学年混在などクラスごとに
   * 必要コマ数が違うケース用)。外側キーは String(classId)、内側は
   * 科目 → コマ数。エントリの無いクラス / 科目は subjectCounts の共通値へ
   * フォールバックする。undefined = クラス別モードオフ (全クラス共通)、
   * {} = モードオンだが上書きなし。読み取りは必ず
   * utils/subjectQuota.quotaForClass / quotasForClass を経由すること。
   */
  classSubjectCounts?: Record<string, Record<string, number>> | null;
  /**
   * このタブが使う日 (project.dates プールの id サブセット)。
   * undefined / null = 全日使う (後方互換の既定)。[] = 0 日。
   */
  activeDateIds?: number[] | null;
  /** activeDateIds の periods 版 (E-3)。枠に入ったタブは必ず配列 (枠の時限の部分集合) */
  activePeriodIds?: number[] | null;
  /** このタブが入っている枠 (Project.frames の id、任意。2026-10-27) */
  frameId?: number;
  /**
   * このタブと比べる本体の行事予定 (種別「講習」) の名前 (任意、2026-10-27)。
   * 結び付けたらその行事予定とだけ比べる (utils/courseEventCheck)。名前で持つのは、
   * 行事予定を表で入れ直すと id が変わり、翌年も同じ名前で使えるため
   */
  courseEventNames?: string[];
  /** v3 以前の互換: migrate 前の外部 JSON にのみ現れる (v4 では project 側) */
  dates?: Entity[];
  /** v3 以前の互換 (同上) */
  periods?: Entity[];
}

/**
 * 日付ごとの手動チェック状態。'ok' = OK / 'check' = 要確認。
 * 「不備あり」は schedule から常に導出する (computeIncompleteDateIds) ため
 * 保存しない — 埋まれば自動で消える仕様を state の食い違いなしで満たす。
 */
export type DayStatus = 'ok' | 'check';

export interface Tab {
  id: number;
  name: string;
  config: TabConfig;
  schedule: Schedule;
  /** 日付ごとの手動チェック (キーは project.dates の id を文字列化したもの) */
  dayStatuses?: Record<string, DayStatus>;
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
  /** 種別 (プリセットの名前「Ⅰ期 予備校３限」など)。プリセットの改名で同期する */
  memo?: string;
  /**
   * 講座名 (「高3 共通テスト理科基礎(物理基礎)」、任意)。表示は「メモ + 講座名」
   * (utils/externalSessionShape)。空なら持たない
   */
  course?: string;
  /** "HH:mm"。あれば自動NG派生 (utils/autoNg) の対象 */
  startTime?: string;
  /** startTime がある場合のみ保持 (orphan endTime は作らない) */
  endTime?: string;
  /**
   * 取り込んだ元 (2026-10-27)。'seniorKoshu' = 本体の「高校・予備校の講習」から
   * 取り込んだもの (ConfigModal/SeniorKoshuImport)。本体の月間には本体の登録の方を
   * 出すので、このセッションは出さない (utils/builderLessons)。手で入れたものは持たない
   */
  source?: 'seniorKoshu';
  /** 取り込んだ元の予定のキー (本体の expandSeniorKoshu の key = 担当 id:日付) */
  sourceKey?: string;
}

/** 登録前の他学年セッション (id は reducer が振る) */
export type ExternalSessionDraft = Omit<ExternalSession, 'id'>;

export interface ExternalSessionPreset {
  id: number;
  name: string;
  startTime?: string;
  endTime?: string;
  startDateLabel?: string;
  endDateLabel?: string;
  memo?: string;
  /** N4c: 適用時に選択状態へ展開する対象講師名 (任意)。無指定 = 講師は触らない */
  teachers?: string[];
}

/**
 * 季節の中の「枠」(2026-10-27)。冬期講習 (12/25〜1/7) と直前ポイント演習 (1/12〜3/4)・
 * 弱点補強演習 (土曜) のように、1 つの季節の中の別の講習。タブは枠に入り (TabConfig.frameId)、
 * 枠ごとに時限 (プールの部分集合) と本体の月間の予定への反映 (作成中 / 仮確定 / 確定) を
 * 持つ。本体の月間の「講」と講師別 Excel にはプロジェクト名ではなく枠の名前を出す。
 * 決まりは utils/frames (形の確認は無依存の utils/frameShape)
 */
export interface Frame {
  id: number;
  name: string;
  /** この枠の時限 (project.periods の id)。枠に入ったタブはこの中から使う時限を選ぶ */
  periodIds: number[];
  /** 本体の月間の予定へ出すか。未設定 = project の状態 (utils/publishState) */
  publishState?: PublishState;
}

/** 名前付きスナップショット (E1c)。タブ単位で schedule を保存 */
export interface TabSnapshot {
  id: number;
  name: string;
  tabId: number;
  createdAt: string | null;
  schedule: Schedule;
}

/**
 * 作り直す前の時間割の控え (2026-10-27)。「🔄 次の◯期講習用に作り直す」が残し、
 * 「📋 前の講習の時間割を写す」で使う。日付は新しい季節で作り直すので、ラベル
 * ではなく「N 日目」で写す (cells の d / p / c は dates / periods / classes の添字)。
 */
export interface CarriedTimetable {
  /** 元の project 名 (「2026 冬期講習」) */
  name: string;
  /** 控えを作った日時 (ISO) */
  savedAt: string;
  tabs: CarriedTab[];
}

export interface CarriedTab {
  name: string;
  /** このタブが使っていた日 (カレンダー順のラベル) */
  dates: string[];
  /** このタブが使っていた時限 (プール順のラベル) */
  periods: string[];
  classes: string[];
  cells: CarriedCell[];
}

export interface CarriedCell {
  d: number;
  p: number;
  c: number;
  subject?: string;
  teacher?: string;
}

/** 自動生成パラメータ (E2e)。project に optional で保存、未設定はデフォルト */
export interface GenerationParams {
  numPatterns: number;
  maxDailyHours: number;
  maxIterations: number;
  maxConsecutivePeriods: number;
  /** 乱数 seed。0 = 実行ごとにランダム、非 0 で固定 (再現可能) */
  generationSeed: number;
}

export type GenerationParamKey = keyof GenerationParams;

/**
 * 本体の月間の予定 (講師別の月間・授業時間の集計) へ出すか (2026-10-27)。
 * draft = 作成中 (出さない) / tentative = 仮確定 (「仮」の印つきで出す) /
 * final = 確定 (出す)。決まりは utils/publishState
 */
export type PublishState = 'draft' | 'tentative' | 'final';

export interface Project {
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  /**
   * 月間の予定へ出すか (utils/publishState)。未設定 = 確定 (この項目ができる前の
   * project は従来どおり月間に出す)。新しく作る季節は作成中から始める
   */
  publishState?: PublishState;
  teachers: Teacher[];
  activeTabId: number;
  /** v4: 全タブ共通の日付プール (各タブは activeDateIds で絞る。外部授業だけの日はどのタブにも出ない) */
  dates: DateEntity[];
  /** v4: 全タブ共通の時限プール (各タブは activePeriodIds で絞る) */
  periods: Entity[];
  tabs: Tab[];
  /** 季節の中の枠 (任意。無ければ従来どおり 1 つの講習) */
  frames?: Frame[];
  /** 「この講習の対象外」にした本体の行事予定 (講習) の名前 (utils/courseEventCheck) */
  ignoredCourseEvents?: string[];
  subjects: string[];
  subjectColors: Record<string, string>;
  combinedGroups: CombinedGroup[];
  /** makeExternalKey(dateLabel, teacherName) = `${date}-${teacher}` → コマ数 */
  externalCounts: Record<string, number>;
  externalSessions: ExternalSession[];
  externalSessionPresets: ExternalSessionPreset[];
  snapshots: TabSnapshot[];
  /** 作り直す前の時間割の控え (任意。utils/timetableCopy) */
  previousTimetable?: CarriedTimetable;
  /** 自動生成パラメータの保存値 (optional、resolveGenerationParams で解決) */
  numPatterns?: number;
  maxDailyHours?: number;
  maxIterations?: number;
  maxConsecutivePeriods?: number;
  /** B2: 連続出勤日数の上限 (任意) */
  dayStreakRules?: DayStreakRule[];
  /** B3: 所属が予備校部の講師を既定で「控えめ」にする (講師ごとの使い方が優先) */
  yobikoReserve?: boolean;
  generationSeed?: number;
}

/** useHistoryStack (useReducer) が持つ state */
export interface ProjectState {
  project: Project;
  /** undo/redo 履歴 (最古 → 最新)。project === history[historyIndex] */
  history: Project[];
  historyIndex: number;
  loadError: string | null;
}
