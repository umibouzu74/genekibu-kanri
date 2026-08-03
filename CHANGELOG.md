# Changelog

## [Unreleased]

### Changed (通常時間割作成: セルをダッシュボード風の display-first に)
- セルは普段**ダッシュボードの時間割ビューと同じテキスト表示** (科目・
  講師・教室/備考が文字で並ぶ) になり、**クリック (Enter/Space) したセル
  だけがその場でプルダウン入力に切り替わる**。セルの外へフォーカスが
  移る / Enter / Escape で表示に戻る (Escape はセルへフォーカス復帰)。
- 表示セルはフォーム部品が無いため**セル全体を掴んでドラッグ入替**できる
  (⠿ ハンドルは廃止)。矢印キーは編集モードのまま隣のセルへ編集を移すので
  キーボードだけで連続入力できる。表示セル上の矢印はフォーカス移動。
- 印刷・コンパクト表示もテキストセルになり、紙面から select の枠が消えた。
- タブ / プロジェクト切替で編集状態は持ち越さない。

### Added (通常時間割作成: 編集補助 5 点 + 印刷)
- **講師プルダウンの重複予告**: その曜日・同時間帯に他のセル (タブ横断) で
  割当済みの講師へ「(重複)」を表示 (`conflicts.computeBusyTeachers`)。
  選択は妨げない (意図した重なりは承認フローで消せるため)。テスト +4。
- **セルの ✕ クリア**: セルにマウスを載せる (またはフォーカス) と右上に
  ✕ が出て、教科・講師・教室・備考を一括クリアできる。Undo で戻せる。
- **D&D 入替・✕ クリアは独立した Undo 単位**: 直前のタイピングと 800ms
  束ねされず、Ctrl+Z 一回でその操作だけが戻る (`commitWorkspace` の
  atomic オプション)。
- **表示トグルの保持**: 「▤ 空行を隠す」「🗜 コンパクト」がリロード後も
  保持される (講習の `usePersistedToggle` を共用。明示トグルの保存であり
  A18 系の自動学習ではない)。
- **教科にも「✎ 直接入力」**: マスタ外の単発教科 (「テスト対策」等) を
  セル上で直接入力できる (講師と同じ Enter 確定 / Escape 取消)。
- **🖨 印刷**: 表示中タブを window.print() で印刷 (CLAUDE.md 印刷二系統の
  window.print() 側、講習の builderPrintStyle と同型の `printStyle.js`)。
  A4 縦・全列を紙面幅に収める・曜日単位で改ページ・thead をページごとに
  繰り返し・空欄の教室/備考は紙面に出さない。印刷見出し (プロジェクト名 —
  タブ名・印刷日) 付き。テスト +8。

### Changed (通常時間割作成: UI を講習ビルダーと同じ操作感に刷新)
- **見た目を講習時間割作成と統一**: Tailwind の builder-* デザイントークンを
  regular-builder にも展開 (tailwind.config の content 拡張 +
  `.builder-root` ラップ)。ツールバー・タブバー・設定パネル・重複パネル・
  空状態ガイドも同じ質感に再スタイル。
- **単一テーブル化**: 曜日ごとに分かれていたテーブルを廃止し、講習の
  ScheduleTable と同じ「sticky クラスヘッダ (濃紺) + sticky 曜日/時限列 +
  曜日区切りの濃色帯 + 70vh スクロールコンテナ」の 1 枚の表に。
- **セル刷新**: 科目カラー背景 (講習と同じ配色・未登録科目はハッシュで
  フォールバック)。教科・講師は常時表示のテキスト 4 入力からプルダウン
  選択に変更 (typo 防止)。講師は「✎ 直接入力」でテキスト入力に切り替え
  でき、複数講師 ("·" 区切り) は確定時に `splitTeacherField` で正規化。
  教室・備考は値があるセルにだけ小さく表示。衝突セルは赤背景 +
  ⚠️重複バッジ (承認済みは除外、従来どおり)。
- **ドラッグ & ドロップでセル入替**: ⠿ ハンドル付き。空セルへは移動になる。
  コンテナ端に近づくと自動スクロール (講習 N2b と同じ)。純関数
  `swapScheduleCells` + テスト 3 件。
- **矢印キーでセル間移動**: ↑↓ で時限・曜日をまたいで移動、←→ は
  教科 ⇄ 講師 ⇄ 隣クラスへ連続移動 (講習 E1b の簡易版)。
- **タブバーを講習型に**: rounded タブ + タブ別バッジ (未承認の重複 ⚠件数 /
  マス目なし「空」/ 問題なし ✨)。ダブルクリックでタブ設定を開く。
- **🗜 コンパクト表示**: セルを縮めて全体を見渡すトグル (講習と同じ)。

### Added (通常時間割作成: 編集体験の強化 5 点)
- **▤ 空行を隠す**: セルが 1 つも無い時限行 (と空の曜日) を表示から隠す
  トグル。取込直後のタブは全時限 × 全曜日のマス目になるため、平日の列に
  土曜の時限行が並ぶノイズを一発で消せる (表示のみ、データは不変)。
- **重なりの承認**: 重複バッジをクリックすると一覧パネルが開き、現行
  データに元からある意図的な重なり (亀73 同室の個別指導など) をペア単位で
  「承認」して件数・赤枠から除外できる (解除も可)。承認は
  `project.approvedConflicts` に保存され、対象セルが動くと自動で失効する
  (保守的動作)。
- **反映の差分プレビュー**: 置き換え反映の前に「変わらず / 変更 / 追加 /
  削除」の内訳と明細 (変更はフィールド単位の before → after) を表示。
  マッチングは全フィールド一致 → 位置 (曜日×時刻×学年×クラス) の 2 段階
  (`reflect.diffReflection`)。
- **取込の平日/土曜タブ分割**: 「⬇ 本体から取込」に「平日と土曜で学年
  タブを分ける」オプション (既定オン)。平日と土日の両方にコマがある学年を
  「中3」「中3 (土)」の 2 タブに分け、曜日で時刻体系が違う学年のマス目が
  締まる。中3 の 2学期変更は分割時も正しく働く (前倒しは平日タブ、内申
  対策の午前枠は土タブへ)。
- **Undo/Redo**: ↩ ↪ ボタンと Ctrl+Z / Ctrl+Y (テキスト入力中はブラウザ
  標準の undo を優先)。連続編集 (タイピング等) は 1 つの取り消し単位に
  束ねる。プロジェクトの削除・取込もまとめて戻せる。
- テスト +13 (承認 4 / 差分 5 / タブ分割 4)。regular-builder 計 58。

### Added (通常時間割作成: 複数プロジェクト + 本体から取込 + 中3 2学期変換)
- 通常時間割作成が**複数プロジェクト**を持てるようになった。「2026 1学期」
  「2026 2学期」のような時間割案をツールバーのプルダウンで切り替えて編集
  できる (＋新規 / ⧉複製 / 🗑削除付き。削除はタブ・セルを巻き込むため
  確認ダイアログ)。保存形状はワークスペース (プロジェクト配列 +
  アクティブ id) に拡張し、旧単一プロジェクト形状は自動で引き継ぐ。
