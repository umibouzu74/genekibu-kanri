# Changelog

## [Unreleased]

### Fixed (講師グループ表示のコードレビュー指摘 P1-P4 を一括対応)
コードレビューで判明したバグを修正。

P1 (silent data corruption):
- **同名講師の禁止**: `teacher/add` / `teacher/rename` で名前重複を no-op に。
  以前は重複を許容していたため、teacherIdxByName Map の last-write-wins で
  『見ている行と書き込まれる行がズレる』状況が NgSettings / TeacherManager /
  ClassPriority で発生していた。`<tr key={t.name}>` もキー衝突を起こしていた。
- **既存重複への migration**: `migrateProject` 時に重複名を " (2)" / " (3)"
  suffix で uniq 化。古いプロジェクトを開いても自動的に修復される
  (`utils/scheduleKey.js#dedupeTeacherNames`)。
- **reducer 側の idx 検証**: `teacher/toggleNg` / `teacher/toggleSubject` /
  `teacher/toggleClassPriority` / `teacher/remove` / `teacher/rename` で
  `idx` の範囲チェックを追加。undefined や範囲外を no-op にし、
  `newTeachers[undefined]` で配列が文字列キーで汚染される事故を防ぐ。
- **group.key の sentinel 化**: `groupTeachersBySubject` の戻り値に `key` を
  追加 (`subj:<name>` / `__multi__` / `__other__`)。ユーザが教科名に
  '複数教科' や 'その他' を入れても React のキー衝突が起きない。全 6 consumer
  を `key={group.key}` に統一。

P2 (実バグ):
- **ScheduleCell の '複数教科' 罠**: subject 選択済み時は flatten モードで
  単一 optgroup に集約。未定など多教科担当が '複数教科' に分離される問題を
  解消 (新オプション `flattenIntoSingleSubject`)。
- **ScheduleCell の useMemo 漏れ**: `groupTeachersBySubject` を useMemo で
  包み、grid 内のすべての cell で毎レンダー再計算されていた問題を解消。
- **SummaryPanel の in-place sort**: `[...group.teachers].sort(...)` で
  groupTeachersBySubject の戻り配列を破壊しないように。
- **TeacherManager の InlineNameEdit unmount**: `<tr key>` を `t.name` から
  index `i` に戻し、外部リネーム中のドラフト消失を防止。

P3 (一貫性 / 設計):
- **subjectOrder 連携**: `groupTeacherNames` (本体側) が `subjects[].name`
  または明示の `subjectOrder` を尊重するように。ユーザが builder で
  リオーダした教科順が本体側 (CompareView / Sub・Adjustment・OverrideListTab)
  にも反映される。
- **CompareView 単一グループ時の flat 表示**: グループが 1 つだけのとき
  ヘッダ行を省略、`maxHeight` を 200 → 280 に拡張。
- **orphan 講師の警告再表示**: SummaryTable で project.teachers に存在しない
  名前を ⚠️ 不明な講師 ブロックで表示 (diff 前の自動 chip 化 feedback を維持)。
- **`subjects || []` フォールバック撤去**: SubstituteView で `subjects` を
  そのまま透過。子側のデフォルト引数で吸収する形にして、毎レンダーの
  新規 array literal による useMemo 無効化を防止。

P4 (低優先):
- **substring matching の長い順優先**: 短い subject 名 ('A' など) が
  長い名 ('英語' を含む '英語特訓') を hijack しないように、subjects と
  aliases ともに長い順に評価する。
- **per-group toggle の stale 解消**: ExternalCounts の『このグループを
  選択/解除』ボタン押下で `allSelected` を setState updater 内で再計算。
- **teacher.subjects 重複の dedupe**: `['英語','英語']` のような corruption
  data を Set で正規化してから length 判定 — '複数教科' 誤分類を防止。

Tests: +16 件 (reducer 8 / migration 2 / groupTeachersBySubject 3 /
groupTeacherNames 3)。全体 1181 件、lint 0 / typecheck 0 / build OK。

### Changed (講師一覧を教科ごとにグループ表示 — アプリ全体)
- すべての講師リスト・ドロップダウン・チェックボックス一覧を
  「教科 (英語 / 数学 / 国語 / 理科 / 社会) ごと → 複数教科 → その他」の
  グループ見出し付きで表示するよう統一。
