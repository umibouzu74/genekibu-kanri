# 講習時間割作成 (timetable-builder) アーキテクチャ

開発者向けの構造ドキュメント。完成度の経緯・今後の課題は [`../ROADMAP.md`](../ROADMAP.md)、
ユーザ操作は [`USER_GUIDE.md`](./USER_GUIDE.md) を参照。

---

## 1. 全体像

親アプリ (`genyakubu-manager`) のサイドバーから lazy import される独立モジュール。
状態は `useReducer` ＋ Context、自動生成は Web Worker、永続化は LocalStorage
＋ Firebase RTDB 同期 (E6a、§5)。

```mermaid
flowchart TD
  App[親アプリ App.jsx<br/>lazy import] --> BuilderApp
  subgraph Builder[timetable-builder]
    BuilderApp --> UIProvider
    BuilderApp --> ProjectProvider
    ProjectProvider --> useProject
    ProjectProvider --> useAnalysis
    useProject --> useHistoryStack
    useHistoryStack --> projectReducer[(projectReducer<br/>30+ action types)]
    useProject --> ScheduleActions[useScheduleActions]
    useProject --> TeacherActions[useTeacherActions]
    useProject --> SubjectActions[useSubjectActions]
    ProjectProvider -. context .-> Components
    subgraph Components[UI]
      Header
      TabBar
      Toolbar
      ScheduleTable --> ScheduleCell
      SummaryPanel
      ConfigModal
      SnapshotMenu
    end
  end
  useHistoryStack <-->|autosave / load| LS[(LocalStorage)]
  useHistoryStack <-->|sync (E6a)| FB[(Firebase RTDB)]
```

### データフロー（編集 1 操作）

```mermaid
sequenceDiagram
  participant U as ユーザ
  participant C as ScheduleCell
  participant A as useScheduleActions
  participant R as projectReducer
  participant H as useHistoryStack
  participant LS as LocalStorage
  U->>C: 科目/講師を選択
  C->>A: handleAssign(...)
  A->>R: dispatch({type:'cell/assign'})
  R-->>H: 新 project（純粋に算出 + 合同伝播）
  H->>H: history に push（最大 50）
  H-->>LS: debounce autosave
  H-->>C: 再描画（Context 経由）
```

---

## 2. ディレクトリと責務

| パス | 責務 |
|---|---|
| `BuilderApp.jsx` | ルート。Provider 構成、自動生成の起動/キャンセル、容量監視・複数タブ検出 |
| `contexts/` | `ProjectContext` / `UIContext`（value は memo 化して再描画を抑制） |
| `hooks/projectReducer.js` | 純粋 reducer。30+ action types を 1 箇所に集約 |
| `hooks/useHistoryStack.js` | reducer ＋ Undo/Redo（最大 50）＋ debounce autosave ＋ Firebase 同期（§5） |
| `hooks/useProject.js` | composer。各アクションフックと派生 callback を束ねる |
| `hooks/use*Actions.js` | dispatch ラッパ（schedule / teacher / subject） |
| `hooks/useAnalysis.js` | 進捗・違反・infeasibility・修正提案を 5 段 useMemo で算出 |
| `hooks/useFocusTrap.js` / `useLongPress.js` / `useTabPresence.js` | a11y・タッチ・複数タブ検出 |
| `logic/autoGenerator.js` | 純粋ソルバ（MRV ＋ バックトラック）。`generateSinglePattern` |
| `logic/autoGenerator.worker.js` / `runGenerator.js` | Worker エントリ ＋ ラッパ（非対応環境は sync fallback） |
| `logic/constraints/` | 講師・スケジュール制約の純粋関数群 |
| `utils/scheduleKey.js` | `d{n}-p{n}-c{n}` の ID ベースキーと v1→v3 マイグレーション |
| `utils/combinedPropagation.js` | 合同グループのセル伝播・cascade cleanup |
| `utils/analysisHelpers.js` / `fixSuggestions.js` / `patternLoad.js` | 集計・修正提案・負荷偏りの純粋関数 |
| `utils/csvImport.js` / `templates.js` / `projectSchema.js` / `scheduleDiff.js` / `storageHealth.js` / `tabPresence.js` / `contrast.js` | 各機能の純粋ロジック |
| `utils/excelExport.js` | exceljs で xlsx 出力（動的 import） |

