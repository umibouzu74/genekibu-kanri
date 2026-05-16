# CLAUDE.md — jikanwarikun (時間割作成くん)

## Project Overview

A Japanese school timetable/schedule creator web application. Designed for winter break class scheduling, it manages teacher assignments across dates, time periods, and classes with constraint-based automatic schedule generation.

**Live deployment**: GitHub Pages at `/jikanwarikun/`

## Tech Stack

- **Framework**: React 19 (JSX, no TypeScript)
- **Build tool**: Vite 7
- **Styling**: Tailwind CSS 3 + PostCSS + Autoprefixer
- **Excel export**: xlsx library
- **Linting**: ESLint 9 with react-hooks and react-refresh plugins
- **Deployment**: GitHub Actions → GitHub Pages

## Quick Reference Commands

```bash
npm run dev       # Start development server (Vite HMR)
npm run build     # Production build → dist/
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

## Project Structure

```
jikanwarikun/
├── src/
│   ├── App.jsx          # Entire application (~870 lines, monolithic component)
│   ├── main.jsx         # Entry point — renders <App /> into #root
│   ├── index.css        # Tailwind directives (@tailwind base/components/utilities)
│   ├── App.css          # Minimal legacy CSS
│   └── assets/          # Static assets
├── public/              # Public static files
├── index.html           # HTML shell
├── vite.config.js       # Vite config (base: '/jikanwarikun/')
├── tailwind.config.js   # Tailwind content paths
├── postcss.config.js    # PostCSS plugins
├── eslint.config.js     # ESLint flat config
├── .github/workflows/
│   └── deploy.yml       # CI: build + deploy to GitHub Pages on push to main
└── package.json
```

## Architecture & Key Concepts

### Single-Component Architecture

The entire app lives in `src/App.jsx` as one exported function `ScheduleApp`. All state, logic, and UI are co-located. There is no routing, no external state management, and no component decomposition.

### Data Model

**Project** (top-level state):
```
{
  teachers: Teacher[],
  activeTabId: number,
  tabs: Tab[],
  externalCounts: { [key]: number }
}
```

**Teacher**:
```
{
  name: string,
  subjects: string[],        // e.g. ["英語", "数学"]
  ngSlots: string[],         // Unavailable time slots
  ngClasses: string[],       // Classes to avoid
  priorityClasses: string[]  // Preferred classes
}
```

**Tab** (one per grade level):
```
{
  id: number,
  name: string,
  config: { dates, periods, classes, subjectCounts },
  schedule: { [key]: { subject, teacher, locked } }
}
```

**Schedule key format**: `"日付-時限-クラス"` (e.g. `"12/25(木)-1限 (13:00~)-３S"`)

### State Management

- All state via React `useState` hooks
- Expensive computations via `useMemo` (conflict detection, subject counting)
- Undo/redo via history array (max 50 snapshots)
- State mutations always use immutable patterns: `{ ...project, field: newValue }`

### Persistence

- **localStorage** with two keys:
  - `winter_schedule_project_v45` — full project state
  - `winter_schedule_user_defaults` — saved default configuration
- Auto-saves on every project state change via `useEffect`
- Manual JSON import/export for backup

### Schedule Generation Algorithm

The `generateSchedule()` function uses a **backtracking constraint solver** that:
1. Identifies unfilled, unlocked slots
2. Tries valid subject+teacher combinations respecting constraints
3. Constraints: subject quotas, teacher availability, NG slots/classes, no double-booking
4. Caps iterations at 500,000 to prevent browser freeze
5. Returns up to 1 solution

### Key Subjects

The app works with 5 subjects: 英語 (English), 数学 (Math), 国語 (Japanese), 理科 (Science), 社会 (Social Studies).

## Development Conventions

### Language & Code Style

- **JavaScript with JSX** — not TypeScript. Do not introduce TypeScript files.
- **UI text is in Japanese** — all labels, buttons, alerts, and messages use Japanese. Maintain this convention for any new UI strings.
- **Tailwind utility classes** for all styling — avoid adding custom CSS to App.css.
- **ESLint rule**: Unused variables starting with uppercase or `_` are allowed (`varsIgnorePattern: '^[A-Z_]'`).
- Inline styles only when Tailwind classes are insufficient.

### Patterns to Follow

- State updates must use immutable patterns (spread operator)
- Call `pushHistory(newProject)` before any state change that should be undoable
- Schedule entry keys use the format `"${date}-${period}-${class}"`
- Color assignment for subjects uses hash-based mapping via `getSubjectColor()`
- Use `toCircleNum()` for converting numbers to circled number characters

### Things to Avoid

- Do not split App.jsx into separate component files unless explicitly requested — the monolithic structure is intentional
- Do not add a router — this is a single-view application with modal dialogs
- Do not add external state management (Redux, Zustand, etc.)
- Do not change the localStorage key version number without updating `STORAGE_KEY_PROJECT`
- Do not add TypeScript

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- Triggers on push to `main` branch
- Node.js 20, npm install, `npm run build`
- Deploys `dist/` to GitHub Pages

**Important**: `vite.config.js` sets `base: '/jikanwarikun/'` for correct GitHub Pages asset paths.

## Testing

No test framework is currently configured. There are no test files. When adding tests, Vitest would be the natural choice given the Vite build setup.

## Common Tasks

### Adding a new teacher
Add to the `DEFAULT_INITIAL_TEACHERS` array in `App.jsx` with `{ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] }`.

### Adding a new subject
1. Add to relevant teachers' `subjects` arrays
2. Add to `DEFAULT_TAB_CONFIG_BASE.subjectCounts` with the required count
3. The color will be auto-assigned via `getSubjectColor()`

### Modifying the schedule grid
Dates, periods, and classes are configurable per-tab via `config` object. Default values are in `DEFAULT_TAB_CONFIG_BASE`.

### Changing localStorage version
Update the `STORAGE_KEY_PROJECT` constant. This forces a fresh start for users (old data won't load automatically).

## 現在の改修プロジェクト

このリポジトリは現在、大規模な改修を進行中です。
詳細な計画・設計・課題は handoff.md を参照してください。

### 改修の概要
- App.jsx 単一ファイル（約870行）→ コンポーネント分割
- データ構造の改善（スケジュールキーのインデックスベース化）
- UI/UX改善（alert/prompt廃止、科目カラー固定化、設定画面改善）
- 自動生成ロジックの強化（複数案生成、部分解対応）
- 汎用化（冬期講習固有の文言排除、テンプレート機能）

### コーディング規約
- 日本語コメント可
- コンポーネントは関数コンポーネント + Hooks
- スタイリングは Tailwind ユーティリティクラスのみ
- 状態管理は React Context + useReducer を使用予定
- UIライブラリは導入しない（Tailwind で完結）

### 作業の進め方
- handoff.md の Step 順に進める
- Step 1（基盤整備）と Step 2（UI/UX改善）を同時進行
- 各 Step は PR 単位で区切る