- 講師ビルダー側 (project.teachers ベース) で新ユーティリティ
  `utils/groupTeachersBySubject` を導入。単一教科講師は当該グループ、
  複数教科担当 (未定など) は「複数教科」グループに 1 度だけ表示、担当無しは
  「その他」。
- 影響を受けた builder 側コンポーネント (計 6):
  - ExternalCounts: クイック入力グリッド (teacher rows) と
    複数講師チェックボックス一覧。各グループ単位の「グループ全選択 / 解除」
    ボタンも追加して複数人登録をさらに高速化
  - NgSettings: 日付ごとの NG テーブル (teacher rows) と一括設定の講師
    select (optgroup 化)
  - TeacherManager: 講師マスタ管理表 (rename / 削除 / 科目編集)
  - ClassPriority: クラス優先度設定テーブル
  - ScheduleCell: コマセルの講師ドロップダウン (optgroup 化)
  - SummaryPanel: 講師別コマ数の集計 (showSummary パネル + 自動生成案の
    集計表) を教科グループ見出し付きで表示
- 本体側 (slots ベース) では既存の `useTeacherGroups` のコアロジックを
  純粋関数 `utils/groupTeacherNames` に切り出し、任意の name 配列を
  「バイト → 英数国理社 → その他」にグループ化できるように。
- 影響を受けた本体側コンポーネント (計 4):
  - CompareView: 講師候補チップ一覧をグループ見出し付きで縦並びに
  - SubListTab / AdjustmentListTab / OverrideListTab: 講師フィルタ
    `<select>` を `<optgroup>` 化 (代行/調整/補正一覧)
- Tests: 19 件追加 (groupTeachersBySubject 9 / groupTeacherNames 10)。
  全体 1165 件、lint 0 / typecheck 0 / build OK。

### Added (他学年セッションのプリセット + 複数講師の一括登録)
- 「📅 他学年・午前」タブにプリセット管理パネル (折りたたみ) を追加。
  「予備校（早朝）= 12:25-13:35, 7/24~7/31, メモ"予備校"」のような
  時刻・期間・メモの組み合わせを保存し、詳細セッション登録フォームから
  1 クリックで時刻/期間/メモを展開できる。
- 詳細セッション登録フォームの講師欄を単一 `<select>` から **チェックボックス
  一覧** に変更し、複数講師を 1 クリックずつ選択可能。「全選択 / 全解除」
  ショートカット付き。
- 「まとめて追加」が M 人 × N 日 を 1 アクション (teacher/addExternalSessions
  既存 batch) で atomic に登録。プレビューも「M 名 × N 日 = K 件」と
  「→ 自動NG (M × N_overlap) 件」を表示。
- データ: project に `externalSessionPresets: Preset[]` を追加。
  `Preset = { id, name, startTime?, endTime?, startDateLabel?, endDateLabel?, memo? }`。
  既存プロジェクトは migrate 時に空配列で補完。
- 新 reducer actions: `preset/add` / `preset/update` / `preset/remove`。
  空文字フィールドは保存しない、startTime が無い場合は endTime も連動 drop、
  name 必須など defense-in-depth な検証を備える。
- 日付ラベル変更 (`schedule/renameHeader` 'date') 時に
  `externalSessions[].date` と `externalSessionPresets[].startDateLabel /
  endDateLabel` を cascade 更新 (孤児化防止)。
- Tests: 13 件追加 (reducer 11: preset add/update/remove + cascade,
  scheduleKey 2: migration)。全体 1146 件、lint 0 / typecheck 0 / build OK。

### Added (他学年セッション → 日時NG の自動派生)
- 「📅 他学年・午前」タブで時刻入りセッション (例: 12:25-13:35) を登録すると、
  その時間帯と重なる時限が「🚫 日時NG」タブで自動的にNG扱いになる。
  例: 堀上 7/29 12:25-13:35 の予備校 → 13:00-13:45 の中3 1限が自動NG。
  毎日NGを 1 セルずつクリックする手間を削減。
