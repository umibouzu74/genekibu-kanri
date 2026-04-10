# 現役部 授業管理システム

中学・高校の現役部の授業コマ割りを一元管理するWebアプリ。

## 機能

- **ダッシュボード**: 今日・明日の授業一覧を自動表示
- **講師別ビュー**: 講師名をクリックで週間/月間スケジュール表示
- **全講師一覧**: 曜日別コマ数マトリクス
- **コマの追加・編集・削除**: UIから直接操作
- **祝日・休講日管理**: カレンダーに反映
- **印刷対応**: 各ビューをそのまま印刷可能
- **データ永続化**: localStorage で端末にデータ保存

## セットアップ

```bash
npm install
npm run dev
```

## デプロイ

`main` ブランチに push すると GitHub Actions で自動デプロイ。

Settings → Pages → Source を「GitHub Actions」に変更してください。

## 技術スタック

- React 18 + Vite
- GitHub Pages
- localStorage（データ保存）
