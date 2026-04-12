// ─── Domain types ─────────────────────────────────────────────────
// Shared TypeScript definitions for the core data model. JSX files
// reference these via JSDoc imports so checkJs can verify call
// sites without requiring a .jsx → .tsx migration.

export type DayName = "月" | "火" | "水" | "木" | "金" | "土";
export type Weekday = "日" | "月" | "火" | "水" | "木" | "金" | "土";
export type Department = "中学部" | "高校部";
export type HolidayScopeEntry = "全部" | Department;
export type SubStatus = "requested" | "confirmed" | "done" | "cancelled";

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
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  label: string;
  scope: HolidayScopeEntry[];
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

export type AdjustmentType = "move" | "combine";

export interface ScheduleAdjustment {
  id: number;
  date: string; // YYYY-MM-DD
  type: AdjustmentType;
  slotId: number; // 主対象コマ
  targetTime?: string; // "move" 用: 移動先の時間帯
  combineSlotIds?: number[]; // "combine" 用: 合同にするコマID群
  memo: string;
  createdAt?: string;
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