- 自動NGは保存せず計算で導出する方式 (utils/autoNg.js)。セッションを削除すれば
  NG表示もその場で消える。手動NG (teacher.ngSlots) との merge は表示・
  constraint 両方で行い、ScheduleCell の (NG) ラベル / NgSettings のグリッド /
  autoGenerator (solver) すべて手動NGと同等に扱う。
- 「📅 他学年・午前」の詳細セッション登録フォームを刷新:
  - 日付は「複数チェックボックス」から「期間 (開始日〜終了日)」のレンジに変更。
    NGタブと UI を揃え、毎日チェックする手間を削減。
  - 「時刻 (開始〜終了)」のピッカーを追加。type="time" で時刻入力を簡素化。
  - 自由ラベル欄は廃止 (時刻指定があれば自動で「HH:mm-HH:mm」を label として保存)。
  - 「→ 自動NG N 件」のプレビューを追加で、登録前に効果が見える。
- 時限ラベルから時刻を自動解析するパーサ (utils/timeRange.js) を新規。
  「1限 (13:00~13:45)」「13:00~」「12:25-13:35」など freeform を minutes に
  正規化。終了時刻が不明な場合は開始のみで重複判定 (始点 ∈ 他方範囲)。
- データ層: externalSession に optional `startTime` / `endTime` (HH:mm 文字列)
  を追加。既存セッションは未設定で表示は label にフォールバックするので
  backward compat あり。
- Tests: timeRange.test.js (25 件), autoNg.test.js (12 件), projectReducer
  (新フィールドの保存 / 空文字省略 2 件), teacherConstraints (autoNgEntries 経由 3 件),
  autoGenerator (時間重複セッションで solver が候補を外す 1 件) を追加。
  全体 1121 件、lint 0 / typecheck 0 / build OK。

### Fixed (自動NG: コードレビュー指摘の修正)
P1〜P3 を一括対応 (詳細は本変更の commit message を参照):
- **タブバッジ違反カウント**: `computeTabViolationCounts` がタブごとに
  `autoNgByTeacher` を再計算するように変更。それまではアクティブタブの
  ScheduleCell では NG 警告が出るのに、TabBar の他タブ badge が自動NG違反を
  カウントせず数字がズレていた。
- **静的検証 (実行不能スロット)**: `computeInfeasibilities` が
  `autoNgByTeacher` を受理し、全候補講師が他学年セッションで塞がれている
  スロットを『不可能』として警告するように。これまで solver が空セルを
  返す原因を事前に表示できていなかった。
- **Excel 出力の ⚠NG**: `excelExport` の 2 箇所 (シフト表 / 科目別シート) で
  自動NG (他学年セッションとの時間重複) も ⚠NG マークとして出力するように。
  これまで配布された Excel で自動NG違反が見落とされていた。
- **講師の削除/リネーム/CSV置換時の cascade**: `teacher/remove` /
  `teacher/rename` / `teacher/import (replace)` が `externalSessions` も
  cascade clean / rename するように。これまでは孤児セッションが UI に
  表示されながら自動NG派生の対象外になり状態が乖離していた。
- **フォーム検証**: ExternalCounts の `canAdd` を `parseHHmm` ベースに統一
  (regex 過剰許容を防ぐ)、`startTime` 必須化 (endTime のみの silent data loss
  防止)、`startTime < endTime` 強制 (逆転で自動NGが付かない silent failure
  防止)、エラー文言を直接表示。
- **連打による重複登録**: `handleAdd` 後に時刻とメモをクリアし、フォームが
  「処理された」視覚状態になることで意図しない二重登録を抑止。
- **複数日 atomic 登録**: 新アクション `teacher/addExternalSessions` を追加し、
  N 日選択時に 1 つの dispatch で全日登録 (履歴 push も 1 回、途中失敗時の
  半端状態を排除)。
- **`parseTimeRange` の終了のみ表記**: `~14:00` のような『終了 14:00 の意味』
  で書かれた文字列を `開始 14:00` と誤解釈する反転を防ぐため、明示的に
  `null` を返すように。
- **NgSettings の変数 shadow 解消**: tooltip 生成内で外側講師 `t` を
  `timeText` に rename し、将来 `t.name` を足したくなった時のバグ-on-touch
  を排除。
