# 講習時間割作成 (timetable-builder) 今後のロードマップ

最終更新: 2026-05-17 / A1-A8 + B1-B4 + C1-C4 + D-Quick wins (D4f/D4g/D7b)
+ D-Test foundation (D2a + D2b + D4e) 完了

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

#### D1a. 🟠 オンボーディング無し
- **現状**: 初回起動でいきなりスケジュール表が表示される。`grep onboard tutorial welcome firstRun` で 0 ヒット。
- **改善**: 空状態の説明オーバーレイ、または「初回ガイドツアー」。最低限「右クリックで日付/クラス名を変更できる」「⚙️設定で講師・科目を編集」「🧙‍♂️自動作成で MRV+バックトラックの解を試せる」を案内。
- **規模**: 中 / **価値**: 高 / **推奨**: 早期に着手

#### D1b. 🟠 モバイル / 狭画面対応
- **現状**: Tailwind `md:` breakpoint を使うのは SummaryPanel と ConfigModal の 2 箇所のみ。Toolbar / Header / ScheduleTable は 768px 以下で崩れる。スケジュール表は overflow-auto で横スクロールで対応するが、Toolbar 内のボタン群は折り返さない。
- **改善**: Toolbar の sm 向け折りたたみ、Header の Excel ボタンを dropdown 化、ScheduleTable は max-w を CSS variable で制御。
- **規模**: 中 / **価値**: 中 (主用途は PC だが移動先での確認ニーズあり)

#### D1c. 🟠 バリデーションの可視化不足
- **現状**: Toolbar 進捗バーと「⚠️N件」のみ。「科目クォータ未達」「NG セルに講師ゼロ」「講師 1 日上限近接」などは個別セルにしか出ない。
- **改善**: 「タブごとに残課題件数を表示」「設定モーダル内で『今のままだと解けない制約』を可視化」。
- **規模**: 中 / **価値**: 高 (自動生成失敗時のデバッグが現状辛い)

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

#### D5a. 🟠 ARIA / role 属性ゼロ
- **現状**: `grep "aria-\|role="` で Builder 配下 0 件。スクリーンリーダーに対して構造が全く伝わらない。
- **改善**: 最低限以下を入れる:
  - `<table>` に `<th scope="col">` / `<th scope="row">`
  - ConfigModal に `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
  - selectbox に `aria-label`
  - 進捗バーに `role="progressbar" aria-valuenow={dashboard.progress}`
- **規模**: 中 / **価値**: 中 (法人ユース想定なら必須化する可能性)

#### D5b. 🟡 キーボード操作の完成度
- **現状**: ScheduleCell に矢印ナビあり (D4d で hook 化候補)。ConfigModal の tab 切り替え (基本/科目/クラス/...) は左右矢印未対応。
- **改善**: 評価表作成 → 不足を補う。
- **規模**: 中 / **価値**: 中

#### D5c. ⚪ 日本語固定 (i18n)
- **現状**: 文言ハードコード。当面ターゲットが日本国内塾なので保留で良い。
- **判断**: 海外展開などの要件が出るまで触らない。

---

### D6. 機能拡張 (新規)

#### D6a. 🟠 CSV / Excel からの bulk import
- **現状**: 講師マスタも NG 設定も手入力。初期セットアップ時の負担大。
- **改善**: CSV import (講師名・担当科目 / NG 日時) と、既存 Excel スケジュールからの取り込み。
- **規模**: 中 / **価値**: 高 (新規ユーザの導入障壁を下げる)

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

- 各項目を実装したら ✅ を付けて短縮する (詳細は commit message とコードのコメントに残す)
- 新たに発見された問題は適切なセクション (A/B/C) に追加
- リスク (R*) は実害が出たり対策が完了したら更新
- 「次セッション quick start」のコマンドと検証数値 (test 件数等) は変わったら追従
