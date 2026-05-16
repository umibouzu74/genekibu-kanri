# 講習時間割作成 (timetable-builder) 今後のロードマップ

最終更新: 2026-05-16 / A1-A8 + B1-B4 完了後

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
| データモデル | 🟢 v2 で安定。マイグレーション関数あり |
| 自動生成 (MRV+バックトラック) | 🟢 制約充足は動く・複数案・部分解・Web Worker 化済・externalCounts と日次上限を尊重 (A1) |
| 制約システム | 🟢 純粋関数として `logic/constraints/` に切り出し済 (B3) |
| 状態管理 | 🟢 useProject は composer (155 行)、3 つのアクションフックに分割済 (B2) |
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
合計 **849 件** (timetable-builder 配下は約 172 件、他は親アプリ)
主なファイル:
- `utils/scheduleKey.test.js` (26)
- `utils/combinedPropagation.test.js` (19)
- `logic/autoGenerator.test.js` (23)
- `logic/runGenerator.test.js` (4)
- `logic/constraints/teacherConstraints.test.js` (19)
- `logic/constraints/scheduleConstraints.test.js` (13)
- `hooks/useHistoryStack.test.jsx` (13)
- `hooks/useProject.test.jsx` (36)
- `hooks/projectFactory.test.js` (19)

カバー: マイグレーション・キー round-trip・MRV 制約・seed 決定性・部分解・
合同伝播・cell ops cascade・LocalStorage 保存・undo/redo・load error 通知。
**未カバー**: useAnalysis 詳細・UI コンポーネント・Excel 出力。

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

### C1. 🔴 データモデルの ID 化
**現状の問題**:
- 現データモデルは「インデックス」で日付・時限・クラスを参照（`d0-p1-c2`）
- インデックスが UI 操作（並べ替え・追加・削除）でずれる → スケジュールキーがずれる → 整合性管理が複雑化
- すでに `cleanSchedule` で「無効キーを破棄」している現実的回避策あり、しかし壊れたまま気づかないリスク残

**提案**:
- `dates: [{id, label}]`, `periods: [{id, label, startTime}]`, `classes: [{id, label}]` のような ID 付き entity
- スケジュールキー: `d{dateId}-p{periodId}-c{classId}` のように ID ベース
- ID は UUID か incremental
- 並べ替え・名称変更で ID が変わらない → 整合性が自然に保たれる

**移行戦略**:
1. 新スキーマで Project v3 を定義
2. v2 → v3 マイグレーションを書く（既存ユーザの LocalStorage を v3 に変換）
3. すべての参照箇所（autoGenerator / cell ops / Excel 出力 / 集計）を ID ベースに修正
4. インデックスベース API は廃止

**コスト**: 大規模。1〜2 週間
**リスク**: 既存データの移行に bug が入ると LocalStorage の中身を壊す → JSON 出力でバックアップを取るフローを必ず先に整備
**やる価値**: 中。現状の cleanSchedule 戦法でもまあ動いているので、不具合報告が多発したら検討

---

### C2. 🟡 状態管理を useReducer + action types に
**現状の問題**:
- useProject はサブフック (useTeacherActions / useSubjectActions / useScheduleActions) に分割済 (B2) だが、各 `useCallback` が `{...project, key: newValue}` パターンで状態を更新
- 30+ の useCallback が `[project, pushHistory]` を deps に持つ → project 変化のたびに全部再生成
- B1/B2/B3 で内部構造は整理されたが、reducer 化は別の独立した整理軸

**提案**:
- `useReducer((state, action) => newState, initialProject)` に置き換え
- action types: `'tab/add'`, `'teacher/rename'`, `'cell/assign'`, `'cell/swap'`, etc.
- reducer は純粋関数なので単体テストが書きやすい
- redux-style middleware 風に履歴管理 (undo/redo) を組み込み可

**移行戦略**:
- 既に B1/B2 で ops の境界は明確 (combinedPropagation + 3 アクションフック)
- そのうえで「action 化」する → 既存テストが安全網

**コスト**: 中規模。3〜5 日
**リスク**: 公開 API (useProject の return) の互換性を保つラッパが必要
**やる価値**: 中〜高。テストの書きやすさが大きく変わる