- **'未定' 講師の自動NG挙動を comment 化**: ScheduleCell で '未定' が
  placeholder として自動NG/手動NG ともに常に false 扱いになる仕様を
  明示。
- **date ID 初期値の型ドリフト**: `formStartDateId` / `formEndDateId` の
  初期値を `''` (string) から `null` に変更し、select の value を
  `?? ''` で coerce することで型混在を排除。
- Tests: 12 件追加 (timeRange 1 / analysisHelpers 3 / reducer 8)。
  全体 1133 件、lint 0 / typecheck 0 / build OK。

### Tests (Builder Test foundation: D2b)
- **D2b** Header / Toolbar / ScheduleCell の主要 3 コンポーネントに
  testing-library で UI テストを追加 (計 28 件):
  - `Toolbar.test.jsx` 9 件 (errorKeys ⚠️ ボタン / scrollToFirstError /
    progress 表示 / undo/redo disabled / 生成クリア confirm / isGenerating
    時の disabled)
  - `Header.test.jsx` 9 件 (project.name 表示 / 名前編集の Enter/Escape /
    saveStatus 表示 / プロジェクト保存ボタン / Excel 出力中の disabled +
    "⏳ 出力中..." / 完了後の toast)
  - `ScheduleCell.test.jsx` 10 件 (subject/teacher onChange / ロック切替 /
    locked 表示 / conflict ラベル / NG slot disabled / 既使用科目 disabled /
    矢印キーナビ ArrowDown/ArrowRight / config 不一致時の null return)
- ProjectContext / UIContext の Provider を直接 mock 値で wrap する形式で、
  vi.mock は最小限 (Header の `excelExport` 動的 import のみ)。
- 全体: 957 → 985 件、lint 0 / typecheck 0 / build OK。

### Changed (Builder Test foundation: D4e + D2a)
- **D4e + D2a** `hooks/useAnalysis.js` の 120 行モノリス useMemo を
  `utils/analysisHelpers.js` の 3 純粋関数 (`computeGlobalUsage` /
  `computeActiveAnalysis` / `computeDashboard`) に切り出し、テスト可能化。
  `useAnalysis` 自体は React-deps 最小化の orchestrator (44 行) に縮小し、
  useMemo を 3 段に分けて部分再計算を実現:
  - globalUsage / teacherDailyCounts は `project.tabs / combinedGroups /
    externalCounts` のみ依存 (現タブの schedule 変化で再計算しない)
  - activeAnalysis (conflict / dailySubject / subjectOrder) は
    `currentConfig / currentSchedule / globalUsage`
  - dashboard は `currentSchedule / currentConfig`
  公開 API (`{ analysis, dashboard }`) は不変なので、Toolbar / SummaryPanel /
  ScheduleCell / ProjectContext は無変更。
- `utils/analysisHelpers.test.js` 18 ケース新規:
  - computeGlobalUsage 6 件 (単純集計 / "未定" スキップ / externalCounts /
    合同グループ重複防止 / 複数タブ横断 / subject 未割当)
  - computeActiveAnalysis 7 件 (conflict / 合同グループ除外 / タブ横断 /
    dailySubjectMap / subjectOrders / 空 schedule / "未定" 除外)
  - computeDashboard 5 件 (0% / 50% / 100% / 空 config / subject 未割当)
- 全体: 939 → 957 件、lint 0 / typecheck 0 / build OK。

### Changed (Builder Quick wins: D4f / D4g / D7b)
- **D4f** Builder の「全データリセット」が `window.location.reload()` で強制
  リロードする hack を撤廃。新 reducer action `project/reset` を追加し、
  LocalStorage クリア後に `loadInitialProject()` を再実行して dispatch
  経由で state を初期化する方式に変更。挙動は等価 (user defaults があれば
  user defaults ベース、無ければ hardcoded default で再構築) で、reload に
  伴う体感ラグと React state の途切れが無くなる。`project/reset` は
  history も `[freshProject]` / `historyIndex=0` に初期化するため、Undo で
  「リセット前」に戻ってしまう事故を防止。