---

## 3. 自動生成パイプライン

```mermaid
flowchart LR
  BuilderApp -->|"runGeneratorInWorker"| RG[runGenerator.js]
  RG -->|"new Worker()"| W[autoGenerator.worker]
  RG -.->|"Worker 非対応時"| Sync[sync fallback]
  W --> GSP["generateSinglePattern<br/>(MRV + backtrack)"]
  Sync --> GSP
  GSP -->|"type:'progress'"| RG
  GSP -->|"type:'pattern'"| RG
  GSP -->|"type:'done'"| RG
  RG --> BuilderApp
  BuilderApp --> SummaryPanel
```

- **制約**: `logic/constraints/` の純粋関数（NG・クォータ・重複・1日上限・連続コマ）。
- **部分解**: 完全解が出ないときは最も充填できた状態 (`bestPartial`) を返す。
- **進捗**: 20000 反復ごとに `onProgress` で `{iterations, filledCount, totalSlots}` を間引き通知（E2f）。
- **キャンセル**: Worker は `terminate()`、sync fallback は中断不可（jsdom テストでのみ通る経路）。

---

## 4. データモデル（Project v4）

```
Project {
  version: 4
  name, createdAt, updatedAt
  activeTabId
  dates[], periods[]          // v4: 全タブ共通の講習カレンダー (project レベル)
                              //   dates/periods は全学年の和集合「プール」(NG はこの全日・全時限に設定可)
  tabs: [{ id, name, config: { classes[], subjectCounts, activeDateIds?, activePeriodIds? }, schedule,
           dayStatuses? }]    //   activeDateIds/activePeriodIds: そのタブが使う日・時限 (未指定=全て)
                              //   dayStatuses: 日付ごとの手動チェック { [dateId]: 'ok'|'check' }。
                              //   「不備あり」は保存せず schedule から導出 (computeIncompleteDateIds)
  teachers: [{ name, subjects[], ngSlots[], ngClasses[], priorityClasses[] }]
  combinedGroups[]            // 合同授業（ラベル参照）
  externalCounts / externalSessions   // 他学年セッション
  subjects[], subjectColors
  snapshots: [{ id, name, tabId, createdAt, schedule }]
  // 生成パラメータ: numPatterns / maxDailyHours / maxIterations / maxConsecutivePeriods
}
```