- **「⬇ 本体から取込」** (反映の逆方向) を追加。本体の時間割を選んで
  プロジェクトに変換する — 時限プールは出現時刻から自動生成、学年ごとに
  タブ化、クラス列の既定教室は最頻値から推定。同一マスの並列コマ
  (確認テストの複数監督や高3 の選択講座) は同ラベルの列を増やして保持し、
  **シード全 216 コマの取込 → 反映で欠落・変質ゼロの round-trip をテストで
  保証**。
- 取込オプション**「中3 の 2学期変更を適用する」**: 平日の最終コマ
  20:45-21:30 の内容を新 1 限 18:00-18:45 へ移動、確認テストを
  20:40-20:55 に繰り上げ、土曜に内申対策の午前枠 (10:00-11:00 /
  11:10-12:10 / 12:50-13:50 / 14:00-15:00) を空の時限として追加する。
  現行の時間割を取り込んでチェックを入れるだけで 2学期のたたき台が
  できる (`regular-builder/importTimetable`、冪等・中3 以外は不変)。
- テスト +19 (workspace 5 / importTimetable 14)。なお前項の「テスト +42」は
  テストファイル間の fixture import による二重登録込みの数で、正しくは
  +26 だった (fixture を testUtils に分離して解消)。

### Added (通常時間割作成: 講習ビルダー風の専用作成タブ)
- サイドバー「時間割管理 > 🏗 通常時間割作成」(chord `g r`) を新設した。
  講習時間割作成の操作感で通常時間割をゼロから設計する専用ビュー
  (`src/regular-builder`)。学年タブ × 「曜日 × 時限 × クラス」のマス目で
  組み、完成したら「⤴ 本体へ反映」で時間割 + コマとして書き出す。
- **時限は時刻付きで登録** (全タブ共通)。中3 の 18:00 開始と中12 の
  18:55 開始のように学年で時刻体系が違っても、タブごとに使う時限を選んで
  表現できる。クラスには既定教室を設定でき、セル側で上書きも可能。
- **セルは 教科 / 講師 / 教室 / 備考 の 4 項目**。講師・科目は入力候補
  (datalist) 付きで、講師マスタは本体のコマから一括取込できる。複数講師は
  「·」区切り (全角中点でも可)。備考に「隔週(◯◯)」「合同」等を書けば
  そのまま slot.note に反映される。
- **講師・教室の重複をタブ横断で自動チェック**。時限 id ではなく時刻の
  重なりで判定するため、開始時刻が違う学年間の衝突も検出する。該当セルは
  赤枠 + ⚠、ツールバーに件数バッジ。「👁 講師で探す」で特定講師のセルを
  強調表示できる。
- **反映は 2 モード**: 新しい時間割として作成 (名前・期間付き) / 既存
  時間割の置き換え (旧コマ削除 → 差し替え、確認ダイアログで警告)。反映後は
  ヘッダのプルダウン切替・日付ビュー・第N回カウント (期ごとリセット) に
  そのまま乗る。変換は純粋関数 (`regular-builder/reflect`) でテスト済み。
- 下書きは `appData/genyakubu-regular-builder-project` に本体データと独立
  して保存され、Firebase 設定済み環境ではクラウド同期される (クラウドへの
  書込は管理者ログイン時のみ。ローカル編集は誰でも可、反映ボタンは管理者
  限定)。
- v1 は手動入力のみ。ドラッグ移動・Undo/Redo・自動生成・スナップショットは
  今後の候補 (CLAUDE.md 参照)。テスト +26 (model / conflicts / reflect)。

### Added (期切替支援: 後期時間割を複製 + 時刻一括変換で組めるように)
- 時間割管理に**「時刻一括変換」**パネルを追加した。前期 → 後期のように
  「割当 (教科・講師・クラス) はそのまま、時刻だけ変わる」期の切替で、
  複製した時間割のコマ時刻をまとめて差し替える。対象時間割 × 学年
  (完全一致) × 曜日で絞り、変換元時刻 (件数付き候補) → 変換先時刻の
  ルールを複数指定。適用前に対象件数をプレビューし、確認ダイアログを
  経て保存する。**「中3 平日前倒し (後期)」プリセット**付き
  (20:45-21:30 → 18:00-18:45、確認テスト 21:35-21:50 → 20:40-20:55。
  旧 1・2 限は後期でも同時刻のまま 2・3 限になるため変換対象はこの
  2 種類で足りる)。ロジックは純粋関数 `utils/timeBulkEdit` に切り出し
  (テスト +15)。
- 時間割の**複製で授業セット (回数カウントの束ね) も引き継ぐ**ように
  した。複製元のコマに対応する授業セットを新しいコマ id に読み替えて
  複製する (2 コマ以上写像できたセットのみ)。
- **「第N回」は期ごとにリセット**。カウント起点を「学年グループ開始日
  (表示期間設定) と所属時間割 startDate の遅い方」にし
  (`getSlotCountStartDate`)、所属時間割の有効期間外の日はカウント
  しないゲートを追加した。前期/後期のコマが同一セット・同一コホートに
  並存しても二重カウントせず、後期は開始日から ① で数え直しになる。
  中学部開講日オリエンの 1 限判定も別の期のコマ (後期の 18:00 開始) に
  奪われない。テスト +11。
- 前期/後期の切替そのものは既存機能で行う: 時間割管理で現行を
  「2026 前期」に改名して終了日を設定 → 複製で「2026 後期」を作成して
  開始日を設定 → ヘッダのプルダウンで表示切替 (日付ビューは期間で自動)。

### Added (講習時間割: 講師別 Excel にクラス別回数まとめシート)
- 講師別 Excel の 1 枚目に**「クラス別回数」まとめシート**を追加した
  (S1)。行 = 講師、列 = 学年(タブ) × クラスの行列で、どの講師がどの
  クラスに結局何回行くかが最初のシートで分かる。座席表を毎回提出する
  運用で、必要枚数をあらかじめ印刷しておく用途。
- 右端は行の計 (= その講師が実際に行く回数)、最下段は列の計 (= クラスの
  総コマ数)。講師未割当のコマは '(未定)' 行 (グレー) に集計するので、
  割当が済んでいないことも紙面から分かる。0 回のセルは空欄。
- **確認テストの回数も併記** (S2)。各日の最終コマは授業 + 休憩 + 確認
  テスト 15 分を含む設計で、担当講師がそのまま確認テストを監督する
  (= 座席管理がもう 1 回発生する) ため、各セルに「5(テ2)」の形で
  うち確認テスト付き (最終コマ) の回数を添える。計・合計行も同表記で、
  テ表記がある場合は凡例に説明を出す。
- 合同 (複数クラス 1 コマ) は科目別シートと同じ「代表クラスに 1 回」の
  規約で集計し、外部授業 (他学年セッション) は対象外。該当がある場合のみ
  最下部に凡例を注記。B4 縦 + 先頭 3 行繰り返しの印刷既定は個人シート
  (P1) と同じ。
- **各講師の個人シートにも自分の分を掲載** (S3)。スケジュールリストの下に
  学年 (タブ) ごとの小さな表ブロック (タブ名 → クラス → 回数 `5(テ2)`) を
  縦に積み、最後のブロックの右に「計」を付ける。行くクラスだけを出すので
  コンパクトで、印刷して個人に渡った紙 1 枚で座席表・確認テストの必要
  枚数が分かる。空行で本体と切り離してあるため、学年で絞り込んでも
  ブロックは巻き込まれない。
