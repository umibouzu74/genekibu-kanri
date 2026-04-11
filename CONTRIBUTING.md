# Contributing

このリポジトリへの変更は以下の手順でお願いします。

## 開発環境

```bash
cd genyakubu-manager
npm install
npm run dev
```

ブラウザで <http://localhost:5173/genekibu-kanri/> を開きます。

## チェック

変更を提出する前に、以下を全て通してください。

```bash
cd genyakubu-manager
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # 本番ビルド
```

これらは CI (`.github/workflows/ci.yml`) でも実行されます。

## コード整形

コード整形は Prettier で統一しています。

```bash
npm run format
```

## コミットメッセージ

- 英語でも日本語でも構いません
- 1 行目は 70 文字以内で、変更の種類 (feat / fix / refactor / chore / docs /
  test / perf / a11y / style) を prefix に付けてください
- 本文がある場合は 1 行目との間に空行を入れ、1 行 72 文字程度で折り返して
  ください

## ブランチ戦略

- `main` は常にデプロイ可能な状態を維持します
- 機能追加・修正は Feature ブランチで作業し、PR を経て main にマージします
- `main` への push で GitHub Actions が GitHub Pages へ自動デプロイします

## コードレビューの観点

- インラインスタイルは `src/styles/common.js` / `src/styles/tokens.js` の
  既存ヘルパー/トークンを優先して使用
- localStorage を読み書きする新しい state は `useLocalStorage` フックを
  経由させ、直接 `localStorage.setItem` を呼び出さない
- 破壊的操作 (削除・初期化・インポート) は `useConfirm` のモーダル確認を
  通し、通知は `useToasts` を使用
- 絵文字アイコンを付ける場合は必ず `aria-label` を併記
