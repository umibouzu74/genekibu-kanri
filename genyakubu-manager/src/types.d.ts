// ─── Domain types ─────────────────────────────────────────────────
// Shared TypeScript definitions for the core data model. JSX files
// reference these via JSDoc imports so checkJs can verify call
// sites without requiring a .jsx → .tsx migration.

export type DayName = "月" | "火" | "水" | "木" | "金" | "土";
export type Weekday = "日" | "月" | "火" | "水" | "木" | "金" | "土";
export type Department = "中学部" | "高校部";
export type HolidayScopeEntry = "全部" | Department;
export type SubStatus = "requested" | "confirmed";

export interface Slot {
  id: number;
  day: DayName;
  time: string; // "19:00-20:20"
  grade: string; // "中1", "高3", etc.
  cls: string; // "S", "AB", "-"
  room: string;
  subj: string;
  teacher: string;
  note: string;
  timetableId?: number; // Timetable.id。未設定 = デフォルト時間割(id=1)
  biweeklyAnchors?: BiweeklyAnchor[]; // 授業別の隔週基準。未設定 = グローバル基準を使用
}

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  label: string;
  scope: HolidayScopeEntry[];
  targetGrades: string[]; // 空配列 = scope に従う（既存動作）
  subjKeywords: string[]; // 空配列 = 全科目対象。例: ["高松西"]
}

