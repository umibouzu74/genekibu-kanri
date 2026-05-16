# 講習時間割作成 (timetable-builder) 今後のロードマップ

最終更新: 2026-05-16 / PR [#116](https://github.com/umibouzu74/genekibu-kanri/pull/116) マージ後想定

このドキュメントは「次のセッション (新しい Claude Code セッション or 別の開発者) が
迷わず作業を引き継げる」ことを目的にしている。コミット粒度・ファイル位置・
判断の経緯までできるだけ具体的に書く。

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
| 自動生成 (MRV+バックトラック) | 🟢 制約充足は動く・複数案・部分解・Web Worker 化済 |
| UI 主要操作 (セル編集・D&D・コピペ・ロック) | 🟢 動く |
| タブ管理 | 🟢 動く |
| Excel 出力 (全体・講師別) | 🟢 動的 import で軽量起動 |
| JSON 入出力 | 🟢 講師マスタ差分検出付き |
| Undo/Redo | 🟢 max 50 スナップショット |
| 合同グループ | 🟡 機能・UI ともにあるが実運用検証が浅い |
| 印刷 | 🟡 CSS は整っているが Builder 内に印刷ボタンが無い |
| エラー通知 | 🟡 console.error 止まりの箇所が散在 |
| オンボーディング | 🔴 初見ユーザ向けガイダンス無し |
| モバイル対応 | 🔴 大画面前提のレイアウト |
| TypeScript 化 | 🔴 未対応 (親アプリは部分的に TS) |
| Firebase 同期 | 🔴 意図的に未対応 |

### 1.3 既存のテスト
合計 **49 件**（scheduleKey 28 / autoGenerator 18 / runGenerator 3）
- カバー: マイグレーション・キー round-trip・MRV 制約・seed 決定性・部分解
- **未カバー**: useProject 系フック全般、useAnalysis、UI コンポーネント、Excel 出力

---

## 2. やるべきこと（優先順）

凡例: 🟡 = production 動作にじわっと効く / 🟢 = 品質・保守性

各項目は「**A. 増分改善** → **B. 中規模リファクタ** → **C. 再設計**」の順。
番号は優先度の参考だが、組み合わせて作業しても良い。

---

## A. 増分改善（壊さずに足せる）

### A1. 🟡 externalCounts を solver の制約に組み込む
**現状の問題**:
- UI (`components/ConfigModal/ExternalCounts.jsx`) で「他学年・午前のコマ数」を講師×日付ごとに入力できる
- `useAnalysis.js:50` ではこれを **集計表示** に使っているだけ
- `logic/autoGenerator.js` の solver は **externalCounts を一切参照していない**
- 結果：講師がすでに別学年で午前 4 コマ持っているのに、午後の生成で 4 コマ追加されて 1 日 8 コマ（過密）になる

**やること**:
1. `autoGenerator.js` の solve 内で `tempDaily[dayKey]` に加えて `externalCounts[dayKey]` を考慮
2. ある講師の `tempDaily + external > MAX_DAILY_HOURS` ならその割当てを skip
3. MAX_DAILY_HOURS は config 化（デフォルト 5 か 6）
4. テスト追加: 「external 4 + 当該タブで 2 コマ目が候補に出ない」ケース

**注意点**:
- 既に書いた `tempDaily` インクリメントは生かせる（今は dead code）
- MAX_DAILY_HOURS をハードコードでなく config / 講師個別設定にするか要相談
- 工数: 1〜2 時間（テスト込み）

**ファイル**: `logic/autoGenerator.js:225,251`, `hooks/useAnalysis.js:50`, 新規 test

---

### A2. 🟢 useProject 系フックのテスト追加
**現状の問題**:
- `useProject.js` (555 行) / `useHistoryStack.js` / `useJsonIO.js` / `projectFactory.js` のロジックが完全に untested
- 私の useProject 分割 (commit `4f5366a`) は per-function diff で挙動等価を確認したが、自動回帰検知できない
- 今後の cell ops cascade 共通化（B1）や reducer 化（C2）でリグレッション risk

**やること**:
1. `@testing-library/react` の `renderHook` を使って useProject をテスト
2. 優先順位:
   - useHistoryStack: pushHistory / undo / redo / max 50 制限 / branch 切り捨て
   - projectFactory: createNewProject / loadInitialProject の各分岐 (新キー/旧キー/defaults/全空)
   - useProject: addTeacher / renameTeacher (cascade) / removeSubject (cascade) / handleAssign の合同グループ伝播
3. handleSwapCells のような 70+ 行関数は別途集中して

**注意点**:
- jsdom 環境が要るので `// @vitest-environment jsdom` を冒頭に
- LocalStorage モック（jsdom デフォルトで動く）
- 工数: 4〜6 時間で 30〜40 ケース

**ファイル**: 新規 `hooks/useProject.test.jsx`, `hooks/useHistoryStack.test.jsx`, `hooks/projectFactory.test.js`

---

### A3. 🟡 Excel 出力ボタンにロード中スピナー & エラー詳細
**現状の問題**:
- `Header.jsx` の「📊 全Excel」「👤 個人Excel」は動的 import 完了まで無反応（冷キャッシュで数秒）
- 二度押し可能 → 二重ダウンロード
- `catch {}` で error を捨てているのでデバッグ困難（agent 指摘）

**やること**:
1. ボタンに `isLoading` state、押下中は disabled + spinner
2. catch で `console.error(err)` を残す
3. エラー toast にコンテキスト付与（"xlsx の読み込みに失敗しました" "ファイル生成に失敗しました" を区別）

**工数**: 30 分

**ファイル**: `components/Header.jsx`

---

### A4. 🟡 worker error 経路で重複 toast を回避
**現状の問題**:
- `BuilderApp.jsx:78-104`: worker から error イベント → onError で toast、その後 done resolve → patterns.length === 0 で「条件を見直してください」toast、の二重表示

**やること**:
- onError 呼出時に local flag を立て、done.then の `else { showToast(...) }` を skip
- もしくは onError の toast 文言だけにして done.then の error 分岐を削除

**工数**: 15 分

**ファイル**: `BuilderApp.jsx:62-107`

---

### A5. 🟢 BuilderApp の document.title cleanup
**現状の問題**:
- `BuilderApp.jsx:22-24` で `document.title = "...時間割作成くん"` に変更
- アンマウント時のクリーンアップなし
- 別ビューに切り替えても title が「時間割作成くん」のまま

**やること**:
- useEffect cleanup で親アプリのデフォルト title (`"現役部 授業管理システム"`) に戻す

**工数**: 10 分

**ファイル**: `BuilderApp.jsx:21-24`

---

### A6. 🟡 Builder 内に印刷ボタンを置く
**現状の問題**:
- 印刷 CSS (`@media print` / `.no-print`) は整っているが、Builder 内に明示的な印刷トリガが無い
- ユーザは「ブラウザの印刷ダイアログを Cmd+P で開け」と察する必要あり
- 親アプリには `PrintButton` コンポーネントがあるが、Builder は独立しているので使い分け要判断

**選択肢**:
1. `Toolbar.jsx` に 🖨 ボタンを追加して `window.print()` を呼ぶ（シンプル）
2. 親の `PrintButton` を import して使う（統一感）
3. 親の `handlePrint` (popup 方式 — `App.jsx`) に乗せる（ヘッダ・フィルタ等を紙面に出すパターン）

**注意点**:
- CLAUDE.md の「印刷システムの二系統」ルールに沿うこと
- Builder のメインビュー = ScheduleTable は popup 方式の必要性は薄い（フィルタや凡例なし）
- 推奨: 案 1（Toolbar に 🖨 を置いて window.print）

**工数**: 30 分（推奨案 1）

**ファイル**: `components/Toolbar.jsx`, `BuilderApp.jsx`

---

### A7. 🟢 dead code 整理
**項目**:
1. `utils/scheduleKey.js:16` の `resolveKey` — テスト以外で未使用。pre-existing
2. `logic/autoGenerator.js:225-251` の `tempDaily` — A1 を実装すれば「使われる」状態になる。A1 をやらないなら削除
3. `BuilderApp.jsx` の `useRef` import が cell-related のみで使われているか要確認

**工数**: 30 分

---

### A8. 🟢 ProjectContext.value の useMemo 化
**現状の問題**:
- `contexts/ProjectContext.jsx:13-17` で value object を毎レンダー新規生成
- useContext を呼ぶ全コンポーネントが毎回 re-render
- 中の関数はそれぞれ useCallback されているので各自は stable だが、context value 自体の参照が変わる

**やること**:
- `value` を `useMemo` で囲む（deps は projectState の依存全部）
- ※ projectState の各キーは hook 内で stable なので、`useMemo(() => ({...}), [projectState, analysis, dashboard])` で十分

**工数**: 20 分

**ファイル**: `contexts/ProjectContext.jsx`

---

## B. 中規模リファクタ（内部構造の改善）

### B1. 🟢 セル操作の cascade ロジック共通化
**現状の問題**:
- `handleAssign` / `handleCellPaste` / `handleCellClear` / `handleSwapCells` の 4 関数で「合同グループ伝播」「旧合同のクリーンアップ」のロジックが繰り返されている
- 例: `useProject.js:230-280` (handleAssign) と `:380-410` (handleCellPaste) と `:420-440` (handleCellClear) と `:455-485` (handleSwapCells) で類似コード
- 新しい合同関連の挙動を追加するたびに 4 箇所を直す必要 → 同期忘れリスク

**やること**:
1. `utils/combinedPropagation.js` を新設し、純粋関数として:
   - `propagateAssignment(schedule, config, combinedGroups, dIdx, pIdx, cIdx, entry) → newSchedule`
   - `cleanupOldCombined(schedule, config, combinedGroups, dIdx, pIdx, cIdx, oldSubject) → newSchedule`
   - `getCombinedClassIndices(combinedGroups, subject, className, date, config) → number[]`
2. 4 つのフック関数を上記呼び出しに書き直す
3. ユニットテスト追加（純粋関数なので書きやすい）

**注意点**:
- リグレッション risk が高い領域なので、A2 (useProject テスト) を先に追加してから着手するのが安全
- 工数: 4〜6 時間（テスト込み）

**ファイル**: 新規 `utils/combinedPropagation.js` + test, `hooks/useProject.js` 大幅修正

---

### B2. 🟢 useProject をさらに分割
**現状の問題**:
- 555 行は前回 787 → 555 に減らしたが、まだ大きい
- handleAssign (40 行)・handleSwapCells (60 行)・handleCellPaste (50 行) など、cell 系だけで 200 行

**やること**:
1. B1 完了後、cell ops 系を `useScheduleActions.js` に抽出
2. teacher 系 (addTeacher/removeTeacher/renameTeacher/toggle*) を `useTeacherActions.js` に
3. subject 系 (addSubject/removeSubject/reorderSubjects) を `useSubjectActions.js` に
4. 結果: useProject.js は 200 行未満の composer に

**注意点**:
- B1 の cascade 共通化と同時にやると一気に整理できる
- A2 のテストが揃っていないとリスキー
- 工数: 2〜3 時間（B1 後）

---

### B3. 🟡 制約システムの拡張可能化
**現状の問題**:
- `autoGenerator.js` 内に制約チェックがインライン（`t.ngSlots?.includes(...)` など）
- 新しい制約を足すたびに solver 内に分岐追加 → コードが太る・テスト面倒
- 例: 「講師の 1 日あたり最大コマ数」「講師×時限のペア NG (午後のみ可など)」「クラスごとの曜日別必修科目」などの要望が来たら大変

**やること**:
1. `constraints/` ディレクトリ新設
2. 各制約を `(state, candidate) => boolean` の純粋関数として表現
3. solver は `constraints.every(c => c(state, candidate))` で判定
4. 既存の制約 (NG slot / NG class / 同日同科目 / 同時限同講師) もこの形に書き直す

**注意点**:
- パフォーマンス影響に注意（制約チェック頻度が高い hot path）
- 関数 call overhead を避けるため、closure で制約を pre-compile するパターンが良いかも
- 工数: 1〜2 日

**ファイル**: 新規 `logic/constraints/`, `logic/autoGenerator.js` 大幅修正

---

### B4. 🟢 エラーハンドリング統一
**現状の問題**:
- `projectFactory.js:95` `console.error("Load failed", e)` で読込失敗時にユーザに通知なし
- 似たような silent failure が他にも散在

**やること**:
1. `useUI` の `showToast` をユーティリティ層からも呼べるよう、エラーバウンダリ的な仕組みを用意
2. または `loadInitialProject` を `(notify) => project` のシグネチャにして UI 層から notify を渡す
3. 設定: 失敗時のフォールバック挙動（壊れたデータ → デフォルトに戻す → toast でユーザに通知）

**工数**: 1〜2 時間

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
- `useProject.js` の各 useCallback が `{...project, key: newValue}` パターンで状態を更新
- 30+ の useCallback が `[project, pushHistory]` を deps に持つ → project 変化のたびに全部再生成
- テストするには renderHook で各関数を呼んで結果を見る必要がある（B1/B2 で多少改善するが）

**提案**:
- `useReducer((state, action) => newState, initialProject)` に置き換え
- action types: `'tab/add'`, `'teacher/rename'`, `'cell/assign'`, `'cell/swap'`, etc.
- reducer は純粋関数なので単体テストが書きやすい
- redux-style middleware 風に履歴管理 (undo/redo) を組み込み可

**移行戦略**:
- B1/B2 を先にやって ops の境界を明確化
- そのうえで「action 化」する

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
**注意**: A6（印刷ボタン）と一緒にやると効率良いかも

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
- 状態管理: `src/timetable-builder/hooks/useProject.js` (composer) + `useHistoryStack.js` + `useJsonIO.js` + `projectFactory.js`
- 自動生成: `src/timetable-builder/logic/autoGenerator.js` (純粋) + `runGenerator.js` (Worker ラッパ) + `autoGenerator.worker.js` (Worker entry)
- データキー: `src/timetable-builder/utils/scheduleKey.js` (インデックスベース + 旧形式マイグレーション)
- 親への接続点: `src/App.jsx` (lazy import + view 配置), `src/constants/views.js` (BUILDER), `src/constants/chords.js` (b), `src/components/Sidebar.jsx` (メニュー)

### 4.3 検証の標準セット
```bash
npm run lint        # 0 errors / 0 warnings
npm test            # 33 files / 727 tests
npm run typecheck   # tsc --noEmit
npm run build       # 警告は xlsx-js-style chunk size のみ (期待動作)
```

### 4.4 推奨着手順
- まず A1 (externalCounts を solver に組み込む)：効果が見えやすく、小さい
- 並行で A2 (useProject テスト追加)：以後のリファクタの安全網
- A2 が揃ったら B1 (cell ops cascade 共通化) → B2 (さらに分割)
- 余裕があれば A3〜A8 を順次

### 4.5 やる前に必ず読むべきファイル
- このファイル (ROADMAP.md)
- `genyakubu-manager/CLAUDE.md` 親アプリ側の規約 (印刷の二系統、削除 UX、却下提案)
- `/home/user/genekibu-kanri/CLAUDE.md` リポジトリ全体の規約

### 4.6 やってはいけないこと
- ユーザ行動の統計を LocalStorage に保存して UI を自動変形する系（CLAUDE.md A18 系で明示的に却下されている）
- 印刷システムの統合 (E-2 案、却下済み)
- 削除 UX で `confirmedRemove` が必要なところに `removeWithUndo` を使う

### 4.7 既存 PR / 関連リンク
- PR #116: Phase 1 + Step 2-6 + 校正 J1-J5（このロードマップ作成前の全作業）
- 旧スタンドアロン版の handoff.md: `git show 89e0b25:jikanwarikun-main/handoff.md` で参照可（もう物理ファイルはない）

---

## 5. このドキュメントの更新ルール

- 各項目を実装したら ✅ を付けるか、項目自体を削除する
- 新たに発見された問題は適切なセクション (A/B/C) に追加
- リスク (R*) は実害が出たり対策が完了したら更新
- 「次セッション quick start」のコマンドは npm スクリプトが変わったら追従