- `dates/periods/classes` は `{ id, label }`。schedule キーは **ID ベース**（並び替えでズレない）。
- **v4: `dates` / `periods` は project 共通**（全タブが同じ講習カレンダーを参照）。
  `classes` / `subjectCounts` は引き続きタブ（学年）ごと。これにより講師不在・NG
  （`teacher.ngSlots`、ラベルベースでもともと全タブ共通）が全タブで噛み合う。
  - **`dates` / `periods` は全学年の和集合「プール」**。各タブは `config.activeDateIds` /
    `config.activePeriodIds`（未指定=全日・全時限）で「この学年が実際に使う日・時限」を
    選ぶ（学年で期間や時間帯がズレても・歯抜けがあってもOK。例: 中３=昼の時限のみ、
    中１・２=夜の時限のみ、を同じ時限プールから選ぶ）。`activeDatesForTab(pool, tab)` /
    `activePeriodsForTab(pool, tab)` が subset を返す（`scheduleKey.js`、E-3 で periods 版を追加）。
    dates の subset は `sortPoolDatesByCalendar` で**カレンダー順に整列して返す**
    （プールの保存順=挿入順は不変。タブ別に後から追加した日はプール末尾に push
    されるため、そのまま返すと時間割の行順・回数連番が日付順にならない）。
    periods はプール順のまま（手打ちの並びを尊重）。
  - 読み取り側は `useProject` の `currentConfig`（= `tab.config` に**そのタブの使う日・使う時限**
    をマージした派生ビュー）経由で無改修。時間割 / 自動生成 / 分析 / Excel は各タブの使う日・
    時限だけを対象にする。**NG パネルだけはプール全日・全時限**（`project.dates` /
    `project.periods` を直接参照、`currentConfig` は経由しない）を使い、どのタブからでも
    全日・全時限に不在・NG を設定できる（例: 中３の昼タブから中１・２専用の夜の時限にも
    NG を設定できる必要がある）。
  - 書き込み: 日付プール+使う日は `tabDates/setByLabels`（手動/自動生成）・`tabDates/toggle`・
    `tabDates/setAllActive`・`dates/removeFromPool`。時限プール+使う時限は
    `config/setList('periods')`（プールのテキストエリア編集。削除時は全タブの
    `activePeriodIds` から該当 id も cascade 除去）・`tabPeriods/toggle`・
    `tabPeriods/setAllActive`（periods には自動生成が無く手打ちの短いリストなので
    `tabDates/setByLabels` 相当は無い）。`classes` はタブ単位。日付の自動生成は
    `utils/dateGenerate.js`（期間+曜日+除外日→ラベル、純粋関数）。手動追加も日付ピッカー
    経由で同じ `dateToLabel`/`ymdToLabel` を通すため、ラベルは常に `M/D(曜)` 形式で揺れない
    （文字列完全一致でプール重複判定しているため、表記揺れ=重複データの原因になる。
    時限ラベルはフリーテキストのままなので、同じラベル文字列を昼夜で使い回すと
    ラベルベースの NG キー (`makeNgKey`) が衝突する — 区別したい場合は
    「1限(昼)」「1限(夜)」のようにラベル自体を分けて運用する）。
  - `BasicSettings` の日付チェックリストは `sortPoolDatesByCalendar`（`dateGenerate.js`、
    表示専用の純粋関数）で常に実日付順に並べ替えて表示する（保存順序=挿入順は変更しない）。
    時間割本体・Excel・回数連番も `activeDatesForTab` 経由で同じカレンダー順になる。
    時限チェックリストはプール順表示（時限は手打ちの短いリストで自動生成が無いため、
    日付のような並べ替えは行わない）。日付・時限とも「🗂 全タブまとめて表示」トグルで、
    行=プールの日付/時限・列=各タブのマトリクス表示に切り替え、他タブの分も
    `handleToggleTabDate`/`handleToggleTabPeriod`・`handleSetAllTabDates`/`handleSetAllTabPeriods`
    (いずれも `tabId` 省略時はアクティブタブ) で直接編集できる。2 つのトグルボタンが同時に
    画面上に存在するため、ボタン文言は「日付を全タブまとめて表示」「時限を全タブまとめて表示」
    と明示的に区別している（どちらも同じ絵文字・文言だとどちらのトグルか判別できないため）。
- NG・合同・externalCounts は **ラベルベース**（JSON 可読性・タブ間共有のため。cascade cleanup で整合を維持）。
- マイグレーション: `migrateProject` が v1→v2→v3→v4 を順次合成。v3→v4 は各タブの
  `dates`/`periods` を**ラベル union** で 1 つに統合し、schedule / snapshot のキーを
  旧タブ ID→ラベル→新 project ID で remap する。読込時に `validateProjectShape` で
  致命的な型崩れを弾く。

### 4.1 スキーマ version を上げるときのルール（E5g: v5 以降の migration path）

v1→v4 の migration 実装で確立したパターンを、次に version を上げる人
（v5: combinedGroups の ID 化 / teacher 安定 ID 等が候補）向けにルール化する。

1. **1 リリース 1 インクリメント**。version up はリリース（PR）の最後に
   1 度だけ行う。開発途中の中間スキーマに version を割り当てない —
   ユーザの localStorage に中間 version が保存されると、その形を永久に
   migrate し続ける羽目になる。
2. **順次関数合成**。`migrateProject`（`utils/scheduleKey.js`）は
   `if (version < n)` ガード付きの v(n-1)→v(n) 変換を上から順に適用する
   チェーン。v5 を足すときは `migrateProjectV4toV5(project)` を純粋関数で
   新設し、チェーン末尾に 1 ブロック追加する。**既存の migration 関数には
   手を入れない**（過去 version の解釈は凍結。直すのはバグのみ — 例: F5f）。
3. **reject より正規化**（F.5 系統 A の方針）。`validateProjectShape` は
   「tabs / config / schedule の致命的な構造崩れ」だけを見て reject し、
   フィールドレベルの型崩れは migrate 側で既定値に落として救う。reject は
   フォールバック（= ユーザデータ喪失）に直結するため増やさない。
   新フィールドは「無ければ / 型が合わなければ default 補完」を
   `migrateProject` 末尾の正規化ブロックに足す — 補完だけなら version を
   上げなくてよい（`snapshots` や生成パラメータがこの方式）。