- **D4g** `cell/setNg` reducer case (23 行、cell 位置から講師名・date.label・
  period.label を引いて NG slot を toggle) を削除し、`useProject.js` の
  composer 内で `teacherActions.toggleTeacherNg` を呼ぶ派生 callback として
  `handleSetNg` を再定義。`teacher/toggleNg` と同じロジックを 2 箇所に
  持つ重複を解消。ContextMenu からの呼び出しシグネチャは不変。
- **D7b** 印刷システムの二系統 (`PrintButton` 直接系 / `handlePrint` popup 系)
  の所属を 7 ビューのファイル冒頭に inline コメントとして明記。Dashboard /
  WeekView / EventCalendarView / ConfirmedSubsView / MasterView が
  PrintButton 系、MonthView / ExcelGridView が popup 系。新しい印刷導線を
  足す際にどちらに寄せるか即判断できる。

### Tests
- `projectReducer.test.js`: 旧 `cell/setNg` 2 ケースを削除し `project/reset`
  2 ケースを追加 (57 件のまま)。
- `useProject.test.jsx`: `handleResetAll` 2 件 + `handleSetNg` 3 件を追加
  (36 → 41 件)。
- 全体: 934 → 939 件、lint 0 / typecheck 0 / build OK。

### Added (隔週管理タブの個別 anchor 解除)
- 隔週管理タブで「個別」マークの右に ✕ ボタンを追加 (admin のみ)。
  これまで slot ごとの個別基準日を解除するにはコマ編集モーダルまで
  掘る必要があったが、隔週管理タブから直接グローバル基準へ戻せるように。
- cascade なしの単純削除 (slot.biweeklyAnchors を `delete` するだけ) なので
  CLAUDE.md の規約に沿って即削除 + 6 秒 Undo toast を表示。Undo 中に
  別経路で再設定されていれば上書きしない安全策入り。
- `BiweeklyTab.test.jsx` を新設し、✕ ボタンの表示条件 (個別 anchor 有無、
  isAdmin、後方互換) と click → onClearSlotAnchors(id) 経路を計 5 ケース
  で検証。

### Fixed (隔週ローテーションのシフト)
- 隔週コマのローテーションが休講・テスト期間を考慮せず、休講や特訓を
  挟むと A/B 担当が片方に偏る (or 別教科側の進度が進まない) 不具合を修正。
  例: 5/1 B 週 → 5/8 休講/特訓 → 5/15 が B 週のままになっていたケースが、
  自動的に 5/15 = A 週へシフトする。毎回「隔週管理」で基準日を打ち直す
  手間が不要に。
- シフトトリガは「休講 (Holiday)」と「テスト期間 (ExamPeriod) で
  stopsClasses≠false のもの」。`stopsClasses=false` の高校テスト等は
  授業継続扱いなのでシフトしない。振替 (`ScheduleAdjustment`) は対象外。
- スキップ判定は slot 固有 (slot.day かつ scope/学年/科目キーワードが
  マッチするもののみ)。
- 手動で追加した基準日 (`BiweeklyAnchor`) は引き続き優先され、
  基準日以降のみ自動補正が走る。意図しない補正があれば手動 anchor で
  上書き可能 (従来の挙動を踏襲)。
- 関連実装: `utils/biweekly.js` (`getSlotWeekType` に `holidays` /
  `examPeriods` 引数追加、`isTeacherActiveOnDate` / `biweeklyDisplaySubject`
  も同様)、`utils/scheduleHelpers.js` (`isSlotCancelledByHoliday` と
  `isSlotCancelledForBiweeklyShift` を切り出し)、`utils/chainSubstitution.js` /
  `utils/sessionCount.js` / `hooks/useSessionCtx.js`
  (`holidays` / `examPeriods` を sessionCtx 経由で伝播)、表示系
  (`MonthView`, `WeekView`, `MasterView` / `BiweeklyTab`, `ExcelGridView` /
  `ExcelSection` / `ExcelCell`, `AbsenceWorkflowView` / `AbsenceTimetable` /
  `AbsenceSlotCard`) はそれぞれ `holidays` / `examPeriods` を thread 済み。
- `biweekly.test.js` に休講シフト・テスト期間シフトの 14 ケースを追加
  (56 件 → 76 件)。`chainSubstitution.test.js` に統合テスト 1 件追加。