- 集計は純粋関数 `computeTeacherClassCounts` (utils/excelExport) に
  切り出し。テスト +16 (xlsx round-trip 検証含む)。

### Added (まとめて印刷: 複数月選択 + バイト以外の講師も対象に)
- 月次予定の「📋 まとめて印刷」で**対象月を複数選択**できるようにした
  (①)。現在表示中の月を基準に前 1 か月〜後 4 か月をチェックボックスで
  選べる (既定は表示中の月のみ)。夏期講習の 7-8 月ぶんを 1 ジョブで
  出す想定で、冬期の 12-1 月 (年跨ぎ) も選択可。紙順は講師ごとに各月
  1 枚ずつ連続 (人単位で束ねて配布しやすい順)。印刷後は元の表示月に戻る。
- 同ダイアログに**「バイト以外の講師」セクション**を追加した (②)。
  常勤講師 (時間割のコマに登場するがバイト一覧に無い講師) をサイドバー
  と同じ教科別グループで表示し、バイトと混在選択できる。個人スケジュール
  なので講習コマ (講/外カード) も月次カレンダーにそのまま載る。
- 対象月候補・ジョブ名の整形は純粋関数 `buildBatchMonthOptions` /
  `buildBatchDocTitle` (utils/printStyles) に切り出し。テスト +7 件。

### Added (講習時間割: プリセット改名を登録済みセッションへ同期)
- 他学年セッションプリセットの名称/メモを後から直したとき (例:
  「予備校1限」が実は2限だった)、そのプリセット由来の登録済みセッションの
  メモも一括で追従できるようにした。プリセット編集フォームで名称/メモを
  変えると「登録済みセッション N 件のメモも更新する」チェックボックス
  (既定 ON) が現れ、保存時にまとめて更新する (Undo 1 回で両方戻る)。
- 対象は「変更前の展開ラベル (memo 優先、無ければ name) + 時刻が完全一致」
  のセッションのみ (`utils/presetRenameSync` の純粋関数)。適用後に手で
  書き換えたメモや、同名でも時刻が違う (別プリセット由来の) セッションは
  巻き込まない。時刻まで見るため「1限→2限, 2限→3限…」の連鎖リネームも
  順序を問わず安全。講師の自動NG判定は従来どおり時刻ベースなので不変。
- テスト +15 件 (presetRenameSync 7 / projectReducer 4 / AbsenceNgPanel 4)。

### Added (個人スケジュールの講習コマに回数連番 ①②… を表示)
- 個人月間スケジュール (MonthView) の講習コマカードで、科目名の直後に
  「そのクラスでその科目が何回目か」の丸付き数字を表示するようにした
  (例: 「13:00 英語②」)。番号は講習時間割作成の画面・講師別 Excel・
  配布用出力と同じ `makeSubjectOrderMarker` (クラス内を日付 → 時限順に
  走査した 1-based 連番) で導出し、紙面間で食い違わない。
- 合同 (複数クラス 1 コマ) でクラスごとに回数が違う場合は cls の並び順で
  "/" 連結して表示する (例: ３S/３A の「英語③/①」)。同一クラス×同日の
  科目重複 (builder 側の ⚠️2回 警告状態) 中は builder と同様に番号を
  付けない。講習期間の外部授業 (「外」カード) は対象外。
- `makeSubjectOrderMarker` は excelExport.ts から analysisHelpers.ts へ移動
  (exceljs 非依存の builderLessons からも使うため。excelExport チャンクの
  遅延ロードは維持)。テスト +6 件。

### Changed (講師の個人スケジュール: 既定を月間に + タグ初期値の自動化)
- サイドバーや Cmd+K から講師を選んだときに開く個人スケジュールの既定
  ビューを週間 → **月間 (MonthView)** に変更した。ヘッダの 週間/月間
  ボタンや `g w` / `g o` での切り替えは従来どおり。
- 講師を選択したタイミングで、テスト期間・特別イベントの**タグフィルタを
  担当コマから導出した初期値に自動リセット**するようにした
  (`utils/teacherTags` 新設)。判定は現在の時間割の担当コマ (隔週
  パートナー含む) からの導出のみで、利用履歴などは使わない:
  - 学校名タグは slot.subj の先頭トークン (= 学校) と照合する。素の部分
    一致だとタグ "高松" が 高松桜井/高松西/高松一 にも当たるため、先頭の
    "高松"/"第"・末尾の "高校"/"高" を落とした「核」同士で比較する
    (schoolCore)。タグ "高松" は 高松高 のみ、"第一"/"一高" は 高松一、
    "桜井" は 高松桜井 にマッチ。正規化で拾えない略称 ("高高" 等) は
    SCHOOL_TAG_ALIASES で対応。
  - "中学" / "高校" (部単位) のタグは担当コマの学年 (gradeToDept) で判定。
    学年表記 ("附中", "高1" 等) のタグは slot.grade との部分一致。
  - どのコマにもマッチしないタグ (行事名などの自由ラベル) は自動 OFF の
    対象にせず、既定の ON のまま残す。
  - 自動リセット後もチップの手動トグルは従来どおり有効 (次に講師を選択
    するまで保持)。まとめて印刷 (BatchPrint) は従来どおり現在のフィルタ
    状態のまま印刷する (講師ごとの再導出はしない)。
- テスト +11 件 (slotMatchesTag / deriveTagFiltersForTeacher)。

### Fixed (モバイル: サイドバーがスクロールできず講師一覧に届かない)
- 画面の低い端末ではメニュー群だけでサイドバーの高さを使い切り、講師一覧
  (flex:1) の高さが 0 になってスクロールもできず講師の個人スケジュールへ
  辿り着けなかった。768px 以下ではメニュー + 講師一覧を 1 つのスクロール
  領域 (`.sidebar-scroll`) に統合して全体を縦スクロール可能にした
  (overscroll-behavior: contain で背景へのスクロール連鎖も防止)。
  デスクトップは従来どおり「メニュー固定・講師一覧のみスクロール」。

### Added (講習時間割 → 個人月間スケジュールの反映)
- 講習時間割作成で組んだ講習コマを、個人の月次カレンダー (MonthView) に
  「講」バッジ付きカードとして表示するようにした。builder の project (RTDB
  `appData/builder/schedule_project`) を親アプリ側で読み取り専用に購読し
  (`useBuilderProject`)、日付ラベル "M/D(曜)" は project.updatedAt を基準に
  最も近い年へ解決して実日付に展開する (`utils/builderLessons`。冬期講習の
  年跨ぎも基準日との距離で解決。過去方向の距離は 2 倍に重み付けし、半年近く
  先に組んで以後未編集の project でも前年へ誤解決しない)。正は常に builder
  側で親アプリからの書き戻しは無く、編集も builder 側で行う (カードに
  クリック導線なし)。
- 同じ日・時限・講師・科目の複数クラス (合同) は 1 枚のカードにまとめて
  クラスを "/" 連結で表示。講師「未定」のセルは載せない。時限の時刻は
  ラベル ("1限 (13:00~)") から解析し、読めない時限は時限名で表示する。
