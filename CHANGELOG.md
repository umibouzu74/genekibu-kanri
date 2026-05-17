# Changelog

## [Unreleased]

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