### Fixed (校正レビュー 2 回目反映)
- `SubstitutePickerPopover` で新規追加した矢印キーハンドラに
  `isField` チェックが抜けており、ステータス `<select>` 内で矢印キーが
  preventDefault されてオプション切替できなくなっていた回帰を解消。
- `AdjustmentListTab` / `OverrideListTab` で 📅 / 📅→ ボタンを
  `S.iconBtn` 共通スタイルに集約した際に `marginRight: 2` を引き継ぎ忘れて
  隣接ボタンが密着していた点を修正。

### Fixed (校正レビュー 3 回目反映)
- ICS エクスポートの SUMMARY / DESCRIPTION が、隔週コマで「週ごとの
  実態」を反映していなかった点を修正。複合教科 "英/数" の隔週コマでは
  A 週担当には先頭教科 (`英`)、B 週パートナーには 2 つ目の教科 (`数`)
  を出すように `biweeklyDisplaySubject` を経由。`DESCRIPTION` の講師欄も
  パートナー側エクスポート時はパートナー名のみ表示。
- ICS に Asia/Tokyo の `VTIMEZONE` ブロックを追加 (RFC 5545 準拠、
  Apple Calendar / Outlook 等の厳格パーサ対策)。
- `SessionOverridePopover` の `value` / `displayAs` 入力 `onChange` でも
  `setError(null)` を呼ぶように修正。エラー後に値を直すと適用ボタンを
  押すまでエラー赤帯が残っていた UX を解消。
- インポート完了後に孤立データを検出した場合、データ管理モーダルを
  閉じずに残すよう変更 (孤立件数の info トースト表示と「孤立データ掃除」
  ボタンへの動線を保つため)。0 件のときは従来通りモーダルを閉じる。

### Added (校正レビュー 3 回目反映)
- `g` chord ナビゲーションに `g w` (週間) / `g o` (月間) を追加。
  WEEK / MONTH は講師選択中専用ビューなので、`selected` が `null` の
  ときは chord を no-op にして誤操作で講師選択を失わないよう保護。
  `m` キーは MASTER で取られているため、MONTH には mOnth の `o` を採用。
- `ShortcutsHelp` に `g w` / `g o` を追記。
- `S.iconBtn` 用のグローバル CSS `.icon-btn:hover` / `.icon-btn:focus-visible`
  を `App.jsx` の style ブロックに追加。一覧操作ボタンに `ICON_BTN_CLASS`
  を併用して、薄いグレーホバー背景とフォーカスリングを表示。
- `SubstitutePickerPopover` の矢印キー操作で focusIdx 変更時に
  対応 `<button role="option">` を `scrollIntoView({ block: "nearest" })`
  でスクロール表示。長い候補リストでも見えなくならない。

### Tests (校正レビュー 3 回目反映)
- `ics.test.js` に VTIMEZONE / 複合教科隔週 / DESCRIPTION 講師名の
  ケースを追加 (5 件 → 10 件)。
- `orphanCleanup.test.js` の `applyOrphanCleanup` に move / reschedule の
  `targetSlotId` updated ケースを追加 (14 件 → 16 件)。

### Fixed
- ICS エクスポートが隔週コマを毎週として出力していた不具合を修正。
  `RRULE:FREQ=WEEKLY;INTERVAL=2` を付け、隔週パートナーの ICS は最初の
  該当日を B 週側にずらして出力する。`utils/ics.js` から純粋関数
  `buildTeacherIcsContent` を切り出し、5 件のユニットテストを追加。
- 回数補正ポップオーバー (`SessionOverridePopover`) で「回数を指定 ↔
  カウントしない」を切り替えてもバリデーションエラーの赤帯が残り続けて
  いた点を修正。モード切替時に `setError(null)` する。
- 孤立データ掃除 (`utils/orphanCleanup.js`) が、`reschedule` / `move` の
  `targetSlotId` (振替先・移動先のコマ) が削除済になっているケースを
  検出していなかった。元コマが生きていれば `targetSlotId` のみ取り除いて
  テキスト情報 (targetDate / targetTime / targetTeacher) は残す部分修正の
  ロジックを追加。3 件のユニットテストを追加。