- **講習期間の外部授業 (予備校・高校等の externalSessions) も反映する**。
  講師別 Excel のグレー行と同じ扱いで、無彩色の「外」バッジカードとして
  同じセルに時刻順で混ぜる。種別ラベルも Excel と同じ規則: メモ
  (プリセット適用時はプリセット名) を優先し、メモ未設定でも時刻が
  プリセットに一致すればその名前を表示にだけ使い (computePresetMemoBackfill
  再利用)、判別できなければ「外部」。時刻の読めないセッションは同日の
  末尾に沈める。印刷凡例に「外 = 講習期間の外部授業」を追加。
- 講習期間は通常時間割の表示範囲 (displayCutoff) の外になるのが常なので、
  講習コマはカットオフでも休講の巻き添えでも消さない。講習コマのある日は
  「未確定」プレースホルダを出さず講習の予定を紙面に載せる。月次印刷凡例に
  「講 = 講習」を追加。本人担当コマなので表示トグルの対象外 (H1b と同じ)。
- 制約: 講習コマへの代行管理は対象外 (slotId が無い。追加授業の H1d と同種)。
  builder の project は常に 1 つのため、次シーズンの project 作成を始めると
  前シーズンのコマは過去月の表示からも消える (ライブ表示専用)。
- テスト +26 件 (変換・年推定・パース 23 / MonthView 表示 3)。

### Changed (講習時間割作成: 配布用 Excel を完成版レイアウトに置換)
- 「🎒 配布用」の Excel 出力を、例年手作業で仕上げていた掲示紙面 (2025 年
  夏期の完成版 xls) を再現する**完成版レイアウト**に置き換えた
  (`distributionExport.ts` 新設)。同じ時限セットを使う学年 (タブ) を
  1 シートに横並びにし、日付ブロックを左列 → 右列の 2 段組で配置。各時限は
  「時限名+クラス別科目」「時刻+クラス別講師」の 2 行ペアで、A4 縦 1 ページ
  に収まる印刷設定を埋め込み済み。
- クラス行 + 教室行 (+ 複数学年なら学年行) のヘッダ付き。**教室行は空欄で
  出力**するので配布前に Excel 上で記入する (教室はツールで管理しない)。
  確認テスト (タブ内全クラス同一科目・講師なし) は 1 セルに結合、授業ゼロの
  日はイベント説明の書き込み欄として全結合される。
- 旧「配布用 (注記なし)」の学年グリッド形式 (buildScheduleWorkbook の
  clean オプション) は廃止。作成用の注記入り出力は従来どおり
  「全体スケジュール」で行う。

### Added (講習時間割作成: 講師別 Excel にタイトル行 + B4 縦の印刷デフォルト)
- 各講師シートの先頭に「講師名 — プロジェクト名 / 期間 (その講師の初日〜
  最終日) / 出力日」のタイトル行を追加。印刷した紙の一番上に誰のスケジュール
  かが必ず載り、2 ページ目以降にもタイトル・ヘッダ行が繰り返し印刷される。
- 全シート (各講師 + 全講師リスト) に **B4 縦**の印刷設定を埋め込み。Excel で
  開いてそのまま印刷すれば B4 縦になる。
- 両面 (長辺綴じ) は xlsx フォーマットに保存できない (OOXML の pageSetup に
  duplex が無く、プリンタドライバ固有の領域にしか載らない) ため、
  プリンタ側の既定設定で運用する。

### Added (講習時間割作成: 講師別 Excel にオートフィルタ)
- 講師別スケジュールの各講師シートと全講師リストのヘッダ行に Excel の
  **オートフィルタ**を付けた。学年(タブ) 列で「中3 だけ」「中1+中2」の
  ような任意の組み合わせに絞って確認・印刷できる (絞った状態で印刷すると
  表示行だけが紙面に載る)。外部授業行も同列の種別 (予備校・高校等) で
  同様に絞れる。全講師リストは講師名 × 学年(タブ) の組み合わせ絞りも可能。
- タブ別にシートやセクションを増やす案は、講師 × タブでシート・紙面が
  爆発するため見送り、絞り込みは Excel のフィルタに任せる方式にした。

### Added (講習時間割作成: 日付ごとの確認ステータス「OK / 要確認 / 不備あり」)
- 時間割表の日付セル (ラベル直下) に 3 つのチェックを追加。
  - **不備あり**: その日の全セル (時限×クラス) に科目+講師 (「未定」以外) が
    入っていないと自動でチェックが付き、埋まると自動で外れる (手動変更不可。
    導出は `computeIncompleteDateIds`、保存しない)。
  - **OK / 要確認**: 手動チェック (排他、再クリックで解除)。タブ (学年) × 日付
    ごとに `tab.dayStatuses` として保存され、同期・Undo・JSON 書き出しに乗る。
    不備あり中は OK を選べない (要確認は講師調整中のメモとして付けられる)。
  - 日付のプール削除時は該当ステータスも cascade 掃除。読込時は型崩れを
    正規化 (`normalizeTabDayStatuses`、version 据え置きの後発フィールド補完)。
  - テスト +17 件 (reducer / 判定 / migrate / ScheduleTable UI)。

### Added (講習時間割作成: 講師別 Excel に予備校・高校等の外部授業を統合)
- 講師別スケジュールの各講師シート・全講師リストに、講師不在・NG 設定の
  他学年セッション (予備校・高校等) を**日付 (カレンダー順) → 時刻順**で
  講習コマに混ぜて出力する (グレー行、科目欄は空欄、クラス列は「-」)。
  学年(タブ) 列には種別＝メモ (プリセット名) を出す。メモ未設定でも時刻が
  プリセットに一致すればその名前を**表示にだけ**使い (データは書き換えない)、
  判別できない場合のみ「外部」。講習コマが 1 つも無い講師は従来どおり
  シートを作らない。
- 日付が変わる行の上辺を太線にして 1 日のまとまりを見やすくする
  (各講師シート + 全講師リスト。全講師リストは講師の切り替わりにも太線)。
- プリセット適用時、メモ未設定のプリセットは**プリセット名をメモの既定値**
  として展開する。セッション一覧・自動NG ツールチップ・Excel で
  「予備校か高校か」を判別できるようにする。
- 登録済みのメモ無しセッションには、講師不在・NG パネルの
  「🏷 プリセット名をメモに一括適用」で**時刻の一致から後付け**できる
  (`computePresetMemoBackfill`)。同時刻プリセットが複数のときは
  期間・対象講師で絞り込み、判別できない分はスキップ。既存メモは
  上書きせず、Undo 1 回で戻せる。
- テスト +19 件 (excelExport / AbsenceNgPanel / presetMemoBackfill / reducer)。