---

### C3. 🔴 UI のデザインシステム統合
**現状の問題**:
- Builder UI: Tailwind の鮮色 (`bg-blue-600` `bg-green-600` `bg-purple-50` 等)
- 親アプリ: dark sidebar + muted パレット (`colors.bg = #f0f1f3`, `colors.primary = #1a1a2e`, `S.btn` の柔らかいトーン)
- 配色が違いすぎて Builder が「貼り付け感」を出している（前回 commit `a2ebcfb` で外側 padding/背景を整えたが、内部のボタン・モーダル色は手付かず）

**提案**:
1. `styles/builderTokens.js` を新設し、親の `colors` / `S` をマッピングして Builder トークンを作る
2. 全 UI 要素を tailwind 鮮色 → builder トークンへ書き換え（`<button>` の className 全部）
3. もしくは Tailwind を捨てて inline style ベース（親と同じパターン）に書き直す

**コスト**: 大規模。1〜2 週間（全 UI コンポーネントを触る）
**やる価値**: 中。視覚的統一は UX 改善になるが、機能改善ではない

---

### C4. 🟢 xlsx-js-style → exceljs への置き換え検討
**現状の問題**:
- xlsx-js-style: 874kB（gzip 324kB）。動的 import で初期負荷は無いが、Excel 出力時に重い
- `xlsx-js-style` は `xlsx` (SheetJS) のフォーク。本家がライセンス変更後 (CC-BY → 商用) も MIT のフォークが続いているが、メンテ状況は要確認
- 代替: `exceljs` (1MB クラスだが API が綺麗)、`@e965/xlsx` (xlsx の MIT フォーク)、自前で OOXML 書き出し

**提案**:
- 大規模調査: 各候補のサイズ・スタイル機能の充実度・メンテ状況・ライセンスを比較
- 移行する場合は `excelExport.js` の API（downloadScheduleExcel / downloadTeacherExcel）を保ったまま実装差し替え

**コスト**: 調査 1 日 + 実装 2〜3 日
**やる価値**: 低〜中。現状で動いているので緊急度は低い

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

### R3. xlsx-js-style のメンテ状況
- 詳細未調査。最新バージョン・コミット頻度・open issues を要確認
- 万一メンテ停止していても、現状動いているので緊急度低
- 長期的には C4 を検討

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
- 状態管理 (B2 で分割):
  - `hooks/useProject.js` (composer 155 行)
  - `hooks/useHistoryStack.js` (state + undo/redo + autosave)
  - `hooks/useScheduleActions.js` (cell ops、合同伝播は combinedPropagation 委譲)
  - `hooks/useTeacherActions.js` (講師・externalCounts)
  - `hooks/useSubjectActions.js` (科目・色)
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
npm test            # 39 files / 849 tests (timetable-builder 約 172 件)
npm run typecheck   # tsc --noEmit
npm run build       # 警告は xlsx-js-style chunk size のみ (期待動作)
```

### 4.4 推奨着手順
A 系・B 系は全て完了済。残るのは C 系の破壊的再設計のみ。優先度の参考:

- C2 (reducer 化)：内部リファクタとして比較的安全、テスト網羅で書きやすさ向上
- C1 (ID 化)：データモデル変更でリスク高、不具合報告が増えてから検討
- C3 (デザイン統合)：機能改善ではないので優先度低、機能完成後に検討
- C4 (xlsx 置き換え)：現状動いているので緊急度低

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
- A1-A8 + B1-B4 は `claude/roadmap-design-progress-InQ1R` ブランチで実装
  (このドキュメント更新時点で 10 commits)
- 旧スタンドアロン版の handoff.md: `git show 89e0b25:jikanwarikun-main/handoff.md` で参照可

---

## 5. このドキュメントの更新ルール

- 各項目を実装したら ✅ を付けて短縮する (詳細は commit message とコードのコメントに残す)
- 新たに発見された問題は適切なセクション (A/B/C) に追加
- リスク (R*) は実害が出たり対策が完了したら更新
- 「次セッション quick start」のコマンドと検証数値 (test 件数等) は変わったら追従