4. **失敗時の安全網は退避 + フォールバック**（F2f）。migration 関数自身は
   「解釈できないなら throw」でよい。`loadInitialProject` が catch して
   原本を `builder.schedule_project_corrupt` へ退避し、default へ
   フォールバック + toast で退避先を知らせる。migration 内で無理に
   握りつぶさない。
5. **ID 参照を変えるときは「旧 ID → ラベル → 新 ID」の 2 段 remap**
   （v3→v4 方式）。schedule / snapshots のキー、NG・externalCounts の
   ラベルキーなど、参照系をすべて列挙してから設計する（`utils/labelRefs.js`
   にラベルキーのパース知識が集約されている）。キーの数値成分の解釈
   （位置か ID か）は次元の形式で分岐が必要（F5f の教訓）。
6. **テストは 3 点セット**。(a) v(n) fixture → v(n+1) の正常系、
   (b) 型崩れ fixture が既定値に落ちる正規化系、(c)
   `projectLoadIntegrity.test.js` に「validate 通過 JSON は migrate +
   初回利用でクラッシュしない」fixture を追加。旧 version（v1〜v3）の
   fixture テストは削除しない — チェーン全体の回帰検知になっている。
7. **書き込み側も同時に上げる**。`createNewProject`（projectFactory）と
   `migrateProject` の到達 version、`validateProjectShape` の許容形を
   同じ PR で揃える。JSON 出力はそのとき時点の version をそのまま持つので、
   エクスポート専用の変換は作らない。
8. **旧クライアントの stale-client 検出を壊さない**（E6a）。デプロイ済みの
   旧クライアント（GitHub Pages のキャッシュ残り）は、クラウド上の新スキーマ
   project を「トップレベルに数値 `version` + 非空 `tabs` 配列がある」ことで
   検出して同期を停止する（`utils/projectSync.ts`）。将来の version でも
   この 2 点は必ず維持すること — 崩すと旧クライアントが新データを reject
   （壊れた blob）と誤判定し、autosave で上書き破壊する。

---

## 5. Firebase 同期（E6a）

親アプリと同じ Firebase RTDB（`src/firebase/config.js`、匿名認証 + 管理者は
email/password）へ project を同期し、タブレット等の別端末からも編集できる。
実装は `useHistoryStack`（副作用）と `utils/projectSync.ts`（受信判定の純粋関数）。

```mermaid
sequenceDiagram
  participant A as 端末A useHistoryStack
  participant FB as RTDB appData/builder/schedule_project
  participant B as 端末B useHistoryStack
  A->>A: dispatch → debounce (800ms)
  A->>A: flushSave: localStorage.setItem(json)
  A->>FB: set(json)  ※JSON 文字列のまま
  FB-->>B: onValue(json)
  B->>B: decideRemoteProject(json, local)
  B->>B: apply なら project/reset (履歴もリセット) + toast
```

- **保存形式は JSON 文字列**（オブジェクトではなく）。RTDB はオブジェクト保存だと
  空配列・空オブジェクト（`schedule: {}` / `ngSlots: []` 等）を刈り取り、キー順も
  保存順と変わるため、echo 判定と `validateProjectShape` が壊れる。文字列なら
  LocalStorage と完全に同一のバイト列が往復する。パスに `.` が使えないため
  `appData/builder/schedule_project`（`constants.FIREBASE_PROJECT_PATH`）。
- **権限は親アプリと同一**（database.rules.json）: 読みは認証済（匿名含む）、
  書きは管理者（password provider）のみ。未ログイン端末の編集はローカルに残り、
  失敗エピソードごとに 1 度だけ toast で知らせる（`sync-auth`。書込が一度
  成功するとラッチは解除され「回復 → 再失敗」を再通知できる）。サーバ空
  ノードへの seed はユーザ操作のない書込なので、失敗しても toast は出さない
  （親 useSyncedStorage の seed が console.warn のみで沈黙するのと同じ方針）。