### Added (講習時間割作成: Firebase 同期 — E6a)
- プロジェクトを親アプリと同じ Firebase RTDB (`appData/builder/schedule_project`)
  へ自動同期。タブレット等の別端末からも同じ時間割を開いて編集できる
  (書込は親アプリの管理者ログインが必要。未ログイン・Firebase 未設定環境では
  従来どおりローカル保存のみ)。
  - 保存は既存の debounce autosave に相乗りし、LocalStorage と同一の JSON
    **文字列**を送信 (RTDB のオブジェクト保存は空配列・空オブジェクトを刈り取る
    ため)。サイドバーの同期インジケータにも書込中として反映される。
  - 受信は `decideRemoteProject` (純粋関数) で判定: 他端末の保存は
    toast 通知つきで全置換 (Undo 履歴はリセット)、同一内容はスキップ、壊れた
    blob はローカル正で自己修復、サーバ側がより新しいスキーマ version の場合は
    上書き破壊を防ぐため同期を停止してリロードを案内。
  - 競合はプロジェクト単位の last-writer-wins (K5a のユーザ判断に整合。
    2 端末同時編集は運用上想定しない)。テンプレート・「デフォルトとして保存」は
    端末ローカルのまま。
  - テスト +36 件 (projectSync.test.ts / useHistoryStack.sync.test.jsx)。
    database.rules.json に文字列 validate を追加。
  - 校正レビュー (8 角度 + 反証検証) の反映: 単体テスト・e2e・dev を実
    Firebase から隔離 (`test.env` / `webServer.env`)、初回送信前の version
    確認 (`get()`) で書込前の stale 上書きを防止、activeTabId / updatedAt を
    同一性比較から除外 (タブ切替が他端末の Undo 履歴を消さない)、受信
    payload の templates strip、ノード削除後の再 seed 修正、seed 失敗の
    toast 沈黙化、エラー通知を「失敗エピソードごとに 1 回」へ、ゴミ blob の
    stale-client 誤判定防止、比較の cleanSchedule 対称化、stableStringify の
    共有 util 化 (`src/utils/stableStringify.js`)、JSON 読込の新 version
    ガード、連続反映 toast の間引き。

### Fixed (講習時間割作成: 日付ラベルの表記ゆれ「8/6」と「8/6(木)」を読込時に統一)
- date picker 化以前の手入力で残った曜日サフィックス無しの日付「8/6」が、
  現行形式「8/6(木)」と別の日付として日付プールに共存し、講師不在・NG
  パネル等に同じ日が 2 つ並んでいた。読込時マイグレーションに統一処理
  (`utils/dateLabelUnify.js`) を追加:
  - 同じ月日の「M/D(曜)」がプールに居る場合はそちらへ**マージ**
    (コマ・使う日選択・NG・外部コマ数・合同グループ・他学年セッション・
    プリセットの参照も付け替え。衝突時は (曜) 側を優先)。
  - 居ない場合は (曜) 付きラベル群と矛盾しない年から曜日を推定して
    **リネーム**。年が確定できないときは誤った曜日を付けず温存する。
  - 「8/6-補講」のような包含ラベルの NG キーは最長一致判定で巻き込まない。
    テスト +18 件。

### Added (講習時間割作成: ドキュメント整備 — E8a / E8b / E8d)
- **ユーザーガイド** (`src/timetable-builder/docs/USER_GUIDE.md`): 画面構成・
  初回セットアップ・CSV 一括登録・基本操作・自動作成・スナップショット/差分/
  テンプレート・出力・トラブルシュートを網羅した操作マニュアル。
- **アーキテクチャ** (`src/timetable-builder/docs/ARCHITECTURE.md`): Mermaid で
  全体構成 / 編集 1 操作の sequence / 自動生成パイプライン / データモデルを図示。
- **ROADMAP**: 冒頭に「§0 完了済み一覧」インデックス表を追加。

### Changed (講習時間割作成: 操作系の UX 仕上げ — E1a / E1b / E1e / E1f)
- **Excel 出力を dropdown 化**: ヘッダの全/個人 Excel 2 ボタンを「📊 Excel出力 ▾」
  に集約し、ボタン群を flex-wrap で折り返す (狭画面対応)。
- **フォーカス可視化**: `.builder-root :focus-visible` に太い (3px) リング + offset
  を追加。色だけに頼らず形状で認識でき、濃色ボタン上でもコントラストを確保。
- **矢印ナビの端動作統一**: セルの ← → が行頭/行末で反対端へ wrap し、移動が
  途切れない。
- **ヘッダの長押し対応**: スケジュール表のヘッダ (日付/時限/クラス) もタッチ
  長押しでメニューを開けるように。

### Added (講習時間割作成: 自動生成の live 進捗 — E2f)
- 探索の途中経過 (充填数 / 探索回数) を Worker から間引き通知し、生成中の
  ツールバーにライブ表示。`onProgress` を autoGenerator → worker → runGenerator →
  BuilderApp に配線。テスト +5 件。

### Added (講習時間割作成: タッチ操作・狭画面対応 — E1f / E1a)
- **長押しでコンテキストメニュー** (`hooks/useLongPress.js`): タッチ端末で
  時間割セルを長押しすると、右クリックと同じメニュー (コピー/貼付/クリア/
  ロック/NG 登録) が開く。500ms 判定、スクロール (10px 移動) でキャンセル、
  マルチタッチ無視。HTML5 ドラッグはタッチで発火しないため D&D と競合しない。
  テスト +6 件。
- **Toolbar の折り返し**: 狭画面でボタン群が画面外へはみ出さず段組みで
  折り返すように (`flex-wrap justify-end`)。
- オンボーディングに「タッチ端末では長押し」と追記。

### Added (講習時間割作成: NG 日時の CSV 一括取り込み — E2a)
講師の不可時間 (NG) を CSV で一括登録できるように。初期セットアップの手入力を軽減。

- **パーサ** (`utils/csvImport.js` の `parseNgCsv`): ヘッダ
  <code>name(または teacher),date,period</code>。空欄エラー集約・重複行 dedupe・
  未登録の講師/日付/時限を warning として返す。
- **reducer** (`teacher/importNg`): name 一致の講師にのみ NG を追加 (dedupe)、
  未登録 name は skip、変更なしは同参照で履歴を汚さない。
- **UI** (`ConfigModal/NgCsvImport.jsx`): 「📅 講師不在・NG」タブに折りたたみ
  パネル。paste / ファイル選択 / ドラッグ&ドロップ + ライブプレビュー。
- **テスト**: parseNgCsv 8 / reducer 3 / NgCsvImport 5。

### Added (講習時間割作成: 自動生成の手応え可視化 — E2f)
大規模プロジェクトで「生成にどれだけ時間がかかり、どこで詰まったか」が読めるように。

- **生成統計** (`autoGenerator.generateSinglePattern`): 探索回数 (iterations)・
  上限到達 (hitLimit)・最初に埋められなかったコマ (stuckSlot) を返す。
- **経過時間**: 生成中は Toolbar に「⏱ X.Xs」をライブ表示、完了後は結果
  ヘッダに総時間。
- **結果パネル**: 各案に「探索 N 回 / (上限到達) / 詰まり: 日付 時限 クラス」。
- **テスト**: autoGenerator +3 / SummaryPanel 新規 4。

### Changed (講習時間割作成: コントラストを WCAG AA 準拠に — E1e)
- **builder-orange** を #e67a00 (白背景 2.94:1 で AA 未達) → **#c2410c**
  (5.18:1) に。部分解テキスト/ボタン・warning 系の可読性が AA を満たす。
- 読めるアイコンボタン (×閉じる/削除・▲▼並べ替え) を ink-ghost (1.92:1) →
  ink-muted (5.74:1) に。ink-ghost は罫線・disabled 等の装飾用途に限定。
- **コントラスト計算** (`utils/contrast.js`): WCAG 2.x の純粋関数を追加し、
  `contrast.test.js` で「読めるテキスト」配色 21 ペアが AA を満たすことを
  回帰テスト化。テスト +27 件。

