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
}

export interface DisplayCutoff {
  groups: CutoffGroup[];
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
