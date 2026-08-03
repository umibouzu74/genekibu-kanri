// ─── 通常時間割作成の共有 UI クラス (Tailwind) ──────────────────────
// 講習ビルダー (timetable-builder) と同じ builder-* デザイントークンを
// 使った className 定数。regular-builder は tailwind.config.js の content
// に含まれており、ここで組み立てた文字列リテラルから JIT が生成する。
// (動的にクラス名を合成しないこと — JIT に拾われない)

const BTN_BASE =
  "px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";

export const UI = {
  // ボタン各種 (講習ビルダーの Toolbar / Header のボタンと同じ配色系)
  btn: `${BTN_BASE} bg-builder-surface border-builder-border text-builder-ink-muted hover:bg-builder-bg hover:text-builder-ink`,
  btnBlue: `${BTN_BASE} bg-builder-info-soft border-builder-info-border text-builder-blue hover:bg-builder-info-border`,
  btnDanger: `${BTN_BASE} bg-builder-danger-soft border-builder-danger-border text-builder-red hover:bg-builder-danger-border`,
  btnPrimary: `${BTN_BASE} bg-builder-primary border-builder-primary text-white hover:bg-builder-primary-hover`,

  // トグルボタン (押下状態あり)
  btnToggle: (on) =>
    on
      ? `${BTN_BASE} bg-builder-primary border-builder-primary text-white`
      : `${BTN_BASE} bg-builder-surface border-builder-border text-builder-ink-muted hover:bg-builder-bg hover:text-builder-ink`,

  // テキスト入力 / セレクト
  input:
    "px-2 py-1.5 rounded border border-builder-border bg-builder-surface text-sm text-builder-ink focus:outline-none",

  // カード状のセクション (設定パネルなど)
  panel:
    "bg-builder-surface border border-builder-border rounded-lg p-3.5 flex flex-col gap-2",
  panelHead: "font-extrabold text-[13px] text-builder-ink",
  hint: "text-[10px] text-builder-ink-subtle",
};