### Added (講習時間割作成: キーボード操作の完成度向上 — E1b)
マウスに頼らず設定モーダルとタブを操作できるように。

- **focus trap の共通化** (`hooks/useFocusTrap.js`): OnboardingOverlay の
  インライン実装をヘルパー化し、Escape で閉じる + Tab/Shift+Tab で dialog 内に
  フォーカスを閉じ込める。入れ子 dialog は最上位だけが応答 (LIFO)。
- **設定モーダル**: focus trap を適用し Tab が背景へ抜けないように。カテゴリ
  タブを `role="tablist"` 化し ← → / Home / End で切替 (端で wrap)。
- **学年タブ (TabBar)**: 同様に `role="tablist"` + 矢印キーで切替、
  aria-selected / roving tabindex 付き。
- **テスト**: useFocusTrap (新規 6) / ConfigModal (+5) / TabBar (+5)。

### Added (講習時間割作成: データ消失を防ぐ 2 つの保険 — E6c / E6d)
- **LocalStorage 容量監視** (`utils/storageHealth.js`): 起動時に保存サイズを
  概算し、5MB の 50% を超えていたら整理・バックアップを促す warning toast。
  通常運用 (~12KB) では発火しない閾値。テスト +13 件。
- **複数タブ競合検出** (`utils/tabPresence.js` / `hooks/useTabPresence.js`):
  `BroadcastChannel` で同一ブラウザの別タブが Builder を開いていることを検出し、
  autosave の相互上書きを防ぐため一度だけ警告。非対応環境は no-op。テスト +11 件。

### Fixed (講習時間割作成: 校正レビューでの指摘修正)
3 観点の独立レビューで見つかった不具合を修正:

- **生成パラメータの数値入力が打ち直せない (HIGH)**: controlled value が毎キー
  入力で clamp され、特に「探索回数の上限」(最小 5万) を入力できなかった問題を
  修正。ローカル draft を持ち blur / Enter で確定する方式に (スライダーは即時)。
- **修正提案「1日コマ数上限を上げる」が上限超過値を提案 (MEDIUM)**: 適用時に
  clamp される値を提案し、toast の表示と実際の適用値が食い違わないように。
- **読込検証が schedule 欠落を許容 (MEDIUM)**: `schedule` を必須化し、旧
  バージョンの migrate がクラッシュする経路を事前に弾くように。
- **NG 解除のワンクリック適用が二度押しで付け直す (MEDIUM)**: 現在 NG の
  ときのみ解除する冪等動作に。
- **テンプレート全体適用が未検証 (LOW)**: 適用前に構造を検証し、壊れた
  テンプレートはエラー通知して中断。
- **autosave の容量超過が未捕捉 (LOW)**: `localStorage.setItem` を try/catch で
  保護し、失敗時はステータス表示に反映。

### Changed (講習時間割作成: cleanSchedule の計算量を O(K) 化 — E4a)
- `cleanSchedule` を「全 (日付×時限×クラス) を展開して照合」から「既存
  スケジュールキーを走査して entity の存在を直接判定」に変更
  (O(D×P×C+K) → O(D+P+C+K))。挙動は等価。大きめのプロジェクトでの
  保存・読込・パターン適用が軽くなる。テスト +4 件 (全 1347 件 pass)。

### Added (講習時間割作成: 読込データの構造バリデーション — E3d)
壊れた localStorage / 不正な JSON によるクラッシュやデータ損失を防ぐ保険。

- **構造検証** (`utils/projectSchema.js`): `validateProjectShape` が
  tabs / config.dates・periods・classes / subjectCounts / teachers などの
  致命的な型崩れを検出。zod 等の依存は追加せず手書き (バンドル増ゼロ)。
- **起動時** (`loadInitialProject`): 検証 NG ならデフォルトにフォールバック
  して toast 通知 (従来の JSON.parse 失敗と同じ経路)。
- **JSON 取り込み** (`handleLoadJson`): 検証 NG なら適用せずエラー toast。
- **テスト**: projectSchema を新規追加、projectFactory に fallback を追記
  (計 +12 件、全 1343 件 pass)。

### Added (講習時間割作成: テンプレート機能・年度間コピー — E2d)
去年の設定を今年に流用できるテンプレート機能。プロジェクトを名前付きで
保存し、翌年などに「全体」または「講師マスタのみ」を適用して使い回せる。

- **テンプレート管理** (ConfigModal「🗂 テンプレート」タブ): 現在の
  プロジェクトを保存 / 一覧 (作成日・講師数・タブ数) / 「全体を適用」/
  「講師のみ」/ 削除。適用は確認ダイアログ + Undo (Ctrl+Z) で取り消し可。
- **保存先**: localStorage (`builder.templates`、project state とは独立)。
  snapshots は除外して保存。壊れたデータは空配列にフォールバック。
- **テスト**: templates / TemplateManager を新規追加 (計 +15 件、
  全 1331 件 pass)。

### Added (講習時間割作成: 修正提案のワンクリック適用 — E2b MVP)
E1g の修正提案のうち、機械的に確実なものをその場で適用できるように。

- **「適用」ボタン** (`Toolbar` の「設定の問題」popover): 提案を
  `{ text, action }` 構造化し、action 付きの提案に適用ボタンを表示。
  - `releaseNg`: 該当講師の手動 NG をワンクリック解除。
  - `setMaxDaily`: 1 日コマ数上限を必要値へ引き上げ。
  - 適用は単発操作なので Undo (Ctrl+Z) で戻せる。
- **テスト**: fixSuggestions を action 構造に更新、Toolbar に適用経路を追記
  (全 1316 件 pass)。

### Added (講習時間割作成: 講師の連続コマ数制約 — E2c)
「同じ講師に N コマを超える連続担当をさせない」制約を自動生成に追加。
1 日合計の上限だけでなく、連続性も指定できる。

- **設定** (⚡自動生成タブ):「講師の連続コマ数上限」を追加。0 = 制限なし
  (既定なので従来挙動を維持)。
- **solver** (`wouldExceedConsecutive` / autoGenerator): 時限の並び順を見て、
  講師を置くと連続ランが上限を超える場合は候補から外す。「未定」は対象外。
- **テスト**: teacherConstraints / autoGenerator / constants / GenerationSettings
  / projectReducer に追記 (計 +11 件、全 1314 件 pass)。

### Added (講習時間割作成: エラー時の修正提案 — E1g)
自動生成が構造的に解けない設定 (担当講師ゼロ / 科目 capacity 不足) に対し、
「では、どう直すか」の具体策を提示してデバッグ時間を短縮する。

- **修正提案** (`Toolbar` の「設定の問題」popover): 各 infeasibility の下に
  💡 で解決策を箇条書き。例:「12/25 1限 の NG を解除する: 堀上」「別の時限
  なら担当可能: 2限」「英語担当を あと 1 名 増やす」「1日コマ数上限を 6 → 9
  に上げる」など。
- **純粋関数** (`utils/fixSuggestions.js`): `suggestForNoTeacher` /
  `suggestForCapacity` / `buildFixSuggestions`。手動 NG と自動 NG を区別し、
  解除可能な NG や移動先の時限を具体的に挙げる。提示のみで自動適用はしない。
- **テスト**: fixSuggestions を新規追加、Toolbar に表示確認を追記
  (計 +12 件、全 1303 件 pass)。

