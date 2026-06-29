# 講習時間割作成 (timetable-builder) 今後のロードマップ

最終更新: 2026-06-29 / A1-A8 + B1-B4 + C1-C4 + D-Quick wins (D4f/D4g/D7b)
+ D-Test foundation (D2a + D2b + D4e) + E2e (生成パラメータ UI) + E2f-cancel
+ E2h (生成案の負荷偏り表示) + E1c (名前付きスナップショット)
+ E1d (スケジュール差分ビュー) + E2a-file (CSV ファイル取り込み)
+ E1g (エラー時の修正提案) + E2c (講師の連続コマ数制約)
+ E2b-MVP (修正提案のワンクリック適用) + E2d (テンプレート機能)
+ E3d (JSON schema バリデーション) + E4a (cleanSchedule O(K) 化)
+ E1b (キーボード操作完成度: focus trap + tablist 矢印ナビ)
+ E6c (LocalStorage 容量監視) + E6d (複数タブ競合検出) 完了

このドキュメントは「次のセッション (新しい Claude Code セッション or 別の開発者) が
迷わず作業を引き継げる」ことを目的にしている。完了項目は ✅ で短くまとめ、
未着手の C 系再設計だけ詳細を残す。

---

## 1. 現状サマリ

### 1.1 立ち位置
- 旧スタンドアロン版 jikanwarikun は **削除済み**（commit `68df68a`）
- 現行: `genyakubu-manager/src/timetable-builder/` に同居
- 親アプリのサイドバー「時間割管理 > 🧩 講習時間割作成」から開く（chord `g b`）
- データは LocalStorage (`builder.schedule_project` / `builder.schedule_user_defaults`)
- Firebase 同期は **意図的に未対応**（年数回の利用想定では過剰投資）

### 1.2 完成度の体感
| 領域 | 状態 |
|---|---|
| データモデル | 🟢 v3 で ID ベース。並び替え/追加/削除で schedule キーがずれない (C1) |
| 自動生成 (MRV+バックトラック) | 🟢 制約充足は動く・複数案・部分解・Web Worker 化済・externalCounts と日次上限を尊重 (A1) |
| 制約システム | 🟢 純粋関数として `logic/constraints/` に切り出し済 (B3) |
| 状態管理 | 🟢 useReducer + 30+ action types で集約 (C2)、アクションフックは dispatch ラッパ |
| 合同グループ伝播 | 🟢 `utils/combinedPropagation.js` に共通化済 (B1) |
| UI 主要操作 (セル編集・D&D・コピペ・ロック) | 🟢 動く |
| タブ管理 | 🟢 動く |
| Excel 出力 (全体・講師別) | 🟢 動的 import + loading 表示 + エラー文言区別 (A3) |
| JSON 入出力 | 🟢 講師マスタ差分検出付き |
| Undo/Redo | 🟢 max 50 スナップショット |
| 印刷 | 🟢 Toolbar に 🖨️ ボタン + 既存 CSS (A6) |
| エラー通知 | 🟢 load 失敗を toast 通知 (B4) |
| 合同グループ | 🟡 機能・UI ともにあるが実運用検証が浅い |
| オンボーディング | 🔴 初見ユーザ向けガイダンス無し |
| モバイル対応 | 🔴 大画面前提のレイアウト |
| TypeScript 化 | 🔴 未対応 (親アプリは部分的に TS) |
| Firebase 同期 | 🔴 意図的に未対応 |

### 1.3 既存のテスト
合計 **934 件** (timetable-builder 配下は約 257 件、他は親アプリ)
主なファイル:
- `utils/scheduleKey.test.js` (35)
- `utils/combinedPropagation.test.js` (19)
- `utils/excelExport.test.js` (18)
- `logic/autoGenerator.test.js` (23)
- `logic/runGenerator.test.js` (4)
- `logic/constraints/teacherConstraints.test.js` (19)
- `logic/constraints/scheduleConstraints.test.js` (13)
- `hooks/useHistoryStack.test.jsx` (13)
- `hooks/useProject.test.jsx` (36)
- `hooks/projectFactory.test.js` (20)
- `hooks/projectReducer.test.js` (57)

カバー: マイグレーション (v1→v2→v3、混在空配列、範囲外キー drop)・
キー round-trip・MRV 制約・seed 決定性・部分解・合同伝播・cell ops cascade・
LocalStorage 保存・undo/redo・load error 通知・30+ action types の reducer
純粋関数テスト・cascade cleanup (combinedGroups / externalCounts)・
Excel workbook 構築 (hexToArgb / merge / fill / 合同備考)。
**未カバー**: useAnalysis 詳細・UI コンポーネント。

---

## 2. やるべきこと（優先順）

凡例: 🟡 = production 動作にじわっと効く / 🟢 = 品質・保守性

完了項目は ✅ で短縮、未着手 (C 系再設計) は詳細を保持。

---

## A. 増分改善 (全て完了)

- ✅ **A1**: externalCounts を solver の制約に組み込む  
  `project.maxDailyHours` (デフォルト 6) で 1 日あたりコマ数上限を判定。
  未定は対象外。tempDaily は existing 割当 + externalCounts で pre-seed。
- ✅ **A2**: useProject 系フックのテスト追加 (+67 ケース)  
  useHistoryStack / projectFactory / useProject に renderHook テストを整備。
- ✅ **A3**: Excel 出力ボタンに loading state とエラー詳細  
  exportingType state で多重押下防止。動的 import 失敗と Excel 生成失敗を
  toast 文言で区別。
- ✅ **A4**: worker error 経路の重複 toast 回避  
  errored フラグで done.then 側の「条件を見直してください」toast を skip。
- ✅ **A5**: document.title の cleanup  
  Builder アンマウント時に親アプリの title へ復帰。
- ✅ **A6**: Builder 内に印刷ボタンを置く  
  Toolbar.jsx に 🖨️ + window.print() (案 1)。CLAUDE.md の印刷二系統ルール準拠。
- ✅ **A7**: dead code 整理  
  resolveKey 削除。tempDaily は A1 で生きた。useRef は generationRef で使用中。
- ✅ **A8**: ProjectContext.value の useMemo 化  
  state-driving な fields だけを deps に置く。ROADMAP の `[projectState, ...]`
  は毎レンダー object literal が変わるため意図通り効かないので
  `[projectState.project, projectState.saveStatus, analysis, dashboard]` + eslint-disable。

---

## B. 中規模リファクタ (全て完了)

- ✅ **B1**: cell ops の cascade ロジック共通化  
  `utils/combinedPropagation.js` に 3 関数を抽出
  (cleanupOldCombined / propagateAssignment / propagateTeacherChange)。
  handleAssign / handleCellPaste / handleCellClear / handleSwapCells の
  4 箇所が共通呼び出しに。useProject.js は 595 → 479 行 (B1 単独で -116)。
- ✅ **B2**: useProject を 3 つのアクションフックに分割  
  useScheduleActions / useTeacherActions / useSubjectActions に切り出し、
  useProject.js は composer 155 行に。handleSetNg のみ cross-cutting で
  toggleTeacherNg を受け取る。
- ✅ **B3**: 制約システムの拡張可能化  
  `logic/constraints/` に teacherConstraints / scheduleConstraints を新設。
  9 個の純粋関数で既存制約 (NG / クォータ / 重複 / 日次上限) を表現、
  autoGenerator から named function 呼び出しに。「constraints registry」
  までは進めず、register 化は将来必要時の進化形として残す。
- ✅ **B4**: エラーハンドリング統一  
  loadInitialProject の戻り値を `{ project, loadError }` 化、useHistoryStack
  → useProject → BuilderApp を経由して読込失敗を toast 通知。

---

## C. 破壊的再設計（一旦壊した方が良い候補）

### ~~C1~~. ✅ データモデルの ID 化 (Project v3)
完了。config.dates/periods/classes を `{ id, label }` の entity 配列に、
schedule キーを ID ベースに移行。tab-local incremental ID (max+1)。v1→v2→v3
チェーンマイグレーションで既存データを自動変換。NG キー / external キーは
ラベル基準を維持 (タブ横断参照と JSON 可読性のため)。

並び替え・追加・削除で schedule キーがずれない構造が確立。192 箇所の
`makeKey` 参照と 17 ファイルを ID 名 (dateId/periodId/classId) に更新。
scheduleKey.test.js で migrateProject の v1→v3 チェーンを 31 件で検証、
全 898 tests / lint / typecheck / production build pass で挙動等価。

---

### ~~C2~~. ✅ 状態管理を useReducer + action types に
完了。`hooks/projectReducer.js` (485 行) に 30+ action types を純粋関数として
集約、`useHistoryStack` を useReducer ベースに書き換え。3 つのアクションフックは
386 行 → 76 行の dispatch ラッパに。dispatch が stable なので callback も
re-render で identity 不変。pushHistory / setProject は旧 API 互換ラッパとして
残置。projectReducer.test.js で 43 ケース、既存 useProject.test.jsx 36 ケースは
そのまま PASS で挙動等価。

---