export interface Substitute {
  id: number;
  date: string; // YYYY-MM-DD
  slotId: number;
  originalTeacher: string;
  substitute: string; // "" until assigned
  status: SubStatus;
  memo: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubjectCategory {
  id: number;
  name: string; // 例: "文系", "理系"
  color?: string; // 表示色（任意）
}

export interface Subject {
  id: number;
  name: string; // 例: "英語"
  categoryId: number; // SubjectCategory.id
  aliases?: string[]; // Slot.subj 文字列とのマッチング用（任意）
}

export interface PartTimeStaffObject {
  name: string; // 一意キー
  subjectIds: number[]; // 担当できる Subject.id の配列
}

export interface BiweeklyAnchor {
  date: string; // YYYY-MM-DD
  weekType: "A"; // 常にA週（UIシンプル化のため）
}

export type AdjustmentType = "move" | "combine" | "reschedule";

export interface ScheduleAdjustment {
  id: number;
  date: string; // YYYY-MM-DD (振替/移動元の日付)
  type: AdjustmentType;
  slotId: number; // 主対象コマ
  targetTime?: string; // "move"/"reschedule" 用: 移動先の時間帯
  combineSlotIds?: number[]; // "combine" 用: 合同にするコマID群
  targetDate?: string; // "reschedule" 用: 振替先の日付 (YYYY-MM-DD)
  targetTeacher?: string; // "reschedule" 用: 振替先担当者 (未指定 = 元担当)
  memo: string;
  createdAt?: string;
}

// ─── Session override (回数手動補正) ─────────────────────────────
// 特定日・特定コマに対する回数の手動上書き。
// mode:"set"  → そのコマの回数を value に強制する。後続の同セット
//               ×教科×cohort スロットも value を基準に連続する。
//               value は以降の通常カウントで二重使用されないよう
//               「予約済み」として扱われる。
// mode:"skip" → そのコマはその日に「実施していない」扱いとし、回数
//               カウンタを進めない。別の合同コマに吸収された等。
//               displayAs を指定するとその値を表示しつつ、その値を
//               「使用済み」としてマークするため、以降の通常カウント
//               が displayAs に到達すると自動で飛び越す。
//               例: 合同授業で第4回を消化 → skip displayAs=4 →
//                  次回の通常カウントは 3, その次は 5 (4 は飛ばす)
export type SessionOverrideMode = "set" | "skip";

export interface SessionOverride {
  id: number;
  date: string; // YYYY-MM-DD
  slotId: number;
  mode: SessionOverrideMode;
  value?: number; // mode="set" のとき必須 (1-indexed)
  displayAs?: number; // mode="skip" のとき、その日に表示する回数 (1-indexed)
  memo: string;
  createdAt?: string;
}

// ─── Exam period (テスト期間) ────────────────────────────────────
export interface ExamPeriod {
  id: number;
  name: string; // "1学期中間テスト期間" 等
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  targetGrades: string[]; // ["中1","中2","中3"] 等。空配列 = 全学年対象
  // stopsClasses: 対象学年の通常授業を休止扱いにするか。
  // 既定 (undefined / true): 中学テストのように授業停止 (従来挙動)。
  // false: 高校テストのように表示のみで授業は継続。
  stopsClasses?: boolean;
  // tags: 学校名等の任意ラベル ("桜井", "第一" など)。
  // 表示・フィルタの整理用で、slot とのマッチには使わない。
  tags?: string[];
}

// ─── Exam prep (テスト直前特訓) shift schedule ────────────────────
// テスト期間中、通常授業は休講になるがアルバイトが自習監督のため出勤する。
// 校時を日毎に自由に定義し、各アルバイトがどの校時に出勤するかを記録する。
export interface ExamPrepPeriod {
  no: number; // 日毎に 1 始まりの連番
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface ExamPrepDay {
  date: string; // "YYYY-MM-DD"
  periods: ExamPrepPeriod[];
  // assignments[staffName] = 出勤する校時 no の配列
  assignments: Record<string, number[]>;
}

export interface ExamPrepSchedule {
  examPeriodId: number; // ExamPeriod.id
  days: ExamPrepDay[];
}

// ─── Special event (特別イベント) ────────────────────────────────
// テスト発表日や修学旅行・文化祭など、休講や試験期間とは別に
// 「告知用」として扱いたい予定。`isOffForGrade` 等の出欠ロジックには
// 影響せず、ダッシュボード/月次/イベントカレンダーに視覚的に表示する。
export type SpecialEventType =
  | "trip" // 修学旅行・遠足など (生徒不在)
  | "ceremony" // 始業式・卒業式など
  | "festival" // 文化祭・体育祭など
  | "announcement" // テスト発表日・出願など
  | "other";

export interface SpecialEvent {
  id: number;
  name: string; // "修学旅行", "文化祭", "1学期中間テスト発表" 等
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD" (単日イベントは start === end)
  eventType: SpecialEventType;
  targetGrades: string[]; // 空配列 = 全学年対象
  memo: string;
  // tags: 学校名等の任意ラベル ("桜井", "第一" など)。ExamPeriod と
  // 共通のタグ空間で表示・フィルタを統一する。
  tags?: string[];
}

// ─── Day schedule (特別時程) ─────────────────────────────────────
// 学校行事の都合で特定日だけ時程が変わるコース (主に附属) のための
// 「日付 × 対象学年 × 時刻読み替え + 部分休講」。Slot 本体は変更せず、
// 表示・回数カウント・衝突プレビューが日単位で読み替える。
// 例①: 50 分授業への圧縮 (timeMap で 4 コマを 17:00 開始へ写像、テは据え置き)
// 例②: 1 限カット (cancelTimes に最初の時間帯 — 回数カウントも進めない)
// slot.id を参照しない (時間帯文字列で照合) ため、コマの入れ替えに強い。
export interface DayScheduleTimeMapEntry {
  from: string; // 元の時間帯 ("16:25-17:25")。slot.time と完全一致で照合
  to: string; // 読み替え後の時間帯 ("17:00-17:50")
}

export interface DaySchedule {
  id: number;
  date: string; // "YYYY-MM-DD"
  label: string; // "附属 50分授業 (17:00開始)" 等
  targetGrades: string[]; // slot.grade 完全一致。空配列 = どのコマにも効かない
  timeMap: DayScheduleTimeMapEntry[];
  cancelTimes: string[]; // この時間帯のコマはその日休講扱い
  memo: string;
  createdAt?: string;
}

// ─── Extra lesson (追加授業) ─────────────────────────────────────
// 週次 Slot と異なり「特定日付にのみ実施する単発コマ」。
// 例: プレップの夏期講習 4 回分、テスト対策の特別授業。
// 通常授業と同様にスケジュール表示 (Dashboard 日別 / MonthView /
// WeekView バナー) へ反映する。回数カウント (sessionCount) には
// **含めない仕様で確定** (H1c は 2026-07-03 に却下、CLAUDE.md 参照)。
export interface ExtraLesson {
  id: number;
  date: string; // "YYYY-MM-DD" 実施日
  time: string; // "18:30-19:30"
  grade: string; // Slot.grade と同じ語彙 ("中3", "高1高2" 等)
  cls?: string; // クラス (任意)
  room?: string; // 教室 (任意)
  subj: string; // 科目・講座名
  teacher: string; // 担当講師。複数名は "·" 区切りが正史 (分解は必ず
  // utils/biweekly.splitTeacherField を使う — "・"/"･" の IME 入力も受理する)
  label?: string; // 種別ラベル (例: "夏期講習", "テスト対策")
  note?: string; // メモ (任意)
}

// ─── Koshu lesson (講習コマ、派生表示) ───────────────────────────
// 講習時間割作成 (timetable-builder) の project から
// utils/builderLessons.buildKoshuLessons が導出する読み取り専用の表示モデル。
// 親アプリはこれを永続化しない (正は builder の project — RTDB
// appData/builder/schedule_project)。編集は builder 側で行う。
// kind="external" は externalSessions (予備校・高校等の他学年セッション)
// 由来で、subj に種別ラベル (メモ→プリセット名→「外部」) が入り、
// grade / cls / tabName は空。periodLabel は時刻の読めないセッションの
// 自由記述 label のフォールバック表示に使う。
export interface KoshuLesson {
  kind: "koshu" | "external";
  key: string; // React key 用の安定キー (koshu: tabId:dateId:periodId:teacher:subj / external: ext:sessionId)
  date: string; // "YYYY-MM-DD"。ラベル "M/D(曜)" を基準日近傍の年で解決したもの
  dateLabel: string; // builder 側の元ラベル ("7/24(金)")
  time: string | null; // "13:00-13:45" / "13:00" (時限ラベル等から解析)。読めなければ null
  periodLabel: string; // 時限の短表示 ("1限" — 時刻注記の括弧を除いたもの)
  teacher: string; // 担当講師。builder セルは単一講師名で、照合は完全一致
  // ("·" 連結や note 内併記の慣習は無いので splitTeacherField の対象外)
  subj: string;
  // 回数連番の丸数字 ("②" = そのクラスでその科目が 2 回目)。builder 画面・
  // 講師別 Excel・配布用と同じ makeSubjectOrderMarker で導出。合同でクラス
  // ごとに番号が違う場合は cls の並び順の "/" 連結 ("②/③")。external と
  // 番号の付かないコマ (subjectDup 違反中など) は空文字
  countText: string;
  grade: string; // タブ名 ("中3" 等)。gradeColor の色分けに使う
  cls: string; // クラスラベル ("３S"。合同まとめは "３S/３A")
  tabName: string;
  projectName: string;
}

// ─── Class set (授業セット) ──────────────────────────────────────
// 同一コースとしてカウントすべき複数スロットを束ねる論理グループ。
// 例: 中3 数学 (火・木) → slotIds に該当 2 スロットを登録すると
// ダッシュボードで共通の回数カウンタが振られる。
export interface ClassSet {
  id: number;
  label: string; // "中3 数学 (火・木)" 等
  slotIds: number[];
}

// ─── Timetable / Display cutoff ──────────────────────────────────
export type TimetableType = "regular" | "koshu";

export interface Timetable {
  id: number;
  name: string; // "2026年度 1学期", "夏期講習2026"
  type: TimetableType; // 現在は "regular" のみ、"koshu" は将来用
  startDate: string | null; // "YYYY-MM-DD" or null（無制限）
  endDate: string | null; // "YYYY-MM-DD" or null（無制限）
  grades: string[]; // ["中1","中2","附中1"] 等。空配列 = 全学年対象
}

export interface CutoffGroup {
  label: string; // "中1・2", "中3", "高1・2", "高3"
  grades: string[]; // ["中1","中2"], ["中3"], …
  startDate?: string | null; // "YYYY-MM-DD" or null（開始日制限なし）
  date: string | null; // "YYYY-MM-DD" or null（終了日制限なし）
  // 開講日 (startDate 以降の初回授業日) の 1 限をオリエンテーション扱いに
  // して授業回数に数えないか。true/false は画面で明示設定した状態、
  // 未設定 (undefined / null) は従来既定 = 中学部のみ有効。
  // 2 学期以降のようにオリエンが入らない期は false にする。
  orientationFirstDay?: boolean | null;
}

// ─── Cohort cutoff (コース別 終講日) ─────────────────────────────
// 学年グループより細かい「学校別 (高校) / コース別 (中学)」の終講日。
// id は utils/cohorts.js が生成する安定キーで、実際に授業がある曜日 (中学) /
// 学校 (高校) を埋め込む。slot との照合 (findCohortCutoff) に使う:
//   - 高校:  `H|<学年>|<学校>`      (学校 = subj 先頭トークン)
//   - 中学:  `M|<学年>|<曜日列>`    (例 火金 / 月木 / 火木 / 水金 / 土)
// date (終講日) のみ持ち、開始日は学年グループ (CutoffGroup.startDate) を
// そのまま使う。回数計算の起点は従来どおりグループ単位で不変。
export interface CohortCutoff {
  id: string; // utils/cohorts.js 形式の安定キー
  label: string; // 表示用 (例: "高1 高松西", "中1 火金")
  grade: string; // 対象学年 (グルーピング・表示用)
  date: string | null; // "YYYY-MM-DD" 終講日。null = グループ設定にフォールバック
}

export interface DisplayCutoff {
  groups: CutoffGroup[];
  cohorts?: CohortCutoff[]; // 学校・曜日コホート別の終講日 (任意)
}

export interface ExportBundle {
  schemaVersion?: number;
  exportedAt?: string;
  slots?: Slot[];
  holidays?: Holiday[];
  substitutions?: Substitute[];
  // 旧形式 (string[]) と新形式 (PartTimeStaffObject[]) の両方を受け入れる
  partTimeStaff?: (string | PartTimeStaffObject)[];
  subjectCategories?: SubjectCategory[];
  subjects?: Subject[];
  biweeklyBase?: string;
  biweeklyAnchors?: BiweeklyAnchor[];
  adjustments?: ScheduleAdjustment[];
  timetables?: Timetable[];
  displayCutoff?: DisplayCutoff;
  examPeriods?: ExamPeriod[];
  classSets?: ClassSet[];
  sessionOverrides?: SessionOverride[];
  examPrepSchedules?: ExamPrepSchedule[];
  specialEvents?: SpecialEvent[];
  extraLessons?: ExtraLesson[];
  daySchedules?: DaySchedule[];
}

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  path?: string;
}

// Toast tones.
export type ToastTone = "success" | "error" | "info";
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

// Confirm dialog options.
export interface ConfirmOptions {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}