### Changed
- 授業管理 3 タブ (代行 / 時間割調整 / 回数補正) の削除コールバック
  `onDel` の引数規約を **id に統一**。`AdjustmentListTab` だけ
  `onDel(adj)` でオブジェクトを渡していたのを `onDel(adj.id)` に揃え、
  合同削除時の関連回数補正トーストは `SubstituteView.handleDelAdjustment`
  内で `adjustments.find` で再取得するように。
- `CommandPalette` (Cmd+K) のビュー候補に「週間 / 月間」を追加。空のビュー
  に飛ばさないため、講師選択中のときだけ候補に出す
  (`selectedTeacher` prop)。
- 一覧 3 タブ (Sub / Adjustment / Override) の操作列・ソートインジケータ
  を `@media print` で隠すよう `className="no-print"` を付与。フィルタ
  `<label>` に `htmlFor` を、対応する `<input>` / `<select>` に `id` を
  付与してスクリーンリーダー読み上げを改善。
- 一覧操作ボタン (✏️ / 🗑 / 📅 など) を `S.iconBtn` 共通スタイルに集約。
  最小タッチ領域 32×32px を確保 (WCAG 2.5.5 / 2.5.8 準拠)。
- 代行ピッカー (`SubstitutePickerPopover`) に矢印キー + Enter による
  キーボード操作を追加。`role="listbox"` / `role="option"` /
  `aria-activedescendant` で a11y 対応。
- データインポート完了後に `detectOrphans` を実行し、孤立データが
  含まれる場合は件数を info トーストで案内 (古いバックアップに対する
  防御策)。

### TODO / 課題
- 確認テストの教科ローテーション（英→数→国→理→社）未対応。現状は
  `subj:"確認テスト"` で固定表示。回数に応じた教科表示をサポートする
  仕組み（例: スロットに `subjectRotation: ["英語","数学",…]` を
  持たせ、セッション回数から教科を決定して表示する）が必要。

### Added
- 授業管理 (`SubstituteView`) に「時間割調整一覧」「回数補正一覧」タブを
  追加。代行一覧と同様に月 / 講師 / 種別フィルタ + 件数バッジを備え、
  欠勤振替画面で行った合同授業 / コマ移動 / 別日振替 / 回数補正 (set / skip)
  を一覧化、削除は `removeWithUndo` (6 秒間 Undo 可能なトースト) で
  取り消し可能。各行に「📅 この日に飛ぶ」ボタンがあり、欠勤振替画面の
  該当日を直接開ける。振替行は「📅→ 振替先へ飛ぶ」ボタンも併設。
- 「作成日時」列のヘッダをクリックして昇順 / 降順を切り替え可能に
  (「最近補正したものから取り消したい」操作を高速化)。
- データ管理モーダルに「孤立データ掃除」セクションを追加。コマ削除以前に
  作られた、参照先コマが存在しない代行 / 時間割調整 / 回数補正を一括で
  検出・削除できる。
- `Cmd+K` (Command Palette) の navigation 候補に「時間割調整一覧」
  「回数補正一覧」を追加し、サブタブへ直接ジャンプ可能に。
- ISO 文字列をローカルの `YYYY-MM-DD HH:MM` に整形する `fmtIsoLocal`
  ヘルパを `utils/dateHelpers.js` に追加 + ユニットテスト。
- ESLint (flat config) + Prettier + `npm run lint` / `npm run format`
- TypeScript tooling (`tsconfig.json`, `npm run typecheck`) and initial
  migration of `src/utils/schema.ts` with full type annotations. Shared
  domain types in `src/types.d.ts`.
- Vitest + 44 unit tests covering `data.js`, `utils/biweekly`, and
  `utils/schema`. New `npm run test` / `test:watch` scripts.
- GitHub Actions CI workflow running lint, typecheck, test, build.
- `ErrorBoundary` at app root with a graceful fallback screen.
- Toast system (`useToasts` + `ToastContainer`) with success/error/info
  variants for feedback on save/delete/import/export.
- `useConfirm` promise-based replacement for `window.confirm()` using
  the in-app Modal, including a `danger` tone.
- Import loading state and structural validation of export bundles via
  `validateExportBundle` and `migrateExportBundle`.
