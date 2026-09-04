## 変更の概要

<!-- 何を、なぜ変えたか。ユーザに見える変化があれば画面名で -->

## 確認したこと

- [ ] `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` が通る
- [ ] 画面や印刷に触れる変更なら `npm run test:e2e` も通る
- [ ] `CHANGELOG.md` の `[Unreleased]` に追記した
- [ ] `CLAUDE.md` の決めごと (削除 UX・講師の区切り・隔週 A/B・印刷 2 系統・
      同期の空マーカー・孤立データ) に反していない
- [ ] 同期するキーを増やした場合は `database.rules.json` にも足した