- **受信判定は `decideRemoteProject`**（純粋関数、テストあり）:
  `apply`（templates を strip → validate → migrate → cleanSchedule して採用。
  templates 同梱 blob を strip しないと state/LS/RTDB を恒久的に往復して肥大する）/
  `identical`（起動時の正常系。適用扱いにすると開くたび履歴リセット + toast になる。
  比較は **ローカル側にも cleanSchedule をかけて対称に**し、`activeTabId`
  （ビュー状態）と `updatedAt`（ブックキーピング）は除外する — タブ切替や
  タイムスタンプ差だけで apply にしない）/
  `reject`（壊れた blob。ローカル正のまま次の autosave で自己修復）/
  `stale-client`（サーバの version がこのクライアントより新しい。GitHub Pages の
  キャッシュで旧アプリが残る典型。上書き破壊を防ぐためセッションの送信を停止。
  version が大きくても **非空 `tabs` が無ければゴミ blob とみなして reject**
  — stale-client は恒久停止なので、ゴミに適用すると自己修復が永遠に届かない）。
- **適用は `project/reset`**（履歴ごと初期化）。他端末の編集をローカル履歴に混ぜると
  Undo がサーバ状態を巻き戻す書込になるため。適用時は toast で通知する
  （連続反映時の toast は UI 側で間引く）。`activeTabId` はローカルの選択を温存する
  （リモートがそのタブを削除した場合のみリモート側に従う）。
- **初回送信前の version チェック**: サーバ状態を一度も見ていないうちに送信する
  ケース（起動直後の編集が初回 onValue より先に flush される）は、`get()` で
  version だけ確認してから送る。確認するのは stale-client のみで、内容の新旧は
  判定しない（K5a: LWW）。`get()` が失敗（オフライン等）したら送信を優先する —
  SDK の書込キューがオフライン編集の耐久性を担っているため、ハードゲートにしない。
- **echo 抑制の起動時最適化**: subscribe 時に LocalStorage の生文字列を
  `lastCloudJsonRef` へ先読みする。単一端末運用では初回スナップショットが
  これと byte 一致するため、フル比較（parse + migrate + stableStringify）を
  スキップできる。StrictMode（dev）の二重 effect が起動直後に未編集 project を
  push するのも同時に抑止される。サーバ空（`raw == null`）の seed 時は
  この合意値を必ず無効化してから push する（一致すると seed 自体が echo 扱いで
  スキップされ、ノード削除後の再 seed が効かなくなる）。
- **競合は project 単位の last-writer-wins**。K5a（親 CLAUDE.md / ROADMAP）の
  ユーザ判断どおり、2 端末同時編集は運用上発生しない前提でマージ・楽観ロックは
  作らない。既知の限界: 編集後 800ms（debounce）以内にタブを閉じる / オフラインの
  まま閉じると、その編集はクラウドに乗らず、次回起動時にサーバ側で上書きされ得る
  （親アプリの useSyncedStorage と同じ意味論）。
- **同期対象は project のみ**。`builder.templates`（テンプレート）と
  `builder.schedule_user_defaults`（デフォルト保存）は端末ローカルのまま
  （JSON 書き出しにテンプレートが同梱されるので移行はそちらで可能）。
- **テストの隔離**: 開発機の `.env.local` は Vitest / Playwright にも読まれる
  ため、`vite.config.js` の `test.env` と `playwright.config.js` の
  `webServer.env` で VITE_FIREBASE_* を空にし、単体テスト・e2e は常に
  local-only モードで走る。firebase の挙動を検証するテストは module mock
  （`vi.mock`）で `isConfigured` を立てる。

---

## 6. 守るべき設計上の約束

- **状態統計で UI を自動変形しない**（リポジトリ CLAUDE.md の禁止規約）。
- **印刷は 2 系統**（親 CLAUDE.md）。Builder は `window.print()` 方式。
- **Tailwind は `builder-*` トークン**のみ使用。読めるテキストは WCAG AA（`contrast.test.js` で回帰防止）。
- **純粋関数は `utils/` ＋ `*.test.js`**。reducer も純粋に保ち、副作用（createdAt 付与・autosave）はフック側に置く。

---

## 7. 検証

```bash
npm run lint        # 0 errors / 0 warnings
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # 警告は excelExport の chunk size のみ（期待動作）
```