- Cascade delete for substitutes when their referenced slot is removed.
- Schema versioning (`schemaVersion`, `exportedAt`) in export bundles.
- Design tokens in `src/styles/tokens.js`, exposed as CSS custom
  properties on `:root` via `main.jsx`.
- Web manifest (`public/manifest.webmanifest`) and meta tags
  (description, OpenGraph, theme-color, favicon) in `index.html`.
- `CONTRIBUTING.md`, `CHANGELOG.md`.

### Changed
- ダッシュボード既定ビューを「時間割」に変更。localStorage 未設定ユーザは
  起動時に時間割表示で開く（既存ユーザは保存済みビューを尊重）。
- 時間割表示の月〜土曜タブに、viewDate を含む週の日付 (M/D) を併記。
  曜日クリック時に viewDate も連動し、第 N 回バッジが正しい日付基準で
  算出される。
- 並列スロット集約を導入: 同一 `(day, time, grade, cls, subj)` で担任
  だけ異なる複数スロット（例: 中3 火/木 確認テスト 藤田 + 大屋敷）を
  閲覧用途では 1 コマにまとめ、時間割表示で担任を「藤田・大屋敷」と
  併記。`buildSessionCountMap` の回数カウントも並列スロットを 1 回と
  して集計するよう `activeSlotsOnDay` に重複除去を追加。`utils/
  parallelSlots.js` を新設。代行モード・管理モードでは個別スロットを
  保つため集約を適用しない。
- `src/App.jsx` split from a 1,710-line monolith into a ~500-line shell
  + 14 component files under `src/components` and `src/components/views`,
  plus `src/hooks/useLocalStorage.js` and related utilities.
- `Modal` now traps focus (Tab / Shift+Tab), auto-focuses on open, and
  restores focus on close. Adds `role="dialog"`, `aria-modal`,
  `aria-labelledby`.
- `Sidebar` is a semantic `<nav>` with `aria-label` and shows an empty
  state when search filters out all teachers.
- Emoji-only buttons across the app now carry `aria-label`s.
- `SlotForm` wires proper `<label htmlFor>` / `<input id>` pairs and
  emits `role="alert"` on inline errors.
- `HolidayManager` adds date validation and toast feedback.
- Several hot paths memoized: `SectionColumn.byTime`, Sidebar per-
  teacher slot counts, App header day-count summary, Dashboard section
  grouping, `SlotCard` / `StatusBadge` wrapped in `React.memo`.
- `MasterView` hover state now uses React state via a memoized
  `MasterSlotCard` component instead of `querySelector` DOM mutation.
  Its filter chain collapses from 4 sequential filters into a single
  pass.
- `useLocalStorage` surfaces load/save failures through an `onError`
  callback; the app displays a toast on quota exhaustion instead of
  silently dropping writes.
- Root `README.md` replaced with a project-relevant description (was
  the GitHub Skills template).
- `LICENSE` copyright holder updated from "GitHub, Inc." to the project
  owner.

### Removed
- 6 GitHub Skills tutorial workflows under `.github/workflows/`.
- `gh-pages` npm dependency and `deploy` script (Actions handles
  deploys).
- Dead `DayBlock` and `SubBadge` components and two unused variables.
- Unused `@types/react*` type declarations (re-added indirectly through
  TypeScript tooling when appropriate).

### Fixed
- コマ削除時に、関連する `adjustments` (合同 / 移動 / 振替) と
  `sessionOverrides` も cascade 削除されるように修正
  (CLAUDE.md 「cascade ありは confirmedRemove」ルールに準拠)。
  合同授業の吸収側として参照されているケースは host 側を存続させ、
  該当 id だけを `combineSlotIds` から取り除く丁寧な処理。確認
  ダイアログとトーストには「削除」と「合同からの除外」を区別表示し、
  件数のミスマッチを防止。
- 一覧から欠勤振替画面に飛んだ際、`date` を lazy 初期化して
  「今日 → 目的日」のチラつきを回避。
- 合同削除時、その日の関連回数補正が孤立して残るケースを `info`
  トーストで案内。
- Several list components used `key={i}` (array index); replaced with
  stable IDs to prevent React reconciliation bugs when lists mutate
  (SlotCard in DayBlock, SectionColumn, WeekView, MonthView cells,
  MonthView teacherSubs).
