# Changelog

## [Unreleased]

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