### Added (講習時間割作成: 講師マスタ CSV のファイル取り込み — E2a)
講師マスタ CSV インポートが貼り付け (paste) に加えて、ファイル選択と
ドラッグ&ドロップに対応。新規セットアップ時の導入障壁を下げる。

- **ファイル選択 / D&D** (`TeacherManager` の CSV パネル):「📂 ファイルを
  選択」ボタンと textarea へのドラッグ&ドロップで CSV を読み込み。読み取った
  内容は既存の paste フロー (parse + プレビュー + 追加/更新/全置換) に合流。
- **ガード**: CSV 以外の拡張子はエラー toast、ドラッグ中は枠をハイライト。
- **テスト**: TeacherManager を新規追加 (ファイル選択 / D&D / 非 CSV ガード
  の 3 件、全 1291 件 pass)。

### Added (講習時間割作成: スケジュール差分ビュー — E1d)
保存したスナップショットと現在の状態が「どのセルでどう違うか」を一目で
確認できる機能。スナップショットと組み合わせて試行錯誤の比較ができる。

- **差分表示** (`SnapshotMenu` に「🔍 差分」トグル): 各スナップショット行で
  「このスナップショット → 現在の状態」の差分を ＋追加(緑)／－削除(赤)／
  ≠変更(橙)のサマリ + セル一覧(日付 時限 クラス: 旧→新)で表示。
- **純粋関数** (`utils/scheduleDiff.js`): `diffSchedules(from, to)` は
  セル単位で added/removed/changed を判定(subject+teacher のみ比較、
  locked は無視、空セルは未割当扱い)。`summarizeDiff` で種別件数。
- **テスト**: scheduleDiff を新規追加、SnapshotMenu に比較操作を追記
  (計 +13 件、全 1288 件 pass)。

### Added (講習時間割作成: 名前付きスナップショット — E1c)
試行錯誤しながら時間割を作る際に「いまの状態を保存 → 別案を試す →
いつでも戻す」ができる便利機能。undo/redo の単線履歴とは別に、名前付きで
複数の状態を残せる。

- **保存・復元 UI** (`SnapshotMenu`, Toolbar に同梱): 📌 ボタンから現在の
  タブの時間割を名前を付けて保存。一覧から「復元 / 改名 / 削除」。
  アクティブタブのものだけ表示し、件数バッジ付き。
- **データモデル**: `project.snapshots`(`{ id, name, tabId, createdAt,
  schedule }`)。schedule は deep copy。タブ削除時は紐づくスナップショットも
  掃除。`migrateProject` で後発フィールドとして空配列に初期化。
- **reducer**: `snapshot/save` / `apply`(記録元タブへ復元 + 切替)/
  `rename` / `remove`。`useProject` に対応 callback を追加(createdAt は
  hook 側で付与し reducer の純粋性を維持)。
- **テスト**: SnapshotMenu を新規追加、projectReducer に追記(計 +19 件、
  全 1275 件 pass)。

### Added (講習時間割作成: 自動生成の操作性向上 — E2e / E2f-cancel / E2h)
「🧙‍♂️ 自動作成」周りの操作性を底上げ。これまでハードコードだった生成
パラメータを設定可能にし、生成の中止と採用案の比較を支援する。

- **生成パラメータの UI 化** (`ConfigModal`「⚡ 自動生成」タブ / E2e):
  「生成する案の数」「講師 1 人の 1 日コマ数上限」「探索回数の上限」を
  number input + スライダーで調整可能に。`project.numPatterns /
  maxDailyHours / maxIterations` に保存し、`resolveGenerationParams` /
  `clampGenerationParam` で範囲外値を防御。reducer は
  `project/setGenerationParams` で部分更新。
- **自動生成の中止ボタン** (Toolbar / E2f 一部): 生成中に「✕ 中止」を
  表示。worker を止めて既存セルは保持したまま中断できる。
- **生成案の負荷偏り表示** (`SummaryPanel` / E2h): 各案の集計に
  「最多 / 最少 / 偏り」を中立表示 (`summarizePatternLoad`)。完全解どうしを
  講師コマ数の均等さで比較して採用案を選べる。
- **テスト**: constants / patternLoad / GenerationSettings を新規追加、
  projectReducer / autoGenerator / Toolbar に追記 (計 +32 件、全 1257 件 pass)。

### Changed (回数カウントを「コース」単位に整合 + コホートUI改善)
コース別終講日のレビューで判明した「終講日コホート」と「回数カウント
(授業セット)」の二重管理を整理。ClassSet 未登録だと 高1・2 の英数 (週2) が
曜日ごとに ①から数え直しになる問題を解消。

- **回数のコホートフォールバック** (`sessionCount.js` / `cohorts.js`):
  `resolveSetSlotIds` が ClassSet 未登録時に「コース (コホート)」単位
  (`buildSlotCohortIndex`) で束ねるようになり、終講日と回数の集計単位を
  1 つの定義に統一。高1・2 英数が 月①→木②→月③… と通算される。
  明示的な ClassSet は従来どおり優先。既存の回数挙動 (単体・セット登録済み・
  オリエン) は不変。
- **コホート内訳の表示** (`CohortCutoffEditor`): 各コホート行に曜日・科目の
  内訳を併記し、何が含まれるか確認できるように。
- **コホート対象外の可視化**: どのコホートにも属さない授業 (高1・2 の英数以外
  など、グループ終了日に従うもの) を一覧表示。
- **微修正**: 中学コホートの並びを平日コース→土曜の順に。`isEnglishOrMathSubject`
  を学校トークン無しの科目名にも対応。

### Added (コース別 終講日設定: 学校別・曜日別の表示終了日)
学年グループ (中1・2 / 中3 / 高1・2 / 高3) では 1 グループにつき終了日が
1 つしか持てず、実際の終講日が細かくズレるケースを表現できなかった問題に対応。

- **コホート導出** (`src/utils/cohorts.js`): いま入っている授業 (slots) から、
  終講日がズレる単位 = 「コホート」を自動で束ねる。
  - 高校: `学年 × 学校` (学校 = `subj` 先頭トークン。高松西 / 高松高 / 高松一 /
    高松桜井 / 東大京大医進 など)。学校ごとにテスト日程・終業が違うため。
  - 中学: `学年 × 曜日ペア` (火木 / 水金)。中3 / 附中3 も区別。同じ回数でも
    曜日が違うと終講日がズレるため。
- **UI** (`src/components/CohortCutoffEditor.jsx`): 時間割管理ビューに
  「コース別 終講日設定」カードを追加。現在のクラスをコホート単位で一覧し、
  クリックで終講日を選ぶ。設定済み件数の表示、対象授業が消えた未使用エントリの
  掃除導線も用意。
- **フィルタ** (`isSlotBeyondCutoff`): 終講日は per-slot 表示フィルタに反映。
  コホート終講日は学年グループの終了日を上書きし、未設定時はグループ設定に
  フォールバック。開始日は従来どおりグループ単位、回数計算は不変。
  `isEntireDayBeyondCutoff` はコホートによる「延長」を考慮 (短縮は per-slot 側)。
  ダッシュボード / 月次 / 確定代行ビューが反映対象。
- **スキーマ**: `DisplayCutoff` に `cohorts` (`CohortCutoff[]`) を追加
  (v13 → v14、既存データは空配列で移行)。

