# 現役部 授業管理システム

中学・高校の現役部（夜間授業部）の授業コマ割り・講師スケジュール・休講日・授業調整（代行／振替／移動／合同授業）を一元化する Web アプリです。

React + Vite で実装されており、GitHub Pages で配信します。データは各端末の
`localStorage` に保存され、Firebase Realtime Database を設定すると端末間で
同期されます (下の「Firebase 同期」)。

## 機能

- **ダッシュボード**: 今日・明日の授業一覧を部門別（中学部 / 高校部本校 / 高校部亀井町）にレイアウト
- **講師別ビュー**: 講師名クリックで週間 / 月間スケジュールを表示
- **全講師一覧**: 曜日別コマ数マトリクス
- **コースマスター管理**: 曜日・学年・講師・科目でフィルターしたコマ一覧、隔週コマの A 週 / B 週管理
- **休講日管理**: 部門単位で休講指定が可能
- **欠勤組み換え**: 欠勤コマに対して代行・合同授業・移動・振替をまとめて登録
- **授業管理**: 代行・振替・移動・合同授業の依頼／確定、月次集計
- **印刷対応**: 各ビューをそのまま印刷
- **データエクスポート / インポート**: JSON でバックアップ・復元

## セットアップ

```bash
cd genyakubu-manager
npm install
npm run dev
```

## ビルド

```bash
cd genyakubu-manager
npm run build
```

## デプロイ

`main` ブランチへの push で GitHub Actions が自動的に GitHub Pages にデプロイします
（`.github/workflows/deploy.yml`）。

## Firebase 同期 (任意)

`genyakubu-manager/.env.local` に `VITE_FIREBASE_*` を入れると、データを
Firebase Realtime Database の `appData/*` に同期します (未設定なら
localStorage だけで動きます)。手順は `genyakubu-manager/.env.example` の
コメントを参照してください。要点:

- **閲覧は匿名サインイン、書込は管理者だけ**。管理者は Email/Password で
  ログインしたうえで、RTDB の `/admins/<uid>: true` に登録されている
  必要があります (`genyakubu-manager/database.rules.json`)
- Authentication の Email/Password で**「ユーザーがアカウントを作成できる
  ようにする」を OFF** にしてください (公開ビルドに API キーが埋まるため)
- ルールを変えたら `npx firebase-tools deploy --only database` で反映
  (自動デプロイはしていません)。**`/admins` に uid を登録してから**
  ルールをデプロイしないと管理者も書けなくなります
- GitHub Pages への配信は CI (lint / typecheck / test / build) が通った
  後にだけ走ります (`.github/workflows/deploy.yml`)

## 技術スタック

- React 18 + Vite 6
- GitHub Pages / GitHub Actions
- localStorage（データ永続化）

## ディレクトリ構成

```
genyakubu-manager/
├── src/
│   ├── App.jsx                # 本体 (ビュー切替・永続 state・印刷)
│   ├── main.jsx               # ルート (ErrorBoundary / Toast / Confirm)
│   ├── components/            # 画面部品 (views/ に各ビュー)
│   ├── hooks/                 # useSyncedStorage (localStorage + RTDB) / CRUD
│   ├── utils/                 # 回数計算・隔週・孤立データ・スキーマ検証など
│   ├── constants/             # 曜日・学年・localStorage キー・サイドバー定義
│   ├── firebase/              # Firebase 初期化 (env 未設定ならローカルのみ)
│   ├── regular-builder/       # 通常時間割作成 (曜日 × 時限のグリッド設計)
│   ├── timetable-builder/     # 講習時間割作成 (日付ベース・自動生成)
│   └── data.js                # 初期データ (サンプル) と旧バレル
├── e2e/                       # Playwright (印刷・Worker 経路のスモーク)
├── database.rules.json        # RTDB のルール (手動デプロイ)
├── .env.example               # Firebase 設定の手順
└── vite.config.js
```

## ライセンス

[MIT License](./LICENSE)