### ~~C3~~. ✅ UI のデザインシステム統合
完了。tailwind.config.js に `builder-*` 名前空間で親アプリの `colors` と
同値のトークンを定義し、Builder 配下 18 ファイルの className を muted
パレットに置換。主要 CTA は `builder-primary` (#1a1a2e)、副次アクションは
`builder-blue` (#2e6a9e) を中心に機能差別化を維持。`bg-purple-600` 等の
鮮色は全消滅。BuilderApp バンドル +2.92 kB のみ。

---

### ~~C4~~. ✅ Excel 出力ライブラリの置換
完了。xlsx-js-style (2022-04 以降未更新、31 open issues) から exceljs
(MIT / 活発な保守 / 2024-10 リリース) へ置換。`@e965/xlsx` は SheetJS
Community Edition のスタイル機能を持たないため除外。`utils/excelExport.js`
は ExcelJS API で全面書き換えしつつ、公開 API
(`downloadScheduleExcel` / `downloadTeacherExcel`) は維持。

バンドル変化: gzip 圧縮後 **324 kB → 273 kB (-16%)**、非圧縮は 874 kB →
944 kB (+8%)。dynamic import は維持で BuilderApp 本体 88 kB に影響なし。

**残課題**: 生成された Excel ファイルの視覚的確認 (科目カラー / セル結合 /
罫線 / 列幅・行高) はユーザ環境での手動チェックが必要。

---

## 3. 既知のリスク

### R1. WebWorker のブラウザ互換性
- Vite 6 + `?worker` import は dev/prod 両方で別チャンク化されている（確認済）
- ただし **本番ブラウザでの動作確認は未実施**（GitHub Pages デプロイ後の動作確認が必要）
- CSP の制約で blob URL がブロックされる環境（一部エンタープライズ proxy 等）では worker 起動失敗 → sync fallback に落ちる
- sync fallback は cancel が効かない（Promise executor が同期実行）。本番でこのパスに落ちると巨大データで UI フリーズ

**対策案**:
- 本番デプロイ後にユーザの実環境で「自動生成」を回して動作確認
- sync fallback パスでも要素 yielding を入れる（`await new Promise(r => setTimeout(r, 0))` を for loop の中に）
- worker 起動時に try/catch で wrap し、起動失敗時はユーザに通知

### R2. LocalStorage 容量
- LocalStorage は origin あたり 5MB 上限
- 大規模講習プロジェクト（50 日 × 5 時限 × 10 クラス × 2 タブ + 講師 30 人 + 履歴 50 件）でも数十 KB 程度なので当面安全
- ただし autosave の history が大きいプロジェクトを 50 件保持するとメモリ増加（disk ではなく RAM）

**対策案** (将来):
- 履歴は最大 N 件 or N MB のしきい値で間引き
- IndexedDB 移行（容量制限が緩い）

### ~~R3~~. ✅ xlsx-js-style のメンテ状況
C4 で exceljs に置換済み (活発に保守されている MIT パッケージ)。リスク解消。

### R4. 親アプリの View キー衝突
- 現在 chord は `b` を BUILDER に割当て済み。他に空いているのは `f`, `g`, `i`, `j`, `k`, `l`, `n`, `p`, `q`, `r`, `u`, `x`, `y`, `z` 程度
- 親アプリ側で新ビューを増やす際、Builder の `b` と衝突しないよう注意
- 衝突が起きたら `b` を別キーに移動

---

## 4. 次セッションへの quick start

新しいセッション (Claude or 人間) はここから読めば作業を開始できる。

### 4.1 リポジトリ準備
```bash
cd /home/user/genekibu-kanri/genyakubu-manager
npm ci   # or npm install
npm run dev   # http://localhost:5173/genekibu-kanri/ で起動
```

### 4.2 Builder の構成把握
- メインエントリ: `src/timetable-builder/BuilderApp.jsx`
- 状態管理 (B2 で分割 + C2 で reducer 化):
  - `hooks/projectReducer.js` (純粋 reducer、30+ action types を 1 箇所に集約)
  - `hooks/useProject.js` (composer 151 行)
  - `hooks/useHistoryStack.js` (useReducer + autosave、61 行)
  - `hooks/useScheduleActions.js` (dispatch ラッパ、40 行)
  - `hooks/useTeacherActions.js` (dispatch ラッパ、21 行)
  - `hooks/useSubjectActions.js` (dispatch ラッパ、15 行)
  - `hooks/useJsonIO.js` (JSON I/O)
  - `hooks/projectFactory.js` (load + migrate)
- 制約 (B3 で抽出): `logic/constraints/teacherConstraints.js` / `scheduleConstraints.js`
- 合同伝播 (B1): `utils/combinedPropagation.js`
- 自動生成: `logic/autoGenerator.js` (純粋) + `runGenerator.js` (Worker ラッパ)
- データキー: `utils/scheduleKey.js` (インデックスベース + 旧形式マイグレーション)
- 親への接続点: `src/App.jsx` (lazy import), `src/constants/views.js` (BUILDER),
  `src/constants/chords.js` (b), `src/components/Sidebar.jsx`

### 4.3 検証の標準セット
```bash
npm run lint        # 0 errors / 0 warnings
npm test            # 41 files / 934 tests (timetable-builder 約 257 件)
npm run typecheck   # tsc --noEmit
npm run build       # 警告は excelExport chunk size のみ (期待動作)
```

### 4.4 推奨着手順
ROADMAP の A 系・B 系・C 系すべて完了。新たな改善項目が出てきたら適切な
セクション (A/B/C) に追加して、優先度に応じて着手する。

未着手の改善候補 (1.2 表の 🔴 項目):
- オンボーディング: 初見ユーザ向けガイダンス無し
- モバイル対応: 大画面前提のレイアウト
- TypeScript 化: Builder 配下は未対応 (親アプリは部分的に TS)
- Firebase 同期: 意図的に未対応

### 4.5 やる前に必ず読むべきファイル
- このファイル (ROADMAP.md)
- `genyakubu-manager/CLAUDE.md` 親アプリ側の規約 (印刷の二系統、削除 UX、却下提案)
- `/home/user/genekibu-kanri/CLAUDE.md` リポジトリ全体の規約

### 4.6 やってはいけないこと
- ユーザ行動の統計を LocalStorage に保存して UI を自動変形する系（CLAUDE.md A18 系で明示的に却下されている）
- 印刷システムの統合 (E-2 案、却下済み)
- 削除 UX で `confirmedRemove` が必要なところに `removeWithUndo` を使う

### 4.7 既存 PR / 関連リンク
- PR #116: Phase 1 + Step 2-6 + 校正 J1-J5（ROADMAP 作成前の全作業）
- PR #117: review-jikanwarikun (PR #116 直後のレビュー対応)
- A1-A8 + B1-B4 + C1-C4 は `claude/roadmap-design-progress-InQ1R` ブランチで実装
  (ROADMAP 主要項目 13 件 + 校正レビュー指摘の Critical / High / Medium / Low /
  Nit 対応 完了)
- 校正レビューで発見された修正:
  - Critical: migrateTabV2toV3 の混在空配列 corruption
  - High: combinedGroups / externalCounts の cascade cleanup (3 箇所)
  - Medium: cell/swap source.locked 防御、config/setList の dedupe、
    excelExport テスト追加、renameHeader/bulkAction 正常系テスト追加
- 旧スタンドアロン版の handoff.md: `git show 89e0b25:jikanwarikun-main/handoff.md` で参照可

---

## D. 完成度を上げるための今後の課題 (新規セクション、2026-05-16 追加)

A〜C 系を完了してマージ準備が整った状態で、**「ここから時間割作成ツールを
完成形にしていくための」** 課題を整理する。各項目は **規模 / 価値 /
推奨タイミング** を併記している。スコープは「機能完成度」「テスト」
「パフォーマンス」「再設計レベルの判断」を含む。

### D1. ユーザビリティ / UX

#### D1a. ✅ オンボーディング (2026-05-17 完了)
- **現状**: 初回起動でいきなりスケジュール表が表示される。`grep onboard tutorial welcome firstRun` で 0 ヒット。
- **改善**: 空状態の説明オーバーレイ、または「初回ガイドツアー」。最低限「右クリックで日付/クラス名を変更できる」「⚙️設定で講師・科目を編集」「🧙‍♂️自動作成で MRV+バックトラックの解を試せる」を案内。
- **規模**: 中 / **価値**: 高 / **推奨**: 早期に着手
- **実装**: `OnboardingOverlay.jsx` (5 ステップガイド) + Toolbar の「❓ ヘルプ」ボタンから再表示可能。LocalStorage `builder.onboarding_seen` に 1 bit flag のみ保存 (UI 自動変形は無し、CLAUDE.md の禁止規約に抵触しない)。`role="dialog"` `aria-modal` `aria-labelledby` を付与し D5a の a11y も先取り。Escape / ✕ / 背景クリック / 「始める」のいずれでも閉じる。テスト 10 件 (OnboardingOverlay.test.jsx) + Toolbar.test.jsx に 2 件追加。

#### D1b. 🟠 モバイル / 狭画面対応
- **現状**: Tailwind `md:` breakpoint を使うのは SummaryPanel と ConfigModal の 2 箇所のみ。Toolbar / Header / ScheduleTable は 768px 以下で崩れる。スケジュール表は overflow-auto で横スクロールで対応するが、Toolbar 内のボタン群は折り返さない。
- **改善**: Toolbar の sm 向け折りたたみ、Header の Excel ボタンを dropdown 化、ScheduleTable は max-w を CSS variable で制御。
- **規模**: 中 / **価値**: 中 (主用途は PC だが移動先での確認ニーズあり)

#### D1c. ✅ バリデーション可視化 (2026-05-17 完了 / 一部延期 / 同日 review fix 反映)
- **現状**: Toolbar 進捗バーと「⚠️N件」のみ。「科目クォータ未達」「NG セルに講師ゼロ」「講師 1 日上限近接」などは個別セルにしか出ない。
- **改善**: 「タブごとに残課題件数を表示」「設定モーダル内で『今のままだと解けない制約』を可視化」。
- **規模**: 中 / **価値**: 高 (自動生成失敗時のデバッグが現状辛い)
- **実装 (A + B)**:
  - **A**: TabBar の各タブに `⚠️N` / `✨` badge を表示。`computeTabViolationCounts({tabs, globalUsage})` で全タブの違反件数 (teacherConflict + subjectDup + subjectOver) を集計し、useAnalysis から `analysis.tabErrorCounts` として公開 (M3 review fix で teacherConflict のみ → 3 種別合計に拡張)。
  - **B**: Toolbar の「⚠️N件」を popover 化。`computeViolations({...})` で 4 種別 (teacherConflict / subjectDup / subjectOver / teacherOverDaily) に分解集計し、useAnalysis から `analysis.violations` として公開。popover 内で「→」ボタン押下で該当セルへスクロール (teacherOverDaily も含む / S1 review fix)、種別が teacherConflict のみのときは旧挙動 (即スクロール) を維持。`role="dialog"` + `aria-haspopup` + `aria-expanded` 付き。外側クリック / Escape で閉じる。
  - **C (2026-05-17 追加完了)**: 設定値による静的 infeasibility。`computeInfeasibilities({teachers, commonSubjects, currentConfig, maxDailyHours})` で 2 種別 (noTeacherForSlot / subjectCapacityShortage) を集計し、useAnalysis から `analysis.infeasibilities` として公開。Toolbar popover の最後に「設定の問題」セクションを追加。「未定」を除外して候補を計算するので「全員 NG」「担当者ゼロ」のような実際的なケースを検出。analysisHelpers に +6 件 / Toolbar に +2 件のテスト追加。
- **テスト**: analysisHelpers / Toolbar / TabBar に合計 +18 件追加。
- **同日 review で発覚した修正 (F1 / M1 / M2 / M3 + S1/S2/S3/S5/S6/S7)**:
  - **F1**: OnboardingOverlay で Escape / ✕ / 背景クリックが「次回から表示しない」flag を立てるバグ (初見ユーザが反射的に閉じると永久消失) を修正。flag は「始める」押下時のみ立てる。
  - **M1**: `computeViolations` の teacherOverDaily が `dayKey.indexOf('-')` で date/teacher を split しており日付ラベルや講師名に `-` を含むと壊れる問題を修正。`teachers` 引数で受け取り longest-suffix-match で復元。
  - **M2**: OnboardingOverlay に Tab / Shift+Tab の簡易 focus trap を追加 (aria-modal の宣言と実挙動を一致させる)。
  - **M3**: TabBar badge を「teacherConflict のみ」から「3 種別合計」に拡張 (popover との整合性)。
  - **S1**: teacherOverDaily にも popover 内「→」ボタンを追加 (各 item に firstKey を含める)。
  - **S2**: popover の即スクロール判定を順序依存しない条件式に書き直し。
  - **S3**: `subjectDupFirstKey` を regex parse から `subjectOrders >= 2` の直接探索に変更。仕様変更で「2 個目のセル」へ飛ぶ (超過の起点が分かる UX)。
  - **S5**: Toolbar テストの `Element.prototype.scrollIntoView` を beforeEach/afterEach で保存復元 (mock 漏れ防止)。
  - **S6**: Toolbar の `analysis?.violations` 防御フォールバックを削除 (本番は useAnalysis が必ず渡す)。
  - **S7**: OnboardingOverlay テストの `advanceToLastStep` で STEPS を import し magic number 20 を STEPS.length+1 に。

#### D1d. 🟡 名前付きスナップショット
- **現状**: undo/redo の history はあるが、特定状態を「Pattern A」のように名前付き保存できない。生成結果 3 案も SummaryPanel に居る間だけ。
- **改善**: スロット型の保存・適用 (project レベル or タブレベル)。
- **規模**: 中 / **価値**: 中

#### D1e. 🟡 スケジュール差分ビュー
- **現状**: 自動生成 N 案は SummaryPanel で集計のみ。実セルの違いは適用前後比較しないと見えない。
- **改善**: A/B 案の cell-by-cell diff (色違いハイライト)。
- **規模**: 中 / **価値**: 中

#### D1f. ⚪ ショートカット (既存項目)
- 別記 (CLAUDE.md `A7` / `A8`): Shift+? の実機検証 / ユーザカスタマイズ。本ロードマップでも継続。

---

### D2. テスト網羅性

#### ~~D2a~~. ✅ useAnalysis のテスト (D4e と抱き合わせ)
完了 (2026-05-17)。D4e の純粋関数化と一緒に実施。
`utils/analysisHelpers.test.js` に 18 ケース追加 (computeGlobalUsage 6 /
computeActiveAnalysis 7 / computeDashboard 5)。

#### ~~D2b~~. ✅ UI コンポーネントテスト
完了 (2026-05-17)。Header / Toolbar / ScheduleCell の主要 3 コンポーネントに
testing-library で 28 ケース追加 (Toolbar 9 / Header 9 / ScheduleCell 10)。
ProjectContext / UIContext を Provider で wrap する形で、vi.mock は最小限
(Header の excelExport 動的 import のみ)。ConfigModal 内タブは
useProject 経由のテスト + 一部 BiweeklyTab で既にカバー済みなのでひとまず
対象外。

#### D2c. 🟡 実 Worker 経路のテスト無し
- **現状**: `runGenerator.test.js` は jsdom で sync fallback のみ実行。本番 (`new Worker()` 経由) は untested。cancel・terminate・error メッセージプロトコルが silent regression し得る。
- **改善**: Playwright もしくは vitest browser mode で Worker 動作を E2E。
- **規模**: 中 / **価値**: 中

#### D2d. 🟡 Excel 実バイナリ検証
- **現状**: C4 で `buildScheduleWorkbook` / `buildTeacherWorkbook` の構造テスト 18 件を追加したが、実 xlsx ファイルを開いた時の見栄え (色・罫線・列幅) は手動確認のみ。
- **改善**: exceljs で書き出し → 同じ exceljs で再読込 → round-trip 比較。または Playwright で download → 解凍 → OOXML XML 検証。
- **規模**: 中 / **価値**: 中

---

### D3. パフォーマンス / スケーラビリティ

#### D3a. 🟢 cleanSchedule の O(D×P×C) → O(K) 化
- **現状**: `constants.js:cleanSchedule` は全 (dates × periods × classes) を iterate して valid key Set を作り、schedule を filter。デフォルト 6×3×4=72 だが、ピーク利用で数百になり得る。
- **改善**: 既存 schedule keys を iterate し、entity が存在するか即時判定する方向に反転。
- **規模**: 小 / **価値**: 低〜中

#### D3b. 🟡 solver スケーリング計測
- **現状**: `MAX_ITERATIONS = 500,000`。実データで何コマまでなら数秒以内に解けるか未計測。3 学年 × 7 クラス × 6 日 × 4 時限 ≒ 504 セルあたりが現実上限と思われるが unknown。
- **改善**: ベンチマーク + 必要に応じ部分解戦略の改善 (現状は MRV のみ)。
- **規模**: 中 / **価値**: 中

#### D3c. ⚪ excelExport バンドル削減 (旧 C4 残課題)
- **現状**: 944 kB (gzip 273 kB)。dynamic import で起動には影響無いが、初回 Excel 出力に数百 ms 遅延。
- **改善**: exceljs の Workbook + xlsx writer のみ tree-shake、もしくは OOXML 自前書き出し。
- **規模**: 大 / **価値**: 低 (動的 import で吸収済み)

---

### D4. アーキテクチャ改善 (再設計レベル)

#### D4a. 🟢 schedule キー object 化
- **現状**: 文字列 `"d1-p1-c1"` を `parseKey` で分解。C1 移行で形式は単純化されたが、`parseInt` が走る。
- **改善**: `{dateId, periodId, classId}` の object key (`Map` を使う)。
- **規模**: 大 (192 makeKey 呼び出しすべて touch、C1 と同等)
- **価値**: 低〜中
- **「壊した方が良い」判断**: 現状でほぼ問題無い。文字列 key は localStorage に保存しやすい (object key は JSON 化困難)。**やらなくて良い**寄り。

#### D4b. 🟡 combinedGroups / externalCounts を ID 化
- **現状**: ラベル文字列で参照。今回 (校正対応) で cascade cleanup helper を入れたが、reducer の責務が膨らんだ。
- **改善**: タブ横断の class / teacher / subject ID を導入し、cleanup を不要にする。
- **規模**: 大
- **価値**: 中〜高
- **判断**: ラベル ベースの利点 (JSON 可読性、タブ間で同名クラスが自動共有される) を失う。**ユーザのデータ移植性とのトレードオフ**。「壊す」価値はあるが、慎重に。

#### D4c. 🔴 Tailwind と inline-style の二系統解消
- **現状**: Builder は Tailwind (C3 で `builder-*` トークン化)、親アプリは inline style + `tokens.js`。色値だけは同期したが、styling paradigm は別物。
- **改善**: どちらかに統一。
  - 親を Tailwind 化: 親アプリ全 view 触る。巨大。
  - Builder を inline style 化: Tailwind を Builder から外す。中規模。
- **規模**: 大 / **価値**: 中
- **「壊した方が良い」候補**: 長期 maintenance を考えると統一が望ましい。**但し、親アプリの方針として inline style + tokens.js が確立しているなら、Builder を inline style に書き換える方が一貫性が出る**。決定は別途相談。

#### D4d. 🟡 ScheduleCell.jsx の分解
- **現状**: 137 行。subject select / lock button / teacher select / matrix navigation / conflict 表示 / 合同表示などが 1 コンポーネント内。
- **改善**: SubjectSelect / TeacherSelect / CellLockButton / 別ファイルへ。Navigation は useCellNavigation hook へ。
- **規模**: 中 / **価値**: 中 (可読性 + テスト容易性 = D2b の前提)

#### ~~D4e~~. ✅ useAnalysis の分解
完了 (2026-05-17)。サブフック分割案ではなく、`utils/analysisHelpers.js` に
3 純粋関数 (`computeGlobalUsage` / `computeActiveAnalysis` /
`computeDashboard`) を切り出し、`useAnalysis` 側を 3 段の useMemo に分けて
deps を最小化する形で実現。公開 API は不変なので consumer は無変更。
部分再計算: globalUsage は `project.tabs / combinedGroups / externalCounts`
のみ依存、activeAnalysis は `currentConfig / currentSchedule / globalUsage`、
dashboard は `currentSchedule / currentConfig`。

#### ~~D4f~~. ✅ handleResetAll の reload 回避
完了 (2026-05-17)。新 reducer action `project/reset` を追加し、
useJsonIO.handleResetAll で `loadInitialProject()` を再実行して dispatch
経由で state 初期化する方式に変更。`project/reset` は history も
`[freshProject]` / `historyIndex=0` に初期化するため Undo で reset 前に
戻れない。テスト: `projectReducer.test.js` に 2 ケース、
`useProject.test.jsx` に 2 ケース追加。

#### ~~D4g~~. ✅ cell/setNg と teacher/toggleNg の重複
完了 (2026-05-17)。`cell/setNg` reducer case (23 行) を削除し、
useProject.js の composer 内で `teacherActions.toggleTeacherNg` を呼ぶ
派生 callback として `handleSetNg` を再定義。ContextMenu からの呼び出し
シグネチャ (dateId, periodId, classId) は不変で動作互換。テスト: 旧
`cell/setNg` テスト 2 件を削除し `useProject.test.jsx` の handleSetNg
ブロックに 3 ケース移植 + 拡充。

---

### D5. アクセシビリティ / 国際化

#### D5a. ✅ ARIA / role 属性 (2026-05-17 完了)
- **現状**: `grep "aria-\|role="` で Builder 配下 0 件。スクリーンリーダーに対して構造が全く伝わらない。
- **改善**: 最低限以下を入れる:
  - `<table>` に `<th scope="col">` / `<th scope="row">`
  - ConfigModal に `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
  - selectbox に `aria-label`
  - 進捗バーに `role="progressbar" aria-valuenow={dashboard.progress}`
- **規模**: 中 / **価値**: 中 (法人ユース想定なら必須化する可能性)
- **実装**:
  - **ScheduleTable**: `<table aria-label>` + 列ヘッダ `<th scope="col">` + 日付セル `<th scope="rowgroup" rowSpan>` + 時限セル `<th scope="row" font-normal>`。`<td>` を `<th>` に変えたので font-normal で見栄えは維持。
  - **ConfigModal**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby="builder-config-modal-title"`。Escape / 背景クリック / ✕ ボタン (aria-label="設定を閉じる") で閉じる。
  - **ScheduleCell**: subject / teacher select に `aria-label="${date} ${period} ${class} の科目/講師"`。ロックボタンに `aria-label` + `aria-pressed`。
  - **Toolbar**: 進捗バーに `role="progressbar"` + `aria-valuenow` + `aria-valuemin=0` + `aria-valuemax=100` + `aria-label="完成度"`。
  - **OnboardingOverlay** (D1a で先取り) / **TabBar** badge (D1c で先取り): 既に対応済み。
- **テスト**: ScheduleCell +2 / Toolbar +1 / ConfigModal 新規 4 件、全 349/349 PASS。
- **延期**: 完全な focus trap (Tab で ConfigModal 外に抜けない)、TabBar の `role="tablist"`/`tab` 化は D5b で。

#### D5b. 🟡 キーボード操作の完成度
- **現状**: ScheduleCell に矢印ナビあり (D4d で hook 化候補)。ConfigModal の tab 切り替え (基本/科目/クラス/...) は左右矢印未対応。
- **改善**: 評価表作成 → 不足を補う。
- **規模**: 中 / **価値**: 中

#### D5c. ⚪ 日本語固定 (i18n)
- **現状**: 文言ハードコード。当面ターゲットが日本国内塾なので保留で良い。
- **判断**: 海外展開などの要件が出るまで触らない。

---

### D6. 機能拡張 (新規)

#### D6a. ✅ CSV からの bulk import (講師マスタ MVP / 2026-05-17 完了)
- **現状**: 講師マスタも NG 設定も手入力。初期セットアップ時の負担大。
- **改善**: CSV import (講師名・担当科目 / NG 日時) と、既存 Excel スケジュールからの取り込み。
- **規模**: 中 / **価値**: 高 (新規ユーザの導入障壁を下げる)
- **実装 (MVP: 講師マスタ CSV のみ)**:
  - **utils/csvImport.js**: `parseTeachersCsv(text, { commonSubjects })`。`name,subjects` ヘッダ、subjects は `|` 区切り。RFC4180 風のダブルクォート + エスケープ ("") 対応。空行スキップ、重複 / 空 name はエラー集約、commonSubjects に無い subject は warning。
  - **reducer**: `teacher/import` action を追加。mode='append' (既存に追加、同名は subjects のみ上書きしつつ ng/priority は維持) / mode='replace' (全置換、ng/priority もクリア)。atomic で undo 1 ステップ。
  - **useTeacherActions**: `importTeachers(teachers, mode)` を export。
  - **TeacherManager**: 「📥 CSV インポート」ボタンで折りたたみパネル。textarea + live parse preview (件数 / エラー行 / 未登録科目) + 「追加 / 更新」「全置換」ボタン。replace は confirm ダイアログで誤操作防止。aria-label / aria-expanded 付き。
- **テスト**: csvImport.test.js 新規 12 件 + projectReducer.test.js +3 件 (teacher/import の append / replace / 空配列 no-op)。合計 +15 件、全 372/372 PASS。
- **延期 (将来 D6a 追加)**: NG 日時の CSV import / 既存 Excel スケジュールの取り込み / CSV ファイルドロップ UI (現状は paste のみ)。

#### D6b. 🟡 自動修復 (conflict resolution wizard)
- **現状**: 自動生成が完全解を返せないと部分解 + warning のみ。
- **改善**: 「この conflict を解消するにはこの講師を別の日に動かす必要があります」のような提案。
- **規模**: 大 / **価値**: 中 (制約緩和の意思決定 UI が必要)

#### D6c. 🟡 講師の連続コマ数制約
- **現状**: 1 日合計 `maxDailyHours` のみ。「2 コマ連続 NG」「3 コマ連続後は休憩」のような連続性制約は無い。
- **改善**: teacherConstraints に追加。
- **規模**: 中 / **価値**: 中

#### D6d. 🟡 テンプレート機能 (年度間コピー)
- **現状**: project ごとに完全独立。「去年のテンプレを今年に流用」する正規ルート無し (JSON 保存→読込で代替可)。
- **改善**: テンプレ保存・適用、講師マスタだけ引き継ぎ・スケジュールだけ引き継ぎ、などの options。
- **規模**: 中 / **価値**: 中

#### D6e. ⚪ Firebase 同期 (ROADMAP 既知の「意図的に未対応」)
- **現状**: localStorage 単独運用 (R2)。共有ニーズが顕在化したら検討。
- **判断**: ユースケース次第。組織内共有が要件化したら着手。
- **規模**: 大

---

### D7. 既知の技術的負債

#### D7a. 🟡 TypeScript 化
- **現状**: Builder 配下は JS のみ。親アプリも部分的 TS。
- **改善**: Builder 配下を `.jsx` → `.tsx`、`.js` → `.ts` に。`Project` / `Tab` / `Config` / `ScheduleEntry` / `CombinedGroup` の型定義から始める。
- **規模**: 大 / **価値**: 中
- **判断材料**: D4b / D4e の再設計と同時にやると二度手間にならない。

#### ~~D7b~~. ✅ 印刷システム二系統の文書化
完了 (2026-05-17)。7 ビュー (Dashboard / WeekView / EventCalendarView /
ConfirmedSubsView / MasterView / MonthView / ExcelGridView) のファイル
冒頭に所属系統を 2-5 行のコメントで明記。PrintButton 系と handlePrint
popup 系のどちらに属するか、新しい印刷導線を増やす際に即判断できる。

#### D7c. ⚪ Builder vs 親アプリのテスト共通基盤
- **現状**: Builder は Vitest + testing-library、親も同じ構成だが setup は別。共通 mock / helper があれば便利。
- **規模**: 小 / **価値**: 低

---

### D 系の推奨着手順

| Phase | 着手項目 | 規模 | 効果 |
|---|---|---|---|
| **Quick wins** ✅ 完了 | ~~D4f handleResetAll~~ / ~~D4g cell/setNg 統合~~ / ~~D7b 印刷文書~~ | 小 | 軽量、即効 |
| **Test foundation** ✅ 完了 | ~~D2a useAnalysis~~ / ~~D2b UI components~~ / ~~D4e useAnalysis 分解~~ | 中 | 後続改善の安全網 |
| **UX phase** (2-3 セッション) | D1a オンボーディング / D1c バリデーション可視化 / D6a bulk import / D5a a11y | 中 | ユーザ価値最大 |
| **Code quality** (1-2 セッション) | D4d ScheduleCell 分解 / D3a cleanSchedule O(K) | 中 | 可読性 + 安定性 |
| **Major refactor** (要決断) | D4b 全 ID 化 / D4c styling 統一 / D7a TS 化 / D6e Firebase | 大 | 長期負債解消 |

### D 系の「一旦壊した方が良い」候補

これらは現状動作している部分を **意図的に破壊して作り直す** ことで長期的な
ベネフィットが見込める案件。実施判断は別途相談 (失敗時の影響大):

1. **D4c: Tailwind と inline-style の統一**
   - 二系統が残るのは長期 maintenance の負債。どちらに寄せるかは戦略判断。
   - 推奨: 親アプリの paradigm が確立しているので Builder を inline style 化。
   - リスク: Builder UI を全面書き直し。tailwind.config.js / tailwind.css 削除。

2. **D4b: combinedGroups / externalCounts の完全 ID 化**
   - cascade cleanup helper を撤廃できる。reducer がスリムに。
   - リスク: JSON 出力が人間可読でなくなる、タブ間の自動共有が失われる。
   - 推奨: ユーザがJSON を直接編集することがあるなら見送り。

3. **D7a: TypeScript 化**
   - 上記 D4b / D4e と同時にやれば型と structure を一発で固められる。
   - リスク: Vite/Vitest 設定追加、JSX→TSX 全置換、外部型のインストール。
   - 推奨: D4b / D4e のリファクタが決まったら抱き合わせ。

4. **D6e: Firebase 同期 (ローカル運用からの脱却)**
   - LocalStorage 容量 (R2) の根本解決にも繋がる。
   - リスク: 認証・コンフリクト解決・コスト管理。
   - 推奨: 共有運用ニーズが具体化してから。

---

## E. 完成形へ向けた継続課題 (2026-05-17 追加、UX phase 完了後)

D 系の UX phase (D1a / D1c / D5a / D6a-MVP) 完了をベースに、**「時間割
作成ツールを実運用に耐えるプロダクトとして完成させる」** ための残課題
を整理する。D 系で未完のものは E への pointer に置き換え、加えて今回の
作業を通じて新たに見えた論点を新規番号で並べる。

各項目は **規模 / 価値 / リスク / 推奨タイミング** を併記。「壊す」
候補と「Major refactor」はセクション末でまとめる。

### E1. UX 完成度の残り

#### E1a. 🟠 モバイル / 狭画面対応 (旧 D1b)
- **現状**: Tailwind `md:` breakpoint を使うのは SummaryPanel / ConfigModal の 2 箇所のみ。Toolbar / Header / ScheduleTable は 768px 以下で崩れる。
- **改善**: Toolbar の sm 折りたたみ、Header の Excel ボタン dropdown 化、ScheduleTable の max-w を CSS variable で。
- **規模**: 中 / **価値**: 中 (主用途は PC だが移動先確認のニーズあり)

#### E1b. ✅ キーボード操作完成度 (2026-06-29 完了 / 旧 D5b + D5a 延期分 / ScheduleCell 端動作のみ残)
- **旧現状**: D5a で ConfigModal に `role="dialog"` を入れたが focus trap 未実装で Tab が背景まで抜けた。タブ群も矢印キー非対応。
- **実装**:
  - **hooks/useFocusTrap.js**: OnboardingOverlay のインライン実装をヘルパー化 (E1b の「再利用」指示どおり)。親アプリの `src/hooks/useFocusTrap` と同等 API だが Builder 自己完結のためローカル新設。`trapStack` で入れ子 dialog の LIFO 制御、`enabled` フラグ、マウント時の初期フォーカス + cleanup でのフォーカス復帰。Builder の慣習に合わせ keydown は `window` で捕捉。
  - **OnboardingOverlay**: 自前の Escape/Tab ハンドラ (M2) を `useFocusTrap` 呼び出しに置換 (-30 行)。Escape は従来どおり `dontShowAgain:false` で閉じる (F1 維持)。
  - **ConfigModal**: `useFocusTrap` で focus trap 化。タブ群を `role="tablist"` / `role="tab"` / `role="tabpanel"` + roving tabindex 化、← → / Home / End で切替 (wrap あり)。自前 Escape effect は trap に統合。
  - **TabBar (学年タブ)**: `role="tablist"` / `role="tab"` + aria-selected + roving tabindex、← → / Home / End で `switchTab` (wrap あり)。
- **テスト**: useFocusTrap.test.jsx (新規 6) / ConfigModal index.test.jsx (+5) / TabBar.test.jsx (+5)。OnboardingOverlay の既存 12 件はそのまま PASS で挙動等価。
- **残り (低優先)**: ScheduleCell の矢印ナビの端動作 (端 → 反対端へ wrap?) の統一は別途。

#### E1c. ✅ 名前付きスナップショット (2026-06-29 完了 / 旧 D1d)
- **旧現状**: undo/redo はあるが、特定状態を「Pattern A」のように名前保存できなかった。
- **実装 (タブレベル)**:
  - **data model**: `project.snapshots = [{ id, name, tabId, createdAt, schedule }]`。source tabId を記録し、schedule は deep copy で保持。`createNewProject` / `migrateProject` (後発フィールドとして空配列 default) に追加。
  - **reducer**: `snapshot/save` (アクティブタブを捕捉、id=max+1、空名 no-op) / `snapshot/apply` (記録元タブへ復元 + activeTabId 切替、cleanSchedule、削除済みタブ/不明 id は no-op) / `snapshot/rename` / `snapshot/remove`。`tab/delete` で当該タブの snapshot も掃除。
  - **useProject**: `saveSnapshot(name)` (createdAt は hook 側で付与し reducer の純粋性を維持) / `applySnapshot` / `renameSnapshot` / `removeSnapshot`。
  - **UI**: `SnapshotMenu.jsx` を Toolbar に同梱 (📌 ボタン + popover)。保存 (showInput) / 復元 (showConfirm) / 改名 / 削除 (showConfirm)。アクティブタブのものだけ一覧、件数バッジ、`role="dialog"` + aria 属性、外側クリック/Escape で閉じる。
- **テスト**: projectReducer.test.js (+10) / SnapshotMenu.test.jsx (新規 9) / Toolbar.test.jsx の mock 拡張。
- **設計判断**: undo で戻せるが「復元」「削除」は名前付き資産の上書き/喪失なので confirm を付与。CLAUDE.md の「行動統計で UI 自動変形」禁止には抵触しない (明示的なユーザ保存のみ、自動学習なし)。

#### E1d. ✅ スケジュール差分ビュー (2026-06-29 完了 / 旧 D1e)
- **旧現状**: 実セル差は適用前後を見比べないと分からなかった。
- **実装 (スナップショット比較版)**:
  - **utils/scheduleDiff.js**: 純粋関数 `diffSchedules(from, to)` (セル単位で added / removed / changed を判定、subject+teacher のみ比較し locked は無視、空 subject は未割当扱い、null 安全) + `summarizeDiff(diffs)` (種別件数)。
  - **UI**: SnapshotMenu の各スナップショット行に「🔍 差分」トグルを追加。押すと「このスナップショット → 現在の状態」の差分を ＋N（追加・緑）／－N（削除・赤）／≠N（変更・橙）のサマリ + セル一覧 (日付 時限 クラス: 旧→新、最大 30 件 + 他 N 件) で表示。`aria-pressed`、popover を閉じると比較状態もリセット。
- **テスト**: scheduleDiff.test.js (新規 10) / SnapshotMenu.test.jsx (+3 比較操作)。
- **延期**: 自動生成 N 案どうしの diff、ScheduleTable 上での直接ハイライト (rowSpan/sticky との兼ね合いで重いので別途)。

#### E1e. 🟠 色覚 / コントラスト WCAG AA 準拠 (新規)
- **現状**: `builder-*` トークン化 (C3) で見た目は統一されたが、コントラスト比は未測定。「⚠️N件」の赤背景 / 「✨ OK」の緑文字 / 科目カラーが背景の薄色など、AA (4.5:1) を満たすか不明。
- **改善**: axe-core / Lighthouse の audit を入れて全配色を検証、未達のトークンを調整。focus ring も色弱対応 (現状 builder-blue 系の単色)。
- **規模**: 中 / **価値**: 中 (法人ユースで必須化の可能性)

#### E1f. 🟡 タッチ操作対応 (新規)
- **現状**: DnD ベース。長押しコンテキストメニュー無し。タッチ右クリック (= 長押し) は OS 依存。
- **改善**: 長押しジェスチャ → ContextMenu open、ピンチズーム抑止、ボタンの最低タップ領域 44px。E1a (モバイル) とセットで。
- **規模**: 中 / **価値**: 中

#### E1g. ✅ エラー時の修正提案 (2026-06-29 完了 / D1c-C の延長)
- **旧現状**: D1c-C で infeasibility を検出するが、解決のヒントは無かった。
- **実装**:
  - **utils/fixSuggestions.js**: 純粋関数 `suggestForNoTeacher(item, ctx)` (担当講師未登録 → 登録 / 手動 NG → 該当時限の NG 解除〔名前入り〕/ 別時限で担当可 → 移動。自動 NG も候補から除外) + `suggestForCapacity(item, ctx)` (講師を あと N 名 / 1 日上限を X→Y に / コマ数を減らす) + `buildFixSuggestions(infeasibilities, ctx)` (各 item に `suggestions[]` を非破壊で付与)。
  - **useAnalysis**: `computeInfeasibilities` の結果を `buildFixSuggestions` で包んで公開 (deps 不変)。
  - **Toolbar**: popover「設定の問題」の各項目の下に 💡 修正提案を箇条書き表示。
- **テスト**: fixSuggestions.test.js (新規 11) / Toolbar.test.jsx (+1)。
- **延期**: 提案のワンクリック自動適用は E2b (修復 wizard) で扱う。ここまでは提示のみ。

#### E1h. ⚪ 印刷スタイル微調整 (新規)
- **現状**: 2 系統の印刷経路 (CLAUDE.md 印刷ルール参照) で運用中。MonthView / ExcelGridView は popup 方式、その他は `window.print()`。
- **改善**: 紙面ヘッダの日付フォーマット統一、改ページ制御 (`break-inside: avoid`)、ロックセルのハッチングが薄すぎないか確認。
- **規模**: 小 / **価値**: 低〜中

---

### E2. 機能拡張

#### E2a. 🟡 CSV インポートの拡張 (旧 D6a の続き / 一部完了)
- **現状**: 講師マスタの CSV import は paste + ✅ ファイル選択 / ドラッグ&ドロップ 対応済 (2026-06-29)。
- **✅ 完了分 (ファイル取り込み)**: TeacherManager の CSV パネルに「📂 ファイルを選択」(hidden `<input type="file" accept=".csv,...">`) と textarea へのドラッグ&ドロップを追加。`readCsvFile` が `file.text()` で読み取り → 既存の `csvText` → parse → preview フローに合流。非 CSV 拡張子はエラー toast でガード、ドラッグ中は枠をハイライト。テスト: TeacherManager.test.jsx 新規 3 件 (選択 / D&D / 非 CSV ガード)。
- **残り (優先順)**:
  - NG 日時 CSV (`teacher,date,period` 形式) で ngSlots を一括設定
  - 既存 Excel スケジュール (旧 winter_schedule .xlsx) からセル全体を取り込み (要 mapping UI)
  - subjectCounts / classes 等の config も CSV 化
- **規模**: 中〜大 / **価値**: 高 (新規ユーザ全体の体験を底上げ)

#### E2b. 🟡 自動修復 wizard (旧 D6b / MVP 完了 2026-06-29)
- **現状**: E1g の修正提案のうち、機械的に確実なものはワンクリック適用できる。
- **✅ 完了分 (提案のワンクリック適用)**: `fixSuggestions` の提案を `{ text, action? }` 構造化。action 付きの提案には Toolbar popover で「適用」ボタンを出す。対応アクション: `releaseNg` (該当講師の手動 NG を解除 → toggleTeacherNg) / `setMaxDaily` (1 日コマ数上限を必要値へ → updateGenerationParams)。適用は単発の dispatch なので Undo で戻せる。テスト: fixSuggestions (action 構造) / Toolbar (+2 適用経路)。
- **残り**: schedule そのものを動かす提案 (「この講師を別の日へ」「この科目を別クラスへ」) の自動適用と、適用 / スキップ / カスタム編集のウィザード化。これは制約緩和の意思決定 UI が必要で規模大。
- **規模**: 大 / **価値**: 中

#### E2c. ✅ 講師の連続コマ数制約 (2026-06-29 完了 / 旧 D6c)
- **旧現状**: 1 日合計 `maxDailyHours` のみ。連続性の制約は無かった。
- **実装**:
  - **teacherConstraints**: 純粋関数 `wouldExceedConsecutive({ periodsOrder, periodId, isOccupied, maxConsecutive })`。置こうとする時限を含む連続ランの長さが上限を超えるか判定。`maxConsecutive <= 0` は制限なし。
  - **autoGenerator**: solver の daily limit チェックの直後に呼ぶ。`isOccupied(periodId)` は「その日のその時限に当該講師が居るか」を全クラス走査で判定。`未定` (DAILY_LIMIT_EXEMPT_TEACHER) は対象外。`project.maxConsecutivePeriods ?? 0`。
  - **constants / reducer / UI**: `DEFAULT_MAX_CONSECUTIVE_PERIODS = 0` + bounds {0..8}、`resolveGenerationParams` / `project/setGenerationParams` に追加、GenerationSettings (⚡自動生成タブ) に「講師の連続コマ数上限 (0 = 制限なし)」の input/slider。
- **テスト**: teacherConstraints.test.js (+5) / autoGenerator.test.js (+3 制限0で3連続OK・上限2で不成立・未定は対象外) / constants / GenerationSettings / projectReducer に各追記。
- **既定値 0 で従来挙動を維持** (オプトイン)。

#### E2d. ✅ テンプレート機能 (年度間コピー) (2026-06-29 完了 / 旧 D6d)
- **旧現状**: 去年 → 今年の流用は JSON 保存→読込でしか代替できなかった。
- **実装**:
  - **utils/templates.js**: 純粋関数 `buildTemplatePayload` (snapshots を除外し deep copy) / `addTemplate` (id max+1) / `removeTemplate` + localStorage I/O ラッパ `loadTemplates` / `persistTemplates` (壊れたデータは空配列フォールバック)。保存先は `STORAGE_KEY_TEMPLATES` (project state とは独立)。
  - **useProject**: `applyTemplateFull(payload)` (migrate + cleanSchedule → project/replace、Undo 可)。「講師マスタのみ」は既存 `importTeachers(..., 'replace')` を再利用。
  - **UI**: ConfigModal に「🗂 テンプレート」タブ。保存 / 一覧 (作成日・講師数・タブ数) / 「全体を適用」/「講師のみ」/ 削除。適用は confirm + Undo 可能。
- **テスト**: templates.test.js (新規 8) / TemplateManager.test.jsx (新規 7)。
- **延期**: 「スケジュールだけ引き継ぎ」「カレンダー構成だけ」等の細粒度オプションは未実装 (全体 / 講師のみ の 2 択)。

#### E2e. ✅ 生成パラメータ UI 化 (2026-06-29 完了)
- **旧現状**: `NUM_PATTERNS = 3` (BuilderApp.jsx hardcoded), `MAX_ITERATIONS = 500_000` (autoGenerator.js hardcoded), `DEFAULT_MAX_DAILY_HOURS = 6` (project.maxDailyHours で上書き可だが UI 無し)。
- **実装**:
  - **constants.js**: 3 パラメータのデフォルト (`DEFAULT_NUM_PATTERNS` / `DEFAULT_MAX_DAILY_HOURS` / `DEFAULT_MAX_ITERATIONS`) と許容範囲 `GENERATION_PARAM_BOUNDS`、`clampGenerationParam(key, value)` (NaN→min, 四捨五入, clamp)、`resolveGenerationParams(project)` を追加。autoGenerator.js のローカル定数はこれを import する形に統一。
  - **autoGenerator.js**: `generateSinglePattern` が `project.maxIterations ?? MAX_ITERATIONS` を読み、`solve` の探索上限に反映。`generateSchedule` の numPatterns デフォルトも定数化。
  - **reducer**: `project/setGenerationParams` action (部分更新 + clamp + 値不変なら同一参照 no-op)。`useProject.updateGenerationParams({ numPatterns?, maxDailyHours?, maxIterations? })` で公開。
  - **BuilderApp**: `NUM_PATTERNS` を `resolveGenerationParams(project).numPatterns` に。
  - **GenerationSettings.jsx**: ConfigModal に「⚡ 自動生成」タブを新設。number input + range slider + 説明文 + 「既定値に戻す」。
- **テスト**: constants.test.js (新規 10) / projectReducer.test.js (+5) / GenerationSettings.test.jsx (新規 6) / autoGenerator.test.js (+3 maxIterations)。
- **延期**: maxIterations の advanced 折りたたみ化は不要と判断 (3 つとも常時表示)。

#### E2f. 🟡 自動生成中の進捗詳細 (一部完了 — cancel 2026-06-29)
- **現状**: `current/total` (パターン数) のみ。「どのセルで詰まっているか」「backtrack 回数」「経過時間」は依然不可視。
- **✅ 完了分 (cancel)**: 生成中に Toolbar へ「✕ 中止」ボタンを表示 (`BuilderApp.handleCancelGenerate` → `generationRef.current` を null 化して done.then の state 更新を skip → `handle.cancel()` → isGenerating 解除 + warning toast)。既存セルは保持。Toolbar.test.jsx に +2 件。
- **残り**: Worker から進捗イベントを増やし、進捗ボタンクリックで「詳細パネル」(詰まっているセル / backtrack 回数 / 経過時間)。
- **規模**: 中 / **価値**: 中 (大規模 project で生成時間が読めない問題の解消)

#### E2h. ✅ 生成案の負荷偏り表示 (2026-06-29 完了)
- **背景**: 完全解は全て 100% 充填なので、複数案から採用案を選ぶ主な差別化点は講師コマ数の均等さ。
- **実装**: `utils/patternLoad.js` の純粋関数 `summarizePatternLoad(totals)` (最多 / 最少 / spread / teacherCount、0 コマ除外、null 安全)。SummaryPanel の各案集計ヘッダに「最多 X / 最少 Y (偏り Z)」を中立表示 (spread 0 は緑)。「最良」の自動判定はしない (priorityClasses 等で意図的に偏らせるケースがあるため)。
- **テスト**: patternLoad.test.js 新規 6 件。

#### E2g. ⚪ 履歴ブランチング (新規)
- **現状**: undo/redo は単線。新しい操作をすると redo 履歴は破棄される (一般的な動作)。
- **改善**: 分岐履歴を保持し「履歴ツリー」として可視化。E1c (名前付きスナップショット) と組み合わせれば「試行錯誤の枝」として残せる。
- **規模**: 大 / **価値**: 低〜中 (一般ユーザには複雑かも)

---

### E3. テスト / 信頼性

#### E3a. 🟡 実 Worker 経路の E2E (旧 D2c)
- **現状**: `runGenerator.test.js` は jsdom で sync fallback のみ。本番 (`new Worker()`) は untested。cancel・terminate・message protocol が silent regression し得る。
- **改善**: Playwright で実 Chromium に load → 「自動生成」クリック → 結果アサート。または vitest browser mode。
- **規模**: 中 / **価値**: 中

#### E3b. 🟡 Excel 出力のバイナリ検証 (旧 D2d)
- **現状**: 構造テスト 18 件 (C4) はあるが、実 xlsx を開いた時の見栄え (色・罫線・列幅) は手動確認。
- **改善**: exceljs 書き出し → 再読込 round-trip 比較、または Playwright で download → 解凍 → OOXML XML 検証。
- **規模**: 中 / **価値**: 中

#### E3c. 🟡 印刷出力スナップショット (新規)
- **現状**: 印刷 2 系統 (CLAUDE.md) を維持しているが、実出力は手動確認のみ。CSS や DOM 変更で気付かず崩れる。
- **改善**: Playwright で `page.pdf()` → PDF を画像化 → pixelmatch / VRT。少なくとも 7 ビュー × 1 サンプルずつ。
- **規模**: 中 / **価値**: 中 (印刷バグは現場でしか発覚しない)

#### E3d. ✅ project JSON 読込時の schema バリデーション (2026-06-29 完了)
- **旧現状**: `loadInitialProject` は JSON.parse 失敗のみ捕捉。schema 違反 (`tabs` / `config.dates` が配列でない等) は migrate / downstream で crash しうる。
- **実装**:
  - **utils/projectSchema.js**: 純粋関数 `validateProjectShape(obj)` → `{ valid, error }`。致命的な構造崩れ (tabs 非配列/空・config 欠落・dates/periods/classes 非配列・subjectCounts 非オブジェクト・teachers 非配列・schedule 非オブジェクト) のみ検出。任意フィールドの欠落は migrate が default 補完するので見ない。zod 等の依存は足さず手書き (バンドル増ゼロ)。
  - **projectFactory.loadInitialProject**: parse 後・migrate 前に validate。不正なら throw → 既存 catch でフォールバック default + loadError → 起動時 toast。
  - **useJsonIO.handleLoadJson**: ファイル取り込みでも validate。不正なら適用せず error toast。
- **テスト**: projectSchema.test.js (新規 10) / projectFactory.test.js (+2 fallback)。
- **判断**: 手書きバリデータで十分 (構造チェックのみ)。値レベルの厳密検証 (例: id の一意性) は過剰なので入れない。

#### E3e. 🟡 ConfigModal sub-components のテスト (新規, D2b 除外分)
- **現状**: D2b で「ConfigModal 内タブは useProject 経由のテスト + BiweeklyTab で間接カバー済み」として除外。
- **改善**: TeacherManager (CSV import 含む) / BasicSettings / AbsenceNgPanel (旧 NgSettings + ExternalCounts を統合した 1000 行コンポーネント) / CombinedGroupSettings に直接の UI テストを追加。D5a で a11y 属性追加分の回帰もここで捕捉。
- **規模**: 中 / **価値**: 中

#### E3f. ⚪ 視覚回帰テスト (新規)
- **現状**: 無し。
- **改善**: Chromatic / Percy / Playwright snapshot で主要 view のスクリーンショット VRT。
- **規模**: 中 / **価値**: 低〜中 (UI 変更が多くないので overkill かも)

#### E3g. ⚪ クロスブラウザ E2E (新規)
- **現状**: Chromium のみ手動確認。Safari / Firefox の WebWorker / LocalStorage 挙動は未検証 (R1)。
- **改善**: Playwright で 3 ブラウザ × 主要シナリオを走らせる。
- **規模**: 中 / **価値**: 中

---

### E4. パフォーマンス / スケーラビリティ

#### E4a. ✅ cleanSchedule O(K) 化 (2026-06-29 完了 / 旧 D3a)
- **旧現状**: 全 (dates × periods × classes) を展開して valid key Set を作り filter (O(D×P×C + K))。
- **実装**: date/period/class の ID Set を作り (O(D+P+C))、既存 schedule キーを `parseKey` で分解して存在判定する方向に反転 (O(D+P+C + K))。挙動は等価 (不正キーは破棄、消滅 entity 参照は破棄)。constants.js が `scheduleKey.parseKey` を import (scheduleKey 側は無 import で循環なし)。
- **テスト**: constants.test.js に cleanSchedule の 4 ケース追加 (有効キー保持 / 消滅 entity 破棄 / 不正形式破棄 / 複数タブ独立)。

#### E4b. 🟡 solver スケーリング計測 (旧 D3b)
- **現状**: `MAX_ITERATIONS = 500_000`。何コマまでなら数秒以内に解けるか未計測。
- **改善**: ベンチマーク (大規模 fixture を作って autoGenerator を走らせ ms 計測) + 必要に応じ部分解戦略の改善。
- **規模**: 中 / **価値**: 中

#### E4c. ⚪ excelExport バンドル削減 (旧 D3c)
- **現状**: 944 kB (gzip 273 kB)。dynamic import で起動には影響無いが、初回 Excel 出力に数百 ms 遅延。
- **改善**: exceljs の Workbook + xlsx writer のみ tree-shake、または OOXML 自前。
- **規模**: 大 / **価値**: 低 (動的 import で吸収済み)

#### E4d. 🟡 useAnalysis 再計算プロファイル (新規)
- **現状**: useAnalysis は 5 段 useMemo (D4e + D1c で追加)。`project.tabs` が変わると `globalUsage` / `tabErrorCounts` 両方が再計算。タブ数 / セル数が増えた時の hot path を計測していない。
- **改善**: React Profiler で 100 操作分の reflow を記録し、ボトルネックがあれば WeakMap キャッシュや selective recompute 化。
- **規模**: 小〜中 / **価値**: 中

#### E4e. ⚪ React 19 / Compiler 移行検討 (新規)
- **現状**: 手書きの useMemo / useCallback / Context value memo (CLAUDE.md 別記載なし)。
- **改善**: React Compiler が安定したら手書き最適化を外して compiler に任せる。useAnalysis の 5 段 memo がシンプルになる可能性。
- **規模**: 大 / **価値**: 中 (依存ライブラリの追従次第)

#### E4f. ⚪ 大規模 schedule の virtualization (新規)
- **現状**: ScheduleTable は全セルを DOM に出す。3 学年 × 7 クラス × 6 日 × 4 時限 = 504 セル + 講師 select で各セル 3 要素 → 1500+ ノード。スマホで重い。
- **改善**: react-window 等で virtualize。ただし sticky thead / rowSpan / 矢印ナビとの相性が悪く実装難。
- **規模**: 大 / **価値**: 低〜中

---

### E5. アーキテクチャ (再設計 / 「壊す」候補)

#### E5a. 🟢 schedule キー object 化 (旧 D4a)
- **現状**: 文字列 `"d1-p1-c1"` を `parseKey` で分解。
- **改善**: `Map<{dateId, periodId, classId}, Entry>` に。
- **判断**: 文字列 key は localStorage 直接 JSON 化できるメリット。**やらない寄り**。

#### E5b. 🟡 combinedGroups / externalCounts の完全 ID 化 (旧 D4b)
- **現状**: ラベル文字列で参照。cascade cleanup helper で吸収済みだが reducer の責務が膨らんだ。
- **改善**: タブ横断の class / teacher / subject ID 導入で cleanup 不要に。
- **規模**: 大 / **価値**: 中〜高 / **「壊す」候補**

#### E5c. 🔴 Tailwind と inline-style の二系統解消 (旧 D4c)
- **現状**: Builder Tailwind / 親アプリ inline+tokens.js。色は同期したが paradigm が違う。
- **規模**: 大 / **価値**: 中 / **「壊す」候補** (親に寄せて Builder を inline 化が推奨)

#### E5d. 🟡 ScheduleCell.jsx の分解 (旧 D4d)
- **現状**: 137 行。subject/teacher select / lock / matrix navigation / conflict 表示 / combined 表示が同居。
- **改善**: SubjectSelect / TeacherSelect / CellLockButton 分離 + `useCellNavigation` hook。
- **規模**: 中 / **価値**: 中 (E3e の UI テスト容易性 UP)

#### E5e. 🟡 TypeScript 化 (旧 D7a)
- **現状**: Builder 配下は JS。Project / Tab / Config / ScheduleEntry / CombinedGroup の型定義が無いため、reducer や analysisHelpers のリファクタが reflective に進めにくい。
- **改善**: `.jsx` → `.tsx`、型定義を `types/` に。E5b と同時実施で「型と structure を一発で固める」のがベスト。
- **規模**: 大 / **価値**: 中〜高 / **「壊す」候補**

#### E5f. ⚪ state management ライブラリ検討 (新規)
- **現状**: useReducer + Context + 手書き useMemo (CLAUDE.md にも記載) で re-render を抑えている。
- **改善**: Zustand / Jotai / Redux Toolkit に置き換えて selector ベースの purity / devtools 統合を得る。
- **判断**: 動いているものを置き換えるコストが高い。**「壊す」候補だが優先度低**。

#### E5g. 🟡 project schema v4 migration path 設計 (新規)
- **現状**: v1→v2→v3 の migration は `migrateProject` で実装済み。v4 (combinedGroups の ID 化 / teacher 安定 ID 等) を入れる時のテンプレートを決めておきたい。
- **改善**: 「version up はリリースの最後に 1 度だけ」「migration は順次関数合成」「失敗時 fallback は前 version」のルール化。
- **規模**: 小 (設計のみ) / **価値**: 中

#### E5h. ⚪ Worker への analysis 移動 (新規, 「壊す」候補)
- **現状**: useAnalysis は main thread。大規模 schedule で UI スレッドを止める潜在リスク。
- **改善**: analysisHelpers を Worker に移し、`postMessage` で結果を返す。autoGenerator Worker と共通基盤。
- **規模**: 大 / **価値**: 低〜中 / **「壊す」候補** (現状 60fps を割っていないので effort 過剰の可能性)

---

### E6. データ管理 / コラボ

#### E6a. ⚪ Firebase 同期 (旧 D6e, 「壊す」候補)
- **現状**: LocalStorage 単独 (R2)。
- **改善**: Firestore / Supabase 同期で複数デバイス + R2 解決。
- **規模**: 大 / **価値**: 高 (組織内共有が要件化した時) / **「壊す」候補**

#### E6b. ⚪ 複数ユーザー同時編集 (新規)
- **現状**: 想定外。
- **改善**: OT (Operational Transform) or CRDT (yjs/automerge) で同時編集 + コンフリクト解決。
- **規模**: 超大 / **価値**: 条件付き高 (E6a の延長)

#### E6c. ✅ LocalStorage 容量監視 (2026-06-29 完了 / R2 の能動管理)
- **旧現状**: R2 で「ピーク 12 KB 程度」と評価済みだが運用中の実値モニタリング無し。
- **実装**:
  - **utils/storageHealth.js**: 純粋関数 `estimateStorageBytes(value)` (UTF-16 想定で `length*2`、直列化不能/循環は 0) / `checkStorageHealth(project, {limitBytes, warnRatio})` → `{ bytes, ratio, warn }` (デフォルト 5MB の 50%) / `formatBytes` (B/KB/MB)。0 除算ガード付き。
  - **BuilderApp**: マウント時 1 回だけ `checkStorageHealth(project)` を評価し、warn なら概算サイズ付きの warning toast (スナップショット/タブ整理 + JSON バックアップを案内)。逐次変化では再警告しない。
- **テスト**: storageHealth.test.js (新規 13)。
- **判断**: 通常運用 (~12KB) では発火しない閾値 (2.5MB) なので false-positive なし。履歴は RAM 保持 (R2) なので測定対象は project 本体のみで十分。

#### E6d. ✅ 同一ブラウザ複数タブの競合検出 (2026-06-29 完了)
- **旧現状**: 同 project を 2 タブで開くと localStorage を相互に上書きする可能性 (debounce 経由)。
- **実装**:
  - **utils/tabPresence.js**: 純粋関数 `interpretPresenceMessage(msg, selfId)` → `{ conflict, shouldAck }` (hello/ack のみ解釈、自分発・不正メッセージは無視)。チャネル名定数 `TAB_PRESENCE_CHANNEL`。
  - **hooks/useTabPresence.js**: マウント時に `BroadcastChannel` で `hello` を broadcast。既存タブは受信して `ack` 返信 + 警告、新規タブは `ack` 受信で警告。`onConflict` はセッション中 1 回のみ (warned フラグ)。BroadcastChannel 非対応環境 (古いブラウザ/jsdom) は完全 no-op。`onConflict` は ref 経由で effect 再貼り付けを回避。
  - **BuilderApp**: `useTabPresence` で競合時に warning toast (「1 つのタブに絞ることを推奨」)。
- **テスト**: tabPresence.test.js (新規 7) / useTabPresence.test.jsx (新規 4、FakeBroadcastChannel で 2-3 タブを模擬)。
- **延期**: `navigator.locks` による排他取得や project ID 単位の判定は未実装 (現状は「Builder を複数タブで開いた」を検出する粒度)。

---

### E7. AI 活用 (新規領域)

CLAUDE.md の **A18 系 (使用頻度ベース自動変形禁止)** に抵触しないよう、AI
提案は **ユーザ操作で発火する明示的なもの** に限定する (操作履歴からの
自動学習・自動配置は対象外)。

#### E7a. ⚪ 自然言語制約入力
- **現状**: NG / priorityClasses は UI で 1 件ずつ設定。
- **改善**: 「月曜 1 限は田中先生 NG」「３A クラスは英語を優先的に堀上先生に」を自然言語で入力 → LLM で `toggleTeacherNg` 等の action 列に変換 → preview → 適用。
- **規模**: 中〜大 / **価値**: 中 (初心者ユーザにとっての導入障壁を下げる)
- **判断**: API コスト / レイテンシ / privacy (講師名を外部送信) を考慮。社内 ollama 等の選択肢も。

#### E7b. ⚪ 自動生成失敗時の緩和提案 (E2b の AI 版)
- **現状**: 部分解 + warning のみ。
- **改善**: 「英語クォータを 4→3 に減らす」「未定講師を 1 人増やす」等の選択肢を LLM が生成。
- **規模**: 大 / **価値**: 中

#### E7c. ⚪ 過去パターンからの初期化提案 (要規約確認)
- **現状**: テンプレート (E2d) は手動。
- **改善**: 「過去 project と新 project の差分を見て、流用可能なセルを提案」型。**ユーザがボタンを押した時のみ**動作するなら CLAUDE.md A18 に抵触しない。
- **判断**: 自動学習 / 自動配置 / アクセス頻度の自動反映は禁止条項なので、設計時に明示的にユーザ発火型として実装する。

---

### E8. ドキュメント

#### E8a. 🟡 ユーザーマニュアル
- **現状**: 無し。README は開発者向けのみ。
- **改善**: 「初回セットアップ」「自動生成の使い方」「Excel 出力」等の操作ガイド。Markdown + スクリーンショット。配布方法は `docs/` または GitHub Pages。
- **規模**: 中 / **価値**: 中 (E1g の修正提案や onboarding と併用)

#### E8b. 🟡 開発者ガイド (アーキテクチャ図 / データフロー)
- **現状**: ROADMAP.md + CLAUDE.md + コード冒頭コメントに散在。
- **改善**: `docs/architecture.md` に Mermaid 図で「project → reducer → hooks → contexts → components」と「solver pipeline」を可視化。
- **規模**: 小 / **価値**: 中

#### E8c. ⚪ スクリーンキャスト / GIF
- **現状**: 無し。
- **改善**: 主要操作を 30 秒 GIF で。README / オンボーディング再生にも使える。
- **規模**: 小 / **価値**: 低〜中

#### E8d. ⚪ ROADMAP の整理
- **現状**: A/B/C (完了済) + D + E が並走。長大化。
- **改善**: D 系を A/B/C と同じく折りたたみ表記にし、E 系を main トラックに。
- **規模**: 小 (ドキュメント整形のみ)

---

### E 系の推奨着手順

| Phase | 着手項目 | 規模 | 効果 |
|---|---|---|---|
| **UX 仕上げ** | E1b (キーボード完成) / E1e (コントラスト) / E1g (修正提案 MVP) | 中 | a11y/UX を spec 水準に |
| **データ堅牢化** | E3d (schema validation) / E6c (容量監視) / E6d (タブ競合検出) | 小〜中 | 実運用での事故予防 |
| **テスト深化** | E3a (Worker E2E) / E3e (Config sub-tests) / E3b (Excel 検証) | 中 | 触っても壊れない基盤 |
| **機能拡張** | E2a (CSV 拡張) / E2e (生成 param UI) / E2b (修復 wizard) | 中〜大 | 新規ユーザ獲得 + 上級者対応 |
| **モバイル対応** | E1a (狭画面) / E1f (タッチ) | 中 | 移動先確認の体験 |
| **Major refactor (要決断)** | E5e (TS) → E5b (ID 化) → E5c (style 統一) | 大 | 長期負債解消、5 年後の自分 |
| **新領域 (要 PM 判断)** | E6a (Firebase) / E7a (NL 制約) / E7b (緩和提案) | 大 | プロダクト方向性の選択 |

### E 系の「一旦壊した方が良い」候補

| # | 項目 | 推奨アプローチ | リスク |
|---|---|---|---|
| **E5e** | TypeScript 化 | Builder 配下を `.tsx` 化、型定義を `types/` に集約。E5b と抱き合わせ | Vite/Vitest 設定追加、外部型のインストール |
| **E5b** | combinedGroups / externalCounts 完全 ID 化 | E5e と一緒に。reducer の cascade cleanup を撤廃 | JSON 出力が人間可読でなくなる、タブ間自動共有が失われる |
| **E5c** | Tailwind / inline-style 統一 | 親アプリの paradigm に合わせ Builder を inline 化 | Builder UI 全面書き直し |
| **E6a** | Firebase 同期 | LocalStorage は cache レイヤとして残し sync は subscribe 型 | 認証 / コンフリクト / コスト |
| **E5h** | analysis の Worker 化 | postMessage で結果を返す。autoGenerator と共通基盤 | UI 60fps を割っていないなら effort 過剰 |
| **E5f** | state management ライブラリ | Zustand へ部分置換から | 動いているものを置き換えるコスト |

優先度判断の目安:
- **必ずやる**: E5e (TS) → 残りすべての refactor の前提
- **やる価値が高い**: E5b (ID 化) → reducer 簡略化、E5c (style 統一) → 長期 maintenance
- **要件次第**: E6a (Firebase) → 共有ニーズが顕在化したら
- **慎重に判断**: E5f / E5h → 動作優先で見送りもアリ

---

- 各項目を実装したら ✅ を付けて短縮する (詳細は commit message とコードのコメントに残す)
- 新たに発見された問題は適切なセクション (A/B/C/D/E) に追加
- リスク (R*) は実害が出たり対策が完了したら更新
- 「次セッション quick start」のコマンドと検証数値 (test 件数等) は変わったら追従