### Fixed (コース別 終講日: 授業の無い曜日が出る / コース単位でまとめる / 高校は英数セット)
コホートを `dayPairLabel` (火→火木 / 水→水金) で機械的にペアへ寄せていたため、
(1) 片曜日しか授業が無い学年で存在しない曜日が表示され (中1=火金 なのに
「中1 火木」「中1 水金」、附中=水 なのに「附中 水金」)、(2) 同じ生徒が
週2回通う1コース (中1=火金 / 中2=月木) が 2 行に割れて終講日を二重入力する
必要があった。

- **コース単位の導出** (`deriveCohortsFromSlots`, `partitionDaysIntoCourses`):
  中学は学年ごとに平日授業を 1 コースに束ねる (中1=火金 / 中2=月木 /
  中3=火水木金 / 附中=水)。土曜の特訓・プレップは別コース。
- **高1・2 は英数のみをセット化** (`isEnglishOrMathSubject`): 学校ごとの
  英数 (週2 で通う中核) だけを 1 コホートにまとめ、英数以外 (土曜の理科・
  古文漢文等) はコホート化しない (= グループ終了日にフォールバック)。
  ID は `H|<学年>|<学校>|英数`。高3 は従来どおり科目別。
- **ID に実曜日を埋め込む**: `M|<学年>|<曜日列>` (例 `M|中1|火金`, `M|中3|火水木金`)。
- **照合を曜日メンバーシップ化** (`findCohortCutoff`): 保存済みコホート ID の
  曜日列に `slot.day` が含まれるかで判定。`isSlotBeyondCutoff` は slot 単位の
  ままで動き、既存 ID (`M|中3|水金` / `H|高1|高松西` 等) とも後方互換。
- `slotCohortId` / `dayPairLabel` / `daysForPairLabel` は役目を終えたため削除。

### Fixed (AbsenceNgPanel のコードレビュー指摘 P1-P3 を対応)
タブ統合直後のコードレビューで判明したバグを修正。

P1 (致命的・mass action リスク):
- **end date デフォルトを単日に**: `formEndDateId` 初期値を `dates[last]` から
  `dates[0]` に修正。デフォルト範囲が全期間 (例: 14 日) から単日に縮退し、
  ユーザが他学年モードで誤って『M 名 × N 日』のセッションを大量生成する
  事故を防ぐ。
- **ALL_TEACHERS sentinel 復活**: 講師選択 state を `{ allMode, names }` に変更し、
  `allMode=true` のときは『現在の project.teachers』から動的に解決する
  (旧 NgSettings の挙動と等価)。『全選択』後に追加された講師も次の操作で
  自動的に対象に含まれる。同パターンを period 選択にも適用 (新 period 追加で
  silent miss を起こす問題も解消)。
- **日付削除時の snap を nearest に**: end date が削除された時、これまで
  `dates[last]` へジャンプして範囲を widen していたのを、`start に揃える
  (= 単日)` に変更。意図しない範囲拡張を防ぐ。
- **applyPreset の partial date update を防止**: preset の `startDateLabel` /
  `endDateLabel` が両方とも現在の dates に存在する場合のみ両方を update。
  片方しか resolve しない場合は両方を skip して toast 警告。

P2 (実バグ):
- **canApply 判定の統一**: NG / 他学年 両モードで `selectedTeacherNames.length` を
  使い、`formTeacherNames.size` と `selectedTeacherIdxs.length` の 1-render
  ズレで NG ボタンだけが矛盾して disabled になる問題を解消。
- **mode 切替時の state クリア**: external → ng 切替時に時刻/メモを clear。
  ng モード中も裏で stale な値が残って戻ったとき silent に submit される
  事故を防ぐ。
- **OK解除の確認ダイアログ**: `handleApplyNg(false)` (OK解除) を実行する前に
  対象件数を表示した showConfirm を必須化。直近 NG したばかりの設定を
  silent に全消去する事故を防ぐ。
- **action 後の toast 通知**: 他学年セッション追加 / NG / OK解除 の各 action
  で件数付きの toast を表示し、『反応してない』勘違いによる再クリックを抑止。

P3 (設計 / 一貫性):
- **expandedDates の stale key cleanup**: dates 配列が変わる度に削除済み
  id を expandedDates から除く useEffect を追加。config/setList で id が
  再利用されて新しい date が silent に折りたたまれる事故を防ぐ。
- **teacher / period 同期の membership 比較**: size 比較だけだと rename swap
  で素通りする問題を解消。`Array#every` で内容も比較する。
- **preset select を controlled に**: 旧 `defaultValue` + 直接 DOM mutation
  を `value=""` + `onChange` に変更。条件 remount 時に古い選択が再出現する
  リスクを排除。
- **applyPreset の `!= null` を `if (truthy)` に**: 空文字 (`''`) は『未設定』
  扱いとして、preset 適用時に formStartTime/Memo が誤って空に上書きされる
  のを防ぐ。
- **quick グリッド `|| ''` を `?? ''`**: `0` を空表示に潰さず、明示的な
  『0 コマ』入力と未入力の区別を保つ。
- **PresetPanel `useState(blankDraft())` を lazy init に**: `useState(() => blankDraft())`
  に変更。毎レンダーの不要な実行を排除。
- **ROADMAP の stale 参照を更新**: 削除済み NgSettings.jsx → AbsenceNgPanel.jsx
  に書き換え。

Tests: 全体 1181 件、lint 0 / typecheck 0 / build OK。
(AbsenceNgPanel 自体への直接 UI テスト追加は ROADMAP の E3e に明記済み。)

### Changed (「他学年・午前」と「日時NG」タブを統合)
旧『📅 他学年・午前』タブと『🚫 日時NG』タブを 1 つの『📅 講師不在・NG』タブに
統合した。日付ヘッダを共有し、同じ日に対するセッション登録と NG 設定を
1 つのセクションで縦に並べて見られるようになった。

新タブ (`AbsenceNgPanel.jsx`) の構成 (上から下):
1. **プリセット管理** (折りたたみ): 旧 ExternalCounts と同等
2. **統合一括登録フォーム**: 上部のラジオで「📅 他学年セッション (時刻あり)」
   と「🚫 手動NG (時限指定)」を切替。共通フィールド (講師複数 / 期間 / メモ)
   はそのまま、モード固有の入力欄だけが切替わる。プリセットは他学年モードでのみ
   表示される。
3. **日付ごとの折りたたみセクション**: 各日付ヘッダの下に
   (a) その日の他学年セッション一覧、(b) NG マトリクス (講師×時限) を縦に
   並べて表示。日付ヘッダには「他学年 N 件」「NG N 件」のバッジを併記。
4. **クイック数値入力グリッド** (折りたたみ・最下部): 時刻無しの粗い
   コマ数管理用に旧 ExternalCounts のグリッドを移植。教科グループ見出し付き。

旧ファイル `ExternalCounts.jsx` / `NgSettings.jsx` は削除。ConfigModal の
タブ ID も `external` + `ng` → `absence-ng` に変更 (旧 ID は廃止)。reducer の
action は変えていない (`teacher/toggleNg` / `setNgBatch` / `addExternalSessions` /
`teacher/addExternalSessionPreset` 等はそのまま再利用)。

Tests: 全体 1181 件、lint 0 / typecheck 0 / build OK。

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
