# 講習時間割作成 (timetable-builder) 今後のロードマップ

最終更新: **2026-07-03** — **§L (新機能・便利機能レビュー、4 方面並列調査)
を新設**し、3 バッチで実装: 第 1 弾 L1 (小粒 8 件、テスト 1879)、第 2 弾
L3a/L3b (講師別上限) / L5a (親マスタ取込) / L3e (部分解内訳) / L2a (講師
ハイライト) / L2c (全日適用・日列コピー) (テスト 1936)、第 3 弾 **L4 系
入力バッチ 7 件 + L5c 配布用 Excel** (テスト 1975)。続けて **§L 全体の
校正レビュー (§M、4 観点 × 個別検証) で Critical 1 / High 2 を含む 19 件を
修正** (テスト 1993)。残る未着手候補は §L、校正の記録は §M 参照。
それ以前 (同日): §G.6 推奨順の小粒バッチ ×2 完了
(第 1 弾: F2i / F5z / F2e / F2h前段 / F2d / F2j / F2m、
第 2 弾: F2l / F5f / E5g)。同日、**親アプリに追加授業機能を実装**
(schema v15) し、**ブランチ全体の校正レビュー (§I) で確定指摘 7 件を修正**
(テスト 1695 → 1766 件)。マージ後、**E3e (ConfigModal sub-tests 拡充) /
親アプリ側の小粒 2 件 (H2c 深夜 0 時跨ぎ / H2d id 採番統一) / F5p (案 b で
読み取り専用化) / E1a・E1f のタッチ CSS / E3a (Playwright E2E ×2) /
E3b (xlsx round-trip) を完了** (vitest 1766 → 1821 件 + E2E 2 件)。
さらに **E5e (TypeScript 化) を全 Phase 完了** — builder の非テスト source
は 100% TS (types.ts + 67 ファイル変換、@types/react 導入、eslint TS 対応)。
同日、**本ブランチ全体の校正レビュー (§J、4 観点 × 個別検証) で
コード 9 件 + ドキュメント 12 件を修正** (テスト 1821 → 1824)。
**builder の残課題は §G と §L、親アプリ (原学部管理) 側の課題は §H、
校正レビューの記録は §I**。
それ以前の履歴: 2026-07-03 F.4/F.5 改善サイクル (PR #141) /
2026-07-02 F 系レビュー (F.1-F.5) / 2026-06-29 E 系 UX 仕上げ /
A1-A8 + B1-B4 + C1-C4 + D 系 (詳細は §0 と各セクション)

このドキュメントは「次のセッション (新しい Claude Code セッション or 別の開発者) が
迷わず作業を引き継げる」ことを目的にしている。完了項目は ✅ で短くまとめ、
未着手の C 系再設計だけ詳細を残す。

関連ドキュメント:
- ユーザ操作: [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md)
- 設計・データフロー (Mermaid): [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## §0. 完了済み一覧 (E8d インデックス)

詳細は各セクションの該当項目を参照。「残あり」は一部完了で残課題あり。

| 系統 | 完了項目 |
|---|---|
| A (増分改善) | A1-A8 すべて完了 |
| B (中規模リファクタ) | B1-B4 すべて完了 |
| C (破壊的再設計) | C1 ID 化 / C2 reducer 化 / C3 デザイン統合 / C4 Excel ライブラリ置換 |
| D (Quick wins / Test) | D1a / D1c / D2a / D2b / D4e / D4f / D4g / D5a / D6a-MVP / D7b |
| E1 (UX 完成度) | E1a モバイル / E1b キーボード / E1c スナップショット / E1d 差分 / E1e コントラスト / E1f タッチ / E1g 修正提案 (E1a/E1f は実機確認のみ残 → G.2) |
| E2 (機能拡張) | E2a-NG / E2b-MVP / E2c 連続コマ / E2d テンプレート / E2e 生成param UI / E2f cancel+統計+live / E2h 負荷偏り |
| E3 (テスト/信頼性) | E3a Worker E2E (Playwright) / E3b xlsx round-trip / E3d schema 検証 / E3e ConfigModal sub-tests |
| E4 (パフォーマンス) | E4a cleanSchedule O(K) |
| E5 (再設計) | E5e TypeScript 化 (全 Phase) / E5g migration ルール文書化 |
| E6 (データ管理) | E6c 容量監視 / E6d 複数タブ検出 |
| E8 (ドキュメント) | E8a ユーザーマニュアル / E8b アーキテクチャ図 / E8d 完了インデックス(残あり) |
| F (レビュー起点の修正) | F.1/F.3 一括修正 (2026-07-02) / F.4-F.5 の改善 10 バッチ (2026-07-02〜03、PR #141): 読込クラッシュループ根絶 F5a-F5e+F2f / 期間カレンダー順 F5j / autosave debounce F2c / focus trap F5q-F5r / Excel シート名 F5g-F5i / infeasibility 再設計 F2g+F5x / モーダル UI F5k-F5o / ソルバ整合 F5t-F5y / 空ロック仕様 F5w / fingerprint 失効 F2n-F2p / 参照整合 F2k+H3/H5/F2o / a11y F2a-F2b |
| G (残課題の一本化後) | 2026-07-03 小粒バッチ ×2: F2i effectiveConfigForTab 集約 / F2j 集計規則統合 (tabUsage.js) / F2m infeasibility レジストリ / F2d 同値 no-op ガード / F2e swap stale payload / F2h前段 NG CSV dedupe / F5z 重複合同グループガード / F2l popover+数値入力の共有化 / F5f 混在 dim migrate / E5g migration ルール文書化 |

**残課題は §G (2026-07-03 一本化) を参照。**主な未着手系統:
E2a Excel 取込 · E2b wizard 本体 · E3c/E3f/E3g テスト深化 ·
E4b ソルバ計測 · E5 系残り (E5b ID 化 / E5c style 統一) · E6a Firebase · E7 系 (AI 活用)。

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
| JSON 読込の堅牢性 | 🟢 schema 検証 + migrate の要素正規化 + 壊れデータ退避 (F.5 系統 A)。クラッシュループは根絶 |
| 生成結果の鮮度 | 🟢 config fingerprint で stale な案を自動破棄 (F2n/F2p) |
| キーボード操作 / a11y | 🟢 focus trap・全操作のキーボード代替・ARIA 対応済 (E1b + F2a/F2b)。スクリーンリーダーでの実機検証は未実施 |
| 合同グループ | 🟡 機能・UI・検証は揃ったが実運用検証が浅い。他タブグループの編集挙動は仕様判断待ち (F5p) |
| オンボーディング | 🟢 初回 5 ステップガイド + ❓ ヘルプから再表示 (D1a) |
| モバイル対応 | 🟢 コード側は完了 (Toolbar 折返し / Excel dropdown / 長押し / 44px / ダブルタップズーム抑止)。実機確認のみ残 (G.2) |
| TypeScript 化 | 🟢 builder 本体 100% TS 化済み (E5e、2026-07-03)。テストファイルと親アプリは JS のまま |
| Firebase 同期 | 🔴 意図的に未対応 |

### 1.3 既存のテスト
合計 **1824 件 / 89 ファイル** (2026-07-03 校正レビュー §J 後。timetable-builder
配下 + 親アプリ)。ファイル別件数は変動が速いので列挙しない — `npm test` の
出力を正とする。

カバー範囲: マイグレーションチェーン (v1→v4、型崩れ正規化、混在配列)・
「validate 通過 JSON は初回利用でクラッシュしない」統合性質
(projectLoadIntegrity)・キー round-trip・ソルバ (MRV 制約・seed 決定性・
部分解・合同・他タブ考慮・連続コマ・空ロック)・reducer 全 action・
cascade cleanup / labelRefs・autosave debounce+flush・分析 (violations /
infeasibilities / dashboard)・CSV / Excel / テンプレート / スナップショット・
主要 UI コンポーネント (Toolbar / Header / ScheduleCell / TabBar /
ContextMenu / ConfigModal 各タブ / SnapshotMenu / SummaryPanel)・
focus trap / long-press / タブ競合検出。
加えて Playwright E2E ×2 (実 Worker 経由の生成・中止 — E3a、
`npm run test:e2e` で別実行) と xlsx バイナリ round-trip (E3b)。
**未カバー**: worker 内エラープロトコル (E3a 残)・Excel の見栄え目視 (C4 残)・
印刷出力 (E3c)・視覚回帰 (E3f)・クロスブラウザ (E3g)。

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
npm test            # 89 files / 1824 tests (2026-07-03 校正レビュー §J 後)
npm run test:e2e    # Playwright 2 tests (実 Worker 経路、dev server 自動起動)
npm run typecheck   # tsc --noEmit
npm run build       # 警告は excelExport chunk size のみ (期待動作)
```

### 4.4 推奨着手順
A/B/C/D 系と F 系 (レビュー起点の修正) はすべて完了。**現在の残課題と
推奨順は §G (2026-07-03 一本化) を参照**。新たな課題が見つかったら §G に
追記し、規模が大きいものは E 系の適切なサブセクションへ昇格させる。

### 4.5 やる前に必ず読むべきファイル
- このファイル (ROADMAP.md)
- `genyakubu-manager/CLAUDE.md` 親アプリ側の規約 (印刷の二系統、削除 UX、却下提案)
- `/home/user/genekibu-kanri/CLAUDE.md` リポジトリ全体の規約

### 4.6 やってはいけないこと
- ユーザ行動の統計を LocalStorage に保存して UI を自動変形する系（CLAUDE.md A18 系で明示的に却下されている）
- 印刷システムの統合 (E-2 案、却下済み)
- 削除 UX で `confirmedRemove` が必要なところに `removeWithUndo` を使う

### 4.7 既存 PR / 関連リンク
- PR #141: F.4/F.5 チェック + 改善 10 バッチ (2026-07-02〜03、読込堅牢化 /
  誤登録修正 / ソルバ整合 / fingerprint / 参照整合 / a11y ほか)
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

#### E1a. ✅ モバイル / 狭画面対応 (旧 D1b / 2026-07-03 コード側完了)
- **✅ Toolbar 折返し** (2026-06-29): ボタンクラスタを `flex flex-wrap justify-end` に。
- **✅ Header Excel dropdown** (2026-06-29, commit 62f8639): 出力 2 ボタンを
  「📊 Excel出力 ▾」dropdown (role=menu) に集約。
- **✅ ScheduleTable 幅** (2026-07-03 クローズ判断): テーブルは
  `overflow-auto` コンテナ内で横スクロールし、親 (app-main) の幅を
  はみ出さない現行構造で解消済み。CSS variable 化は不要と判断。
- **残り**: 実機 (タブレット/スマホ) での通し確認のみ (G.2)。

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

#### E1e. ✅ コントラスト WCAG AA 準拠 (2026-06-29 完了 / focus ring は残)
- **旧現状**: `builder-*` トークン化 (C3) で見た目は統一されたが、コントラスト比は未測定だった。
- **実装**:
  - **utils/contrast.js**: 純粋関数 `hexToRgb` / `relativeLuminance` / `contrastRatio` / `meetsAA` (WCAG 2.x の式)。外部依存 (axe-core 等) は足さない。
  - **トークン調整**: `builder-orange` #e67a00 (白背景 2.94:1 で AA 未達) → **#c2410c** (5.18:1)。白文字ボタン / warning-soft 上でも AA を満たす。hover も追従。
  - **ghost トークンの用途限定**: 読めるアイコンボタン (×閉じる/削除・▲▼並べ替え) を `ink-ghost` (1.92:1) → `ink-muted` (5.74:1) に。`ink-ghost` は罫線・disabled・装飾用途のみに限定 (disabled UI は WCAG 適用外)。
  - **回帰テスト**: contrast.test.js で「読めるテキスト」配色 21 ペアが AA (4.5:1) 以上であることを検証。トークンを変えたら test の同期コピーも更新する運用。
- **テスト**: contrast.test.js (新規 27)。
- **残り**: focus ring の色弱対応 (現状 builder-blue 単色)、科目カラーパレット自体の AA 検証は別途 (ユーザが任意色を選べるため固定検証になじまない)。

#### E1f. 🟡 タッチ操作対応 (長押しメニュー 完了 / 2026-06-29)
- **旧現状**: DnD ベースで、タッチでのコンテキストメニューは OS 依存 (不安定)。
- **✅ 完了分 (長押し → ContextMenu)**:
  - **hooks/useLongPress.js**: 純粋寄りのフック。touchstart で 500ms タイマー、10px 以上の移動 (スクロール/フリック) でキャンセル、マルチタッチ無視、発火直後の click 抑止。返り値を要素へ spread する設計。
  - **ScheduleCell**: `{...useLongPress(...)}` を `<td>` に付与し、長押しで `onContextMenu` を発火 (右クリックと同じメニュー)。HTML5 DnD はタッチで発火しないので drag と競合しない。hooks-rules を守るため早期 return 前で呼ぶ。
  - **オンボーディング**: 「右クリック (タッチ端末では長押し)」と案内追記。
  - **テスト**: useLongPress.test.jsx 新規 6。
- **✅ 完了分 (ヘッダ長押し / 2026-06-29, commit 62f8639)**: ScheduleTable の
  ヘッダ (日付/時限/クラス) に LongPressTh を導入し、長押しで追加・名称変更・
  削除メニューを開けるように。
- **✅ 完了分 (タッチ CSS / 2026-07-03)**: tailwind.css の `.builder-root`
  スコープに追加。
  - `touch-action: manipulation` を操作要素 (button / select / input /
    role=button / th) に常時適用 — ダブルタップズームの誤爆を防止。
    ピンチズーム自体は a11y (拡大表示) のため殺さない (「ピンチ抑止」は
    manipulation で足りると判断)。
  - `@media (pointer: coarse)` (タッチ主体端末のみ): button / select の
    min-height 44px (WCAG 2.5.5)、長押し対象 (th / td[role=button] /
    [data-longpress]) の長押し中テキスト選択・コールアウト抑止。
    デスクトップのレイアウトは不変。
- **残り**: 実機 (iOS Safari / Android Chrome) での操作感確認のみ (G.2)。
- **規模**: 中 / **価値**: 中

#### E1g. ✅ エラー時の修正提案 (2026-06-29 完了 / D1c-C の延長)
- **旧現状**: D1c-C で infeasibility を検出するが、解決のヒントは無かった。
- **実装**:
  - **utils/fixSuggestions.js**: 純粋関数 `suggestForNoTeacher(item, ctx)` (担当講師未登録 → 登録 / 手動 NG → 該当時限の NG 解除〔名前入り〕/ 別時限で担当可 → 移動。自動 NG も候補から除外) + `suggestForCapacity(item, ctx)` (講師を あと N 名 / 1 日上限を X→Y に / コマ数を減らす) + `buildFixSuggestions(infeasibilities, ctx)` (各 item に `suggestions[]` を非破壊で付与)。
  - **useAnalysis**: `computeInfeasibilities` の結果を `buildFixSuggestions` で包んで公開 (deps 不変)。
  - **Toolbar**: popover「設定の問題」の各項目の下に 💡 修正提案を箇条書き表示。
- **テスト**: fixSuggestions.test.js (新規 11) / Toolbar.test.jsx (+1)。
- **延期**: 提案のワンクリック自動適用は E2b (修復 wizard) で扱う。ここまでは提示のみ。

#### E1h. 🟡 印刷スタイル微調整 (主要分 2026-07-03 完了)
- **現状**: 2 系統の印刷経路 (CLAUDE.md 印刷ルール参照) で運用中。MonthView / ExcelGridView は popup 方式、その他は `window.print()`。
- **✅ 完了分 (2026-07-03)**:
  - **日付フォーマット統一**: `formatPrintDate` (printStyles.js) を新設し、
    タイムテーブル紙面ヘッダの対象日を「YYYY年MM月DD日（曜）」の和式に
    (月次タイトル・印刷日と同形式)。テスト 3 件
  - **改ページ制御**: window.print() 系にも `break-inside: avoid` を追加
    (`.dash-time-group` = Dashboard の時間グループ / `.event-cal-cell` =
    イベントカレンダーの日セル)。月次 popup 系は従来から対応済み
  - **凡例の追従**: 月次印刷凡例に「追 = 追加授業」を追加 (H1b 対応)
- **残り**: ロックセルのハッチング (builder 側) が紙面で薄すぎないかの
  目視確認のみ (実機確認項目、G.2 に計上)

---

### E2. 機能拡張

#### E2a. 🟡 CSV インポートの拡張 (旧 D6a の続き / 講師マスタ + NG 日時 完了)
- **現状**: 講師マスタ CSV (paste + ファイル選択 + D&D) と NG 日時 CSV が対応済 (2026-06-29)。
- **✅ 完了分 (ファイル取り込み)**: TeacherManager の CSV パネルに「📂 ファイルを選択」(hidden `<input type="file" accept=".csv,...">`) と textarea へのドラッグ&ドロップを追加。`readCsvFile` が `file.text()` で読み取り → 既存の `csvText` → parse → preview フローに合流。非 CSV 拡張子はエラー toast でガード、ドラッグ中は枠をハイライト。テスト: TeacherManager.test.jsx 新規 3 件 (選択 / D&D / 非 CSV ガード)。
- **✅ 完了分 (NG 日時 CSV / 2026-06-29)**:
  - **utils/csvImport.js**: `parseNgCsv(text, { teacherNames, knownDates, knownPeriods })`。ヘッダ `name`(または `teacher`)`,date,period`。空フィールドはエラー集約、同一行は dedupe、未登録の講師/日付/時限は warning として返す。
  - **reducer**: `teacher/importNg` action。name 一致の講師にのみ `makeNgKey` で NG を追加 (dedupe)、未登録 name は skip、変更なしは同参照で履歴を汚さない。`useTeacherActions.importNgSlots` で公開。
  - **UI**: `components/ConfigModal/NgCsvImport.jsx` を「📅 講師不在・NG」タブに同梱。paste / ファイル選択 / D&D + ライブプレビュー (件数・エラー・未登録 warning)。
  - **テスト**: parseNgCsv 8 / reducer 3 / NgCsvImport 5。
- **残り (優先順)**:
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

#### E2f. ✅ 自動生成中の進捗詳細 (cancel + 統計表示 + live 通知 完了)
- **現状**: cancel・経過時間・探索回数・詰まりセルに加え、live 途中経過も可視化済
  (F.4 再チェックで確認: worker が `{ type: 'progress' }` を間引き通知 →
  BuilderApp `generateLive` → Toolbar に「案 N 探索中 / 充填 X/Y / 探索 N 回」)。
  旧「残り」記述は stale だったので削除。
- **✅ 完了分 (cancel / 2026-06-29)**: 生成中に Toolbar へ「✕ 中止」ボタンを表示 (`BuilderApp.handleCancelGenerate` → `generationRef.current` を null 化して done.then の state 更新を skip → `handle.cancel()` → isGenerating 解除 + warning toast)。既存セルは保持。Toolbar.test.jsx に +2 件。
- **✅ 完了分 (統計表示 / 2026-06-29)**:
  - **autoGenerator**: `generateSinglePattern` が `iterations` (探索回数=solve 呼び出し数) / `hitLimit` (上限到達) / `stuckSlot` (MRV 順で最初に埋められなかったコマのラベル) を返す。`iter` を solve の外で確保して読む。
  - **BuilderApp**: 生成中の経過時間を 100ms interval で更新し、完了時に総時間を確定。各 pattern に統計フィールドを乗せて SummaryPanel へ。
  - **Toolbar**: 生成中ボタンに「⏱ X.Xs」。**SummaryPanel**: 結果ヘッダに総生成時間、各案に「探索 N 回 / (上限到達) / 詰まり: 日付 時限 クラス」。
  - **テスト**: autoGenerator +3 / SummaryPanel 新規 4。
- **✅ 完了分 (live 通知)**: `autoGenerator.onProgress` (PROGRESS_INTERVAL=20000 で間引き) →
  worker `postMessage({ type: 'progress', index, progress })` → BuilderApp `generateLive` →
  Toolbar のインライン live 表示。「詳細パネル化」はインライン表示で十分と判断し不要。

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

#### E3a. ✅ 実 Worker 経路の E2E (旧 D2c / 2026-07-03 完了)
- **旧現状**: `runGenerator.test.js` は jsdom で sync fallback のみ。本番
  (`new Worker()`) の生成・cancel メッセージプロトコルが untested だった。
- **実装 (Playwright)**:
  - **playwright.config.js**: `npm run dev` を webServer として自動起動。
    リモート実行環境のプリインストール Chromium (`/opt/pw-browsers/chromium`)
    があれば executablePath で直接使い、無ければ通常のブラウザ解決
    (ローカルは `npx playwright install chromium` が必要)。
  - **e2e/builder-worker.spec.js** (2 件):
    1. Worker コンストラクタ spy で「実 Worker が構築された = sync fallback
       ではない」ことを確認しつつ、デフォルト project で自動作成 → 結果
       パネル → 案 1 採用 → スケジュール反映まで通し検証
    2. 探索が長引く重い project (8 クラス × 10 日 × 6 限のほぼ満杯 +
       講師 4 名 + maxIterations 500 万) を localStorage にシードし、
       生成中の「✕ 中止」→ warning toast + 生成ボタン復帰 + 結果パネル
       無しを検証
  - **実行**: `npm run test:e2e` (vitest の `npm test` とは別立て。
    include が `src/**/*.test.*` なので相互に干渉しない)。3 連続実行で
    安定を確認済み
- **残り**: worker 内エラー (`type: 'error'`) プロトコルの E2E は未
  (レアパスを強制注入する仕組みが必要)。クロスブラウザは E3g。

#### E3b. ✅ Excel 出力のバイナリ検証 (旧 D2d / 2026-07-03 完了)
- **旧現状**: 構造テスト (workbook オブジェクト検査) のみで、xlsx への
  serialize / deserialize 層 (exceljs writer) の regression は素通りだった。
- **実装**: excelExport.test.js に round-trip テスト 2 件を追加。
  `wb.xlsx.writeBuffer()` → 実バイナリ → `new Workbook().xlsx.load()` で
  読み戻し、シート構成・セル値 (改行表記含む)・日付セルの縦結合
  (isMerged/master)・科目カラー塗り (FFDBEAFE)・罫線 (thin)・wrapText・
  列幅 (14/16)・ヘッダの塗りと白文字が実ファイルに残ることを固定。
  講師別出力も同様に round-trip で検証。
- **残り**: 「Excel で開いた時の見栄え」の最終目視は引き続き C4 残
  (G.2 の実機確認項目)。バイナリ上のスタイル存在はここで自動検証済み。

#### E3c. 🟡 印刷出力スナップショット (第 1 弾完了 2026-07-03)
- **旧現状**: 印刷 2 系統 (CLAUDE.md) を維持しているが、実出力は手動確認のみ。CSS や DOM 変更で気付かず崩れる。
- **✅ 完了分 (構造スモークテスト / e2e/print.spec.js 4 件)**:
  - **window.print() 系**: print メディアエミュレーションで
    「.sidebar と全 .no-print が消え、本文が残る」を Dashboard /
    イベントカレンダー (追加授業バッジ込み) / 週間予定で検証。
    トップバー操作ボタンの写り込み (H1e 確認中に発見・修正済み) の
    ような回帰を検出できる
  - **popup 注入系**: 月次カレンダーの 🖨 で popup にタイトル・印刷日・
    凡例 (buildMonthHeaderHtml) と本文が注入されることを popup DOM で検証
- **判断メモ**: pixel 比較 (page.pdf → pixelmatch) は環境のフォント差で
  flaky になるため導入しない。構造検証 + printStyles.test.js (純関数) の
  2 層で守る
- **残り**: ~~ExcelGridView (タイムテーブル) の popup 注入~~ ✅ e2e 追加
  (2026-07-03、中学/高校ヘッダ + 和式対象日 + 印刷日)。
  ConfirmedSubsView / MasterView の print 検証は未カバー (同型なので
  必要になったら追加)

#### E3d. ✅ project JSON 読込時の schema バリデーション (2026-06-29 完了)
- **旧現状**: `loadInitialProject` は JSON.parse 失敗のみ捕捉。schema 違反 (`tabs` / `config.dates` が配列でない等) は migrate / downstream で crash しうる。
- **実装**:
  - **utils/projectSchema.js**: 純粋関数 `validateProjectShape(obj)` → `{ valid, error }`。致命的な構造崩れ (tabs 非配列/空・config 欠落・dates/periods/classes 非配列・subjectCounts 非オブジェクト・teachers 非配列・schedule 非オブジェクト) のみ検出。任意フィールドの欠落は migrate が default 補完するので見ない。zod 等の依存は足さず手書き (バンドル増ゼロ)。
  - **projectFactory.loadInitialProject**: parse 後・migrate 前に validate。不正なら throw → 既存 catch でフォールバック default + loadError → 起動時 toast。
  - **useJsonIO.handleLoadJson**: ファイル取り込みでも validate。不正なら適用せず error toast。
- **テスト**: projectSchema.test.js (新規 10) / projectFactory.test.js (+2 fallback)。
- **判断**: 手書きバリデータで十分 (構造チェックのみ)。値レベルの厳密検証 (例: id の一意性) は過剰なので入れない。

#### E3e. ✅ ConfigModal sub-components のテスト拡充 (2026-07-03 完了)
- **旧現状**: 各 sub-component のテストは回帰シナリオ中心で薄かった
  (TeacherManager 3 件 / AbsenceNgPanel 11 件 (1254 行) / SubjectManager 3 件)。
- **実装 (+38 件、いずれも既存ファイルへ追記)**:
  - **TeacherManager (3→18)**: 追加 (showInput→addTeacher) / 削除 (confirm ゲート) /
    InlineNameEdit (Enter・blur commit / Escape 破棄 / 同値・空白 no-op) /
    担当科目トグル / CSV import 実行 (append は confirm なし・replace は confirm、
    0 行 disabled、未登録科目 warning、キャンセル)。教科グループ表示で並びが
    変わっても「元の teachers index」で dispatch されることを固定。
  - **AbsenceNgPanel (11→26)**: 他学年セッション一括登録 (講師×期間の直積、
    登録後の時刻・メモ clear と講師・期間の保持) / 時刻バリデーション 2 種 /
    まとめてNG・OK解除 (解除のみ confirm、拒否で no-op、全時限 allMode の解決) /
    モード切替での external フィールド clear / 日付セクション (セッション一覧・
    削除、自動NG セルの「自」+ tooltip + NG 件数バッジ、折りたたみ・再展開) /
    クイック数値グリッド (draft-commit、セッション有セルは件数表示、
    明示 0 と未入力の区別)。
  - **SubjectManager (3→9)**: 科目の追加 / 削除 (cascade 警告 confirm) /
    並び替え (▲▼ と端の disabled)。
  - **CombinedGroupSettings (9→11)**: 削除経路 (confirm なしの即時 dispatch) /
    編集中に別グループを削除しても draft が維持されること。
- **対象外**: BasicSettings (17 件) / ClassPriority / GenerationSettings /
  NgCsvImport / TemplateManager / DraftNumberInput は既に十分な直接テストあり。

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

#### E4b. 🟡 solver スケーリング計測 (計測完了 2026-07-03)
- **✅ 完了分**: `logic/solverScaling.test.js` + `npm run bench:solver`
  (BENCH=1 ガード付き。通常の `npm test` では skip)。D×P×C と科目クォータの
  均等性を変えて generateSinglePattern を実測する
- **実測結果 (2026-07-03、コンテナ環境、seed 2 種)**:
  - 実行時間は maxIterations (500k) で頭打ち。**最悪でも 1 案 1.6 秒
    (168 コマ) 〜 3.2 秒 (1008 コマ)** で返る。1 iteration ~3µs → 大規模で
    ~6µs (コマ数にほぼ線形)
  - **難易度はコマ数ではなくクォータの均等性に支配される**:
    500 コマでも `D*P % 科目数 == 0` (均等) なら数百 iteration で完全解。
    168 コマでも不均等 (24 = 5+5+5+5+4) だと 500k を使い切り部分解
    (159/168 前後) に落ちる
  - 既定 500k は「待ち時間の上限を数秒に抑える」妥当な既定と判断
    (3 案生成でも 10 秒以内 + Worker 化済みで UI は塞がない)
- ✅ **改善実施 (2026-07-03)**: 科目の試行順を単純シャッフルから
  **slack 順 (= その科目をまだ置ける残り日数 - 残クォータ、昇順)** に変更
  (`orderSubjectsBySlack`)。同点はシャッフル順を保持し探索多様性は維持。
  - **効果 (実測)**: 168 コマ不均等構成が、旧実装では **200 万 iteration
    でも部分解 (165/168)** だったのに対し、既定 50 万以内 (~20〜26 万,
    1.4〜1.9 秒) で**完全解**に。小規模 (27 コマ) も 6.5 万 → 28 iteration
    に短縮。均等クォータ構成は従来どおり数百 iteration で不変
  - **コスト**: 1 node あたり O(日数×時限数) のスキャンが乗り iteration
    単価は約 2 倍 (~6→12µs @ 大規模)。上限到達時の最悪待ち時間は
    1 案 ~3.2 秒 → ~6.5 秒 (864 コマ) に伸びるが、実運用サイズでは
    完全解率の向上が支配的と判断
  - **途中で試して不採用**: 残クォータ降順のみ (スキャン不要で安いが、
    168 コマ構成が 200 万 iteration でも解けず効果不足)
  - **ベンチ側のバグも発見・修正**: 初版 XL (12d×6p×14c) は
    periods(6) > 科目数(5) のため「同日同クラス科目重複禁止」で構造的に
    解無しだった。XL を 12d×4p×18c に差し替え (periods ≤ 科目数 を
    ベンチ構成の約束事としてコメント化)

#### E4c. ⚪ excelExport バンドル削減 (旧 D3c)
- **現状**: 944 kB (gzip 273 kB)。dynamic import で起動には影響無いが、初回 Excel 出力に数百 ms 遅延。
- **改善**: exceljs の Workbook + xlsx writer のみ tree-shake、または OOXML 自前。
- **規模**: 大 / **価値**: 低 (動的 import で吸収済み)

#### E4d. ✅ useAnalysis 再計算プロファイル (2026-07-03 計測完了・最適化不要と判断)
- **旧現状**: useAnalysis は 5 段 useMemo。タブ数 / セル数が増えた時の hot path が未計測だった。
- **計測**: `utils/analysisScaling.test.js` + `npm run bench:analysis`
  (BENCH=1 ガード)。実運用超級の合成 project (3 タブ × 7 クラス × 12 日 ×
  4 限 = 1008 セル全充填・講師 30 名) で関数別のフル再計算コストを実測
- **結果 (2026-07-03、コンテナ環境)**: 合計 **~4.3ms/回**
  (内訳: tabViolationCounts 1.9 / globalUsage 1.2 / activeAnalysis 0.6 /
  violations 0.3 / infeasibilities+fix 0.1 / dashboard 0.1)。
  キー入力のフレーム予算 16ms に対して十分小さい
- **判断**: WeakMap キャッシュ / selective recompute は**不要** (時期尚早)。
  タブ数が 10 超級になったら bench:analysis を再実行して判断し直す

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

#### E5e. ✅ TypeScript 化 (旧 D7a / **全 Phase 完了 2026-07-03**)
- **✅ Phase 1 (データモデル核)**: `types.ts` を新設し、ドメインモデル
  (Project / Tab / TabConfig / Entity / ScheduleEntry / Teacher /
  CombinedGroup / ExternalSession / Preset / TabSnapshot /
  GenerationParams / ProjectState) を単一の正として定義。以下 6 ファイルを
  `.ts` 化 (拡張子リネーム + 型注釈、挙動不変):
  - `utils/generationParams.ts` / `utils/projectSchema.ts` /
    `utils/scheduleKey.ts` / `utils/constants.ts` /
    `hooks/projectFactory.ts` / `hooks/projectReducer.ts`
  - **projectReducer は全 55 アクションの discriminated union
    (`ProjectAction`)** を定義。payload 形状はこの型が単一の正 —
    新アクションはまず union に足してから case を書くこと
  - migrate 系 (v1〜v3 の旧形状 / 外部 JSON を受ける関数) は入力を
    `any` で受けて出力を v4 型に揃える方針 (untrusted 入力の正規化が
    仕事なので入力に型を貼らない)
  - tsconfig は既存 (strict: false / allowJs) のまま。テスト 1814 件 +
    E2E 2 件 + build で挙動不変を確認
- **✅ Phase 2a (reducer の cascade 依存)**: `utils/combinedPropagation.ts` /
  `utils/labelRefs.ts` / `utils/tabUsage.ts` も `.ts` 化 (同日)。reducer が
  import する層は全て型付きになり、データモデル核が閉じた
- **✅ Phase 2b (utils 残り + logic 全部、同日)**: **utils と logic は全ファイル
  TS 化完了** (計 20 ファイル)。
  - utils: patternLoad / tabPresence / generationFingerprint / templates /
    scheduleDiff / storageHealth / autoNg / contrast / timeRange /
    dateGenerate / groupTeachersBySubject / fixSuggestions / csvImport /
    analysisHelpers / excelExport
  - logic: constraints ×2 / autoGenerator / runGenerator /
    autoGenerator.worker
  - 公開した主な型: `GenerationResult` / `GenerationProgress` /
    `GeneratorHandle` (ソルバ) / `GlobalUsage` / `TeacherDailyCount` (分析) /
    `AutoNgEntries` / `FixSuggestion` / `TimeRange` / `ScheduleDiff` /
    `TeacherGroup` / `ProjectTemplate` など
  - worker (.ts) は tsconfig が DOM lib のため `self` をローカル型で cast
    (実行時挙動は不変)。runGenerator は `vite/client` の型参照で
    `?worker` import を解決
  - 検証: vitest 1814 + lint + build + **Playwright E2E (実 Worker 経路) 2 件**
    全パス
- **✅ Phase 3 (React 層、同日) — これで E5e は完了**:
  - hooks 11 + contexts (value 2 + Provider 2) + onboardingSteps を `.ts` 化、
    components 21 + BuilderApp を `.tsx` 化。**builder の非テスト source は
    100% TypeScript** になった
  - `ProjectContextValue` は `ReturnType<typeof useProject> &
    ReturnType<typeof useAnalysis>` で導出 (useProject の公開 API 変更に
    自動追従)。`UIContextValue` (showToast / showConfirm / showInput) は
    明示 interface
  - 全アクションフックの dispatch が `Dispatch<ProjectAction>` になり、
    payload 形状ミスがコンパイルエラーになる
  - 主要コンポーネントに Props interface (Toolbar / SummaryPanel
    (`GeneratedPattern` を公開) / ContextMenu (`BuilderContextMenuState` /
    `CellClipboard`) / ScheduleTable / ScheduleCell / OnboardingOverlay /
    DraftNumberInput / ConfigModal)
  - **@types/react / @types/react-dom を導入** (従来は react が型無しで
    全て any だった)。eslint は @typescript-eslint/parser + plugin を追加し、
    ts/tsx でも react-hooks ルールを維持 (no-undef と素の no-unused-vars は
    TS 構文へ誤反応するため tsc 側に委譲)
  - `e.target.blur()` → `e.currentTarget.blur()` の 3 箇所は等価な型安全化
    (input 自身のハンドラなので target === currentTarget)
- **残り (任意)**: テストファイル 54 件は `.js`/`.jsx` のまま (vitest 実行には
  支障なし)。`strict: true` の段階導入は別課題
- **規模**: 大 / **価値**: 中〜高

#### E5f. ⚪ state management ライブラリ検討 (新規)
- **現状**: useReducer + Context + 手書き useMemo (CLAUDE.md にも記載) で re-render を抑えている。
- **改善**: Zustand / Jotai / Redux Toolkit に置き換えて selector ベースの purity / devtools 統合を得る。
- **判断**: 動いているものを置き換えるコストが高い。**「壊す」候補だが優先度低**。

#### E5g. ✅ project schema migration path 設計 (2026-07-03 完了)
- **旧現状**: v1→v4 の migration は `migrateProject` で実装済みだが、v5
  (combinedGroups の ID 化 / teacher 安定 ID 等) を入れる時のルールが不文律だった。
- **実装**: `docs/ARCHITECTURE.md` §4.1 に 7 項目のルールを明文化 —
  1 リリース 1 インクリメント / 順次関数合成 (既存 migration は凍結) /
  reject より正規化 (F.5 系統 A) / 失敗時は退避 + フォールバック (F2f) /
  ID 参照変更は「旧 ID → ラベル → 新 ID」の 2 段 remap (F5f の教訓含む) /
  テスト 3 点セット (正常系 / 正規化系 / projectLoadIntegrity) /
  書き込み側 (createNewProject / validateProjectShape) との同時更新。

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

#### E8a. ✅ ユーザーマニュアル (2026-06-29 完了)
- **実装**: `docs/USER_GUIDE.md`。画面構成 / 初回セットアップ / CSV 一括登録 / 基本操作 (右クリック・長押し・D&D・矢印ナビ) / 自動作成 / スナップショット・差分・テンプレート / 出力 / 注意・トラブルシュートを網羅。スクリーンショットは未添付 (文章ベース)。

#### E8b. ✅ 開発者ガイド (アーキテクチャ図 / データフロー) (2026-06-29 完了)
- **実装**: `docs/ARCHITECTURE.md`。Mermaid で 4 図 (全体構成 / 編集 1 操作の sequence / 自動生成パイプライン / データモデル概要) + ディレクトリ責務表 + 守るべき設計上の約束。

#### E8c. ⚪ スクリーンキャスト / GIF
- **現状**: 無し。
- **改善**: 主要操作を 30 秒 GIF で。README / オンボーディング再生にも使える。
- **規模**: 小 / **価値**: 低〜中

#### E8d. 🟡 ROADMAP の整理 (一部: 完了インデックス追加)
- **✅ 完了分 (2026-06-29)**: 冒頭に「§0 完了済み一覧」のインデックス表を追加し、長大化したドキュメントでも完了項目を一覧把握できるようにした。
- **残り**: D 系を A/B/C と同じく折りたたみ表記にし E 系を main トラックに寄せる全面整形は未実施 (情報量を保ったまま圧縮する必要があり別途)。
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
| **Major refactor (要決断)** | ~~E5e (TS)~~ ✅ → E5b (ID 化) → E5c (style 統一) | 大 | 長期負債解消、5 年後の自分 |
| **新領域 (要 PM 判断)** | E6a (Firebase) / E7a (NL 制約) / E7b (緩和提案) | 大 | プロダクト方向性の選択 |

### E 系の「一旦壊した方が良い」候補

| # | 項目 | 推奨アプローチ | リスク |
|---|---|---|---|
| ~~**E5e**~~ ✅ | TypeScript 化 | 完了 (2026-07-03)。types.ts + 全 source の TS/TSX 化 | — |
| **E5b** | combinedGroups / externalCounts 完全 ID 化 | E5e と一緒に。reducer の cascade cleanup を撤廃 | JSON 出力が人間可読でなくなる、タブ間自動共有が失われる |
| **E5c** | Tailwind / inline-style 統一 | 親アプリの paradigm に合わせ Builder を inline 化 | Builder UI 全面書き直し |
| **E6a** | Firebase 同期 | LocalStorage は cache レイヤとして残し sync は subscribe 型 | 認証 / コンフリクト / コスト |
| **E5h** | analysis の Worker 化 | postMessage で結果を返す。autoGenerator と共通基盤 | UI 60fps を割っていないなら effort 過剰 |
| **E5f** | state management ライブラリ | Zustand へ部分置換から | 動いているものを置き換えるコスト |

優先度判断の目安:
- ~~**必ずやる**: E5e (TS)~~ ✅ 完了 → 残りの refactor (E5b 等) の前提が整った
- **やる価値が高い**: E5b (ID 化) → reducer 簡略化、E5c (style 統一) → 長期 maintenance
- **要件次第**: E6a (Firebase) → 共有ニーズが顕在化したら
- **慎重に判断**: E5f / E5h → 動作優先で見送りもアリ

---

- 各項目を実装したら ✅ を付けて短縮する (詳細は commit message とコードのコメントに残す)
- 新たに発見された問題は適切なセクション (A/B/C/D/E) に追加
- リスク (R*) は実害が出たり対策が完了したら更新
- 「次セッション quick start」のコマンドと検証数値 (test 件数等) は変わったら追従

---

## F. 2026-07-02 フレッシュアイズレビュー (Fable 初見チェック) の結果

コードレビュー (状態管理 / UI / ソルバの 3 レイヤ) + Playwright 実機操作で
全面チェックを実施。**発見した Critical 4 + High 8 + Medium 14 のうち大半を
同日中に修正済み** (詳細は commit log 参照)。その後 F.3 の校正レビューで
修正自体を再検証し、確定した 14 件も同日修正。テスト 1524 → 1573 件。
PR 化済み (このセクションの F.1 / F.3 が本 PR の内容、F.2 が持ち越し)。

### F.1 修正済み (2026-07-02)

- **設定モーダル複合バグ**: focus trap 再初期化による入力不能 /
  textarea keystroke commit によるデータ破壊 / 他タブ合同グループ全滅
- **生成結果のタブ追従**: タブ切替後の「この案を採用」が別タブを上書き
  (実機再現→修正、snapshot/apply と同型に)
- **ソルバ**: activePeriodIds 無視 / タブ間講師重複の未考慮 (H2) /
  リスタート戦略 (P1: 中３タブ完全解 1/3 → 12/12・平均 244ms) /
  externalSessions の日次反映 / 未定の同時限複数配置 / 合同の講師固定
- **infeasibility**: capacity 式の 2 倍過大評価 / quotaCellMismatch ·
  subjectQuotaOverDays の新規検出
- **E-3 取りこぼし一族**: タブバッジ・globalUsage・Excel の periods 絞り /
  NG パネル自動NG のプール全時限化 / v3→v4 移行の activeDateIds 保存
- **小粒**: NG CSV 検証の v4 死亡 / 波ダッシュ U+301C / Ctrl+Shift+Z /
  Excel シート名 throw / clearUnlocked の非表示セル保護 / removeFromPool
  cascade / teachers 欠落クラッシュ / dangling activeTabId / confirm の
  trap 参加 / ContextMenu 座標 / 生成 UX (完全解優先ソート等)

### F.2 未修正の残課題 (次セッション向け、発見順位順)

F.3 の校正レビュー後も残っているもの (F.3 で部分対応した項目は注記)。

**【2026-07-03 追記】このリストの大半は F.4/F.5 起点の改善サイクルで解消済み**:
F2a/F2b (a11y) ✅ / F2c (autosave) ✅ / F2f (退避) ✅ / F2g (infeasibility) ✅ /
F2k (labelRefs) ✅ / F2n・F2o・F2p ✅ / F2h のうち H3・H5 ✅。
**【同日さらに追記】小粒バッチで F2d / F2e / F2h 前段 / F2i / F2j / F2m も
✅ 解消。未解消は F2l 残りのみ — 現在の一覧は §G を参照**。
以下は発見時の記録として保持。

- ✅ **F2a (a11y, 中)**: キーボード到達不能な操作群 — NG マトリクスの
  `<td onClick>` (AbsenceNgPanel)、クラス優先度セル (ClassPriority)、
  タブ削除 `<span onClick>`・改名 dblclick のみ (TabBar)、ContextMenu の
  全機能 (キーボード代替なし・Escape で閉じない)。
  **✅ 修正 (2026-07-03)**: NG マトリクス / クラス優先度セルは
  role="button" + tabIndex=0 + Enter/Space + aria-label (状態入り) +
  focus-visible ring。TabBar は F2=改名 / Delete=削除 (確認あり) を
  tablist キーハンドラに追加し × を aria-label 付き button 化 (tabIndex=-1、
  Tab 順は roving tabindex を維持)。ContextMenu は開いたら先頭項目へ
  フォーカス + ↑↓ ナビ (wrap) + Escape で閉じる + role="menu""
- ✅ **F2b (a11y, 中)**: ScheduleCell の矢印ナビが select のネイティブ
  キー操作を preventDefault で全て潰す (Firefox で値変更がほぼ不可能の
  恐れ)。Alt+↓ 等は素通しにする除外が必要 (ScheduleCell.jsx
  handleCellNavigation)。※ F.3 で disabled セルのスキップは実装済み、
  ネイティブ操作の素通しが残。
  **✅ 修正 (2026-07-03)**: Alt / Ctrl / Meta 付きの矢印は素通しにした
  (Alt+↓ = ドロップダウンを開く等)。素の矢印のみセル間ナビに使う
- **F2c (小)**: autosave が実は debounce されていない — useHistoryStack は
  毎 dispatch で project 全体を同期 JSON.stringify + setItem
  (debounce はステータス表示のみ)。大規模プロジェクトで入力レイテンシ源
- **F2d (小)**: no-op アクションが履歴を汚す — 変化ゼロでも新 object を
  返す action が複数あり、実効 Undo 深度 (MAX 50) を削る。
  ※ subject/reorder・tab/switch・Header 名前編集は個別ガード済み、
  一般的な no-op 検出 (reducer wrap 層での deep-equal 等) が残
- **F2e (小)**: cell/swap が dragstart 時点の payload を信頼し、現在の
  schedule を読まない (狭い競合窓で stale 書き込み・lock 剥がし)
- **F2f (小)**: 保存データが migration 中に throw するとデフォルトに
  フォールバックし、最初の編集の autosave が元データを上書きして復旧不能に
  (壊れたデータの退避コピーを別キーに残すべき)
- **F2g (小)**: computeInfeasibilities C1 (noTeacherForSlot) の false
  positive — クォータ上そのスロットに置く必要が無い科目も「致命」扱い。
  ※ C2 (capacity) 側は F.3 で合同割引・時限数上限を反映済み、C1 が残
- **F2h (nit)**: NG CSV 重複キーが空白結合 (`name date period`) で
  名前に空白を含む講師と衝突し得る / renameHeader の重複ラベル許容
  (H3: externalCounts キー衝突で片方消失) / entity ID 再利用 × snapshot
  復元の化け (H4) / クラス rename・削除で teacher.ngClasses /
  priorityClasses が非追従 (H5)

※ H3/H4/H5 は F2h にまとめたが元レビューでは High 判定。rename/削除系の
   参照整合はまとめて 1 セッションで設計するのが良い (ラベルベース参照の
   cascade を一元化するヘルパーの導入を検討)。

### F.3 校正レビュー (2026-07-02、8 観点 × 個別検証) の結果

F.1 の修正自体をプロ校正者視点で再レビュー。候補 14 件を個別検証し
13 CONFIRMED / 1 PLAUSIBLE — **全 14 件を同日修正済み** (commit 参照)。
主な回帰: select disabled 化による矢印ナビ停止 / IME Esc での draft 全破棄 /
リスタートの探索深度キャップ / quotaCellMismatch のバッジ常時点灯。
主な穴埋め: JSON 読込後の stale 生成結果 / effectiveConfig の periods 絞り /
時限プール削除の NG cascade / ラベル照合の最長一致化 / 合同の capacity 割引。

レビューで出た**構造改善の提案 (F2 系に追加、F2l 以外は解消済み)**:
- ✅ **F2i**: `effectiveConfigForTab(project, tab)` を scheduleKey.js に新設し、
  同型合成を集約 — E-3 型の「絞り忘れ」の構造的再発防止
  → **2026-07-03 実装済み** (§G.4 参照)
- ✅ **F2j**: collectOtherTabsUsage (autoGenerator) と computeGlobalUsage
  (analysisHelpers) の集計規則統合 (合同 dedupe キーで既に一度食い違った)
  → **2026-07-03 実装済み** (utils/tabUsage.js、§G.4 参照)
- ✅ **F2k**: ラベルベース参照の cascade (削除/リネーム) を単一モジュールへ
  一元化 (makeNgKey/makeExternalKey のパース知識が 5 箇所に分散)
  → **2026-07-02 実装済み** (utils/labelRefs.js)
- ✅ **F2l**: draft-commit 入力と dismissable-popover の共有フック化
  → **2026-07-03 完了** (useDismissablePopover / DraftNumberInput。
  3 つの draft テキスト入力の統合のみ設計判断で見送り。§G.4 参照)
- ✅ **F2m**: infeasibility 種別の label/suggest レジストリ化 (Toolbar と
  fixSuggestions の同型 4 連ブロック解消)
  → **2026-07-03 実装済み** (INFEASIBILITY_KINDS、§G.4 参照)
- ✅ **F2n**: 生成結果の失効条件一般化 (現状はタブ削除・プロジェクト差替のみ。
  生成後の config 変更 (クラス削除・使う日 off・クォータ変更) では
  stale な案を採用できる。config fingerprint での無効化を検討)
  → **2026-07-02 実装済み** (F.4 推奨着手順 5 参照)

### F.4 2026-07-02 再チェック (koushu-jikanwari-check セッション) の結果

F.1/F.3 マージ後の main に対して、ベースライン検証 + F.2 全項目の現存確認 +
新規の目でのコード再読を実施。

**ベースライン**: lint 0 / typecheck 0 / テスト 77 files・1573 件全 PASS /
production build 成功 (excelExport chunk 警告のみ、期待動作)。

**F.2 の現存確認** — 全項目が現存 (該当箇所を行レベルで再特定済み):
- F2a: AbsenceNgPanel の NG マトリクス `<td onClick>`、ClassPriority の
  `<td onClick>`、TabBar の削除 `<span onClick>`・改名 dblclick、
  ContextMenu (Escape で閉じない・focus 移動なし)
- F2b: ScheduleCell `handleCellNavigation` が矢印キーを無条件
  `preventDefault` (Alt+↓ 等の素通し無し・modifier チェック無し)
- F2c: useHistoryStack の autosave は毎 dispatch で同期 stringify+setItem
  (debounce はステータス表示のみ)。tab/switch でも全量書き込み
- F2d: no-op ガード無しの action が残存 — tab/rename (同名) /
  config/setSubjectCount (同値) / subject/setColor (同色) /
  project/updateName (同名) / combinedGroup/update (同値)
- F2e: cell/swap は dragstart 時点の payload を信頼 (現 schedule 不読)
- F2f: loadInitialProject の migrate/validate 失敗 → デフォルトへ
  フォールバック → 最初の編集の autosave が元データを上書きし復旧不能
  (退避コピー無し)
- F2g: computeInfeasibilities C1 (noTeacherForSlot) はクォータを見ない。
  **増幅ケースを新発見**: クォータ 0 の科目も全 (date×period) を走査する
  ため、担当者ゼロ × クォータ 0 の科目 1 つで dates×periods 件の
  「致命」が出る (例 6 日×3 限 = 18 件のノイズ)
- F2h: NG CSV の空白結合 dedupe キー / renameHeader の重複ラベル許容
  (H3) / entity ID 再利用 × snapshot (H4: config/setList は最小空き ID を
  再利用する) / class rename・削除で teacher.ngClasses / priorityClasses
  非追従 (H5: renameHeader type='class' は combinedGroups しか更新しない)
- F2n: BuilderApp の失効は project.createdAt 変化 + applyPattern の
  タブ存在チェックのみ

**新規発見 (F2 系に追加)**:
- **F2o (小)**: `teacher/rename` の externalCounts キー書き換えが
  `k.replace('-旧名', '-新名')` で**最初の一致**を置換する
  (projectReducer)。日付ラベルが `-旧名` を含むと日付側が壊れる
  (例: 日付「8/1-田中」×講師「田中」)。dates/removeFromPool や
  config/setList(periods) は最長一致で対応済みなのにここだけ素朴
  replace。F2k (ラベル参照 cascade の一元化) で吸収するのが良い
- ✅ **F2p (小)**: タブ ID 再利用 × 生成結果。最大 ID のタブを削除 →
  新タブ追加 (tab/add は max+1) で ID が再利用され、残っている生成結果の
  「この案を採用」(schedule/applyPattern は ID 存在チェックのみ) が
  無関係な新タブへ旧案を書き込める。H4 と同族で、F2n の fingerprint
  失効を入れれば同時に解消する
- **docs**: E2f の「live worker イベントが残」は stale だった (実装済み)。
  本セクションと同時に修正

**リスク再確認**: R1 (sync fallback は cancel 不能・同期実行) は現存。
Worker が使える環境では影響なし。

**推奨着手順 (次セッション向け)**:
1. ~~**F2f**~~ ✅ 完了 (F.5 系統 A と同時対応) — 読込失敗時に原本を
   `builder.schedule_project_corrupt` へ退避し、toast に退避先を明記
2. ~~**F2c**~~ ✅ 完了 (F.5 小粒セットと同時対応) — 実書き込みを 800ms
   debounce 化し、アンマウント / pagehide / beforeunload で flush
3. ~~**F2g**~~ ✅ 完了 (F.5 と同時対応) — C1 をクォータ考慮に再設計
   (クォータ 0 除外 / 担当者ゼロは C2 に一本化 / 置ける日数 < クォータの
   ときだけ丸ふさがりの日を列挙)
4. ~~**rename/削除系の参照整合まとめ**~~ ✅ 完了 (2026-07-02) —
   `utils/labelRefs.js` を新設しラベルキーのパース知識を一元化 (F2k)。
   同時に修正: **H3** (renameHeader の重複ラベルを reject + ContextMenu で
   理由 toast) / **H5** (クラス rename に teacher.ngClasses/priorityClasses
   が追従、config/setList のクラス削除で参照を掃除〔他タブの同名は温存〕) /
   **F2o** (teacher/rename の externalCounts を suffix-slice 置換に)。
   reducer のローカルヘルパー 5 個を labelRefs へ移設。
   NG CSV の空白結合 dedupe (F2h 前段) は実害が「重複行の skip 漏れ」のみ
   なので保留
5. ~~**F2n (+F2p)**~~ ✅ 完了 (2026-07-02) — `utils/generationFingerprint.js`
   を新設。生成開始時に「使う日・時限・クラス・クォータ・合同・生成制約」の
   fingerprint を捕捉し、project 変化で一致しなくなったら生成結果を破棄
   (warning toast)。タブ削除は fingerprint=null で検出され、同 ID 再作成
   (F2p) も削除時点で破棄済みになる。teachers / 外部コマ / schedule の変更
   では破棄しない (構造は壊れず違反 UI が検出する領域。理由はモジュールの
   コメントに明記)
6. ~~**F2a/F2b**~~ ✅ 完了 (2026-07-03) — a11y まとめ対応。テスト +17
   (TabBar 4 / ClassPriority 3 / ContextMenu 5 / ScheduleCell 3 /
   NG マトリクス 2)

※ F.5 の並列レビュー結果を踏まえた統合版の推奨順は F.5 末尾を参照。

### F.5 2026-07-02 並列レビュー第 2 波 (F.4 の未カバー領域) の結果

F.4 で精読済みの箇所を除外し、4 班 (utils 深掘り / ConfigModal 大物 /
メイン UI・IO / 制約・小物) で並列レビュー。既知 F2a-F2p との重複は排除済み。
主要な指摘はエージェントの再現テストに加えて本体側でもコード裏取り済み。

#### 系統 A: JSON 読込の検証・正規化の穴 (クラッシュループ級、最優先)

**✅ F5a-F5e + F2f 対応済み (2026-07-02)、F5f も 2026-07-03 に対応済みで
系統 A は完了。実装方針:**
- 「reject より正規化」— validateProjectShape は据え置き (tabs/config/schedule
  の致命的構造のみ)、**migrateProject が要素レベルまで正規化**する方に寄せた。
  reject するとフォールバックでユーザデータを失うが、正規化なら型崩れ
  フィールドだけ既定値に落ちて残りは救える
- `normalizeTeacherFields` / `normalizeCombinedGroups` を scheduleKey.js に
  新設 (純粋関数・no-op 参照保存)。combinedGroups/externalSessions/subjects/
  externalCounts/snapshots の非配列・型崩れも既定値へ (F5a/F5b/F5c)
- **F5d は migrate 時 clamp で対応** (solver 内 clamp ではない)。state への
  全流入経路 (JSON 読込 / テンプレート適用 = migrate 経由、UI 編集 = reducer)
  が clamp 済みになるので solver は保存値を信頼してよい。clamp 関数は
  `utils/generationParams.js` へ切り出し (scheduleKey ← constants の循環回避、
  constants.js から再エクスポートで既存 import 互換)
- **F2f**: loadInitialProject の読込失敗時、フォールバック前に原本を
  `STORAGE_KEY_PROJECT_BACKUP` (builder.schedule_project_corrupt) へ退避し、
  toast (loadError) に退避先を明記
- **統合テスト** `utils/projectLoadIntegrity.test.js` 新設: 「validate 通過
  JSON は migrate + 主要 consumer (render 相当 / computeGlobalUsage / solver)
  の初回利用でクラッシュしない」を型崩れ fixture 13 種で固定 (テストの穴 3)
- テスト +43 (scheduleKey 正規化 13 / projectFactory 退避+guard 7 /
  統合 15 / useLongPress click 抑止 3 / useFocusTrap 解除側 3 ほか)

`validateProjectShape` (E3d) は tabs/teachers/dates/periods/classes/
subjectCounts/schedule しか見ず、`migrateProject` も以下を正規化しないため、
外部 JSON 経由で壊れた形が入ると **render で TypeError → autosave が汚染を
永続化 → リロードしても再クラッシュ** (localStorage 手動削除が必要) になる
— **という状態だった (以下は対応前の記録)**。

- ✅ **F5a (High)**: `combinedGroups: {}` / `externalSessions: {}` /
  `subjects: "文字列"` が素通し。`combinedGroups.find` (scheduleKey.js
  findCombinedGroup 経由、常時マウントの SummaryPanel から到達) /
  `externalSessions.forEach` (autoGenerator / analysisHelpers) で crash。
  `snapshots: {}` + version≤3 は migrateProjectV3toV4 で throw
- ✅ **F5b (High)**: teacher に `subjects` が無いと、(同名講師ありなら)
  `detectTeacherDiffs` の guard 漏れ (projectFactory.js:38 —
  36 行目はガード済みなのに 38 行目は素通し) で読込拒否、
  (衝突なしなら) 読込成功後 ScheduleCell の `t.subjects.includes` で
  全画面クラッシュ。reducer の subject/remove・teacher/toggleSubject も無防備
- ✅ **F5c (Medium)**: combinedGroups の `dates` キー欠落で
  `g.dates.includes` が TypeError (F5a と同根)
- ✅ **F5d (Medium)**: ソルバが `project.maxDailyHours ?? デフォルト` を
  **clamp なしの生値**で使用 (autoGenerator.js:142-147)。UI は
  `resolveGenerationParams` で clamp 表示するため乖離。`maxDailyHours: 0`
  の JSON で「UI は 1 と表示・実際は全講師除外で全コマ未定」になり原因不明
- ✅ **F5e (Low)**: version≤2 で config.dates/periods 欠落 → migrate 全体が
  TypeError (validateProjectShape は v4 互換のため optional 扱い)
- ✅ **F5f (Low)**: v2/v3 混在 dim + ID キーの schedule は
  migrateTabV2toV3 のインデックス前提でシフト/消失 (正規経路では混在時
  schedule 空のため実害は外部データのみ)。
  **✅ 修正 (2026-07-03)**: キー成分の解釈を次元別に分離 (§G.3 参照)

**修正方向 (当初案)**: validateProjectShape の対象拡大 + migrateProject での
フィールド正規化 + ソルバも resolveGenerationParams を使う、だったが、
実装は「migrate 正規化 + migrate 時 clamp」に一本化した (冒頭の実装方針参照。
solver 内 clamp はテストの maxIterations=1 のような意図的な範囲外指定と
衝突するため見送り)。

#### 系統 B: Excel 出力が throw する名前

- ✅ **F5g (Medium)**: `uniqueSheetName` の重複判定が case-sensitive
  (`workbook.getWorksheet`) なのに exceljs の addWorksheet は
  case-insensitive で throw。"classA"/"CLASSA" 等、大小文字違いの
  タブ名・講師名・科目名で出力が恒久的に失敗 (再現確認済み。日本語運用では
  遭遇率低のため Medium)
- ✅ **F5h (Medium)**: `sanitizeSheetName` がアポストロフィ非除去。先頭/末尾
  `'` の名前で exceljs が throw (再現確認済み)
- ✅ **F5i (Low)**: 講師名が「全講師リスト」だと固定名
  `addWorksheet('全講師リスト')` (uniqueSheetName 不通) が重複 throw

#### 系統 C: 設定モーダル UI

- ✅ **F5j (High)**: 「まとめて登録」の期間 (開始日〜終了日) が **日付プールの
  挿入順の positional slice** で解決される (AbsenceNgPanel
  `dateLabelsInRange`)。タブ B で前倒しの日付を後から追加するとプールは
  末尾 push (tabDates/setByLabels) でカレンダー順と乖離し、
  「7/15〜7/25」指定が別の日群に化けて一括 NG / セッションが誤登録される。
  BasicSettings は表示を sortPoolDatesByCalendar で直しており、乖離は
  実際に起こる前提の状態。select の並びも生順で分かりにくい。
  **✅ 修正 (2026-07-02)**: パネル冒頭の `poolDates` を
  `sortPoolDatesByCalendar` でカレンダー順に統一。期間 slice・select・
  NG マトリクス列・クイックグリッドの並びが BasicSettings 表示と揃う
  (パース不能ラベルは末尾・安定順)。回帰テスト +2 (AbsenceNgPanel.test.jsx)
- ✅ **F5k (Medium)**: ConfigModal のプロジェクト名入力が
  `useState(project.name)` 初期化のみで stale 化。モーダル内テンプレート
  適用・undo・リセット後に旧名を表示し、blur で**新名を旧名で上書き**
- ✅ **F5l (Medium)**: プリセット適用が部分上書き (`if (p.endTime)` 等)。
  開始時刻のみのプリセット適用で前回の終了時刻・メモが残留した混成
  フォームになり、意図しない広域自動NGが登録される
- ✅ **F5m (Medium)**: プリセット編集フォームが「期間なし」を表現できない。
  期間なしプリセットを改名だけして保存するとプール先頭日の期間が勝手に
  付与される。プール外ラベルの期間も編集を開くだけで silent 置換
- ✅ **F5n (Medium)**: 合同グループの**編集**経路 (setField → 即 dispatch) が
  無検証で、クラス 1 個以下・`dates: []` のグループが恒久化する
  (新規追加側には classes.length < 2 ガードあり。赤字警告は表示のみ)
- ✅ **F5o (Low)**: クイックグリッド / SubjectManager の数値入力が負数の直接
  入力を受け付ける (`parseInt(value) || 0` がそのまま格納)。externalCounts
  の負数は講師日次合計を過小評価し過負荷警告を見逃す
- **F5p (Low・要検証)**: 他タブで作った合同グループを編集すると他タブの
  クラスが未選択表示になり、解除も不能 (タブ混成グループが作れる)。
  combinedGroups が project 共有ラベル参照なので仕様の可能性あり、要設計判断

#### 系統 D: focus / 入力系

- ✅ **F5q (Medium)**: useFocusTrap は**フォーカスが trap 外にあるときの前方
  Tab を捕捉しない** (`!root.contains(active)` の救済が Shift+Tab 分岐に
  しかない)。オーバーレイクリック → Tab でモーダル背後の UI を操作できる
- ✅ **F5r (Medium)**: useFocusTrap の Escape が `e.isComposing` を見ない。
  **IME 変換キャンセルの Escape でダイアログごと閉じる** (InputModal では
  入力消失)。日本語入力前提のアプリなので発生頻度高
- **F5s (Low・要検証)**: useLongPress のゴースト click (メニューが指の
  真下に出るため長押し後の click が先頭メニュー項目を誤爆しうる) と、
  抑止フラグの解除漏れ (ハイブリッド端末で次のマウスクリック 1 回が無視)。
  実機検証が必要

#### 系統 E: ソルバ / 分析の整合

- ✅ **F5t (Medium)**: 連続コマ制約 (E2c) の `isOccupied` が**自タブの
  tempSch しか見ない**。H2 (同時限 busy / 日次上限) は他タブを合算するのに
  連続だけ非考慮で、学年横断では上限超えの連続が生成される
- ✅ **F5u (Medium)**: SummaryPanel「講師別コマ数 (全タブ合計)」が
  `teacherDailyCounts[].total` (= 講習セル + external) を合算。予備校等の
  外部コマが混入し、しかも「その日にセルがある日だけ」混入する不定値。
  `.current` 合算にすべきと思われる (orphan 講師名の漏れも非対称)
- ✅ **F5v (Medium)**: v3→v4 migration で「日程 (時限) 0 のタブ」が
  `oldDateIds.length > 0` 条件により activeDateIds 未設定 = **全日使用**に
  化ける (正しくは `[]`)
- ✅ **F5w (Medium)**: ソルバが「空 + ロック済み」セルに科目・講師を
  書き込んでいた。**仕様決定 (2026-07-02、ユーザ判断): 「空 lock = この枠は
  空けておく」**。
  **✅ 実装**: slot 構築で空ロックセルを除外 (totalSlots にも数えない、
  backtrack の空ロック分岐は到達不能になり削除)。quotaCellMismatch (C3) は
  「使う日 × 使う時限 − 空ロック」の生成対象セル数で判定するよう変更
  (クラスごとにロック数が違う場合は不一致クラスのみ item 化、Toolbar
  ラベルに【クラス】と空ロック数を表示)。科目だけ事前指定 + ロックは
  従来どおり講師のみ自動で埋める。合同の相手クラスが空ロックの場合は
  従来から合同不成立 (既存挙動をテストで固定)。USER_GUIDE に明記
- ✅ **F5x (Low)**: computeDashboard (進捗バー) が非表示の温存セルも filled に
  数える (E-3 絞り忘れの残党。violation/生成/Excel は絞り済み)。
  **✅ 修正 (2026-07-02)**: parseKey + 可視 id Set で filter
- ✅ **F5y (Low)**: 歯抜け時限タブ (activePeriodIds=[1限,3限]) で連続コマ制約が
  実際は休憩を挟むのに「連続」と誤判定 (過剰に候補を弾く)
- ✅ **F5z (Low)**: 同一科目で同一クラスを共有する合同グループが
  重複登録でき、伝播・集計は first-match のみで不整合。
  **✅ 修正 (2026-07-03)**: findConflictingCombinedGroup + draft 検証で
  登録・編集時に弾く (JSON 経由の流入は残、§G.3 参照)

#### 系統 F: その他

- ✅ **F5aa (Medium・要実機確認)**: dragstart で `dataTransfer.setData()` を
  呼ばないため **Firefox では HTML5 drag が開始しない**既知仕様に抵触
  (ScheduleTable)。`setData('text/plain', k)` の 1 行で解消
- ✅ **テストの穴** (3 件とも 2026-07-02 対応済み): useLongPress の click 抑止
  +3 / useFocusTrap の trapStack 解除側・フォーカス復帰・focusable ゼロ +3 /
  「validate 通過 JSON は migrate と初回利用でクラッシュしない」統合テスト
  (projectLoadIntegrity.test.js) を新設

#### F.4 + F.5 統合の推奨着手順

1. ~~**系統 A + F2f**~~ ✅ 完了 (2026-07-02) — migrate 正規化 + F2f 退避 +
   統合テスト + テストの穴 3 件。F5f (v2/v3 混在 dim) のみ残 (要検証・外部データ限定)
2. ~~**F5j**~~ ✅ 完了 (2026-07-02) — poolDates をカレンダーソートに統一
3. ~~**小粒即効セット**~~ ✅ 完了 (2026-07-02) — F2c (debounce+flush) /
   F5aa (setData) / F5q・F5r (focus trap、親アプリ側の同一実装にも適用) /
   F5g-F5i (Excel シート名)。回帰テスト +9 (autosave 5 / focus trap 3 /
   Excel 3、既存 2 件は debounce 対応に更新)
4. ~~**F2g + F5x**~~ ✅ 完了 (2026-07-02) — noTeacherForSlot をクォータ考慮に
   再設計 (真に構造的に解けないときだけ「致命」)、進捗バーの E-3 絞り込み。
   テスト: C1 の旧仕様 3 件を新セマンティクスに書換 + 新規 4 件 / dashboard +1
5. ~~**設定モーダル UI まとめ**~~ ✅ 完了 (2026-07-02) — F5k (名前 draft を
   project.name に同期) / F5l (プリセット適用は時刻・メモ全置換) / F5m
   (「期間なし」を第一級化、先頭日への silent snap を廃止) / F5n
   (合同グループ編集を draft-commit 化 + 対象日 0 日の検証を新規側にも追加) /
   F5o (負数を reducer で 0 に clamp)。F5p (他タブグループの編集) は
   仕様判断が必要なため未着手のまま残す。テスト +11
   (CombinedGroupSettings 新規 5 / AbsenceNgPanel +3 / ConfigModal +1 /
   reducer +2)
6. ~~**ソルバ整合 (fingerprint 以外)**~~ ✅ 完了 (2026-07-02) — F5t (連続コマ
   判定に他タブの busy を合算) / F5y (判定をプール全時限の並びに変更、歯抜け
   タブの誤隣接を解消) / F5v (v3→v4 で 0 日タブの subset を保存) / F5u
   (全タブ合計を .current に)。テスト +6。
   F2n/F2p は generationFingerprint で ✅ 完了 (2026-07-02、F.4 の 5 参照)。
   F5w は仕様決定のうえ ✅ 完了 (2026-07-02、「空 lock = 空けておく」)
7. **参照整合 ✅ (2026-07-02) / a11y ✅ (2026-07-03、F.4 の 6 参照)**。
   **2026-07-03 小粒バッチ ×2 で F2d / F2e / F2h 前段 / F5z / F5f /
   F2l も ✅**。
   **残り (すべて判断待ち or 実機検証)**: F5p (他タブ合同グループの編集、
   仕様判断) / F5s (long-press ゴースト click、実機検証) / A7 (Shift+?
   実機検証、既存)

---

## G. 現在の残課題 (2026-07-03 一本化)

F.2/F.4/F.5 に散在していた残課題と E 系未着手を 1 箇所に集約する。
新しい課題はここに追記し、着手したら ✅ を付けて出典セクションも更新する。

### G.1 判断待ち (実装前にユーザ/PM の決定が必要)

- ✅ **F5p** (2026-07-03 案 (b) で実装): 他タブ由来 (= 現タブに無いクラス /
  日程ラベルを含む) 合同グループは現タブから**読み取り専用**。編集ボタンを
  disabled にし「🔒 他タブのクラス・日程 (...) を含むため、このタブでは
  編集できません」を表示。削除は孤立グループ (作成元タブが消えた等) の
  掃除経路として全タブで許可。テスト 4 件 (CombinedGroupSettings.test.jsx)
- **E5 系の着手判断** (壊す系): ~~E5e TypeScript 化~~ ✅ 完了 (2026-07-03)。
  残る壊す系は E5b 完全 ID 化 → E5c style 統一 の順が推奨
  (E 系末尾の表参照)。着手は要相談

### G.2 実機・実環境での検証 (コード変更なし or 検証後に判断)

- **R1**: 本番 (GitHub Pages) ブラウザでの Worker 動作確認。CSP で blob が
  塞がれる環境では sync fallback (cancel 不能・UI ブロック) に落ちる
- **F5s**: useLongPress のゴースト click (メニューが指の真下に出るため
  長押し後の click が先頭項目を誤爆しうる) / 抑止フラグの解除漏れ。
  iOS Safari 等での実機検証が必要
- **E1a/E1f 残**: タッチ CSS (44px min-height / ダブルタップズーム抑止 /
  長押し中の選択抑止) とモバイルレイアウト全般の実機確認
  (コード側は 2026-07-03 完了)
- **C4 残**: exceljs 出力の見栄え (科目カラー / 結合 / 罫線 / 列幅) の目視確認
- **A7** (CLAUDE.md 既存): Shift+? の US/JP キーレイアウト実機検証
- **スクリーンリーダー実機検証**: F2a で操作は可能になったが NVDA/VoiceOver
  での通し確認は未実施

### G.3 小粒の未修正バグ (実害小・優先度低)

- ✅ **F2d** (2026-07-03): 同値 commit の no-op ガードを残り 5 action
  (tab/rename・config/setSubjectCount・subject/setColor・project/updateName・
  combinedGroup/update) に追加。**wrap 層での deep-equal 一般化は不採用と
  決定** — 毎 dispatch の深い比較は大規模 project で autosave 直列化 (F2c)
  と同型のコストになるため、O(1) の個別ガードで完結させる。今後 action を
  追加するときは同値 no-op ガードを入れる (レビュー観点に含める)
- ✅ **F2e** (2026-07-03): cell/swap の payload をキーのみに変更し、内容・
  locked 判定は reducer が dispatch 時点の schedule から読む。source が
  空になっていた場合と同一キーは no-op
- ✅ **F2h 前段** (2026-07-03): NG CSV の dedupe キーを空白結合から
  JSON 配列 (`JSON.stringify([name, date, period])`) に変更
- ✅ **F5z** (2026-07-03): `findConflictingCombinedGroup` を scheduleKey.js に
  新設し、CombinedGroupSettings の draft 検証で「同一科目でクラスと対象日の
  両方が重なる」グループの登録・編集を弾く。
  **残り (新規メモ)**: ガードは UI 登録経路のみ。JSON 読込・テンプレート
  適用経由では重複グループが依然流入しうる (migrate 側での警告 or 正規化は
  未実装。伝播・集計が first-match なのは従来どおりなので実害は限定的)
- ✅ **F5f** (2026-07-03): migrateTabV2toV3 の schedule キー解釈を次元別に
  分離。v3 次元 (既に {id,label}) のキー成分は「ID」として存在確認つき
  素通し、v2 次元 (string[]) のみ「配列位置」→ ID 変換。歯抜け ID を含む
  外部 JSON でセルが隣へシフト / 消失する問題を解消
- ✅ **E5e 回帰 (2026-07-03 ユーザ報告で発覚・修正)**: TypeScript 化で
  builder の非テストソースが全て .ts/.tsx になったのに、tailwind.config.js
  の content グロブが `**/*.{js,jsx}` のままだったため、Tailwind が
  ユーティリティクラスをほぼ全てパージし builder UI が無スタイル
  (素の HTML) になっていた。グロブに ts/tsx を追加して解消
  (BuilderApp の CSS: 1.65 kB → 22.7 kB)。**教訓: ファイル拡張子を変える
  リファクタでは tailwind.config 等ビルド設定の content グロブも要追従**

### G.4 構造改善の提案 (F.3 起源)

- ✅ **F2i** (2026-07-03): `effectiveConfigForTab(project, tab)` を
  scheduleKey.js に新設し、同型合成 11 箇所 (useProject / autoGenerator ×2 /
  analysisHelpers ×2 / excelExport ×3 / SummaryPanel / projectReducer ×2) を
  集約。projectLoadIntegrity テストの render 相当経路も同じ入口を通す。
  **dates / periods を対で絞る新規コードは必ずこの関数を使うこと**
- ✅ **F2j** (2026-07-03): `utils/tabUsage.js` の `forEachCountedAssignment`
  に「どのセルを 1 コマと数えるか」(exempt 除外・stale 除外・合同 dedupe) を
  一元化。collectOtherTabsUsage / computeGlobalUsage は集計だけを行う
- ✅ **F2l** (2026-07-03 完了):
  - **dismissable-popover**: `hooks/useDismissablePopover.js` に共有化
    (Header の Excel メニュー / Toolbar の違反 popover / SnapshotMenu)。
    Escape は IME 変換中を無視する改善込み
  - **数値入力の draft 化**: `components/ConfigModal/DraftNumberInput.jsx`
    を新設し、SubjectManager (タブ別コマ数) と AbsenceNgPanel (外部コマ数
    グリッド) の keystroke ごと dispatch を blur/Enter 時 1 回の commit に。
    teacher/setExternalCount に同値 no-op ガードも追加 (F2d 同型)
  - **見送り (設計判断)**: DraftListTextarea / InlineNameEdit / ParamRow の
    3 つの draft-commit テキスト入力を単一フックに統合する案は不採用。
    「非編集時は canonical 表示」「編集モードのトグル」「clamp + 外部同期」
    と意味論がそれぞれ異なり、共通化すると分岐だらけの抽象になる。
    現状の 3 実装はどれも 30 行以下で自己完結しており重複コストが小さい
- ✅ **F2m** (2026-07-03): `INFEASIBILITY_KINDS` レジストリ
  (utils/fixSuggestions.js) に種別ごとの label / informational / suggest を
  集約し、Toolbar と buildFixSuggestions の同型 4 連ブロックを解消。
  **新しい infeasibility 種別はレジストリに 1 エントリ足せば表示と提案の
  両方に反映される**

### G.5 機能・テストの未着手 (E 系、規模順)

小〜中: E8c GIF · E8d 残 (D 系の折りたたみ整形) ·
D7c テスト共通基盤 (**判断メモ**: 具体的な痛みが無い投機的共通化なので
当面見送り推奨 — F2l の見送りと同型の理由)
(~~E1a/E1f 残~~ ✅ コード側完了・実機確認は G.2 / ~~E1h 主要分~~ ✅
日付統一・改ページ・凡例 / ~~E4d useAnalysis プロファイル~~ ✅ 計測の結果
最適化不要 — 2026-07-03 完了)

中: E3g クロスブラウザ · E2a Excel 取込 (要 mapping UI)
(~~E3e ConfigModal sub-tests 拡充~~ ✅ +38 件 / ~~E3a Worker E2E~~ ✅
Playwright ×2 / ~~E3b xlsx round-trip~~ ✅ / ~~E3c 印刷スモーク第 1 弾~~ ✅
e2e 4 件 / ~~E4b ソルバ計測~~ ✅ bench:solver — いずれも 2026-07-03 完了)

大 (要決断): E2b wizard 本体 · E2g 履歴ブランチング · E4c/E4e/E4f パフォ系 ·
E5 系残り (ID / style / state lib / Worker 分析 — ~~TS~~ ✅ 完了) · E6a Firebase ·
E6b 同時編集 · E7 系 (AI 活用) · D5c i18n

### G.6 推奨する次の一手 (§H の親アプリ側課題も参照)

~~1. PR #141 のレビュー・マージ~~ ✅ マージ済み (2026-07-03、PR #142 も)。
~~2. 軽い一手 F2i / F5z~~ ✅ 完了 (2026-07-03 小粒バッチで F2d / F2e /
F2h前段 / F2j / F2m も同時に解消)。

~~第 2 弾: F2l / E5g~~ ✅ 完了 (2026-07-03、F5f も同時に解消)。
**G.3 / G.4 のコード側課題はこれで全て完了** — 残るのは判断待ち (G.1)、
実機検証 (G.2)、E 系の未着手 (G.5) のみ。

~~3. コードの軽い一手なら E3e~~ ✅ E3e 完了 (2026-07-03、+38 件で 1804 に)。

現在の推奨順:

1. ~~2 バッチ分の PR レビュー・マージ~~ ✅ PR #143 マージ済み (2026-07-03)
2. 実運用前に **G.2 の R1** (本番 Worker) と **C4 残** (Excel 見栄え) を確認
   — コード変更なしの検証項目で、ユーザの実環境が必要
3. ~~コードの軽い一手なら E3c か E4b~~ ✅ 両方完了 (2026-07-03。E1h 主要分・
   H1b・H1e・H2f も同セッションで解消)。~~次は E4d か D7c~~ ✅ E4d 計測完了
   (最適化不要)、D7c は見送り推奨 (G.5 の判断メモ)。
   **追加授業まわり (H1a〜H1h) はコード側全て完了** — 残る H1d (代行対応)
   は実運用で困ってから (H.1 の設計メモ参照)。
   **新規の修正・改善候補は §K (2026-07-03 棚卸し) と §L (同日、新機能・
   便利機能レビュー) に集約** — K2a は修正済み。§L は L1 (小粒 8 件) +
   L3a/L3b/L3e/L5a/L2a/L2c + L4a〜L4g + L5c まで実装済み。残る候補は
   L2b/L2d/L2e/L2f (編集系) · L3c/L3d/L3f (ソルバ系) ·
   L5b (全学年一括印刷) / L5d (親 slots から不在プレフィル、大) と、
   仕様判断待ちの L6a。**第 3 波の新規候補 35 件は §N** (同日、4 方面
   ブラッシュアップレビュー) — 特にバグ・実害系の N1a〜N1j は未修正
4. 親アプリ側の設計判断待ち: **H1d** (追加授業への代行) /
   **H2a·H2b** (プレップのデータ化・koshu type) — いずれも方針決定が先
5. ~~大きい投資は E5e TypeScript 化 から~~ ✅ **E5e は全 Phase 完了
   (2026-07-03)** — builder の非テスト source は 100% TypeScript。
   次の大物は **E5b (完全 ID 化)** か **E5c (style 統一)** (着手は要相談)
6. ~~ソルバ改善の新候補 (E4b 計測より): 科目選択の LCV 化~~ ✅ slack 順で
   実装完了 (2026-07-03)。168 コマ不均等構成が部分解 → 完全解に (E4b 参照)

---

## H. 親アプリ (原学部管理) 側の課題 (2026-07-03 新設)

講習時間割 (builder) 以外の課題をここに集約する。追加授業機能の実装
(2026-07-03、schema v15) を機に、実装時の設計判断と調査で見つかった
改善点を記録する。

### H.1 追加授業 (extraLessons) の残課題

✅ **実装済み (2026-07-03)**: データモデル (schema v15) / 管理 UI
(ExtraLessonManager、複数日一括登録) / Dashboard 日別・講師別 MonthView・
WeekView 直近バナーへの表示 / Export・Import・Reset 配線。
以下は意図的にスコープ外にした拡張:

- ✅ **H1a (2026-07-03)**: 時間割グリッドに表示日の追加授業をバナー表示。
  **設計判断**: グリッドの列は曜日ベースで特定日付の単発コマを埋め込めない
  ため、セルには挿入せず「表示日 (displayDate = 代行日 > viewDate >
  選択曜日の直近日、第N回表示と同じ意味論) の追加授業」を Dashboard 日別と
  同じ緑バナーとしてグリッド上部に出す。バナーは `ExtraLessonBanner` に
  共有化 (DashDayRow から抽出)。適用先は Dashboard 時間割モードと
  欠勤組み換えの時間割タブ。**コースマスター管理は対象外** (週次テンプレの
  編集画面で、特定日付の単発コマは文脈違いのため)。テスト +3
- ✅ **H1b (2026-07-03)**: イベントカレンダーに追加授業を表示。
  visibility トグル「追加授業」(緑・既定 OFF) を追加 — イベントカレンダー
  専用の opt-in (`includeExtraLessons`) で、MonthView の追加授業は
  「講師本人の担当コマ」なので従来どおり常時表示のまま。グリッドは
  「開始時刻 + 短ラベル」の単日バッジ、一覧行は種別ラベル・担当・教室・
  メモ付き。バッジクリックで ExtraLessonManager の編集フォームへジャンプ
  (useEditTarget/useNewEntryTarget を配線)、新規登録ボタンにも 4 種目と
  して追加。テスト +7 (EventCalendarView.test.jsx 新設 5 + Manager 2)
- ~~**H1c. 回数カウント (第N回) への通算**~~ **却下 (2026-07-03、
  ユーザ判断: 不要)**。追加授業は回数に数えない仕様で確定。
  再提案しないこと (リポジトリ CLAUDE.md の却下リストにも記載)
- **H1d. 追加授業への代行対応**: substitutions は slotId (週次 Slot) 前提。
  追加授業の担当者が休む場合は現状「編集で担当を書き換える」運用。規模: 中
  - **設計メモ (2026-07-03)**: 実装するなら Substitute に `extraLessonId`
    (slotId と排他) を追加し、SubstituteForm のピッカー・代行確定一覧・
    月次/週間/日別の「代」バッジ・集計 (tally) の全消費側を対応させる
    必要がある。触る面が広いので、実運用で「編集で書き換える」運用が
    実際に困ってから着手するのが良い (要相談)。なお削除 UX は cascade が
    生じるため confirmedRemove への切替が必要 (CLAUDE.md 削除ルール)
- ✅ **H1e (2026-07-03 確認済み)**: Dashboard 日別の追加授業バナーは
  Chromium の print メディアエミュレーションで紙面に正しく出ることを確認
  (緑バナー・種別ラベル・担当・教室とも OK)。確認中に **トップバーの
  操作ボタン群 (週間/月間・コマ追加・時間割セレクタ・🖨印刷・まとめて印刷)
  が window.print() 系の印刷に写り込むバグを発見・修正** (コンテナに
  no-print を付与。PrintButton を使う全ビューに効く)
- ✅ **H1f (2026-07-03 ユーザ報告で発覚・修正)**: 複数講師の追加授業が
  講師のスケジュールに出ないバグ。原因は区切り文字の不一致 —
  isSlotForTeacher / getSlotTeachers は "·" (U+00B7) しか複数講師区切りと
  認識しないが、IME の素の入力は "・" (U+30FB) になる。修正:
  ①マッチングを 3 種の中点 [·・･] + 前後空白 trim に拡張
  (`splitTeacherField` を biweekly.js に新設 — 既存の保存済みデータも
  表示されるようになる)、②ExtraLessonManager の保存時に正史の "·" へ
  正規化 ("·" しか見ない他の消費側との整合)。テスト +5
- ✅ **H1g (2026-07-03)**: 追加授業の 📋 コピーボタン。一覧の内容を
  フォームへ複製して新規登録状態にする (実施日は誤登録防止のため
  引き継がず選び直し)。次の講習期の一括登録が楽になる。テスト +2
- ✅ **H1h (2026-07-03)**: Cmd+K パレットで追加授業を横断検索
  (科目・種別ラベル・担当・日付・「追加授業」)。選択すると
  ExtraLessonManager の編集フォームへジャンプ (H1b の editTargetId 経路)

### H.2 調査で見つかった既存コードの改善候補 (2026-07-03)

- **H2a. プレップ/マークテストの土曜セクションが文字列マッチのハードコード**
  (`constants/schedule.js` の `isPrep`/`isMarkTest` が note/subj の
  `includes("プレップ")` 依存)。追加授業の正式データ化と合わせて、将来
  これらを extraLessons or 明示フラグに移行するとハードコードを解消できる
- **H2b. `Timetable.type: "koshu"` が型・型ガードのみで UI/ロジック未実装**
  (types.d.ts / schema.ts)。「講習」の表現が builder / koshu timetable /
  extraLessons の 3 概念に割れないよう、koshu type を正式実装するか
  廃止するかの設計判断が要る
- ✅ **H2c** (2026-07-03): ExcelGridView の回数計算が深夜 0 時跨ぎで
  更新されない問題を修正。`hooks/useToday.js` を新設 (「今日」の
  "YYYY-MM-DD" を state 化し、翌 0 時 +1 秒に setTimeout で更新・再アーム)
  し、`sessionTargetDate` の useMemo が `today` を deps に取る形に。
  テスト 4 件 (useToday.test.jsx、fake timers で日跨ぎ・再アーム・cleanup)
- ✅ **H2d** (2026-07-03): `useSessionOverridesCrud.upsert` と
  `useAdjustmentsCrud.replace` の手書き `Math.max(...)+1` を
  `nextNumericId` (schema.ts) に統一。挙動等価 (非数値 id の防御は向上)
- **H2e. 孤立データ検出 (`detectOrphans`) が import 時のみ**: slot 削除の
  cascade は useSlotsCrud にあるが、adjustments / sessionOverrides を直接
  削除しても classSets の slotIds 参照は掃除されない (FK 検証は import 時
  のみ)。新しい FK を作る際は同じ穴に注意。extraLessons は FK を持たない
  設計にしたので今回は非該当
- ✅ **H2f (2026-07-03)**: SpecialEventManager 末尾の注記に「授業として
  実施する単発コマは追加授業管理で登録 (告知イベントで代用していた場合は
  移行を推奨)」の一言を追加 (specialEvents は授業ロジックに影響しない
  設計のまま)

### H.3 運用メモ

- 追加授業の削除は cascade 無しの単純削除なので `removeWithUndo`
  (リポジトリ CLAUDE.md の削除 UX ルールどおり)。参照 (FK) を持たせる
  拡張 (H1d。H1c は却下済み) をする場合は `confirmedRemove` への切替を検討すること
- 追加授業は「その日にやる」と明示登録した単発コマなので、休講日でも
  巻き添えにせず表示する仕様 (Dashboard / MonthView とも)。終講日
  cutoff (未確定期間) では他と同様に非表示

---

## I. 2026-07-03 校正レビュー (本ブランチ全体、8 観点 × 個別検証) の結果

claude/roadmap-improvements-7hmnva の全変更 (小粒バッチ ×2 + 追加授業機能、
16 コミット) を 8 観点 (逐行 / 削除挙動 / クロスファイル / 再利用 / 単純化 /
効率 / 抽象度 / CLAUDE.md 規約) で並列レビューし、候補 14 件を個別検証。
**CONFIRMED 3 + PLAUSIBLE 7 + REFUTED 6** — 修正価値のある 7 件を同日修正済み
(commit 参照)。テスト 1763 → 1766。

### I.1 修正済み

- extraLessons の teacher 欠落レコードで isSlotForTeacher が throw
  (Firebase 別クライアント書込・localStorage 手編集経路のみ) → 正規化ラッパで防御
- describeExtraLesson が describeSlot の再実装 → 委譲に変更
- startMin / timeToMinutes のバイト同一コピー → dateHelpers.timeStartToMin に一元化
- MonthView の追加授業セルごと全走査 → useMemo 日付索引 (examPrepByDate と同型)
- projectReducer の effectiveConfig エイリアス定数 + 命名不統一 → import リネームに統一
- ExtraLessonManager の必須入力に aria-invalid / aria-describedby (SpecialEvent と同水準に)
- 末尾注記の言い過ぎ修正 (担当未入力の追加授業は講師別ビューに出ない旨を明記)

### I.2 記録のみ (実害小 or 慣習準拠と判断、対応不要)

- **合同 dedupe キーの ID 化 (F2j) と消費側ラベルキーの空間不一致**: 同一
  ラベルの date/period entity が 2 つある腐敗 JSON でのみ日次コマ数が過大に
  なる。アプリ内の全変更経路 (setList dedupe / H3 reject / v3→v4 union) は
  重複ラベルを作れないため実害は手編集データ限定。ソルバと分析の規則統一が
  目的の意図的変更
- **追加授業カードの 3 ビュー個別実装**: バッジ文言・フォント・時刻表記が
  ビューごとに異なるが、振替・特訓・代行など全イベント種別が「ビュー密度に
  合わせた個別描画」で一貫しており慣習準拠。統一コンポーネント化は全種別
  横断の別リファクタ
- **DashDayRow の cutoff 絞りが呼び出し側**: daySlots と同型の既存パターン。
  default [] で渡し忘れは安全側に倒れる
- **effectiveConfigForTab の第 1 引数名 "project"**: 実際は {dates, periods}
  しか読まない (doc comment に明記済み)。将来の拡張時は literal 呼び出し
  3 箇所 (tabUsage / analysisHelpers / useProject) に注意
- **ExtraLessonManager のフォーム state 12 useState**: SpecialEventManager と
  同型のコードベース慣習。useEditTarget/useNewEntryTarget の欠落は
  EventCalendarView 未連携 (H1b スコープ外) ゆえ妥当

### I.3 REFUTED (誤検知と確認)

import 検証迂回 (validateExportBundle が isExtraLesson を実行) /
migrateTabV2toV3 hybrid 退行 (原子性不変条件に反する形はアプリで生成不能) /
DraftNumberInput の Escape 飲み込み (DraftListTextarea 等と同じ確立済み設計) /
DashboardListView の走査非対称 (holidaysFor 等も同方式) /
no-op ガードの一般化 (F2d で不採用と記録済み) /
ParamRow と DraftNumberInput の統合 (F2l で見送りと記録済み)


---

## J. 2026-07-03 校正レビュー (claude/improvement-work-1jpkrp、4 観点 × 個別検証)

PR #144 の全変更 (11 コミット: E3e / H2c / H2d / F5p / E1a・E1f / E3a / E3b /
E5e ×4 / H1f・H1g) を 4 観点 (①TS 変換の挙動等価性 ②親アプリ変更の正確性
③builder UX 変更と CLAUDE.md 規約準拠 ④ドキュメント整合) で並列レビューし、
候補を個別検証。**コード 9 件 + ドキュメント 12 件を同日修正** (テスト
1821 → 1824)。TS 変換の式レベル変更 22 件は 21 件が等価確認、1 件のみ
非等価 (下記 J.1-2) だった。

### J.1 修正済み (コード)

1. **週次スロットの複数講師 split-brain 防止**: H1f のマッチング拡張
   ([·・･] 受理) 後、SlotForm (週次) だけ入力正規化が無く、"·" しか
   split しない読み手 7 箇所と食い違う余地があった → SlotForm 保存時にも
   "·" へ正規化し、tokenize 箇所 (StaffManagerView ×2 / subjectMatch /
   ChainSubstitutionPanel ×2 / SubstitutePickerPopover /
   ReschedulePickerPopover ×2) を splitTeacherField に統一
2. **fixSuggestions の `maxDailyHours = 0` デフォルト撤去**: TS 化で足した
   デフォルト値が旧挙動と非等価 (未指定時に「0 → N に上げる」という嘘の
   setMaxDaily 提案を生成)。production 経路 (useAnalysis) は常に数値を
   渡すため実害は無かったが、旧挙動へ復元
3. **types.ts の実形状乖離 ×2**: ExternalSession.label / memo を optional 化
   (migrate は補完しない)。Project.externalCounts は migrate 側で欠落 → {}
   補完に変更 (必須宣言との整合、テスト +1)
4. **F5p の案内文言**: 「他タブのクラス・日程」→「現在のタブに無い
   クラス・日程」(自タブの使う日から外した場合も read-only になるため
   「他タブ」は事実誤認になり得た)
5. **F5p の保存時再検証**: 編集ボタンの disabled は render 時のゲートのみで、
   編集中に Undo (Ctrl+Z は ConfigModal 表示中も window で発火する) 等で
   project が変わると draft が現タブに無いラベルを抱えたまま保存できた →
   draftError に foreign ref 検証を追加 (テスト +1)
6. **タッチ 44px のスケジュール表除外**: セル内に select が縦 2 つ並ぶため
   44px 適用で行高が ~2.5 倍になり compact モードが無効化していた →
   `.print-container` 内の button / select を除外 (セルは td 全体がタップ
   対象なので実効領域は既に広い)
7. **playwright.config の reuseExistingServer**: `true` 固定 → `!process.env.CI`
   (CI で 5173 の別プロセスを誤対象にしない慣習)
8. **eslint**: ルート設定ファイル (*.config.js) に node globals を追加
   (playwright.config の process 参照が no-undef になっていた)
9. **SlotForm 正規化のテスト** (+1) を含む上記のテスト追加一式

### J.2 修正済み (ドキュメント)

ROADMAP: テスト総数 (1814 → 実数) ×2 / 「49 ファイル」→ 67 /
Phase 3 の「hooks 12 / components 22」→ 11・21 / E5e 見出しの 🟡 残存 →
✅ / §0 未着手系統・§G.1・§G.5 の「E5 系 (TS…)」残存 → E5b/E5c のみに /
§0 表に E5 行を追加 / §H.3 の H1c 参照 (却下済み) を H1d のみに。
types.d.ts: ExtraLesson の doc コメント 2 件 (H1c 却下の反映 /
teacher 区切りは splitTeacherField 経由と明記)。
CLAUDE.md: 複数講師区切りの横断規約を新設 (正史 "·" / 入力は [·・･] 受理 /
分解は splitTeacherField)。

### J.3 記録のみ (対応不要と判断)

- **講師名自体に中黒を含むケース** (カタカナ外国名等) は splitTeacherField が
  2 名に分割する。現行の講師は日本姓のみで該当なし。**講師名に中黒は
  使わない運用とする** (複数講師の区切り専用)
- fixSuggestions の非等価は production 到達不能だった (テスト・直接呼び出し
  のみ顕在化) — 修正済みだが実害は無し
- Playwright の port 5173 固定は vite デフォルトとの整合前提 (strictPort は
  dev の UX を落とすため導入しない)

---

## K. 2026-07-03 棚卸しレビュー (3 方面並列調査) の結果

親アプリ UI / builder / データ層・横断の 3 方面を並列調査し、既出
(§E〜§J、CLAUDE.md 却下リスト) を除いた新規の発見 35 件を整理した。
確定した小粒バグ 7 件は即日修正済み (K.1)。

### K.1 修正済み (2026-07-03)

- ✅ **K1a**: Dashboard「依頼中（未確定）」カードがクリック不能だった →
  代行一覧 (依頼中フィルタ) へ遷移可能に (EventSummaryCards と同型の
  role/tabIndex/Enter·Space 付き)
- ✅ **K1b**: AllView の講師名セル (講師別スケジュールへの主要導線) が
  キーボード到達不能 → role/tabIndex/onKeyDown を追加
- ✅ **K1c**: MasterView の講師・科目フィルタが `s.teacher.includes(...)`
  の生参照で、teacher 欠落レコード (Firebase 別クライアント書込等) で
  ビューごとクラッシュしうる → null ガード
- ✅ **K1d**: ConfirmedSubsView の期間フィルタが日付クリアを握り潰し、
  入力表示 (空) と内部 state (旧値) が乖離 → 空 = その側は無制限として受理
- ✅ **K1e**: データ初期化が teacherSubjects を残す (localStorage の
  removeItem だけでは React state と Firebase が残り、リロード / 他端末
  同期で復活) → `saveTeacherSubjects({})` を追加
- ✅ **K1f**: インポート時に displayCutoff だけ migrate 未適用
  (cohorts 等の後付けフィールドが補完されない) → migrateDisplayCutoff を適用
- ✅ **K1g**: activeTimetableId が export/import 対象外で、取込後に時間割
  選択が宙吊りになりうる → export に追加 + import は取込 timetables に
  存在する ID のときだけ復元

### K.2 修正候補 (バグ疑い、価値順)

- ✅ **K2a (2026-07-03 修正)**: 講師ドロップダウンの「(計N)」が、その日に
  builder のセルがまだ無い講師の externalCounts/externalSessions 分を
  取りこぼして (計0) 表示 (solver は外部負荷で弾くのに UI は選べそうに
  見える非対称)。computeGlobalUsage で外部コマのみの (date, teacher) にも
  current=0 の entry を seed。**teacherOverDaily 違反判定は current>0 のみ
  対象にして従来挙動を維持** (builder 側で解消できない負荷は違反にしない)。
  テスト +2
- ✅ **K2b (2026-07-03 修正)**: subject/remove が当該科目の locked セルを
  「空 + locked = 空けておく」(F5w) に黙って変換していた → ロックの対象
  (科目割当) が消えた以上、locked も落として通常の未充填に戻す。テスト +1
- ✅ **K2c (2026-07-03 修正)**: dates/removeFromPool が
  externalSessionPresets の日付範囲参照を掃除しない非対称を解消 (該当
  フィールドだけ未指定に戻す。同名ラベル再追加時の誤参照を防ぐ)。テスト +1
- ✅ **K2d (2026-07-03、ユーザ判断で案 (c) を採用)**: 「未定のみが担当する
  科目」を致命の capacity 警告から **informational な新種別
  `subjectPlaceholderOnly`** に分離。⚠ バッジには数えず popover にだけ
  「実講師がまだ居ない (生成は可能)」と出す。実講師も未定も居ない科目は
  従来どおり致命の capacity のまま。テスト更新 4 + 追加 2
- ✅ **K2e (2026-07-03、ユーザ判断で現状維持に確定)**: MonthView の
  未確定期間 (終講日 cutoff 後) における代行カード・特訓シフトの表示は
  **現状どおり表示のまま**とする。日付を明示して確定させた予定なので、
  隠すと「登録したのに見えない」混乱の方が大きい。週次テンプレの投影
  (主スロット) と追加授業だけが cutoff 非表示、という仕様で確定
  (コード変更なし。再提案しないこと)
- ✅ **K2f (2026-07-03 修正)**: slotId 照合を orphanCleanup と
  useSlotsCrud の cascade でも String 正規化 (schema の toSlotIdKey と
  同一視ルールを統一)。文字列 slotId の関連データが cascade されない /
  生存スロットが孤立と誤検出される問題を解消。テスト +2
- **K2g (data・記録のみと判断 2026-07-03)**: parseLocalDate が範囲検証せず
  "2026-02-30" → 3/2 に silent ロールオーバー (dateHelpers.js:46)。
  **対応見送りの理由**: null を返す契約変更は既存呼び出し側 (biweekly /
  eachDateStrInRange) の null 未対応を壊すリスクの方が大きい。入力境界は
  isValidDateStr で防御済みで、保存/取込データの根本対策は K2i (schema の
  日付検証統一) 側でやるのが筋
- **K2h (builder・小・要検証)**: 分析キーが `${date}-${period}-${teacher}`
  の素朴結合で、ヘッダラベルに "-" を含めると衝突しうる
  (analysisHelpers.ts:84,160 / makeExternalKey)。labelRefs は cascade 側のみ対応済み
- **K2i (data・中・確実だが要設計)**: schema の日付フィールド検証が
  extraLessons/anchor だけ isIsoDate で他は isString の非対称。非 ISO
  文字列が validation を通過し dateToDay / overlapsRange を破壊しうる。
  既存データの互換 (どの形式が実在するか) を確認してから揃えること

### K.3 改良・一貫性 (UX)

- ✅ **K3a (2026-07-03)**: 確定代行一覧の日別表示に sessionCtx (第N回) /
  追加授業バナー / 調整カードを配線し、Dashboard 日別と情報密度を統一
  (makeEventHelpers は useSessionCtx に置換)
- ✅ **K3b (2026-07-03)**: クリック可能なテーブルコントロールのキーボード
  対応を横展開 — ソート列ヘッダ (AdjustmentListTab / OverrideListTab に
  tabIndex + Enter·Space + aria-sort)、月次集計の展開行 (SubTallyTab に
  tabIndex + Enter·Space + aria-expanded)、MonthView の編集用コマカード
  (role=button + tabIndex + Enter·Space)
- ✅ **K3c (2026-07-03)**: AbsenceWorkflowView の講師ドロップダウンに
  aria-expanded/aria-haspopup を追加し、Escape (IME 変換中は無視) で
  閉じられるように
- ✅ **K3d (2026-07-03)**: リスト系の空状態を底上げ — MasterListTab /
  SubListTab は「フィルタをクリア」+ 新規登録 CTA (admin のみ)、
  Adjustment/OverrideListTab は作成場所への案内文 (これらは他画面の操作から
  作られるため CTA ではなく導線案内)
- ✅ **K3e (2026-07-03)**: AbsenceSlotCard の「第N回」を Dashboard /
  MonthView と同じ青地・白文字の塗りバッジに統一 (aria-label も付与)
- ✅ **K3f (2026-07-03)**: 月次集計タブを fMonth 空で開いたら当月へ
  フォールバックする effect を追加 (集計に「月なし」は無意味なため)
- ✅ **K3g (2026-07-03)**: ContextMenu の NG メニューが現在の状態を反映
  (「🚫 NG登録」⇔「✅ NGを解除」。teacher.ngSlots × makeNgKey で判定)
- ✅ **K3h (2026-07-03)**: ロックセルへの drop 拒否に error toast を追加 /
  貼り付けメニューは clipboard 空で disabled (キーボードナビも disabled を
  スキップ)
- ✅ **K3i (2026-07-03)**: タブ名の重複ガードを追加 (reducer で no-op +
  TabBar で理由 toast。ヘッダ rename の H3 と同じ扱い)

### K.4 追加機能・便利機能

- ✅ **K4a (2026-07-03)**: builder タブ間のスケジュール複製を実装。
  非アクティブタブの ⧉ ボタン → confirm → `schedule/copyFromTab` で
  現在のタブへ複製 (Undo 可)。クラスの対応付けは **label 一致を優先、
  無ければ同じ並び位置 (index)**。対象タブが使わない日付・時限
  (activeDateIds/activePeriodIds) のセルは複製しない (不可視セルへの
  ゴミ書込防止、E-3 と同じ扱い)。テスト +6 (reducer 4 + TabBar 2)
- **K4b (中・要ベンチ)**: 自動生成の numPatterns 案を複数 Worker で並列化 —
  現状単一 worker 直列で 3 案 ~10 秒 → 理論 ~3 秒。案は独立 (シード違い)
  なので分割は素直
- ✅ **K4c (2026-07-03)**: MonthView の追加授業カードと WeekView の直近
  バナー行にクリック / Enter·Space で ExtraLessonManager の編集へジャンプ
  する導線を追加 (H1b の eventEditRequest 経路を流用)

### K.5 アーキテクチャ級 (要相談、着手前に方針決定)

- ~~**K5a (大)**: Firebase 同期がキー単位の last-writer-wins~~
  **対応不要と決定 (2026-07-03、ユーザ判断)**: 2 端末での同時編集は運用上
  発生しないため無視してよい。マージ/楽観ロックの設計はしない
  (再提案しないこと)
- ✅ **K5b (2026-07-03)**: Firebase 初回 seed を migrate 済みの値で
  書き込むよう修正 (raw のままだと旧形式が Firebase に入り他端末が毎回
  migrate し直す)
- **K5c (見送り判断 2026-07-03)**: FK 検証の対象外リレーション
  (partTimeStaff.subjectIds / teacherSubjects / adjustments.targetSlotId /
  examPrepSchedules.examPeriodId)。**ハード検証の追加は不採用**: これらの
  dangling 参照は (a) 消費側が防御済みで実害が無い (未分類フォールバック等)、
  (b) targetSlotId は orphanCleanup が「修復可能」として扱う設計であり、
  import を丸ごと拒否すると修復可能なバックアップまで取り込めなくなる。
  やるなら **detectOrphans の対象拡張 (修復志向)** が正しい方向だが、
  runtime は cascade 済みで手編集バンドル経由のみの穴なので優先度低
- **K5d (設計トレードオフ)**: isSlotForTeacher の note 部分一致は
  隔週パートナー検出のための意図的設計だが、短い講師名の過剰マッチが理論上
  ありうる (biweekly.js:193)。実害が出たらトークン化を検討
- ~~**K5e**: ソルバの講師選択に LCV / 動的 MRV を導入~~
  **検証の上で不採用 (2026-07-03)**: 日次負荷の軽い順 (load balancing) を
  実装して bench:solver で前後比較したところ、**iteration 数が全構成で
  完全一致** (探索の成否に影響なし) のまま並べ替えコストで iteration 単価が
  +30%。講師は衝突候補が事前フィルタで弾かれ、残る候補は (単科目講師なら)
  下流の充足可能性に対して対称なため、試行順が効かない。**効く余地があると
  すれば「多科目講師を温存する versatility 順」だが、それを測るには
  多科目講師入りのベンチ構成が先** (必要になったら追加)。動的 MRV も
  同様にベンチ整備が先行条件

---

## L. 2026-07-03 新機能・便利機能レビュー (4 方面並列調査) の結果

§K に続き、「新機能・こちらの方が便利」に焦点を絞って 4 方面
(編集操作 / 設定・データ入力 / 自動生成・分析 / 出力・親アプリ連携) を
並列調査した。既出 (§D〜§K、CLAUDE.md 却下リスト) を除いた新規候補を
価値順に整理し、小粒で価値が確実な L1 (8 件) は即日実装した。

### L1. 実装済み (2026-07-03、小粒バッチ)

- ✅ **L1a**: セルの科目を変更すると講師が無条件で消えていた →
  講師が新科目も担当可能 (ドロップダウン候補と同じ `subjects.includes`
  判定) なら保持。科目クリア・担当不可のときだけ空に (projectReducer
  cell/assign)。テスト +3
- ✅ **L1b**: 使う日・時限・クラスのいずれかが 0 のタブが「違反 0 = ✨」で
  正常に見えていた → TabBar に「空」バッジ (warning 色)、BasicSettings の
  「選択 0」表示にも警告文言を追加。判定は effectiveConfigForTab (F2i 準拠)。
  テスト +3
- ✅ **L1c**: JSON「開く」が講師マスタ差分ゼロだと無確認で全置換していた
  (undo は RAM のみ・autosave 即上書きでリロード後は復旧不能) →
  差分の有無に関わらず「現在の内容 (タブ N 件・割当 M コマ) が置き換わる」
  confirm を必ず挟む。講師差分があれば同じ confirm に併記。テスト +3
- ✅ **L1d**: テンプレート (STORAGE_KEY_TEMPLATES) が JSON バックアップに
  含まれず端末移行で静かに失われていた → 保存 JSON に `templates` を同梱し、
  読込時は既存を温存して追記マージ (同名+同 createdAt は skip)。
  `templates` フィールドは project state に混入しない。テスト +4
  (useJsonIO.test.jsx 新設)
- ✅ **L1e**: 生成 seed の固定・表示。`generationSeed` を生成パラメータに
  追加 (0 = 毎回ランダム = 従来挙動、GENERATION_PARAM_BOUNDS 0〜999999999、
  スライダー無しの数値入力)。結果パネルに使用 seed を表示し、⚙️ に入力
  すれば同じ設定で再現可能。E2e の実装は numPatterns/maxDaily/maxIterations
  のみで seed は未実装だった (BuilderApp が `Date.now()` 直書き)。テスト +7
- ✅ **L1f**: 印刷紙面が無記名だった (Header/TabBar が no-print) →
  印刷専用見出し (プロジェクト名 — タブ名・印刷日) を BuilderApp に追加
  (`hidden print:block`)。日付は和式 (utils/printHeader.ts、E1h と同形式)。
  テスト +3
- ✅ **L1g**: 担当科目が空の講師が「その他」グループへ静かに沈んでいた →
  TeacherManager に「担当科目未設定 N 名 (名前列挙)」の warning
  (role=alert)。'未定' は placeholder なので対象外。テスト +3
- ✅ **L1h**: 生成前の致命 infeasibility 確認。静的に完全解が出ない設定
  (noTeacherForSlot / capacity / quotaOverDays — informational は数えない)
  なら、生成前に「部分解の生成を試しますか?」の confirm を挟む。
  `countFatalInfeasibilities` を INFEASIBILITY_KINDS レジストリ (F2m) 上の
  純粋関数として追加。テスト +3

### L2. 編集操作の便利機能

- ✅ **L2a (2026-07-03)**: 講師ハイライト — Toolbar の「👁 講師で探す」
  select で選んだ講師の割当セルをグリッド上で ring 強調、他セルは薄表示
  (opacity-40)。ドラッグ中の ring とは競合しないよう isDragOver 優先。
  BuilderApp state → Toolbar / ScheduleTable → ScheduleCell の props 渡し
  (自動学習なし・明示操作のみ)。テスト +5
- **L2b (中)**: 違反の巡回ナビ — popover の「→」が各種別の firstKey のみ。
  「次/前の違反へ」で全件を順に潰せるように (Toolbar の popoverRows 構築部)
- ✅ **L2c (2026-07-03)**: 割当の反復・日列コピー —
  (1) セル右クリック「📅 この割当を全日に適用」(cell/applyToAllDates:
  同時限・同クラスの全日へ、ロック済みスキップ・合同伝播込み・confirm +
  Undo 可)、(2) 日付ヘッダ右クリック「⧉ この日の割当をコピー →」で
  複製先を選択 (schedule/copyDateColumn: 複製元が空のセルは複製先も空に、
  ロック済み複製先は温存)。テスト reducer +5 / ContextMenu +5
- **L2d (中)**: セルの Ctrl+C/V/Delete (BuilderApp のグローバル keydown が
  SELECT フォーカスで早期 return するため現状メニュー専用)
- **L2e (中)**: swap のキーボード/メニュー代替 (「切り取り → ここへ移動」)。
  現状は D&D 専用で F2a のキーボード代替方針から取り残されている
- **L2f (小)**: 貼り付けの内容プレビュー (「📋 貼り付け (英語/田中)」) /
  講師のみ貼り付け / Ctrl+ドラッグでコピー配置

### L3. ソルバ・制約の実務表現

- ✅ **L3a (2026-07-03)**: 講師別の 1 日コマ数上限 — `Teacher.maxDailyHours?`
  (正の有限値のみ有効、未設定/0 は project 全体値へフォールバック =
  `resolveTeacherDailyLimit`)。solver・分析 (teacherOverDaily) の両方が
  講師個別値を優先。UI は TeacherManager の「上限 (1日/通算)」列
  (DraftNumberInput、'未定' は対象外)。reducer は `teacher/setLimit`
  (key ホワイトリスト + F2d 同値ガード)。テスト +14
- ✅ **L3b (2026-07-03)**: 講師別の通算コマ数上限 — `Teacher.maxTotalHours?`
  (未設定/0 = 無制限)。solver は initialTotal (全タブ + 外部コマ、
  teachers × 日付プールの正引きで K2h の "-" 分解問題を回避) を pre-seed
  し tempDaily と同枠で増減。分析は新違反種別 `teacherOverTotal`
  (builder 割当ゼロの講師は数えない = K2a と同規則) + Toolbar popover に
  「講師通算上限超」セクション。**週単位上限は dates に週概念が無いので
  後続候補のまま**。テスト +13
- **L3c (中〜大)**: ソフト希望 — 「なるべく避けたい/希望」を講師試行順の
  重みに使う (ハード制約は据え置き)。K5e 却下は充足可能性の話で、これは
  同点解の質の話なので別物。着手時はその区別を明記すること
- **L3d (中)**: 日・時限方向の優先配置 (「この科目は初日に固める」等)。
  現状の優先は priorityClasses (クラス×講師) のみ
- ✅ **L3e (2026-07-03)**: 部分解の未充填内訳 — `utils/partialSummary.ts`
  の純粋関数 `summarizeUnfilled` (空ロックは F5w どおり除外、科目のみの
  セルは科目枠として配置済み扱い) で、部分解カードに「未充填 N コマ +
  セル一覧 (最大 10 + 他 N 件) + 科目別の不足」を表示。「残りだけ再生成」
  は solver が既存セルを保持する既存挙動をヒント文で案内 (採用 → 再生成)。
  テスト +7
- **L3f (中)**: 生成案の退避 — 未採用案をスナップショットへ保存して後で
  比較 (「この案をスナップショットに保存」)。案間 diff は E1d 延期の続き

### L4. 設定・入力の手間削減

- ✅ **L4a (2026-07-03)**: コマ数マトリクスの一括入力 — SubjectManager の
  列 (タブ) ヘッダに ⚡ (全科目を同じコマ数に、`config/fillSubjectCounts`)
  と ⧉ (この列の値を他の全タブへ、`config/copySubjectCountsToOthers`)。
  いずれも atomic で Undo 1 ステップ + F2d 同値ガード。テスト +7
- ✅ **L4b (2026-07-03)**: 日付プールの一括削除 — 「🗑 未使用の日を一括削除
  (N)」ボタン (`dates/removeUnusedFromPool`)。removeFromPool の cascade
  (NG・外部コマ・セッション・プリセット・合同) を `removeDatesFromPool`
  ヘルパーに共通化して単一削除と完全に同じ掃除を実施。activeDateIds
  未指定 (全日使う) のタブがあれば安全側で no-op。テスト +7
- ✅ **L4c (2026-07-03)**: CSV 未登録科目の「＋ マスタへ一括追加」ボタン —
  `subject/addMany` で atomic 追加。プレビューは commonSubjects 依存の
  useMemo なので追加と同時に警告が消える。テスト +4
- ✅ **L4d (2026-07-03)**: 科目のカンマ区切り一括追加 — 「+ 追加」の
  showInput が `,` / `、` 区切りを受け付け、複数なら `subject/addMany`。
  テスト +2
- ✅ **L4e (2026-07-03)**: 日付自動生成のライブプレビュー — 開始・終了が
  揃った時点で「生成される日付 N 日: ...」を表示、0 件は警告。テスト +3
- ✅ **L4f (2026-07-03)**: 雛形 CSV ダウンロード — 講師マスタ CSV / NG CSV
  の両パネルに「⬇ 雛形CSV」。現在の科目・講師・日付・時限ラベルを埋めた
  ヘッダ付き雛形 (utils/csvTemplates、BOM 付きで Excel 対応)。テスト +6
- ✅ **L4g (2026-07-03)**: 「使う日/時限」選択の他タブコピー — 全タブ
  まとめて表示の列ヘッダに「⧉他へ」(`tabDates/copyActiveToOthers` /
  `tabPeriods/copyActiveToOthers`)。falsy (全部使う) は null に正規化して
  コピー。テスト +7

### L5. 出力・親アプリ連携

- ✅ **L5a (2026-07-03)**: 親アプリの講師マスタ取り込み — TeacherManager の
  「🔗 親アプリから取込」ボタン (ユーザ発火なので A18 に抵触しない)。
  `utils/parentTeachers.readParentTeachers` が親の localStorage
  (キーは constants/storageKeys の LS を import、migratePartTimeStaff を
  再利用) から name + subjectIds→科目名を解決し、既存の teacher/import
  (append) へ流す。**同名かつ親側の担当が空の講師は除外** (append の
  subjects 上書きで builder 側の担当設定が消えるのを防ぐ)。confirm に
  新規/更新の内訳を表示。builder に無い担当科目は confirm に明示して
  科目マスタへ併せて追加する (§M で追補)。テスト +9
- **L5b (中)**: 全学年一括印刷 — 現状はアクティブタブ 1 枚のみ
  (Excel「全体」は全タブ入りで非対称)。印刷時のみ全タブを隠しレンダリング
  or「この学年/全学年」トグル
- ✅ **L5c (2026-07-03)**: 配布用 (注記なし) Excel — `buildScheduleWorkbook`
  に `{ clean: true }` オプションを追加し、「(中学N:計M)」の稼働カウントと
  「⚠NG」を省いて科目 + 講師名のみに ('未定' は科目のみ)。Header の Excel
  ドロップダウンに「🎒 配布用 (注記なし)」、ファイル名 suffix は「配布用」。
  テスト +3
- **L5d (大・価値高)**: 親の週次 slots から externalSessions を一括
  プレフィル — 講習期間を曜日に写像して他学年授業の不在を自動導出。
  現状は AbsenceNgPanel で全部手入力
- (参考) 親カレンダーへの書き戻しは **H2b (koshu type) の設計判断が前提**
  なのでここには含めない

### L6. 仕様判断待ち (実装前にユーザ決定が必要)

- **L6a**: 同日同クラスの同一科目をドロップダウンでは選択不可 (disabled)
  にしている一方、貼り付け・生成経由では作れて ⚠️2回 の soft warning 表示
  という非対称 (ScheduleCell.tsx の isAlreadyUsed)。「1・2 限連続で数学」を
  手動で組みたいなら disabled をやめ warning に統一 / 意図的仕様なら現状維持
  を明記して closed に

---

## M. 2026-07-03 校正レビュー (§L 3 コミット、4 観点 × 個別検証) の結果

§L の実装 3 コミット (L1 小粒 / 第 2 弾 / 第 3 弾、58 ファイル +3009 行) を
「状態管理・データ整合 / ソルバ・分析 / UI・UX・規約 / テスト・ドキュメント」
の 4 観点で並列レビューし、各指摘を個別検証した。確定した指摘は即日修正。

### M.1 修正済み (コード)

- ✅ **M1 [Critical]**: useJsonIO.ts の L1d dedupe キーに生の NUL バイト
  (U+0000) が 2 箇所埋まり、git がファイルを binary 扱い (diff/blame 不能)
  になっていた → dedupe キーを F2h と同じ `JSON.stringify([name, createdAt])`
  方式に置換してテキストへ復帰
- ✅ **M2 [High]**: schedule/copyDateColumn が per-cell の paste 意味論
  (cleanup → 伝播) を列内で積み重ねるため、合同グループの主セルを複製した
  直後に別クラスの cleanupOldCombined が巻き添えで消し、複製結果が複製元と
  一致しなかった (vitest で再現確認) → **verbatim copy 方式に変更**
  (複製元の列は既に伝播済みの整合状態なので、そのまま写すのが「複製」の
  約束に一致。合同は同一 (日付, 時限) 内で閉じるため dangling も生じない)。
  再現テスト + 合同込みテスト 4 件を追加
- ✅ **M3 [High]**: seed 再現の約束が既定運用で必ず壊れていた —
  ランダム時の表示 seed (Date.now()、13 桁) が ⚙️ 入力上限 (999999999) を
  超え、入力しても silent に clamp されて別 seed になる (3 観点が独立に指摘)
  → `resolveBaseSeed(generationSeed, now)` (generationParams) で表示 seed を
  必ず [1, max] に折り畳む (mulberry32 は 32bit なので乱数品質は不変)。
  「表示 → 入力 → clamp 不変」のテスト追加
- ✅ **M4 [Medium]**: L5a 親取込に未登録科目ガードが無く、L4c で潰した
  「見えない割当」がこの導線で再発していた → 未登録科目を confirm に明示し
  addSubjects で併せて登録
- ✅ **M5 [Medium]**: 講師プルダウンの上限警告色 (nearLimit) が全体値のみ
  参照し、L3a の講師個別上限を見ていなかった → resolveTeacherDailyLimit に統一
- ✅ **M6 [Medium]**: ハイライト中の講師をリネーム / 削除すると全セル薄表示の
  「幽霊状態」になった → 講師が実在しなくなったらハイライトを自動解除
- ✅ **M7 [Medium]**: useJsonIO に FileReader の onerror が無く、読取失敗が
  完全に silent だった → onerror で「読み込みエラー」を通知 + エラー経路の
  テスト 3 件 (壊れた JSON / 構造不正 / onerror) を追加
- ✅ **M8 [High/テスト]**: L2c と合同グループの相互作用が未テストだった →
  M2 の再現テスト含む 4 件を追加 (applyToAllDates の伝播 / 旧科目 cleanup、
  copyDateColumn の混在列 / 上書き)
- ✅ **M9 [Medium/テスト]**: L2a ハイライトの isDragOver 優先が検証不能な
  テスト構造だった → isDragOver=true でハイライト ring が譲るテストを追加
- ✅ **M10 [Low]**: 配布用 Excel 出力中にボタンが「⏳ 出力中...」に
  ならなかった → exportingType の null 判定に単純化
- ✅ **M11 [Low]**: L4d の科目一括追加が全角カンマ「，」を区切りにせず、
  重複スキップも silent だった → 区切りに「，」を追加 + 追加/スキップ件数を
  toast で通知
- ✅ **M12 [Low]**: 「全日に適用」の confirm 件数が起点日込みで実変更数と
  ズレていた → 「他の N 日へ適用しますか？」に変更
- ✅ **M13 [Low]**: fillSubjectCounts の toast (Math.round) と reducer
  (parseInt) の丸めが不一致 → UI 側で丸めを確定してから dispatch
- ✅ **M14 [Low]**: CSV 雛形の BOM が不可視文字リテラルでソース直置きだった
  → `'﻿'` エスケープに変更 + バイト列でのテストを追加
- ✅ **M15 [Low]**: teacher.maxDailyHours / maxTotalHours が migrate で
  正規化されず、外部 JSON の文字列 "3" 等が「表示は効いて見えるのに実動作は
  未設定」の乖離を生んだ → normalizeTeacherFields で正の有限数以外を削除
- ✅ **M16 [Low]**: copyActiveToOthers の同値判定が重複 id 入り配列
  (外部 JSON 由来) を multiset として誤同一視し得た → Set 比較に変更
- ✅ **M17 [Low]**: partialSummary の科目別不足が全クラス合算で、あるクラスの
  超過が別クラスの不足を相殺し得た → クラス別に max(0, quota−placed) を合算
- ✅ **M18 [Low]**: computeInfeasibilities (C2 capacity) が L3a/L3b の講師
  個別上限を見ず、静的に不可能な設定でも警告・L1h confirm が沈黙した →
  capacity を講師ごとに min(個別 1 日上限, 時限数)×日数、通算上限でキャップ
  して合算する方式へ。テスト 3 件追加
- ✅ **M24 [Low]**: 親アプリのトップバー 🖨 (popup 系) が BUILDER ビューでも
  表示され、Tailwind CSS が注入されない popup で builder が無スタイル印刷
  された (既存問題、L1f の印刷ヘッダで露出増) → BUILDER ビューでは非表示
  (builder は Toolbar 自前の 🖨️ = window.print() 系統を使う)

### M.2 修正済み (ドキュメント)

- ✅ **M21**: USER_GUIDE が実在しない confirm 文言「部分解を生成しますか？」を
  鉤括弧引用していた → 実 UI (タイトル「解けない設定の検出」) に合わせて修正。
  その他の UI 引用 11 箇所は実 UI と一致することを確認済み
- ✅ **M22**: §L の個別テスト件数を実カウントへ訂正 (L4a +9→+7、L4b +4→+7)
- ✅ **M23**: 行番号参照が同ブランチ内の編集で既にズレていた 2 箇所
  (L2b / L2d) を識別子参照に書き換え

### M.3 記録のみ / 仕様判断待ち

- **M19 (判断待ち → L6b)**: quotaCellMismatch (クォータ合計 ≠ セル数) は
  「完全解が構造的に不可能」だが informational のため L1h の生成前 confirm
  対象外。⚠ バッジに数えない設計 (意図的にセル数未満で手動運用があり得る)
  は維持しつつ、**confirm 側だけ数えるかは仕様判断** — L6b として起票
- **M20 (記録のみ)**: NG 雛形 CSV が実在講師・実在日付で生成される (講師
  マスタ雛形はダミー名という思想の非対称)。プレビュー + 取込ボタンを挟む
  ので実害は限定的。「ラベル一致のお手本」という目的には実データの方が
  分かりやすい面もあり、現状維持
- **M25 (記録のみ)**: L2c の 2 機能はコンテキストメニュー限定で、メニューを
  開く操作自体のキーボード代替が無いのは既存 copy/paste と同じ既存ギャップの
  踏襲 (新規回帰ではない)。L2d/L2e (キーボード編集系) 着手時にまとめて解消
- **検証済みで問題なし**: removeDatesFromPool の cascade 等価性 (旧単一削除と
  逐条比較)・L1d templates の state 非汚染・L1a 講師保持と合同伝播の整合・
  solver tempTotal の increment/decrement 対称性と合同二重計上なし・
  teacherOverDaily の従来挙動維持・summarizeUnfilled と solver スロット構築の
  一致・async handleGenerate の二重起動安全性・L4b の削除 UX 規約準拠
  (cascade あり + danger confirm)・印刷二系統の系統選択 (L1f)・Tailwind
  content グロブ (E5e 回帰なし)・e2e L1h confirm の両方向の安定性

### L6 追記

- **L6b (仕様判断待ち、M19 起源)**: quotaCellMismatch を L1h の生成前
  confirm に数えるか。数える場合も ⚠ バッジ側は現状維持 (informational)

---

## N. 2026-07-03 ブラッシュアップレビュー第 3 波 (4 方面並列調査) の結果

§K (棚卸し)・§L (新機能・便利機能) に続く同日第 3 波。「編集操作 /
設定・データ入力 / 自動生成・分析 / 出力・全体 UI」の 4 方面を並列調査し、
既出 (§D〜§M、CLAUDE.md 却下リスト) を除いた新規候補 35 件を整理した。
全件コードの該当箇所まで裏取り済みで、N1 系 (バグ・実害) は本体
セッションでも逐条再検証した。**本セクションは起票のみで未実装**。

調査メモ:

- 既知残課題 (L2b/L2d/L2e/L2f · L3c/L3d/L3f · L5b/L5d · L6a/L6b ·
  K2h/K2i · K4b · E2a · E2b · E2g · E4c/E4f · E5b/E5c/E5d/E5h · E6a ·
  E7 系 · E8c · D5c) はいずれも未実装のままであることを 4 方面で再確認
- E1e の「focus ring は残」の残は「色弱対応 (単色 outline)」のみ。
  ring 自体は `tailwind.css` の `.builder-root :focus-visible` で実装済み
  (ステータス変更なし)
- 生成結果の整形に「fingerprint による案の重複排除」は存在しない
  (generationFingerprint は config 失効判定 F2n/F2p 専用) → N1h として起票

### N1. バグ・実害系 (修正候補、価値順) — ✅ 全 10 件 2026-07-03 修正済み

- ✅ **N1a (2026-07-03 修正)**: 「🎒 配布用 (注記なし)」Excel に科目別集計シートが
  そのまま同梱される — `buildScheduleWorkbook` は `clean` をグリッドの
  セル文言にしか適用せず、`collectAllSubjects(...).forEach(buildOneSubjectSheet)`
  を無条件実行 (excelExport.ts)。講師別集計・⚠NG・必要/不足コマの分析情報が
  生徒・保護者向け配布物に露出する。clean 時は集計シートをスキップすべき
  (L5c の実装意図の完成)
- ✅ **N1b (2026-07-03 修正)**: autosave 失敗が視覚的に「成功」に見える — Header の
  保存バッジが `text-builder-green bg-builder-success-soft` 固定で
  「⚠️ 保存失敗」も緑地に描画される。flushSave 失敗時の toast も無く
  (容量警告 toast との非対称)、QuotaExceeded (= データ喪失リスク) が最も
  静かに失敗する経路。状態別の色分け + 失敗 toast + `role="status"` を
- ✅ **N1c (2026-07-03 修正)**: CSV 講師取込 (追加/更新) が空 subjects 行で既存の
  担当科目を消す — `teacher/import` append 分岐が
  `map.set(t.name, { ...existing, subjects })` で無条件上書き
  (projectReducer.ts)。親アプリ取込 (L5a) には「同名かつ親側担当が空は除外」
  ガードがあるのに CSV 経路に無い非対称。同思想のガード or confirm 明示を
- ✅ **N1d (2026-07-03 修正)**: セル編集直後に Ctrl+Z が効かない — グローバル
  keydown が SELECT フォーカスで early return (BuilderApp.tsx)。セル編集は
  すべて select で、onChange 後もフォーカスが残るため「変更 → 即 Ctrl+Z」が
  無反応。select にネイティブ undo は無いので undo/redo だけは SELECT でも
  通してよい (L2d の Ctrl+C/V/Delete 未配線とは別問題 — こちらは配線済み
  機能の沈黙)
- ✅ **N1e (2026-07-03 修正)**: 「現在の設定を初期値にする」が科目マスタ・科目カラー・
  生成パラメータを保存しない — handleSaveAsDefault は `{ teachers, config }`
  のみ (useJsonIO.ts)。科目をカスタムした塾ではリセット後に科目・色が既定へ
  戻る一方、config.subjectCounts だけ保存され存在しない科目の孤児が残る
- ✅ **N1f (2026-07-03 修正)**: Excel ファイル名の日付が UTC — buildExcelFilename が
  `toISOString().slice(0, 10)` (excelExport.ts)。JST 0〜9 時の出力で
  ファイル名だけ前日になり、印刷見出し (ローカル日付、printHeader) と
  食い違う
- ✅ **N1g (2026-07-03 修正)**: 容量監視が project 単体しか測らない — checkStorageHealth
  は estimateStorageBytes(project) と 5MB の比較のみ (storageHealth.ts)。
  LocalStorage は親アプリと origin 共有で、テンプレート・corrupt バックアップ
  も別キー未計上。警告が「大丈夫」と言っている間に autosave が
  QuotaExceeded で失敗しうる (N1b とセットで直すのが筋)
- ✅ **N1h (2026-07-03 修正)**: 生成案の重複排除が無い — 生成完了の整形は
  filter/map/sort のみで schedule 内容の dedup をしない (BuilderApp.tsx)。
  制約が厳しい構成では同一の完全解が複数カードに並び比較枠 (numPatterns) を
  消費する。正規化キーで dedup し「同一案 ×k」表示 or 追加生成を
- ✅ **N1i (2026-07-03 修正)**: 他学年セッションの一括登録に重複ガードが無い —
  `teacher/addExternalSessions` は単純 append (projectReducer.ts)。同条件の
  再登録で一覧に二重に溜まる (自動NG はキー集約されるので実害は一覧の
  可読性と削除の手間)。NG CSV は dedupe 済み (F2h) との非対称。完全一致
  スキップ + skip 件数 toast を
- ✅ **N1j (2026-07-03 修正)**: CSV 取込が Shift-JIS を想定しない — readCsvFile が
  `file.text()` = UTF-8 固定 (TeacherManager / NgCsvImport)。日本語 Excel の
  既定 CSV 保存 (CP932) が文字化けし、全行「未登録の講師/日付」warning に
  なるが原因に気づきにくい。U+FFFD 混入検出で `TextDecoder('shift_jis')`
  再デコード or 案内 toast を

### N2. 編集操作

- **N2a (大・価値高)**: セルの複数選択 (Shift+クリック / ドラッグ矩形) →
  選択範囲の一括クリア・ロック・貼り付け。現状は 1 セル単位 or ヘッダ単位
  (日/時限/クラスまるごと) しかなく、「クラス A〜C の 3〜4 限だけロック」の
  ような矩形操作ができない。まず範囲クリア・範囲ロックの MVP から
- **N2b (中)**: D&D 中の auto-scroll — グリッドは `max-h-[70vh]
  overflow-auto` 内で、掴んだ元と落とし先が同時に画面内に無いと物理的に
  届かない (ScheduleTable.tsx)。dragover でコンテナ端に近づいたら
  scrollTop を漸増させる hook を
- **N2c (小〜中)**: D&D の発見可能性と操作性 — (1) draggable セルに
  cursor-move 等の手がかりが無く、オンボーディングもドラッグに触れない
  (onboardingSteps.ts)。(2) コンパクト表示では td padding 1px + select が
  セルを埋め、drag を開始できる非 select 領域がほぼ無い (ScheduleCell.tsx)。
  カーソル + ツアー 1 ステップ + ドラッグハンドル (⠿) を
- **N2d (中)**: 学年タブの並べ替え — `tab/reorder` が無く作成順を後から
  直せない (subject/reorder はあるのに非対称)。印刷・Excel の学年順にも効く
- ✅ **N2e (2026-07-03 実装)**: タブ削除 confirm に割当数を出す — 現状は汎用文言のみ
  (TabBar.tsx)。「N コマの割当があります」の件数付き confirm (生成クリア等と
  同型) に
- **N2f (中)**: undo/redo の内容可視化 — 変更セルが画面外だと押しても
  無変化に見える。history は完全 Project 配列なので diffSchedules で
  「元に戻す: 8/1 1限 クラスA (英語→数学)」toast + scrollIntoView が可能
- ✅ **N2g (2026-07-03 実装)**: スナップショット差分から該当セルへジャンプ — 差分は
  テキスト羅列のみで、違反 popover の「→」(scrollToKey) と非対称
  (SnapshotMenu.tsx)。同パターンの流用 (関数の共有化も)
- ✅ **N2h (2026-07-03 実装)**: 表示設定 (isCompact / showSummary) の永続化 — 純 useState で
  リロード毎にリセット (BuilderApp.tsx)。明示トグルの 1 bit 保存であり
  A18 (行動統計からの自動変形) には非該当

### N3. 生成・分析

- **N3a (中)**: 講師別の連続コマ上限 — 連続だけ project 全体値
  (maxConsecutivePeriods) のみで、L3a (1日)・L3b (通算) の講師個別化から
  取り残されている (Teacher 型にフィールド無し)。resolveTeacherDailyLimit と
  同型の resolve + TeacherManager 上限列の拡張 + fingerprint 追随で、
  既存パターンの踏襲
- **N3b (中〜大)**: 部分解の未充填セルに「なぜ埋まらないか」を付ける —
  現状は場所と科目別不足のみ (L3e)。セルごとに「該当時限に空き講師なし
  (全員 NG/上限)」/「候補は居るが探索が尽きた (→ 探索回数↑を提案)」の
  2 分類を既存の候補判定関数の逆引きで表示。生成後に「設定を直すか・
  もう一度回すか」を判断できない欠落を埋める
- ✅ **N3c (2026-07-03 実装)**: seed のワンクリック固定 — 結果パネルの seed 表示は title の
  案内文のみで、再現には ⚙️ → 自動生成 → 数値入力の 4 手 (SummaryPanel.tsx)。
  「🔒 この seed を固定」トグルで updateGenerationParams を直呼び
- **N3d (小〜中)**: 「この案を採用」前の差分表示 — 採用は無確認即実行
  (SummaryPanel.tsx)。diffSchedules / summarizeDiff は実装済みなので
  「＋N 追加 / ≠N 変更」バッジ or diff 付き confirm が低コストで可能
- ✅ **N3e (2026-07-03 実装)**: 違反 popover の「他 N 件」が展開できない — 各セクション
  slice(0,5〜8) + プレーンテキストで、隠れた違反の中身を確認する手段が無い
  (Toolbar.tsx)。トグル展開 or popover 内スクロール (L2b 巡回ナビとは別軸)
- **N3f (小〜大)**: 飛び石出勤の可視化 — 「その日 1 コマだけ出勤」を避ける
  仕組みも気付く指標も無い (制約は上限方向のみ)。まず案カードに「1 コマ
  出勤日を持つ講師 N 名」の情報表示 (solver 変更不要)、発展は L3c ソフト
  希望の枠組みで「出勤日集約」を重みに
- **N3g (小〜中)**: 講師コマ数を「使用/上限」表記に — SummaryPanel の
  講師別合計・案カードとも絶対数のみで、L3a/L3b の個別上限に対する余裕が
  見えない。「田中: 6/6」+ 上限到達の色警告で、限界寸前の脆い案と余裕の
  ある案を区別可能に (L3a/L3b の吟味フローへの還元)

### N4. 設定・入力

- **N4a (小)**: テンプレートの上書き更新と同名ガード — 保存は常に新規追加
  (templates.ts addTemplate)。年度ベースを微修正するたび同名が重複蓄積し、
  一覧から見分けられない。「上書き / 新規」の選択 + 行内「現在の内容で更新」
- **N4b (小)**: CSV 講師取込に「新規 X / 更新 Y」内訳を表示 — 親取込 (L5a)
  は confirm に内訳を出すのに CSV は合算 toast のみ (TeacherManager.tsx)。
  N1c の空 subjects 警告と同じ突き合わせで実装できる
- **N4c (中)**: 外部セッションプリセットに講師リストを保持 — 現状は
  時刻/期間/メモのみで、適用のたび対象講師を選び直す (AbsenceNgPanel.tsx)。
  「予備校 = 毎回同じ講師群」が典型なので任意で講師も保存 (存在しない講師は
  無視 + warning)
- **N4d (小)**: 講師別上限の矛盾表示 — 1日 > 通算 (例: 1日8・通算3) を
  無警告で受理 (TeacherManager.tsx)。行内の注意アイコン/tooltip で十分
- **N4e (小)**: コマ数マトリクスに列合計 — 学年ごとの総コマ数がどこにも
  出ず暗算が必要 (SubjectManager.tsx)。「計 N / 収容 M (使う日×時限×クラス)」
  を列に常時表示すれば入れ過ぎ/不足に設定段階で気づける
- **N4f (中)**: ConfigModal 横断の講師名フィルタ — TeacherManager /
  ClassPriority / NG マトリクス / クイックグリッドが講師 30 名規模で縦横に
  長く、絞り込み手段が無い。名前 input 1 つで横断的に効く (明示操作なので
  A18 非該当)

### N5. 出力・オンボーディング・可視化

- **N5a (小)**: Excel 学年グリッドシートにタイトル行が無い — 1 行目が
  「日付/時限/…」ヘッダで、シートを印刷すると何の・いつの時間割か紙面に
  出ない (印刷経路は L1f で見出し済みの非対称)。「プロジェクト名 — 学年 /
  期間 / 出力日」の 1 行を先頭に (配布用でも学年・期間は残す)
- ✅ **N5b (2026-07-03 実装)**: オンボーディングが出力に触れない — 5 ステップは編集・設定・
  生成のみ (onboardingSteps.ts)。ゴール (Excel 3 種の使い分け・印刷・JSON
  保存) への 1 ステップを追加
- **N5c (小)**: 保存容量の常時表示 — 警告は起動時 1 回・ratio≥0.5 の toast
  のみで、それ以外は情報ゼロ (BuilderApp.tsx)。ヘッダ or ⚙️ に「保存データ
  約 X MB」(formatBytes 流用)。N1g とセットで
- **N5d (小)**: 講師別 Excel の列見出し統一 — 個人シート「場所(タブ)」vs
  全講師リスト「タブ名」の揺れ (excelExport.ts)。「学年(タブ)」等に統一
