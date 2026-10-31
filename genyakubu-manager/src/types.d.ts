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
  // 不定期のコマ (utils/slotDates)。true のときは onlyDates の日だけ実施する
  // (一覧が空ならどの日も実施しない)。マークテストのように決まった日だけのコマ
  irregular?: boolean;
  onlyDates?: string[]; // YYYY-MM-DD
  // 回数 (第N回) の数え方 (utils/sessionCount)。
  // separateWeekdayCount: 同じ曜日のコマとだけ通算する (月・土で会場違いの同じ授業)
  // sessionStartNumber: その期の最初の回を第N回から数える (2 学期は⑨から)
  separateWeekdayCount?: boolean;
  sessionStartNumber?: number;
}

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  label: string;
  scope: HolidayScopeEntry[];
  targetGrades: string[]; // 空配列 = scope に従う（既存動作）
  subjKeywords: string[]; // 空配列 = 全科目対象。例: ["高松西"]
  // 例外 (この日は授業あり) のコマ。対象に入っていても休講にしない
  // (utils/holidayExceptions、判定は scheduleHelpers.holidayMatches)
  excludeSlotIds?: number[];
}

// 代行レコード。**代行者が空 ("") のものは欠勤**を表す (欠勤専用のモデルは
// 作らない)。substitute の有無 = 代行が付いたか / status = 対応が確定したか
// の 2 軸で 4 状態になる (utils/substituteState.js):
//   "" + requested … 欠勤・代行を探し中 (代行未定)
//   "" + confirmed … 欠勤・代行なしで確定 (他の担当者で回す)
//   名前 + requested / confirmed … 代行 (依頼中 / 確定)
// **1 コマに複数件立つ** — 1 コマを複数人で担当するコマ (プレップ) は
// (date, slotId, originalTeacher) が鍵。
export interface Substitute {
  id: number;
  date: string; // YYYY-MM-DD
  slotId: number;
  originalTeacher: string; // 休む講師 (隔週は対象日の担当者に解決済み)
  substitute: string; // "" = 代行者なし (欠勤)
  status: SubStatus; // 対応が確定したか (代行の有無とは独立)
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

// "cancel" = コマ休講 (日付 × コマ 1 つの休講。utils/slotCancel)。休講
// (Holiday) では表せない「このコマだけ今日は休講」「◯時より前だけ休講」を
// 表す。合同・移動・振替と同じ (日付, コマ) 参照なので一覧・孤立掃除・
// Undo の経路にそのまま乗る。
export type AdjustmentType = "move" | "combine" | "reschedule" | "cancel";

export interface ScheduleAdjustment {
  id: number;
  date: string; // YYYY-MM-DD (振替/移動元の日付)
  type: AdjustmentType;
  slotId: number; // 主対象コマ
  targetTime?: string; // "move"/"reschedule" 用: 移動先の時間帯
  combineSlotIds?: number[]; // "combine" 用: 合同にするコマID群
  targetDate?: string; // "reschedule" 用: 振替先の日付 (YYYY-MM-DD)
  targetTeacher?: string; // "reschedule" 用: 振替先担当者 (未指定 = 元担当)
  targetRoom?: string; // "reschedule" 用: 振替先の教室 (未指定 = 元のコマの教室。adjustmentDisplay.rescheduleRoom)
  combineWith?: { date: string; slotId: number }; // "reschedule" 用: 振替先で合同にした相手 (受け入れる側の振替の振替元の日とコマ)
  memo: string; // "cancel" では休講の理由 (任意)
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
  // classExceptions: 期間中だが例外的に通常授業を行う日。
  // 特訓は始まっているのに授業は休みにならない日 (例: 9/19 土の中3) を表す。
  // stopsClasses=false のテスト期間では意味を持たない (元々授業を止めない)。
  classExceptions?: ExamClassException[];
  // examDates: 期間のうち実際に考査がある日 (昇順・重複なし・startDate〜endDate
  // の範囲内。空ならキーごと持たない)。**表示専用** — 高校の学校別テストは
  // startDate = 考査発表日で登録するので、年間カレンダーの学校バッジ・学校別
  // タイムラインが「発表 / 発表後 / 考査 n 日目 / 期間中の休み」を出し分ける
  // のに使う (utils/schoolSchedule)。授業停止 (examPeriodStopsClassesOn)・特訓・
  // 隔週の週送り・第N回には使わない。
  examDates?: string[];
  // 出典 (例: "2026桜井年間行事計画")。まとめて登録で付け、一覧で出典ごとに
  // 表示・まとめて削除する (予定表の改訂版が来たら出典ごと入れ直す)
  source?: string;
}

// テスト期間中に例外的に通常授業を行う日。
export interface ExamClassException {
  date: string; // "YYYY-MM-DD" (テスト期間の startDate〜endDate 内)
  // grades: 授業を行う学年。空 / 未指定 = そのテスト期間の対象学年すべて。
  grades?: string[];
  memo?: string;
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
// 種別は schema v24 で塾の実情に合わせて作り直した (constants/specialEvents)。
// v23 までの trip / ceremony / festival / announcement は読み込みで寄せる
// (utils/specialEventTypes)。
export type SpecialEventType =
  | "school" // 学校の予定 (公立中の定期テスト・始業式・修学旅行など)
  | "jukuTest" // 塾のテスト (チャレンジテスト・公開実力・プレテスト)
  | "entrance" // 入試 (推薦・学力検査・合格発表)
  | "course" // 講習 (冬期講習・直前ポイント)
  | "parents" // 保護者会
  | "staff" // 社内 (教科会議・模試監督)
  | "mock" // 模試 (学校ごとの校外模試・学力テスト。学校タグ + 「希望者」タグ)
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
  // 共通のタグ空間で表示・フィルタを統一する。種別はタグに入れない。
  tags?: string[];
  // 出典 (例: "2026中学予定表")。まとめて登録で付け、一覧で出典ごとに
  // 表示・まとめて削除する (予定表の改訂版が来たら出典ごと入れ直す)
  source?: string;
}

// ─── 予備校部の予定 (年間カレンダーの上半分) ───────────────────────
// 予備校部の「年間行事予定表 (教員用)」を写す (utils/yobikoEvents)。
// kind が日の種別 (休校日・出勤者休日・授業なしの登校日・入寮日) なら日付の
// 数字を塗り、行事 (event) なら名称を欄に出す。現役部の SpecialEvent とは別に
// 持つ (年間カレンダー以外の画面は読まない)。
export type YobikoEventKind =
  | "event" // 行事 (マークテスト・ダブル授業・冬期講習…)
  | "closed" // 休校日
  | "offMonFri" // 月〜金出勤者休日
  | "offTueSat" // 火〜土出勤者休日
  | "noClass" // 登校日で授業のない日
  | "dorm"; // 入寮日

export interface YobikoEvent {
  id: number;
  name: string; // 日の種別は空でもよい (表示は種別の名前)
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD" (単日は start と同じ)
  kind: YobikoEventKind;
  memo?: string;
  source?: string; // 出典 (まとめて登録で付け、出典ごとに消せる)
}

// 特別イベントの表示設定 (全員共通、LS.specialEventDisplay)。
// monthTypes = 講師の月間予定 (月間・週間・まとめて印刷・画像) に出す種別。
export interface SpecialEventDisplay {
  monthTypes: Record<SpecialEventType, boolean>;
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

// ─── 附属の授業予定 (FuzokuPlan) ─────────────────────────────────
// 附属コース (学年が「附中」で始まるコマ) の月間予定のうち、既存モデルに
// 受け皿が無い 2 つだけを持つ。時程 (50分授業など) は DaySchedule、休みは
// Holiday / ExamPeriod のまま (utils/fuzokuPlan.js)。
//   - notes: 日付ごとの学校メモ (バスの時刻・学校の行事)。時程を決めた根拠
//   - tests: 確認テストの科目を (日付, 学年) で手で決めた分。無い週は
//            英→数→国→理→社 のローテーションで自動に回る
// 日付・学年をキーにした map なので RTDB の空配列落ちに強い。「なし」は
// 空配列ではなく none: true で表す (空配列は RTDB が消すため)。
export interface FuzokuDayNote {
  bus?: string; // 学校の予定表のバス欄をそのまま ("15:20×2 15:30×1")
  memo?: string; // 学校メモ ("3時間授業", "合唱祭")
}

export interface FuzokuTestEntry {
  subjects?: string[]; // ["英", "数"]。1 科目だけの週もある
  none?: boolean; // true = その週は確認テストなし
}

export interface FuzokuPlan {
  notes: Record<string, FuzokuDayNote>; // "YYYY-MM-DD" → メモ
  tests: Record<string, Record<string, FuzokuTestEntry>>; // 日付 → 学年 → 科目
}

// ─── 引継ぎメモ (HandoverNote) ───────────────────────────────────
// 責任者が日々気付いたことを書き溜めて後任に渡すメモ (utils/handoverNotes.js)。
// Firebase では adminData/ (管理者だけが読める) に置く。
export interface HandoverNote {
  id: number;
  date: string; // 起きた日 "YYYY-MM-DD"
  category: string; // HANDOVER_CATEGORIES のいずれか
  title: string; // 1 行の要約 ("事務よりズバリ的中の提出催促")
  body?: string; // 詳細・経緯 ("9 月の会議で告知済み")
  advice?: string; // 次の担当者へ (こうしておくとよい)
  annual?: boolean; // true = 毎年この時期にあること
  pinned?: boolean; // true = 日付に関係なくいつでも必要なこと (手順・連絡先)
  createdAt?: string;
  updatedAt?: string;
}

// ─── 講師の所属 (TeacherAffiliationChange) ───────────────────────
// 「この講師はこの年度 (4 月始まり) からこの区分」という変更だけを持つ
// (utils/teacherAffiliations.js)。何もしなければ前の年度の区分を引き継ぐ。
// 登録の無い講師は予備校部、バイト一覧の人は現役部 非常勤が既定。
export interface TeacherAffiliationChange {
  name: string;
  fromYear: number; // 年度 (2026 = 2026/4〜2027/3)
  category: string; // AFFILIATION_CATEGORIES の key ("genyaku-fulltime" など)
}

// ─── 予定表チェックの同期データ ────────────────────────────────────
// 講座の対応 (utils/yoteihyo/courseMapping): 予定表の講座キー → システムの
// コマ (学年|科目名) を手で選んだ結果。講座キーは RTDB のキーに使えない文字を
// 含みうるので配列で持つ。
export interface YoteihyoMappingEntry {
  course: string; // 予定表の講座キー (「高1|高松西高校」「高3|sym:★」)
  subjects?: string[]; // 「学年|科目名」
  skip?: boolean; // true = この講座は比べない
}
// 確認済み (対応不要) の食い違い (utils/yoteihyo/confirmations)。
export interface YoteihyoConfirmation {
  date: string; // "YYYY-MM-DD" 食い違いの日
  course: string; // 講座の識別 (学年の組 + 講座名。courseIdentity)
  fp: string; // 確認したときの食い違いの中身の目印 (変われば、また出す)
  at?: string; // "YYYY-MM-DD" 確認した日
}

// ─── 有給・半休 (StaffLeave) ─────────────────────────────────────
// 現役部 常勤の休暇の記録 (utils/staffLeave.js)。Firebase では adminData/
// (管理者だけが読める) に置く。
export interface StaffLeaveRecord {
  id: number;
  name: string;
  date: string; // "YYYY-MM-DD"
  kind: "full" | "am" | "pm" | "other" | string;
  memo?: string;
}
export interface StaffLeaveGrant {
  name: string;
  year: number; // 年度
  days: number; // その年度に使える日数 (付与 + 繰越)
}
export interface StaffLeave {
  records: StaffLeaveRecord[];
  grants: StaffLeaveGrant[];
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

// ─── Offsite lesson (他校舎の授業) ───────────────────────────────
// 講師が決まった曜日・時刻に別の校舎・学校へ授業をしに行く予定
// (utils/offsiteLessons.js)。「石原: 村上高松 火・木 14:50-15:40 10/1〜未定」。
// 塾の授業ではないので Slot / ExtraLesson にはしない (第N回・表示期間・
// タイムテーブルのコマに混ぜない)。講師別の月間 / 週間・日別ダッシュボード・
// 講師の重なり・代行候補が「その時間は他校舎にいる」として読む。
// RTDB は空配列と null を消すので、days / skipDates / endDate の欠落は
// 「空」「未定」と読む (migrateOffsiteLessons が補う)。
export interface OffsiteLesson {
  id: number;
  teacher: string; // 講師 1 名 (複数人で行くときは 1 人 1 件)
  place: string; // 行き先 ("村上高松" / "大手前丸亀")
  days: DayName[]; // ["火", "木"]
  time: string; // "14:50-15:40"。終了時刻が未定なら開始だけ "13:30"
  startDate: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"。無し = 終了日未定
  skipDates?: string[]; // この日は無い (先方の行事・冬休みなど)
  keepOnHolidays?: boolean; // true = 塾の全体休講日 (祝日など) も行く
  memo?: string; // "1月まで？" など
  createdAt?: string;
  updatedAt?: string;
}

// ─── Card forget (バイトのカード忘れ) ─────────────────────────────
// 出退勤のカードを通し忘れた日 (utils/cardForgets.js)。1 人 × 1 日で 1 件。
// 責任者 (管理者) が記録し、経理がバイト出勤表・講師の月間で見る。
// 出勤日数 (授業から数える) には関与しない。空の値はキーごと持たない。
export type CardMissing = "both" | "in" | "out";
export interface CardForget {
  id: number;
  name: string; // バイトの名前
  date: string; // "YYYY-MM-DD"
  missing: CardMissing; // 打刻できなかったもの (出勤・退勤 / 出勤だけ / 退勤だけ)
  inTime?: string; // 実際の出勤時刻 "16:50" (出勤を打刻できなかったときだけ)
  outTime?: string; // 実際の退勤時刻 "21:05" (退勤を打刻できなかったときだけ)
  memo?: string;
  recordedAt?: string; // 最後に記録した日時 (ISO)
}

// ─── 高校部・予備校の講習 (utils/seniorKoshu、2026-10-27) ────────────
// 期 (日の並び) × 時限 (時刻) × 担当 (講師 1 人 × 学年 × 講座名)。講師の月間に
// 出し、講習時間割作成が取り込んで自動NG にする。
export interface SeniorKoshuTerm {
  id: number;
  name: string; // "高3 Ⅰ期"
  dates: string[]; // "YYYY-MM-DD" の昇順
}
export interface SeniorKoshuPeriod {
  id: number;
  name: string; // "予備校３限"
  time: string; // "12:25-13:35" (読めない時刻は "")
}
export interface SeniorKoshuLesson {
  id: number;
  teacher: string;
  termId: number;
  periodId: number;
  grade?: string; // "高3" / "予備校"
  course: string; // "共通テスト理科基礎(物理基礎)"
  skipDates?: string[]; // この講師が担当しない日 (期の日のうち)
  memo?: string;
}
export interface SeniorKoshuData {
  terms: SeniorKoshuTerm[];
  periods: SeniorKoshuPeriod[];
  lessons: SeniorKoshuLesson[];
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
  room: string; // 教室 ("401"。合同は "401/403"。講習時間割作成のクラスに教室が無ければ "")
  tabName: string;
  projectName: string;
  // 季節の中の枠の名前 (「直前ポイント演習」。枠を使っていなければ "")。カードの説明は
  // projectName より枠の名前を出す (timetable-builder/utils/frames)
  frameName: string;
  // 講習時間割作成で「仮確定」にした時間割のコマ (月間のカードに「仮」)。
  // 作成中の時間割のコマは KoshuLesson にならない (timetable-builder/utils/publishState)
  tentative: boolean;
}

// ─── Class set (授業セット) ──────────────────────────────────────
// 同一コースとしてカウントすべき複数スロットを束ねる論理グループ。
// 例: 中3 数学 (火・木) → slotIds に該当 2 スロットを登録すると
// ダッシュボードで共通の回数カウンタが振られる。
// ─── 授業セット (第N回を通しで数えるコマの組) ─────────────────────
// 定義は 2 形式 (utils/classSets.js が両方を解決する):
//   - units 形式 (現行): 学年 × 曜日 で書く。コマ id を参照しないので、
//     期切替 (前期→後期) で作り直したコマにもそのまま効く。
//   - slotIds 形式 (旧): コマ id を直に並べる。期切替で紐付けが切れるため、
//     画面から units 形式へ変換できる。読み取りは引き続きサポート。
export interface ClassSetUnit {
  grade: string; // "中3"
  day: string;   // "火"
}

export interface ClassSet {
  id: number;
  label: string; // "中3 (火・木)" 等
  units?: ClassSetUnit[]; // 現行形式 (学年 × 曜日)
  slotIds?: number[]; // 旧形式 (コマ id 直参照)
  // 日数カウント: 同じ日の同じ教科・クラスのコマは 1 回と数える (土曜の
  // プレップのように 1 日に同じ授業が 2 コマ続くコース)。未設定 = コマごと
  countByDay?: boolean;
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
  // この終講日が効く時間割 (A1、2026-10-31)。付いていればその時間割のコマにだけ
  // 効く (前の期の終講日を残したまま次の期を作れる)。無い旧データはどの時間割の
  // コマにも効く。読み込みのたびに cohorts.resolveCohortTimetables が補い、
  // コース別終講日の画面で保存したときに書かれる
  timetableId?: number;
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
  specialEventDisplay?: SpecialEventDisplay;
  extraLessons?: ExtraLesson[];
  daySchedules?: DaySchedule[];
  fuzokuPlan?: FuzokuPlan;
  offsiteLessons?: OffsiteLesson[];
  seniorKoshu?: SeniorKoshuData;
  yobikoEvents?: YobikoEvent[];
  /** 管理者が書き出したときだけ含まれる */
  handoverNotes?: HandoverNote[];
  teacherAffiliations?: TeacherAffiliationChange[];
  /** 管理者が書き出したときだけ含まれる */
  staffLeave?: StaffLeave;
  yoteihyoMapping?: YoteihyoMappingEntry[];
  yoteihyoConfirmed?: YoteihyoConfirmation[];
  cardForgets?: CardForget[];
}

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  path?: string;
  /** ok のまま通した注意点 (参照先の無いレコード等)。無ければ省略 */
  warnings?: string[];
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
