# 現役部 授業管理システム

中学・高校の現役部（夜間授業部）の授業コマ割り・講師スケジュール・休講日・代行管理を一元化する Web アプリです。

React + Vite で実装されており、GitHub Pages で配信、データは各端末の `localStorage` に保存されます。

## 機能

- **ダッシュボード**: 今日・明日の授業一覧を部門別（中学部 / 高校部本校 / 高校部亀井町）にレイアウト
- **講師別ビュー**: 講師名クリックで週間 / 月間スケジュールを表示
- **全講師一覧**: 曜日別コマ数マトリクス
- **コースマスター管理**: 曜日・学年・講師・科目でフィルターしたコマ一覧、隔週コマの A 週 / B 週管理
- **休講日管理**: 部門単位で休講指定が可能
- **代行管理**: アルバイト代行者の依頼・確定、月次集計
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

## 技術スタック

- React 18 + Vite 6
- GitHub Pages / GitHub Actions
- localStorage（データ永続化）

## ディレクトリ構成

```
genyakubu-manager/
├── src/
│   ├── App.jsx       # アプリ本体
│   ├── data.js       # 初期データ・定数・ユーティリティ
│   └── main.jsx
├── index.html
├── vite.config.js
└── package.json
```

## ライセンス

[MIT License](./LICENSE)
